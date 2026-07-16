(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["settings-memory-page"]) return;
  Object.assign(CoronaAddon.prototype, {
    async loadMemoryPageTextResources() {
        // translations removed; UI strings stay in HTML
        this.memoryPageTexts = {};
        return this.memoryPageTexts;
    },
    async loadMemoryPageConfig() {
        if (this.memoryPageConfigLoaded) return this.memoryPageConfig || {};
        this.memoryPageConfigLoaded = true;
        try {
            const response = await fetch(`config/memory-settings.json?v=2026070601`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const config = await response.json();
            this.memoryPageConfig = config || {};
            if (Array.isArray(config?.readaheadOptions) && config.readaheadOptions.length) this.readaheadOptions = config.readaheadOptions;
            if (Array.isArray(config?.ioNrRequestsOptions) && config.ioNrRequestsOptions.length) this.ioNrRequestsOptions = config.ioNrRequestsOptions;
            if (Array.isArray(config?.ioRqAffinityOptions) && config.ioRqAffinityOptions.length) this.ioRqAffinityOptions = config.ioRqAffinityOptions;
            if (Array.isArray(config?.ioNomergesOptions) && config.ioNomergesOptions.length) this.ioNomergesOptions = config.ioNomergesOptions;
            if ((!Array.isArray(this.algorithms) || !this.algorithms.length) && Array.isArray(config?.algorithmFallback) && config.algorithmFallback.length) {
                this.algorithms = config.algorithmFallback;
            }
        } catch (error) {
            console.warn('loadMemoryPageConfig failed', error);
            this.memoryPageConfig = this.memoryPageConfig || {};
        }
        return this.memoryPageConfig;
    },
    renderStaticOptions() { this.renderAlgorithmOptions(); this.renderReadaheadOptions(); this.renderIOAdvancedOptions(); if (typeof this.initIoAdvancedFold === 'function') this.initIoAdvancedFold(); if (typeof this.initZramAdvancedFold === 'function') this.initZramAdvancedFold(); },
    renderAlgorithmOptions() {
        const container = document.getElementById('algorithm-list');
        if (!container) return;
        container.innerHTML = this.algorithms.map(alg => `<div class="option-item ${alg === this.state.algorithm ? 'selected' : ''}" data-value="${alg}">${alg}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', (e) => { container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected')); e.currentTarget.classList.add('selected'); this.state.algorithm = e.currentTarget.dataset.value; if (typeof this.updateZstdLevelVisibility === 'function') this.updateZstdLevelVisibility(); if (typeof this.markZramDirty === 'function') this.markZramDirty('algorithm'); });
        });
        this.renderRecompAlgorithmOptions();
        if (typeof this.updateZstdLevelVisibility === 'function') this.updateZstdLevelVisibility();
    },
    setFeatureVisible(el, show) {
        if (!el) return;
        const on = !!show;
        el.hidden = !on;
        el.style.display = on ? '' : 'none';
        el.setAttribute('aria-hidden', on ? 'false' : 'true');
    },
    updateLoopControlState() {
        const toggle = document.getElementById('zram-writeback-switch');
        const container = document.getElementById('zram-writeback-switch-container');
        const settings = document.getElementById('zram-loop-settings');
        const action = document.getElementById('zram-loop-action');
        if (!toggle) return;
        const supported = !!this.zramFeatures?.writebackControl;
        toggle.disabled = !supported;
        toggle.checked = this.state.loopEnabled;
        if (container) container.classList.toggle('feature-disabled', !supported);
        if (settings) settings.classList.toggle('enabled', supported && toggle.checked);
        if (action) action.disabled = !supported;
        const hint = document.getElementById('zram-writeback-hint');
        if (hint) {
            hint.textContent = supported ? '' : this.t('writebackUnsupported');
            this.setFeatureVisible(hint, !supported);
        }
        this.updateLoopParameterDisplay(this._loopActive ? document.getElementById('zram-loop-device-value')?.textContent : '');
        if (typeof this.refreshZramLoopDevice === 'function') this.refreshZramLoopDevice(false);
    },
    updateLoopParameterDisplay(loopDevice = '') {
        const values = {
            'loop-param-config': this.t(this.state.loopEnabled ? 'enabled' : 'disabled'),
            'loop-param-size': `${Math.round(Number(this.state.loopSizeGb || 1))} GB`,
            'loop-param-zram': this.state.zramPath || '/dev/block/zram0',
            'loop-param-device': loopDevice || this.t('notAssigned')
        };
        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    },
    getLoopZramBlock() {
        const candidate = String(this.state.zramPath || '/dev/block/zram0').split('/').pop();
        return /^zram\d+$/.test(candidate) ? candidate : 'zram0';
    },
    renderLoopRuntimeState(loopDevice = '', managed = false) {
        const valueElement = document.getElementById('zram-loop-device-value');
        const display = loopDevice || this.t('notAssigned');
        if (valueElement) {
            valueElement.textContent = display;
            valueElement.classList.toggle('active', !!loopDevice);
        }
        this._writebackDevice = loopDevice;
        this._loopActive = !!loopDevice && managed;
        this._systemWritebackActive = !!loopDevice && !managed;
        this.updateLoopParameterDisplay(loopDevice);
        const status = document.getElementById('zram-loop-status');
        if (status) {
            status.textContent = this.t(this._loopActive ? 'active' : (this._systemWritebackActive ? 'systemManaged' : 'inactive'));
            status.classList.toggle('active', !!loopDevice);
        }
        const action = document.getElementById('zram-loop-action');
        if (action) {
            action.textContent = this.t(this._loopActive ? 'closeLoop' : 'createLoop');
            action.classList.toggle('running', this._loopActive);
        }
        return display;
    },
    async refreshZramLoopDevice(notify = false, force = false) {
        if (this._loopRefreshPromise && !force) {
            const loopDevice = await this._loopRefreshPromise;
            if (notify) this.showToast(`${this.t('loopDevice')}: ${loopDevice || this.t('notAssigned')}`, 'info');
            return loopDevice;
        }
        const zramBlock = this.getLoopZramBlock();
        const command = `hybrid=/sys/block/${zramBlock}/hybridswap_loop_device; backing=/sys/block/${zramBlock}/backing_dev; state=/data/nandswap/corona_loop_device; if [ -f "$hybrid" ]; then current=$(cat "$hybrid" 2>/dev/null); elif [ -f "$backing" ]; then current=$(cat "$backing" 2>/dev/null); else current=$(cat "$state" 2>/dev/null); fi; current=$(printf '%s' "$current" | tr -d ' \\r\\n'); owned=0; case "$current" in /dev/block/loop*|/dev/loop*) /system/bin/losetup "$current" 2>/dev/null | grep -Fq /data/nandswap/corona_swapfile && owned=1 ;; esac; printf '%s\\n%s\\n' "$current" "$owned"`;
        const refresh = (async () => {
            const lines = String(await this.exec(command) || '').split(/\r?\n/);
            const raw = String(lines[0] || '').trim();
            const loopDevice = raw && raw !== 'none' ? raw : '';
            const managed = String(lines[1] || '').trim() === '1';
            this.renderLoopRuntimeState(loopDevice, managed);
            return loopDevice;
        })();
        this._loopRefreshPromise = refresh;
        try {
            const loopDevice = await refresh;
            if (notify) this.showToast(`${this.t('loopDevice')}: ${loopDevice || this.t('notAssigned')}`, 'info');
            return loopDevice;
        } finally {
            if (this._loopRefreshPromise === refresh) this._loopRefreshPromise = null;
        }
    },
    initZramRecompFold() {
        if (typeof this.initAdvancedFold === 'function') {
            this.initAdvancedFold('zram-recomp-toggle', 'zram-recomp-body', { defaultOpen: false });
            return;
        }
        // fallback no-anim
        const header = document.getElementById('zram-recomp-toggle');
        const body = document.getElementById('zram-recomp-body');
        if (!header || !body || header.dataset.bound) return;
        header.dataset.bound = '1';
        header.addEventListener('click', () => {
            const open = body.dataset.open === '1';
            body.dataset.open = open ? '0' : '1';
            body.style.display = open ? 'none' : 'block';
            header.classList.toggle('expanded', !open);
        });
    },
    initZramAdvancedFold() {
        if (typeof this.initAdvancedFold === 'function') {
            this.initAdvancedFold('zram-advanced-toggle', 'zram-advanced-body', { defaultOpen: false });
        }
    },
    renderRecompAlgorithmOptions() {
        const section = document.getElementById('zram-recomp-section');
        if (!section) return;
        const supported = !!(this.zramFeatures && this.zramFeatures.multiComp);
        this.setFeatureVisible(section, supported);
        if (!supported) return;
        if (typeof this.initZramRecompFold === 'function') this.initZramRecompFold();
        const algos = ['none', ...(this.algorithms || [])];
        const labels = { none: '无' };
        for (let i = 1; i <= 3; i++) {
            const key = `recompAlgorithm${i}`;
            const container = document.getElementById(`recomp-algorithm-list-${i}`);
            if (!container) continue;
            const current = this.state[key] || 'none';
            container.innerHTML = algos.map(alg => `<div class="option-item ${alg === current ? 'selected' : ''}" data-value="${alg}">${labels[alg] || alg}</div>`).join('');
            container.querySelectorAll('.option-item').forEach(item => {
                item.addEventListener('click', async (e) => {
                    container.querySelectorAll('.option-item').forEach(el => el.classList.remove('selected'));
                    e.currentTarget.classList.add('selected');
                    this.state[key] = e.currentTarget.dataset.value;
                    // cascading: later levels require previous non-none
                    if (this.state[key] === 'none') {
                        for (let j = i + 1; j <= 3; j++) this.state[`recompAlgorithm${j}`] = 'none';
                        this.renderRecompAlgorithmOptions();
                    } else if (i > 1 && (this.state[`recompAlgorithm${i - 1}`] || 'none') === 'none') {
                        this.state[key] = 'none';
                        this.renderRecompAlgorithmOptions();
                        this.showToast(`请先设置重压缩 ${i - 1}`);
                        return;
                    }
                    if (typeof this.updateZstdLevelVisibility === 'function') this.updateZstdLevelVisibility();
                    if (typeof this.markZramDirty === 'function') {
                        this.markZramDirty(`recomp_algorithm${i}`);
                        if (this.state[key] === 'none') {
                            for (let j = i + 1; j <= 3; j++) this.markZramDirty(`recomp_algorithm${j}`);
                        }
                    }
                });
            });
        }
    },
    renderReadaheadOptions() {
        const container = document.getElementById('readahead-list');
        container.innerHTML = this.readaheadOptions.map(size => `<div class="option-item ${size === this.state.readahead ? 'selected' : ''}" data-value="${size}">${size}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => { container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected')); e.currentTarget.classList.add('selected'); this.state.readahead = parseInt(e.currentTarget.dataset.value); await this.applyReadaheadImmediate(); });
        });
    },
    renderDiscreteOptions(containerId, values, currentValue, formatter, onSelect) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = values.map(value => `<div class="option-item ${value === currentValue ? 'selected' : ''}" data-value="${value}">${formatter ? formatter(value) : value}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                await onSelect(e.currentTarget.dataset.value);
            });
        });
    },
    renderIOAdvancedOptions() {
        const ensureValues = (values, fallback) => Array.isArray(values) && values.length > 0 ? values : fallback;
        const includeCurrentValue = (values, currentValue) => {
            const normalized = values.map(Number).filter(value => Number.isFinite(value) && value > 0);
            const current = Number(currentValue);
            if (Number.isFinite(current) && current > 0) normalized.push(current);
            return [...new Set(normalized)].sort((left, right) => left - right);
        };
        this.ioNrRequestsOptions = includeCurrentValue(
            ensureValues(this.ioNrRequestsOptions, [64, 128, 256, 512, 1024, 2048]),
            this.state.ioNrRequests
        );
        this.ioRqAffinityOptions = ensureValues(this.ioRqAffinityOptions, [0, 1, 2]);
        this.ioNomergesOptions = ensureValues(this.ioNomergesOptions, [0, 1, 2]);
        this.renderDiscreteOptions('io-nr-requests-list', this.ioNrRequestsOptions, this.state.ioNrRequests, null, async (value) => {
            this.state.ioNrRequests = parseInt(value);
            await this.applyIOConfigImmediate('nr_requests');
        });
        this.renderDiscreteOptions('io-rq-affinity-list', this.ioRqAffinityOptions, this.state.ioRqAffinity, null, async (value) => {
            this.state.ioRqAffinity = parseInt(value);
            await this.applyIOConfigImmediate('rq_affinity');
        });
        this.renderDiscreteOptions('io-nomerges-list', this.ioNomergesOptions, this.state.ioNomerges, null, async (value) => {
            this.state.ioNomerges = parseInt(value);
            await this.applyIOConfigImmediate('nomerges');
        });
        const iostatsSwitch = document.getElementById('io-iostats-switch');
        if (iostatsSwitch && !iostatsSwitch.dataset.bound) {
            iostatsSwitch.dataset.bound = '1';
            iostatsSwitch.addEventListener('change', async (e) => {
                this.state.ioIostats = e.target.checked;
                await this.applyIOConfigImmediate('iostats');
            });
        }
    },
  });
  window.CoronaFeatureScripts["settings-memory-page"] = true;
})();
