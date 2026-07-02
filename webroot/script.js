class CoronaAddon {
    constructor() {
        this.moduleId = '';
        this.modDir = '';
        this.configDir = '';
        this.runtimeConfig = { swapPath: '' };
        this.algorithms = [];
        this.readaheadOptions = [128, 256, 384, 512, 768, 1024, 2048, 4096];
        this.ioNrRequestsOptions = [64, 128, 256, 512, 1024, 2048];
        this.ioRqAffinityOptions = [0, 1, 2];
        this.ioNomergesOptions = [0, 1, 2];
        this.snapshotConfigFiles = ['zram.conf', 'le9ec.conf', 'io_scheduler.conf', 'cpu_governor.conf', 'cpu_hotplug.conf', 'tcp.conf', 'process_priority.conf', 'thread_priority.conf', 'swap.conf', 'vm.conf', 'kernel.conf', 'corona_kernel.conf'];
        this.state = {
            algorithm: 'lz4',
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
        this.isCoronaKernel = false;
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
            'swap-status', 'swap-current-status', 'swap-current-size', 'swap-size-value',
            'vm-status', 'lru-status'
        ];
        ids.forEach(id => { this.dom[id] = document.getElementById(id); });
    }
    $(id) { return this.dom[id] || (this.dom[id] = document.getElementById(id)); }
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
        this.showInitOverlay(true);
        try {
            await this.resolvePaths();
            const brand = (await this.exec('getprop ro.product.brand')).toLowerCase();
            const manufacturer = (await this.exec('getprop ro.product.manufacturer')).toLowerCase();
            if (brand !== 'oneplus' && manufacturer !== 'oneplus' && brand !== 'oplus' && manufacturer !== 'oplus') {
                this.showUnsupportedDevice(brand || manufacturer);
                return;
            }
            await this.ensureConfigDir();
            await this.loadRuntimeConfig();
            await this.loadAppMetaCache();
            this.isCoronaKernel = (await this.exec('cat /proc/corona 2>/dev/null')).trim() === '1';
            this.initTheme();
            this.initChangePreviewPreference();
            this.initSettingDescriptionPreference();
            this.initCategoryConfigVisibilityPreference();
            this.bindAllEvents();
            await this.loadDeviceInfo();
            await this.loadModuleVersion();
            this.initDetailOverlays();
            this.initHomeCardClicks();
            this.initChart();
            if (!this.lightweightUi) {
                this.initScrollEffect();
            } else {
                this.initStaticHeader();
            }
            this.initModuleIntro();
            await this.ensureSettingsPageReady(true);
            await Promise.all([
                this.updateRealtimeData(true)
            ]);
            this.startRealtimeMonitor();
            this.scheduleDeferredInit();
        } finally {
            this.isInitializing = false;
            this.showInitOverlay(false);
        }
    }
    updateSliderProgress(slider) {
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        const percent = ((val - min) / (max - min)) * 100;
        const styles = getComputedStyle(document.body);
        const isDark = document.body.classList.contains('theme-dark');
        const isPurple = slider.closest('.priority-nice-slider-container');
        const filledColor = isPurple ? 'rgba(156, 39, 176, 0.8)' : (styles.getPropertyValue('--primary').trim() || 'rgba(52, 130, 255, 0.8)');
        const emptyColor = isDark ? 'rgba(255, 255, 255, 0.15)' : (isPurple ? 'rgba(156, 39, 176, 0.12)' : (styles.getPropertyValue('--primary-dim').trim() || 'rgba(52, 130, 255, 0.12)'));
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
        this.ensureAppPolicyState();
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
        this.ensureAppPolicyState();
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
        if (!confirmed && typeof options.onCancel === 'function') {
            await options.onCancel();
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
    initTheme() {
        const savedTheme = localStorage.getItem('corona_theme') || 'light';
        const normalizedTheme = savedTheme === 'auto' ? 'light' : savedTheme;
        this.state.theme = normalizedTheme;
        if (normalizedTheme !== savedTheme) {
            localStorage.setItem('corona_theme', normalizedTheme);
        }
        this.applyTheme(normalizedTheme);
    }
    initChangePreviewPreference() {
        const saved = localStorage.getItem('corona_change_preview');
        this.setChangePreviewEnabled(saved === null ? true : saved === '1');
    }
    setChangePreviewEnabled(enabled, persist = false) {
        const normalized = !!enabled;
        this.state.changePreviewEnabled = normalized;
        if (persist) {
            localStorage.setItem('corona_change_preview', normalized ? '1' : '0');
        }
        const toggle = document.getElementById('change-preview-switch');
        if (toggle) toggle.checked = normalized;
    }
    initSettingDescriptionPreference() {
        const saved = localStorage.getItem('corona_setting_descriptions');
        this.setSettingDescriptionsEnabled(saved === null ? true : saved === '1');
    }
    setSettingDescriptionsEnabled(enabled, persist = false) {
        const normalized = !!enabled;
        this.state.showSettingDescriptions = normalized;
        document.body.classList.toggle('setting-descriptions-hidden', !normalized);
        if (persist) {
            localStorage.setItem('corona_setting_descriptions', normalized ? '1' : '0');
        }
        const toggle = document.getElementById('setting-descriptions-switch');
        if (toggle) toggle.checked = normalized;
    }
    initCategoryConfigVisibilityPreference() {
        const saved = localStorage.getItem('corona_category_config_toggles');
        this.setCategoryConfigVisibility(saved === null ? true : saved === '1');
    }
    setCategoryConfigVisibility(enabled, persist = false) {
        const normalized = !!enabled;
        this.state.showCategoryConfigToggles = normalized;
        document.querySelectorAll('.category-config-toggle').forEach(item => item.classList.toggle('hidden', !normalized));
        if (persist) {
            localStorage.setItem('corona_category_config_toggles', normalized ? '1' : '0');
        }
        const toggle = document.getElementById('category-config-visibility-switch');
        if (toggle) toggle.checked = normalized;
    }
    applyTheme(theme) {
        const body = document.body;
        const normalizedTheme = theme === 'auto' ? 'light' : theme;
        body.classList.remove('theme-light', 'theme-dark', 'theme-gold');
        body.classList.add(`theme-${normalizedTheme}`);
        document.querySelectorAll('.range-slider').forEach(slider => this.updateSliderProgress(slider));
    }
    initThemeSelector() {
        const themeOptions = document.querySelectorAll('.theme-option');
        themeOptions.forEach(opt => {
            if (opt.dataset.theme === this.state.theme) { opt.classList.add('selected'); } else { opt.classList.remove('selected'); }
            opt.addEventListener('click', () => {
                themeOptions.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                this.state.theme = opt.dataset.theme;
                localStorage.setItem('corona_theme', this.state.theme);
                this.applyTheme(this.state.theme);
                this.showToast(`主题已切换: ${opt.querySelector('span').textContent}`);
            });
        });
    }
    initChangePreviewToggle() {
        const toggle = document.getElementById('change-preview-switch');
        if (!toggle) return;
        toggle.checked = !!this.state.changePreviewEnabled;
        toggle.addEventListener('change', () => {
            this.setChangePreviewEnabled(toggle.checked, true);
            this.showToast(`变更预览已${toggle.checked ? '开启' : '关闭'}`);
        });
    }
    initSettingDescriptionToggle() {
        const toggle = document.getElementById('setting-descriptions-switch');
        if (!toggle) return;
        toggle.checked = !!this.state.showSettingDescriptions;
        toggle.addEventListener('change', () => {
            this.setSettingDescriptionsEnabled(toggle.checked, true);
            this.showToast(`设置说明已${toggle.checked ? '显示' : '隐藏'}`);
        });
    }
    initCategoryConfigVisibilityToggle() {
        const toggle = document.getElementById('category-config-visibility-switch');
        if (!toggle) return;
        this.setCategoryConfigVisibility(this.state.showCategoryConfigToggles);
        toggle.addEventListener('change', () => {
            this.setCategoryConfigVisibility(toggle.checked, true);
            this.showToast(`分类配置已${toggle.checked ? '显示' : '隐藏'}`);
        });
    }
    initSnapshots() {
        const saveBtn = document.getElementById('snapshot-save-btn');
        if (saveBtn) saveBtn.addEventListener('click', () => this.createParameterSnapshot());
        this.renderParameterSnapshots();
    }
    async loadParameterSnapshots() {
        const path = `${this.configDir}/parameter_snapshots.b64`;
        const base64Data = await this.exec(`cat ${this.shellQuote(path)} 2>/dev/null`);
        this.parameterSnapshots = [];
        if (base64Data && base64Data.trim()) {
            try {
                const json = decodeURIComponent(escape(atob(base64Data.trim())));
                const parsed = JSON.parse(json);
                const rawSnapshots = Array.isArray(parsed)
                    ? parsed
                    : (parsed && Array.isArray(parsed.snapshots) ? parsed.snapshots : []);
                this.parameterSnapshots = rawSnapshots
                    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
                    .map(item => {
                        const files = item.files && typeof item.files === 'object' && !Array.isArray(item.files)
                            ? item.files
                            : {};
                        return {
                            id: String(item.id || `snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
                            name: String(item.name || '未命名快照'),
                            createdAt: item.createdAt || new Date().toISOString(),
                            files,
                            meta: item.meta && typeof item.meta === 'object' && !Array.isArray(item.meta)
                                ? item.meta
                                : { includedCount: Object.keys(files).length }
                        };
                    })
                    .filter(item => Object.keys(item.files).length > 0)
                    .slice(0, 20);
            } catch (e) {
                this.parameterSnapshots = [];
            }
        }
        this.renderParameterSnapshots();
        this.updateSnapshotStatus();
    }
    async saveParameterSnapshots() {
        const path = `${this.configDir}/parameter_snapshots.b64`;
        const payload = { version: 1, snapshots: this.parameterSnapshots };
        const base64Data = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
        await this.exec(`echo '${base64Data}' > ${this.shellQuote(path)}`);
    }
    updateSnapshotStatus(message = '') {
        const status = document.getElementById('snapshot-status');
        if (!status) return;
        if (message) {
            status.textContent = message;
            return;
        }
        status.textContent = this.parameterSnapshots.length > 0
            ? `共 ${this.parameterSnapshots.length} 个快照；当前仅恢复配置状态，不会自动全量立即应用。`
            : '当前仅保存配置状态，恢复后不会自动全量立即应用。';
    }
    formatSnapshotTime(timestamp) {
        const d = new Date(timestamp);
        if (Number.isNaN(d.getTime())) return '时间未知';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    renderParameterSnapshots() {
        const container = document.getElementById('snapshot-list');
        if (!container) return;
        const snapshots = Array.isArray(this.parameterSnapshots) ? this.parameterSnapshots : [];
        if (snapshots.length === 0) {
            container.innerHTML = '<div class="scripts-empty">暂无参数快照</div>';
            return;
        }
        container.innerHTML = snapshots.map(snapshot => `
            <div class="script-item" data-snapshot-id="${this.escapeHtml(snapshot.id || '')}">
                <div class="script-info">
                    <div class="script-header">
                        <span class="script-name">${this.escapeHtml(snapshot.name || '未命名快照')}</span>
                    </div>
                    <div class="snapshot-item-meta">
                        <span>${this.escapeHtml(this.formatSnapshotTime(snapshot.createdAt))}</span>
                        <span>${Object.keys(snapshot.files || {}).length} 个配置</span>
                    </div>
                </div>
                <div class="script-actions">
                    <button class="script-action-btn toggle" data-action="restore" data-snapshot-id="${this.escapeHtml(snapshot.id || '')}" title="恢复">↺</button>
                    <button class="script-action-btn delete" data-action="delete" data-snapshot-id="${this.escapeHtml(snapshot.id || '')}" title="删除">✕</button>
                </div>
            </div>
        `).join('');
        container.querySelectorAll('[data-action="restore"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.restoreParameterSnapshot(btn.dataset.snapshotId);
            });
        });
        container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteParameterSnapshot(btn.dataset.snapshotId);
            });
        });
    }
    async collectSnapshotFiles() {
        const entries = await Promise.all(this.snapshotConfigFiles.map(async (filename) => {
            const content = await this.exec(`cat ${this.shellQuote(`${this.configDir}/${filename}`)} 2>/dev/null`);
            return content && content.trim() ? [filename, content.trim()] : null;
        }));
        return Object.fromEntries(entries.filter(Boolean));
    }
    async createParameterSnapshot() {
        return this.withLock('parameter-snapshots', async () => {
            const files = await this.collectSnapshotFiles();
            const filenames = Object.keys(files);
            if (filenames.length === 0) {
                this.showToast('当前没有可保存的配置');
                return false;
            }
            const name = `快照 ${this.parameterSnapshots.length + 1}`;
            const confirmed = await this.confirmChangePreview('保存快照', {
                summary: `即将保存参数快照 ${name}。`,
                configs: filenames.map(filename => ({ filename, content: files[filename] })),
                notes: ['仅保存配置文件内容，不会立即改动当前运行状态。']
            });
            if (!confirmed) return false;
            this.parameterSnapshots = [{
                id: `snapshot_${Date.now()}`,
                name,
                createdAt: new Date().toISOString(),
                files,
                meta: { includedCount: filenames.length }
            }, ...this.parameterSnapshots].slice(0, 20);
            await this.saveParameterSnapshots();
            this.renderParameterSnapshots();
            this.updateSnapshotStatus();
            this.showToast('参数快照已保存');
            return true;
        });
    }
    async reloadSnapshotTargets() {
        await this.loadAllConfigs();
        await this.loadSwapConfig();
        await this.loadVmConfig();
        await this.loadKernelFeaturesConfig();
        await this.loadCoronaKernelConfig();
    }
    async restoreParameterSnapshot(snapshotId) {
        return this.withLock('parameter-snapshots', async () => {
            const snapshot = this.parameterSnapshots.find(item => item.id === snapshotId);
            if (!snapshot) {
                this.showToast('快照不存在');
                return false;
            }
            const files = snapshot.files || {};
            const filenames = Object.keys(files);
            if (filenames.length === 0) {
                this.showToast('该快照没有可恢复内容');
                return false;
            }
            const confirmed = await this.confirmChangePreview('恢复快照', {
                summary: `即将恢复参数快照 ${snapshot.name || '未命名快照'}。`,
                configs: filenames.map(filename => ({ filename, content: files[filename] })),
                notes: ['本次只恢复配置状态；部分立即生效项如需完全体现，仍可能需要手动应用或重启。']
            });
            if (!confirmed) return false;
            this.showLoading(true);
            try {
                for (const filename of filenames) {
                    await this.writeConfig(filename, files[filename]);
                }
                await this.reloadSnapshotTargets();
            } finally {
                this.showLoading(false);
            }
            this.showToast('参数快照已恢复');
            return true;
        });
    }
    async deleteParameterSnapshot(snapshotId) {
        return this.withLock('parameter-snapshots', async () => {
            const snapshot = this.parameterSnapshots.find(item => item.id === snapshotId);
            if (!snapshot) return false;
            const confirmed = await this.showConfirm(`确定要删除快照 "${snapshot.name || '未命名快照'}" 吗？`, '删除快照');
            if (!confirmed) return false;
            this.parameterSnapshots = this.parameterSnapshots.filter(item => item.id !== snapshotId);
            await this.saveParameterSnapshots();
            this.renderParameterSnapshots();
            this.updateSnapshotStatus();
            this.showToast('参数快照已删除');
            return true;
        });
    }
    initChart() {
        this.chartCanvas = document.getElementById('history-chart');
        this.chartCtx = this.chartCanvas ? this.chartCanvas.getContext('2d') : null;
        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.chartType = btn.dataset.type;
                this.drawChart();
            });
        });
    }
    updateHistoryData(cpuUsage, memUsage, cpuTemp, batteryTemp) {
        const now = Date.now();
        this.historyData.cpu.push({ time: now, value: cpuUsage });
        this.historyData.mem.push({ time: now, value: memUsage });
        this.historyData.cpuTemp.push({ time: now, value: cpuTemp });
        this.historyData.batteryTemp.push({ time: now, value: batteryTemp });
        if (this.historyData.cpu.length > this.maxHistoryPoints) {
            this.historyData.cpu.shift(); this.historyData.mem.shift();
            this.historyData.cpuTemp.shift(); this.historyData.batteryTemp.shift();
        }
        if (document.getElementById('page-home')?.classList.contains('active')) {
            this.pendingChartDraw = false;
            this.drawChart();
        } else {
            this.pendingChartDraw = true;
        }
    }
    drawChart() {
        if (!this.chartCtx) return;
        const homeActive = document.getElementById('page-home')?.classList.contains('active');
        if (!homeActive) { this.pendingChartDraw = true; return; }
        const canvas = this.chartCanvas;
        const ctx = this.chartCtx;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const width = rect.width;
        const height = rect.height;
        ctx.clearRect(0, 0, width, height);
        const styles = getComputedStyle(document.body);
        const textMain = styles.getPropertyValue('--text-main').trim() || '#1A1A1A';
        const textSub = styles.getPropertyValue('--text-sub').trim() || '#6E6E6E';
        const primaryColor = styles.getPropertyValue('--primary').trim() || '#3482FF';
        const primaryDim = styles.getPropertyValue('--primary-dim').trim() || 'rgba(52, 130, 255, 0.2)';
        let data = [], maxVal = 100, unit = '%', color1 = primaryColor, color2 = primaryDim, label = 'CPU 使用率';
        if (this.chartType === 'cpu') { data = this.historyData.cpu.map(d => d.value); label = 'CPU 使用率'; }
        else if (this.chartType === 'mem') { data = this.historyData.mem.map(d => d.value); label = '内存使用率'; color1 = '#00C853'; color2 = 'rgba(0, 200, 83, 0.2)'; }
        else if (this.chartType === 'temp') {
            const cpuData = this.historyData.cpuTemp.map(d => d.value);
            const battData = this.historyData.batteryTemp.map(d => d.value);
            maxVal = Math.max(60, ...cpuData, ...battData);
            unit = '°C';
            this.drawMultiLineChart(ctx, width, height, [{ data: cpuData, color: '#F44336', label: 'CPU' }, { data: battData, color: '#FF9800', label: '电池' }], maxVal, unit);
            return;
        }
        if (data.length < 2) { ctx.fillStyle = textSub; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('收集数据中...', width / 2, height / 2); return; }
        const padding = { top: 10, right: 10, bottom: 25, left: 35 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        ctx.strokeStyle = 'rgba(128,128,128,0.1)'; ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) { const y = padding.top + (chartHeight / 4) * i; ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke(); }
        ctx.fillStyle = textSub; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) { const val = Math.round(maxVal - (maxVal / 4) * i); const y = padding.top + (chartHeight / 4) * i; ctx.fillText(`${val}${unit}`, padding.left - 5, y + 3); }
        const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
        gradient.addColorStop(0, color2); gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        const stepX = chartWidth / (data.length - 1);
        ctx.moveTo(padding.left, height - padding.bottom);
        data.forEach((val, i) => { const x = padding.left + i * stepX; const y = padding.top + chartHeight - (val / maxVal) * chartHeight; ctx.lineTo(x, y); });
        ctx.lineTo(padding.left + (data.length - 1) * stepX, height - padding.bottom);
        ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = color1; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        data.forEach((val, i) => { const x = padding.left + i * stepX; const y = padding.top + chartHeight - (val / maxVal) * chartHeight; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.stroke();
        const lastVal = data[data.length - 1];
        const lastX = padding.left + (data.length - 1) * stepX;
        const lastY = padding.top + chartHeight - (lastVal / maxVal) * chartHeight;
        ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2); ctx.fillStyle = color1; ctx.fill();
        ctx.fillStyle = textMain; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(`${label}: ${lastVal.toFixed(1)}${unit}`, padding.left, height - 5);
    }
    drawMultiLineChart(ctx, width, height, series, maxVal, unit) {
        const styles = getComputedStyle(document.body);
        const textMain = styles.getPropertyValue('--text-main').trim() || '#1A1A1A';
        const textSub = styles.getPropertyValue('--text-sub').trim() || '#6E6E6E';
        const padding = { top: 10, right: 10, bottom: 25, left: 35 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        ctx.strokeStyle = 'rgba(128,128,128,0.1)'; ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) { const y = padding.top + (chartHeight / 4) * i; ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke(); }
        ctx.fillStyle = textSub; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) { const val = Math.round(maxVal - (maxVal / 4) * i); const y = padding.top + (chartHeight / 4) * i; ctx.fillText(`${val}${unit}`, padding.left - 5, y + 3); }
        series.forEach(s => {
            if (s.data.length < 2) return;
            const stepX = chartWidth / (s.data.length - 1);
            ctx.beginPath(); ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            s.data.forEach((val, i) => { const x = padding.left + i * stepX; const y = padding.top + chartHeight - (val / maxVal) * chartHeight; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
            ctx.stroke();
            if (s.data.length > 0) {
                const lastVal = s.data[s.data.length - 1];
                const lastX = padding.left + (s.data.length - 1) * stepX;
                const lastY = padding.top + chartHeight - (lastVal / maxVal) * chartHeight;
                ctx.beginPath(); ctx.arc(lastX, lastY, 3, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill();
            }
        });
        let legendX = padding.left;
        ctx.font = '11px sans-serif';
        series.forEach(s => {
            if (s.data.length > 0) {
                const lastVal = s.data[s.data.length - 1];
                ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(legendX + 5, height - 10, 4, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = textMain; ctx.textAlign = 'left';
                ctx.fillText(`${s.label}: ${lastVal.toFixed(1)}${unit}`, legendX + 12, height - 5);
                legendX += ctx.measureText(`${s.label}: ${lastVal.toFixed(1)}${unit}`).width + 25;
            }
        });
    }
    initExpandableCards() {
        const cards = [
            { toggle: 'memory-compression-toggle', content: 'memory-compression-content', onExpand: null },
            { toggle: 'le9ec-toggle', content: 'le9ec-content', onExpand: () => this.loadLe9ecStatus() },
            { toggle: 'io-scheduler-toggle', content: 'io-scheduler-content', onExpand: null },
            { toggle: 'cpu-governor-toggle', content: 'cpu-governor-content', onExpand: null },
            { toggle: 'app-policy-toggle', content: 'app-policy-content', onExpand: () => { this.renderAppPolicySummary(); } },
            { toggle: 'tcp-toggle', content: 'tcp-content', onExpand: null },
            { toggle: 'custom-scripts-toggle', content: 'custom-scripts-content', onExpand: null },
            { toggle: 'system-opt-toggle', content: 'system-opt-content', onExpand: null },
            { toggle: 'corona-kernel-toggle', content: 'corona-kernel-content', onExpand: () => this.loadCoronaKernelConfig() },
            { toggle: 'app-settings-toggle', content: 'app-settings-content', onExpand: null }
        ];
        cards.forEach(card => {
            const toggle = document.getElementById(card.toggle);
            const content = document.getElementById(card.content);
            if (toggle && content) {
                content.classList.remove('hidden');
                content.classList.remove('expanded');
                toggle.classList.remove('expanded');
                toggle.addEventListener('click', () => {
                    const isExpanded = content.classList.contains('expanded');
                    const cardEl = toggle.closest('.module-card');
                    if (cardEl) cardEl.classList.add('expanding');
                    if (content._anim) {
                        content.removeEventListener('transitionend', content._anim);
                        content._anim = null;
                        content.style.removeProperty('overflow');
                        endExpand();
                    }
                    beginExpand();
                    content.style.setProperty('overflow', 'hidden', 'important');
                    if (isExpanded) {
                        if (content.id === 'memory-compression-content') {
                            this.collapseMemoryCompressionChildren(content);
                        }
                        const h = content.scrollHeight;
                        content.style.maxHeight = h + 'px';
                        content.offsetHeight;
                        content.classList.remove('expanded');
                        toggle.classList.remove('expanded');
                        content.style.maxHeight = '0px';
                        const done = (e) => {
                            if (e.target !== content || e.propertyName !== 'max-height') return;
                            content.removeEventListener('transitionend', done);
                            content._anim = null;
                            content.style.removeProperty('overflow');
                            if (cardEl) cardEl.classList.remove('expanding');
                            endExpand();
                        };
                        content._anim = done;
                        content.addEventListener('transitionend', done);
                    } else {
                        content.classList.add('expanded');
                        toggle.classList.add('expanded');
                        if (card.onExpand) card.onExpand();
                        requestAnimationFrame(() => {
                            const h = content.scrollHeight;
                            content.style.maxHeight = h + 'px';
                            const done = (e) => {
                                if (e.target !== content || e.propertyName !== 'max-height') return;
                                content.removeEventListener('transitionend', done);
                                content._anim = null;
                                if (content.classList.contains('expanded')) {
                                    content.style.maxHeight = 'none';
                                    content.style.removeProperty('overflow');
                                } else {
                                    content.style.removeProperty('overflow');
                                }
                                if (cardEl) cardEl.classList.remove('expanding');
                                endExpand();
                            };
                            content._anim = done;
                            content.addEventListener('transitionend', done);
                        });
                    }
                });
            }
        });
        this.initSubCards();
        this.initCardVisibility();
    }
    initCardVisibility() {
        const toggle = document.getElementById('card-visibility-toggle');
        const list = document.getElementById('card-visibility-list');
        if (toggle && list) {
            list.classList.remove('expanded');
            toggle.classList.remove('expanded');
            toggle.addEventListener('click', () => {
                const isExpanded = list.classList.contains('expanded');
                list.classList.toggle('expanded', !isExpanded);
                toggle.classList.toggle('expanded', !isExpanded);
            });
        }
        const appSettingsCard = document.querySelector('.module-card[data-card-key="app-settings"]');
        if (appSettingsCard) appSettingsCard.classList.remove('card-hidden');
        const savedVisibility = localStorage.getItem('corona_card_visibility');
        let visibility = savedVisibility ? (() => { try { return JSON.parse(savedVisibility); } catch (e) { return {}; } })() : {};
        if (!visibility || typeof visibility !== 'object' || Array.isArray(visibility)) visibility = {};
        if (visibility['app-settings'] === false) {
            delete visibility['app-settings'];
            localStorage.setItem('corona_card_visibility', JSON.stringify(visibility));
        }
        const switches = document.querySelectorAll('.card-visibility-switch');
        switches.forEach(sw => {
            const cardKey = sw.dataset.card;
            if (!cardKey || cardKey === 'app-settings') {
                this.setCardVisibilityOptionState(sw, false);
                sw.checked = true;
                return;
            }
            const card = document.querySelector(`.module-card[data-card-key="${cardKey}"]`);
            const isVisible = visibility[cardKey] !== false;
            this.setCardVisibilityOptionState(sw, this.isCardVisibilityOptionAvailable(card), { forceChecked: isVisible });
            if (card) card.classList.toggle('card-hidden', !isVisible);
            sw.addEventListener('change', () => {
                visibility[cardKey] = sw.checked;
                localStorage.setItem('corona_card_visibility', JSON.stringify(visibility));
                if (card) card.classList.toggle('card-hidden', !sw.checked);
                if (appSettingsCard) appSettingsCard.classList.remove('card-hidden');
                this.refreshSettingsSectionMarkers();
            });
        });
        this.refreshCardVisibilityAvailability();
    }
    isCardVisibilityOptionAvailable(card) {
        if (!card) return false;
        return card.style.display !== 'none';
    }
    setCardVisibilityOptionState(input, enabled, options = {}) {
        if (!input) return;
        input.disabled = !enabled;
        const container = input.closest('.card-visibility-switch-container');
        if (container) container.classList.toggle('disabled', !enabled);
        if (options.forceChecked !== undefined) input.checked = !!options.forceChecked;
    }
    isSettingsCardVisible(card) {
        if (!card) return false;
        return getComputedStyle(card).display !== 'none';
    }
    refreshCardVisibilityAvailability() {
        document.querySelectorAll('.card-visibility-switch').forEach(sw => {
            const cardKey = sw.dataset.card;
            if (!cardKey || cardKey === 'app-settings') return;
            const card = document.querySelector(`.module-card[data-card-key="${cardKey}"]`);
            const available = this.isCardVisibilityOptionAvailable(card);
            this.setCardVisibilityOptionState(sw, available, { forceChecked: available ? sw.checked : false });
        });
        this.refreshSettingsSectionMarkers();
    }
    refreshSettingsSectionMarkers() {
        document.querySelectorAll('.section-marker-settings').forEach(marker => {
            let hasVisibleCard = false;
            let sibling = marker.nextElementSibling;
            while (sibling) {
                if (sibling.classList.contains('section-marker-settings')) break;
                if (sibling.classList.contains('module-card') && sibling.dataset.cardKey === 'app-settings') break;
                if (sibling.classList.contains('module-card') && sibling.dataset.cardKey && this.isSettingsCardVisible(sibling)) {
                    hasVisibleCard = true;
                    break;
                }
                sibling = sibling.nextElementSibling;
            }
            marker.style.display = hasVisibleCard ? '' : 'none';
        });
    }
    initSubCards() {
        const subCards = [
            { toggle: 'zram-toggle', content: 'zram-content', onExpand: () => this.loadZramStatus() },
            { toggle: 'swap-toggle', content: 'swap-content', onExpand: () => this.loadSwapStatus() },
            { toggle: 'lru-toggle', content: 'lru-content', onExpand: null },
            { toggle: 'vm-toggle', content: 'vm-content', onExpand: null }
        ];
        subCards.forEach(card => {
            const toggle = document.getElementById(card.toggle);
            const content = document.getElementById(card.content);
            if (toggle && content) {
                const icon = toggle.querySelector('.expand-icon');
                toggle.addEventListener('click', () => {
                    const isExpanded = content.classList.contains('expanded');
                    const cardEl = toggle.closest('.module-card');
                    if (cardEl) cardEl.classList.add('expanding');
                    if (content._anim) {
                        content.removeEventListener('transitionend', content._anim);
                        content._anim = null;
                        content.style.removeProperty('overflow');
                        endExpand();
                    }
                    beginExpand();
                    content.style.setProperty('overflow', 'hidden', 'important');
                    if (isExpanded) {
                        const h = content.scrollHeight;
                        content.style.maxHeight = h + 'px';
                        content.offsetHeight;
                        content.classList.remove('expanded');
                        toggle.classList.remove('expanded');
                        if (icon) icon.classList.remove('expanded');
                        content.style.maxHeight = '0px';
                        const done = (e) => {
                            if (e.target !== content || e.propertyName !== 'max-height') return;
                            content.removeEventListener('transitionend', done);
                            content._anim = null;
                            content.style.removeProperty('overflow');
                            if (cardEl) cardEl.classList.remove('expanding');
                            endExpand();
                        };
                        content._anim = done;
                        content.addEventListener('transitionend', done);
                    } else {
                        content.classList.add('expanded');
                        toggle.classList.add('expanded');
                        if (icon) icon.classList.add('expanded');
                        if (card.onExpand) card.onExpand();
                        requestAnimationFrame(() => {
                            const h = content.scrollHeight;
                            content.style.maxHeight = h + 'px';
                            const done = (e) => {
                                if (e.target !== content || e.propertyName !== 'max-height') return;
                                content.removeEventListener('transitionend', done);
                                content._anim = null;
                                if (content.classList.contains('expanded')) {
                                    content.style.maxHeight = 'none';
                                    content.style.removeProperty('overflow');
                                } else {
                                    content.style.removeProperty('overflow');
                                }
                                if (cardEl) cardEl.classList.remove('expanding');
                                endExpand();
                            };
                            content._anim = done;
                            content.addEventListener('transitionend', done);
                        });
                    }
                });
            }
        });
    }
    collapseMemoryCompressionChildren(parentContent) {
        const items = parentContent.querySelectorAll('.sub-card-header[id$="-toggle"]');
        items.forEach(toggle => {
            const contentId = toggle.id.replace('-toggle', '-content');
            const content = document.getElementById(contentId);
            const icon = toggle.querySelector('.expand-icon');
            if (!content || !content.classList.contains('expanded')) return;
            content.classList.remove('expanded');
            toggle.classList.remove('expanded');
            if (icon) icon.classList.remove('expanded');
        });
    }
    refreshExpandedContentHeight(contentId) {
        const content = document.getElementById(contentId);
        if (!content || !content.classList.contains('expanded')) return;
        if (content.style.maxHeight === 'none') return;
        requestAnimationFrame(() => {
            if (!content.classList.contains('expanded')) return;
            content.style.maxHeight = content.scrollHeight + 'px';
        });
    }
    initHomeCardClicks() {
        document.getElementById('cpu-card').addEventListener('click', async () => {
            await this.switchPage('settings');
            const cpuCard = document.getElementById('cpu-governor-card');
            if (cpuCard) cpuCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        document.getElementById('swap-card').addEventListener('click', async () => {
            await this.switchPage('settings');
            const zramCard = document.getElementById('zram-card');
            if (zramCard) zramCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        document.getElementById('battery-card').addEventListener('click', () => this.showBatteryDetail());
        document.getElementById('mem-card').addEventListener('click', () => this.showUFSDetail());
        document.getElementById('storage-card').addEventListener('click', () => this.showStorageDetail());
    }
    initDetailOverlays() {
        const overlays = ['battery-detail-overlay', 'ufs-detail-overlay', 'storage-detail-overlay'];
        overlays.forEach(id => {
            const overlay = document.getElementById(id);
            const closeBtn = document.getElementById(id.replace('-overlay', '-close'));
            if (closeBtn) closeBtn.addEventListener('click', () => this.hideOverlay(id));
            if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) this.hideOverlay(id); });
        });
        document.getElementById('xinran-overlay').addEventListener('click', (e) => { this.hideOverlay('xinran-overlay'); });
        document.getElementById('gc-btn').addEventListener('click', async () => await this.runGC());
        document.querySelectorAll('.memclean-option').forEach(opt => { opt.addEventListener('click', async () => { if (this.memCleanRunning) return; await this.runMemClean(opt.dataset.mode); }); });
        this.initResetAllBtn();
    }
    showOverlay(id) {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        if (overlay._hideTimer) {
            clearTimeout(overlay._hideTimer);
            overlay._hideTimer = null;
        }
        if (overlay._hideTransitionEnd) {
            overlay.removeEventListener('transitionend', overlay._hideTransitionEnd);
            overlay._hideTransitionEnd = null;
        }
        overlay.classList.remove('hidden', 'closing');
        overlay.querySelectorAll('.detail-card, .priority-process-card, .script-edit-card').forEach(card => {
            card.scrollTop = 0;
            card.style.height = '';
            card.style.maxHeight = '';
            card.style.transform = '';
        });
        overlay.querySelectorAll('textarea').forEach(t => { t.scrollTop = 0; });
        requestAnimationFrame(() => {
            requestAnimationFrame(() => overlay.classList.add('show'));
        });
        if (overlay.classList.contains('no-close-btn')) {
            const floatingHeader = document.getElementById('floating-header');
            if (floatingHeader) floatingHeader.classList.add('overlay-hidden');
        }
    }
    hideOverlay(id) {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        if (overlay._hideTimer) {
            clearTimeout(overlay._hideTimer);
            overlay._hideTimer = null;
        }
        if (overlay._hideTransitionEnd) {
            overlay.removeEventListener('transitionend', overlay._hideTransitionEnd);
            overlay._hideTransitionEnd = null;
        }
        if (id === 'module-intro-overlay') {
            overlay.classList.add('closing');
            overlay.classList.remove('show');
            overlay._hideTimer = setTimeout(() => {
                overlay.classList.add('hidden');
                overlay.classList.remove('closing');
                overlay._hideTimer = null;
            }, 250);
            return;
        }
        overlay.classList.remove('show');
        if (overlay.classList.contains('no-close-btn')) {
            const floatingHeader = document.getElementById('floating-header');
            if (floatingHeader) floatingHeader.classList.remove('overlay-hidden');
        }
        const finalize = () => {
            if (overlay._hideTimer) {
                clearTimeout(overlay._hideTimer);
                overlay._hideTimer = null;
            }
            if (overlay._hideTransitionEnd) {
                overlay.removeEventListener('transitionend', overlay._hideTransitionEnd);
                overlay._hideTransitionEnd = null;
            }
            overlay.classList.add('hidden');
        };
        const onTransitionEnd = (e) => {
            if (e.propertyName === 'transform' && e.target.classList && e.target.classList.contains('detail-card')) {
                finalize();
            }
        };
        overlay._hideTransitionEnd = onTransitionEnd;
        overlay.addEventListener('transitionend', onTransitionEnd);
        overlay._hideTimer = setTimeout(finalize, 360);
    }
    async showBatteryDetail() {
        this.showOverlay('battery-detail-overlay');
        const content = document.getElementById('battery-detail-content');
        content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-sub)">加载中...</div>';
        const [status, health, voltage, temp, capacity, chargeType, technology, cycleCount, chargeFull, chargeFullDesign] = await Promise.all([
            this.exec('cat /sys/class/power_supply/battery/status 2>/dev/null'),
            this.exec('cat /sys/class/power_supply/battery/health 2>/dev/null'),
            this.exec('cat /sys/class/power_supply/battery/voltage_now 2>/dev/null'),
            this.exec('cat /sys/class/power_supply/battery/temp 2>/dev/null'),
            this.exec('cat /sys/class/power_supply/battery/capacity 2>/dev/null'),
            this.exec('cat /sys/class/power_supply/battery/charge_type 2>/dev/null'),
            this.exec('cat /sys/class/power_supply/battery/technology 2>/dev/null'),
            this.exec('cat /sys/class/power_supply/battery/cycle_count 2>/dev/null'),
            this.exec('cat /sys/class/power_supply/battery/charge_full 2>/dev/null'),
            this.exec('cat /sys/class/power_supply/battery/charge_full_design 2>/dev/null')
        ]);
        let finalCapacity = capacity;
        if (!finalCapacity || finalCapacity === '') finalCapacity = await this.exec('cat /sys/class/power_supply/battery/uevent 2>/dev/null | grep POWER_SUPPLY_CAPACITY= | cut -d= -f2');
        const statusMap = { 'Charging': '充电中', 'Discharging': '放电中', 'Full': '已充满', 'Not charging': '未充电', 'Unknown': '未知' };
        const healthMap = { 'Good': '良好', 'Overheat': '过热', 'Dead': '损坏', 'Over voltage': '过压', 'Unknown': '未知', 'Cold': '过冷' };
        const voltageV = voltage ? (parseInt(voltage) / 1000000).toFixed(3) : '--';
        const tempC = temp ? (parseInt(temp) / 10).toFixed(1) : '--';
        let healthPercent = '--';
        if (chargeFull && chargeFullDesign && parseInt(chargeFullDesign) > 0) healthPercent = ((parseInt(chargeFull) / parseInt(chargeFullDesign)) * 100).toFixed(1);
        content.innerHTML = `<div class="info-item"><span class="info-label">充电状态</span><span class="info-value">${statusMap[status] || status || '--'}</span></div><div class="info-item"><span class="info-label">健康状态</span><span class="info-value">${healthMap[health] || health || '--'}</span></div><div class="info-item"><span class="info-label">电池电量</span><span class="info-value">${finalCapacity || '--'}%</span></div><div class="info-item"><span class="info-label">电池电压</span><span class="info-value">${voltageV} V</span></div><div class="info-item"><span class="info-label">温度</span><span class="info-value">${tempC} °C</span></div><div class="info-item"><span class="info-label">充电类型</span><span class="info-value">${chargeType || '--'}</span></div><div class="info-item"><span class="info-label">电池技术</span><span class="info-value">${technology || '--'}</span></div><div class="info-item"><span class="info-label">循环次数</span><span class="info-value">${cycleCount || '--'}</span></div><div class="info-item"><span class="info-label">电池健康度</span><span class="info-value">${healthPercent}%</span></div>`;
    }
    async loadDualCellConfig() { const result = await this.exec(`cat ${this.configDir}/dual_cell.conf 2>/dev/null`); if (result) this.state.dualCell = result.includes('dualCell=1'); }
    async showUFSDetail() {
        this.showOverlay('ufs-detail-overlay');
        const content = document.getElementById('ufs-detail-content');
        content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-sub)">加载中...</div>';
        const [lifeA, lifeB] = await Promise.all([
            this.exec('cat /sys/devices/platform/soc/*/health_descriptor/life_time_estimation_a 2>/dev/null || cat /sys/block/sda/device/life_time_estimation_a 2>/dev/null'),
            this.exec('cat /sys/devices/platform/soc/*/health_descriptor/life_time_estimation_b 2>/dev/null || cat /sys/block/sda/device/life_time_estimation_b 2>/dev/null')
        ]);
        const lifeMap = { '0x00': '未使用', '0x01': '0-10%', '0x02': '10-20%', '0x03': '20-30%', '0x04': '30-40%', '0x05': '40-50%', '0x06': '50-60%', '0x07': '60-70%', '0x08': '70-80%', '0x09': '80-90%', '0x0A': '90-100%', '0x0B': '超过寿命' };
        const formatLife = (val) => lifeMap[val] || val || '--';
        content.innerHTML = `<div class="info-item"><span class="info-label">寿命估计 A</span><span class="info-value">${formatLife(lifeA)}</span></div><div class="info-item"><span class="info-label">寿命估计 B</span><span class="info-value">${formatLife(lifeB)}</span></div>`;
    }
    showStorageDetail() { this.showOverlay('storage-detail-overlay'); }
    async runGC() { this.showLoading(true); await this.exec('sync && echo 1 > /sys/fs/f2fs/*/gc_urgent'); await this.sleep(2000); await this.exec('echo 0 > /sys/fs/f2fs/*/gc_urgent'); this.showLoading(false); this.showToast('GC 执行完成'); }
    async runMemClean(mode) {
        this.memCleanRunning = true;
        const section = document.getElementById('memclean-section');
        const progress = document.getElementById('memclean-progress');
        const resultDiv = document.getElementById('memclean-result');
        const fill = document.getElementById('memclean-fill');
        const percent = document.getElementById('memclean-percent');
        const status = document.getElementById('memclean-status');
        const resultContent = document.getElementById('memclean-result-content');
        section.classList.add('memclean-running'); progress.classList.remove('hidden'); resultDiv.classList.add('hidden');
        fill.style.width = '0%'; percent.textContent = '0%'; status.textContent = '准备中...';
        const modeNames = { 'drop-caches': '清理缓存', 'drop-all': '深度清理', 'compact': '内存整理', 'kill-bg': '清理后台', 'full-clean': '完全清理' };
        const modeName = modeNames[mode] || mode;
        const memBefore = await this.getMemoryInfo();
        fill.style.width = '10%'; percent.textContent = '10%'; status.textContent = '开始清理...';
        if (mode === 'drop-caches' || mode === 'drop-all' || mode === 'full-clean') { fill.style.width = '20%'; percent.textContent = '20%'; status.textContent = '同步文件系统...'; await this.exec('sync'); fill.style.width = '40%'; percent.textContent = '40%'; status.textContent = '释放页面缓存...'; await this.exec('echo 3 > /proc/sys/vm/drop_caches'); }
        if (mode === 'drop-all' || mode === 'full-clean') { fill.style.width = '50%'; percent.textContent = '50%'; status.textContent = '清理 slab 缓存...'; await this.exec('echo 2 > /proc/sys/vm/drop_caches'); }
        if (mode === 'compact' || mode === 'full-clean') { fill.style.width = '60%'; percent.textContent = '60%'; status.textContent = '压缩内存...'; await this.exec('echo 1 > /proc/sys/vm/compact_memory 2>/dev/null'); }
        if (mode === 'kill-bg' || mode === 'full-clean') { fill.style.width = '70%'; percent.textContent = '70%'; status.textContent = '清理后台应用...'; await this.exec('am kill-all 2>/dev/null'); fill.style.width = '80%'; percent.textContent = '80%'; status.textContent = '释放后台内存...'; await this.exec('dumpsys meminfo -c 2>/dev/null'); }
        fill.style.width = '90%'; percent.textContent = '90%'; status.textContent = '完成清理...';
        await this.sleep(500);
        const memAfter = await this.getMemoryInfo();
        fill.style.width = '100%'; percent.textContent = '100%'; status.textContent = '清理完成!';
        const freedMB = Math.max(0, memAfter.available - memBefore.available);
        const freedStr = this.formatBytes(freedMB * 1024);
        resultContent.innerHTML = `<div class="result-item"><span>清理前可用</span><span>${this.formatBytes(memBefore.available * 1024)}</span></div><div class="result-item"><span>清理后可用</span><span>${this.formatBytes(memAfter.available * 1024)}</span></div><div class="result-item result-highlight"><span>已释放内存</span><span>${freedStr}</span></div>`;
        resultDiv.classList.remove('hidden');
        this.sendNotification('Corona 内存清理', `${modeName}完成，释放了 ${freedStr}`);
        await this.sleep(1000);
        progress.classList.add('hidden'); section.classList.remove('memclean-running'); this.memCleanRunning = false;
        this.showToast(`${modeName} 完成`);
    }
    async getMemoryInfo() {
        const meminfo = await this.exec('cat /proc/meminfo');
        let total = 0, available = 0, free = 0, buffers = 0, cached = 0;
        for (const line of meminfo.split('\n')) { const match = line.match(/^(\w+):\s+(\d+)/); if (!match) continue; const [, key, value] = match; const kb = parseInt(value); if (key === 'MemTotal') total = kb; else if (key === 'MemAvailable') available = kb; else if (key === 'MemFree') free = kb; else if (key === 'Buffers') buffers = kb; else if (key === 'Cached') cached = kb; }
        if (!available) available = free + buffers + cached;
        return { total, available, free, buffers, cached };
    }
    sendNotification(title, message) { this.exec(`su -c 'cmd notification post -S bigtext -t "${title}" corona_memclean "${message}"'`); }
    initResetAllBtn() {
        const btn = document.getElementById('reset-all-btn');
        if (!btn) return;
        btn.addEventListener('click', () => this.resetAllSettings());
    }
    async resetAllSettings() {
        const confirmed = await this.showConfirm('确定要重置所有设置吗？\n\n此操作将删除所有配置文件并立刻重启，且不可撤销！', '一键重置');
        if (!confirmed) return;
        this.showLoading(true);
        await this.exec(`rm -rf ${this.configDir}`);
        await this.exec(`sed -i 's/^description=.*/description=等待首次设置……/' '${this.modDir}/module.prop' 2>/dev/null`);
        this.showToast('配置已重置，正在重启...');
        await this.sleep(500);
        await this.exec('reboot');
    }
    async loadModuleVersion() {
        const prop = await this.exec(`cat ${this.modDir}/module.prop`);
        const match = prop.match(/version=(\S+)/);
        const ver = match ? match[1] : '--';
        const el = document.getElementById('current-version-text');
        if (el) el.textContent = `当前版本：${ver}`;
    }
    initDeviceImageInteraction() {
        const container = document.getElementById('device-image-container');
        const img = document.getElementById('device-image');
        if (!container || !img) return;
        this.deviceImageState.clickCount = 0;
        this.deviceImageState.isFlying = false;
        this.deviceImageState.flyAnimationId = null;
        this.deviceImageState.rotation = 0;
        this.deviceImageState.isInfiniteRotating = false;
        this.deviceImageState.isRotating = false;
        this.deviceImageState.isReturning = false;
        let longPressTimer = null, isDragging = false, isTouching = false;
        let startX = 0, startY = 0, dragOffsetX = 0, dragOffsetY = 0;
        let originalRect = null, longPressTriggered = false;
        let cloneEl = null, cloneImgEl = null;
        const maxDragDistance = 120;
        const spinDuration = 150;
        const handleClick = () => {
            if (this.deviceImageState.isFlying || longPressTriggered || isDragging || this.deviceImageState.isReturning) {
                return;
            }
            if (this.deviceImageState.isInfiniteRotating) {
                this.deviceImageState.spinClickCount = (this.deviceImageState.spinClickCount || 0) + 1;
                if (this.deviceImageState.spinClickCount >= 2) {
                    this.deviceImageState.isInfiniteRotating = false;
                    this.deviceImageState.spinClickCount = 0;
                    this.deviceImageState.clickCount = 0;
                    this.deviceImageState.noDeceleration = true;
                    const elapsed = Date.now() - this.deviceImageState.spinStartTime;
                    const currentAngle = (elapsed / spinDuration * 360) % 360;
                    img.style.animation = '';
                    img.style.transition = 'none';
                    img.style.transform = `rotate(${currentAngle}deg)`;
                    this.deviceImageState.rotation = currentAngle;
                    originalRect = container.getBoundingClientRect();
                    createClone(originalRect);
                    const randomAngle = Math.random() * Math.PI * 2;
                    const flySpeed = 30;
                    const vx = Math.cos(randomAngle);
                    const vy = Math.sin(randomAngle);
                    this.startFlyingAnimation(container, img, cloneEl, cloneImgEl, vx, vy, originalRect, flySpeed);
                    cloneEl = null;
                    cloneImgEl = null;
                    return;
                }
                return;
            }
            this.deviceImageState.spinClickCount = 0;
            if (this.deviceImageState.isRotating) return;
            this.deviceImageState.isRotating = true;
            this.deviceImageState.clickCount++;
            this.deviceImageState.rotation += 360;
            if (this.deviceImageState.clickCount >= 3) {
                this.deviceImageState.isInfiniteRotating = true;
                this.deviceImageState.spinClickCount = 0;
                this.deviceImageState.spinStartTime = Date.now();
                img.style.transition = 'none';
                img.style.transform = '';
                img.style.animation = `infiniteSpin ${spinDuration}ms linear infinite`;
                this.deviceImageState.isRotating = false;
            } else {
                img.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                img.style.transform = `rotate(${this.deviceImageState.rotation}deg)`;
                setTimeout(() => {
                    this.deviceImageState.isRotating = false;
                }, 400);
            }
        };
        const createClone = (rect) => {
            cloneEl = document.createElement('div');
            cloneEl.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:80px;height:80px;z-index:9999;pointer-events:none;`;
            cloneImgEl = document.createElement('img');
            cloneImgEl.src = img.src;
            cloneImgEl.style.cssText = `width:100%;height:100%;object-fit:cover;border-radius:12px;transform:scale(1.15);transition:transform 0.1s ease-out;`;
            cloneEl.appendChild(cloneImgEl);
            document.body.appendChild(cloneEl);
            container.style.visibility = 'hidden';
        };
        const handleTouchStart = (e) => {
            if (this.deviceImageState.isFlying || this.deviceImageState.isReturning) return;
            isTouching = true;
            const touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;
            originalRect = container.getBoundingClientRect();
            dragOffsetX = 0;
            dragOffsetY = 0;
            isDragging = false;
            longPressTriggered = false;
            longPressTimer = setTimeout(() => {
                longPressTriggered = true;
                document.body.style.overflow = 'hidden';
                document.body.style.touchAction = 'none';
                if (this.deviceImageState.isInfiniteRotating) {
                    this.deviceImageState.isInfiniteRotating = false;
                    this.deviceImageState.isReturning = true;
                    this.deviceImageState.clickCount = 0;
                    this.deviceImageState.spinClickCount = 0;
                    this.deviceImageState.isRotating = false;
                    const elapsed = Date.now() - this.deviceImageState.spinStartTime;
                    const currentAngle = (elapsed / spinDuration * 360) % 360;
                    const remainingAngle = 360 - currentAngle;
                    const animDuration = (remainingAngle / 360) * 0.6 + 0.2;
                    img.style.animation = '';
                    img.style.transition = 'none';
                    img.style.transform = `rotate(${currentAngle}deg)`;
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            img.style.transition = `transform ${animDuration}s cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
                            img.style.transform = 'rotate(360deg)';
                            setTimeout(() => {
                                img.style.transition = '';
                                img.style.transform = '';
                                this.deviceImageState.rotation = 0;
                                this.deviceImageState.isReturning = false;
                                if (isTouching) {
                                    originalRect = container.getBoundingClientRect();
                                    createClone(originalRect);
                                }
                            }, animDuration * 1000);
                        });
                    });
                } else {
                    createClone(originalRect);
                }
            }, 200);
        };
        const handleTouchMove = (e) => {
            if (this.deviceImageState.isFlying) return;
            const touch = e.touches ? e.touches[0] : e;
            const moveX = touch.clientX - startX;
            const moveY = touch.clientY - startY;
            if (!longPressTriggered && (Math.abs(moveX) > 5 || Math.abs(moveY) > 5)) {
                clearTimeout(longPressTimer);
                return;
            }
            if (!longPressTriggered || !cloneEl) return;
            e.preventDefault && e.preventDefault();
            isDragging = true;
            let rawOffsetX = moveX;
            let rawOffsetY = moveY;
            const rawDistance = Math.sqrt(rawOffsetX * rawOffsetX + rawOffsetY * rawOffsetY);
            if (rawDistance > maxDragDistance) {
                const ratio = maxDragDistance / rawDistance;
                rawOffsetX *= ratio;
                rawOffsetY *= ratio;
            }
            dragOffsetX = rawOffsetX;
            dragOffsetY = rawOffsetY;
            const newX = originalRect.left + dragOffsetX;
            const newY = originalRect.top + dragOffsetY;
            cloneEl.style.left = newX + 'px';
            cloneEl.style.top = newY + 'px';
            const distance = Math.sqrt(dragOffsetX * dragOffsetX + dragOffsetY * dragOffsetY);
            const distanceRatio = distance / maxDragDistance;
            const scale = Math.max(0.7, 1.15 - distanceRatio * 0.45);
            const skewX = Math.max(-20, Math.min(20, dragOffsetX / 8));
            const skewY = Math.max(-20, Math.min(20, dragOffsetY / 8));
            cloneImgEl.style.transition = 'none';
            cloneImgEl.style.transform = `rotate(${this.deviceImageState.rotation}deg) scale(${scale}) skew(${-skewX}deg, ${-skewY}deg)`;
        };
        const handleTouchEnd = () => {
            clearTimeout(longPressTimer);
            isTouching = false;
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
            if (this.deviceImageState.isFlying) return;
            if (longPressTriggered && cloneEl) {
                const distance = Math.sqrt(dragOffsetX * dragOffsetX + dragOffsetY * dragOffsetY);
                if (distance > 20) {
                    this.deviceImageState.noDeceleration = false;
                    const speedMultiplier = Math.min(distance / maxDragDistance, 1) * 25 + 8;
                    this.startFlyingAnimation(container, img, cloneEl, cloneImgEl, -dragOffsetX, -dragOffsetY, originalRect, speedMultiplier);
                } else {
                    this.jellyResetClone(container, cloneEl, cloneImgEl, originalRect);
                }
                cloneEl = null;
                cloneImgEl = null;
            }
            setTimeout(() => { isDragging = false; longPressTriggered = false; }, 30);
        };
        container.addEventListener('click', handleClick);
        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);
        container.addEventListener('touchcancel', handleTouchEnd);
        container.addEventListener('mousedown', handleTouchStart);
        document.addEventListener('mousemove', handleTouchMove);
        document.addEventListener('mouseup', handleTouchEnd);
    }
    jellyResetClone(container, cloneEl, cloneImgEl, originalRect) {
        cloneEl.style.transition = 'left 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        cloneImgEl.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        cloneEl.style.left = originalRect.left + 'px';
        cloneEl.style.top = originalRect.top + 'px';
        cloneImgEl.style.transform = `rotate(${this.deviceImageState.rotation}deg) scale(1)`;
        setTimeout(() => {
            if (cloneEl && cloneEl.parentNode) cloneEl.parentNode.removeChild(cloneEl);
            container.style.visibility = '';
        }, 500);
    }
    startFlyingAnimation(container, img, cloneEl, cloneImgEl, vx, vy, originalRect, speedMultiplier) {
        this.deviceImageState.isFlying = true;
        this.deviceImageState.originalContainer = container;
        this.deviceImageState.originalImg = img;
        this.deviceImageState.originalRect = originalRect;
        this.deviceImageState.flyingClone = cloneEl;
        this.deviceImageState.flyingCloneImg = cloneImgEl;
        cloneEl.style.pointerEvents = 'auto';
        cloneEl.style.cursor = 'pointer';
        const rect = cloneEl.getBoundingClientRect();
        const speed = Math.sqrt(vx * vx + vy * vy);
        const normalizedVx = speed > 0 ? (vx / speed) * speedMultiplier : vx;
        const normalizedVy = speed > 0 ? (vy / speed) * speedMultiplier : vy;
        let x = rect.left, y = rect.top;
        let velX = normalizedVx, velY = normalizedVy;
        let rotation = this.deviceImageState.rotation;
        let rotationSpeed = (vx > 0 ? 1 : -1) * (speedMultiplier + Math.random() * 5);
        const containerWidth = 80, containerHeight = 80;
        const screenWidth = window.innerWidth, screenHeight = window.innerHeight;
        const gravity = 0.4;
        let accelX = 0, accelY = 0, accelZ = 0;
        const noDecel = this.deviceImageState.noDeceleration;
        let hasLanded = false;
        let groundSettleFrames = 0;
        const settleThreshold = 10;
        const handleMotion = (e) => {
            if (!this.deviceImageState.isFlying || noDecel || !hasLanded) return;
            const acc = e.accelerationIncludingGravity || e.acceleration;
            if (acc) {
                accelX = -(acc.x || 0) * 0.3;
                accelY = (acc.y || 0) * 0.3;
                accelZ = (acc.z || 0) * 0.5;
            }
        };
        if (!noDecel && window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', handleMotion);
        }
        this.deviceImageState.flyData = { x, y, velX, velY, rotation, rotationSpeed };
        this.deviceImageState.motionHandler = handleMotion;
        const animate = () => {
            if (!this.deviceImageState.isFlying) return;
            const data = this.deviceImageState.flyData;
            const bounceDecay = noDecel ? 1 : 0.75;
            const rotateDecay = noDecel ? 1 : 0.85;
            const isOnGround = data.y + containerHeight >= screenHeight - 1;
            const isSettled = isOnGround && Math.abs(data.velY) < 0.5 && Math.abs(data.velX) < 0.5;
            if (isSettled) {
                groundSettleFrames++;
                if (groundSettleFrames >= settleThreshold && !hasLanded) {
                    hasLanded = true;
                }
            } else {
                groundSettleFrames = 0;
            }
            if (hasLanded && !noDecel) {
                data.velX += accelX;
                data.velY += accelY;
                data.rotationSpeed += accelZ * 0.3;
                if (!isOnGround) {
                    data.velY += gravity;
                }
            } else if (!noDecel) {
                data.velY += gravity;
            }
            data.x += data.velX;
            data.y += data.velY;
            data.rotation += data.rotationSpeed;
            if (data.x <= 0) {
                data.x = 0;
                data.velX = Math.abs(data.velX) * bounceDecay;
                data.rotationSpeed = -data.rotationSpeed * rotateDecay;
            } else if (data.x + containerWidth >= screenWidth) {
                data.x = screenWidth - containerWidth;
                data.velX = -Math.abs(data.velX) * bounceDecay;
                data.rotationSpeed = -data.rotationSpeed * rotateDecay;
            }
            if (data.y <= 0) {
                data.y = 0;
                data.velY = Math.abs(data.velY) * bounceDecay;
                data.rotationSpeed *= rotateDecay;
            } else if (data.y + containerHeight >= screenHeight) {
                data.y = screenHeight - containerHeight;
                data.velY = -Math.abs(data.velY) * bounceDecay;
                data.rotationSpeed *= rotateDecay;
            }
            if (!noDecel) {
                data.velX *= 0.992;
                data.velY *= 0.992;
                data.rotationSpeed *= 0.997;
            }
            cloneEl.style.left = data.x + 'px';
            cloneEl.style.top = data.y + 'px';
            cloneImgEl.style.transform = `rotate(${data.rotation}deg)`;
            this.deviceImageState.flyAnimationId = requestAnimationFrame(animate);
        };
        cloneEl.onclick = (e) => { e.stopPropagation(); this.stopFlyingAnimation(); };
        this.deviceImageState.flyAnimationId = requestAnimationFrame(animate);
    }
    stopFlyingAnimation() {
        if (!this.deviceImageState.isFlying) return;
        this.deviceImageState.isFlying = false;
        this.deviceImageState.noDeceleration = false;
        if (this.deviceImageState.flyAnimationId) cancelAnimationFrame(this.deviceImageState.flyAnimationId);
        if (this.deviceImageState.motionHandler) {
            window.removeEventListener('devicemotion', this.deviceImageState.motionHandler);
            this.deviceImageState.motionHandler = null;
        }
        const container = this.deviceImageState.originalContainer;
        const img = this.deviceImageState.originalImg;
        const cloneEl = this.deviceImageState.flyingClone;
        const cloneImgEl = this.deviceImageState.flyingCloneImg;
        this.deviceImageState.rotation = 0;
        this.deviceImageState.clickCount = 0;
        this.deviceImageState.spinClickCount = 0;
        this.deviceImageState.isRotating = false;
        this.deviceImageState.isReturning = false;
        const finishReturn = () => {
            if (cloneEl && cloneEl.parentNode) cloneEl.parentNode.removeChild(cloneEl);
            container.style.visibility = '';
            img.style.transition = '';
            img.style.transform = '';
            img.style.animation = '';
        };
        const getTargetRect = () => {
            const deviceCard = document.querySelector('.card-device');
            if (deviceCard) {
                const cardRect = deviceCard.getBoundingClientRect();
                return { left: cardRect.right - 12 - 80, top: cardRect.bottom - 12 - 80 };
            }
            return null;
        };
        const animateToTarget = () => {
            const homePage = document.getElementById('page-home');
            if (homePage) homePage.scrollTop = 0;
            setTimeout(() => {
                const startX = parseFloat(cloneEl.style.left);
                const startY = parseFloat(cloneEl.style.top);
                const startRotation = this.deviceImageState.flyData ? this.deviceImageState.flyData.rotation : 0;
                const startTime = Date.now();
                const duration = 600;
                const animateFrame = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    const target = getTargetRect();
                    if (!target) { finishReturn(); return; }
                    const currentX = startX + (target.left - startX) * eased;
                    const currentY = startY + (target.top - startY) * eased;
                    const currentRotation = startRotation * (1 - eased);
                    cloneEl.style.left = currentX + 'px';
                    cloneEl.style.top = currentY + 'px';
                    cloneImgEl.style.transform = `rotate(${currentRotation}deg) scale(1)`;
                    if (progress < 1) {
                        requestAnimationFrame(animateFrame);
                    } else {
                        cloneImgEl.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
                        cloneImgEl.style.transform = 'scale(1.15)';
                        setTimeout(() => {
                            cloneImgEl.style.transform = 'scale(0.95)';
                            setTimeout(() => {
                                cloneImgEl.style.transform = 'scale(1)';
                                setTimeout(finishReturn, 200);
                            }, 100);
                        }, 100);
                    }
                };
                requestAnimationFrame(animateFrame);
            }, 50);
        };
        const homePage = document.getElementById('page-home');
        const isHomeVisible = homePage && homePage.classList.contains('active');
        if (isHomeVisible) animateToTarget();
        else { this.switchPage('home'); setTimeout(animateToTarget, 150); }
    }
    bindAllEvents() {
        document.querySelectorAll('.tab-item').forEach(tab => { tab.addEventListener('click', async (e) => { await this.switchPage(e.currentTarget.dataset.page); }); });
        document.getElementById('zram-switch').addEventListener('change', async (e) => { this.state.zramEnabled = e.target.checked; this.toggleZramSettings(e.target.checked); await this.saveZramConfig(); });
        document.getElementById('zram-size-slider').addEventListener('input', (e) => { this.state.zramSize = parseFloat(e.target.value); document.getElementById('zram-size-value').textContent = `${this.state.zramSize.toFixed(2)} GB`; });
        document.getElementById('zram-size-slider').addEventListener('change', async (e) => { this.state.zramSize = parseFloat(e.target.value); await this.saveZramConfig(); });
        document.getElementById('swappiness-slider').addEventListener('input', (e) => { this.state.swappiness = parseInt(e.target.value); document.getElementById('swappiness-value').textContent = this.state.swappiness; });
        document.getElementById('swappiness-slider').addEventListener('change', async (e) => { this.state.swappiness = parseInt(e.target.value); if (this.state.zramEnabled) await this.applySwappinessImmediate(); else await this.saveZramConfig(); });
        document.getElementById('zram-apply-btn').addEventListener('click', async (e) => { e.stopPropagation(); if (!this.state.zramEnabled) { this.showToast('ZRAM 未启用'); return; } await this.applyZramImmediate(); });
        document.getElementById('le9ec-switch').addEventListener('change', async (e) => { this.state.le9ecEnabled = e.target.checked; this.toggleLe9ecSettings(e.target.checked); await this.saveLe9ecConfig(); });
        document.getElementById('le9ec-anon-slider').addEventListener('input', (e) => { this.state.le9ecAnon = parseInt(e.target.value) * 1024; document.getElementById('le9ec-anon-value').textContent = `${e.target.value} MB`; });
        document.getElementById('le9ec-anon-slider').addEventListener('change', (e) => { this.state.le9ecAnon = parseInt(e.target.value) * 1024; if (this.state.le9ecEnabled) this.applyLe9ecImmediate(); else this.saveLe9ecConfig(); });
        document.getElementById('le9ec-clean-low-slider').addEventListener('input', (e) => { this.state.le9ecCleanLow = parseInt(e.target.value) * 1024; document.getElementById('le9ec-clean-low-value').textContent = `${e.target.value} MB`; });
        document.getElementById('le9ec-clean-low-slider').addEventListener('change', (e) => { this.state.le9ecCleanLow = parseInt(e.target.value) * 1024; if (this.state.le9ecEnabled) this.applyLe9ecImmediate(); else this.saveLe9ecConfig(); });
        document.getElementById('le9ec-clean-min-slider').addEventListener('input', (e) => { this.state.le9ecCleanMin = parseInt(e.target.value) * 1024; document.getElementById('le9ec-clean-min-value').textContent = `${e.target.value} MB`; });
        document.getElementById('le9ec-clean-min-slider').addEventListener('change', (e) => { this.state.le9ecCleanMin = parseInt(e.target.value) * 1024; if (this.state.le9ecEnabled) this.applyLe9ecImmediate(); else this.saveLe9ecConfig(); });
        document.getElementById('io-switch')?.addEventListener('change', async (e) => {
            this.state.ioEnabled = e.target.checked;
            await this.applyIOConfigImmediate('io', true);
            const el = document.getElementById('io-current');
            if (el && !this.state.ioEnabled) el.textContent = '已禁用';
        });
        document.getElementById('cpu-switch')?.addEventListener('change', async (e) => {
            this.state.cpuEnabled = e.target.checked;
            await this.applyCpuGovernorImmediate(true);
            if (this.state.cpuEnabled) await this.applyCpuHotplugConfigImmediate();
            const el = document.getElementById('cpu-gov-current');
            if (el && !this.state.cpuEnabled) el.textContent = '已禁用';
        });
        document.getElementById('tcp-switch')?.addEventListener('change', async (e) => {
            this.state.tcpEnabled = e.target.checked;
            await this.applyTcpImmediate(true);
            const el = document.getElementById('tcp-current');
            if (el && !this.state.tcpEnabled) el.textContent = '已禁用';
        });
        document.getElementById('vm-switch')?.addEventListener('change', async (e) => {
            this.state.vmEnabled = e.target.checked;
            await this.applyVmConfig(true);
            const el = document.getElementById('vm-status');
            if (el) el.textContent = this.state.vmEnabled ? '已修改' : '已禁用';
        });
    }
    toggleLe9ecSettings(show) { const settings = document.getElementById('le9ec-settings'); if (show) { settings.classList.remove('hidden'); this.loadLe9ecStatus(); } else { settings.classList.add('hidden'); } }
    bindSettingsOverscrollGuard() {}
    async loadLe9ecConfig() {
        const exists = await this.exec('cat /proc/sys/vm/anon_min_kbytes 2>/dev/null');
        this.le9ecSupported = !!exists;
        if (!exists) {
            document.getElementById('le9ec-card').style.display = 'none';
            this.refreshCardVisibilityAvailability();
            return;
        }
        const config = await this.exec(`cat ${this.configDir}/le9ec.conf 2>/dev/null`);
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
    }
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
    }
    async saveLe9ecConfig(skipPreview = false) {
        const config = `enabled=${this.state.le9ecEnabled ? '1' : '0'}\nanon_min=${this.state.le9ecAnon}\nclean_low=${this.state.le9ecCleanLow}\nclean_min=${this.state.le9ecCleanMin}`;
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: this.state.le9ecEnabled ? '即将保存并应用 LE9EC 配置。' : '即将保存 LE9EC 配置。',
                configs: [{ filename: 'le9ec.conf', content: config }],
                writes: this.state.le9ecEnabled ? [
                    { path: '/proc/sys/vm/anon_min_kbytes', value: String(this.state.le9ecAnon) },
                    { path: '/proc/sys/vm/clean_low_kbytes', value: String(this.state.le9ecCleanLow) },
                    { path: '/proc/sys/vm/clean_min_kbytes', value: String(this.state.le9ecCleanMin) }
                ] : [],
                notes: this.state.le9ecEnabled ? [] : ['当前为禁用状态，仅保存配置。']
            }, {
                onCancel: () => this.loadLe9ecConfig()
            });
            if (!confirmed) return false;
        }
        await this.writeConfig('le9ec.conf', config);
        if (this.state.le9ecEnabled) {
            await this.applyLe9ecImmediate(true);
        } else {
            this.showToast('LE9EC 配置已保存（禁用状态）');
            await this.updateModuleDescription();
        }
        return true;
    }
    async applyLe9ecImmediate(skipPreview = false) {
        if (!skipPreview) {
            const config = `enabled=1\nanon_min=${this.state.le9ecAnon}\nclean_low=${this.state.le9ecCleanLow}\nclean_min=${this.state.le9ecCleanMin}`;
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将应用 LE9EC 配置。',
                configs: [{ filename: 'le9ec.conf', content: config }],
                writes: [
                    { path: '/proc/sys/vm/anon_min_kbytes', value: String(this.state.le9ecAnon) },
                    { path: '/proc/sys/vm/clean_low_kbytes', value: String(this.state.le9ecCleanLow) },
                    { path: '/proc/sys/vm/clean_min_kbytes', value: String(this.state.le9ecCleanMin) }
                ]
            }, {
                onCancel: () => this.loadLe9ecConfig()
            });
            if (!confirmed) return false;
        }
        await Promise.all([
            this.exec(`echo ${this.state.le9ecAnon} > /proc/sys/vm/anon_min_kbytes`),
            this.exec(`echo ${this.state.le9ecCleanLow} > /proc/sys/vm/clean_low_kbytes`),
            this.exec(`echo ${this.state.le9ecCleanMin} > /proc/sys/vm/clean_min_kbytes`)
        ]);
        const config = `enabled=1\nanon_min=${this.state.le9ecAnon}\nclean_low=${this.state.le9ecCleanLow}\nclean_min=${this.state.le9ecCleanMin}`;
        await this.writeConfig('le9ec.conf', config);
        await this.updateModuleDescription();
        this.showToast('LE9EC 配置已应用');
        setTimeout(() => this.loadLe9ecStatus(), 500);
        return true;
    }
    toggleZramSettings(show) { const settings = document.getElementById('zram-settings'); if (show) { settings.classList.remove('hidden'); this.loadZramStatus(); } else { settings.classList.add('hidden'); } }
    async switchPage(pageName) {
        const pages = document.querySelectorAll('.page');
        const tabs = document.querySelectorAll('.tab-item');
        const slider = document.getElementById('tab-slider');
        const currentActive = document.querySelector('.page.active');
        const targetPage = document.getElementById(`page-${pageName}`);
        if (!targetPage || currentActive === targetPage) return;
        if (pageName === 'settings' && (!this.settingsUiInitialized || !this.settingsDataLoaded)) {
            await this.ensureSettingsPageReady();
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
        if (pageName === 'home' && this.pendingChartDraw) {
            requestAnimationFrame(() => this.drawChart());
            this.pendingChartDraw = false;
        }
    }
    renderStaticOptions() { this.renderAlgorithmOptions(); this.renderReadaheadOptions(); this.renderIOAdvancedOptions(); }
    renderAlgorithmOptions() {
        const container = document.getElementById('algorithm-list');
        container.innerHTML = this.algorithms.map(alg => `<div class="option-item ${alg === this.state.algorithm ? 'selected' : ''}" data-value="${alg}">${alg}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => { container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected')); e.currentTarget.classList.add('selected'); this.state.algorithm = e.currentTarget.dataset.value; await this.saveZramConfig(); });
        });
    }
    renderReadaheadOptions() {
        const container = document.getElementById('readahead-list');
        container.innerHTML = this.readaheadOptions.map(size => `<div class="option-item ${size === this.state.readahead ? 'selected' : ''}" data-value="${size}">${size}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => { container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected')); e.currentTarget.classList.add('selected'); this.state.readahead = parseInt(e.currentTarget.dataset.value); await this.applyReadaheadImmediate(); });
        });
    }
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
    }
    renderIOAdvancedOptions() {
        const ensureValues = (values, fallback) => Array.isArray(values) && values.length > 0 ? values : fallback;
        this.ioNrRequestsOptions = ensureValues(this.ioNrRequestsOptions, [64, 128, 256, 512, 1024, 2048]);
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
    }
    async getPreferredBlockDevice() {
        const device = (await this.exec("for d in /sys/block/*; do b=$(basename \"$d\"); case \"$b\" in loop*|ram*|zram*|dm-*) continue ;; esac; [ -d \"$d/queue\" ] || continue; echo \"$b\"; break; done")).trim();
        return device || '';
    }
    parseIoConfig(content) {
        const values = {};
        String(content || '').split('\n').forEach(line => {
            const idx = line.indexOf('=');
            if (idx <= 0) return;
            values[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        });
        return values;
    }
    buildIOConfig() {
        const lines = [`enabled=${this.state.ioEnabled ? '1' : '0'}`];
        if (this.state.ioScheduler) lines.push(`scheduler=${this.state.ioScheduler}`);
        lines.push(`readahead=${this.state.readahead}`);
        lines.push(`nr_requests=${this.state.ioNrRequests}`);
        lines.push(`rq_affinity=${this.state.ioRqAffinity}`);
        lines.push(`nomerges=${this.state.ioNomerges}`);
        lines.push(`iostats=${this.state.ioIostats ? '1' : '0'}`);
        return lines.join('\n');
    }
    buildIOWritePlan() {
        const writes = [];
        if (this.state.ioScheduler) writes.push({ path: '/sys/block/*/queue/scheduler', value: this.isCoronaKernel ? `kernel:${this.state.ioScheduler}` : this.state.ioScheduler });
        writes.push({ path: '/sys/block/*/queue/read_ahead_kb', value: String(this.state.readahead) });
        writes.push({ path: '/sys/block/*/queue/nr_requests', value: String(this.state.ioNrRequests) });
        writes.push({ path: '/sys/block/*/queue/rq_affinity', value: String(this.state.ioRqAffinity) });
        writes.push({ path: '/sys/block/*/queue/nomerges', value: String(this.state.ioNomerges) });
        writes.push({ path: '/sys/block/*/queue/iostats', value: this.state.ioIostats ? '1' : '0' });
        return writes;
    }
    async applyIOConfigImmediate(changedField = 'io', skipPreview = false) {
      return this.withLock('io', async () => {
        const schedCmd = this.state.ioScheduler ? (this.isCoronaKernel ? `kernel:${this.state.ioScheduler}` : this.state.ioScheduler) : '';
        const config = this.buildIOConfig();
        if (!skipPreview) {
            const labels = {
                scheduler: 'I/O 调度器',
                readahead: '预读取大小',
                nr_requests: 'nr_requests',
                rq_affinity: 'rq_affinity',
                nomerges: 'nomerges',
                iostats: 'iostats',
                io: 'I/O 高级参数'
            };
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: `即将应用 ${labels[changedField] || 'I/O 设置'}。`,
                configs: [{ filename: 'io_scheduler.conf', content: config }],
                writes: this.buildIOWritePlan()
            }, {
                onCancel: () => this.loadIOConfig()
            });
            if (!confirmed) return false;
        }
        if (!this.state.ioEnabled) {
            return this.saveDisabledConfig('io_scheduler.conf', config, 'I/O 配置已保存（禁用状态）');
        }
        const quotedScheduler = schedCmd ? this.shellQuote(schedCmd) : '';
        await this.exec(`for d in /sys/block/*; do b=$(basename "$d"); case "$b" in loop*|ram*|zram*|dm-*) continue ;; esac; q="$d/queue"; [ -d "$q" ] || continue; [ -n ${this.shellQuote(schedCmd ? '1' : '')} ] && [ -f "$q/scheduler" ] && echo ${quotedScheduler || "''"} > "$q/scheduler" 2>/dev/null; [ -f "$q/read_ahead_kb" ] && echo ${this.state.readahead} > "$q/read_ahead_kb" 2>/dev/null; [ -f "$q/nr_requests" ] && echo ${this.state.ioNrRequests} > "$q/nr_requests" 2>/dev/null; [ -f "$q/rq_affinity" ] && echo ${this.state.ioRqAffinity} > "$q/rq_affinity" 2>/dev/null; [ -f "$q/nomerges" ] && echo ${this.state.ioNomerges} > "$q/nomerges" 2>/dev/null; [ -f "$q/iostats" ] && echo ${this.state.ioIostats ? 1 : 0} > "$q/iostats" 2>/dev/null; done`);
        await this.writeConfig('io_scheduler.conf', config);
        await this.updateModuleDescription();
        const preferred = await this.getPreferredBlockDevice();
        const schedulerPath = preferred ? `/sys/block/${preferred}/queue/scheduler` : '';
        const readbackRaw = schedulerPath ? (await this.exec(`cat ${schedulerPath} 2>/dev/null`)).trim() : '';
        const active = readbackRaw.match(/\[([^\]]+)\]/)?.[1] || '';
        const currentEl = document.getElementById('io-current');
        if (currentEl) currentEl.textContent = active || this.state.ioScheduler || '--';
        if (changedField === 'scheduler' && active && active !== this.state.ioScheduler) {
            this.showToast(`I/O 调度器写入未生效（当前: ${active}）`);
            return false;
        }
        const toastMap = {
            scheduler: `I/O 调度器: ${this.state.ioScheduler}`,
            readahead: `预读取大小: ${this.state.readahead} KB`,
            nr_requests: `nr_requests: ${this.state.ioNrRequests}`,
            rq_affinity: `rq_affinity: ${this.state.ioRqAffinity}`,
            nomerges: `nomerges: ${this.state.ioNomerges}`,
            iostats: `iostats: ${this.state.ioIostats ? '开启' : '关闭'}`,
            io: 'I/O 设置已应用'
        };
        this.showToast(toastMap[changedField] || 'I/O 设置已应用');
        return true;
      });
    }
    async applyReadaheadImmediate(skipPreview = false) {
        return this.applyIOConfigImmediate('readahead', skipPreview);
    }
    async loadDeviceInfo() {
        const [brand, marketName, model, socModel, hardware, chipname, androidVersion, sdk, kernelVersion, battDesign] = await Promise.all([
            this.exec('getprop ro.product.brand'),
            this.exec('getprop ro.vendor.oplus.market.name'),
            this.exec('getprop ro.product.model'),
            this.exec('getprop ro.board.platform'),
            this.exec('getprop ro.hardware'),
            this.exec('getprop ro.hardware.chipname'),
            this.exec('getprop ro.build.version.release'),
            this.exec('getprop ro.build.version.sdk'),
            this.exec('uname -r'),
            this.exec('cat /sys/class/power_supply/battery/charge_full_design 2>/dev/null')
        ]);
        this.kernelVersion = kernelVersion || '';
        await this.detectZramAlgorithms();
        const brandEl = document.getElementById('device-brand');
        if (brandEl) brandEl.textContent = brand || '--';
        document.getElementById('device-model').textContent = (marketName && marketName.trim()) || model || '--';
        const cpuName = chipname || socModel || hardware || 'Unknown';
        document.getElementById('cpu-info').textContent = cpuName;
        await this.detectCpuClusters();
        const clusterStr = this.formatClusterInfo();
        document.getElementById('cpu-cluster-info').textContent = clusterStr || '--';
        const cpuBrandBadge = document.getElementById('cpu-brand-badge');
        if (cpuBrandBadge) {
            const cpuNameLower = cpuName.toLowerCase();
            const hardwareLower = (hardware || '').toLowerCase();
            const socModelLower = (socModel || '').toLowerCase();
            const isSnapdragon = cpuNameLower.includes('sm') || cpuNameLower.includes('sdm') || cpuNameLower.includes('msm') || cpuNameLower.includes('qcom') || cpuNameLower.includes('snapdragon') || hardwareLower.includes('qcom') || socModelLower.includes('sm') || socModelLower.includes('sdm') || socModelLower.includes('msm');
            const isDimensity = cpuNameLower.includes('mt') || cpuNameLower.includes('dimensity') || cpuNameLower.includes('mediatek') || hardwareLower.includes('mt') || socModelLower.includes('mt');
            if (isSnapdragon) { cpuBrandBadge.textContent = 'Snapdragon'; cpuBrandBadge.className = 'cpu-brand-badge snapdragon'; }
            else if (isDimensity) { cpuBrandBadge.textContent = 'MediaTek'; cpuBrandBadge.className = 'cpu-brand-badge mediatek'; }
            else { cpuBrandBadge.classList.add('hidden'); }
        }
        document.getElementById('system-version').textContent = `Android ${androidVersion || '--'} (API ${sdk || '--'})`;
        document.getElementById('kernel-version').textContent = kernelVersion || '--';
        if (battDesign && parseInt(battDesign) > 0) document.getElementById('battery-capacity').textContent = `${Math.round(parseInt(battDesign) / 1000)} mAh`;
    }
    async detectZramAlgorithms() {
        const zramBlock = this.getZramBlockName(this.state.zramPath);
        const algRaw = zramBlock ? await this.exec(`cat /sys/block/${zramBlock}/comp_algorithm 2>/dev/null`) : '';
        if (algRaw) {
            this.algorithms = algRaw.replace(/\[|\]/g, '').split(/\s+/).filter(a => a.length > 0).map(a => a.replace(/^kernel:/, ''));
            this.algorithms = [...new Set(this.algorithms)];
        }
        if (!this.algorithms || this.algorithms.length === 0) {
            this.algorithms = ['lz4', 'lzo', 'zstd'];
        }
    }

    async getZramAlgorithmCommand(algorithm, zramBlock) {
        const algRaw = await this.exec(`cat /sys/block/${zramBlock}/comp_algorithm 2>/dev/null`);
        const prefixed = `kernel:${algorithm}`;
        if (this.isCoronaKernel && algRaw && algRaw.includes(prefixed)) return prefixed;
        return algorithm;
    }
    getZramBlockName(zramPath) {
        const raw = String(zramPath || '').replace('/dev/block/', '').replace('/dev/', '').trim();
        return raw.replace(/[^a-zA-Z0-9_.-].*$/, '');
    }
    async getActiveSwapInfo(devicePath) {
        const swaps = await this.exec('cat /proc/swaps 2>/dev/null');
        if (!swaps) return null;
        const lines = swaps.split('\n').slice(1);
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts[0] === devicePath) {
                return { device: parts[0], type: parts[1], size: parts[2], used: parts[3], priority: parts[4] };
            }
        }
        return null;
    }
    async detectCpuClusters() {
        this.cpuClusterInfo = { little: 0, mid: 0, big: 0, prime: 0 };
        const cpuCount = parseInt(await this.exec('ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null | wc -l')) || 0;
        const freqs = [];
        const freqPromises = [];
        for (let i = 0; i < cpuCount; i++) { freqPromises.push(this.exec(`cat /sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq 2>/dev/null`).then(maxFreq => { if (maxFreq) freqs.push({ cpu: i, freq: parseInt(maxFreq) }); })); }
        await Promise.all(freqPromises);
        if (freqs.length === 0) return;
        const uniqueFreqs = [...new Set(freqs.map(f => f.freq))].sort((a, b) => a - b);
        if (uniqueFreqs.length === 1) this.cpuClusterInfo.little = freqs.length;
        else if (uniqueFreqs.length === 2) freqs.forEach(f => { if (f.freq === uniqueFreqs[0]) this.cpuClusterInfo.little++; else this.cpuClusterInfo.big++; });
        else if (uniqueFreqs.length === 3) freqs.forEach(f => { if (f.freq === uniqueFreqs[0]) this.cpuClusterInfo.little++; else if (f.freq === uniqueFreqs[1]) this.cpuClusterInfo.mid++; else this.cpuClusterInfo.big++; });
        else if (uniqueFreqs.length >= 4) freqs.forEach(f => { if (f.freq === uniqueFreqs[0]) this.cpuClusterInfo.little++; else if (f.freq === uniqueFreqs[1]) this.cpuClusterInfo.mid++; else if (f.freq === uniqueFreqs[uniqueFreqs.length - 1]) this.cpuClusterInfo.prime++; else this.cpuClusterInfo.big++; });
    }
    formatClusterInfo() { const parts = []; if (this.cpuClusterInfo.little > 0) parts.push(this.cpuClusterInfo.little); if (this.cpuClusterInfo.mid > 0) parts.push(this.cpuClusterInfo.mid); if (this.cpuClusterInfo.big > 0) parts.push(this.cpuClusterInfo.big); if (this.cpuClusterInfo.prime > 0) parts.push(this.cpuClusterInfo.prime); return parts.length === 0 ? '' : parts.join('+'); }
    getTotalCoreCount() { return this.cpuClusterInfo.little + this.cpuClusterInfo.mid + this.cpuClusterInfo.big + this.cpuClusterInfo.prime; }
    startRealtimeMonitor() {
        if (this.realtimeTimer) clearInterval(this.realtimeTimer);
        this.realtimeTimer = setInterval(() => this.updateRealtimeData(false), this.realtimeIntervalMs);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (this.realtimeTimer) clearInterval(this.realtimeTimer);
                this.realtimeTimer = null;
                return;
            }
            this.updateRealtimeData(false);
            if (!this.realtimeTimer) {
                this.realtimeTimer = setInterval(() => this.updateRealtimeData(false), this.realtimeIntervalMs);
            }
        });
    }
    async updateRealtimeData(forceHeavy) {
        if (this.realtimeBusy) return;
        this.realtimeBusy = true;
        this.realtimeTick += 1;
        try {
            const runHeavy = forceHeavy || (this.realtimeTick % 2 === 0);
            const [batteryTemp, memData, cpuData] = await Promise.all([
                this.updateBatteryInfo(),
                this.updateMemoryInfo(),
                this.updateCpuUsage()
            ]);
            let cpuTemp = 0;
            if (runHeavy) {
                const [, , cpuTempVal] = await Promise.all([
                    this.updateSwapInfo(),
                    this.updateStorageInfo(),
                    this.updateCpuTemp()
                ]);
                cpuTemp = cpuTempVal || 0;
            } else {
                cpuTemp = parseFloat((this.$('cpu-temp') || {}).textContent) || 0;
            }
            const memPercent = memData || 0;
            const cpuPercent = cpuData || 0;
            this.updateHistoryData(cpuPercent, memPercent, cpuTemp, batteryTemp || 0);
            if (runHeavy && document.getElementById('page-settings').classList.contains('active')) {
                await this.updateCpuLoads();
            }
        } finally {
            this.realtimeBusy = false;
        }
    }
    async updateCpuUsage() {
        const stat = await this.exec('cat /proc/stat | head -1');
        const parse = (line) => {
            const parts = line.split(/\s+/).slice(1).map(Number);
            const idle = parts[3] + (parts[4] || 0);
            const total = parts.reduce((a, b) => a + b, 0);
            return { idle, total };
        };
        const current = parse(stat);
        if (!this.prevCpuStat) {
            this.prevCpuStat = current;
            const lastPoint = this.historyData.cpu.length ? this.historyData.cpu[this.historyData.cpu.length - 1].value : 0;
            return parseFloat((lastPoint || 0).toFixed(1));
        }
        const idleDiff = current.idle - this.prevCpuStat.idle;
        const totalDiff = current.total - this.prevCpuStat.total;
        this.prevCpuStat = current;
        return totalDiff > 0 ? ((1 - idleDiff / totalDiff) * 100) : 0;
    }
    initStaticHeader() {
        const title = document.getElementById('corona-title');
        const floatingHeader = document.getElementById('floating-header');
        const floatingTitle = floatingHeader ? floatingHeader.querySelector('.floating-header-title') : null;
        if (title && floatingTitle) floatingTitle.textContent = title.textContent;
        if (floatingHeader) floatingHeader.classList.remove('visible', 'overlay-hidden');
        if (title) title.style.opacity = '1';
        const settingsTitle = document.getElementById('corona-title-settings');
        if (settingsTitle) settingsTitle.style.opacity = '1';
    }
    scheduleDeferredInit() {
        if (this.deferredHomeReady) return;
        this.deferredHomeReady = true;
        const run = async () => {
            try {
                this.initBannerDrag();
                this.initEasterEgg();
                this.initDeviceImageInteraction();
                this.initScrollEffect();
                await this.ensureSettingsPageReady(true);
                this.prewarmAppPolicyData().catch(() => {});
            } catch (e) {}
        };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => setTimeout(run, 120), { timeout: 1500 });
        } else {
            setTimeout(run, 600);
        }
    }
    async ensureSettingsPageReady(silent = false) {
        if (this.settingsUiInitialized && this.settingsDataLoaded) return;
        if (this.settingsInitPromise) return this.settingsInitPromise;
        if (!silent) this.showLoading(true);
        this.settingsInitPromise = (async () => {
            if (!this.settingsUiInitialized) {
                this.renderStaticOptions();
                this.initPerformanceMode();
                this.initExpandableCards();
                this.initThemeSelector();
                this.initChangePreviewToggle();
                this.initSettingDescriptionToggle();
                this.initCategoryConfigVisibilityToggle();
                this.initSnapshots();
                this.initSliderProgress();
                this.initSwapSettings();
                this.initVmSettings();
                this.initZramWriteback();
                this.initZramPath();
                this.initCustomScripts();
                this.initSystemOpt();
                this.initAppPolicy();
                this.initCoronaKernel();
                this.settingsUiInitialized = true;
            }
            if (!this.settingsDataLoaded) {
                await Promise.all([
                    this.loadAllConfigs(),
                    this.loadDualCellConfig(),
                    this.detectKernelFeatures(),
                    this.loadParameterSnapshots(),
                    this.loadAppRulesConfig()
                ]);
                this.initKernelFeatures();
                await Promise.all([
                    this.loadZramStatus(),
                    this.loadLe9ecStatus()
                ]);
                this.settingsDataLoaded = true;
            }
        })();
        try {
            await this.settingsInitPromise;
        } finally {
            this.settingsInitPromise = null;
            if (document.getElementById('page-settings')?.classList.contains('active')) {
                requestAnimationFrame(() => {
                    const scroller = document.querySelector('.container');
                    if (scroller) scroller.scrollTo({ top: 0, behavior: 'auto' });
                });
            }
            if (!silent) this.showLoading(false);
        }
    }
    async updateBatteryInfo() {
        const [level, temp] = await Promise.all([this.exec('cat /sys/class/power_supply/battery/capacity'), this.exec('cat /sys/class/power_supply/battery/temp')]);
        document.getElementById('battery-level').textContent = `${level}%`;
        if (temp && !isNaN(temp)) {
            const tempC = (parseInt(temp) / 10).toFixed(1);
            document.getElementById('battery-temp').textContent = `${tempC}°C`;
            return parseFloat(tempC) || 0;
        }
        return 0;
    }
    async updateCpuTemp() {
        const tempPaths = ['/sys/class/thermal/thermal_zone0/temp', '/sys/devices/virtual/thermal/thermal_zone0/temp', '/sys/class/hwmon/hwmon0/temp1_input'];
        for (const path of tempPaths) {
            const temp = await this.exec(`cat ${path} 2>/dev/null`);
            if (temp && !isNaN(temp)) {
                const val = parseInt(temp);
                const tempC = (val > 1000 ? val / 1000 : val).toFixed(1);
                document.getElementById('cpu-temp').textContent = `${tempC}°C`;
                return parseFloat(tempC) || 0;
            }
        }
        document.getElementById('cpu-temp').textContent = '--';
        return 0;
    }
    async updateMemoryInfo() {
        const meminfo = await this.exec('cat /proc/meminfo');
        let total = 0, available = 0, free = 0, buffers = 0, cached = 0;
        for (const line of meminfo.split('\n')) { const match = line.match(/^(\w+):\s+(\d+)/); if (!match) continue; const [, key, value] = match; const kb = parseInt(value); if (key === 'MemTotal') total = kb; else if (key === 'MemAvailable') available = kb; else if (key === 'MemFree') free = kb; else if (key === 'Buffers') buffers = kb; else if (key === 'Cached') cached = kb; }
        if (!available) available = free + buffers + cached;
        const used = total - available; const percent = ((used / total) * 100).toFixed(1);
        document.getElementById('mem-total').textContent = this.formatBytes(total * 1024);
        document.getElementById('mem-used').textContent = this.formatBytes(used * 1024);
        document.getElementById('mem-available').textContent = this.formatBytes(available * 1024);
        const progressEl = document.getElementById('mem-progress');
        progressEl.style.width = `${percent}%`; progressEl.className = `progress-fill${percent > 85 ? ' danger' : ''}`;
        return parseFloat(percent);
    }
    async updateStorageInfo() {
        const dfOutput = await this.exec('df /data 2>/dev/null | tail -1');
        if (dfOutput) {
            const parts = dfOutput.split(/\s+/);
            if (parts.length >= 4) {
                const total = parseInt(parts[1]) * 1024; const used = parseInt(parts[2]) * 1024; const available = parseInt(parts[3]) * 1024;
                const percent = total > 0 ? ((used / total) * 100).toFixed(1) : 0;
                const totalEl = document.getElementById('storage-total'); const usedEl = document.getElementById('storage-used');
                const availableEl = document.getElementById('storage-available'); const progressEl = document.getElementById('storage-progress');
                if (totalEl) totalEl.textContent = this.formatBytes(total);
                if (usedEl) usedEl.textContent = this.formatBytes(used);
                if (availableEl) availableEl.textContent = this.formatBytes(available);
                if (progressEl) { progressEl.style.width = `${percent}%`; progressEl.className = `progress-fill storage${percent > 85 ? ' danger' : ''}`; }
            }
        }
    }
    async updateSwapInfo() {
        const swapinfo = await this.exec('cat /proc/meminfo | grep Swap');
        let total = 0, free = 0;
        for (const line of swapinfo.split('\n')) { if (line.startsWith('SwapTotal:')) total = parseInt(line.match(/\d+/)?.[0] || 0); else if (line.startsWith('SwapFree:')) free = parseInt(line.match(/\d+/)?.[0] || 0); }
        const used = total - free; const percent = total > 0 ? ((used / total) * 100).toFixed(1) : 0;
        document.getElementById('swap-total').textContent = total > 0 ? this.formatBytes(total * 1024) : '未启用';
        document.getElementById('swap-used').textContent = total > 0 ? this.formatBytes(used * 1024) : '--';
        document.getElementById('swap-free').textContent = total > 0 ? this.formatBytes(free * 1024) : '--';
        document.getElementById('swap-progress').style.width = `${percent}%`;
    }
    async loadAllConfigs() {
        await Promise.all([ this.loadZramConfig(), this.loadLe9ecConfig(), this.loadIOConfig(), this.loadCpuGovernorConfig(), this.loadTCPConfig(), this.loadCpuCores(), this.loadPerformanceModeConfig(), this.loadSwapStatus() ]);
        await this.updateModuleDescription();
        this.updateClusterBadge();
        document.querySelectorAll('.range-slider').forEach(slider => this.updateSliderProgress(slider));
    }
    updateClusterBadge() { const badge = document.getElementById('cpu-cluster-badge'); if (badge) { badge.textContent = this.formatClusterInfo() || '--'; } }
    async detectActiveZramPath() {
        const activePath = (await this.exec(`awk 'NR > 1 && ($1 ~ /^\/dev\/block\/zram/ || $1 ~ /^\/dev\/zram/) { print $1; exit }' /proc/swaps 2>/dev/null`)).trim();
        if (activePath) {
            this.state.zramPath = activePath;
            const pathInput = document.getElementById('zram-path-input');
            if (pathInput) pathInput.value = activePath;
        }
        return activePath;
    }
    updateZramModeHint(mode, runtimeInfo = null) {
        const hintEl = document.getElementById('zram-mode-hint');
        const descEl = document.getElementById('zram-switch-desc');
        if (!hintEl) return;
        if (mode === 'module') {
            hintEl.textContent = '当前由模块配置接管；保存配置会在开机时由 mm-sys 应用。';
            if (descEl) descEl.textContent = '按模块配置覆盖系统默认 ZRAM';
            return;
        }
        if (mode === 'system' && runtimeInfo?.isActive) {
            hintEl.textContent = '当前跟随系统默认内存策略；未启用模块覆盖。';
            if (descEl) descEl.textContent = '开启后改为使用模块配置覆盖系统默认';
            return;
        }
        hintEl.textContent = '当前未启用 ZRAM；开启后将写入模块配置。';
        if (descEl) descEl.textContent = '压缩内存块，扩展可用RAM';
    }
    syncZramControlsFromRuntime(runtimeInfo) {
        if (!runtimeInfo) return;
        if (runtimeInfo.currentAlg && runtimeInfo.currentAlg !== '--') this.state.algorithm = runtimeInfo.currentAlg;
        if (runtimeInfo.sizeBytes > 0) this.state.zramSize = runtimeInfo.sizeBytes / 1024 / 1024 / 1024;
        if (Number.isFinite(runtimeInfo.swappinessValue)) this.state.swappiness = runtimeInfo.swappinessValue;
        const sizeSlider = document.getElementById('zram-size-slider');
        if (sizeSlider) {
            sizeSlider.value = this.state.zramSize;
            this.updateSliderProgress(sizeSlider);
        }
        document.getElementById('zram-size-value').textContent = `${this.state.zramSize.toFixed(2)} GB`;
        const swSlider = document.getElementById('swappiness-slider');
        if (swSlider) {
            swSlider.value = this.state.swappiness;
            this.updateSliderProgress(swSlider);
        }
        document.getElementById('swappiness-value').textContent = this.state.swappiness;
        this.renderAlgorithmOptions();
    }
    async loadZramConfig() {
        const config = await this.exec(`cat ${this.configDir}/zram.conf 2>/dev/null`);
        if (config) {
            const algMatch = config.match(/algorithm=(\S+)/);
            const sizeMatch = config.match(/size=(\d+)/);
            const swapMatch = config.match(/swappiness=(\d+)/);
            const enabledMatch = config.match(/enabled=(\d)/);
            const writebackMatch = config.match(/zram_writeback=(\S+)/);
            const pathMatch = config.match(/zram_path=(\S+)/);
            if (algMatch) { this.state.algorithm = algMatch[1]; this.renderAlgorithmOptions(); }
            if (sizeMatch) { this.state.zramSize = parseInt(sizeMatch[1]) / 1024 / 1024 / 1024; document.getElementById('zram-size-slider').value = this.state.zramSize; document.getElementById('zram-size-value').textContent = `${this.state.zramSize.toFixed(2)} GB`; }
            if (swapMatch) { this.state.swappiness = parseInt(swapMatch[1]); document.getElementById('swappiness-slider').value = this.state.swappiness; document.getElementById('swappiness-value').textContent = this.state.swappiness; }
            if (enabledMatch) { this.state.zramEnabled = enabledMatch[1] === '1'; document.getElementById('zram-switch').checked = this.state.zramEnabled; this.toggleZramSettings(this.state.zramEnabled); }
            if (writebackMatch) {
                this.state.zramWriteback = writebackMatch[1];
                const list = document.getElementById('zram-writeback-list');
                if (list) list.querySelectorAll('.option-item').forEach(i => i.classList.toggle('selected', i.dataset.value === this.state.zramWriteback));
            }
            if (pathMatch) {
                this.state.zramPath = pathMatch[1];
                const pathInput = document.getElementById('zram-path-input');
                if (pathInput) pathInput.value = this.state.zramPath;
            }
        } else {
            this.state.zramEnabled = false;
            const sw = document.getElementById('zram-switch');
            if (sw) sw.checked = false;
            this.toggleZramSettings(false);
        }
        await this.loadZramStatus();
    }
    async loadZramStatus() {
        const detectedPath = await this.detectActiveZramPath();
        const zramPath = detectedPath || this.state.zramPath;
        const zramBlock = this.getZramBlockName(zramPath);
        const [algRaw, disksize, swappiness, swapInfo] = await Promise.all([
            zramBlock ? this.exec(`cat /sys/block/${zramBlock}/comp_algorithm 2>/dev/null`) : '',
            zramBlock ? this.exec(`cat /sys/block/${zramBlock}/disksize 2>/dev/null`) : '',
            this.exec('cat /proc/sys/vm/swappiness 2>/dev/null'),
            this.getActiveSwapInfo(zramPath)
        ]);
        const currentAlg = algRaw.match(/\[([^\]]+)\]/)?.[1] || algRaw.split(' ')[0] || '--';
        const sizeGB = disksize ? (parseInt(disksize) / 1024 / 1024 / 1024).toFixed(1) : '0';
        const swappinessValue = parseInt((swappiness || '').trim(), 10);
        document.getElementById('zram-current-alg').textContent = currentAlg;
        document.getElementById('zram-current-size').textContent = `${sizeGB} GB`;
        document.getElementById('zram-current-swappiness').textContent = swappiness.trim() || '--';
        const isActive = !!swapInfo;
        const runtimeInfo = { currentAlg, sizeBytes: parseInt(disksize || '0', 10) || 0, swappinessValue, isActive, path: zramPath };
        const statusEl = document.getElementById('zram-status');
        if (!this.state.zramEnabled) this.syncZramControlsFromRuntime(runtimeInfo);
        if (statusEl) statusEl.textContent = isActive ? (this.state.zramEnabled ? `模块:${currentAlg.toUpperCase()}` : `系统:${currentAlg.toUpperCase()}`) : '未启用';
        const memBadge = document.getElementById('memory-compression-badge');
        if (memBadge) memBadge.textContent = isActive ? (this.state.zramEnabled ? `ZRAM: 模块接管` : `ZRAM: 系统默认`) : '未配置';
        const pathDisplay = document.getElementById('zram-current-path');
        if (pathDisplay) pathDisplay.textContent = zramPath;
        this.updateZramModeHint(this.state.zramEnabled ? 'module' : (isActive ? 'system' : 'off'), runtimeInfo);
    }
    async saveZramConfig(skipPreview = false) {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const config = `enabled=${this.state.zramEnabled ? '1' : '0'}\nalgorithm=${this.state.algorithm}\nsize=${sizeBytes}\nswappiness=${this.state.swappiness}\nzram_writeback=${this.state.zramWriteback}\nzram_path=${this.state.zramPath}`;
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将保存 ZRAM 配置。',
                configs: [{ filename: 'zram.conf', content: config }],
                notes: ['仅保存配置，不立即重建 ZRAM 设备。']
            }, {
                onCancel: () => this.loadZramConfig()
            });
            if (!confirmed) return false;
        }
        await this.writeConfig('zram.conf', config);
        await this.updateModuleDescription();
        this.showToast('ZRAM 配置已保存');
        return true;
    }
    async applyZramImmediate(manageLoading = true, skipPreview = false) {
      return this.withLock('zram', async () => {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const zramDev = this.state.zramPath;
        const zramBlock = this.getZramBlockName(zramDev);
        if (!zramBlock) {
            if (manageLoading) this.showLoading(false);
            this.showToast('ZRAM 设备路径无效');
            return false;
        }
        if (!skipPreview) {
            const config = `enabled=1\nalgorithm=${this.state.algorithm}\nsize=${sizeBytes}\nswappiness=${this.state.swappiness}\nzram_writeback=${this.state.zramWriteback}\nzram_path=${this.state.zramPath}`;
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将重建并应用 ZRAM。',
                configs: [{ filename: 'zram.conf', content: config }],
                writes: [
                    { path: `/sys/block/${zramBlock}/comp_algorithm`, value: this.state.algorithm },
                    { path: `/sys/block/${zramBlock}/disksize`, value: String(sizeBytes) },
                    { path: '/proc/sys/vm/swappiness', value: String(this.state.swappiness) }
                ],
                actions: [
                    `swapoff ${zramDev}`,
                    `重置 /sys/block/${zramBlock}`,
                    `mkswap ${zramDev}`,
                    `swapon ${zramDev} -p 32758`
                ],
                notes: this.state.zramWriteback === 'false' ? ['将禁用 writeback backing_dev。'] : []
            }, {
                onCancel: () => this.loadZramConfig()
            });
            if (!confirmed) return false;
        }
        if (manageLoading) {
            this.showLoading(true);
            await this.sleep(0);
        }
        await this.exec(`swapoff ${zramDev} 2>/dev/null`);
        await this.exec(`echo 1 > /sys/block/${zramBlock}/reset 2>/dev/null`);
        const algCmd = await this.getZramAlgorithmCommand(this.state.algorithm, zramBlock);
        await this.exec(`echo "${algCmd}" > /sys/block/${zramBlock}/comp_algorithm`);
        if (this.state.zramWriteback === 'false') {
            await this.exec(`echo none > /sys/block/${zramBlock}/backing_dev 2>/dev/null`);
        }
        await this.exec(`echo "${sizeBytes}" > /sys/block/${zramBlock}/disksize`);
        await this.exec(`mkswap ${zramDev}`);
        await this.exec(`swapon ${zramDev} -p 32758 2>/dev/null`);
        const swapInfo = await this.getActiveSwapInfo(zramDev);
        if (!swapInfo || swapInfo.priority !== '32758') {
            if (manageLoading) this.showLoading(false);
            this.showToast(`ZRAM 启用失败${swapInfo ? `（优先级: ${swapInfo.priority}）` : ''}`);
            return;
        }
        await this.exec(`echo "${this.state.swappiness}" > /proc/sys/vm/swappiness`);
        const config = `enabled=1\nalgorithm=${this.state.algorithm}\nsize=${sizeBytes}\nswappiness=${this.state.swappiness}\nzram_writeback=${this.state.zramWriteback}\nzram_path=${this.state.zramPath}`;
        await this.writeConfig('zram.conf', config);
        await this.updateModuleDescription();
        if (manageLoading) this.showLoading(false);
        this.showToast('ZRAM 配置已应用');
        setTimeout(() => this.loadZramStatus(), 500);
      });
    }
    async applySwappinessImmediate(skipPreview = false) {
      return this.withLock('zram', async () => {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const config = `enabled=${this.state.zramEnabled ? '1' : '0'}\nalgorithm=${this.state.algorithm}\nsize=${sizeBytes}\nswappiness=${this.state.swappiness}\nzram_writeback=${this.state.zramWriteback}\nzram_path=${this.state.zramPath}`;
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将更新 Swappiness。',
                configs: [{ filename: 'zram.conf', content: config }],
                writes: [{ path: '/proc/sys/vm/swappiness', value: String(this.state.swappiness) }]
            }, {
                onCancel: () => this.loadZramConfig()
            });
            if (!confirmed) return false;
        }
        this.showLoading(true);
        try {
            await this.sleep(0);
            const ok = await this.writeAndVerifySysfs(this.state.swappiness, '/proc/sys/vm/swappiness', 'Swappiness');
            await this.writeConfig('zram.conf', config);
            await this.updateModuleDescription();
            if (ok) this.showToast(`Swappiness: ${this.state.swappiness}`);
            return ok;
        } finally {
            this.showLoading(false);
        }
      });
    }
    async loadIOConfig() {
        const preferred = await this.getPreferredBlockDevice();
        const schedulerRaw = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/scheduler 2>/dev/null`) : '';
        const readahead = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/read_ahead_kb 2>/dev/null`) : '';
        const nrRequests = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/nr_requests 2>/dev/null`) : '';
        const rqAffinity = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/rq_affinity 2>/dev/null`) : '';
        const nomerges = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/nomerges 2>/dev/null`) : '';
        const iostats = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/iostats 2>/dev/null`) : '';
        const conf = await this.exec(`cat ${this.configDir}/io_scheduler.conf 2>/dev/null`);
        const saved = this.parseIoConfig(conf);
        this.state.ioEnabled = this.parseEnabledFlag(conf, !!conf);
        const ioSwitch = document.getElementById('io-switch');
        if (ioSwitch) ioSwitch.checked = this.state.ioEnabled;
        const availableSchedulers = [];
        let currentScheduler = '';
        if (schedulerRaw) {
            const matches = schedulerRaw.match(/\[([^\]]+)\]/);
            if (matches) currentScheduler = matches[1];
            schedulerRaw.replace(/\[([^\]]+)\]/g, '$1').split(/\s+/).filter(s => s).forEach(s => {
                if (!availableSchedulers.includes(s)) availableSchedulers.push(s);
            });
        }
        if (saved.scheduler && availableSchedulers.includes(saved.scheduler)) currentScheduler = saved.scheduler;
        this.state.ioScheduler = currentScheduler;
        const pickIoValue = (...values) => values.find(value => value !== undefined && value !== null && value !== '');
        const resolvedReadahead = parseInt(pickIoValue(saved.readahead, readahead, this.state.readahead));
        const resolvedNrRequests = parseInt(pickIoValue(saved.nr_requests, nrRequests, this.state.ioNrRequests));
        const resolvedRqAffinity = parseInt(pickIoValue(saved.rq_affinity, rqAffinity, this.state.ioRqAffinity));
        const resolvedNomerges = parseInt(pickIoValue(saved.nomerges, nomerges, this.state.ioNomerges));
        this.state.readahead = Number.isFinite(resolvedReadahead) ? resolvedReadahead : this.state.readahead;
        this.state.ioNrRequests = Number.isFinite(resolvedNrRequests) ? resolvedNrRequests : this.state.ioNrRequests;
        this.state.ioRqAffinity = Number.isFinite(resolvedRqAffinity) ? resolvedRqAffinity : this.state.ioRqAffinity;
        this.state.ioNomerges = Number.isFinite(resolvedNomerges) ? resolvedNomerges : this.state.ioNomerges;
        this.state.ioIostats = pickIoValue(saved.iostats, iostats, this.state.ioIostats ? '1' : '0') === '1';
        const container = document.getElementById('io-scheduler-list');
        if (container) {
            container.innerHTML = availableSchedulers.map(s => `<div class="option-item ${s === currentScheduler ? 'selected' : ''}" data-value="${s}">${s}</div>`).join('');
            container.querySelectorAll('.option-item').forEach(item => {
                item.addEventListener('click', async (e) => {
                    container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                    e.currentTarget.classList.add('selected');
                    this.state.ioScheduler = e.currentTarget.dataset.value;
                    await this.applyIOSchedulerImmediate();
                });
            });
        }
        const currentEl = document.getElementById('io-current');
        if (currentEl) currentEl.textContent = this.state.ioEnabled ? (currentScheduler || '--') : '已禁用';
        const iostatsContainer = document.getElementById('io-iostats-container');
        if (iostatsContainer) iostatsContainer.style.display = preferred && iostats !== '' ? '' : 'none';
        const iostatsSwitch = document.getElementById('io-iostats-switch');
        if (iostatsSwitch) iostatsSwitch.checked = this.state.ioIostats;
        this.renderReadaheadOptions();
        this.renderIOAdvancedOptions();
        this.refreshExpandedContentHeight('io-scheduler-content');
    }
    async applyIOSchedulerImmediate(skipPreview = false) {
        return this.applyIOConfigImmediate('scheduler', skipPreview);
    }
    async loadCpuGovernorConfig() {
        const governorRaw = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors 2>/dev/null');
        const currentGovernor = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null');
        const conf = await this.exec(`cat ${this.configDir}/cpu_governor.conf 2>/dev/null`);
        this.state.cpuEnabled = this.parseEnabledFlag(conf, !!conf);
        const cpuSwitch = document.getElementById('cpu-switch');
        if (cpuSwitch) cpuSwitch.checked = this.state.cpuEnabled;
        const availableGovernors = governorRaw.split(/\s+/).filter(g => g);
        let resolved = currentGovernor.trim();
        if (conf) {
            const m = conf.match(/governor=(\S+)/);
            if (m && availableGovernors.includes(m[1])) resolved = m[1];
        }
        this.state.cpuGovernor = resolved;
        const container = document.getElementById('cpu-governor-list');
        if (container) {
            container.innerHTML = availableGovernors.map(g => `<div class="option-item ${g === this.state.cpuGovernor ? 'selected' : ''}" data-value="${g}">${g}</div>`).join('');
            container.querySelectorAll('.option-item').forEach(item => {
                item.addEventListener('click', async (e) => {
                    container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                    e.currentTarget.classList.add('selected');
                    this.state.cpuGovernor = e.currentTarget.dataset.value;
                    await this.applyCpuGovernorImmediate();
                });
            });
        }
        const currentEl = document.getElementById('cpu-gov-current');
        if (currentEl) currentEl.textContent = this.state.cpuEnabled ? (this.state.cpuGovernor || '--') : '已禁用';
    }
    async applyCpuGovernorImmediate(skipPreview = false) {
      return this.withLock('governor', async () => {
        const config = `enabled=${this.state.cpuEnabled ? '1' : '0'}\ngovernor=${this.state.cpuGovernor}`;
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将应用 CPU 调频器。',
                configs: [{ filename: 'cpu_governor.conf', content: config }],
                writes: [{ path: '/sys/devices/system/cpu/cpu*/cpufreq/scaling_governor', value: this.state.cpuGovernor }]
            }, {
                onCancel: () => this.loadCpuGovernorConfig()
            });
            if (!confirmed) return false;
        }
        if (!this.state.cpuEnabled) {
            return this.saveDisabledConfig('cpu_governor.conf', config, 'CPU 配置已保存（禁用状态）');
        }
        await this.exec(`for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo "${this.state.cpuGovernor}" > "$f" 2>/dev/null; done`);
        const readback = (await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null')).trim();
        await this.writeConfig('cpu_governor.conf', config);
        await this.updateModuleDescription();
        document.getElementById('cpu-gov-current').textContent = readback || this.state.cpuGovernor;
        if (readback && readback !== this.state.cpuGovernor) {
            this.showToast(`CPU 调频器写入未生效（当前: ${readback}）`);
        } else {
            this.showToast(`CPU 调频器: ${this.state.cpuGovernor}`);
        }
        return true;
      });
    }
    async loadTCPConfig() {
        const tcpRaw = await this.exec('cat /proc/sys/net/ipv4/tcp_available_congestion_control 2>/dev/null');
        const currentTcp = await this.exec('cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null');
        const conf = await this.exec(`cat ${this.configDir}/tcp.conf 2>/dev/null`);
        this.state.tcpEnabled = this.parseEnabledFlag(conf, !!conf);
        const tcpSwitch = document.getElementById('tcp-switch');
        if (tcpSwitch) tcpSwitch.checked = this.state.tcpEnabled;
        const availableTcp = tcpRaw.split(/\s+/).filter(t => t);
        let resolved = currentTcp.trim();
        if (conf) {
            const m = conf.match(/congestion=(\S+)/);
            if (m && availableTcp.includes(m[1])) resolved = m[1];
        }
        this.state.tcp = resolved;
        const container = document.getElementById('tcp-list');
        container.innerHTML = availableTcp.map(t => `<div class="option-item ${t === this.state.tcp ? 'selected' : ''}" data-value="${t}">${t}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.state.tcp = e.currentTarget.dataset.value;
                await this.applyTcpImmediate();
            });
        });
        document.getElementById('tcp-current').textContent = this.state.tcpEnabled ? (this.state.tcp || '--') : '已禁用';
    }
    async applyTcpImmediate(skipPreview = false) {
      return this.withLock('tcp', async () => {
        const config = `enabled=${this.state.tcpEnabled ? '1' : '0'}\ncongestion=${this.state.tcp}`;
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将应用 TCP 拥塞算法。',
                configs: [{ filename: 'tcp.conf', content: config }],
                writes: [{ path: '/proc/sys/net/ipv4/tcp_congestion_control', value: this.state.tcp }]
            }, {
                onCancel: () => this.loadTCPConfig()
            });
            if (!confirmed) return false;
        }
        if (!this.state.tcpEnabled) {
            return this.saveDisabledConfig('tcp.conf', config, 'TCP 配置已保存（禁用状态）');
        }
        const ok = await this.writeAndVerifySysfs(this.state.tcp, '/proc/sys/net/ipv4/tcp_congestion_control', 'TCP 拥塞算法');
        await this.writeConfig('tcp.conf', config);
        await this.updateModuleDescription();
        document.getElementById('tcp-current').textContent = this.state.tcp;
        if (ok) this.showToast(`TCP 拥塞算法: ${this.state.tcp}`);
        return ok;
      });
    }
    async loadCpuCores() {
        const cpuCount = parseInt(await this.exec('ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null | wc -l')) || 8;
        const totalCores = this.getTotalCoreCount();
        const maxCores = totalCores > 0 ? totalCores : cpuCount;
        const hotplugConf = await this.exec(`cat ${this.configDir}/cpu_hotplug.conf 2>/dev/null`);
        const savedStates = this.parseCpuHotplugConfig(hotplugConf);
        this.cpuCores = [];
        const seenIds = new Set();
        for (let i = 0; i < cpuCount && this.cpuCores.length < maxCores; i++) {
            if (seenIds.has(i)) continue;
            const [online, maxFreq, stat] = await Promise.all([
                this.exec(`cat /sys/devices/system/cpu/cpu${i}/online 2>/dev/null`),
                this.exec(`cat /sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq 2>/dev/null`),
                this.exec(`grep "^cpu${i} " /proc/stat 2>/dev/null`)
            ]);
            if (!maxFreq && !stat) continue;
            seenIds.add(i);
            const savedOnline = savedStates[`cpu${i}`];
            const effectiveOnline = i === 0 ? true : (!this.state.cpuEnabled && typeof savedOnline === 'boolean' ? savedOnline : online === '1');
            this.cpuCores.push({ id: i, online: effectiveOnline, locked: i === 0, maxFreq: maxFreq ? parseInt(maxFreq) : 0, load: '--' });
            const freqs = await this.exec(`cat /sys/devices/system/cpu/cpu${i}/cpufreq/scaling_available_frequencies 2>/dev/null`);
            if (freqs) this.cpuFreqsPerCore[i] = freqs.split(/\s+/).filter(f => f).map(Number).sort((a, b) => a - b);
        }
        this.cpuCores.sort((a, b) => a.id - b.id);
        this.renderCpuCores();
        await this.updateCpuLoads();
    }
    renderCpuCores() {
        const container = document.getElementById('cpu-cores-list');
        if (!container) return;
        container.innerHTML = this.cpuCores.map(core => `<div class="cpu-core ${core.online ? 'online' : 'offline'} ${core.id === 0 ? 'locked' : ''}" data-cpu="${core.id}"><div class="cpu-core-id">CPU ${core.id}</div><div class="cpu-core-load" id="cpu-load-${core.id}">${core.online ? '--' : 'OFF'}</div></div>`).join('');
        container.querySelectorAll('.cpu-core').forEach(item => {
            item.addEventListener('click', async () => {
                const cpuId = parseInt(item.dataset.cpu);
                if (cpuId === 0) { this.showToast('CPU0 不能被关闭'); return; }
                const core = this.cpuCores[cpuId];
                const newState = core.online ? '0' : '1';
                const nextConfig = this.cpuCores.map(c => `cpu${c.id}=${c.id === cpuId ? newState : (c.online ? '1' : '0')}`).join('\n');
                const confirmed = await this.confirmChangePreview('变更预览', {
                    summary: `即将${newState === '1' ? '启用' : '禁用'} CPU${cpuId}。`,
                    configs: [{ filename: 'cpu_hotplug.conf', content: nextConfig }],
                    writes: [{ path: `/sys/devices/system/cpu/cpu${cpuId}/online`, value: newState }]
                });
                if (!confirmed) return;
                if (!this.state.cpuEnabled) {
                    core.online = !core.online;
                    item.className = `cpu-core ${core.online ? 'online' : 'offline'}`;
                    document.getElementById(`cpu-load-${cpuId}`).textContent = core.online ? '--' : 'OFF';
                    await this.saveCpuHotplugConfig();
                    await this.updateModuleDescription();
                    this.showToast(`CPU${cpuId} 配置已保存（禁用状态）`);
                    return;
                }
                await this.exec(`echo ${newState} > /sys/devices/system/cpu/cpu${cpuId}/online`);
                core.online = !core.online;
                item.className = `cpu-core ${core.online ? 'online' : 'offline'}`;
                document.getElementById(`cpu-load-${cpuId}`).textContent = core.online ? '--' : 'OFF';
                await this.saveCpuHotplugConfig();
                await this.updateModuleDescription();
                this.showToast(`CPU${cpuId} 已${core.online ? '启用' : '禁用'}`);
            });
        });
    }
    async getCpuStat(cpuId) {
        const stat = await this.exec(`grep "^cpu${cpuId} " /proc/stat 2>/dev/null`);
        if (!stat) return null;
        const parts = stat.split(/\s+/);
        if (parts.length < 5) return null;
        const user = parseInt(parts[1]) || 0;
        const nice = parseInt(parts[2]) || 0;
        const system = parseInt(parts[3]) || 0;
        const idle = parseInt(parts[4]) || 0;
        const iowait = parseInt(parts[5]) || 0;
        const irq = parseInt(parts[6]) || 0;
        const softirq = parseInt(parts[7]) || 0;
        const total = user + nice + system + idle + iowait + irq + softirq;
        const active = total - idle - iowait;
        return { total, active };
    }
    async updateCpuLoads() {
        for (const core of this.cpuCores) {
            const el = document.querySelector(`.cpu-core[data-cpu="${core.id}"] .cpu-core-load`);
            if (!el) continue;
            if (!core.online) { el.textContent = 'OFF'; continue; }
            const s1 = await this.getCpuStat(core.id);
            if (!s1) continue;
            if (!this.cpuStats[core.id]) { this.cpuStats[core.id] = s1; continue; }
            const prev = this.cpuStats[core.id];
            this.cpuStats[core.id] = s1;
            const totalDiff = s1.total - prev.total;
            const activeDiff = s1.active - prev.active;
            const usage = totalDiff > 0 ? Math.round((activeDiff / totalDiff) * 100) : 0;
            el.textContent = `${usage}%`;
            core.load = `${usage}%`;
        }
    }
    async saveCpuHotplugConfig() {
        const config = this.cpuCores.map(c => `cpu${c.id}=${c.online ? '1' : '0'}`).join('\n');
        await this.writeConfig('cpu_hotplug.conf', config);
    }
    async applyCpuHotplugConfigImmediate() {
        const writes = this.cpuCores.filter(core => core.id !== 0).map(core => this.exec(`echo ${core.online ? '1' : '0'} > /sys/devices/system/cpu/cpu${core.id}/online 2>/dev/null`));
        if (writes.length > 0) await Promise.all(writes);
        await this.saveCpuHotplugConfig();
        return true;
    }
    async updateModuleDescription() {
        const descParts = [];
        if (this.state.zramEnabled) {
            const zramBlock = this.getZramBlockName(this.state.zramPath);
            const algRaw = zramBlock ? await this.exec(`cat /sys/block/${zramBlock}/comp_algorithm 2>/dev/null`) : '';
            const currentAlg = algRaw.match(/\[([^\]]+)\]/)?.[1] || algRaw.split(' ')[0] || this.state.algorithm;
            descParts.push(`ZRAM:${currentAlg}`);
        } else { descParts.push(`ZRAM:关闭`); }
        if (this.state.ioEnabled && this.state.ioScheduler) { descParts.push(`IO:${this.state.ioScheduler}`); }
        else {
            const preferred = await this.getPreferredBlockDevice();
            const schedulerRaw = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/scheduler 2>/dev/null`) : '';
            if (schedulerRaw) { const current = schedulerRaw.match(/\[([^\]]+)\]/)?.[1] || schedulerRaw.split(' ')[0]; if (current) descParts.push(`IO:${current}`); else descParts.push(`IO:--`); }
            else { descParts.push(`IO:--`); }
        }
        if (this.state.cpuEnabled && this.state.cpuGovernor) { descParts.push(`CPU:${this.state.cpuGovernor}`); }
        else { const current = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null'); if (current) descParts.push(`CPU:${current.trim()}`); else descParts.push(`CPU:--`); }
        if (this.state.tcpEnabled && this.state.tcp) { descParts.push(`TCP:${this.state.tcp}`); }
        else { const current = await this.exec('cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null'); if (current) descParts.push(`TCP:${current.trim()}`); else descParts.push(`TCP:--`); }
        if (this.le9ecSupported && this.state.le9ecEnabled) { descParts.push(`LE9EC:开启`); }
        const desc = descParts.join(' | ');
        const modulePropPath = `${this.modDir}/module.prop`;
        await this.exec(`sed -i 's/^description=.*/description=${desc.replace(/\//g, "\\/")}/' '${modulePropPath}' 2>/dev/null`);
    }
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    showToast(message) { const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2500); }
    showInitOverlay(show) {
        const el = document.getElementById('loading');
        const text = el ? el.querySelector('.loading-text') : null;
        if (!el) return;
        if (show) {
            document.body.classList.remove('app-ready');
            document.body.classList.add('init-lock', 'app-booting');
            el.classList.add('init-mode');
            if (text) text.textContent = '正在初始化，请稍候...';
            el.classList.add('show');
        } else {
            el.classList.remove('init-mode');
            if (text) text.textContent = '处理中...';
            el.classList.remove('show');
            document.body.classList.remove('init-lock', 'app-booting');
            document.body.classList.add('app-ready');
        }
    }
    showUnsupportedDevice(brand) {
        document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;padding:24px;text-align:center;font-family:system-ui,sans-serif">
            <div><h2 style="color:#e53935;margin-bottom:12px">设备不支持</h2>
            <p style="color:#666;font-size:14px">此模块仅支持 OnePlus/一加 设备<br>当前品牌: ${brand}</p></div></div>`;
    }
    showLoading(show) {
        if (this.isInitializing) return;
        const el = document.getElementById('loading');
        if (el) el.classList.toggle('show', show);
    }
    initBannerDrag() {
        const banner = document.querySelector('.banner-image');
        if (!banner) return;
        let isDragging = false, startX = 0, startY = 0, currentX = 0, currentY = 0;
        const maxOffset = 15;
        const handleStart = (e) => { isDragging = true; banner.classList.add('dragging'); const touch = e.touches ? e.touches[0] : e; startX = touch.clientX - currentX; startY = touch.clientY - currentY; };
        const handleMove = (e) => { if (!isDragging) return; e.preventDefault(); const touch = e.touches ? e.touches[0] : e; let newX = touch.clientX - startX; let newY = touch.clientY - startY; newX = Math.max(-maxOffset, Math.min(maxOffset, newX)); newY = Math.max(-maxOffset, Math.min(maxOffset, newY)); currentX = newX; currentY = newY; banner.style.transform = `translate(${currentX}px, ${currentY}px)`; };
        const handleEnd = () => { if (!isDragging) return; isDragging = false; banner.classList.remove('dragging'); banner.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'; banner.style.transform = 'translate(0, 0)'; currentX = 0; currentY = 0; setTimeout(() => { banner.style.transition = 'transform 0.15s ease-out'; }, 400); };
        banner.addEventListener('touchstart', handleStart, { passive: true });
        banner.addEventListener('touchmove', handleMove, { passive: false });
        banner.addEventListener('touchend', handleEnd);
        banner.addEventListener('touchcancel', handleEnd);
        banner.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
    }
    initEasterEgg() {
        const banner = document.querySelector('.banner-image');
        const authorCard = document.getElementById('author-card');
        const overlay = document.getElementById('easter-egg-overlay');
        const card = document.getElementById('easter-egg-card');
        if (!overlay || !card) return;
        if (banner) { banner.addEventListener('click', () => { this.easterEgg.clickCount++; if (this.easterEgg.clickTimer) { clearTimeout(this.easterEgg.clickTimer); } this.easterEgg.clickTimer = setTimeout(() => { this.easterEgg.clickCount = 0; }, 500); if (this.easterEgg.clickCount >= 1) { this.easterEgg.clickCount = 0; this.showEasterEgg(); } }); }
        if (authorCard) { authorCard.addEventListener('click', () => { this.easterEgg.authorClickCount = (this.easterEgg.authorClickCount || 0) + 1; if (this.easterEgg.authorClickTimer) { clearTimeout(this.easterEgg.authorClickTimer); } this.easterEgg.authorClickTimer = setTimeout(() => { this.easterEgg.authorClickCount = 0; }, 500); if (this.easterEgg.authorClickCount >= 1) { this.easterEgg.authorClickCount = 0; this.showCreditsCard(); } }); }
        let cardTouchStartX = 0, cardTouchStartY = 0, cardOffsetX = 0, cardOffsetY = 0;
        card.addEventListener('touchstart', (e) => { const touch = e.touches[0]; cardTouchStartX = touch.clientX; cardTouchStartY = touch.clientY; card.style.transition = 'none'; }, { passive: true });
        card.addEventListener('touchmove', (e) => { if (!this.easterEgg.isOverlayOpen) return; const touch = e.touches[0]; cardOffsetX = (touch.clientX - cardTouchStartX) * 0.15; cardOffsetY = (touch.clientY - cardTouchStartY) * 0.15; cardOffsetX = Math.max(-20, Math.min(20, cardOffsetX)); cardOffsetY = Math.max(-20, Math.min(20, cardOffsetY)); card.style.transform = `scale(1) translate(${cardOffsetX}px, ${cardOffsetY}px)`; }, { passive: true });
        card.addEventListener('touchend', () => { card.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'; card.style.transform = 'scale(1) translate(0, 0)'; cardOffsetX = 0; cardOffsetY = 0; });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { this.hideEasterEgg(); } });
    }
    showEasterEgg() { const overlay = document.getElementById('easter-egg-overlay'); const content = document.getElementById('easter-egg-content'); this.easterEgg.currentCard = 'thanks'; this.easterEgg.isOverlayOpen = true; content.innerHTML = `<div class="rainbow-text">感谢使用<span class="corona-c-rainbow">C</span>orona模块</div><div class="rainbow-text ciallo">Ciallo~(∠・ω< )⌒★</div>`; overlay.classList.add('show'); }
    showCreditsCard() {
        const overlay = document.getElementById('easter-egg-overlay');
        const content = document.getElementById('easter-egg-content');
        this.easterEgg.currentCard = 'credits';
        this.easterEgg.isOverlayOpen = true;
        this.easterEgg.xinranClickCount = 0;
        content.innerHTML = `<div class="rainbow-text credit-name" id="xinran-credit">致谢爱人❤️然(≧ω≦)/</div><div class="credits-section"><div class="rainbow-text credits-title">模块制作感谢名单</div><div class="rainbow-text credit-name">Cloud_Yun</div><div class="rainbow-text credit-name">穆远星</div><div class="rainbow-text credit-name">scene附加模块2（嘟嘟Ski）</div></div>`;
        overlay.classList.add('show');
        const xinranEl = document.getElementById('xinran-credit');
        if (xinranEl) {
            const self = this;
            xinranEl.onclick = function(e) {
                e.stopPropagation();
                self.easterEgg.xinranClickCount++;
                if (self.easterEgg.xinranClickTimer) { clearTimeout(self.easterEgg.xinranClickTimer); }
                self.easterEgg.xinranClickTimer = setTimeout(() => { self.easterEgg.xinranClickCount = 0; }, 1500);
                if (self.easterEgg.xinranClickCount >= 3) { self.easterEgg.xinranClickCount = 0; self.hideEasterEgg(); setTimeout(() => { const xinranOverlay = document.getElementById('xinran-overlay'); xinranOverlay.classList.remove('hidden'); xinranOverlay.classList.add('show'); }, 300); }
            };
        }
    }
    hideEasterEgg() { const overlay = document.getElementById('easter-egg-overlay'); overlay.classList.remove('show'); this.easterEgg.isOverlayOpen = false; setTimeout(() => { const card = document.getElementById('easter-egg-card'); card.style.transform = ''; card.style.transition = ''; }, 400); }
    initPerformanceMode() { this.initProcessPriority(); }
    async loadPerformanceModeConfig() { await this.loadPriorityConfig(); await this.loadThreadPriorityConfig(); }
    initProcessPriority() {
        this.priorityRules = {}; this.threadPriorityRules = []; this.priorityProcesses = []; this.selectedPriorityProcess = null; this.selectedNice = 0; this.selectedIoClass = 2; this.selectedIoLevel = 4; this.selectedThreadRuleKey = null; this.selectedThreadRulePackage = ''; this.selectedThreadRuleLabel = ''; this.selectedThreadPattern = ''; this.selectedThreadNice = 0; this.selectedThreadIoClass = 2; this.selectedThreadIoLevel = 4; this.selectedThreadAffinity = ''; this.selectedThreadCpuset = ''; this.selectedThreadUclampMin = ''; this.selectedThreadUclampMax = ''; this.selectedThreadSchedPolicy = 'normal'; this.selectedThreadRtPrio = 1; this.selectedThreadWaltBoost = false; this.selectedThreadWaltPipeline = false; this.threadSuggestionCache = Object.create(null);
        document.getElementById('priority-cancel-btn').addEventListener('click', () => this.hideOverlay('priority-setting-overlay'));
        document.getElementById('priority-save-btn').addEventListener('click', () => this.savePriorityRule());
        document.getElementById('priority-process-search').addEventListener('input', (e) => { this.filterPriorityProcessList(e.target.value); });
        document.getElementById('priority-process-overlay').addEventListener('click', (e) => { if (e.target.id === 'priority-process-overlay') this.hideOverlay('priority-process-overlay'); });
        document.getElementById('priority-setting-overlay').addEventListener('click', (e) => { if (e.target.id === 'priority-setting-overlay') this.hideOverlay('priority-setting-overlay'); });
        const niceSlider = document.getElementById('nice-slider');
        const niceValue = document.getElementById('nice-slider-value');
        niceSlider.addEventListener('input', () => { this.selectedNice = parseInt(niceSlider.value); niceValue.textContent = this.selectedNice; this.updateSliderProgress(niceSlider); });
        document.querySelectorAll('.io-option').forEach(opt => { opt.addEventListener('click', () => { document.querySelectorAll('.io-option').forEach(o => o.classList.remove('selected')); opt.classList.add('selected'); this.selectedIoClass = parseInt(opt.dataset.class); this.selectedIoLevel = parseInt(opt.dataset.level); }); });
        this.initThreadRuleUi();
    }
    async loadPriorityConfig() {
        const config = await this.exec(`cat ${this.configDir}/process_priority.conf 2>/dev/null`);
        this.priorityRules = {};
        if (config && config.trim()) {
            const lines = config.trim().split('\n');
            for (const line of lines) { if (line && line.includes('=')) { const [processName, values] = line.split('='); if (processName && values) { const [nice, ioClass, ioLevel] = values.split(',').map(Number); this.priorityRules[processName.trim()] = { nice, ioClass, ioLevel }; } } }
        }
        this.renderPriorityRules();
        this.updatePriorityCount();
        await this.loadThreadPriorityConfig();
    }
    renderPriorityRules() {
        const container = document.getElementById('priority-rules-list');
        if (!container) return;
        const ruleNames = Object.keys(this.priorityRules || {});
        if (ruleNames.length === 0) { container.innerHTML = '<div class="priority-empty">暂无优先级规则</div>'; return; }
        const ioClassNames = { 1: '实时', 2: '尽力', 3: '空闲' };
        container.innerHTML = ruleNames.map(name => { const rule = this.priorityRules[name]; const initial = name.charAt(0).toUpperCase(); return `<div class="priority-rule-item" data-process="${name}"><div class="priority-rule-icon">${initial}</div><div class="priority-rule-info"><div class="priority-rule-name">${name}</div><div class="priority-rule-values">nice: ${rule.nice} | I/O: ${ioClassNames[rule.ioClass] || '尽力'}</div></div><div class="priority-rule-actions"><button class="priority-rule-btn edit" data-action="edit" data-name="${name}">✎</button><button class="priority-rule-btn delete" data-action="delete" data-name="${name}">✕</button></div></div>`; }).join('');
        container.querySelectorAll('.priority-rule-btn').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); const action = btn.dataset.action; const name = btn.dataset.name; if (action === 'edit') this.editPriorityRule(name); else if (action === 'delete') this.deletePriorityRule(name); }); });
    }
    updatePriorityCount() { return Object.keys(this.priorityRules).length; }
    async showPriorityProcessSelector() { this.showOverlay('priority-process-overlay'); document.getElementById('priority-process-search').value = ''; document.getElementById('priority-process-list').innerHTML = '<div class="priority-loading">加载中...</div>'; await this.loadPriorityProcessList(); }
    async loadPriorityProcessList() {
        const psOutput = await this.exec(`ps -Ao pid,args 2>/dev/null | tail -n +2`);
        const processes = []; const seen = new Set();
        if (psOutput) {
            const lines = psOutput.split('\n');
            for (const line of lines) {
                const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
                if (match) {
                    const pid = match[1]; let fullCmd = match[2].trim(); let name = fullCmd.split(/\s+/)[0];
                    if (name.includes('/')) name = name.split('/').pop();
                    const isApp = fullCmd.includes('com.') || fullCmd.includes('org.') || fullCmd.includes('net.');
                    let packageName = '';
                    if (isApp) { const pkgMatch = fullCmd.match(/([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)/); if (pkgMatch) { packageName = pkgMatch[1]; name = packageName; } }
                    if (!seen.has(name) && name && !name.startsWith('[')) { seen.add(name); processes.push({ pid, name, packageName, isApp }); }
                }
            }
        }
        processes.sort((a, b) => a.name.localeCompare(b.name));
        this.priorityProcesses = processes;
        this.renderPriorityProcessList(processes);
    }
    renderPriorityProcessList(processes) {
        const container = document.getElementById('priority-process-list');
        if (processes.length === 0) { container.innerHTML = '<div class="priority-loading">未找到进程</div>'; return; }
        const appProcs = [], systemProcs = [], otherProcs = [];
        for (const proc of processes) {
            if (proc.isApp || proc.name.startsWith('com.') || (proc.name.includes('.') && !proc.name.includes('android.hardware'))) { appProcs.push(proc); }
            else if (['surfaceflinger', 'zygote', 'system_server', 'servicemanager', 'vold', 'logd'].some(s => proc.name.includes(s))) { systemProcs.push(proc); }
            else { otherProcs.push(proc); }
        }
        let html = '';
        if (appProcs.length > 0) { html += '<div class="process-category">应用进程</div>'; html += appProcs.map(p => this.renderPriorityProcessItem(p)).join(''); }
        if (systemProcs.length > 0) { html += '<div class="process-category">系统进程</div>'; html += systemProcs.map(p => this.renderPriorityProcessItem(p)).join(''); }
        if (otherProcs.length > 0) { html += '<div class="process-category">其他进程</div>'; html += otherProcs.map(p => this.renderPriorityProcessItem(p)).join(''); }
        container.innerHTML = html;
        container.querySelectorAll('.priority-process-item').forEach(item => { item.addEventListener('click', () => this.selectPriorityProcess(item.dataset.name)); });
    }
    renderPriorityProcessItem(proc) { const initial = proc.name.charAt(0).toUpperCase(); return `<div class="priority-process-item" data-name="${proc.name}" data-pid="${proc.pid}"><div class="process-icon">${initial}</div><div class="process-details"><div class="process-name">${proc.name}</div><div class="process-pid">PID: ${proc.pid}</div></div></div>`; }
    filterPriorityProcessList(keyword) { const filtered = this.priorityProcesses.filter(p => p.name.toLowerCase().includes(keyword.toLowerCase())); this.renderPriorityProcessList(filtered); }
    selectPriorityProcess(processName) { this.selectedPriorityProcess = processName; this.hideOverlay('priority-process-overlay'); this.showPrioritySetting(); }
    showPrioritySetting() {
        this.showOverlay('priority-setting-overlay');
        document.getElementById('priority-selected-process').innerHTML = `<span class="process-name">${this.selectedPriorityProcess}</span>`;
        if (this.priorityRules[this.selectedPriorityProcess]) { const rule = this.priorityRules[this.selectedPriorityProcess]; this.selectedNice = rule.nice; this.selectedIoClass = rule.ioClass; this.selectedIoLevel = rule.ioLevel; }
        else { this.selectedNice = 0; this.selectedIoClass = 2; this.selectedIoLevel = 4; }
        const niceSlider = document.getElementById('nice-slider'); const niceValue = document.getElementById('nice-slider-value');
        niceSlider.value = this.selectedNice; niceValue.textContent = this.selectedNice;
        this.updateSliderProgress(niceSlider);
        document.querySelectorAll('.io-option').forEach(opt => { opt.classList.toggle('selected', parseInt(opt.dataset.class) === this.selectedIoClass); });
    }
    async savePriorityRule() {
        if (!this.selectedPriorityProcess) { this.showToast('请先选择进程'); return false; }
        const nextRules = { ...this.priorityRules, [this.selectedPriorityProcess]: { nice: this.selectedNice, ioClass: this.selectedIoClass, ioLevel: this.selectedIoLevel } };
        const configContent = this.serializePriorityRules(nextRules);
        const ioClassNames = { 1: '实时', 2: '尽力', 3: '空闲' };
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: `即将保存 ${this.selectedPriorityProcess} 的优先级规则。`,
            configs: [{ filename: 'process_priority.conf', content: configContent }],
            actions: [`尝试对当前同名进程执行 renice=${this.selectedNice} 与 ionice=${ioClassNames[this.selectedIoClass]}`],
            notes: ['如果目标进程当前未运行，则规则会在后续启动时生效。']
        }, {
            onCancel: () => this.loadPriorityConfig()
        });
        if (!confirmed) return false;
        this.priorityRules = nextRules;
        await this.savePriorityConfig();
        const appliedCount = await this.applyPriorityRule(this.selectedPriorityProcess);
        this.hideOverlay('priority-setting-overlay');
        this.renderPriorityRules();
        this.updatePriorityCount();
        this.updateAppPolicyRow(this.selectedPriorityProcess);
        this.reorderAppPolicyRow(this.selectedPriorityProcess);
        this.renderAppPolicySummary();
        if (appliedCount > 0) { this.showToast(`已设置 ${this.selectedPriorityProcess}: nice=${this.selectedNice}, I/O=${ioClassNames[this.selectedIoClass]}`); }
        else { this.showToast(`已保存规则，进程启动时生效`); }
        return true;
    }
    async savePriorityConfig() {
        const processName = this.selectedPriorityProcess;
        const rule = processName ? this.priorityRules[processName] : null;
        if (processName && rule) {
            await this.exec(this.getAppPolicyScript('priority-set', this.shellQuote(processName), String(rule.nice), String(rule.ioClass), String(rule.ioLevel)));
            return;
        }
        const configContent = this.serializePriorityRules();
        await this.writeConfig('process_priority.conf', configContent);
    }
    async applyPriorityRule(processName) {
        const rule = this.priorityRules[processName]; if (!rule) return 0;
        let appliedCount = 0;
        const escaped = processName.replace(/[.[\](){}*+?\\^$|]/g, '\\$&');
        let pids = await this.exec(`pgrep -f "${escaped}" 2>/dev/null`);
        if (!pids || !pids.trim()) {
            pids = await this.exec(`for d in /proc/[0-9]*; do [ -r "$d/cmdline" ] || continue; if tr '\\0' ' ' < "$d/cmdline" 2>/dev/null | grep -F -q "${escaped.replace(/"/g, '\\"')}"; then basename "$d"; fi; done`);
        }
        if (pids && pids.trim()) {
            const pidList = pids.trim().split('\n').filter(p => p.trim());
            const promises = [];
            for (const pid of pidList) { const trimmedPid = pid.trim(); if (trimmedPid) { promises.push(this.exec(`renice -n ${rule.nice} -p ${trimmedPid} 2>/dev/null`)); promises.push(this.exec(`ionice -c ${rule.ioClass} -n ${rule.ioLevel} -p ${trimmedPid} 2>/dev/null`)); appliedCount++; } }
            await Promise.all(promises);
        }
        return appliedCount;
    }
    async editPriorityRule(processName) { this.selectedPriorityProcess = processName; this.showPrioritySetting(); }
    async deletePriorityRule(processName) {
        const nextRules = { ...this.priorityRules };
        delete nextRules[processName];
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: `即将删除 ${processName} 的优先级规则。`,
            configs: [{ filename: 'process_priority.conf', content: this.serializePriorityRules(nextRules) || '# empty' }],
            notes: ['删除后不会再对该应用或进程应用保存的 nice / I/O 优先级。']
        });
        if (!confirmed) return;
        delete this.priorityRules[processName];
        this.selectedPriorityProcess = processName;
        await this.exec(this.getAppPolicyScript('priority-del', this.shellQuote(processName)));
        this.renderPriorityRules();
        this.updatePriorityCount();
        this.updateAppPolicyRow(processName);
        this.renderAppPolicySummary();
        this.showToast(`已删除 ${processName} 的优先级规则`);
    }
    async applyAllPriorityRules() { const promises = Object.keys(this.priorityRules).map(name => this.applyPriorityRule(name)); await Promise.all(promises); }
    initThreadRuleUi() {
        document.getElementById('thread-rule-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'thread-rule-overlay') this.hideOverlay('thread-rule-overlay'); });
        document.getElementById('thread-rule-editor-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'thread-rule-editor-overlay') this.hideOverlay('thread-rule-editor-overlay'); });
                document.getElementById('thread-rule-cancel-btn')?.addEventListener('click', () => this.hideOverlay('thread-rule-editor-overlay'));
        document.getElementById('thread-rule-save-btn')?.addEventListener('click', () => this.saveThreadRule());
        const slider = document.getElementById('thread-nice-slider');
        const value = document.getElementById('thread-nice-slider-value');
        slider?.addEventListener('input', () => { this.selectedThreadNice = parseInt(slider.value, 10) || 0; value.textContent = this.selectedThreadNice; this.updateSliderProgress(slider); });
        document.querySelectorAll('.thread-io-option').forEach(opt => { opt.addEventListener('click', () => { document.querySelectorAll('.thread-io-option').forEach(o => o.classList.remove('selected')); opt.classList.add('selected'); this.selectedThreadIoClass = parseInt(opt.dataset.class, 10); this.selectedThreadIoLevel = parseInt(opt.dataset.level, 10); }); });
    }
    getThreadRuleKey(pkg, pattern) { return `${pkg}|${pattern}`; }
    getThreadRulesForPackage(pkg) { return (this.threadPriorityRules || []).filter(rule => rule.packageName === pkg); }
    getThreadRulePackages() { return [...new Set((this.threadPriorityRules || []).map(rule => rule.packageName).filter(Boolean))]; }
    serializeThreadPriorityRules(rules = this.threadPriorityRules || []) {
        return (rules || []).map(rule => `${rule.packageName}|${rule.threadPattern}=${rule.nice}|${rule.ioClass}|${rule.ioLevel}|${rule.affinity || ''}|${rule.schedPolicy || 'normal'}|${rule.rtPrio ?? 1}|${rule.cpuset || ''}|${rule.waltBoost ? '1' : '0'}|${rule.waltPipeline ? '1' : '0'}|${rule.uclampMin ?? ''}|${rule.uclampMax ?? ''}`).join('\n');
    }
    async loadThreadPriorityConfig() {
        const config = await this.exec(`cat ${this.configDir}/thread_priority.conf 2>/dev/null`);
        this.threadPriorityRules = [];
        if (config && config.trim()) {
            config.trim().split('\n').forEach(line => {
                if (!line || !line.includes('=')) return;
                const idx = line.indexOf('=');
                const target = line.slice(0, idx).trim();
                const values = line.slice(idx + 1).trim();
                const splitIndex = target.indexOf('|');
                if (splitIndex <= 0) return;
                const packageName = target.slice(0, splitIndex).trim();
                const threadPattern = target.slice(splitIndex + 1).trim();
                const parts = values.split('|');
                const [nice, ioClass, ioLevel, affinity = '', schedPolicy = 'normal', rtPrio = '1', cpuset = '', waltBoost = '0', waltPipeline = '0', uclampMin = '', uclampMax = ''] = parts;
                this.threadPriorityRules.push({ key: this.getThreadRuleKey(packageName, threadPattern), packageName, threadPattern, nice: parseInt(nice || '0', 10) || 0, ioClass: parseInt(ioClass || '2', 10) || 2, ioLevel: parseInt(ioLevel || '4', 10) || 4, affinity: String(affinity || '').trim(), schedPolicy: String(schedPolicy || 'normal').trim() || 'normal', rtPrio: parseInt(rtPrio || '1', 10) || 1, cpuset: String(cpuset || '').trim(), waltBoost: String(waltBoost || '0') === '1', waltPipeline: String(waltPipeline || '0') === '1', uclampMin: String(uclampMin || '').trim(), uclampMax: String(uclampMax || '').trim() });
            });
        }
        this.renderAppPolicySummary();
    }
    async saveThreadPriorityConfig() {
        await this.writeConfig('thread_priority.conf', this.serializeThreadPriorityRules());
    }
    async applyThreadPriorityRulesNow() {
        await this.exec(`sh ${this.shellQuote(`${this.modDir}/service.sh`)} --apply-thread-priority >/dev/null 2>&1`);
        await this.syncAppPolicyDaemon();
    }
    getCommonThreadPresets() { return ['RenderThread', 'MainThread', 'GameThread', 'GLThread', 'RHIThread', 'DAVA::RhiThread', 'Thread-*']; }
    async loadLiveThreadSuggestions(pkg, force = false) {
        const key = String(pkg || '').trim();
        if (!force && this.threadSuggestionCache && Array.isArray(this.threadSuggestionCache[key])) return this.threadSuggestionCache[key];
        const output = await this.exec(this.getAppPolicyScript('thread-list', this.shellQuote(pkg)));
        const items = String(output || '').split('\n').map(item => item.trim()).filter(Boolean);
        this.threadSuggestionCache[key] = items;
        return items;
    }
    renderThreadChips(containerId, items, onPick) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const unique = [...new Set((items || []).filter(Boolean))];
        if (unique.length === 0) { container.innerHTML = '<div class="priority-empty">暂无可用线程</div>'; return; }
        container.innerHTML = unique.map(item => `<div class="thread-chip" data-value="${this.escapeHtml(item)}">${this.escapeHtml(item)}</div>`).join('');
        container.querySelectorAll('.thread-chip').forEach(chip => chip.addEventListener('click', () => onPick(chip.dataset.value || '')));
    }
    renderThreadRuleList() {
        const list = document.getElementById('thread-rule-list');
        if (!list) return;
        const rules = this.getThreadRulesForPackage(this.selectedThreadRulePackage);
        if (rules.length === 0) {
            list.innerHTML = '<div class="priority-empty">该应用还没有线程规则</div>';
            return;
        }
        list.innerHTML = rules.map(rule => `<div class="thread-rule-item" data-key="${this.escapeHtml(rule.key)}"><div class="thread-rule-info"><div class="thread-rule-name">${this.escapeHtml(rule.threadPattern)}</div><div class="thread-rule-values">nice ${rule.nice} · I/O ${rule.ioClass}/${rule.ioLevel}${rule.affinity ? ` · 亲和性 ${this.escapeHtml(rule.affinity)}` : ''}${rule.cpuset ? ` · cpuset ${this.escapeHtml(rule.cpuset)}` : ''}${rule.uclampMin !== '' ? ` · uclamp.min ${this.escapeHtml(String(rule.uclampMin))}` : ''}${rule.uclampMax !== '' ? ` · uclamp.max ${this.escapeHtml(String(rule.uclampMax))}` : ''}${rule.schedPolicy && rule.schedPolicy !== 'normal' ? ` · ${this.escapeHtml(rule.schedPolicy)}(${rule.rtPrio})` : ''}${rule.waltBoost ? ' · WALT boost' : ''}${rule.waltPipeline ? ' · pipeline' : ''}</div></div><div class="thread-rule-actions"><button class="priority-rule-btn edit" data-action="edit" data-key="${this.escapeHtml(rule.key)}">✎</button><button class="priority-rule-btn delete" data-action="delete" data-key="${this.escapeHtml(rule.key)}">✕</button></div></div>`).join('');
        list.querySelectorAll('.priority-rule-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const key = btn.dataset.key; if (btn.dataset.action === 'edit') this.openThreadRuleEditor(key); else this.deleteThreadRule(key); }));
    }
    async openThreadRuleManager(pkg, label) {
        this.selectedThreadRulePackage = pkg;
        this.selectedThreadRuleLabel = label || pkg;
        const title = document.getElementById('thread-rule-title');
        if (title) title.textContent = `${label || pkg} · 线程规则`;
        this.renderThreadRuleList();
        this.renderThreadChips('thread-rule-common-list', this.getCommonThreadPresets(), (pattern) => this.openThreadRuleEditor(null, pattern));
        const live = document.getElementById('thread-rule-live-list');
        if (live) live.innerHTML = '<div class="priority-loading">正在读取...</div>';
        this.showOverlay('thread-rule-overlay');
        requestAnimationFrame(() => {
            this.loadLiveThreadSuggestions(pkg).then((liveThreads) => {
                if (this.selectedThreadRulePackage !== pkg) return;
                this.renderThreadChips('thread-rule-live-list', liveThreads, (pattern) => this.openThreadRuleEditor(null, pattern));
            }).catch(() => {
                if (this.selectedThreadRulePackage !== pkg) return;
                const container = document.getElementById('thread-rule-live-list');
                if (container) container.innerHTML = '<div class="priority-empty">读取线程失败</div>';
            });
        });
    }
    openThreadRuleEditor(ruleKey = null, presetPattern = '') {
        const existing = ruleKey ? (this.threadPriorityRules || []).find(item => item.key === ruleKey) : null;
        this.selectedThreadRuleKey = ruleKey || null;
        this.selectedThreadPattern = existing?.threadPattern || presetPattern || '';
        this.selectedThreadNice = existing?.nice ?? 0;
        this.selectedThreadIoClass = existing?.ioClass ?? 2;
        this.selectedThreadIoLevel = existing?.ioLevel ?? 4;
        this.selectedThreadAffinity = existing?.affinity || '';
        this.selectedThreadCpuset = existing?.cpuset || '';
        this.selectedThreadUclampMin = existing?.uclampMin ?? '';
        this.selectedThreadUclampMax = existing?.uclampMax ?? '';
        this.selectedThreadSchedPolicy = existing?.schedPolicy || 'normal';
        this.selectedThreadRtPrio = existing?.rtPrio ?? 1;
        this.selectedThreadWaltBoost = !!existing?.waltBoost;
        this.selectedThreadWaltPipeline = !!existing?.waltPipeline;
        const title = document.getElementById('thread-rule-editor-title');
        if (title) title.textContent = `${this.selectedThreadRuleLabel || this.selectedThreadRulePackage} · 线程规则`;
        const appInfo = document.getElementById('thread-rule-selected-app');
        if (appInfo) appInfo.innerHTML = `<span class="process-name">${this.escapeHtml(this.selectedThreadRulePackage)}</span>`;
        const input = document.getElementById('thread-pattern-input');
        const affinity = document.getElementById('thread-affinity-input');
        const cpuset = document.getElementById('thread-cpuset-group');
        const uclampMin = document.getElementById('thread-uclamp-min');
        const uclampMax = document.getElementById('thread-uclamp-max');
        const sched = document.getElementById('thread-sched-policy');
        const rt = document.getElementById('thread-rt-prio');
        const waltBoost = document.getElementById('thread-walt-boost');
        const waltPipeline = document.getElementById('thread-walt-pipeline');
        const slider = document.getElementById('thread-nice-slider');
        const sliderValue = document.getElementById('thread-nice-slider-value');
        if (input) input.value = this.selectedThreadPattern;
        if (affinity) affinity.value = this.selectedThreadAffinity;
        if (cpuset) cpuset.value = this.selectedThreadCpuset;
        if (uclampMin) uclampMin.value = this.selectedThreadUclampMin;
        if (uclampMax) uclampMax.value = this.selectedThreadUclampMax;
        if (sched) sched.value = this.selectedThreadSchedPolicy;
        if (rt) rt.value = String(this.selectedThreadRtPrio);
        if (waltBoost) waltBoost.checked = this.selectedThreadWaltBoost;
        if (waltPipeline) waltPipeline.checked = this.selectedThreadWaltPipeline;
        if (slider) { slider.value = String(this.selectedThreadNice); this.updateSliderProgress(slider); }
        if (sliderValue) sliderValue.textContent = String(this.selectedThreadNice);
        document.querySelectorAll('.thread-io-option').forEach(opt => opt.classList.toggle('selected', parseInt(opt.dataset.class, 10) === this.selectedThreadIoClass));
        this.showOverlay('thread-rule-editor-overlay');
    }
    async saveThreadRule() {
        const threadPattern = (document.getElementById('thread-pattern-input')?.value || '').trim();
        const affinity = (document.getElementById('thread-affinity-input')?.value || '').trim();
        const cpuset = (document.getElementById('thread-cpuset-group')?.value || '').trim();
        const uclampMin = (document.getElementById('thread-uclamp-min')?.value || '').trim();
        const uclampMax = (document.getElementById('thread-uclamp-max')?.value || '').trim();
        const schedPolicy = (document.getElementById('thread-sched-policy')?.value || 'normal').trim();
        const rtPrio = parseInt(document.getElementById('thread-rt-prio')?.value || '1', 10) || 1;
        const waltBoost = !!document.getElementById('thread-walt-boost')?.checked;
        const waltPipeline = !!document.getElementById('thread-walt-pipeline')?.checked;
        if (!threadPattern) { this.showToast('请输入线程名或模式'); return false; }
        const nextRule = { key: this.getThreadRuleKey(this.selectedThreadRulePackage, threadPattern), packageName: this.selectedThreadRulePackage, threadPattern, nice: this.selectedThreadNice, ioClass: this.selectedThreadIoClass, ioLevel: this.selectedThreadIoLevel, affinity, cpuset, uclampMin, uclampMax, schedPolicy, rtPrio, waltBoost, waltPipeline };
        const nextRules = (this.threadPriorityRules || []).filter(rule => rule.key !== this.selectedThreadRuleKey && rule.key !== nextRule.key);
        nextRules.push(nextRule);
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: `即将为 ${this.selectedThreadRulePackage} 保存线程规则 ${threadPattern}。`,
            configs: [{ filename: 'thread_priority.conf', content: this.serializeThreadPriorityRules(nextRules) }],
            actions: [affinity ? `对命中线程设置亲和性 ${affinity}` : '不修改线程亲和性', cpuset ? `将命中线程迁入 cpuset ${cpuset}` : '不调整 cpuset 分组', uclampMin !== '' ? `设置 uclamp.min=${uclampMin}` : '不设置 uclamp.min', uclampMax !== '' ? `设置 uclamp.max=${uclampMax}` : '不设置 uclamp.max', schedPolicy !== 'normal' ? `设置调度策略 ${schedPolicy} (rt=${rtPrio})` : '保持 normal 调度策略', waltBoost ? '启用 WALT per-task boost 并关闭 task_reduce_affinity' : '不启用 WALT per-task boost', waltPipeline ? '启用 WALT pipeline special' : '不启用 WALT pipeline special', `设置 nice=${this.selectedThreadNice} 与 I/O=${this.selectedThreadIoClass}/${this.selectedThreadIoLevel}`],
            notes: ['规则会对命中的线程 TID 应用，不影响未匹配线程。']
        });
        if (!confirmed) return false;
        this.threadPriorityRules = nextRules;
        await this.saveThreadPriorityConfig();
        await this.applyThreadPriorityRulesNow();
        this.hideOverlay('thread-rule-editor-overlay');
        this.renderThreadRuleList();
        this.renderAppPolicySummary();
        this.updateAppPolicyRow(this.selectedThreadRulePackage);
        this.reorderAppPolicyRow(this.selectedThreadRulePackage);
        this.showToast('线程规则已保存');
        return true;
    }
    async deleteThreadRule(ruleKey) {
        const nextRules = (this.threadPriorityRules || []).filter(rule => rule.key !== ruleKey);
        const rule = (this.threadPriorityRules || []).find(item => item.key === ruleKey);
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: `即将删除线程规则 ${rule?.threadPattern || ruleKey}。`,
            configs: [{ filename: 'thread_priority.conf', content: this.serializeThreadPriorityRules(nextRules) || '# empty' }],
            notes: ['删除后不会再对匹配线程应用自定义亲和性与调度策略。']
        });
        if (!confirmed) return;
        this.threadPriorityRules = nextRules;
        await this.saveThreadPriorityConfig();
        await this.applyThreadPriorityRulesNow();
        this.renderThreadRuleList();
        this.renderAppPolicySummary();
        this.updateAppPolicyRow(this.selectedThreadRulePackage);
        this.showToast('线程规则已删除');
    }
    async detectKernelFeatures() {
        const [lruGen, thp, ksm, compaction] = await Promise.all([
            this.exec('cat /sys/kernel/mm/lru_gen/enabled 2>/dev/null'),
            this.exec('cat /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null'),
            this.exec('cat /sys/kernel/mm/ksm/run 2>/dev/null'),
            this.exec('cat /proc/sys/vm/compaction_proactiveness 2>/dev/null')
        ]);
        this.kernelFeatures.lruGen = lruGen !== '';
        this.kernelFeatures.thp = thp !== '';
        this.kernelFeatures.ksm = ksm !== '';
        this.kernelFeatures.compaction = compaction !== '';
    }
    initZramWriteback() {
        const list = document.getElementById('zram-writeback-list');
        if (!list) return;
        list.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async () => {
                list.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                this.state.zramWriteback = item.dataset.value;
                await this.saveZramConfig();
            });
        });
    }
    initZramPath() {
        const pathInput = document.getElementById('zram-path-input');
        const detectBtn = document.getElementById('zram-path-detect');
        const saveBtn = document.getElementById('zram-path-save');
        if (pathInput) {
            pathInput.value = this.state.zramPath;
        }
        if (detectBtn) {
            detectBtn.addEventListener('click', async () => {
                this.showLoading(true);
                const zramDevices = await this.exec('ls /dev/block/zram* 2>/dev/null || ls /dev/zram* 2>/dev/null');
                this.showLoading(false);
                if (zramDevices.trim()) {
                    const devices = zramDevices.trim().split('\n').filter(d => d);
                    if (devices.length === 1) {
                        pathInput.value = devices[0];
                        this.state.zramPath = devices[0];
                        this.showToast(`检测到: ${devices[0]}`);
                    } else if (devices.length > 1) {
                        this.showZramDeviceSelector(devices, pathInput);
                    }
                } else {
                    this.showToast('未检测到 ZRAM 设备');
                }
            });
        }
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const newPath = pathInput.value.trim();
                if (!newPath) {
                    this.showToast('路径不能为空');
                    return;
                }
                if (!newPath.startsWith('/dev/')) {
                    this.showToast('路径必须以 /dev/ 开头');
                    return;
                }
                this.state.zramPath = newPath;
                const saved = await this.saveZramConfig();
                if (!saved) return;
                await this.loadZramStatus();
            });
        }
    }
    showZramDeviceSelector(devices, pathInput) {
        const overlay = document.createElement('div');
        overlay.className = 'detail-overlay show';
        overlay.innerHTML = `
            <div class="detail-container">
                <div class="detail-header">
                    <span class="detail-title">选择 ZRAM 设备</span>
                    <button class="detail-close" id="zram-selector-close">✕</button>
                </div>
                <div class="detail-content" style="padding: 16px;">
                    ${devices.map(d => `<div class="option-item zram-device-option" data-path="${d}" style="margin-bottom: 8px; padding: 12px;">${d}</div>`).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#zram-selector-close').addEventListener('click', () => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
        });
        overlay.querySelectorAll('.zram-device-option').forEach(opt => {
            opt.addEventListener('click', () => {
                pathInput.value = opt.dataset.path;
                this.state.zramPath = opt.dataset.path;
                overlay.classList.remove('show');
                setTimeout(() => overlay.remove(), 300);
                this.showToast(`已选择: ${opt.dataset.path}`);
            });
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('show');
                setTimeout(() => overlay.remove(), 300);
            }
        });
    }
    initSwapSettings() {
        const swapSwitch = document.getElementById('swap-switch');
        const swapSizeSlider = document.getElementById('swap-size-slider');
        const priorityList = document.getElementById('swap-priority-list');
        if (swapSwitch) {
            swapSwitch.addEventListener('change', (e) => {
                this.state.swapEnabled = e.target.checked;
                this.toggleSwapSettings(e.target.checked);
                this.saveSwapConfig();
            });
        }
        if (swapSizeSlider) {
            swapSizeSlider.addEventListener('input', (e) => {
                this.state.swapSize = parseInt(e.target.value);
                document.getElementById('swap-size-value').textContent = `${this.state.swapSize} MB`;
            });
            swapSizeSlider.addEventListener('change', (e) => {
                this.state.swapSize = parseInt(e.target.value);
                if (this.state.swapEnabled) this.saveSwapConfig();
            });
        }
        if (priorityList) {
            priorityList.querySelectorAll('.option-item').forEach(item => {
                item.addEventListener('click', () => {
                    priorityList.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    this.state.swapPriority = parseInt(item.dataset.value);
                    if (this.state.swapEnabled) this.saveSwapConfig();
                });
            });
        }
        this.loadSwapConfig();
        const swapApplyBtn = document.getElementById('swap-apply-btn');
        if (swapApplyBtn) swapApplyBtn.addEventListener('click', async (e) => { e.stopPropagation(); if (!this.state.swapEnabled) { this.showToast('Swap 未启用'); return; } await this.applySwapImmediate(); });
    }
    toggleSwapSettings(show) {
        const settings = document.getElementById('swap-settings');
        if (show) {
            settings.classList.remove('hidden');
        } else {
            settings.classList.add('hidden');
        }
    }
    async loadSwapConfig() {
        const config = await this.exec(`cat ${this.shellQuote(`${this.configDir}/swap.conf`)} 2>/dev/null`);
        if (config) {
            const enabledMatch = config.match(/enabled=(\d)/);
            const sizeMatch = config.match(/size=(\d+)/);
            const priorityMatch = config.match(/priority=([\-\d]+)/);
            const pathMatch = config.match(/^path=(.+)$/m);
            if (enabledMatch) {
                this.state.swapEnabled = enabledMatch[1] === '1';
                const sw = document.getElementById('swap-switch');
                if (sw) sw.checked = this.state.swapEnabled;
                this.toggleSwapSettings(this.state.swapEnabled);
            }
            if (sizeMatch) {
                this.state.swapSize = parseInt(sizeMatch[1]);
                const slider = document.getElementById('swap-size-slider');
                if (slider) {
                    slider.value = this.state.swapSize;
                    this.updateSliderProgress(slider);
                }
                document.getElementById('swap-size-value').textContent = `${this.state.swapSize} MB`;
            }
            if (priorityMatch) {
                this.state.swapPriority = parseInt(priorityMatch[1]);
                const list = document.getElementById('swap-priority-list');
                if (list) {
                    list.querySelectorAll('.option-item').forEach(i => {
                        i.classList.toggle('selected', parseInt(i.dataset.value) === this.state.swapPriority);
                    });
                }
            }
            if (pathMatch && pathMatch[1].trim()) this.state.swapPath = pathMatch[1].trim();
        }
        await this.loadSwapStatus();
    }
    async saveSwapConfig(skipPreview = false) {
        const swapPath = this.state.swapPath || this.runtimeConfig.swapPath || `${this.modDir}/swapfile.img`;
        const config = `enabled=${this.state.swapEnabled ? '1' : '0'}\nsize=${this.state.swapSize}\npriority=${this.state.swapPriority}\npath=${swapPath}`;
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: this.state.swapEnabled ? '即将保存 Swap 配置。' : '即将关闭 Swap。',
                configs: [{ filename: 'swap.conf', content: config }],
                actions: !this.state.swapEnabled ? [`swapoff ${swapPath}`, `rm -f ${swapPath}`] : [],
                notes: this.state.swapEnabled ? ['仅保存配置，不立即创建 Swap 文件。'] : []
            }, {
                onCancel: () => this.loadSwapConfig()
            });
            if (!confirmed) return false;
        }
        await this.writeConfig('swap.conf', config);
        if (!this.state.swapEnabled) {
            await this.exec(`swapoff ${this.shellQuote(swapPath)} 2>/dev/null`);
            await this.exec(`rm -f ${this.shellQuote(swapPath)} 2>/dev/null`);
            this.showToast('Swap 已关闭');
            await this.loadSwapStatus();
        } else {
            this.showToast('Swap 配置已保存');
        }
        return true;
    }
    async applySwapImmediate(skipPreview = false) {
      return this.withLock('swap', async () => {
        const swapPath = this.state.swapPath || this.runtimeConfig.swapPath || `${this.modDir}/swapfile.img`;
        const q = this.shellQuote(swapPath);
        if (!skipPreview) {
            const config = `enabled=1\nsize=${this.state.swapSize}\npriority=${this.state.swapPriority}\npath=${swapPath}`;
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将创建并启用 Swap。',
                configs: [{ filename: 'swap.conf', content: config }],
                actions: [
                    `swapoff ${swapPath}`,
                    `rm -f ${swapPath}`,
                    `创建 ${this.state.swapSize}MB Swap 文件`,
                    `mkswap ${swapPath}`,
                    this.state.swapPriority !== 0 ? `swapon ${swapPath} -p ${this.state.swapPriority}` : `swapon ${swapPath}`
                ]
            }, {
                onCancel: () => this.loadSwapConfig()
            });
            if (!confirmed) return false;
        }
        this.showLoading(true);
        try {
            await this.exec(`swapoff ${q} 2>/dev/null`);
            await this.exec(`rm -f ${q} 2>/dev/null`);
            const free = parseInt((await this.exec(`df -k ${this.shellQuote(swapPath.substring(0, swapPath.lastIndexOf('/')) || '/data')} 2>/dev/null | awk 'NR==2{print $4}'`)).trim()) || 0;
            const needKb = this.state.swapSize * 1024;
            if (free && free < needKb + 51200) {
                this.showToast(`Swap 创建失败：剩余空间不足（需 ${this.state.swapSize}MB，剩 ${Math.floor(free/1024)}MB）`);
                await this.loadSwapStatus();
                return false;
            }
            const allocOut = await this.exec(`(fallocate -l ${this.state.swapSize}M ${q} 2>&1 || dd if=/dev/zero of=${q} bs=1M count=${this.state.swapSize} 2>&1) ; ls -l ${q} 2>/dev/null`);
            if (!allocOut.includes(swapPath)) {
                this.showToast(`Swap 文件创建失败`);
                await this.exec(`rm -f ${q} 2>/dev/null`);
                await this.loadSwapStatus();
                return false;
            }
            await this.exec(`chmod 600 ${q}`);
            const mkOut = await this.exec(`mkswap ${q} 2>&1`);
            if (/error|fail/i.test(mkOut)) {
                this.showToast(`mkswap 失败：${mkOut.split('\n')[0]}`);
                await this.exec(`rm -f ${q} 2>/dev/null`);
                await this.loadSwapStatus();
                return false;
            }
            let onOut;
            if (this.state.swapPriority !== 0) {
                onOut = await this.exec(`swapon ${q} -p ${this.state.swapPriority} 2>&1`);
            } else {
                onOut = await this.exec(`swapon ${q} 2>&1`);
            }
            if (/error|fail|invalid/i.test(onOut)) {
                this.showToast(`swapon 失败：${onOut.split('\n')[0]}`);
                await this.loadSwapStatus();
                return false;
            }
            this.showToast(`Swap 已启用 (${this.state.swapSize} MB)`);
            await this.loadSwapStatus();
            return true;
        } finally {
            this.showLoading(false);
        }
      });
    }
    async loadSwapStatus() {
        const swaps = await this.exec('cat /proc/swaps 2>/dev/null | grep -v zram | grep -v Filename');
        const statusEl = document.getElementById('swap-current-status');
        const sizeEl = document.getElementById('swap-current-size');
        const badgeEl = document.getElementById('swap-status');
        if (swaps && swaps.trim()) {
            const parts = swaps.trim().split(/\s+/);
            const size = parts[2] ? (parseInt(parts[2]) / 1024).toFixed(0) : '0';
            if (statusEl) statusEl.textContent = '已启用';
            if (sizeEl) sizeEl.textContent = `${size} MB`;
            if (badgeEl) badgeEl.textContent = '已启用';
        } else {
            if (statusEl) statusEl.textContent = '未启用';
            if (sizeEl) sizeEl.textContent = '--';
            if (badgeEl) badgeEl.textContent = '未启用';
        }
    }
    initVmSettings() {
        const watermarkSlider = document.getElementById('watermark-slider');
        const extraFreeSlider = document.getElementById('extra-free-slider');
        const dirtyRatioSlider = document.getElementById('dirty-ratio-slider');
        const dirtyBgSlider = document.getElementById('dirty-bg-slider');
        const vfsPressureSlider = document.getElementById('vfs-pressure-slider');
        if (watermarkSlider) {
            watermarkSlider.addEventListener('input', (e) => {
                this.state.watermarkScale = parseInt(e.target.value);
                document.getElementById('watermark-value').textContent = this.state.watermarkScale;
            });
            watermarkSlider.addEventListener('change', () => this.applyVmConfig());
        }
        if (extraFreeSlider) {
            extraFreeSlider.addEventListener('input', (e) => {
                this.state.extraFreeKbytes = parseInt(e.target.value);
                document.getElementById('extra-free-value').textContent = `${this.state.extraFreeKbytes} KB`;
            });
            extraFreeSlider.addEventListener('change', () => this.applyVmConfig());
        }
        if (dirtyRatioSlider) {
            dirtyRatioSlider.addEventListener('input', (e) => {
                this.state.dirtyRatio = parseInt(e.target.value);
                document.getElementById('dirty-ratio-value').textContent = `${this.state.dirtyRatio}%`;
            });
            dirtyRatioSlider.addEventListener('change', () => this.applyVmConfig());
        }
        if (dirtyBgSlider) {
            dirtyBgSlider.addEventListener('input', (e) => {
                this.state.dirtyBgRatio = parseInt(e.target.value);
                document.getElementById('dirty-bg-value').textContent = `${this.state.dirtyBgRatio}%`;
            });
            dirtyBgSlider.addEventListener('change', () => this.applyVmConfig());
        }
        if (vfsPressureSlider) {
            vfsPressureSlider.addEventListener('input', (e) => {
                this.state.vfsCachePressure = parseInt(e.target.value);
                document.getElementById('vfs-pressure-value').textContent = this.state.vfsCachePressure;
            });
            vfsPressureSlider.addEventListener('change', () => this.applyVmConfig());
        }
        this.loadVmConfig();
    }
    async loadVmConfig() {
        const config = await this.exec(`cat ${this.configDir}/vm.conf 2>/dev/null`);
        this.state.vmEnabled = this.parseEnabledFlag(config, !!config);
        const vmSwitch = document.getElementById('vm-switch');
        if (vmSwitch) vmSwitch.checked = this.state.vmEnabled;
        const vmStatus = document.getElementById('vm-status');
        if (vmStatus) vmStatus.textContent = this.state.vmEnabled ? (config ? '已修改' : '默认') : '已禁用';
        if (config) {
            const watermarkMatch = config.match(/watermark_scale_factor=(\d+)/);
            const extraFreeMatch = config.match(/extra_free_kbytes=(\d+)/);
            const dirtyRatioMatch = config.match(/dirty_ratio=(\d+)/);
            const dirtyBgMatch = config.match(/dirty_background_ratio=(\d+)/);
            const vfsMatch = config.match(/vfs_cache_pressure=(\d+)/);
            if (watermarkMatch) { this.state.watermarkScale = parseInt(watermarkMatch[1]); this.updateVmSlider('watermark-slider', 'watermark-value', this.state.watermarkScale, ''); }
            if (extraFreeMatch) { this.state.extraFreeKbytes = parseInt(extraFreeMatch[1]); this.updateVmSlider('extra-free-slider', 'extra-free-value', this.state.extraFreeKbytes, ' KB'); }
            if (dirtyRatioMatch) { this.state.dirtyRatio = parseInt(dirtyRatioMatch[1]); this.updateVmSlider('dirty-ratio-slider', 'dirty-ratio-value', this.state.dirtyRatio, '%'); }
            if (dirtyBgMatch) { this.state.dirtyBgRatio = parseInt(dirtyBgMatch[1]); this.updateVmSlider('dirty-bg-slider', 'dirty-bg-value', this.state.dirtyBgRatio, '%'); }
            if (vfsMatch) { this.state.vfsCachePressure = parseInt(vfsMatch[1]); this.updateVmSlider('vfs-pressure-slider', 'vfs-pressure-value', this.state.vfsCachePressure, ''); }
        }
    }
    updateVmSlider(sliderId, valueId, val, suffix) {
        const slider = document.getElementById(sliderId);
        const value = document.getElementById(valueId);
        if (slider) { slider.value = val; this.updateSliderProgress(slider); }
        if (value) value.textContent = `${val}${suffix}`;
    }
    async applyVmConfig(skipPreview = false) {
      return this.withLock('vm', async () => {
        const config = `enabled=${this.state.vmEnabled ? '1' : '0'}\nwatermark_scale_factor=${this.state.watermarkScale}\nextra_free_kbytes=${this.state.extraFreeKbytes}\ndirty_ratio=${this.state.dirtyRatio}\ndirty_background_ratio=${this.state.dirtyBgRatio}\nvfs_cache_pressure=${this.state.vfsCachePressure}`;
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将应用虚拟内存参数。',
                configs: [{ filename: 'vm.conf', content: config }],
                writes: [
                    { path: '/proc/sys/vm/watermark_scale_factor', value: String(this.state.watermarkScale) },
                    { path: '/proc/sys/vm/extra_free_kbytes', value: String(this.state.extraFreeKbytes) },
                    { path: '/proc/sys/vm/dirty_ratio', value: String(this.state.dirtyRatio) },
                    { path: '/proc/sys/vm/dirty_background_ratio', value: String(this.state.dirtyBgRatio) },
                    { path: '/proc/sys/vm/vfs_cache_pressure', value: String(this.state.vfsCachePressure) }
                ]
            }, {
                onCancel: () => this.loadVmConfig()
            });
            if (!confirmed) return false;
        }
        if (!this.state.vmEnabled) {
            return this.saveDisabledConfig('vm.conf', config, 'VM 配置已保存（禁用状态）');
        }
        this.showLoading(true);
        await this.writeConfig('vm.conf', config);
        await Promise.all([
            this.exec(`echo ${this.state.watermarkScale} > /proc/sys/vm/watermark_scale_factor 2>/dev/null`),
            this.exec(`echo ${this.state.extraFreeKbytes} > /proc/sys/vm/extra_free_kbytes 2>/dev/null`),
            this.exec(`echo ${this.state.dirtyRatio} > /proc/sys/vm/dirty_ratio 2>/dev/null`),
            this.exec(`echo ${this.state.dirtyBgRatio} > /proc/sys/vm/dirty_background_ratio 2>/dev/null`),
            this.exec(`echo ${this.state.vfsCachePressure} > /proc/sys/vm/vfs_cache_pressure 2>/dev/null`)
        ]);
        this.showLoading(false);
        this.showToast('VM 参数已应用');
        const vmStatus = document.getElementById('vm-status');
        if (vmStatus) vmStatus.textContent = this.state.vmEnabled ? '已修改' : '已禁用';
        return true;
      });
    }
    initKernelFeatures() {
        const emptyEl = document.getElementById('kernel-features-empty');
        const lruStatus = document.getElementById('lru-status');
        let featureCount = 0;
        if (this.kernelFeatures.lruGen) {
            featureCount++;
            const el = document.getElementById('lru-gen-container');
            if (el) el.style.display = '';
            const sw = document.getElementById('lru-gen-switch');
            if (sw) sw.addEventListener('change', (e) => { this.state.lruGenEnabled = e.target.checked; this.applyKernelFeatures(); });
        }
        if (this.kernelFeatures.thp) {
            featureCount++;
            const el = document.getElementById('thp-container');
            if (el) el.style.display = '';
            const list = document.getElementById('thp-list');
            if (list) {
                list.querySelectorAll('.option-item').forEach(item => {
                    item.addEventListener('click', () => {
                        list.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                        item.classList.add('selected');
                        this.state.thp = item.dataset.value;
                        this.applyKernelFeatures();
                    });
                });
            }
        }
        if (this.kernelFeatures.ksm) {
            featureCount++;
            const el = document.getElementById('ksm-container');
            if (el) el.style.display = '';
            const sw = document.getElementById('ksm-switch');
            if (sw) sw.addEventListener('change', (e) => { this.state.ksmEnabled = e.target.checked; this.applyKernelFeatures(); });
        }
        if (this.kernelFeatures.compaction) {
            featureCount++;
            const el = document.getElementById('compaction-container');
            if (el) el.style.display = '';
            const sw = document.getElementById('compaction-switch');
            if (sw) sw.addEventListener('change', (e) => { this.state.compactionEnabled = e.target.checked; this.applyKernelFeatures(); });
        }
        if (featureCount > 0) {
            if (emptyEl) emptyEl.style.display = 'none';
            if (lruStatus) lruStatus.textContent = `${featureCount}项可用`;
        } else {
            if (lruStatus) lruStatus.textContent = '不可用';
        }
        this.loadKernelFeaturesConfig();
    }
    async loadKernelFeaturesConfig() {
        const config = await this.exec(`cat ${this.configDir}/kernel.conf 2>/dev/null`);
        if (config) {
            const lruMatch = config.match(/lru_gen=(\d)/);
            const thpMatch = config.match(/thp=(\w+)/);
            const ksmMatch = config.match(/ksm=(\d)/);
            const compactMatch = config.match(/compaction=(\d)/);
            if (lruMatch && this.kernelFeatures.lruGen) {
                this.state.lruGenEnabled = lruMatch[1] === '1';
                const sw = document.getElementById('lru-gen-switch');
                if (sw) sw.checked = this.state.lruGenEnabled;
            }
            if (thpMatch && this.kernelFeatures.thp) {
                this.state.thp = thpMatch[1];
                const list = document.getElementById('thp-list');
                if (list) list.querySelectorAll('.option-item').forEach(i => i.classList.toggle('selected', i.dataset.value === this.state.thp));
            }
            if (ksmMatch && this.kernelFeatures.ksm) {
                this.state.ksmEnabled = ksmMatch[1] === '1';
                const sw = document.getElementById('ksm-switch');
                if (sw) sw.checked = this.state.ksmEnabled;
            }
            if (compactMatch && this.kernelFeatures.compaction) {
                this.state.compactionEnabled = compactMatch[1] === '1';
                const sw = document.getElementById('compaction-switch');
                if (sw) sw.checked = this.state.compactionEnabled;
            }
        }
    }
    async applyKernelFeatures(skipPreview = false) {
      return this.withLock('kernel-features', async () => {
        const config = `lru_gen=${this.state.lruGenEnabled ? '1' : '0'}\nthp=${this.state.thp}\nksm=${this.state.ksmEnabled ? '1' : '0'}\ncompaction=${this.state.compactionEnabled ? '1' : '0'}`;
        if (!skipPreview) {
            const writes = [];
            if (this.kernelFeatures.lruGen) writes.push({ path: '/sys/kernel/mm/lru_gen/enabled', value: this.state.lruGenEnabled ? 'Y' : 'N' });
            if (this.kernelFeatures.thp) writes.push({ path: '/sys/kernel/mm/transparent_hugepage/enabled', value: this.state.thp });
            if (this.kernelFeatures.ksm) writes.push({ path: '/sys/kernel/mm/ksm/run', value: this.state.ksmEnabled ? '1' : '0' });
            if (this.kernelFeatures.compaction) writes.push({ path: '/proc/sys/vm/compaction_proactiveness', value: this.state.compactionEnabled ? '20' : '0' });
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将应用内核特性设置。',
                configs: [{ filename: 'kernel.conf', content: config }],
                writes
            }, {
                onCancel: () => this.loadKernelFeaturesConfig()
            });
            if (!confirmed) return false;
        }
        this.showLoading(true);
        await this.writeConfig('kernel.conf', config);
        const promises = [];
        if (this.kernelFeatures.lruGen) {
            promises.push(this.exec(`echo ${this.state.lruGenEnabled ? 'Y' : 'N'} > /sys/kernel/mm/lru_gen/enabled 2>/dev/null`));
        }
        if (this.kernelFeatures.thp) {
            promises.push(this.exec(`echo ${this.state.thp} > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null`));
        }
        if (this.kernelFeatures.ksm) {
            promises.push(this.exec(`echo ${this.state.ksmEnabled ? '1' : '0'} > /sys/kernel/mm/ksm/run 2>/dev/null`));
        }
        if (this.kernelFeatures.compaction) {
            promises.push(this.exec(`echo ${this.state.compactionEnabled ? '20' : '0'} > /proc/sys/vm/compaction_proactiveness 2>/dev/null`));
        }
        await Promise.all(promises);
        this.showLoading(false);
        this.showToast('内核特性已应用');
        return true;
      });
    }
    initCustomScripts() {
        this.customScripts = {};
        this.editingScriptId = null;
        document.getElementById('scripts-add-btn').addEventListener('click', () => this.showScriptEditor());
        document.getElementById('script-cancel-btn').addEventListener('click', () => this.hideOverlay('script-edit-overlay'));
        document.getElementById('script-save-btn').addEventListener('click', () => this.saveScript());
        document.getElementById('script-edit-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'script-edit-overlay') this.hideOverlay('script-edit-overlay');
        });
        document.querySelectorAll('#script-tags .script-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                document.querySelectorAll('#script-tags .script-tag').forEach(t => t.classList.remove('selected'));
                tag.classList.add('selected');
            });
        });
        this.loadCustomScripts();
    }
    async loadCustomScripts() {
        const base64Data = await this.exec(`cat ${this.configDir}/custom_scripts.b64 2>/dev/null`);
        if (base64Data && base64Data.trim()) {
            try {
                const json = decodeURIComponent(escape(atob(base64Data.trim())));
                this.customScripts = JSON.parse(json);
            } catch (e) {
                this.customScripts = {};
            }
        }
        this.renderScriptsList();
        this.updateScriptsCount();
    }
    async saveCustomScripts() {
        const json = JSON.stringify(this.customScripts);
        const base64Data = btoa(unescape(encodeURIComponent(json)));
        await this.exec(`echo '${base64Data}' > ${this.configDir}/custom_scripts.b64`);
        await this.generateScriptsFile();
    }
    async generateScriptsFile() {
        const scriptsDir = this.modDir + '/scripts.d';
        await this.exec(`rm -f ${scriptsDir}/*.sh 2>/dev/null`);
        for (const id in this.customScripts) {
            const script = this.customScripts[id];
            if (script.enabled) {
                const safeName = id.replace(/[^a-zA-Z0-9_]/g, '_');
                const content = '#!/system/bin/sh\n' + script.code + '\n';
                const base64 = btoa(unescape(encodeURIComponent(content)));
                await this.exec(`echo '${base64}' | base64 -d > ${scriptsDir}/${safeName}.sh && chmod 755 ${scriptsDir}/${safeName}.sh`);
            }
        }
    }
    renderScriptsList() {
        const container = document.getElementById('scripts-list');
        const scripts = Object.entries(this.customScripts);
        if (scripts.length === 0) {
            container.innerHTML = '<div class="scripts-empty">暂无自定义脚本</div>';
            return;
        }
        container.innerHTML = scripts.map(([id, script]) => `
            <div class="script-item ${script.enabled ? '' : 'disabled'}" data-id="${id}">
                <div class="script-info">
                    <div class="script-header">
                        <span class="script-name">${this.escapeHtml(script.name)}</span>
                        <span class="script-tag-badge tag-${script.tag}">${script.tag}</span>
                    </div>
                    <div class="script-preview">${this.escapeHtml(script.code.split('\n')[0])}</div>
                </div>
                <div class="script-actions">
                    <button class="script-action-btn toggle" data-id="${id}" title="${script.enabled ? '禁用' : '启用'}">${script.enabled ? '✓' : '○'}</button>
                    <button class="script-action-btn edit" data-id="${id}" title="编辑">✎</button>
                    <button class="script-action-btn delete" data-id="${id}" title="删除">✕</button>
                </div>
            </div>
        `).join('');
        container.querySelectorAll('.script-action-btn.toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleScript(btn.dataset.id);
            });
        });
        container.querySelectorAll('.script-action-btn.edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editScript(btn.dataset.id);
            });
        });
        container.querySelectorAll('.script-action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteScript(btn.dataset.id);
            });
        });
    }
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    updateScriptsCount() {
        const count = Object.keys(this.customScripts).length;
        const enabledCount = Object.values(this.customScripts).filter(s => s.enabled).length;
        document.getElementById('scripts-count').textContent = count > 0 ? `${enabledCount}/${count} 个` : '0 个';
    }
    showScriptEditor(scriptId = null) {
        this.editingScriptId = scriptId;
        const titleEl = document.getElementById('script-edit-title');
        const nameInput = document.getElementById('script-name-input');
        const codeInput = document.getElementById('script-code-input');
        const enabledSwitch = document.getElementById('script-enabled-switch');
        if (scriptId && this.customScripts[scriptId]) {
            const script = this.customScripts[scriptId];
            titleEl.textContent = '编辑脚本';
            nameInput.value = script.name;
            codeInput.value = script.code;
            enabledSwitch.checked = script.enabled;
            document.querySelectorAll('#script-tags .script-tag').forEach(t => {
                t.classList.toggle('selected', t.dataset.tag === script.tag);
            });
        } else {
            titleEl.textContent = '添加脚本';
            nameInput.value = '';
            codeInput.value = '';
            enabledSwitch.checked = true;
            document.querySelectorAll('#script-tags .script-tag').forEach((t, i) => {
                t.classList.toggle('selected', i === 0);
            });
        }
        codeInput.scrollTop = 0;
        nameInput.scrollTop = 0;
        this.showOverlay('script-edit-overlay');
    }
    async saveScript() {
        const nameInput = document.getElementById('script-name-input');
        const codeInput = document.getElementById('script-code-input');
        const enabledSwitch = document.getElementById('script-enabled-switch');
        const selectedTag = document.querySelector('#script-tags .script-tag.selected');
        const name = nameInput.value.trim();
        const code = codeInput.value.trim();
        const tag = selectedTag ? selectedTag.dataset.tag : '其他';
        const enabled = enabledSwitch.checked;
        if (!name) {
            this.showToast('请输入脚本名称');
            return;
        }
        if (!code) {
            this.showToast('请输入脚本内容');
            return;
        }
        const id = this.editingScriptId || `script_${Date.now()}`;
        const nextScripts = { ...this.customScripts, [id]: { name, code, tag, enabled } };
        const safeName = id.replace(/[^a-zA-Z0-9_]/g, '_');
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: this.editingScriptId ? `即将更新脚本 ${name}。` : `即将添加脚本 ${name}。`,
            configs: [{ filename: 'custom_scripts.b64 (decoded)', content: JSON.stringify(nextScripts, null, 2) }],
            actions: enabled ? [`生成 scripts.d/${safeName}.sh 并赋予可执行权限`] : ['脚本已禁用，仅保存配置。'],
            notes: enabled ? ['启用的脚本会在模块启动时以 root 权限执行。'] : []
        });
        if (!confirmed) return;
        this.customScripts = nextScripts;
        await this.saveCustomScripts();
        this.renderScriptsList();
        this.updateScriptsCount();
        this.hideOverlay('script-edit-overlay');
        this.showToast(this.editingScriptId ? '脚本已更新' : '脚本已添加');
    }
    editScript(id) {
        this.showScriptEditor(id);
    }
    async toggleScript(id) {
        if (this.customScripts[id]) {
            const script = this.customScripts[id];
            const nextEnabled = !script.enabled;
            const nextScripts = { ...this.customScripts, [id]: { ...script, enabled: nextEnabled } };
            const safeName = id.replace(/[^a-zA-Z0-9_]/g, '_');
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: `即将${nextEnabled ? '启用' : '禁用'}脚本 ${script.name}。`,
                configs: [{ filename: 'custom_scripts.b64 (decoded)', content: JSON.stringify(nextScripts, null, 2) }],
                actions: nextEnabled ? [`生成 scripts.d/${safeName}.sh 并赋予可执行权限`] : [`移除 scripts.d/${safeName}.sh`]
            });
            if (!confirmed) return;
            this.customScripts = nextScripts;
            await this.saveCustomScripts();
            this.renderScriptsList();
            this.updateScriptsCount();
            this.showToast(this.customScripts[id].enabled ? '脚本已启用' : '脚本已禁用');
        }
    }
    async deleteScript(id) {
        const script = this.customScripts[id];
        if (!script) return;
        const confirmed = await this.showConfirm(`确定要删除脚本 "${script.name}" 吗？`, '删除脚本');
        if (!confirmed) return;
        delete this.customScripts[id];
        await this.saveCustomScripts();
        this.renderScriptsList();
        this.updateScriptsCount();
        this.showToast('脚本已删除');
    }
    initSystemOpt() {
        const switches = ['lmk', 'device-config', 'reclaim', 'kswapd', 'protect', 'fstrim'];
        switches.forEach(name => {
            const sw = document.getElementById(`${name}-switch`);
            if (sw) sw.addEventListener('change', () => this.saveAndApplySystemOpt(name));
        });
        this.loadSystemOptConfig();
    }
    async loadSystemOptConfig() {
        const configs = {
            lmk: { file: 'lmk.conf', switch: 'lmk-switch' },
            device: { file: 'device.conf', switch: 'device-config-switch' },
            reclaim: { file: 'reclaim.conf', switch: 'reclaim-switch' },
            kswapd: { file: 'kswapd.conf', switch: 'kswapd-switch' },
            protect: { file: 'protect.conf', switch: 'protect-switch' },
            fstrim: { file: 'fstrim.conf', switch: 'fstrim-switch' }
        };
        let enabledCount = 0;
        for (const [key, cfg] of Object.entries(configs)) {
            const content = await this.exec(`cat ${this.configDir}/${cfg.file} 2>/dev/null`);
            const sw = document.getElementById(cfg.switch);
            if (sw) {
                const enabled = content.includes('enabled=1');
                sw.checked = enabled;
                if (enabled) enabledCount++;
            }
        }
        const badge = document.getElementById('system-opt-badge');
        if (badge) badge.textContent = enabledCount > 0 ? `${enabledCount}项已启用` : '未配置';
    }
    async saveAndApplySystemOpt(name, skipPreview = false) {
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
        const config = `enabled=${enabled}`;
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
        await this.writeConfig(fileMap[name], config);
        if (sw.checked) {
            this.showLoading(true);
            await this.applySystemOptNow(name);
            this.showLoading(false);
        }
        this.loadSystemOptConfig();
        this.showToast(sw.checked ? '已启用并应用' : '已禁用');
        return true;
    }
    async applySystemOptNow(name) {
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
    }
    initScrollEffect() {
        const floatingHeader = document.getElementById('floating-header');
        const coronaTitle = document.getElementById('corona-title');
        const coronaTitleSettings = document.getElementById('corona-title-settings');
        const titleOverlines = document.querySelectorAll('.title-overline');
        let headerShown = false;
        const scroller = document.querySelector('.container') || window;
        const handleScroll = () => {
            const activePage = document.querySelector('.page.active');
            let currentTitle = coronaTitle;
            if (activePage && activePage.id === 'page-settings') {
                currentTitle = coronaTitleSettings;
            }
            if (!currentTitle || !floatingHeader) return;
            const titleRect = currentTitle.getBoundingClientRect();
            const titleBottom = titleRect.bottom;
            const triggerPoint = 26;
            const fadeStart = 78;
            const fadeEnd = 34;
            const progress = Math.max(0, Math.min(1, (titleBottom - fadeEnd) / (fadeStart - fadeEnd)));
            currentTitle.style.opacity = String(progress);
            currentTitle.style.transform = `translateY(${(1 - progress) * -5}px)`;
            titleOverlines.forEach(el => {
                const sameBlock = el.parentElement && el.parentElement.contains(currentTitle);
                el.style.opacity = sameBlock ? String(Math.max(0.18, progress)) : el.style.opacity;
                el.style.transform = sameBlock ? `translateY(${(1 - progress) * -4}px)` : el.style.transform;
            });
            if (titleBottom <= triggerPoint && !headerShown) {
                headerShown = true;
                floatingHeader.classList.add('visible');
            } else if (titleBottom > triggerPoint && headerShown) {
                headerShown = false;
                floatingHeader.classList.remove('visible');
            }
            const scrollTop = scroller === window ? window.scrollY : scroller.scrollTop;
            if (scrollTop <= 4 || (activePage && activePage.getBoundingClientRect().top >= -2) || titleRect.top >= 8) {
                currentTitle.style.opacity = '1';
                currentTitle.style.transform = 'translateY(0)';
                titleOverlines.forEach(el => {
                    if (el.parentElement && el.parentElement.contains(currentTitle)) {
                        el.style.opacity = '0.92';
                        el.style.transform = 'translateY(0)';
                    }
                });
                floatingHeader.classList.remove('visible', 'overlay-hidden');
                headerShown = false;
            }
        };
        scroller.addEventListener('scroll', rafThrottle(handleScroll), { passive: true });
        window.addEventListener('resize', rafThrottle(handleScroll), { passive: true });
        handleScroll();
    }
    initModuleIntro() {
        const moduleIntros = {
            'memory-compression': {
                title: '内存压缩',
                content: `ZRAM 是 Linux 内核的一个功能，它在内存中创建一个压缩的块设备作为交换空间。

当物理内存不足时，系统会将不常用的内存页压缩后存储到 ZRAM 中，从而有效扩展可用内存容量。

Swap 文件则是在存储设备上创建的交换空间，可以作为 ZRAM 的补充，适合内存较小的设备使用。`
            },
            'le9ec': {
                title: 'LE9EC 内存保护',
                content: `LE9EC 是一个内核补丁，用于保护工作集内存不被过度回收。

通过设置匿名页和文件页的保护阈值（以KB为单位），可以防止系统在内存压力下过度回收正在使用的内存，从而避免频繁的页面换入换出导致的系统卡顿和假死。

此功能需要内核支持，未打补丁的内核将自动隐藏此选项。`
            },
            'io-scheduler': {
                title: 'IO 调度器',
                content: `IO 调度器决定了磁盘读写请求的处理顺序和优先级。

不同的调度算法适合不同的使用场景，选择合适的调度器可以提升存储设备的读写性能和响应速度。

预读大小控制系统预先读取的数据量，适当的预读可以提高顺序读取的性能。`
            },
            'cpu-governor': {
                title: 'CPU 调频器',
                content: `CPU 调频器控制处理器频率的调节策略，直接影响设备的性能表现和电池续航。

不同的调频策略在性能和功耗之间有不同的侧重，可以根据实际使用需求选择合适的调频器。`
            },
            'process-priority': {
                title: '进程优先级',
                content: `通过调整进程的 CPU 优先级 (Nice) 和 IO 优先级，可以让重要的应用获得更多的系统资源。

为游戏、音乐播放器等对性能敏感的应用设置较高优先级，可以获得更流畅的使用体验。

设置的规则会在每次开机后自动应用。`
            },
            'tcp': {
                title: 'TCP 拥塞算法',
                content: `TCP 拥塞控制算法影响网络数据传输的效率和稳定性。

不同的算法在各种网络环境下表现不同，选择合适的算法可以提升网络连接的速度和可靠性。`
            },
            'custom-scripts': {
                title: '自定义脚本',
                content: `在此添加您自己的 Shell 脚本，模块启动时会以 root 权限自动执行。

可以用于个性化的系统调优、自动化任务等场景。

注意：请确保脚本语法正确，避免执行可能导致系统不稳定的命令。`
            },
            'system-opt': {
                title: '系统优化',
                content: `一系列系统级优化选项，包括低内存杀手调优、后台进程保护、厂商回收抑制等功能。

这些优化可以减少后台应用被杀、提升系统流畅度、保持存储性能。

部分功能可能与特定厂商系统有关，请根据实际效果选择启用。`
            },
            'corona-kernel': {
                title: 'Corona 内核优化',
                content: `Corona 内核独有的省电与响应模块集合，按场景分组：

· 用户在场窗口：息屏后这段时间内的自动唤醒（调制解调器心跳、Alarm、传感器批送）会跳过 PM_POST_SUSPEND 的 restore，省掉一整轮存/恢复抖动。

· 挂起省电：分别从 swap 抑制、脏页冻结、compaction 关停、网络静默、watchdog 拆除、timer slack 抬高、调度 slack 抬高、pm_qos 钳位、RCU 慢路径九个角度，让 suspend 尾声真正闲下来。

· 唤醒响应：仅在真实用户唤醒时短暂拉高 cpufreq 下限，吃掉首屏延迟。

· 后台空闲：机会性 zram 回写与 vmstat 合并，降低长期空闲期的内核噪音。

非 Corona 内核会自动隐藏此卡片。`
            },
            'module-settings': {
                title: '模块设置',
                content: `Corona 模块的全局设置，包括主题切换、功能卡片显示控制、一键内存清理等功能。

可以根据个人喜好自定义界面显示和快捷操作。`
            }
        };
        document.querySelectorAll('.module-card-title[data-module]').forEach(title => {
            title.addEventListener('click', (e) => {
                e.stopPropagation();
                const moduleKey = title.getAttribute('data-module');
                const intro = moduleIntros[moduleKey];
                if (intro) {
                    document.getElementById('module-intro-title').textContent = intro.title;
                    document.getElementById('module-intro-content').textContent = intro.content;
                    this.showOverlay('module-intro-overlay');
                }
            });
        });
        document.getElementById('module-intro-close').addEventListener('click', () => {
            this.hideOverlay('module-intro-overlay');
        });
        document.getElementById('module-intro-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'module-intro-overlay') {
                this.hideOverlay('module-intro-overlay');
            }
        });
    }
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
    }
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
        const conf = await this.exec(`cat ${this.configDir}/corona_kernel.conf 2>/dev/null`);
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
    }
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
    }
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
    }
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
}

CoronaAddon.prototype.ensureAppPolicyState = function() {
    if (!this.appPolicy) {
        this.appPolicy = { monitorEnabled: false, notifyEnabled: true, whitelist: [], blacklist: [], protect: [], profiles: [] };
    }
    if (!Array.isArray(this.installedApps)) this.installedApps = [];
    if (!this.currentAppPolicyMode) this.currentAppPolicyMode = 'whitelist';
};
CoronaAddon.prototype.getAppPolicyScript = function(...args) {
    const parts = [`sh ${this.shellQuote(`${this.modDir}/app_policy.sh`)}`];
    args.filter(Boolean).forEach(arg => parts.push(arg));
    return parts.join(' ');
};
CoronaAddon.prototype.parseAppRulesConfig = function(content) {
    this.ensureAppPolicyState();
    const next = { monitorEnabled: false, notifyEnabled: true, whitelist: [], protect: [], profiles: [] };
    String(content || '').split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx <= 0) return;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key === 'monitor_enabled') next.monitorEnabled = value === '1';
        if (key === 'notify_enabled') next.notifyEnabled = value !== '0';
        if (key === 'whitelist') next.whitelist = value ? value.split(',').filter(Boolean) : [];
        if (key === 'protect') next.protect = value ? value.split(',').filter(Boolean) : [];
        if (key === 'profiles') next.profiles = value ? value.split(',').filter(Boolean) : [];
    });
    next.whitelist = [...new Set(next.whitelist)];
    next.protect = [...new Set(next.protect)];
    next.profiles = [...new Set(next.profiles)];
    this.appPolicy = next;
};
CoronaAddon.prototype.buildAppRulesConfig = function() {
    this.ensureAppPolicyState();
    const lines = [
        `monitor_enabled=${this.appPolicy.monitorEnabled ? '1' : '0'}`,
        `notify_enabled=${this.appPolicy.notifyEnabled ? '1' : '0'}`
    ];
    return lines.join('\n');
};
CoronaAddon.prototype.getAppPolicyListFilename = function(key) {
    if (key === 'whitelist') return 'app_whitelist.list';
    if (key === 'protect') return 'app_protect.list';
    if (key === 'profiles') return 'app_profiles.list';
    return `${key || 'app_policy'}.list`;
};
CoronaAddon.prototype.serializeAppPolicyList = function(items = []) {
    return [...new Set((items || []).filter(Boolean))].join('\n');
};
CoronaAddon.prototype.buildAppPolicyPreviewConfigs = function(keys = ['whitelist', 'protect', 'profiles'], overrides = {}) {
    const configs = [];
    if (keys.includes('rules')) {
        configs.push({ filename: 'app_rules.conf', content: this.buildAppRulesConfig() });
    }
    ['whitelist', 'protect', 'profiles'].forEach(key => {
        if (!keys.includes(key)) return;
        const items = overrides[key] || this.appPolicy[key] || [];
        configs.push({ filename: this.getAppPolicyListFilename(key), content: this.serializeAppPolicyList(items) || '# empty' });
    });
    return configs;
};
CoronaAddon.prototype.renderAppPolicySummary = function() {
    this.ensureAppPolicyState();
    const wl = this.appPolicy.whitelist.length;
    const pr = this.appPolicy.protect.length;
    const pf = this.appPolicy.profiles.length;
    const pt = Object.keys(this.priorityRules || {}).length;
    const threadPackages = this.getThreadRulePackages();
    const configuredCount = new Set([...(this.appPolicy.whitelist || []), ...(this.appPolicy.protect || []), ...(this.appPolicy.profiles || []), ...Object.keys(this.priorityRules || {}), ...threadPackages]).size;
    const badge = document.getElementById('app-policy-badge');
    if (badge) badge.textContent = configuredCount > 0 ? `${configuredCount} 个应用` : '未配置';
    const status = document.getElementById('app-policy-status');
    if (status) {
        if (configuredCount <= 0) {
            status.textContent = '还没有配置任何应用策略';
        } else if (this.appPolicy.monitorEnabled && pf > 0) {
            status.textContent = `已配置 ${configuredCount} 个应用，应用预设自动切换已开启`;
        } else {
            status.textContent = `已配置 ${configuredCount} 个应用`;
        }
    }
    const switchMonitor = document.getElementById('app-monitor-switch');
    const switchNotify = document.getElementById('app-notify-switch');
    const manageBtn = document.getElementById('app-policy-manage-btn');
    if (switchMonitor) switchMonitor.checked = !!this.appPolicy.monitorEnabled;
    if (switchNotify) switchNotify.checked = !!this.appPolicy.notifyEnabled;
    if (manageBtn) {
        if (this.appPolicyManageLoading) {
            manageBtn.classList.add('is-loading');
            manageBtn.disabled = true;
            manageBtn.innerHTML = '<span class="btn-inline-spinner"></span><span>正在加载</span>';
        } else {
            manageBtn.classList.remove('is-loading');
            manageBtn.disabled = false;
            manageBtn.innerHTML = configuredCount > 0
                ? `应用列表 <span id="app-policy-manage-count">${configuredCount}</span>`
                : '应用列表';
        }
    }
    const pairs = [
        ['app-policy-manage-count', configuredCount]
    ];
    pairs.forEach(([id, count]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(count);
    });
};
CoronaAddon.prototype.loadAppRulesConfig = async function() {
    this.ensureAppPolicyState();
    const content = await this.exec(this.getAppPolicyScript('dump-rules'));
    this.parseAppRulesConfig(content);
    this.renderAppPolicySummary();
};
CoronaAddon.prototype.syncAppPolicyDaemon = async function() {
    const shouldRun = !!this.appPolicy.monitorEnabled || (this.appPolicy.protect || []).length > 0 || (this.appPolicy.profiles || []).length > 0 || this.getThreadRulePackages().length > 0;
    const pidFile = `${this.modDir}/.app_policy_daemon.pid`;
    if (shouldRun) {
        await this.exec(`${this.getAppPolicyScript('daemon')} >/dev/null 2>&1 &`);
        return;
    }
    const pid = (await this.exec(`cat ${this.shellQuote(pidFile)} 2>/dev/null`)).trim();
    if (pid) await this.exec(`kill ${pid} 2>/dev/null`);
    await this.exec(`rm -f ${this.shellQuote(pidFile)} ${this.shellQuote(`${this.modDir}/.app_policy_state`)}`);
    await this.exec(`sh ${this.shellQuote(`${this.modDir}/service.sh`)} --apply-runtime-config >/dev/null 2>&1`);
};
CoronaAddon.prototype.scheduleAppPolicySync = function() {
    if (this.appPolicySyncTimer) clearTimeout(this.appPolicySyncTimer);
    this.appPolicySyncTimer = setTimeout(() => {
        this.syncAppPolicyDaemon().catch(() => {});
        this.appPolicySyncTimer = null;
    }, 120);
};
CoronaAddon.prototype.saveAppRulesConfig = async function(showToastText = '', options = {}) {
    await this.writeConfig('app_rules.conf', this.buildAppRulesConfig());
    if (options.syncNow) {
        await this.syncAppPolicyDaemon();
    } else {
        this.scheduleAppPolicySync();
    }
    this.renderAppPolicySummary();
    if (showToastText) this.showToast(showToastText);
};
CoronaAddon.prototype.persistAppRulesSoon = function(showToastText = '') {
    if (showToastText) this.showToast(showToastText);
    this.renderAppPolicySummary();
    if (this.appRulesPersistTimer) clearTimeout(this.appRulesPersistTimer);
    this.appRulesPersistTimer = setTimeout(() => {
        this.saveAppRulesConfig('', { syncNow: false }).catch(() => {});
        this.appRulesPersistTimer = null;
    }, 180);
};
CoronaAddon.prototype.initAppPolicy = function() {
    this.ensureAppPolicyState();
    const monitorSwitch = document.getElementById('app-monitor-switch');
    const notifySwitch = document.getElementById('app-notify-switch');
    if (monitorSwitch && !monitorSwitch.dataset.bound) {
        monitorSwitch.dataset.bound = '1';
        monitorSwitch.addEventListener('change', async () => {
            const previous = this.appPolicy.monitorEnabled;
            this.appPolicy.monitorEnabled = monitorSwitch.checked;
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: `即将${monitorSwitch.checked ? '开启' : '关闭'}应用预设自动切换。`,
                configs: this.buildAppPolicyPreviewConfigs(['rules']),
                actions: [monitorSwitch.checked ? '启动应用策略守护，前台应用命中预设时自动切换配置' : '停止自动切换，仅保留当前默认配置'],
                notes: ['白名单、保护和应用预设名单不会丢失。']
            }, { onCancel: () => { this.appPolicy.monitorEnabled = previous; this.renderAppPolicySummary(); } });
            if (!confirmed) return;
            await this.saveAppRulesConfig(`应用预设自动切换已${monitorSwitch.checked ? '开启' : '关闭'}`);
        });
    }
    if (notifySwitch && !notifySwitch.dataset.bound) {
        notifySwitch.dataset.bound = '1';
        notifySwitch.addEventListener('change', async () => {
            const previous = this.appPolicy.notifyEnabled;
            this.appPolicy.notifyEnabled = notifySwitch.checked;
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: `即将${notifySwitch.checked ? '开启' : '关闭'}应用策略通知。`,
                configs: this.buildAppPolicyPreviewConfigs(['rules']),
                notes: ['仅影响应用预设切换通知，不影响名单和守护逻辑。']
            }, { onCancel: () => { this.appPolicy.notifyEnabled = previous; this.renderAppPolicySummary(); } });
            if (!confirmed) return;
            await this.saveAppRulesConfig(`切换通知已${notifySwitch.checked ? '开启' : '关闭'}`);
        });
    }
    const buttons = {
        'app-policy-manage-btn': 'manage'
    };
    Object.entries(buttons).forEach(([id, mode]) => {
        const btn = document.getElementById(id);
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => this.openAppPolicyOverlay(mode));
        }
    });
    const search = document.getElementById('app-policy-search');
    if (search && !search.dataset.bound) {
        search.dataset.bound = '1';
        search.addEventListener('input', () => this.renderAppPolicyList());
    }
    ['app-policy-overlay', 'app-profile-overlay'].forEach(id => {
        const overlay = document.getElementById(id);
        if (overlay && !overlay.dataset.bound) {
            overlay.dataset.bound = '1';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.hideOverlay(id);
            });
        }
    });
};
CoronaAddon.prototype.loadInstalledApps = async function(force = false) {
    this.ensureAppPolicyState();
    if (!force && this.installedApps.length > 0) return this.installedApps;
    const output = await this.exec(this.getAppPolicyScript('list-meta'));
    const apps = [];
    let cacheChanged = false;
    String(output || '').split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const parts = trimmed.split('|');
        const pkg = (parts[0] || '').trim();
        const componentName = (parts[1] || '').trim();
        const fetchedLabel = (parts[2] || '').trim();
        if (!pkg) return;
        const cached = (this.appMetaCache && this.appMetaCache[pkg]) || {};
        const label = fetchedLabel && fetchedLabel !== pkg ? fetchedLabel : (cached.label && cached.label !== pkg ? cached.label : this.humanizePackageName(pkg));
        apps.push({ packageName: pkg, componentName, label, labelLoaded: true });
        const nextCache = { ...cached, label, componentName };
        if (JSON.stringify(nextCache) !== JSON.stringify(cached)) {
            this.appMetaCache[pkg] = nextCache;
            cacheChanged = true;
        }
    });
    apps.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN-u-co-pinyin') || a.packageName.localeCompare(b.packageName));
    this.installedApps = apps;
    if (cacheChanged) await this.saveAppMetaCache();
    return apps;
};
CoronaAddon.prototype.prewarmAppPolicyData = async function() {
    this.ensureAppPolicyState();
    if (this.appPolicyPrewarmPromise) return this.appPolicyPrewarmPromise;
    this.appPolicyPrewarmPromise = Promise.resolve();
    this.appPolicyPrewarmDone = true;
    return this.appPolicyPrewarmPromise;
};
CoronaAddon.prototype.humanizePackageName = function(pkg) {
    const parts = String(pkg || '').split('.').filter(Boolean);
    if (parts.length === 0) return pkg || '--';
    const generic = new Set(['com', 'org', 'net', 'android', 'app', 'cn']);
    const core = parts.filter(part => !generic.has(part.toLowerCase()));
    let picked = core.slice(-2);
    if (picked.length === 0) picked = parts.slice(-1);
    return picked.map(part => part.replace(/[_-]+/g, ' ').replace(/\w/g, c => c.toUpperCase())).join(' ');
};
CoronaAddon.prototype.getAppPolicyIconSource = function(pkg) {
    return `ksu://icon/${encodeURIComponent(String(pkg || ''))}`;
};
CoronaAddon.prototype.renderAppPolicyIcon = function(app) {
    const pkg = this.escapeHtml(app.packageName);
    return `<div class="app-policy-icon-wrap"><img class="app-policy-icon" data-pkg="${pkg}" alt="" loading="lazy" decoding="async"></div>`;
};
CoronaAddon.prototype.hydrateAppPolicyIcons = function(container) {
    if (!container) return;
    container.querySelectorAll('.app-policy-icon[data-pkg]').forEach(img => {
        if (img.dataset.bound === '1') return;
        img.dataset.bound = '1';
        img.addEventListener('load', () => {
            img.classList.add('loaded');
        });
        img.addEventListener('error', () => {
            img.classList.remove('loaded');
            img.closest('.app-policy-icon-wrap')?.classList.add('hidden');
        });
        img.src = this.getAppPolicyIconSource(img.dataset.pkg || '');
    });
};
CoronaAddon.prototype.getAppPolicyTags = function(pkg) {
    if (this.appPolicy.profiles.includes(pkg)) return ['预设'];
    if (this.getThreadRulesForPackage(pkg).length > 0) return ['线程'];
    if (this.appPolicy.protect.includes(pkg)) return ['保护'];
    if (this.appPolicy.whitelist.includes(pkg)) return ['白名单'];
    if (this.priorityRules && this.priorityRules[pkg]) return ['优先级'];
    return [];
};
CoronaAddon.prototype.renderAppPolicyLoadingState = function(message = '正在读取应用列表...') {
    const list = document.getElementById('app-policy-list');
    if (!list) return;
    list.innerHTML = `<div class="app-policy-loading-state"><div class="loading-spinner"></div><span class="loading-text">${this.escapeHtml(message)}</span></div>`;
};
CoronaAddon.prototype.setAppPolicyManageLoading = function(loading) {
    this.appPolicyManageLoading = !!loading;
    this.renderAppPolicySummary();
};
CoronaAddon.prototype.openAppPolicyOverlay = async function(mode) {
    this.ensureAppPolicyState();
    this.currentAppPolicyMode = mode;
    this.appPolicyRenderLimit = 60;
    const titleMap = { manage: '应用列表' };
    const title = document.getElementById('app-policy-title');
    if (title) title.textContent = titleMap[mode] || '选择应用';
    this.setAppPolicyManageLoading(true);
    this.showOverlay('app-policy-overlay');
    this.renderAppPolicyLoadingState();
    try {
        await this.loadInstalledApps();
        this.renderAppPolicyList();
    } catch (error) {
        this.renderAppPolicyLoadingState('读取应用列表失败');
    } finally {
        this.setAppPolicyManageLoading(false);
    }
};
CoronaAddon.prototype.renderAppPolicyTags = function(pkg) {
    const tags = this.getAppPolicyTags(pkg).map(tag => `<span class="app-policy-tag">${this.escapeHtml(tag)}</span>`).join('');
    return tags || '<span class="app-policy-tag">未配置</span>';
};
CoronaAddon.prototype.updateAppPolicyRow = function(pkg) {
    const safePkg = String(pkg).replace(/"/g, '\"');
    const row = document.querySelector(`.app-policy-row[data-pkg="${safePkg}"]`);
    if (!row) return;
    const active = this.appPolicy.whitelist.includes(pkg) || this.appPolicy.protect.includes(pkg) || this.appPolicy.profiles.includes(pkg) || !!this.priorityRules?.[pkg] || this.getThreadRulesForPackage(pkg).length > 0;
    row.classList.toggle('active', active);
    const tagsEl = row.querySelector('.app-policy-tags');
    if (tagsEl) tagsEl.innerHTML = this.renderAppPolicyTags(pkg);
};
CoronaAddon.prototype.renderAppPolicyList = function() {
    this.ensureAppPolicyState();
    const list = document.getElementById('app-policy-list');
    if (!list) return;
    const keyword = (document.getElementById('app-policy-search')?.value || '').trim().toLowerCase();
    const apps = this.installedApps
        .filter(app => !keyword || app.label.toLowerCase().includes(keyword) || app.packageName.toLowerCase().includes(keyword))
        .sort((a, b) => {
            const aActive = this.appPolicy.whitelist.includes(a.packageName) || this.appPolicy.protect.includes(a.packageName) || this.appPolicy.profiles.includes(a.packageName) || !!this.priorityRules?.[a.packageName] || this.getThreadRulesForPackage(a.packageName).length > 0;
            const bActive = this.appPolicy.whitelist.includes(b.packageName) || this.appPolicy.protect.includes(b.packageName) || this.appPolicy.profiles.includes(b.packageName) || !!this.priorityRules?.[b.packageName] || this.getThreadRulesForPackage(b.packageName).length > 0;
            if (aActive !== bActive) return aActive ? -1 : 1;
            return a.label.localeCompare(b.label, 'zh-Hans-CN-u-co-pinyin') || a.packageName.localeCompare(b.packageName);
        });
    if (apps.length === 0) {
        list.innerHTML = '<div class="priority-empty">没有匹配的应用</div>';
        return;
    }
    const mode = this.currentAppPolicyMode;
    const visibleApps = apps;
    const isActive = (pkg) => {
        if (mode === 'manage') return this.appPolicy.whitelist.includes(pkg) || this.appPolicy.protect.includes(pkg) || this.appPolicy.profiles.includes(pkg) || !!this.priorityRules?.[pkg] || this.getThreadRulesForPackage(pkg).length > 0;
        return false;
    };
    list.innerHTML = visibleApps.map(app => {
        const tags = this.renderAppPolicyTags(app.packageName);
        return `<div class="app-policy-row ${isActive(app.packageName) ? 'active' : ''}" data-pkg="${this.escapeHtml(app.packageName)}" data-label="${this.escapeHtml(app.label)}">${this.renderAppPolicyIcon(app)}<div class="app-policy-info"><div class="app-policy-name">${this.escapeHtml(app.label)}</div><div class="app-policy-package">${this.escapeHtml(app.packageName)}</div><div class="app-policy-tags">${tags}</div></div><div class="app-policy-check">✓</div></div>`;
    }).join('');
    this.hydrateAppPolicyIcons(list);
    list.querySelectorAll('.app-policy-row').forEach(row => {
        row.addEventListener('click', async () => {
            const pkg = row.dataset.pkg;
            await this.openAppProfilePicker(pkg, row.dataset.label || pkg);
        });
    });
};
CoronaAddon.prototype.reorderAppPolicyRow = function(pkg) {
    const list = document.getElementById('app-policy-list');
    const safePkg = String(pkg).replace(/"/g, '\"');
    const row = document.querySelector(`.app-policy-row[data-pkg="${safePkg}"]`);
    if (!list || !row) return;
    const active = this.appPolicy.whitelist.includes(pkg) || this.appPolicy.protect.includes(pkg) || this.appPolicy.profiles.includes(pkg) || !!this.priorityRules?.[pkg] || this.getThreadRulesForPackage(pkg).length > 0;
    if (active) list.prepend(row);
};
CoronaAddon.prototype.toggleAppPolicyPackage = async function(mode, pkg) {
    this.ensureAppPolicyState();
    const key = mode;
    const previous = [...(this.appPolicy[key] || [])];
    const set = new Set(previous);
    const adding = !set.has(pkg);
    if (adding) set.add(pkg); else set.delete(pkg);
    const nextItems = [...set];
    const label = key === 'whitelist' ? '白名单' : key === 'protect' ? '保护列表' : '列表';
    const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将${adding ? '加入' : '移出'} ${pkg} 到${label}。`,
        configs: this.buildAppPolicyPreviewConfigs([key], { [key]: nextItems }),
        actions: key === 'protect'
            ? ['更新保护进程名单，并在守护运行时重新应用受保护内存组']
            : ['更新应用策略名单']
    });
    if (!confirmed) return;
    this.appPolicy[key] = nextItems;
    this.updateAppPolicyRow(pkg);
    this.reorderAppPolicyRow(pkg);
    this.renderAppPolicySummary();
    this.showToast(`${pkg} 已${adding ? '加入' : '移出'}${label}`);
    this.exec(this.getAppPolicyScript('list-set', key, adding ? 'add' : 'del', this.shellQuote(pkg))).catch(() => {});
    this.scheduleAppPolicySync();
};
CoronaAddon.prototype.estimateCurrentProfileConfigCount = async function() {
    const names = this.snapshotConfigFiles || [];
    if (!Array.isArray(names) || names.length === 0) return 0;
    const checks = names.map(name => `[ -s ${this.shellQuote(`${this.configDir}/${name}`)} ] && echo 1`).join('; ');
    const output = await this.exec(`/system/bin/sh -c ${this.shellQuote(checks)}`);
    return String(output || '').split('\n').filter(Boolean).length;
};
CoronaAddon.prototype.openAppProfilePicker = async function(pkg, label) {
    this.ensureAppPolicyState();
    this.selectedAppProfilePackage = pkg;
    this.selectedAppProfileLabel = label || pkg;
    this.currentProfileConfigCount = await this.estimateCurrentProfileConfigCount();
    const title = document.getElementById('app-profile-title');
    if (title) title.textContent = label || pkg;
    this.renderAppProfileChoices();
    this.showOverlay('app-profile-overlay');
};
CoronaAddon.prototype.renderAppProfileChoices = function() {
    const container = document.getElementById('app-profile-options');
    if (!container) return;
    const snapshots = Array.isArray(this.parameterSnapshots) ? this.parameterSnapshots : [];
    const pkg = this.selectedAppProfilePackage;
    const inWhitelist = this.appPolicy.whitelist.includes(pkg);
    const inProtect = this.appPolicy.protect.includes(pkg);
    const hasProfile = this.appPolicy.profiles.includes(pkg);
    const priorityRule = this.priorityRules?.[pkg] || null;
    const currentConfigCount = Number(this.currentProfileConfigCount || 0);
    const actionOptions = [
        `<div class="doze-preset" data-mode="toggle-whitelist"><div class="doze-preset-name">${inWhitelist ? '移出白名单' : '加入白名单'}</div><div class="doze-preset-desc">紧急回收时跳过这个应用</div></div>`,
        `<div class="doze-preset" data-mode="toggle-protect"><div class="doze-preset-name">${inProtect ? '取消保护进程' : '加入保护进程'}</div><div class="doze-preset-desc">尝试持续保活并迁入受保护内存组</div></div>`,
        `<div class="doze-preset" data-mode="threads"><div class="doze-preset-name">管理线程规则</div><div class="doze-preset-desc">自定义线程亲和性、调度策略与优先级</div></div>`,
        `<div class="doze-preset" data-mode="priority"><div class="doze-preset-name">${priorityRule ? '调整优先级策略' : '设置优先级策略'}</div><div class="doze-preset-desc">nice ${priorityRule?.nice ?? 0} · I/O ${priorityRule ? `${priorityRule.ioClass}/${priorityRule.ioLevel}` : '2/4'}</div></div>`
    ];
    if (currentConfigCount > 0) {
        actionOptions.push(`<div class="doze-preset" data-mode="current"><div class="doze-preset-name">${hasProfile ? '覆盖应用预设' : '使用当前配置创建预设'}</div><div class="doze-preset-desc">将当前 config 下的已保存参数写入该应用独立预设目录</div></div>`);
    }
    const clearOption = hasProfile ? `<div class="doze-preset" data-mode="clear"><div class="doze-preset-name">清除应用预设</div><div class="doze-preset-desc">删除该应用的独立预设，下次切回默认配置</div></div>` : '';
    const snapshotOptions = snapshots.map(snapshot => `<div class="doze-preset" data-mode="snapshot" data-snapshot-id="${this.escapeHtml(snapshot.id || '')}"><div class="doze-preset-name">套用快照：${this.escapeHtml(snapshot.name || '未命名快照')}</div><div class="doze-preset-desc">${this.escapeHtml(this.formatSnapshotTime(snapshot.createdAt))} · ${Object.keys(snapshot.files || {}).length} 个配置</div></div>`).join('');
    container.innerHTML = actionOptions.join('') + snapshotOptions + clearOption;
    container.querySelectorAll('.doze-preset').forEach(item => {
        item.addEventListener('click', async () => {
            const mode = item.dataset.mode;
            if (mode === 'toggle-whitelist') await this.toggleAppPolicyPackage('whitelist', this.selectedAppProfilePackage);
            if (mode === 'toggle-protect') await this.toggleAppPolicyPackage('protect', this.selectedAppProfilePackage);
            if (mode === 'threads') {
                this.hideOverlay('app-profile-overlay');
                await this.openThreadRuleManager(this.selectedAppProfilePackage, this.selectedAppProfileLabel || this.selectedAppProfilePackage);
                return;
            }
            if (mode === 'priority') {
                this.selectedPriorityProcess = this.selectedAppProfilePackage;
                this.hideOverlay('app-profile-overlay');
                this.hideOverlay('app-policy-overlay');
                requestAnimationFrame(() => requestAnimationFrame(() => this.showPrioritySetting()));
                return;
            }
            if (mode === 'current') await this.setAppProfileFromCurrentConfig(this.selectedAppProfilePackage);
            if (mode === 'snapshot') await this.setAppProfileFromSnapshot(this.selectedAppProfilePackage, item.dataset.snapshotId);
            if (mode === 'clear') await this.clearAppProfile(this.selectedAppProfilePackage);
            this.hideOverlay('app-profile-overlay');
            this.renderAppPolicySummary();
            this.updateAppPolicyRow(this.selectedAppProfilePackage);
        });
    });
};
CoronaAddon.prototype.writeProfileFiles = async function(pkg, files) {
    const dir = `${this.configDir}/app_profiles/${pkg}`;
    await this.exec(`rm -rf ${this.shellQuote(dir)} && mkdir -p ${this.shellQuote(dir)}`);
    for (const [filename, content] of Object.entries(files || {})) {
        const b64 = btoa(unescape(encodeURIComponent(String(content))));
        await this.exec(`echo '${b64}' | base64 -d > ${this.shellQuote(`${dir}/${filename}`)}`);
    }
    await this.exec(`cp ${this.shellQuote(`${this.configDir}/runtime.conf`)} ${this.shellQuote(`${dir}/runtime.conf`)} 2>/dev/null`);
    if (!this.appPolicy.profiles.includes(pkg)) this.appPolicy.profiles.push(pkg);
    this.appPolicy.profiles = [...new Set(this.appPolicy.profiles)];
    this.updateAppPolicyRow(pkg);
    this.reorderAppPolicyRow(pkg);
    this.renderAppPolicySummary();
    this.showToast('应用预设已保存');
    this.exec(this.getAppPolicyScript('list-set', 'profiles', 'add', this.shellQuote(pkg))).catch(() => {});
    this.scheduleAppPolicySync();
};
CoronaAddon.prototype.copyCurrentConfigToProfile = async function(pkg) {
    const dir = `${this.configDir}/app_profiles/${pkg}`;
    const names = ['zram.conf','le9ec.conf','io_scheduler.conf','cpu_governor.conf','cpu_hotplug.conf','tcp.conf','process_priority.conf','thread_priority.conf','swap.conf','vm.conf','kernel.conf','corona_kernel.conf'];
    const copyCmd = names.map(name => `[ -f ${this.shellQuote(`${this.configDir}/${name}`)} ] && cp ${this.shellQuote(`${this.configDir}/${name}`)} ${this.shellQuote(`${dir}/${name}`)} 2>/dev/null`).join('; ');
    await this.exec(`rm -rf ${this.shellQuote(dir)} && mkdir -p ${this.shellQuote(dir)}; ${copyCmd}; cp ${this.shellQuote(`${this.configDir}/runtime.conf`)} ${this.shellQuote(`${dir}/runtime.conf`)} 2>/dev/null`);
    if (!this.appPolicy.profiles.includes(pkg)) this.appPolicy.profiles.push(pkg);
    this.appPolicy.profiles = [...new Set(this.appPolicy.profiles)];
    this.updateAppPolicyRow(pkg);
    this.reorderAppPolicyRow(pkg);
    this.renderAppPolicySummary();
    this.showToast('应用预设已保存');
    this.exec(this.getAppPolicyScript('list-set', 'profiles', 'add', this.shellQuote(pkg))).catch(() => {});
    this.scheduleAppPolicySync();
};
CoronaAddon.prototype.setAppProfileFromCurrentConfig = async function(pkg) {
    const files = await this.collectSnapshotFiles();
    if (!files || Object.keys(files).length === 0) {
        this.showToast('当前没有可保存为预设的配置');
        return;
    }
    const nextProfiles = [...new Set([...(this.appPolicy.profiles || []), pkg])];
    const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将为 ${pkg} 保存当前应用预设。`,
        configs: [
            ...this.buildAppPolicyPreviewConfigs(['profiles'], { profiles: nextProfiles }),
            ...Object.keys(files).map(filename => ({ filename: `app_profiles/${pkg}/${filename}`, content: files[filename] }))
        ],
        actions: ['写入该应用的独立预设目录，命中前台时可自动切换']
    });
    if (!confirmed) return;
    await this.copyCurrentConfigToProfile(pkg);
};
CoronaAddon.prototype.setAppProfileFromSnapshot = async function(pkg, snapshotId) {
    const snapshot = (this.parameterSnapshots || []).find(item => item.id === snapshotId);
    if (!snapshot || !snapshot.files || Object.keys(snapshot.files).length === 0) {
        this.showToast('快照不存在或为空');
        return;
    }
    const nextProfiles = [...new Set([...(this.appPolicy.profiles || []), pkg])];
    const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将为 ${pkg} 套用参数快照预设。`,
        configs: [
            ...this.buildAppPolicyPreviewConfigs(['profiles'], { profiles: nextProfiles }),
            ...Object.keys(snapshot.files).map(filename => ({ filename: `app_profiles/${pkg}/${filename}`, content: snapshot.files[filename] }))
        ],
        actions: ['写入应用独立预设目录，并在命中前台时自动切换']
    });
    if (!confirmed) return;
    await this.writeProfileFiles(pkg, snapshot.files);
};
CoronaAddon.prototype.clearAppProfile = async function(pkg) {
    const nextProfiles = (this.appPolicy.profiles || []).filter(item => item !== pkg);
    const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将清除 ${pkg} 的应用预设。`,
        configs: this.buildAppPolicyPreviewConfigs(['profiles'], { profiles: nextProfiles }),
        actions: [`删除 app_profiles/${pkg}/ 下的独立预设文件`]
    });
    if (!confirmed) return;
    await this.exec(`rm -rf ${this.shellQuote(`${this.configDir}/app_profiles/${pkg}`)}`);
    this.appPolicy.profiles = nextProfiles;
    await this.saveAppRulesConfig('应用预设已清除');
    this.updateAppPolicyRow(pkg);
};
CoronaAddon.prototype.runMemClean = async function(mode) {
    const modeNames = { 'drop-caches': '清理缓存', 'drop-all': '深度清理', compact: '内存整理', 'kill-bg': '清理后台', 'emergency-reclaim': '紧急回收', 'full-clean': '紧急回收' };
    const modeActions = {
        'drop-caches': ['执行 `echo 3 > /proc/sys/vm/drop_caches`'],
        'drop-all': ['执行 `drop_caches`', '执行 `compact_memory`'],
        compact: ['执行 `echo 1 > /proc/sys/vm/compact_memory`'],
        'kill-bg': ['尝试停止第三方后台应用', '跳过白名单与保护进程名单'],
        'emergency-reclaim': ['执行 `drop_caches`', '执行 `compact_memory`', '尝试停止第三方后台应用', '跳过白名单与保护进程名单'],
        'full-clean': ['执行 `drop_caches`', '执行 `compact_memory`', '尝试停止第三方后台应用', '跳过白名单与保护进程名单']
    };
    const modeNotes = {
        'drop-caches': ['不会修改已保存配置，仅影响当前系统缓存。'],
        'drop-all': ['不会修改已保存配置，仅影响当前系统缓存与内存整理状态。'],
        compact: ['不会修改已保存配置，仅触发一次内存整理。'],
        'kill-bg': ['可能导致部分后台应用被重新启动。'],
        'emergency-reclaim': ['这是高强度回收操作，适合临时腾内存。'],
        'full-clean': ['这是高强度回收操作，适合临时腾内存。']
    };
    const modeName = modeNames[mode] || mode;
    const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将执行${modeName}。`,
        actions: modeActions[mode] || [`执行 ${modeName}`],
        notes: modeNotes[mode] || ['不会修改已保存配置。']
    }, { okText: '继续执行' });
    if (!confirmed) return;
    this.memCleanRunning = true;
    const section = document.getElementById('memclean-section');
    const progress = document.getElementById('memclean-progress');
    const resultDiv = document.getElementById('memclean-result');
    const fill = document.getElementById('memclean-fill');
    const percent = document.getElementById('memclean-percent');
    const status = document.getElementById('memclean-status');
    const resultContent = document.getElementById('memclean-result-content');
    section.classList.add('memclean-running');
    progress.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    fill.style.width = '0%';
    percent.textContent = '0%';
    status.textContent = '准备中...';
    fill.style.width = '30%';
    percent.textContent = '30%';
    status.textContent = '正在执行系统回收...';
    const raw = await this.exec(this.getAppPolicyScript('memclean', mode));
    fill.style.width = '85%';
    percent.textContent = '85%';
    status.textContent = '整理结果...';
    const info = {};
    String(raw || '').split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) info[line.slice(0, idx)] = line.slice(idx + 1);
    });
    const before = (parseInt(info.before_kb || '0', 10) || 0) * 1024;
    const after = (parseInt(info.after_kb || '0', 10) || 0) * 1024;
    const freed = (parseInt(info.freed_kb || '0', 10) || 0) * 1024;
    const killed = String(info.killed || '').trim();
    fill.style.width = '100%';
    percent.textContent = '100%';
    status.textContent = '清理完成';
    resultContent.innerHTML = `<div class="result-item"><span>清理前可用</span><span>${this.formatBytes(before)}</span></div><div class="result-item"><span>清理后可用</span><span>${this.formatBytes(after)}</span></div><div class="result-item result-highlight"><span>已释放内存</span><span>${this.formatBytes(freed)}</span></div>${killed ? `<div class="result-item"><span>处理应用</span><span>${this.escapeHtml(killed)}</span></div>` : ''}`;
    resultDiv.classList.remove('hidden');
    this.sendNotification('Corona 内存清理', `${modeName}完成，释放了 ${this.formatBytes(freed)}`);
    await this.sleep(800);
    progress.classList.add('hidden');
    section.classList.remove('memclean-running');
    this.memCleanRunning = false;
    this.showToast(`${modeName} 完成`);
};

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
let _expandingCount = 0;
function beginExpand() {
    _expandingCount++;
    if (_expandingCount === 1) document.body.classList.add('cards-expanding');
}
function endExpand() {
    if (_expandingCount > 0) _expandingCount--;
    if (_expandingCount === 0) document.body.classList.remove('cards-expanding');
}
document.addEventListener('DOMContentLoaded', () => { window.corona = new CoronaAddon(); });
document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('app-hidden', document.hidden);
});
