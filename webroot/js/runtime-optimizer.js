(function() {
    if (typeof CoronaAddon === 'undefined') return;
    window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
    if (window.CoronaFeatureScripts['runtime-optimizer']) return;

    const CONFIG_FILE = 'auto_affinity.conf';
    const DAEMON_CONFIG_FILE = 'coronad.conf';
    const CONFIG_ORDER = [
        'enabled', 'ebpf', 'default_class', 'efficiency_cpus', 'balanced_cpus',
        'performance_cpus', 'exclude_packages', 'scan_interval_ms', 'load_learning',
        'thermal_control', 'thermal_warm_c', 'thermal_severe_c'
    ];

    Object.assign(CoronaAddon.prototype, {
        initRuntimeOptimizer() {
            if (this.runtimeOptimizerInitialized) return;
            this.runtimeOptimizerInitialized = true;
            this.mountRuntimeOptimizerPanel();
            document.getElementById('runtime-refresh-btn')?.addEventListener('click', () => this.refreshRuntimeOptimizer(true));
            const settingsToggle = document.getElementById('runtime-settings-toggle');
            settingsToggle?.addEventListener('click', event => {
                if (event.target.closest('#runtime-refresh-btn')) return;
                this.toggleRuntimeSettings();
            });
            settingsToggle?.addEventListener('keydown', event => {
                if (event.target.closest('#runtime-refresh-btn')) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                this.toggleRuntimeSettings();
            });
            document.getElementById('runtime-advanced-toggle')?.addEventListener('click', () => {
                if (this.rejectDaemonDependentAction()) return;
                this.toggleRuntimeAdvanced();
            });
            document.querySelectorAll('#runtime-class-options button').forEach(button => {
                button.addEventListener('click', () => {
                    if (this.rejectDaemonDependentAction()) return;
                    this.selectRuntimeClass(button.dataset.value, { animate: true });
                    this.scheduleRuntimeOptimizerApply();
                });
                button.addEventListener('animationend', () => button.classList.remove('runtime-class-selecting'));
            });
            ['runtime-enabled-switch', 'runtime-ebpf-switch', 'runtime-load-learning-switch', 'runtime-thermal-control-switch'].forEach(id => {
                document.getElementById(id)?.addEventListener('change', event => {
                    if (this.rejectDaemonDependentToggle(event.currentTarget)) return;
                    this.scheduleRuntimeOptimizerApply();
                });
            });
            document.getElementById('runtime-daemon-switch')?.addEventListener('change', event => {
                this.setRuntimeDaemonEnabled(event.target.checked);
            });
            ['runtime-efficiency-cpus', 'runtime-balanced-cpus', 'runtime-performance-cpus', 'runtime-scan-interval', 'runtime-warm-threshold', 'runtime-severe-threshold'].forEach(id => {
                const input = document.getElementById(id);
                input?.addEventListener('pointerdown', event => {
                    if (!this.rejectDaemonDependentAction()) return;
                    event.preventDefault();
                    input.blur();
                });
                input?.addEventListener('change', () => this.scheduleRuntimeOptimizerApply());
            });
            this.loadRuntimeOptimizerConfig();
            this.refreshRuntimeOptimizer();
        },
        mountRuntimeOptimizerPanel() {
            const target = document.getElementById('app-policy-content');
            const overview = document.querySelector('.thread-runtime-overview');
            const settings = document.getElementById('runtime-optimizer-panel');
            if (!target || !overview || !settings) return;
            const anchor = target.firstElementChild;
            target.insertBefore(overview, anchor);
            target.insertBefore(settings, anchor);
        },
        toggleRuntimeSettings() {
            const toggle = document.getElementById('runtime-settings-toggle');
            const content = document.getElementById('runtime-settings-content');
            if (!toggle || !content) return;
            const opening = content._panelState !== 'opening' && content._panelState !== 'open';
            if (opening) {
                this.expandPanelContent(content, toggle, {
                    cardEl: document.getElementById('runtime-optimizer-panel'),
                    onExpand: () => this.refreshRuntimeOptimizer()
                });
            } else {
                this.collapsePanelContent(content, toggle, {
                    cardEl: document.getElementById('runtime-optimizer-panel')
                });
            }
        },
        toggleRuntimeAdvanced() {
            const toggle = document.getElementById('runtime-advanced-toggle');
            const content = document.getElementById('runtime-advanced-content');
            if (!toggle || !content) return;
            const opening = content._panelState !== 'opening' && content._panelState !== 'open';
            if (opening) {
                this.expandPanelContent(content, toggle);
            } else {
                this.collapsePanelContent(content, toggle);
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
        isRuntimeDaemonEnabled() {
            return this.state.runtimeDaemonEnabled === true;
        },
        rejectDaemonDependentAction() {
            if (this.isRuntimeDaemonEnabled()) return false;
            this.showToast(this.t('runtimeDaemonRequired'), 'warning');
            return true;
        },
        rejectDaemonDependentToggle(toggle) {
            if (!toggle?.checked || !this.rejectDaemonDependentAction()) return false;
            setTimeout(() => {
                toggle.checked = false;
            }, 180);
            return true;
        },
        updateRuntimeDaemonControlState(enabled) {
            document.querySelector('.runtime-class-section')?.classList.toggle('runtime-daemon-locked', !enabled);
            document.querySelector('.runtime-advanced')?.classList.toggle('runtime-daemon-locked', !enabled);
            document.querySelectorAll('#runtime-class-options button').forEach(button => {
                button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
            });
            ['runtime-efficiency-cpus', 'runtime-balanced-cpus', 'runtime-performance-cpus', 'runtime-scan-interval', 'runtime-warm-threshold', 'runtime-severe-threshold'].forEach(id => {
                const input = document.getElementById(id);
                if (!input) return;
                input.readOnly = !enabled;
                input.setAttribute('aria-disabled', enabled ? 'false' : 'true');
            });
        },
        scheduleRuntimeOptimizerApply() {
            if (!this.isRuntimeDaemonEnabled()) return;
            const revision = (this.runtimeOptimizerRevision || 0) + 1;
            this.runtimeOptimizerRevision = revision;
            this.setRuntimeSaveState('saving');
            if (this.runtimeOptimizerApplyTimer) clearTimeout(this.runtimeOptimizerApplyTimer);
            this.runtimeOptimizerApplyTimer = setTimeout(() => {
                this.runtimeOptimizerApplyTimer = null;
                this.applyRuntimeOptimizerConfig({ silent: true, revision });
            }, 350);
        },
        selectRuntimeClass(value, options = {}) {
            const normalized = ['efficiency', 'balanced', 'performance'].includes(value) ? value : null;
            this.runtimeSelectedClass = normalized;
            document.querySelectorAll('#runtime-class-options button').forEach(button => {
                const selected = normalized !== null && button.dataset.value === normalized;
                button.classList.toggle('selected', selected);
                if (selected && options.animate) {
                    button.classList.remove('runtime-class-selecting');
                    void button.offsetWidth;
                    button.classList.add('runtime-class-selecting');
                }
            });
        },
        async loadRuntimeOptimizerConfig(options = {}) {
            const loadToken = (this.runtimeOptimizerLoadToken || 0) + 1;
            this.runtimeOptimizerLoadToken = loadToken;
            const [configContent, daemonConfigContent] = await Promise.all([
                this.readConfig(CONFIG_FILE),
                this.readConfig(DAEMON_CONFIG_FILE)
            ]);
            if (loadToken !== this.runtimeOptimizerLoadToken) return false;
            if (options.revision !== undefined && options.revision !== (this.runtimeOptimizerRevision || 0)) return false;
            const config = this.parseRuntimeKeyValues(configContent);
            const daemonConfig = this.parseRuntimeKeyValues(daemonConfigContent);
            const daemonEnabled = (daemonConfig.enabled ?? '0') === '1';
            this.state.runtimeDaemonEnabled = daemonEnabled;
            this.updateRuntimeDaemonControlState(daemonEnabled);
            const setChecked = (id, key, fallback) => {
                const element = document.getElementById(id);
                if (element) element.checked = daemonEnabled && (config[key] ?? fallback) === '1';
            };
            const setValue = (id, key, fallback = '') => {
                const element = document.getElementById(id);
                if (element) element.value = config[key] ?? fallback;
            };
            const daemonSwitch = document.getElementById('runtime-daemon-switch');
            if (daemonSwitch) daemonSwitch.checked = daemonEnabled;
            setChecked('runtime-enabled-switch', 'enabled', '0');
            setChecked('runtime-ebpf-switch', 'ebpf', '0');
            setChecked('runtime-load-learning-switch', 'load_learning', '0');
            setChecked('runtime-thermal-control-switch', 'thermal_control', '0');
            this.selectRuntimeClass(daemonEnabled ? config.default_class || 'balanced' : null);
            setValue('runtime-efficiency-cpus', 'efficiency_cpus');
            setValue('runtime-balanced-cpus', 'balanced_cpus');
            setValue('runtime-performance-cpus', 'performance_cpus');
            setValue('runtime-scan-interval', 'scan_interval_ms', '1000');
            setValue('runtime-warm-threshold', 'thermal_warm_c', '75');
            setValue('runtime-severe-threshold', 'thermal_severe_c', '100');
        },
        async setRuntimeDaemonEnabled(enabled) {
            const daemonSwitch = document.getElementById('runtime-daemon-switch');
            const previous = this.isRuntimeDaemonEnabled();
            const revision = (this.runtimeOptimizerRevision || 0) + 1;
            this.runtimeOptimizerRevision = revision;
            if (!enabled && this.runtimeOptimizerApplyTimer) {
                clearTimeout(this.runtimeOptimizerApplyTimer);
                this.runtimeOptimizerApplyTimer = null;
                this.setRuntimeSaveState('saved');
            }
            if (daemonSwitch) daemonSwitch.disabled = true;
            this.showLoading(true);
            try {
                await this.mergeConfigFile(DAEMON_CONFIG_FILE, { enabled: enabled ? '1' : '0' }, ['enabled']);
                await this.exec(`sh ${this.shellQuote(`${this.modDir}/service.sh`)} --sync-daemon`);
                this.state.runtimeDaemonEnabled = enabled;
                await this.sleep(500);
                await this.loadRuntimeOptimizerConfig({ revision });
                await this.refreshRuntimeOptimizer();
                this.showToast(this.t(enabled ? 'runtimeDaemonEnabled' : 'runtimeDaemonDisabled'));
            } catch (error) {
                this.state.runtimeDaemonEnabled = previous;
                if (daemonSwitch) daemonSwitch.checked = !enabled;
                this.showToast(this.t('runtimeDaemonApplyFailed'), 'error');
            } finally {
                if (daemonSwitch) daemonSwitch.disabled = false;
                this.showLoading(false);
            }
        },
        runtimeNumberValue(id, fallback, minimum, maximum) {
            const value = Number.parseInt(document.getElementById(id)?.value, 10);
            if (!Number.isFinite(value)) return fallback;
            return Math.max(minimum, Math.min(maximum, value));
        },
        async applyRuntimeOptimizerConfig(options = {}) {
            if (!this.isRuntimeDaemonEnabled()) return false;
            const revision = options.revision ?? (this.runtimeOptimizerRevision || 0);
            const selectedClass = ['efficiency', 'balanced', 'performance'].includes(this.runtimeSelectedClass)
                ? this.runtimeSelectedClass
                : document.querySelector('#runtime-class-options button.selected')?.dataset.value || 'balanced';
            const warm = this.runtimeNumberValue('runtime-warm-threshold', 75, 35, 100);
            const severe = this.runtimeNumberValue('runtime-severe-threshold', 100, warm + 1, 110);
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
                await this.exec(`sh ${this.shellQuote(`${this.modDir}/service.sh`)} --sync-daemon`);
                await this.sleep(350);
                if (revision !== (this.runtimeOptimizerRevision || 0)) return false;
                await this.loadRuntimeOptimizerConfig({ revision });
                if (revision !== (this.runtimeOptimizerRevision || 0)) return false;
                await this.refreshRuntimeOptimizer();
                this.setRuntimeSaveState('saved');
                if (!options.silent) this.showToast(this.t('runtimeApplied'));
            } catch (error) {
                if (revision === (this.runtimeOptimizerRevision || 0)) {
                    this.setRuntimeSaveState('error');
                    if (!options.silent) this.showToast(this.t('runtimeApplyFailed'), 'error');
                }
            } finally {
                if (!options.silent) this.showLoading(false);
            }
        },
        async restartRuntimeOptimizer() {
            this.showLoading(true);
            try {
                await this.exec(`sh ${this.shellQuote(`${this.modDir}/service.sh`)} --sync-daemon`);
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
