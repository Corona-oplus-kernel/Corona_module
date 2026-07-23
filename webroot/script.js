const SWITCH_ONLY_CONFIG_FILES = new Set([
    'app_rules.conf',
    'coronad.conf',
    'hardware_policy.conf',
    'zram_policy.conf',
    'corona_kernel.conf',
    'system_opt.conf'
]);

class CoronaAddon {
    constructor() {
        this.moduleId = '';
        this.modDir = '';
        this.configDir = '';
        this.runtimeConfig = { swapPath: '' };
        this.algorithms = [];
        this.readaheadOptions = [];
        this.ioNrRequestsOptions = [];
        this.ioRqAffinityOptions = [];
        this.ioNomergesOptions = [];
        this.snapshotConfigFiles = ['zram.conf', 'zram_policy.conf', 'loop.conf', 'memory_pressure.conf', 'le9ec.conf', 'system_opt.conf', 'io_scheduler.conf', 'cpu_governor.conf', 'cpu_hotplug.conf', 'tcp.conf', 'process_priority.conf', 'thread_priority.conf', 'swap.conf', 'vm.conf', 'kernel.conf', 'corona_kernel.conf', 'auto_affinity.conf', 'hardware_policy.conf', 'coronad.conf'];
        this.state = {
            algorithm: 'lz4',
            recompAlgorithm1: 'none',
            recompAlgorithm2: 'none',
            recompAlgorithm3: 'none',
            zstdCompressionLevel: 1,
            zramSize: 8,
            swappiness: 100,
            directSwappiness: 60,
            zramUsedLimitMb: 0,
            hybridswapIncreaseMb: 2048,
            hybridswapQuotaGb: 10,
            zramPriority: 32758,
            loopEnabled: false,
            loopSizeGb: 12,
            pressureEnabled: false,
            pressureProfile: 'balanced',
            zramPath: '/dev/block/zram0',
            ioEnabled: false,
            ioScheduler: null,
            readahead: 512,
            ioNrRequests: 128,
            ioRqAffinity: 1,
            ioNomerges: 0,
            ioIostats: false,
            tcpEnabled: false,
            tcp: null,
            cpuEnabled: false,
            cpuGovernor: null,
            zramEnabled: false,
            le9ecEnabled: false,
            le9ecAnon: 524288,
            le9ecCleanLow: 0,
            le9ecCleanMin: 524288,
            dualCell: false,
            theme: 'light',
            language: 'zh',
            accent: 'blue',
            hue: 214,
            changePreviewEnabled: false,
            showSettingDescriptions: false,
            showCategoryConfigToggles: false,
            swapEnabled: false,
            swapSize: 2048,
            swapPriority: 0,
            swapPath: '',
            vmEnabled: false,
            watermarkScale: 100,
            extraFreeKbytes: 0,
            dirtyRatio: 20,
            dirtyBgRatio: 10,
            vfsCachePressure: 100,
            lruGenEnabled: false,
            thp: 'never',
            ksmEnabled: false,
            compactionEnabled: false
        };
        this.kernelFeatures = { lruGen: false, thp: false, ksm: false, compaction: false };
        this.zramFeatures = { multiComp: false, zstdLevel: false, writebackControl: false, writebackMode: 'none' };
        this.isCoronaKernel = false;
        this.localKernelWorkflowBuild = 0;
        this.moduleVersion = '--';
        this.kernelUpdateInfo = null;
        this.cpuCores = [];
        this.cpuClusterInfo = { little: 0, mid: 0, big: 0, prime: 0 };
        this.cpuStats = {};
        this.memCleanRunning = false;
        this.easterEgg = { clickCount: 0, clickTimer: null, authorClickCount: 0, authorClickTimer: null, xinranClickCount: 0, xinranClickTimer: null, currentCard: 'thanks', isOverlayOpen: false };
        this.deviceImageState = { rotation: 0, scale: 1, isRotating: false, isDragging: false, currentScale: 1, rotateCount: 0, isInfiniteRotating: false, spinClickCount: 0, noDeceleration: false };
        this.cpuFreqsPerCore = {};
        this.historyData = { cpu: [], mem: [], cpuTemp: [], batteryTemp: [] };
        this.chartType = 'cpu';
        this.maxHistoryPoints = 36;
        this.le9ecSupported = false;
        this.realtimeIntervalMs = 6000;
        this.realtimeTimer = null;
        this.zramMetricsTimer = null;
        this.zramStatusBusy = false;
        this.realtimeBusy = false;
        this.realtimeTick = 0;
        this.isInitializing = true;
        this.lightweightUi = true;
        this.pendingChartDraw = false;
        this.prevCpuStat = null;
        this.deferredHomeReady = false;
        this.settingsUiInitialized = false;
        this.settingsDataLoaded = false;
        this.settingsReadyState = 'idle';
        this.settingsInitPromise = null;
        this.featureScriptPromises = {};
        this.parameterSnapshots = [];
        this.dom = {};
        this.initDOMCache();
        this.init().catch(error => console.error('initialization failed', error));
    }
    initDOMCache() {
        const ids = [
            'device-brand', 'device-model', 'cpu-info', 'cpu-cluster-info', 'cpu-brand-badge',
            'mem-total', 'mem-used', 'mem-available', 'mem-progress',
            'swap-total', 'swap-used', 'swap-free', 'swap-progress',
            'storage-total', 'storage-used', 'storage-available', 'storage-progress',
            'battery-level', 'battery-capacity', 'battery-temp', 'cpu-temp',
            'system-version', 'kernel-version', 'history-chart',
            'zram-current-alg', 'zram-current-size', 'zram-current-swappiness', 'zram-status',
            'zram-raw-size', 'zram-total-writes', 'zram-total-reads', 'zram-compr-size', 'zram-mem-used', 'zram-compr-ratio',
            'zstd-level-slider', 'zstd-level-value',
            'swap-status', 'swap-current-status', 'swap-current-size', 'swap-size-value', 'swap-io-in', 'swap-io-out',
            'vm-status', 'lru-status'
        ];
        ids.forEach(id => { this.dom[id] = document.getElementById(id); });
    }
    $(id) { return this.dom[id] || (this.dom[id] = document.getElementById(id)); }
    getFeatureScriptPath(name) {
        const map = {
            'i18n-zh': 'translations/zh.js',
            'i18n-en': 'translations/en.js',
            'i18n-runtime': 'js/i18n-runtime.js',
            'app-policy': 'js/app-policy.js',
            'priority-thread': 'js/priority-thread.js',
            'memory-opt': 'js/memory-opt.js',
            'le9ec': 'js/le9ec.js',
            'memory-core': 'js/memory-core.js',
            'settings-memory-page': 'js/settings-memory-page.js',
            'settings-ui': 'js/settings-ui.js',
            'home-ui': 'js/home-ui.js',
            'runtime-optimizer': 'js/runtime-optimizer.js',
            'custom-scripts': 'js/custom-scripts.js',
            'corona-kernel': 'js/corona-kernel.js'
        };
        return map[name] ? `${map[name]}?v=2026072315` : '';
    }
    async ensureFeatureScript(name) {
        window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
        if (window.CoronaFeatureScripts[name]) return;
        const path = this.getFeatureScriptPath(name);
        if (!path) throw new Error(`Unknown feature script: ${name}`);
        if (this.featureScriptPromises[name]) return this.featureScriptPromises[name];
        this.featureScriptPromises[name] = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-feature-script="${name}"]`);
            if (existing) {
                if (window.CoronaFeatureScripts[name]) {
                    resolve();
                    return;
                }
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error(`Failed to load feature script: ${name}`)), { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = path;
            script.async = true;
            script.dataset.featureScript = name;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load feature script: ${name}`));
            document.head.appendChild(script);
        }).finally(() => {
            if (!window.CoronaFeatureScripts[name]) delete this.featureScriptPromises[name];
        });
        return this.featureScriptPromises[name];
    }
    parseEnabledFlag(content, defaultValue = false) {
        if (!content) return defaultValue;
        const match = String(content).match(/^enabled=(\d)/m);
        return match ? match[1] === '1' : defaultValue;
    }
    waitForUiPaint() {
        return new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(fallbackTimer);
                resolve();
            };
            const fallbackTimer = setTimeout(finish, 120);
            requestAnimationFrame(() => requestAnimationFrame(finish));
        });
    }
    parseCpuHotplugConfig(content) {
        const saved = {};
        String(content || '').split('\n').forEach(line => {
            const match = line.match(/^(cpu\d+)=(0|1)$/);
            if (match) saved[match[1]] = match[2] === '1';
        });
        return saved;
    }
    async saveDisabledConfig(filename, content, toastText) {
        await this.writeConfig(filename, content);
        await this.updateModuleDescription();
        if (toastText) this.showToast(toastText);
        return true;
    }
    async init() {
        let initialized = false;
        await this.resolvePaths();
        await Promise.all([
            this.ensureFeatureScript('i18n-zh'),
            this.ensureFeatureScript('i18n-en')
        ]);
        await this.ensureFeatureScript('i18n-runtime');
        await Promise.all([
            this.ensureFeatureScript('settings-ui'),
            this.ensureFeatureScript('home-ui'),
            this.ensureFeatureScript('runtime-optimizer'),
            this.ensureFeatureScript('memory-core'),
            this.ensureFeatureScript('settings-memory-page')
        ]);
        this.initLanguage();
        this.showInitOverlay(true, this.t('initDefault'));
        try {
            this.updateInitOverlayMessage(this.t('initResolve'));
            this.updateInitOverlayMessage(this.t('initPrepare'));
            await this.ensureConfigDir();
            await this.loadRuntimeConfig();
            const coronaNodeValue = (await this.exec('cat /proc/corona 2>/dev/null')).trim();
            this.isCoronaKernel = /^\d+$/.test(coronaNodeValue) && parseInt(coronaNodeValue, 10) > 0;
            this.initTheme();
            this.initChangePreviewPreference();
            this.initSettingDescriptionPreference();
            this.initCategoryConfigVisibilityPreference();
            if (typeof this.setCategoryConfigVisibility === 'function') {
                this.setCategoryConfigVisibility(this.state.showCategoryConfigToggles);
            }
            this.bindAllEvents();
            this.initRuntimeOptimizer();
            this.initNavigationHistory();
            this.initLanguageSelector();
            this.applyTranslations();
            this.startTranslationObserver();
            this.updateInitOverlayMessage(this.t('initSettings'));
            await Promise.all([
                this.loadDeviceInfo(),
                this.loadModuleVersion(),
                this.ensureAllSettingsSectionsReady()
            ]);
            this.initDetailOverlays();
            this.initHomeCardClicks();
            this.initChart();
            this.initStaticHeader();
            this.initModuleIntro();
            this.initializeHomeInteractions();
            this.updateInitOverlayMessage(this.t('initRealtime'));
            await this.awaitInitialRealtimeReady();
            this.startRealtimeMonitor();
            initialized = true;
        } finally {
            this.isInitializing = false;
            if (initialized) this.showInitOverlay(false);
            else this.showInitOverlay(true, this.t('initFailed'));
        }
    }
    updateSliderProgress(slider) {
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        const percent = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
        const filledColor = 'var(--primary)';
        const emptyColor = 'color-mix(in srgb, var(--primary) 24%, transparent)';
        slider.style.background = `linear-gradient(to right, ${filledColor} 0%, ${filledColor} ${percent}%, ${emptyColor} ${percent}%, ${emptyColor} 100%)`;
        const bubble = slider.parentElement?.querySelector('.slider-bubble');
        if (bubble) {
            const valueId = slider.id ? slider.id.replace(/-slider$/, '-value') : '';
            const valueEl = valueId ? document.getElementById(valueId) : null;
            bubble.textContent = valueEl?.textContent?.trim() || slider.value;
            bubble.style.left = `${Math.max(4, Math.min(96, percent))}%`;
        }
    }
    initSliderProgress() {
        const throttled = rafThrottle((slider) => this.updateSliderProgress(slider));
        const preciseInputs = {
            'zstd-level-slider': { unit: '', decimals: 0 },
            'zram-size-slider': { unit: 'GB', decimals: 2 },
            'zram-writeback-size-slider': { unit: 'GB', decimals: 0 },
            'swappiness-slider': { unit: '', decimals: 0 },
            'direct-swappiness-slider': { unit: '', decimals: 0 },
            'zram-used-limit-slider': { unit: 'MB', decimals: 0 },
            'hybridswap-increase-slider': { unit: 'MB', decimals: 0 },
            'hybridswap-quota-slider': { unit: 'GB', decimals: 0 },
            'swap-size-slider': { unit: 'MB', decimals: 0 }
        };
        document.querySelectorAll('.range-slider').forEach(slider => {
            const container = slider.parentElement;
            if (container && !container.querySelector('.slider-bubble')) {
                container.classList.add('slider-bubble-host');
                const bubble = document.createElement('output');
                bubble.className = 'slider-bubble';
                bubble.setAttribute('aria-hidden', 'true');
                container.appendChild(bubble);
            }
            const precise = preciseInputs[slider.id];
            if (container && precise && !container.querySelector('.slider-precise-row')) {
                const row = document.createElement('div');
                row.className = 'slider-precise-row';
                row.innerHTML = `<button type="button" class="slider-precise-toggle" aria-expanded="false"><span class="slider-precise-label" data-i18n="preciseValue">手动输入</span><span class="slider-precise-arrow">✎</span></button><label class="slider-precise-control"><input class="slider-number-input" type="number" inputmode="decimal"><span class="slider-number-unit"></span></label>`;
                const toggle = row.querySelector('.slider-precise-toggle');
                const input = row.querySelector('.slider-number-input');
                const unit = row.querySelector('.slider-number-unit');
                input.min = slider.min;
                input.max = slider.max;
                input.step = slider.step;
                input.value = Number(slider.value).toFixed(precise.decimals);
                unit.textContent = precise.unit;
                toggle.addEventListener('click', () => {
                    const editing = row.classList.toggle('editing');
                    toggle.setAttribute('aria-expanded', editing ? 'true' : 'false');
                    if (editing) requestAnimationFrame(() => input.focus());
                });
                input.addEventListener('input', () => {
                    if (input.value === '') return;
                    const value = Number(input.value);
                    if (!Number.isFinite(value)) return;
                    slider.value = String(Math.max(Number(slider.min), Math.min(Number(slider.max), value)));
                    slider.dispatchEvent(new Event('input', { bubbles: true }));
                });
                input.addEventListener('change', () => {
                    const value = Math.max(Number(slider.min), Math.min(Number(slider.max), Number(input.value)));
                    slider.value = String(Number.isFinite(value) ? value : Number(slider.value));
                    input.value = Number(slider.value).toFixed(precise.decimals);
                    slider.dispatchEvent(new Event('input', { bubbles: true }));
                    slider.dispatchEvent(new Event('change', { bubbles: true }));
                    row.classList.remove('editing');
                    toggle.setAttribute('aria-expanded', 'false');
                });
                slider.addEventListener('input', () => {
                    input.value = Number(slider.value).toFixed(precise.decimals);
                });
                container.appendChild(row);
            }
            const bubble = container?.querySelector('.slider-bubble');
            let hideTimer = null;
            const showBubble = () => {
                if (!bubble) return;
                if (hideTimer) clearTimeout(hideTimer);
                bubble.classList.add('visible');
                bubble.setAttribute('aria-hidden', 'false');
            };
            const hideBubble = (delay = 120) => {
                if (!bubble) return;
                if (hideTimer) clearTimeout(hideTimer);
                hideTimer = setTimeout(() => {
                    bubble.classList.remove('visible');
                    bubble.setAttribute('aria-hidden', 'true');
                }, delay);
            };
            this.updateSliderProgress(slider);
            slider.addEventListener('pointerdown', showBubble);
            slider.addEventListener('input', () => {
                showBubble();
                throttled(slider);
            });
            slider.addEventListener('pointerup', () => hideBubble());
            slider.addEventListener('pointercancel', () => hideBubble());
            slider.addEventListener('change', () => hideBubble(180));
            slider.addEventListener('blur', () => hideBubble(0));
        });
        if (typeof this.applyTranslations === 'function') this.applyTranslations();
    }
    async execResult(cmd) {
        return new Promise((resolve) => {
            const callbackId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            const timeout = setTimeout(() => {
                delete window[callbackId];
                resolve({ code: -1, stdout: '', stderr: 'timeout' });
            }, 12000);
            window[callbackId] = (code, stdout, stderr) => {
                clearTimeout(timeout);
                delete window[callbackId];
                const numericCode = Number(code);
                resolve({
                    code: Number.isFinite(numericCode) ? numericCode : -1,
                    stdout: stdout ? String(stdout).trim() : '',
                    stderr: stderr ? String(stderr).trim() : ''
                });
            };
            try {
                ksu.exec(cmd, '{}', callbackId);
            } catch (error) {
                clearTimeout(timeout);
                delete window[callbackId];
                resolve({ code: -1, stdout: '', stderr: String(error?.message || error || '') });
            }
        });
    }
    async exec(cmd) {
        const result = await this.execResult(cmd);
        return result.stdout;
    }
    shellQuote(value) {
        return `'${String(value).replace(/'/g, `'\\''`)}'`;
    }
    bindOptionItems(container, onSelect, options = {}) {
        if (!container || container.dataset.optionBound) return;
        container.dataset.optionBound = '1';
        container.addEventListener('click', async event => {
            const item = event.target.closest('.option-item');
            if (!item || !container.contains(item) || (options.enabled && !options.enabled())) return;
            container.querySelectorAll('.option-item').forEach(option => option.classList.toggle('selected', option === item));
            if (options.animate) this.syncAnimatedOptionIndicator(container);
            await onSelect(item.dataset.value, item, event);
        });
    }
    normalizeConfigFilename(filename) {
        const normalized = String(filename || '').replace(/\\/g, '/').replace(/^\.\//, '');
        if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
            throw new Error(`Invalid config filename: ${filename}`);
        }
        return normalized;
    }
    getConfigPath(filename) {
        return `${this.configDir}/${this.normalizeConfigFilename(filename)}`;
    }
    async readConfig(filename) {
        return this.exec(`cat ${this.shellQuote(this.getConfigPath(filename))} 2>/dev/null`);
    }
    normalizeConfigContent(content) {
        return String(content ?? '').replace(/\r/g, '').replace(/\n+$/, '');
    }
    isEnableControlKey(key) {
        return key === 'enabled' || key.endsWith('_enabled');
    }
    compactConfigContent(filename, content) {
        const normalized = this.normalizeConfigContent(content);
        const lines = normalized.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
        if (!lines.length) return '';
        const entries = this.parseSimpleConfig(normalized);
        if (entries.length !== lines.length) return `${normalized}\n`;
        if (entries.every(([key]) => this.isEnableControlKey(key))) {
            const configName = this.normalizeConfigFilename(filename).split('/').pop();
            const switchEnabled = entries.some(([, value]) => value === '1');
            if (!SWITCH_ONLY_CONFIG_FILES.has(configName) || !switchEnabled) return '';
        }
        return this.buildSimpleConfig(entries);
    }
    async configFileMatches(filename, expectedContent) {
        const path = this.shellQuote(this.getConfigPath(filename));
        if (!this.normalizeConfigContent(expectedContent)) {
            return (await this.exec(`[ ! -e ${path} ] && echo 1 || echo 0`)).trim() === '1';
        }
        const marker = '__CORONA_CONFIG_EXISTS__';
        const output = await this.exec(`if [ -f ${path} ]; then printf '${marker}\\n'; cat ${path}; fi`);
        if (!String(output || '').startsWith(marker)) return false;
        const actual = String(output).slice(marker.length).replace(/^\n/, '');
        return this.normalizeConfigContent(actual) === this.normalizeConfigContent(expectedContent);
    }
    async writeConfigUnlocked(filename, content) {
        const path = this.getConfigPath(filename);
        const parent = path.slice(0, path.lastIndexOf('/'));
        content = this.compactConfigContent(filename, content);
        if (!content) {
            const result = await this.execResult(`rm -f ${this.shellQuote(path)}`);
            if (result.code !== 0) throw new Error(result.stderr || `Failed to remove ${filename}`);
            return '';
        }
        const b64 = btoa(unescape(encodeURIComponent(String(content))));
        const quotedPath = this.shellQuote(path);
        const result = await this.execResult(`mkdir -p ${this.shellQuote(parent)}; tmp=${quotedPath}.tmp.$$; echo '${b64}' | base64 -d > "$tmp" && mv -f "$tmp" ${quotedPath}; code=$?; [ "$code" -eq 0 ] || rm -f "$tmp"; exit "$code"`);
        if (result.code !== 0) {
            for (const delay of [0, 80, 220]) {
                if (delay) await new Promise(resolve => setTimeout(resolve, delay));
                if (await this.configFileMatches(filename, content)) return String(content);
            }
            throw new Error(result.stderr || `Failed to write ${filename}`);
        }
        return String(content);
    }
    writeConfig(filename, content) {
        const normalized = this.normalizeConfigFilename(filename);
        return this.withLock(`config-file:${normalized}`, () => this.writeConfigUnlocked(normalized, content));
    }
    parseSimpleConfig(content) {
        const entries = [];
        String(content || '').split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const idx = trimmed.indexOf('=');
            if (idx <= 0) return;
            entries.push([trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim()]);
        });
        return entries;
    }
    buildSimpleConfig(entries) {
        const lines = entries
            .filter(item => Array.isArray(item) && item[0])
            .map(([key, value]) => `${key}=${value}`);
        return lines.length ? `${lines.join('\n')}\n` : '';
    }
    mergeSimpleConfigContent(content, updates, order = []) {
        const map = new Map(this.parseSimpleConfig(content));
        Object.entries(updates || {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') map.delete(key);
            else map.set(key, String(value));
        });
        const keys = [...new Set([...order, ...map.keys()])].filter(key => map.has(key));
        return this.buildSimpleConfig(keys.map(key => [key, map.get(key)]));
    }
    async buildMergedConfigContent(filename, updates, order = []) {
        return this.compactConfigContent(filename, this.mergeSimpleConfigContent(await this.readConfig(filename), updates, order));
    }
    mergeConfigFile(filename, updates, order = []) {
        const normalized = this.normalizeConfigFilename(filename);
        return this.withLock(`config-file:${normalized}`, async () => {
            const content = this.mergeSimpleConfigContent(await this.readConfig(normalized), updates, order);
            return this.writeConfigUnlocked(normalized, content);
        });
    }
    removeConfigKeys(filename, keys, order = []) {
        return this.mergeConfigFile(filename, Object.fromEntries((keys || []).map(key => [key, null])), order);
    }
    withLock(key, fn) {
        if (!this._locks) this._locks = {};
        const prev = this._locks[key] || Promise.resolve();
        const next = prev.catch(() => {}).then(() => fn());
        this._locks[key] = next.finally(() => {
            if (this._locks[key] === next) delete this._locks[key];
        });
        return next;
    }
    async writeAndVerifySysfs(value, sysfsPath, label) {
        await this.exec(`echo "${value}" > ${sysfsPath} 2>/dev/null`);
        const readback = (await this.exec(`cat ${sysfsPath} 2>/dev/null`)).trim();
        if (readback !== '' && readback !== String(value).trim()) {
            const m = readback.match(/\[([^\]]+)\]/);
            if (!(m && m[1] === String(value).trim())) {
                this.showToast(`${label} 写入未生效（当前: ${readback || '空'}）`);
                return false;
            }
        }
        return true;
    }
    async resolvePaths() {
        const pathname = decodeURIComponent(window.location.pathname || '');
        const match = pathname.match(/(\/data\/adb\/(?:ksu\/|ap\/)?modules\/([^/]+))/);
        if (match) {
            this.modDir = match[1];
            this.moduleId = match[2];
        }
        if (!this.modDir) {
            const found = (await this.exec('for base in /data/adb/modules /data/adb/ksu/modules /data/adb/ap/modules; do [ -d "$base" ] || continue; for d in "$base"/*; do [ -f "$d/webroot/script.js" ] && [ -f "$d/module.prop" ] && echo "$d" && break 2; done; done')).trim();
            if (found) {
                this.modDir = found.split('\n')[0].trim();
                const parts = this.modDir.split('/');
                this.moduleId = parts[parts.length - 1] || '';
            }
        }
        if (!this.modDir) {
            if (!this.moduleId) this.moduleId = 'module';
            const base = (await this.exec('[ -d /data/adb/ksu/modules ] && echo /data/adb/ksu/modules || echo /data/adb/modules')).trim() || '/data/adb/modules';
            this.modDir = `${base}/${this.moduleId}`;
        }
        this.configDir = `${this.modDir}/config`;
    }
    async loadRuntimeConfig() {
        const runtimePath = `${this.configDir}/runtime.conf`;
        const content = await this.exec(`cat ${this.shellQuote(runtimePath)} 2>/dev/null`);
        if (content) {
            content.split('\n').forEach(line => {
                const idx = line.indexOf('=');
                if (idx <= 0) return;
                const key = line.slice(0, idx).trim();
                const value = line.slice(idx + 1).trim();
                if (key === 'swapfile_path' && value) this.runtimeConfig.swapPath = value;
                if (key === 'module_id' && value && !this.moduleId) this.moduleId = value;
            });
        }
        if (!this.runtimeConfig.swapPath) this.runtimeConfig.swapPath = `${this.modDir}/swapfile.img`;
        if (!this.state.swapPath) this.state.swapPath = this.runtimeConfig.swapPath;
    }
    async loadAppMetaCache() {
        if (!this.appMetaCache || typeof this.appMetaCache !== 'object' || Array.isArray(this.appMetaCache)) {
            this.appMetaCache = {};
        }
        const path = `${this.configDir}/app_meta_cache.b64`;
        const raw = await this.exec(`cat ${this.shellQuote(path)} 2>/dev/null`);
        this.appMetaCache = {};
        if (!raw) return;
        try {
            const json = decodeURIComponent(escape(atob(raw.trim())));
            const parsed = JSON.parse(json);
            const version = parsed && typeof parsed === 'object' ? parsed.__version : 0;
            const source = parsed && typeof parsed === 'object' && parsed.apps ? parsed.apps : parsed;
            if (version !== 10 || !source || typeof source !== 'object' || Array.isArray(source)) return;
            Object.entries(source).forEach(([pkg, meta]) => {
                if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return;
                const next = { ...meta };
                if (!next.label || next.label === pkg) delete next.label;
                this.appMetaCache[pkg] = next;
            });
        } catch (e) {
            this.appMetaCache = {};
        }
    }
    async saveAppMetaCache() {
        if (!this.appMetaCache || typeof this.appMetaCache !== 'object' || Array.isArray(this.appMetaCache)) {
            this.appMetaCache = {};
        }
        const path = `${this.configDir}/app_meta_cache.b64`;
        const payload = JSON.stringify({ __version: 10, apps: this.appMetaCache || {} });
        const base64Data = btoa(unescape(encodeURIComponent(payload)));
        await this.exec(`echo '${base64Data}' > ${this.shellQuote(path)}`);
    }
    showConfirm(message, title = '确认', options = {}) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('confirm-dialog-overlay');
            const dialog = overlay.querySelector('.confirm-dialog');
            const titleEl = document.getElementById('confirm-dialog-title');
            const messageEl = document.getElementById('confirm-dialog-message');
            const cancelBtn = document.getElementById('confirm-dialog-cancel');
            const okBtn = document.getElementById('confirm-dialog-ok');
            const previewMode = !!options.preview;
            const dangerMode = options.danger !== undefined ? options.danger : true;
            titleEl.textContent = title;
            messageEl.textContent = message;
            cancelBtn.textContent = options.cancelText || '取消';
            okBtn.textContent = options.okText || '确定';
            dialog.classList.toggle('preview-mode', previewMode);
            messageEl.classList.toggle('preview-message', previewMode);
            okBtn.classList.toggle('action-btn-danger', dangerMode);
            const cleanup = () => {
                this.hideOverlay('confirm-dialog-overlay');
                cancelBtn.removeEventListener('click', onCancel);
                okBtn.removeEventListener('click', onOk);
                overlay.removeEventListener('click', onOverlayClick);
                dialog.classList.remove('preview-mode');
                messageEl.classList.remove('preview-message');
                cancelBtn.textContent = '取消';
                okBtn.textContent = '确定';
                okBtn.classList.add('action-btn-danger');
            };
            const onCancel = () => { cleanup(); resolve(false); };
            const onOk = () => { cleanup(); resolve(true); };
            const onOverlayClick = (e) => { if (e.target === overlay) { cleanup(); resolve(false); } };
            cancelBtn.addEventListener('click', onCancel);
            okBtn.addEventListener('click', onOk);
            overlay.addEventListener('click', onOverlayClick);
            this.showOverlay('confirm-dialog-overlay');
        });
    }
    truncatePreviewBlock(text, maxLines = 18, maxChars = 1600) {
        const normalized = String(text ?? '').trim();
        if (!normalized) return '(空)';
        let result = normalized;
        const lines = result.split('\n');
        if (lines.length > maxLines) result = `${lines.slice(0, maxLines).join('\n')}\n...`;
        if (result.length > maxChars) result = `${result.slice(0, maxChars)}...`;
        return result;
    }
    buildChangePreview({ summary = '', configs = [], writes = [], actions = [], notes = [] }) {
        const sections = [];
        if (summary) sections.push(summary);
        if (configs.length > 0) {
            sections.push(`将写入配置\n${configs.map(cfg => `[${cfg.filename}]\n${this.truncatePreviewBlock(cfg.content)}`).join('\n\n')}`);
        }
        if (writes.length > 0) {
            sections.push(`将立即写入\n${writes.map(write => `${write.path} = ${write.value}`).join('\n')}`);
        }
        if (actions.length > 0) {
            sections.push(`还会执行\n${actions.map(action => `- ${action}`).join('\n')}`);
        }
        if (notes.length > 0) {
            sections.push(`说明\n${notes.map(note => `- ${note}`).join('\n')}`);
        }
        return sections.filter(Boolean).join('\n\n');
    }
    async confirmChangePreview(title, preview, options = {}) {
        if (!this.state.changePreviewEnabled) return true;
        const confirmed = await this.showConfirm(
            this.buildChangePreview(preview),
            title,
            {
                preview: true,
                danger: false,
                okText: options.okText || '继续',
                cancelText: options.cancelText || '取消'
            }
        );
        if (!confirmed) {
            if (typeof options.onCancel === 'function') {
                await options.onCancel();
            }
            this.playRollbackAnimation(options.rollbackTargets || null);
        }
        return confirmed;
    }
    serializePriorityRules(rules = this.priorityRules) {
        let configContent = '';
        for (const [name, rule] of Object.entries(rules)) {
            configContent += `${name}=${rule.nice},${rule.ioClass},${rule.ioLevel}\n`;
        }
        return configContent;
    }
    buildCoronaKernelConfigSnapshot() {
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
        return lines.join('\n');
    }
    async ensureConfigDir() { await this.exec(`mkdir -p ${this.shellQuote(this.configDir)}`); }
    bindAllEvents() {
        document.querySelectorAll('.tab-item').forEach(tab => { tab.addEventListener('click', async (e) => { await this.switchPage(e.currentTarget.dataset.page); }); });
        document.getElementById('zram-switch').addEventListener('change', (e) => {
            this.state.zramEnabled = e.target.checked;
            this.toggleZramSettings(e.target.checked);
            this.markZramDirty('enabled');
        });
        document.getElementById('zram-size-slider').addEventListener('input', (e) => {
            this.state.zramSize = parseFloat(e.target.value);
            document.getElementById('zram-size-value').textContent = `${this.state.zramSize.toFixed(2)} GB`;
        });
        document.getElementById('zram-size-slider').addEventListener('change', (e) => {
            this.state.zramSize = parseFloat(e.target.value);
            this.markZramDirty('size');
        });
        document.getElementById('swappiness-slider').addEventListener('input', (e) => {
            this.state.swappiness = parseInt(e.target.value);
            document.getElementById('swappiness-value').textContent = this.state.swappiness;
        });
        document.getElementById('swappiness-slider').addEventListener('change', (e) => {
            this.state.swappiness = parseInt(e.target.value);
            this.markZramDirty('swappiness');
        });
        const bindZramRange = (id, valueId, stateKey, field, formatter, parser = Number) => {
            const slider = document.getElementById(id);
            const value = document.getElementById(valueId);
            if (!slider) return;
            slider.addEventListener('input', (event) => {
                this.state[stateKey] = parser(event.target.value);
                if (value) value.textContent = formatter(this.state[stateKey]);
            });
            slider.addEventListener('change', (event) => {
                this.state[stateKey] = parser(event.target.value);
                this.markZramDirty(field);
            });
        };
        bindZramRange('direct-swappiness-slider', 'direct-swappiness-value', 'directSwappiness', 'direct_swappiness', value => String(value), value => parseInt(value, 10));
        bindZramRange('zram-used-limit-slider', 'zram-used-limit-value', 'zramUsedLimitMb', 'zram_used_limit_mb', value => `${value} MB`, value => parseInt(value, 10));
        bindZramRange('hybridswap-increase-slider', 'hybridswap-increase-value', 'hybridswapIncreaseMb', 'hybridswap_zram_increase', value => `${value} MB`, value => parseInt(value, 10));
        bindZramRange('hybridswap-quota-slider', 'hybridswap-quota-value', 'hybridswapQuotaGb', 'hybridswap_quota_day', value => `${value} GB`, value => parseInt(value, 10));
        document.getElementById('zram-priority-list')?.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', () => {
                const priorityList = document.getElementById('zram-priority-list');
                priorityList.querySelectorAll('.option-item').forEach(option => option.classList.remove('selected'));
                item.classList.add('selected');
                this.syncAnimatedOptionIndicator(priorityList);
                const editor = document.getElementById('zram-priority-custom-editor');
                const input = document.getElementById('zram-priority-custom-input');
                if (item.dataset.custom === '1') {
                    if (editor) editor.classList.add('visible');
                    if (input) {
                        input.value = String(this.state.zramPriority);
                        requestAnimationFrame(() => input.focus());
                    }
                    return;
                }
                if (editor) editor.classList.remove('visible');
                this.state.zramPriority = parseInt(item.dataset.value, 10) || 32758;
                this.markZramDirty('priority');
            });
        });
        const customPriorityInput = document.getElementById('zram-priority-custom-input');
        if (customPriorityInput) {
            customPriorityInput.addEventListener('input', (event) => {
                const value = parseInt(event.target.value, 10);
                if (Number.isFinite(value) && value >= -1 && value <= 32767) this.state.zramPriority = value;
            });
            customPriorityInput.addEventListener('change', (event) => {
                const value = parseInt(event.target.value, 10);
                if (!Number.isFinite(value) || value < -1 || value > 32767) {
                    event.target.value = String(this.state.zramPriority);
                    this.showToast(this.t('validationPriorityRange'), 'error');
                    return;
                }
                this.state.zramPriority = value;
                this.renderZramPriorityOptions();
                this.markZramDirty('priority');
            });
        }
        document.getElementById('zram-apply-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.applyZramImmediate();
        });
        document.getElementById('le9ec-switch').addEventListener('change', async (e) => { this.state.le9ecEnabled = e.target.checked; this.toggleLe9ecSettings(e.target.checked); await this.waitForUiPaint(); await this.saveLe9ecConfig(['enabled']); });
        document.getElementById('le9ec-anon-slider').addEventListener('input', (e) => { this.state.le9ecAnon = parseInt(e.target.value) * 1024; document.getElementById('le9ec-anon-value').textContent = `${e.target.value} MB`; });
        document.getElementById('le9ec-anon-slider').addEventListener('change', (e) => { this.state.le9ecAnon = parseInt(e.target.value) * 1024; if (this.state.le9ecEnabled) this.applyLe9ecImmediate(['anon_min']); else this.saveLe9ecConfig(['anon_min']); });
        document.getElementById('le9ec-clean-low-slider').addEventListener('input', (e) => { this.state.le9ecCleanLow = parseInt(e.target.value) * 1024; document.getElementById('le9ec-clean-low-value').textContent = `${e.target.value} MB`; });
        document.getElementById('le9ec-clean-low-slider').addEventListener('change', (e) => { this.state.le9ecCleanLow = parseInt(e.target.value) * 1024; if (this.state.le9ecEnabled) this.applyLe9ecImmediate(['clean_low']); else this.saveLe9ecConfig(['clean_low']); });
        document.getElementById('le9ec-clean-min-slider').addEventListener('input', (e) => { this.state.le9ecCleanMin = parseInt(e.target.value) * 1024; document.getElementById('le9ec-clean-min-value').textContent = `${e.target.value} MB`; });
        document.getElementById('le9ec-clean-min-slider').addEventListener('change', (e) => { this.state.le9ecCleanMin = parseInt(e.target.value) * 1024; if (this.state.le9ecEnabled) this.applyLe9ecImmediate(['clean_min']); else this.saveLe9ecConfig(['clean_min']); });
        document.getElementById('io-switch')?.addEventListener('change', async (e) => {
            this.state.ioEnabled = e.target.checked;
            const el = document.getElementById('io-current');
            if (el && !this.state.ioEnabled) el.textContent = '已禁用';
            await this.waitForUiPaint();
            await this.applyIOConfigImmediate('enabled', true);
        });
        document.getElementById('cpu-switch')?.addEventListener('change', async (e) => {
            this.state.cpuEnabled = e.target.checked;
            const el = document.getElementById('cpu-gov-current');
            if (el && !this.state.cpuEnabled) el.textContent = '已禁用';
            await this.waitForUiPaint();
            await this.applyCpuGovernorImmediate('enabled', true);
        });
        document.getElementById('tcp-switch')?.addEventListener('change', async (e) => {
            this.state.tcpEnabled = e.target.checked;
            const el = document.getElementById('tcp-current');
            if (el && !this.state.tcpEnabled) el.textContent = '已禁用';
            await this.waitForUiPaint();
            await this.applyTcpImmediate('enabled', true);
        });
        document.getElementById('vm-switch')?.addEventListener('change', async (e) => {
            this.state.vmEnabled = e.target.checked;
            const el = document.getElementById('vm-status');
            if (el) el.textContent = this.state.vmEnabled ? '已修改' : '已禁用';
            await this.waitForUiPaint();
            await this.applyVmConfig(['enabled'], true);
        });
    }
    resetUiLayout() {
        if (typeof this.forceCloseAllPanels === 'function') {
            this.forceCloseAllPanels();
        } else {
            document.querySelectorAll('.module-card-header.expanded, .sub-card-header.expanded, .sub-expandable-header.expanded').forEach(el => el.classList.remove('expanded'));
            document.querySelectorAll('.module-card-content, .sub-expandable-content').forEach(el => {
                el.classList.remove('expanded');
                el.classList.add('hidden');
                el.style.maxHeight = '0px';
                el.style.opacity = '0';
                el.style.overflow = 'hidden';
            });
        }
        const floatingHeader = document.getElementById('floating-header');
        if (floatingHeader) floatingHeader.classList.remove('visible', 'overlay-hidden');
    }
    initNavigationHistory() {
        if (this._navigationHistoryInitialized) return;
        this._navigationHistoryInitialized = true;
        const activePage = document.querySelector('.page.active')?.id === 'page-settings' ? 'settings' : 'home';
        window.history.replaceState({ coronaPage: activePage }, '', `#${activePage}`);
        window.addEventListener('popstate', event => {
            const targetPage = event.state?.coronaPage === 'settings' ? 'settings' : 'home';
            document.querySelectorAll('.detail-overlay.show').forEach(overlay => {
                if (overlay.id && typeof this.hideOverlay === 'function') this.hideOverlay(overlay.id);
            });
            this.switchPage(targetPage, { updateHistory: false }).catch(error => {
                console.error('system back navigation failed', error);
            });
        });
    }
    async prepareSettingsNavigation() {
        if (this.settingsReadyState === 'ready' && this.allSettingsSectionsPromise) return true;
        const loadingText = document.getElementById('loading')?.querySelector('.loading-text');
        const previousText = loadingText?.textContent || '';
        if (loadingText) loadingText.textContent = this.t('initSettings');
        this.showLoading(true);
        try {
            await this.ensureAllSettingsSectionsReady();
            return true;
        } catch (error) {
            console.error('settings initialization failed', error);
            this.showToast(this.t('settingsInitFailed'), 'error');
            return false;
        } finally {
            this.showLoading(false);
            if (loadingText) loadingText.textContent = previousText || this.t('processing');
        }
    }
    async switchPage(pageName, options = {}) {
        const updateHistory = options.updateHistory !== false;
        const pages = document.querySelectorAll('.page');
        const tabs = document.querySelectorAll('.tab-item');
        const slider = document.getElementById('tab-slider');
        const currentActive = document.querySelector('.page.active');
        const targetPage = document.getElementById(`page-${pageName}`);
        if (!targetPage || currentActive === targetPage) return;
        if (pageName === 'settings' && !await this.prepareSettingsNavigation()) return false;
        if (updateHistory && pageName === 'home' && window.history.state?.coronaPage === 'settings') {
            window.history.back();
            return;
        }
        // fully close half-open panels when going home / leaving settings
        if (pageName === 'home' || (currentActive && currentActive.id === 'page-settings')) {
            if (typeof this.forceCloseAllPanels === 'function') this.forceCloseAllPanels();
        }
        pages.forEach(p => p.classList.remove('left', 'right'));
        if (currentActive) {
            if (pageName === 'settings') { currentActive.classList.add('left'); slider.classList.add('right'); }
            else { currentActive.classList.add('right'); slider.classList.remove('right'); }
            currentActive.classList.remove('active');
            window.setTimeout(() => {
                if (!currentActive.classList.contains('active')) currentActive.classList.remove('left', 'right');
            }, 300);
        }
        targetPage.classList.add('active');
        tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.page === pageName));
        requestAnimationFrame(() => {
            const scroller = document.querySelector('.container');
            if (scroller) scroller.scrollTo({ top: 0, behavior: 'auto' });
            const activeTitle = pageName === 'settings' ? document.getElementById('corona-title-settings') : document.getElementById('corona-title');
            if (activeTitle) {
                activeTitle.style.opacity = '1';
                activeTitle.style.transform = 'translateY(0)';
            }
            const activeOverline = targetPage.querySelector('.title-overline');
            if (activeOverline) {
                activeOverline.style.opacity = '0.92';
                activeOverline.style.transform = 'translateY(0)';
            }
            const floatingHeader = document.getElementById('floating-header');
            if (floatingHeader) floatingHeader.classList.remove('visible', 'overlay-hidden');
        });
        if (pageName === 'home' && this.pendingChartDraw) {
            requestAnimationFrame(() => this.drawChart());
            this.pendingChartDraw = false;
        }
        if (updateHistory) {
            if (pageName === 'settings') {
                window.history.pushState({ coronaPage: 'settings' }, '', '#settings');
            } else {
                window.history.replaceState({ coronaPage: 'home' }, '', '#home');
            }
        }
    }
}

function rafThrottle(fn) {
    let scheduled = false;
    let lastArgs = null;
    let lastThis = null;
    return function() {
        lastArgs = arguments;
        lastThis = this;
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            fn.apply(lastThis, lastArgs);
        });
    };
}
function beginExpand() {}
function endExpand() {}
document.addEventListener('DOMContentLoaded', () => { window.corona = new CoronaAddon(); });
document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('app-hidden', document.hidden);
});
