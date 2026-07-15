(function() {
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts['i18n-runtime']) return;

  const sourceIndex = new Map();

  function rebuildSourceIndex() {
    sourceIndex.clear();
    const messages = window.CoronaLocales?.zh?.messages || {};
    Object.entries(messages).forEach(([key, value]) => {
      if (typeof value === 'string' && value) sourceIndex.set(value, key);
    });
  }

  function translateExact(input, language) {
    const text = String(input ?? '');
    if (!sourceIndex.size) rebuildSourceIndex();
    const key = sourceIndex.get(text);
    if (!key) return text;
    return window.CoronaLocales?.[language]?.messages?.[key] || text;
  }

  function translateDynamicEn(input) {
    let text = String(input || '');
    const exact = translateExact(text, 'en');
    if (exact !== text) return exact;
    const replacements = [
      [/^已保存$/, 'Saved'],
      [/^已应用$/, 'Applied'],
      [/^已启用$/, 'Enabled'],
      [/^已禁用$/, 'Disabled'],
      [/^未检测到(.+)$/, 'No $1 detected'],
      [/^检测到:\s*(.+)$/, 'Detected: $1'],
      [/^当前版本：(.+)$/, 'Current Version: $1'],
      [/^当前迭代：(.+)$/, 'Current Build: $1'],
      [/^配置已保存（禁用状态）$/, 'Configuration saved (disabled)'],
      [/^(.+) 配置已保存$/, '$1 configuration saved'],
      [/^(.+) 配置已应用$/, '$1 configuration applied'],
      [/^(.+) 已关闭$/, '$1 disabled'],
      [/^(.+) 已启用$/, '$1 enabled'],
      [/^路径已保存，点应用生效$/, 'Path saved; tap Apply to activate it'],
      [/^请先设置重压缩 (\d+)$/, 'Configure recompression $1 first'],
      [/^处理中\.\.\.$/, 'Processing...'],
      [/^加载中\.\.\.$/, 'Loading...'],
      [/^准备中\.\.\.$/, 'Preparing...'],
      [/^失败[:：]?\s*(.*)$/, 'Failed: $1'],
      [/^保存失败[:：]?\s*(.*)$/, 'Save failed: $1'],
      [/^应用失败[:：]?\s*(.*)$/, 'Apply failed: $1']
      ,[/^(\d+) 个应用$/, '$1 apps']
      ,[/^已配置 (\d+) 个应用，应用预设自动切换已开启$/, '$1 apps configured; automatic profile switching is enabled']
      ,[/^已配置 (\d+) 个应用$/, '$1 apps configured']
      ,[/^应用预设自动切换已(开启|关闭)$/, (_, state) => `Automatic app profile switching ${state === '开启' ? 'enabled' : 'disabled'}`]
      ,[/^切换通知已(开启|关闭)$/, (_, state) => `Switch notifications ${state === '开启' ? 'enabled' : 'disabled'}`]
      ,[/^即将(加入|移出) (.+) 到(.+)。$/, (_, action, pkg, list) => `${action === '加入' ? 'Add' : 'Remove'} ${pkg} ${action === '加入' ? 'to' : 'from'} ${translateDynamicEn(list)}.`]
      ,[/^(.+) 已(加入|移出)(.+)$/, (_, pkg, action, list) => `${pkg} ${action === '加入' ? 'added to' : 'removed from'} ${translateDynamicEn(list)}`]
      ,[/^即将为 (.+) 保存当前应用预设。$/, 'The current app profile will be saved for $1.']
      ,[/^即将为 (.+) 套用参数快照预设。$/, 'A parameter snapshot profile will be applied to $1.']
      ,[/^即将清除 (.+) 的应用预设。$/, 'The app profile for $1 will be cleared.']
      ,[/^即将执行(.+)。$/, 'About to run $1.']
      ,[/^执行 (.+)$/, 'Run $1']
      ,[/^(.+)完成，释放了 (.+)$/, '$1 complete; freed $2']
      ,[/^(.+) 完成$/, '$1 complete']
      ,[/^(\d+)\/(\d+) 已启用$/, '$1/$2 enabled']
      ,[/^即将(启用|禁用) (.+)。$/, (_, state, item) => `${state === '启用' ? 'Enable' : 'Disable'} ${item}.`]
      ,[/^(.+) 已启用$/, '$1 enabled']
      ,[/^(.+) 已禁用$/, '$1 disabled']
      ,[/^即将保存 (.+) 的优先级规则。$/, 'Save the priority rule for $1.']
      ,[/^即将保存 (.+)。$/, 'Save $1.']
      ,[/^(\d+)\/(\d+) 个$/, '$1/$2 items']
      ,[/^即将更新脚本 (.+)。$/, 'Update script $1.']
      ,[/^即将添加脚本 (.+)。$/, 'Add script $1.']
      ,[/^生成 scripts\.d\/(.+)\.sh 并赋予可执行权限$/, 'Create scripts.d/$1.sh and make it executable']
      ,[/^移除 scripts\.d\/(.+)\.sh$/, 'Remove scripts.d/$1.sh']
      ,[/^删除 app_profiles\/(.+)\/ 下的独立预设文件$/, 'Delete app-specific profile files under app_profiles/$1/']
      ,[/^即将(启用|禁用)脚本 (.+)。$/, (_, state, name) => `${state === '启用' ? 'Enable' : 'Disable'} script ${name}.`]
      ,[/^确定要删除脚本 "(.+)" 吗？$/, 'Delete script "$1"?']
      ,[/^当前迭代：#(.+)$/, 'Current Build: #$1']
      ,[/^全量构建 #(.+)$/, 'Full Build #$1']
      ,[/^即将应用 (.+)。$/, 'Apply $1.']
      ,[/^I\/O 调度器写入未生效（当前: (.+)）$/, 'I/O scheduler write did not take effect (current: $1)']
      ,[/^I\/O 调度器: (.+)$/, 'I/O Scheduler: $1']
      ,[/^预读取大小: (.+) KB$/, 'Read-ahead Size: $1 KB']
      ,[/^iostats: (开启|关闭)$/, (_, state) => `iostats: ${state === '开启' ? 'On' : 'Off'}`]
      ,[/^(\d+) 页$/, '$1 pages']
      ,[/^算法 (.+)≠(.+)$/, 'Algorithm $1≠$2']
      ,[/^大小 (.+)G≠(.+)G$/, 'Size $1G≠$2G']
      ,[/^回写后端仍为 (.+)$/, 'Writeback backend is still $1']
      ,[/^重压缩(\d+) 未见 (.+)$/, 'Recompression $1 does not report $2']
      ,[/^ZRAM 部分未生效: (.+)$/, 'Some ZRAM settings did not take effect: $1']
      ,[/^(.+) 不受支持，已回退 (.+)$/, '$1 is unsupported; fell back to $2']
      ,[/^CPU 调频器写入未生效（当前: (.+)）$/, 'CPU governor write did not take effect (current: $1)']
      ,[/^CPU 调频器: (.+)$/, 'CPU Governor: $1']
      ,[/^TCP 拥塞算法: (.+)$/, 'TCP Congestion Algorithm: $1']
      ,[/^即将(启用|禁用) CPU(\d+)。$/, (_, state, cpu) => `${state === '启用' ? 'Enable' : 'Disable'} CPU${cpu}.`]
      ,[/^CPU(\d+) 配置已保存（禁用状态）$/, 'CPU$1 configuration saved (disabled)']
      ,[/^CPU(\d+) 已(启用|禁用)$/, (_, cpu, state) => `CPU${cpu} ${state === '启用' ? 'enabled' : 'disabled'}`]
      ,[/^打开 (.+) 的主页$/, 'Open the $1 profile']
      ,[/^检测到: (.+)$/, 'Detected: $1']
      ,[/^已选择并保存: (.+)（点应用生效）$/, 'Selected and saved: $1 (tap Apply to activate)']
      ,[/^Swap 创建失败：剩余空间不足（需 (.+)MB，剩 (.+)MB）$/, 'Swap creation failed: insufficient space (requires $1 MB, $2 MB available)']
      ,[/^mkswap 失败：(.+)$/, 'mkswap failed: $1']
      ,[/^swapon 失败：(.+)$/, 'swapon failed: $1']
      ,[/^Swap 已启用 \((.+) MB\)$/, 'Swap enabled ($1 MB)']
      ,[/^已启用 x(\d+)$/, 'Enabled x$1']
      ,[/^(\d+)项可用$/, '$1 features available']
      ,[/^(\d+)项已启用$/, '$1 features enabled']
      ,[/^即将(启用|禁用) (.+)。$/, (_, state, name) => `${state === '启用' ? 'Enable' : 'Disable'} ${name}.`]
      ,[/^尝试对当前同名进程执行 renice=(.+) 与 ionice=(.+)$/, 'Attempt renice=$1 and ionice=$2 on currently running processes with the same name']
      ,[/^已设置 (.+): nice=(.+), I\/O=(.+)$/, 'Set $1: nice=$2, I/O=$3']
      ,[/^即将删除 (.+) 的优先级规则。$/, 'Delete the priority rule for $1.']
      ,[/^已删除 (.+) 的优先级规则$/, 'Deleted the priority rule for $1']
      ,[/^已删除标签 (.+)$/, 'Deleted label $1']
      ,[/^已更新标签 (.+)$/, 'Updated label $1']
      ,[/^已保存标签 (.+)$/, 'Saved label $1']
      ,[/^(.+) · 线程规则$/, '$1 · Thread Rules']
      ,[/^对命中线程设置亲和性 (.+)$/, 'Set affinity $1 for matching threads']
      ,[/^将命中线程迁入 cpuset (.+)$/, 'Move matching threads into cpuset $1']
      ,[/^设置 uclamp\.min=(.+)$/, 'Set uclamp.min=$1']
      ,[/^设置 uclamp\.max=(.+)$/, 'Set uclamp.max=$1']
      ,[/^设置调度策略 (.+) \(rt=(.+)\)$/, 'Set scheduling policy $1 (rt=$2)']
      ,[/^即将为 (.+) 保存线程规则 (.+)。$/, 'Save thread rule $2 for $1.']
      ,[/^即将删除线程规则 (.+)。$/, 'Delete thread rule $1.']
      ,[/^请先设置重压缩 (\d+)$/, 'Configure recompression $1 first']
      ,[/^当前色调 (\d+)°$/, 'Current Hue $1°']
      ,[/^色调 (\d+)°$/, 'Hue $1°']
      ,[/^色调 (\d+)° · 主页与配置同步$/, 'Hue $1° · Synced across Home and Settings']
      ,[/^色调 (\d+)° · 全局同步$/, 'Hue $1° · Synced Globally']
      ,[/^打开 (.+) 的主页$/, "Open $1's profile"]
      ,[/^共 (\d+) 个快照；当前仅恢复配置状态，不会自动全量立即应用。$/, '$1 snapshots; restoration changes configuration state only and does not immediately apply everything.']
      ,[/^快照 (\d+)$/, 'Snapshot $1']
      ,[/^即将保存参数快照 (.+)。$/, 'Save parameter snapshot $1.']
      ,[/^即将恢复参数快照 (.+)。$/, 'Restore parameter snapshot $1.']
      ,[/^确定要删除快照 "(.+)" 吗？$/, 'Delete snapshot "$1"?']
      ,[/^(.+) 写入未生效（当前: (.+)）$/, '$1 write did not take effect (current: $2)']
      ,[/^将写入配置$/, 'Configuration Files']
      ,[/^将立即写入$/, 'Immediate Writes']
      ,[/^还会执行$/, 'Additional Actions']
      ,[/^说明$/, 'Notes']
    ];
    for (const [pattern, replacement] of replacements) {
      if (pattern.test(text)) return typeof replacement === 'function' ? text.replace(pattern, replacement) : text.replace(pattern, replacement);
    }
    return text;
  }

  window.CoronaI18n = {
    rebuild: rebuildSourceIndex,
    translate(input, language = 'zh') {
      const text = String(input ?? '');
      if (language !== 'en') return translateExact(text, 'zh');
      return translateDynamicEn(text);
    }
  };
  window.CoronaFeatureScripts['i18n-runtime'] = true;
})();
