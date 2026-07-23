(function() {
    if (typeof CoronaAddon === 'undefined') return;
    window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
    if (window.CoronaFeatureScripts['runtime-optimizer']) return;

    const CONFIG_FILE = 'auto_affinity.conf';
    const DAEMON_CONFIG_FILE = 'coronad.conf';
    const HARDWARE_CONFIG_FILE = 'hardware_policy.conf';
    const HARDWARE_POLICIES = [
        { id: 'runtime-irq-switch', key: 'irq_enabled' },
        { id: 'runtime-ufs-switch', key: 'ufs_enabled' },
        { id: 'runtime-gpu-switch', key: 'gpu_enabled' },
        { id: 'runtime-io-switch', key: 'io_enabled' }
    ];
    const HARDWARE_CONFIG_ORDER = HARDWARE_POLICIES.map(policy => policy.key);
    const CONFIG_ORDER = [
        'enabled', 'ebpf', 'default_class', 'efficiency_cpus', 'balanced_cpus',
        'performance_cpus', 'exclude_packages', 'scan_interval_ms', 'load_learning',
        'thermal_control', 'thermal_warm_c', 'thermal_severe_c'
    ];
    const CAPABILITY_REASON_KEYS = Object.freeze({
        available: 'runtimeCapabilityAvailable',
        missing_node: 'runtimeCapabilityMissingNode',
        read_only: 'runtimeCapabilityReadOnly',
        kernel_disabled: 'runtimeCapabilityKernelDisabled'
    });
    const POLICY_KEYS = Object.freeze({
        irq: Object.freeze({
            active: 'runtimeIrqActive', efficient: 'runtimeIrqEfficient', idle: 'runtimeIrqIdle',
            disabled: 'runtimePolicyDisabled', unsupported: 'unsupported'
        }),
        ufs: Object.freeze({
            boost: 'runtimeUfsBoost', flush: 'runtimeUfsFlush', 'small-write': 'runtimeUfsSmallWrite',
            learning: 'runtimePolicyLearning', idle: 'runtimeUfsIdle', disabled: 'runtimePolicyDisabled',
            unsupported: 'unsupported'
        }),
        gpu: Object.freeze({
            burst: 'runtimeGpuBurst', limited: 'runtimeGpuLimited', idle: 'runtimeGpuIdle',
            disabled: 'runtimePolicyDisabled', unsupported: 'unsupported'
        }),
        io: Object.freeze({
            sequential: 'runtimeIoSequential', random: 'runtimeIoRandom', write: 'runtimeIoWrite',
            mixed: 'runtimeIoMixed', pressure: 'runtimeIoPressureLimited', congested: 'runtimeIoCongested',
            limited: 'runtimeIoLimited', learning: 'runtimePolicyLearning', idle: 'runtimeIoIdle',
            disabled: 'runtimePolicyDisabled', unsupported: 'unsupported'
        })
    });
    const POLICY_FALLBACKS = Object.freeze({ irq: 'runtimeIrqIdle', ufs: 'runtimeUfsIdle', gpu: 'runtimeGpuIdle', io: 'runtimeIoIdle' });
    const PRESSURE_KEYS = Object.freeze(['runtimePressureNormal', 'runtimePressureModerate', 'runtimePressureHigh']);
    const DECISION_AREA_KEYS = Object.freeze({
        foreground: 'runtimeDecisionForeground', irq: 'runtimeIrqPolicy', ufs: 'runtimeUfsPolicy',
        gpu: 'runtimeGpuPolicy', io: 'runtimeIoPolicy', storage: 'runtimeStorageLearning',
        zram: 'runtimeDecisionZram'
    });

    Object.assign(CoronaAddon.prototype, {
        initRuntimeOptimizer() {
            if (this.runtimeOptimizerInitialized) return;
            this.runtimeOptimizerInitialized = true;
            this.mountRuntimeOptimizerPanel();
            document.getElementById('runtime-refresh-btn')?.addEventListener('click', () => this.refreshRuntimeOptimizer(true));
            this.bindRuntimeDetails();
            const settingsToggle = document.getElementById('runtime-settings-toggle');
            const toggleSettings = () => this.toggleRuntimePanel('runtime-settings', {
                cardEl: document.getElementById('runtime-optimizer-panel'),
                onExpand: () => this.refreshRuntimeOptimizer()
            });
            settingsToggle?.addEventListener('click', event => {
                if (event.target.closest('#runtime-refresh-btn')) return;
                toggleSettings();
            });
            settingsToggle?.addEventListener('keydown', event => {
                if (event.target.closest('#runtime-refresh-btn')) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                toggleSettings();
            });
            document.getElementById('runtime-advanced-toggle')?.addEventListener('click', () => {
                if (this.rejectDaemonDependentAction()) return;
                this.toggleRuntimePanel('runtime-advanced');
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
            HARDWARE_POLICIES.forEach(policy => {
                document.getElementById(policy.id)?.addEventListener('change', event => {
                    this.scheduleHardwarePolicyApply(event.currentTarget);
                });
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
            this.runtimeStatusTimer = window.setInterval(() => {
                if (document.hidden || !document.getElementById('page-settings')?.classList.contains('active')) return;
                this.refreshRuntimeOptimizer();
            }, 2000);
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
        bindRuntimeDetails() {
            document.querySelectorAll('.runtime-details, .runtime-capabilities, .runtime-history').forEach(details => {
                details.addEventListener('toggle', () => {
                    if (!details.open) return;
                    this.refreshRuntimeOptimizer();
                    const content = [...details.children].find(child => child.tagName !== 'SUMMARY');
                    if (!content?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                    content._runtimeExpandAnimation?.cancel();
                    content._runtimeExpandAnimation = content.animate([
                        { opacity: 0, transform: 'translateY(-7px)', clipPath: 'inset(0 0 100% 0)' },
                        { opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0)' }
                    ], { duration: 190, easing: 'cubic-bezier(.22, 1, .36, 1)' });
                });
            });
        },
        toggleRuntimePanel(prefix, options = {}) {
            const toggle = document.getElementById(`${prefix}-toggle`);
            const content = document.getElementById(`${prefix}-content`);
            if (!toggle || !content) return;
            const opening = content._panelState !== 'opening' && content._panelState !== 'open';
            if (opening) {
                this.expandPanelContent(content, toggle, options);
            } else {
                this.collapsePanelContent(content, toggle, options);
            }
        },
        parseRuntimeKeyValues(content) {
            return Object.fromEntries(this.parseSimpleConfig(content));
        },
        setRuntimeText(id, value) {
            const element = document.getElementById(id);
            if (!element) return;
            const next = value || '--';
            if (element.textContent !== next) element.textContent = next;
        },
        runtimePolicyText(area, state) {
            return this.t(POLICY_KEYS[area]?.[state] || POLICY_FALLBACKS[area] || 'runtimeUnknown');
        },
        runtimePressureText(level) {
            const index = Math.max(0, Math.min(2, Number.parseInt(level || '0', 10)));
            return this.t(PRESSURE_KEYS[index]);
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
        setRuntimeDaemonState(enabled) {
            this.state.runtimeDaemonEnabled = enabled;
            this.updateRuntimeDaemonControlState(enabled);
            const daemonSwitch = document.getElementById('runtime-daemon-switch');
            if (daemonSwitch) daemonSwitch.checked = enabled;
        },
        rejectDaemonDependentAction() {
            if (this.isRuntimeDaemonEnabled()) return false;
            this.showToast(this.t('runtimeDaemonRequired'), 'warning');
            return true;
        },
        rejectDaemonDependentToggle(toggle) {
            if (!toggle || !this.rejectDaemonDependentAction()) return false;
            const previousChecked = !toggle.checked;
            setTimeout(() => {
                toggle.checked = previousChecked;
            }, 180);
            return true;
        },
        updateRuntimeOverviewState(running) {
            const overview = document.querySelector('.thread-runtime-overview');
            if (!overview) return;
            overview.classList.toggle('runtime-stopped', !running);
            const waiting = document.getElementById('runtime-daemon-waiting');
            if (waiting) waiting.hidden = running;
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
        updateRuntimeCapabilities(status, running, renderCapabilities = true) {
            if (renderCapabilities) {
                document.querySelectorAll('.runtime-capability-item').forEach(item => {
                    const name = item.dataset.capability;
                    if (!running) {
                        item.dataset.state = 'waiting';
                        const value = item.querySelector('strong');
                        const text = this.t('runtimeCapabilityWaiting');
                        if (value && value.textContent !== text) value.textContent = text;
                        return;
                    }
                    const supported = status[`capability_${name}`] === '1';
                    const reason = status[`capability_${name}_reason`] || 'missing_node';
                    item.dataset.state = supported ? 'available' : 'unavailable';
                    const value = item.querySelector('strong');
                    const text = this.t(CAPABILITY_REASON_KEYS[reason] || 'unsupported');
                    if (value && value.textContent !== text) value.textContent = text;
                });
            }
            HARDWARE_POLICIES.forEach(policy => {
                const capability = policy.key.replace('_enabled', '');
                const toggle = document.getElementById(policy.id);
                if (!toggle) return;
                if (!running) {
                    toggle.disabled = false;
                    toggle.closest('.runtime-switch-card')?.classList.remove('runtime-capability-unavailable');
                    return;
                }
                const supported = status[`capability_${capability}`] === '1';
                toggle.disabled = !supported;
                toggle.closest('.runtime-switch-card')?.classList.toggle('runtime-capability-unavailable', !supported);
            });
        },
        updateRuntimeDecisions(status) {
            const list = document.getElementById('runtime-decision-list');
            const summary = document.getElementById('runtime-decision-summary');
            if (!list || !summary) return;
            const entries = Object.entries(status)
                .filter(([key]) => /^decision_\d+$/.test(key))
                .sort(([left], [right]) => Number.parseInt(left.slice(9), 10) - Number.parseInt(right.slice(9), 10))
                .map(([, value]) => value.split('|'));
            const signature = entries.map(parts => parts.join('|')).join('\n');
            const changed = this.runtimeDecisionSignature !== signature;
            this.runtimeDecisionSignature = signature;
            const summaryText = entries.length
                ? this.t('runtimeDecisionCount').replace('{count}', String(entries.length))
                : this.t('runtimeDecisionEmpty');
            if (summary.textContent !== summaryText) summary.textContent = summaryText;
            if (changed && this.runtimeDecisionsInitialized) {
                const history = document.querySelector('.runtime-history');
                history?.classList.remove('runtime-history-updated');
                void history?.offsetWidth;
                history?.classList.add('runtime-history-updated');
            }
            const renderList = document.querySelector('.runtime-history')?.open === true;
            if (!renderList) {
                this.runtimeDecisionsInitialized = true;
                return;
            }
            if (this.runtimeDecisionListSignature === signature) return;
            this.runtimeDecisionListSignature = signature;
            if (!entries.length) {
                let empty = list.querySelector('.runtime-decision-empty');
                if (!empty) {
                    empty = document.createElement('div');
                    empty.className = 'runtime-decision-empty';
                    list.replaceChildren(empty);
                }
                empty.textContent = this.t('runtimeDecisionEmpty');
                this.runtimeDecisionsInitialized = true;
                return;
            }
            list.querySelector('.runtime-decision-empty')?.remove();
            const existing = new Map([...list.querySelectorAll('.runtime-decision-item')].map(item => [item.dataset.key, item]));
            const active = new Set();
            entries.forEach(([tick, area, action, reason]) => {
                const key = `${tick}|${area}|${action}|${reason}`;
                active.add(key);
                let item = existing.get(key);
                if (!item) {
                    item = document.createElement('div');
                    item.className = 'runtime-decision-item';
                    item.dataset.key = key;
                    const header = document.createElement('div');
                    header.className = 'runtime-decision-head';
                    const areaLabel = document.createElement('span');
                    areaLabel.className = 'runtime-decision-area';
                    areaLabel.textContent = this.t(DECISION_AREA_KEYS[area] || 'runtimeUnknown');
                    const sequence = document.createElement('small');
                    sequence.className = 'runtime-decision-sequence';
                    sequence.textContent = `#${tick || 0}`;
                    header.append(areaLabel, sequence);
                    const actionLabel = document.createElement('strong');
                    actionLabel.className = 'runtime-decision-action';
                    actionLabel.textContent = action || '--';
                    const detail = document.createElement('span');
                    detail.className = 'runtime-decision-reason';
                    detail.textContent = reason || '--';
                    item.append(header, actionLabel, detail);
                    if (changed && this.runtimeDecisionsInitialized) {
                        item.classList.add('runtime-decision-new');
                        item.addEventListener('animationend', () => item.classList.remove('runtime-decision-new'), { once: true });
                    }
                }
                list.appendChild(item);
            });
            existing.forEach((item, key) => {
                if (!active.has(key)) item.remove();
            });
            this.runtimeDecisionsInitialized = true;
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
            const [configContent, daemonConfigContent, hardwareConfigContent] = await Promise.all([
                this.readConfig(CONFIG_FILE),
                this.readConfig(DAEMON_CONFIG_FILE),
                this.readConfig(HARDWARE_CONFIG_FILE)
            ]);
            if (loadToken !== this.runtimeOptimizerLoadToken) return false;
            if (options.revision !== undefined && options.revision !== (this.runtimeOptimizerRevision || 0)) return false;
            const config = this.parseRuntimeKeyValues(configContent);
            const hardwareConfig = this.parseRuntimeKeyValues(hardwareConfigContent);
            const daemonEnabled = this.parseEnabledFlag(daemonConfigContent);
            this.setRuntimeDaemonState(daemonEnabled);
            const setChecked = (id, key, fallback) => {
                const element = document.getElementById(id);
                if (element) element.checked = daemonEnabled && (config[key] ?? fallback) === '1';
            };
            const setValue = (id, key, fallback = '') => {
                const element = document.getElementById(id);
                if (element) element.value = config[key] ?? fallback;
            };
            setChecked('runtime-enabled-switch', 'enabled', '0');
            setChecked('runtime-ebpf-switch', 'ebpf', '0');
            setChecked('runtime-load-learning-switch', 'load_learning', '0');
            setChecked('runtime-thermal-control-switch', 'thermal_control', '0');
            HARDWARE_POLICIES.forEach(policy => {
                const element = document.getElementById(policy.id);
                if (element) element.checked = daemonEnabled && (hardwareConfig[policy.key] ?? '0') === '1';
            });
            this.selectRuntimeClass(daemonEnabled ? config.default_class || 'balanced' : null);
            setValue('runtime-efficiency-cpus', 'efficiency_cpus');
            setValue('runtime-balanced-cpus', 'balanced_cpus');
            setValue('runtime-performance-cpus', 'performance_cpus');
            setValue('runtime-scan-interval', 'scan_interval_ms', '1000');
            setValue('runtime-warm-threshold', 'thermal_warm_c', '75');
            setValue('runtime-severe-threshold', 'thermal_severe_c', '100');
        },
        scheduleHardwarePolicyApply(toggle) {
            if (this.rejectDaemonDependentToggle(toggle)) return;
            const revision = (this.hardwarePolicyRevision || 0) + 1;
            this.hardwarePolicyRevision = revision;
            if (this.hardwarePolicyApplyTimer) clearTimeout(this.hardwarePolicyApplyTimer);
            this.hardwarePolicyApplyTimer = setTimeout(() => {
                this.hardwarePolicyApplyTimer = null;
                const updates = Object.fromEntries(HARDWARE_POLICIES.map(policy => [
                    policy.key,
                    document.getElementById(policy.id)?.checked ? '1' : '0'
                ]));
                const previous = this.hardwarePolicyApplyQueue || Promise.resolve();
                this.hardwarePolicyApplyQueue = previous
                    .catch(() => {})
                    .then(() => this.applyHardwarePolicyConfig(revision, updates));
            }, 300);
        },
        async applyHardwarePolicyConfig(revision, updates) {
            if (revision !== (this.hardwarePolicyRevision || 0) || !this.isRuntimeDaemonEnabled()) return;
            try {
                await this.mergeConfigFile(HARDWARE_CONFIG_FILE, updates, HARDWARE_CONFIG_ORDER);
                await this.exec(`${this.shellQuote(`${this.modDir}/bin/coronad`)} reload`);
                await this.sleep(350);
                if (revision !== (this.hardwarePolicyRevision || 0)) return;
                await this.loadRuntimeOptimizerConfig();
                await this.refreshRuntimeOptimizer();
                this.showToast(this.t('runtimeHardwareSaved'));
            } catch (error) {
                await this.loadRuntimeOptimizerConfig();
                this.showToast(this.t('runtimeHardwareSaveFailed'), 'error');
            }
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
            if (!enabled && this.hardwarePolicyApplyTimer) {
                clearTimeout(this.hardwarePolicyApplyTimer);
                this.hardwarePolicyApplyTimer = null;
            }
            await this.waitForUiPaint();
            if (daemonSwitch) daemonSwitch.disabled = true;
            this.showLoading(true);
            try {
                const content = await this.mergeConfigFile(DAEMON_CONFIG_FILE, { enabled: enabled ? '1' : null }, ['enabled']);
                const actualEnabled = this.parseEnabledFlag(content, false);
                await this.exec(`sh ${this.shellQuote(`${this.modDir}/service.sh`)} --sync-daemon`);
                this.setRuntimeDaemonState(actualEnabled);
                await this.sleep(500);
                await this.loadRuntimeOptimizerConfig({ revision });
                await this.refreshRuntimeOptimizer();
                if (typeof this.loadZramPolicyConfig === 'function') await this.loadZramPolicyConfig();
                this.showToast(this.t(actualEnabled ? 'runtimeDaemonEnabled' : 'runtimeDaemonDisabled'));
            } catch (error) {
                this.setRuntimeDaemonState(previous);
                await this.waitForUiPaint();
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
            if (this.runtimeRefreshPending) return;
            this.runtimeRefreshPending = true;
            try {
            const binary = this.shellQuote(`${this.modDir}/bin/coronad`);
            const status = this.parseRuntimeKeyValues(await this.exec(`${binary} status 2>/dev/null`));
            const running = status.running === '1';
            const renderDetails = document.querySelector('.runtime-details')?.open === true;
            const renderCapabilities = document.querySelector('.runtime-capabilities')?.open === true;
            this.updateRuntimeOverviewState(running);
            this.updateRuntimeCapabilities(status, running, renderCapabilities);
            this.updateRuntimeDecisions(status);
            const badge = document.getElementById('runtime-status-badge');
            if (badge) {
                badge.dataset.state = running ? 'running' : 'stopped';
                badge.textContent = this.t(running ? 'runtimeRunning' : 'runtimeStopped');
            }
            if (!running) {
                ['runtime-foreground', 'runtime-detection', 'runtime-mode', 'runtime-temperature', 'runtime-cpu-pressure', 'runtime-io-pressure'].forEach(id => this.setRuntimeText(id, '--'));
                const error = document.getElementById('runtime-ebpf-error');
                if (error) error.hidden = true;
                return;
            }
            this.setRuntimeText('runtime-foreground', status.foreground || status.package);
            this.setRuntimeText('runtime-detection', status.foreground_source);
            this.setRuntimeText('runtime-mode', status.runtime_mode || status.mode);
            this.setRuntimeText('runtime-temperature', status.max_temperature_c ? `${status.max_temperature_c} °C` : '--');
            this.setRuntimeText('runtime-cpu-pressure', `${status.cpu_pressure_avg10 || '0'}% · ${this.runtimePressureText(status.cpu_pressure_level)}`);
            this.setRuntimeText('runtime-io-pressure', `${status.io_pressure_avg10 || '0'}% · ${this.runtimePressureText(status.io_pressure_level)}`);
            const error = document.getElementById('runtime-ebpf-error');
            if (error) {
                const hasError = Boolean(status.ebpf_error_stage) || Number(status.ebpf_error_errno || 0) !== 0;
                error.hidden = !hasError;
                error.textContent = hasError
                    ? `${this.t('runtimeEbpfError')}: ${status.ebpf_error_stage || 'unknown'} (${status.ebpf_error_errno || 0})`
                    : '';
            }
            if (!renderDetails) {
                if (notify) this.showToast(this.t('runtimeRefreshed'));
                return;
            }
            const requested = status.ebpf_requested === '1';
            const active = status.ebpf_active === '1';
            this.setRuntimeText('runtime-ebpf-state', this.t(active ? 'runtimeEbpfActive' : requested ? 'runtimeEbpfFallback' : 'runtimeEbpfIdle'));
            this.setRuntimeText('runtime-known-threads', status.known_threads);
            const irqCpus = status.irq_target_cpus ? ` ${status.irq_target_cpus}` : '';
            this.setRuntimeText('runtime-irq-policy', `${this.runtimePolicyText('irq', status.irq_policy)}${irqCpus} · ${status.irq_busy || 0}/${status.irq_managed || 0}`);
            this.setRuntimeText('runtime-ufs-policy', `${this.runtimePolicyText('ufs', status.ufs_policy)} · ${status.ufs_wb_available || 0}`);
            this.setRuntimeText('runtime-gpu-policy', `${this.runtimePolicyText('gpu', status.gpu_policy)} · ${status.gpu_busy_percent || 0}%`);
            const ioValues = status.io_read_ahead_kb && status.io_read_ahead_kb !== '0'
                ? ` · ${status.io_read_ahead_kb}/${status.io_nr_requests || 0}`
                : '';
            this.setRuntimeText('runtime-io-policy', `${this.runtimePolicyText('io', status.io_policy)}${ioValues}`);
            const cpuGroups = [
                `E ${status.efficiency_cpus || '--'}`,
                `B ${status.balanced_cpus || '--'}`,
                `P ${status.performance_cpus || '--'}`,
                `L ${status.latency_cpus || '--'}`
            ].join(' · ');
            this.setRuntimeText('runtime-cpu-groups', cpuGroups);
            this.setRuntimeText(
                'runtime-storage-learning',
                `${status.storage_learning_progress || 0}% · ${status.storage_active_sectors || 0}/${status.storage_sequential_write_sectors || 0} sectors`
            );
            if (notify) this.showToast(this.t('runtimeRefreshed'));
            } finally {
                this.runtimeRefreshPending = false;
            }
        }
    });

    window.CoronaFeatureScripts['runtime-optimizer'] = true;
})();
