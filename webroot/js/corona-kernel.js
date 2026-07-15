(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["corona-kernel"]) return;
  Object.assign(CoronaAddon.prototype, {
    initCoronaKernel() {
        this.coronaKernelMods = [
            'wake_aware',
            'suspend_swappiness_zero', 'suspend_dirty_freeze', 'suspend_compact_freeze',
            'suspend_net_quiesce', 'suspend_softlockup_disable', 'suspend_timerslack',
            'suspend_sched_slack', 'suspend_pm_tunables', 'suspend_rcu_normalize',
            'resume_freq_burst',
            'swappiness_pressure_throttle',
            'idle_writeback', 'idle_vmstat'
        ];
        this.coronaKernelGated = [
            'suspend_swappiness_zero', 'suspend_dirty_freeze', 'suspend_compact_freeze',
            'suspend_net_quiesce', 'suspend_softlockup_disable', 'suspend_sched_slack',
            'resume_freq_burst',
            'swappiness_pressure_throttle'
        ];
        document.querySelectorAll('.ck-switch').forEach(sw => {
            sw.addEventListener('change', () => this.toggleCoronaKernelModule(sw.dataset.mod, sw.checked));
        });
        const ws = document.getElementById('ck-user-window-slider');
        const wv = document.getElementById('ck-user-window-value');
        if (ws && wv) {
            ws.addEventListener('input', (e) => { wv.textContent = `${(parseInt(e.target.value) / 1000).toFixed(0)} s`; });
            ws.addEventListener('change', (e) => this.saveCoronaKernelTunable('user_window_ms', parseInt(e.target.value)));
        }
        const ss = document.getElementById('ck-slack-off-slider');
        const sv = document.getElementById('ck-slack-off-value');
        if (ss && sv) {
            ss.addEventListener('input', (e) => { sv.textContent = `${e.target.value} ms`; });
            ss.addEventListener('change', (e) => this.saveCoronaKernelTunable('slack_off_ms', parseInt(e.target.value)));
        }
        this.loadCoronaKernelConfig();
    },
    async loadCoronaKernelConfig() {
        if (!this.isCoronaKernel) {
            const card = document.getElementById('corona-kernel-card');
            if (card) card.style.display = 'none';
            this.refreshCardVisibilityAvailability();
            return;
        }
        if (!this.coronaKernelPresent) {
            const probe = await this.exec(
                `for m in ${this.coronaKernelMods.join(' ')}; do ` +
                `d=/sys/module/$m/parameters; ` +
                `if [ -d "$d" ]; then echo "$m:1:$(cat "$d/enabled" 2>/dev/null)"; ` +
                `else echo "$m:0:"; fi; done`
            );
            this.coronaKernelPresent = {};
            this.coronaKernelLive = {};
            probe.split('\n').forEach(line => {
                const parts = line.split(':');
                if (parts.length < 2 || !parts[0]) return;
                this.coronaKernelPresent[parts[0]] = parts[1] === '1';
                this.coronaKernelLive[parts[0]] = (parts[2] || '').trim();
            });
        }
        const conf = await this.readConfig('corona_kernel.conf');
        const parsed = {};
        conf.split('\n').forEach(line => {
            const m = line.match(/^([^=]+)=(.*)$/);
            if (m) parsed[m[1].trim()] = m[2].trim();
        });
        let enabledCount = 0;
        let presentCount = 0;
        for (const mod of this.coronaKernelMods) {
            const sw = document.querySelector(`.ck-switch[data-mod="${mod}"]`);
            const row = document.querySelector(`.switch-container[data-ck-mod="${mod}"]`);
            if (!this.coronaKernelPresent[mod]) {
                if (row) row.style.display = 'none';
                continue;
            }
            presentCount++;
            const live = this.coronaKernelLive[mod] || '';
            const cfg = parsed[`${mod}_enabled`];
            const on = cfg !== undefined ? (cfg === '1' || cfg === 'Y' || cfg === 'y')
                                         : (live === '1' || live === 'Y' || live === 'y');
            if (sw) sw.checked = on;
            if (on) enabledCount++;
        }
        const uw = parsed['user_window_ms'];
        if (uw !== undefined) {
            const v = Math.max(0, Math.min(300000, parseInt(uw) || 0));
            const ws = document.getElementById('ck-user-window-slider');
            const wv = document.getElementById('ck-user-window-value');
            if (ws) ws.value = v;
            if (wv) wv.textContent = `${(v / 1000).toFixed(0)} s`;
        }
        const so = parsed['slack_off_ms'];
        if (so !== undefined) {
            const v = Math.max(10, Math.min(500, parseInt(so) || 100));
            const ss = document.getElementById('ck-slack-off-slider');
            const sv = document.getElementById('ck-slack-off-value');
            if (ss) ss.value = v;
            if (sv) sv.textContent = `${v} ms`;
        }
        const badge = document.getElementById('corona-kernel-badge');
        if (badge) {
            badge.textContent = presentCount === 0 ? '不可用'
                : (enabledCount > 0 ? `${enabledCount}/${presentCount} 已启用` : '未启用');
        }
        const empty = document.getElementById('corona-kernel-empty');
        const body = document.getElementById('corona-kernel-body');
        if (empty && body) {
            if (presentCount === 0) { empty.style.display = ''; body.style.display = 'none'; }
            else { empty.style.display = 'none'; body.style.display = ''; }
        }
    },
    async toggleCoronaKernelModule(mod, on) {
        const v = on ? '1' : '0';
        const snapshot = this.buildCoronaKernelConfigSnapshot();
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: `即将${on ? '启用' : '禁用'} ${mod}。`,
            configs: [{ filename: 'corona_kernel.conf', content: snapshot }],
            writes: [{ path: `/sys/module/${mod}/parameters/enabled`, value: v }]
        }, {
            onCancel: () => this.loadCoronaKernelConfig()
        });
        if (!confirmed) return false;
        await this.exec(`echo ${v} > /sys/module/${mod}/parameters/enabled 2>/dev/null`);
        if (this.coronaKernelLive) this.coronaKernelLive[mod] = v;
        await this.persistCoronaKernelConfig();
        this.loadCoronaKernelConfig();
        this.showToast(on ? `${mod} 已启用` : `${mod} 已禁用`);
        return true;
    },
    async saveCoronaKernelTunable(key, value) {
        const writes = [];
        if (key === 'user_window_ms') {
            writes.push(...this.coronaKernelGated.map(m => ({ path: `/sys/module/${m}/parameters/user_window_ms`, value: String(value) })));
        } else if (key === 'slack_off_ms') {
            writes.push({ path: '/sys/module/suspend_timerslack/parameters/slack_off_ns', value: String(value * 1000 * 1000) });
        }
        const snapshot = this.buildCoronaKernelConfigSnapshot();
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: `即将保存 ${key}。`,
            configs: [{ filename: 'corona_kernel.conf', content: snapshot }],
            writes
        }, {
            onCancel: () => this.loadCoronaKernelConfig()
        });
        if (!confirmed) return false;
        if (key === 'user_window_ms') {
            const cmd = this.coronaKernelGated.map(m =>
                `[ -f /sys/module/${m}/parameters/user_window_ms ] && echo ${value} > /sys/module/${m}/parameters/user_window_ms`
            ).join('; ');
            await this.exec(`(${cmd}) 2>/dev/null`);
        } else if (key === 'slack_off_ms') {
            const ns = value * 1000 * 1000;
            await this.exec(`[ -f /sys/module/suspend_timerslack/parameters/slack_off_ns ] && echo ${ns} > /sys/module/suspend_timerslack/parameters/slack_off_ns 2>/dev/null`);
        }
        await this.persistCoronaKernelConfig();
        this.showToast('已保存');
        return true;
    },
    async persistCoronaKernelConfig() {
        const lines = [];
        for (const mod of this.coronaKernelMods) {
            if (this.coronaKernelPresent && !this.coronaKernelPresent[mod]) continue;
            const sw = document.querySelector(`.ck-switch[data-mod="${mod}"]`);
            if (!sw) continue;
            lines.push(`${mod}_enabled=${sw.checked ? '1' : '0'}`);
        }
        const ws = document.getElementById('ck-user-window-slider');
        if (ws) lines.push(`user_window_ms=${ws.value}`);
        const ss = document.getElementById('ck-slack-off-slider');
        if (ss) lines.push(`slack_off_ms=${ss.value}`);
        await this.writeConfig('corona_kernel.conf', lines.join('\n'));
    }
  });
  window.CoronaFeatureScripts["corona-kernel"] = true;
})();
