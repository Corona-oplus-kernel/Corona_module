(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["le9ec"]) return;
  Object.assign(CoronaAddon.prototype, {
    toggleLe9ecSettings(show) {
        const settings = document.getElementById('le9ec-settings');
        if (typeof this.setSubSettingsExpanded === 'function') this.setSubSettingsExpanded(settings, show);
        else if (settings) settings.classList.toggle('hidden', !show);
        if (show) this.loadLe9ecStatus();
    },
    bindSettingsOverscrollGuard() {},
    async loadLe9ecConfig() {
        const exists = await this.exec('cat /proc/sys/vm/anon_min_kbytes 2>/dev/null');
        this.le9ecSupported = !!exists;
        if (!exists) {
            const card = document.getElementById('le9ec-card'); if (card) { card.style.display = 'none'; card.hidden = true; card.setAttribute('aria-hidden', 'true'); }
            this.refreshCardVisibilityAvailability();
            return;
        }
        const config = await this.readConfig('le9ec.conf');
        if (config) {
            const enabledMatch = config.match(/enabled=(\d)/);
            const anonMatch = config.match(/anon_min=(\d+)/);
            const cleanLowMatch = config.match(/clean_low=(\d+)/);
            const cleanMinMatch = config.match(/clean_min=(\d+)/);
            if (enabledMatch) { this.state.le9ecEnabled = enabledMatch[1] === '1'; document.getElementById('le9ec-switch').checked = this.state.le9ecEnabled; this.toggleLe9ecSettings(this.state.le9ecEnabled); }
            if (anonMatch) { this.state.le9ecAnon = parseInt(anonMatch[1]); document.getElementById('le9ec-anon-slider').value = Math.round(this.state.le9ecAnon / 1024); document.getElementById('le9ec-anon-value').textContent = `${Math.round(this.state.le9ecAnon / 1024)} MB`; }
            if (cleanLowMatch) { this.state.le9ecCleanLow = parseInt(cleanLowMatch[1]); document.getElementById('le9ec-clean-low-slider').value = Math.round(this.state.le9ecCleanLow / 1024); document.getElementById('le9ec-clean-low-value').textContent = `${Math.round(this.state.le9ecCleanLow / 1024)} MB`; }
            if (cleanMinMatch) { this.state.le9ecCleanMin = parseInt(cleanMinMatch[1]); document.getElementById('le9ec-clean-min-slider').value = Math.round(this.state.le9ecCleanMin / 1024); document.getElementById('le9ec-clean-min-value').textContent = `${Math.round(this.state.le9ecCleanMin / 1024)} MB`; }
        }
        await this.loadLe9ecStatus();
    },
    async loadLe9ecStatus() {
        const [anon, cleanLow, cleanMin] = await Promise.all([
            this.exec('cat /proc/sys/vm/anon_min_kbytes 2>/dev/null'),
            this.exec('cat /proc/sys/vm/clean_low_kbytes 2>/dev/null'),
            this.exec('cat /proc/sys/vm/clean_min_kbytes 2>/dev/null')
        ]);
        document.getElementById('le9ec-anon-current').textContent = anon ? `${Math.round(parseInt(anon) / 1024)} MB` : '--';
        document.getElementById('le9ec-clean-low-current').textContent = cleanLow ? `${Math.round(parseInt(cleanLow) / 1024)} MB` : '--';
        document.getElementById('le9ec-clean-min-current').textContent = cleanMin ? `${Math.round(parseInt(cleanMin) / 1024)} MB` : '--';
        const le9ecBadge = document.getElementById('le9ec-badge');
        const hasConfig = (anon && parseInt(anon) > 0) || (cleanLow && parseInt(cleanLow) > 0) || (cleanMin && parseInt(cleanMin) > 0);
        if (le9ecBadge) le9ecBadge.textContent = hasConfig ? '已启用' : '未启用';
    },
    getLe9ecFieldUpdates(changedKeys = null) {
        const keys = Array.isArray(changedKeys) ? changedKeys : (changedKeys ? [changedKeys] : ['enabled', 'anon_min', 'clean_low', 'clean_min']);
        const updates = {};
        if (keys.includes('enabled')) updates.enabled = this.state.le9ecEnabled ? '1' : '0';
        if (keys.includes('anon_min')) updates.anon_min = String(this.state.le9ecAnon);
        if (keys.includes('clean_low')) updates.clean_low = String(this.state.le9ecCleanLow);
        if (keys.includes('clean_min')) updates.clean_min = String(this.state.le9ecCleanMin);
        return { keys, updates };
    },
    async saveLe9ecConfig(changedKeys = null, skipPreview = false) {
        const { keys, updates } = this.getLe9ecFieldUpdates(changedKeys);
        const config = await this.buildMergedConfigContent('le9ec.conf', updates, ['enabled', 'anon_min', 'clean_low', 'clean_min']);
        const writes = [];
        if (this.state.le9ecEnabled) {
            if (keys.includes('anon_min')) writes.push({ path: '/proc/sys/vm/anon_min_kbytes', value: String(this.state.le9ecAnon) });
            if (keys.includes('clean_low')) writes.push({ path: '/proc/sys/vm/clean_low_kbytes', value: String(this.state.le9ecCleanLow) });
            if (keys.includes('clean_min')) writes.push({ path: '/proc/sys/vm/clean_min_kbytes', value: String(this.state.le9ecCleanMin) });
        }
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: this.state.le9ecEnabled ? '即将保存并应用 LE9EC 配置。' : '即将保存 LE9EC 配置。',
                configs: [{ filename: 'le9ec.conf', content: config }],
                writes,
                notes: this.state.le9ecEnabled ? [] : ['当前为禁用状态，仅保存配置。']
            }, {
                onCancel: () => this.loadLe9ecConfig()
            });
            if (!confirmed) return false;
        }
        await this.mergeConfigFile('le9ec.conf', updates, ['enabled', 'anon_min', 'clean_low', 'clean_min']);
        if (this.state.le9ecEnabled) {
            await this.applyLe9ecImmediate(keys, true);
        } else {
            this.showToast('LE9EC 配置已保存（禁用状态）');
            await this.updateModuleDescription();
        }
        return true;
    },
    async applyLe9ecImmediate(changedKeys = null, skipPreview = false) {
        const { keys, updates } = this.getLe9ecFieldUpdates(changedKeys);
        if (!skipPreview) {
            const config = await this.buildMergedConfigContent('le9ec.conf', updates, ['enabled', 'anon_min', 'clean_low', 'clean_min']);
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将应用 LE9EC 配置。',
                configs: [{ filename: 'le9ec.conf', content: config }],
                writes: [
                    ...(keys.includes('anon_min') ? [{ path: '/proc/sys/vm/anon_min_kbytes', value: String(this.state.le9ecAnon) }] : []),
                    ...(keys.includes('clean_low') ? [{ path: '/proc/sys/vm/clean_low_kbytes', value: String(this.state.le9ecCleanLow) }] : []),
                    ...(keys.includes('clean_min') ? [{ path: '/proc/sys/vm/clean_min_kbytes', value: String(this.state.le9ecCleanMin) }] : [])
                ]
            }, {
                onCancel: () => this.loadLe9ecConfig()
            });
            if (!confirmed) return false;
        }
        await Promise.all([
            ...(keys.includes('anon_min') ? [this.exec(`echo ${this.state.le9ecAnon} > /proc/sys/vm/anon_min_kbytes`)] : []),
            ...(keys.includes('clean_low') ? [this.exec(`echo ${this.state.le9ecCleanLow} > /proc/sys/vm/clean_low_kbytes`)] : []),
            ...(keys.includes('clean_min') ? [this.exec(`echo ${this.state.le9ecCleanMin} > /proc/sys/vm/clean_min_kbytes`)] : [])
        ]);
        await this.mergeConfigFile('le9ec.conf', updates, ['enabled', 'anon_min', 'clean_low', 'clean_min']);
        await this.updateModuleDescription();
        this.showToast('LE9EC 配置已应用');
        setTimeout(() => this.loadLe9ecStatus(), 500);
        return true;
    },
  });
  window.CoronaFeatureScripts["le9ec"] = true;
})();
