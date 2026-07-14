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
        this.snapshotConfigFiles = ['zram.conf', 'le9ec.conf', 'io_scheduler.conf', 'cpu_governor.conf', 'cpu_hotplug.conf', 'tcp.conf', 'process_priority.conf', 'thread_priority.conf', 'swap.conf', 'vm.conf', 'kernel.conf', 'corona_kernel.conf'];
        this.state = {
            algorithm: 'lz4',
            recompAlgorithm1: 'none',
            recompAlgorithm2: 'none',
            recompAlgorithm3: 'none',
            zstdCompressionLevel: 1,
            zramSize: 8,
            swappiness: 100,
            zramWriteback: 'default',
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
            theme: 'gold',
            accent: 'blue',
            hue: 214,
            changePreviewEnabled: true,
            showSettingDescriptions: true,
            showCategoryConfigToggles: true,
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
        this.zramFeatures = { multiComp: false, zstdLevel: false };
        this.isCoronaKernel = false;
        this.localKernelWorkflowBuild = 0;
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
        this.realtimeBusy = false;
        this.realtimeTick = 0;
        this.isInitializing = true;
        this.lightweightUi = true;
        this.pendingChartDraw = false;
        this.prevCpuStat = null;
        this.deferredHomeReady = false;
        this.settingsUiInitialized = false;
        this.settingsDataLoaded = false;
        this.settingsInitPromise = null;
        this.featureScriptPromises = {};
        this.parameterSnapshots = [];
        this.dom = {};
        this.initDOMCache();
        this.init();
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
            'zram-raw-size', 'zram-bd-write', 'zram-bd-read', 'zram-bd-count', 'zram-total-writes', 'zram-total-reads', 'zram-compr-size', 'zram-mem-used', 'zram-compr-ratio', 'zram-backing-dev', 'zram-bd-io',
            'hyb-enable', 'hyb-loop', 'hyb-zst', 'hyb-zsu', 'hyb-est', 'hyb-esu', 'hyb-reclaimin', 'hyb-batchout', 'hyb-swapd-wakeup',
            'zstd-level-slider', 'zstd-level-value',
            'swap-status', 'swap-current-status', 'swap-current-size', 'swap-size-value', 'swap-io-in', 'swap-io-out',
            'vm-status', 'lru-status'
        ];
        ids.forEach(id => { this.dom[id] = document.getElementById(id); });
    }
    $(id) { return this.dom[id] || (this.dom[id] = document.getElementById(id)); }
    getFeatureScriptPath(name) {
        const map = {
            'app-policy': 'js/app-policy.js',
            'priority-thread': 'js/priority-thread.js',
            'memory-opt': 'js/memory-opt.js',
            'le9ec': 'js/le9ec.js',
            'memory-core': 'js/memory-core.js',
            'settings-memory-page': 'js/settings-memory-page.js',
            'settings-ui': 'js/settings-ui.js',
            'home-ui': 'js/home-ui.js',
            'custom-scripts': 'js/custom-scripts.js',
            'corona-kernel': 'js/corona-kernel.js'
        };
        return map[name] || '';
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
        await this.resolvePaths();
        await this.ensureFeatureScript('settings-ui');
        await this.ensureFeatureScript('home-ui');
        await this.ensureFeatureScript('memory-core');
        await this.ensureFeatureScript('settings-memory-page');
        this.showInitOverlay(true, this.t('initDefault'));
        try {
            this.updateInitOverlayMessage(this.t('initResolve'));
            const brand = (await this.exec('getprop ro.product.brand')).toLowerCase();
            const manufacturer = (await this.exec('getprop ro.product.manufacturer')).toLowerCase();
            const allowedBrands = new Set(['oneplus', 'oplus', 'oppo', 'realme']);
            if (!allowedBrands.has(brand) && !allowedBrands.has(manufacturer)) {
                this.showUnsupportedDevice(brand || manufacturer);
                return;
            }
            this.updateInitOverlayMessage(this.t('initPrepare'));
            await this.ensureConfigDir();
            await this.loadRuntimeConfig();
            await this.loadAppMetaCache();
            const coronaNodeValue = (await this.exec('cat /proc/corona 2>/dev/null')).trim();
            this.isCoronaKernel = /^\d+$/.test(coronaNodeValue) && parseInt(coronaNodeValue, 10) > 0;
            this.initTheme();
            this.initChangePreviewPreference();
            this.initSettingDescriptionPreference();
            this.initCategoryConfigVisibilityPreference();
            this.bindAllEvents();
            this.updateInitOverlayMessage(this.t('initDevice'));
            await this.loadDeviceInfo();
            await this.loadModuleVersion();
            this.initDetailOverlays();
            this.initHomeCardClicks();
            this.initChart();
            this.updateInitOverlayMessage(this.t('initSettings'));
            await this.ensureSettingsPageReady(true);
            this.initStaticHeader();
            this.initScrollEffect();
            this.initModuleIntro();
            this.updateInitOverlayMessage(this.t('initRealtime'));
            await this.awaitInitialRealtimeReady();
            this.startRealtimeMonitor();
            this.schedulePostInitWarmup();
        } finally {
            this.isInitializing = false;
            this.showInitOverlay(false);
        }
    }
    schedulePostInitWarmup() {
        // deferred home interactions (author popup, banner drag, etc.)
        if (typeof this.scheduleDeferredInit === 'function') {
            this.scheduleDeferredInit();
        } else if (typeof this.initEasterEgg === 'function') {
            try { this.initEasterEgg(); } catch (e) {}
        }
    }
    updateSliderProgress(slider) {
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        const percent = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
        // fixed white translucent track — independent of theme primary color
        const isDark = document.body.classList.contains('theme-dark');
        const filledColor = isDark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.72)';
        const emptyColor = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.28)';
        slider.style.background = `linear-gradient(to right, ${filledColor} 0%, ${filledColor} ${percent}%, ${emptyColor} ${percent}%, ${emptyColor} 100%)`;
    }
    initSliderProgress() {
        const throttled = rafThrottle((slider) => this.updateSliderProgress(slider));
        document.querySelectorAll('.range-slider').forEach(slider => {
            this.updateSliderProgress(slider);
            slider.addEventListener('input', () => throttled(slider));
        });
    }
    async exec(cmd) {
        return new Promise((resolve) => {
            const callbackId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            const timeout = setTimeout(() => { delete window[callbackId]; resolve(''); }, 12000);
            window[callbackId] = (code, stdout, stderr) => { clearTimeout(timeout); delete window[callbackId]; resolve(stdout ? stdout.trim() : ''); };
            try { ksu.exec(cmd, '{}', callbackId); } catch (e) { clearTimeout(timeout); delete window[callbackId]; resolve(''); }
        });
    }
    shellQuote(value) {
        return `'${String(value).replace(/'/g, `'\\''`)}'`;
    }
    async writeConfig(filename, content) {
        const path = `${this.configDir}/${filename}`;
        const b64 = btoa(unescape(encodeURIComponent(String(content))));
        await this.exec(`echo '${b64}' | base64 -d > ${this.shellQuote(path)}`);
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
        return entries
            .filter(item => Array.isArray(item) && item[0])
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
    }
    async buildMergedConfigContent(filename, updates, order = []) {
        const path = `${this.configDir}/${filename}`;
        const current = await this.exec(`cat ${this.shellQuote(path)} 2>/dev/null`);
        const map = new Map(this.parseSimpleConfig(current));
        Object.entries(updates || {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') map.delete(key);
            else map.set(key, String(value));
        });
        const keys = [...new Set([...order, ...map.keys()])].filter(key => map.has(key));
        return this.buildSimpleConfig(keys.map(key => [key, map.get(key)]));
    }
    async mergeConfigFile(filename, updates, order = []) {
        const content = await this.buildMergedConfigContent(filename, updates, order);
        await this.writeConfig(filename, content);
        return content;
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
            if (version !== 9 || !source || typeof source !== 'object' || Array.isArray(source)) return;
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
        const payload = JSON.stringify({ __version: 9, apps: this.appMetaCache || {} });
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
            this.markZramDirty();
        });
        document.getElementById('zram-size-slider').addEventListener('input', (e) => {
            this.state.zramSize = parseFloat(e.target.value);
            document.getElementById('zram-size-value').textContent = `${this.state.zramSize.toFixed(2)} GB`;
        });
        document.getElementById('zram-size-slider').addEventListener('change', (e) => {
            this.state.zramSize = parseFloat(e.target.value);
            this.markZramDirty();
        });
        document.getElementById('swappiness-slider').addEventListener('input', (e) => {
            this.state.swappiness = parseInt(e.target.value);
            document.getElementById('swappiness-value').textContent = this.state.swappiness;
        });
        document.getElementById('swappiness-slider').addEventListener('change', (e) => {
            this.state.swappiness = parseInt(e.target.value);
            this.markZramDirty();
        });
        document.getElementById('zram-apply-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.applyZramImmediate();
        });
        document.getElementById('le9ec-switch').addEventListener('change', async (e) => { this.state.le9ecEnabled = e.target.checked; this.toggleLe9ecSettings(e.target.checked); await this.saveLe9ecConfig(['enabled']); });
        document.getElementById('le9ec-anon-slider').addEventListener('input', (e) => { this.state.le9ecAnon = parseInt(e.target.value) * 1024; document.getElementById('le9ec-anon-value').textContent = `${e.target.value} MB`; });
        document.getElementById('le9ec-anon-slider').addEventListener('change', (e) => { this.state.le9ecAnon = parseInt(e.target.value) * 1024; if (this.state.le9ecEnabled) this.applyLe9ecImmediate(['anon_min']); else this.saveLe9ecConfig(['anon_min']); });
        document.getElementById('le9ec-clean-low-slider').addEventListener('input', (e) => { this.state.le9ecCleanLow = parseInt(e.target.value) * 1024; document.getElementById('le9ec-clean-low-value').textContent = `${e.target.value} MB`; });
        document.getElementById('le9ec-clean-low-slider').addEventListener('change', (e) => { this.state.le9ecCleanLow = parseInt(e.target.value) * 1024; if (this.state.le9ecEnabled) this.applyLe9ecImmediate(['clean_low']); else this.saveLe9ecConfig(['clean_low']); });
        document.getElementById('le9ec-clean-min-slider').addEventListener('input', (e) => { this.state.le9ecCleanMin = parseInt(e.target.value) * 1024; document.getElementById('le9ec-clean-min-value').textContent = `${e.target.value} MB`; });
        document.getElementById('le9ec-clean-min-slider').addEventListener('change', (e) => { this.state.le9ecCleanMin = parseInt(e.target.value) * 1024; if (this.state.le9ecEnabled) this.applyLe9ecImmediate(['clean_min']); else this.saveLe9ecConfig(['clean_min']); });
        document.getElementById('io-switch')?.addEventListener('change', async (e) => {
            this.state.ioEnabled = e.target.checked;
            await this.applyIOConfigImmediate('enabled', true);
            const el = document.getElementById('io-current');
            if (el && !this.state.ioEnabled) el.textContent = '已禁用';
        });
        document.getElementById('cpu-switch')?.addEventListener('change', async (e) => {
            this.state.cpuEnabled = e.target.checked;
            await this.applyCpuGovernorImmediate('enabled', true);
            if (this.state.cpuEnabled) await this.applyCpuHotplugConfigImmediate();
            const el = document.getElementById('cpu-gov-current');
            if (el && !this.state.cpuEnabled) el.textContent = '已禁用';
        });
        document.getElementById('tcp-switch')?.addEventListener('change', async (e) => {
            this.state.tcpEnabled = e.target.checked;
            await this.applyTcpImmediate('enabled', true);
            const el = document.getElementById('tcp-current');
            if (el && !this.state.tcpEnabled) el.textContent = '已禁用';
        });
        document.getElementById('vm-switch')?.addEventListener('change', async (e) => {
            this.state.vmEnabled = e.target.checked;
            await this.applyVmConfig(['enabled'], true);
            const el = document.getElementById('vm-status');
            if (el) el.textContent = this.state.vmEnabled ? '已修改' : '已禁用';
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
    async switchPage(pageName) {
        const pages = document.querySelectorAll('.page');
        const tabs = document.querySelectorAll('.tab-item');
        const slider = document.getElementById('tab-slider');
        const currentActive = document.querySelector('.page.active');
        const targetPage = document.getElementById(`page-${pageName}`);
        if (!targetPage || currentActive === targetPage) return;
        // fully close half-open panels when going home / leaving settings
        if (pageName === 'home' || (currentActive && currentActive.id === 'page-settings')) {
            if (typeof this.forceCloseAllPanels === 'function') this.forceCloseAllPanels();
        }
        pages.forEach(p => p.classList.remove('left', 'right'));
        if (currentActive) {
            if (pageName === 'settings') { currentActive.classList.add('left'); slider.classList.add('right'); }
            else { currentActive.classList.add('right'); slider.classList.remove('right'); }
            currentActive.classList.remove('active');
        }
        targetPage.classList.add('active');
        tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.page === pageName));
        requestAnimationFrame(() => {
            const scroller = document.querySelector('.container');
            if (scroller) scroller.scrollTo({ top: 0, behavior: 'auto' });
            requestAnimationFrame(() => {
                const activeScroller = document.querySelector('.container');
                if (activeScroller) activeScroller.scrollTo({ top: 0, behavior: 'auto' });
            });
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
        if (pageName === 'settings' && (!this.settingsUiInitialized || !this.settingsDataLoaded)) {
            this.ensureSettingsPageReady().catch(e => console.error('ensureSettingsPageReady failed', e));
        }
        if (pageName === 'home' && this.pendingChartDraw) {
            requestAnimationFrame(() => this.drawChart());
            this.pendingChartDraw = false;
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
