(function() {
    if (typeof CoronaAddon === 'undefined') return;
    window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
    if (window.CoronaFeatureScripts['runtime-optimizer']) return;

    const CONFIG_FILE = 'auto_affinity.conf';
    const CONFIG_ORDER = [
        'enabled', 'ebpf', 'default_class', 'efficiency_cpus', 'balanced_cpus',
        'performance_cpus', 'exclude_packages', 'scan_interval_ms', 'load_learning',
        'thermal_control', 'thermal_warm_c', 'thermal_severe_c'
    ];

    Object.assign(CoronaAddon.prototype, {
        initRuntimeOptimizer() {
            if (this.runtimeOptimizerInitialized) return;
            this.runtimeOptimizerInitialized = true;
            document.getElementById('runtime-refresh-btn')?.addEventListener('click', () => this.refreshRuntimeOptimizer(true));
            document.getElementById('runtime-advanced-toggle')?.addEventListener('click', () => this.toggleRuntimeAdvanced());
            document.querySelectorAll('#runtime-class-options button').forEach(button => {
                button.addEventListener('click', () => {
                    this.selectRuntimeClass(button.dataset.value);
                    this.scheduleRuntimeOptimizerApply();
                });
            });
            ['runtime-enabled-switch', 'runtime-ebpf-switch', 'runtime-load-learning-switch', 'runtime-thermal-control-switch'].forEach(id => {
                document.getElementById(id)?.addEventListener('change', () => this.scheduleRuntimeOptimizerApply());
            });
            ['runtime-efficiency-cpus', 'runtime-balanced-cpus', 'runtime-performance-cpus', 'runtime-scan-interval', 'runtime-warm-threshold', 'runtime-severe-threshold'].forEach(id => {
                document.getElementById(id)?.addEventListener('change', () => this.scheduleRuntimeOptimizerApply());
            });
            this.loadRuntimeOptimizerConfig();
            this.refreshRuntimeOptimizer();
        },
        toggleRuntimeAdvanced() {
            const toggle = document.getElementById('runtime-advanced-toggle');
            const content = document.getElementById('runtime-advanced-content');
            if (!toggle || !content) return;
            const opening = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
            content.setAttribute('aria-hidden', opening ? 'false' : 'true');
            if (opening) {
                content.style.maxHeight = '0px';
                content.classList.add('expanded');
                requestAnimationFrame(() => {
                    content.style.maxHeight = `${content.scrollHeight}px`;
                });
            } else {
                content.style.maxHeight = `${content.scrollHeight}px`;
                requestAnimationFrame(() => {
                    content.classList.remove('expanded');
                    content.style.maxHeight = '0px';
                });
            }
            if (typeof this.refreshExpandedContentHeight === 'function') {
                setTimeout(() => this.refreshExpandedContentHeight('app-policy-content'), 360);
            }
        },
        parseRuntimeKeyValues(content) {
            return Object.fromEntries(this.parseSimpleConfig(content));
        },
        setRuntimeText(id, value) {
            const element = document.getElementById(id);
            if (element) element.textContent = value || '--';
        },
        setRuntimeSaveState(state) {
            const element = document.getElementById('runtime-save-state');
            if (!element) return;
            element.dataset.state = state;
            const key = state === 'saving' ? 'runtimeAutoSaving' : state === 'error' ? 'runtimeAutoSaveFailed' : 'runtimeAutoSaved';
            element.textContent = this.t(key);
        },
        scheduleRuntimeOptimizerApply() {
            this.setRuntimeSaveState('saving');
            if (this.runtimeOptimizerApplyTimer) clearTimeout(this.runtimeOptimizerApplyTimer);
            this.runtimeOptimizerApplyTimer = setTimeout(() => {
                this.runtimeOptimizerApplyTimer = null;
                this.applyRuntimeOptimizerConfig({ silent: true });
            }, 350);
        },
        selectRuntimeClass(value) {
            const normalized = ['efficiency', 'balanced', 'performance'].includes(value) ? value : 'balanced';
            document.querySelectorAll('#runtime-class-options button').forEach(button => {
                button.classList.toggle('selected', button.dataset.value === normalized);
            });
        },
        async loadRuntimeOptimizerConfig() {
            const config = this.parseRuntimeKeyValues(await this.readConfig(CONFIG_FILE));
            const setChecked = (id, key, fallback) => {
                const element = document.getElementById(id);
                if (element) element.checked = (config[key] ?? fallback) === '1';
            };
            const setValue = (id, key, fallback = '') => {
                const element = document.getElementById(id);
                if (element) element.value = config[key] ?? fallback;
            };
            setChecked('runtime-enabled-switch', 'enabled', '0');
            setChecked('runtime-ebpf-switch', 'ebpf', '1');
            setChecked('runtime-load-learning-switch', 'load_learning', '1');
            setChecked('runtime-thermal-control-switch', 'thermal_control', '1');
            this.selectRuntimeClass(config.default_class || 'balanced');
            setValue('runtime-efficiency-cpus', 'efficiency_cpus');
            setValue('runtime-balanced-cpus', 'balanced_cpus');
            setValue('runtime-performance-cpus', 'performance_cpus');
            setValue('runtime-scan-interval', 'scan_interval_ms', '1000');
            setValue('runtime-warm-threshold', 'thermal_warm_c', '65');
            setValue('runtime-severe-threshold', 'thermal_severe_c', '75');
        },
        runtimeNumberValue(id, fallback, minimum, maximum) {
            const value = Number.parseInt(document.getElementById(id)?.value, 10);
            if (!Number.isFinite(value)) return fallback;
            return Math.max(minimum, Math.min(maximum, value));
        },
        async applyRuntimeOptimizerConfig(options = {}) {
            const selectedClass = document.querySelector('#runtime-class-options button.selected')?.dataset.value || 'balanced';
            const warm = this.runtimeNumberValue('runtime-warm-threshold', 65, 35, 100);
            const severe = this.runtimeNumberValue('runtime-severe-threshold', 75, warm + 1, 110);
            const updates = {
                enabled: document.getElementById('runtime-enabled-switch')?.checked ? '1' : '0',
                ebpf: document.getElementById('runtime-ebpf-switch')?.checked ? '1' : '0',
                default_class: selectedClass,
                efficiency_cpus: document.getElementById('runtime-efficiency-cpus')?.value.trim() || null,
                balanced_cpus: document.getElementById('runtime-balanced-cpus')?.value.trim() || null,
                performance_cpus: document.getElementById('runtime-performance-cpus')?.value.trim() || null,
                scan_interval_ms: String(this.runtimeNumberValue('runtime-scan-interval', 1000, 250, 10000)),
                load_learning: document.getElementById('runtime-load-learning-switch')?.checked ? '1' : '0',
                thermal_control: document.getElementById('runtime-thermal-control-switch')?.checked ? '1' : '0',
                thermal_warm_c: String(warm),
                thermal_severe_c: String(severe)
            };
            if (!options.silent) this.showLoading(true);
            try {
                await this.mergeConfigFile(CONFIG_FILE, updates, CONFIG_ORDER);
                await this.exec(`${this.shellQuote(`${this.modDir}/bin/coronad`)} reload >/dev/null 2>&1`);
                await this.sleep(350);
                await this.loadRuntimeOptimizerConfig();
                await this.refreshRuntimeOptimizer();
                this.setRuntimeSaveState('saved');
                if (!options.silent) this.showToast(this.t('runtimeApplied'));
            } catch (error) {
                this.setRuntimeSaveState('error');
                if (!options.silent) this.showToast(this.t('runtimeApplyFailed'), 'error');
            } finally {
                if (!options.silent) this.showLoading(false);
            }
        },
        async restartRuntimeOptimizer() {
            this.showLoading(true);
            try {
                const binary = this.shellQuote(`${this.modDir}/bin/coronad`);
                await this.exec(`${binary} stop >/dev/null 2>&1; ${binary} start >/dev/null 2>&1`);
                await this.sleep(500);
                await this.refreshRuntimeOptimizer();
                this.showToast(this.t('runtimeRestarted'));
            } finally {
                this.showLoading(false);
            }
        },
        async refreshRuntimeOptimizer(notify = false) {
            const binary = this.shellQuote(`${this.modDir}/bin/coronad`);
            const status = this.parseRuntimeKeyValues(await this.exec(`${binary} status 2>/dev/null`));
            const running = status.running === '1';
            const badge = document.getElementById('runtime-status-badge');
            if (badge) {
                badge.dataset.state = running ? 'running' : 'stopped';
                badge.textContent = this.t(running ? 'runtimeRunning' : 'runtimeStopped');
            }
            this.setRuntimeText('runtime-foreground', status.foreground || status.package);
            this.setRuntimeText('runtime-detection', status.foreground_source);
            this.setRuntimeText('runtime-mode', status.runtime_mode || status.mode);
            this.setRuntimeText('runtime-temperature', status.max_temperature_c ? `${status.max_temperature_c} °C` : '--');
            const requested = status.ebpf_requested === '1';
            const active = status.ebpf_active === '1';
            this.setRuntimeText('runtime-ebpf-state', this.t(active ? 'runtimeEbpfActive' : requested ? 'runtimeEbpfFallback' : 'runtimeEbpfIdle'));
            this.setRuntimeText('runtime-known-threads', status.known_threads);
            this.setRuntimeText('runtime-applied-failed', `${status.affinity_applied || status.applied || 0} / ${status.affinity_failed || status.failed || 0}`);
            this.setRuntimeText('runtime-ebpf-events', status.bpf_events || '0');
            const error = document.getElementById('runtime-ebpf-error');
            if (error) {
                const hasError = Boolean(status.ebpf_error_stage) || Number(status.ebpf_error_errno || 0) !== 0;
                error.hidden = !hasError;
                error.textContent = hasError
                    ? `${this.t('runtimeEbpfError')}: ${status.ebpf_error_stage || 'unknown'} (${status.ebpf_error_errno || 0})`
                    : '';
            }
            if (notify) this.showToast(this.t('runtimeRefreshed'));
        }
    });

    window.CoronaFeatureScripts['runtime-optimizer'] = true;
})();
