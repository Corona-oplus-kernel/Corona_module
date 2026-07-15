(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["memory-opt"]) return;

  CoronaAddon.prototype.initSystemOpt = function () {
    const switches = ['lmk', 'device-config', 'reclaim', 'kswapd', 'protect', 'fstrim'];
    switches.forEach((name) => {
      const sw = document.getElementById(`${name}-switch`);
      if (sw && !sw.dataset.bound) {
        sw.dataset.bound = '1';
        sw.addEventListener('change', () => this.saveAndApplySystemOpt(name));
      }
    });
    this.loadSystemOptConfig();
  };

  CoronaAddon.prototype.loadSystemOptConfig = async function () {
    const configs = {
      lmk: { file: 'lmk.conf', switch: 'lmk-switch' },
      device: { file: 'device.conf', switch: 'device-config-switch' },
      reclaim: { file: 'reclaim.conf', switch: 'reclaim-switch' },
      kswapd: { file: 'kswapd.conf', switch: 'kswapd-switch' },
      protect: { file: 'protect.conf', switch: 'protect-switch' },
      fstrim: { file: 'fstrim.conf', switch: 'fstrim-switch' }
    };
    let enabledCount = 0;
    for (const [, cfg] of Object.entries(configs)) {
      const content = await this.readConfig(cfg.file);
      const sw = document.getElementById(cfg.switch);
      if (sw) {
        const enabled = content.includes('enabled=1');
        sw.checked = enabled;
        if (enabled) enabledCount++;
      }
    }
    const badge = document.getElementById('system-opt-badge');
    if (badge) badge.textContent = enabledCount > 0 ? `${enabledCount}项已启用` : '未配置';
  };

  CoronaAddon.prototype.saveAndApplySystemOpt = async function (name, skipPreview = false) {
    const switchMap = {
      'lmk': 'lmk-switch',
      'device-config': 'device-config-switch',
      'reclaim': 'reclaim-switch',
      'kswapd': 'kswapd-switch',
      'protect': 'protect-switch',
      'fstrim': 'fstrim-switch'
    };
    const fileMap = {
      'lmk': 'lmk.conf',
      'device-config': 'device.conf',
      'reclaim': 'reclaim.conf',
      'kswapd': 'kswapd.conf',
      'protect': 'protect.conf',
      'fstrim': 'fstrim.conf'
    };
    const summaryMap = {
      'lmk': 'LMK 优化',
      'device-config': '解锁后台限制',
      'reclaim': '禁用激进回收',
      'kswapd': 'kswapd 优化',
      'protect': '关键进程保护',
      'fstrim': '开机 fstrim'
    };
    const actionMap = {
      'lmk': ['更新 sys.lmk.minfree_levels'],
      'device-config': ['写入 activity_manager device_config', '关闭 phantom 进程限制'],
      'reclaim': ['关闭 DAMON/process_reclaim', '必要时关闭 THP 与 osensemanager 特性'],
      'kswapd': ['将 kswapd 放入前台 cpuset 与 cpuctl'],
      'protect': ['将关键进程迁入 active_fg memcg'],
      'fstrim': ['执行 sm fstrim']
    };
    const sw = document.getElementById(switchMap[name]);
    if (!sw) return false;
    const enabled = sw.checked ? '1' : '0';
    const config = await this.buildMergedConfigContent(fileMap[name], { enabled }, ['enabled']);
    if (!skipPreview) {
      const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将${sw.checked ? '启用' : '禁用'} ${summaryMap[name] || name}。`,
        configs: [{ filename: fileMap[name], content: config }],
        actions: sw.checked ? (actionMap[name] || ['立即应用系统优化']) : [],
        notes: sw.checked ? [] : ['关闭后仅更新配置文件。']
      }, {
        onCancel: () => this.loadSystemOptConfig()
      });
      if (!confirmed) return false;
    }
    await this.mergeConfigFile(fileMap[name], { enabled }, ['enabled']);
    if (sw.checked) {
      this.showLoading(true);
      await this.applySystemOptNow(name);
      this.showLoading(false);
    }
    this.loadSystemOptConfig();
    this.showToast(sw.checked ? '已启用并应用' : '已禁用');
    return true;
  };

  CoronaAddon.prototype.applySystemOptNow = async function (name) {
    const memInfo = await this.exec('cat /proc/meminfo | grep MemTotal');
    const memKb = parseInt(memInfo.replace(/[^0-9]/g, '')) || 8000000;
    const sdkVersion = parseInt(await this.exec('getprop ro.build.version.sdk')) || 30;
    const isOplus = (await this.exec('find /proc -maxdepth 1 -name "oplus*" 2>/dev/null | head -1')).trim() !== '';
    if (name === 'lmk') {
      if (sdkVersion > 28) {
        let levels = '4096:0,5120:100,8192:200,32768:250,65536:900,96000:950';
        if (memKb > 8388608) levels = '4096:0,5120:100,32768:200,96000:250,131072:900,204800:950';
        else if (memKb > 6291456) levels = '4096:0,5120:100,8192:200,32768:250,96000:900,131072:950';
        await this.exec(`resetprop sys.lmk.minfree_levels "${levels}"`);
      }
    } else if (name === 'device-config') {
      await this.exec('device_config set_sync_disabled_for_tests until_reboot');
      await this.exec('device_config put activity_manager max_cached_processes 32768');
      await this.exec('device_config put activity_manager max_phantom_processes 32768');
      await this.exec('device_config put activity_manager use_compaction false');
      await this.exec('settings put global settings_enable_monitor_phantom_procs false');
    } else if (name === 'reclaim') {
      await this.exec('echo off > /sys/kernel/mm/damon/admin/kdamonds/0/state 2>/dev/null');
      await this.exec('echo 0 > /sys/module/process_reclaim/parameters/enable_process_reclaim 2>/dev/null');
      if (isOplus) {
        await this.exec('echo never > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null');
        await this.exec('dumpsys osensemanager proc debug feature 0 2>/dev/null');
      }
    } else if (name === 'kswapd') {
      const kswapd = await this.exec('pgrep kswapd');
      if (kswapd) {
        await this.exec(`echo ${kswapd.trim()} > /dev/cpuset/foreground/cgroup.procs 2>/dev/null`);
        await this.exec('mkdir -p /dev/cpuctl/kswapd');
        await this.exec(`echo ${kswapd.trim()} > /dev/cpuctl/kswapd/cgroup.procs 2>/dev/null`);
        await this.exec('echo 1 > /dev/cpuctl/kswapd/cpu.uclamp.latency_sensitive 2>/dev/null');
      }
    } else if (name === 'protect') {
      if (memKb > 8388608) {
        await this.exec('mkdir -p /dev/memcg/system/active_fg');
        await this.exec('echo 0 > /dev/memcg/system/active_fg/memory.swappiness 2>/dev/null');
        const apps = ['com.android.systemui', 'com.android.launcher', 'surfaceflinger', 'system_server'];
        for (const app of apps) {
          const pid = await this.exec(`pidof ${app} 2>/dev/null | head -n1`);
          if (pid.trim()) await this.exec(`echo ${pid.trim()} > /dev/memcg/system/active_fg/cgroup.procs 2>/dev/null`);
        }
      }
    } else if (name === 'fstrim') {
      await this.exec('sm fstrim 2>/dev/null');
    }
  };
  window.CoronaFeatureScripts["memory-opt"] = true;
})();
