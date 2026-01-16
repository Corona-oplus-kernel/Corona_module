class CoronaAddon {
    constructor() {
        this.modDir = '/data/adb/modules/Corona';
        this.configDir = `${this.modDir}/config`;
        this.algorithms = ['lz4', 'lz4hc', 'lzo', 'lzo-rle', 'zstd', 'zstdn', 'deflate', 'lz4k', 'lz4kd'];
        this.readaheadOptions = [128, 256, 384, 512, 768, 1024, 2048, 4096];
        this.state = {
            algorithm: 'lz4',
            zramSize: 8,
            swappiness: 100,
            zramWriteback: 'default',
            zramPath: '/dev/block/zram0',
            ioScheduler: null,
            readahead: 512,
            tcp: null,
            cpuGovernor: null,
            zramEnabled: false,
            le9uoEnabled: false,
            le9uoAnon: 15,
            le9uoCleanLow: 0,
            le9uoCleanMin: 15,
            dualCell: false,
            freqLockEnabled: false,
            perCoreFreqEnabled: false,
            theme: 'auto',
            swapEnabled: false,
            swapSize: 2048,
            swapPriority: 0,
            watermarkScale: 100,
            extraFreeKbytes: 0,
            dirtyRatio: 20,
            dirtyBgRatio: 10,
            vfsCachePressure: 100,
            lruGenEnabled: false,
            thp: 'never',
            ksmEnabled: false,
            compactionEnabled: false,
            autoCleanEnabled: false
        };
        this.kernelFeatures = { lruGen: false, thp: false, ksm: false, compaction: false };
        this.cpuCores = [];
        this.cpuClusterInfo = { little: 0, mid: 0, big: 0, prime: 0 };
        this.cpuStats = {};
        this.memCleanRunning = false;
        this.easterEgg = { clickCount: 0, clickTimer: null, authorClickCount: 0, authorClickTimer: null, xinranClickCount: 0, xinranClickTimer: null, currentCard: 'thanks', isOverlayOpen: false };
        this.deviceImageState = { rotation: 0, scale: 1, isRotating: false, isDragging: false, currentScale: 1, rotateCount: 0, isInfiniteRotating: false, spinClickCount: 0, noDeceleration: false };
        this.cpuMaxFreqs = [];
        this.cpuFreqsPerCore = {};
        this.historyData = { cpu: [], mem: [], cpuTemp: [], batteryTemp: [] };
        this.chartType = 'cpu';
        this.maxHistoryPoints = 60;
        this.le9uoSupported = false;
        this.autoCleanTimer = null;
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
            'vm-status', 'lru-status', 'auto-clean-switch', 'last-clean-time'
        ];
        ids.forEach(id => { this.dom[id] = document.getElementById(id); });
    }
    $(id) { return this.dom[id] || (this.dom[id] = document.getElementById(id)); }
    async init() {
        await this.ensureConfigDir();
        this.initTheme();
        this.bindAllEvents();
        const [,] = await Promise.all([
            this.loadDeviceInfo(),
            this.loadAllConfigs()
        ]);
        this.renderStaticOptions();
        this.startRealtimeMonitor();
        await Promise.all([
            this.loadDualCellConfig(),
            this.detectKernelFeatures()
        ]);
        this.initBannerDrag();
        this.initEasterEgg();
        this.initDeviceImageInteraction();
        this.initDetailOverlays();
        this.initHomeCardClicks();
        this.initPerformanceMode();
        this.initChart();
        this.initFreqLockNew();
        this.initExpandableCards();
        this.initThemeSelector();
        this.initSliderProgress();
        this.initSwapSettings();
        this.initVmSettings();
        this.initKernelFeatures();
        this.initZramWriteback();
        this.initZramPath();
        this.initAutoClean();
        this.initCustomScripts();
        this.initSystemOpt();
        this.initScrollEffect();
        this.initModuleIntro();
        Promise.all([this.loadZramStatus(), this.loadLe9uoStatus()]);
    }
    updateSliderProgress(slider) {
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        const percent = ((val - min) / (max - min)) * 100;
        const isDark = document.body.classList.contains('theme-dark');
        const isPurple = slider.closest('.priority-nice-slider-container');
        const filledColor = isPurple ? 'rgba(156, 39, 176, 0.8)' : 'rgba(52, 130, 255, 0.8)';
        const emptyColor = isDark ? 'rgba(255, 255, 255, 0.15)' : (isPurple ? 'rgba(156, 39, 176, 0.12)' : 'rgba(52, 130, 255, 0.12)');
        slider.style.background = `linear-gradient(to right, ${filledColor} 0%, ${filledColor} ${percent}%, ${emptyColor} ${percent}%, ${emptyColor} 100%)`;
    }
    initSliderProgress() {
        document.querySelectorAll('.range-slider').forEach(slider => {
            this.updateSliderProgress(slider);
            slider.addEventListener('input', () => this.updateSliderProgress(slider));
        });
    }
    async exec(cmd) {
        return new Promise((resolve) => {
            const callbackId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            const timeout = setTimeout(() => { delete window[callbackId]; resolve(''); }, 8000);
            window[callbackId] = (code, stdout, stderr) => { clearTimeout(timeout); delete window[callbackId]; resolve(stdout ? stdout.trim() : ''); };
            try { ksu.exec(cmd, '{}', callbackId); } catch (e) { clearTimeout(timeout); delete window[callbackId]; resolve(''); }
        });
    }
    showConfirm(message, title = '确认') {
        return new Promise((resolve) => {
            const overlay = document.getElementById('confirm-dialog-overlay');
            const titleEl = document.getElementById('confirm-dialog-title');
            const messageEl = document.getElementById('confirm-dialog-message');
            const cancelBtn = document.getElementById('confirm-dialog-cancel');
            const okBtn = document.getElementById('confirm-dialog-ok');
            titleEl.textContent = title;
            messageEl.textContent = message;
            const cleanup = () => {
                this.hideOverlay('confirm-dialog-overlay');
                cancelBtn.removeEventListener('click', onCancel);
                okBtn.removeEventListener('click', onOk);
                overlay.removeEventListener('click', onOverlayClick);
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
    async ensureConfigDir() { await this.exec(`mkdir -p ${this.configDir}`); }
    initTheme() {
        const savedTheme = localStorage.getItem('corona_theme') || 'auto';
        this.state.theme = savedTheme;
        this.applyTheme(savedTheme);
    }
    applyTheme(theme) {
        const body = document.body;
        const newThemeClass = theme === 'auto' 
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-light')
            : `theme-${theme}`;
        body.classList.remove('theme-light', 'theme-dark');
        body.classList.add(newThemeClass);
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
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (this.state.theme === 'auto') { this.applyTheme('auto'); } });
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
        this.drawChart();
    }
    drawChart() {
        if (!this.chartCtx) return;
        const canvas = this.chartCanvas;
        const ctx = this.chartCtx;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const width = rect.width;
        const height = rect.height;
        ctx.clearRect(0, 0, width, height);
        const styles = getComputedStyle(document.body);
        const textMain = styles.getPropertyValue('--text-main').trim() || '#1A1A1A';
        const textSub = styles.getPropertyValue('--text-sub').trim() || '#6E6E6E';
        let data = [], maxVal = 100, unit = '%', color1 = '#3482FF', color2 = 'rgba(52, 130, 255, 0.2)', label = 'CPU 使用率';
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
            { toggle: 'le9uo-toggle', content: 'le9uo-content', onExpand: () => this.loadLe9uoStatus() },
            { toggle: 'io-scheduler-toggle', content: 'io-scheduler-content', onExpand: null },
            { toggle: 'cpu-governor-toggle', content: 'cpu-governor-content', onExpand: null },
            { toggle: 'process-priority-toggle', content: 'process-priority-content', onExpand: null },
            { toggle: 'tcp-toggle', content: 'tcp-content', onExpand: null },
            { toggle: 'custom-scripts-toggle', content: 'custom-scripts-content', onExpand: null },
            { toggle: 'system-opt-toggle', content: 'system-opt-content', onExpand: () => this.loadSystemOptConfig() },
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
                    if (isExpanded) {
                        content.style.maxHeight = content.scrollHeight + 'px';
                        content.offsetHeight;
                        content.classList.remove('expanded');
                        toggle.classList.remove('expanded');
                        requestAnimationFrame(() => {
                            content.style.maxHeight = '';
                        });
                    } else {
                        content.classList.add('expanded');
                        toggle.classList.add('expanded');
                        content.style.maxHeight = content.scrollHeight + 'px';
                        const onTransitionEnd = () => {
                            content.style.maxHeight = '';
                            content.removeEventListener('transitionend', onTransitionEnd);
                        };
                        content.addEventListener('transitionend', onTransitionEnd);
                        if (card.onExpand) card.onExpand();
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
            toggle.addEventListener('click', () => {
                const isExpanded = list.classList.contains('expanded');
                list.classList.toggle('expanded', !isExpanded);
                toggle.classList.toggle('expanded', !isExpanded);
            });
        }
        const savedVisibility = localStorage.getItem('corona_card_visibility');
        let visibility = savedVisibility ? (() => { try { return JSON.parse(savedVisibility); } catch (e) { return {}; } })() : {};
        const switches = document.querySelectorAll('.card-visibility-switch');
        switches.forEach(sw => {
            const cardKey = sw.dataset.card;
            const card = document.querySelector(`.module-card[data-card-key="${cardKey}"]`);
            const isVisible = visibility[cardKey] !== false;
            sw.checked = isVisible;
            if (card) card.classList.toggle('card-hidden', !isVisible);
            sw.addEventListener('change', () => {
                visibility[cardKey] = sw.checked;
                localStorage.setItem('corona_card_visibility', JSON.stringify(visibility));
                if (card) card.classList.toggle('card-hidden', !sw.checked);
            });
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
                    if (isExpanded) {
                        content.classList.remove('expanded');
                        toggle.classList.remove('expanded');
                        if (icon) icon.classList.remove('expanded');
                    } else {
                        content.classList.add('expanded');
                        toggle.classList.add('expanded');
                        if (icon) icon.classList.add('expanded');
                        if (card.onExpand) card.onExpand();
                    }
                });
            }
        });
    }
    initFreqLockNew() {
        this.freqMode = 'off';
        const options = document.querySelectorAll('.freq-mode-option');
        options.forEach(opt => {
            opt.addEventListener('click', async () => {
                options.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                this.freqMode = opt.dataset.mode;
                document.getElementById('freq-global-settings').classList.toggle('hidden', this.freqMode !== 'global');
                document.getElementById('freq-per-core-settings').classList.toggle('hidden', this.freqMode !== 'per-core');
                if (this.freqMode === 'per-core') this.renderPerCoreFreqSettings();
                if (this.freqMode === 'off') await this.resetFreqToDefault();
                this.updateFreqLockStatus();
                await this.saveFreqLockConfig();
            });
        });
        document.getElementById('global-min-freq').addEventListener('change', () => this.applyGlobalFreq());
        document.getElementById('global-max-freq').addEventListener('change', () => this.applyGlobalFreq());
    }
    async resetFreqToDefault() {
        this.showLoading(true);
        const coreCount = this.cpuCores.length || 8;
        const promises = [];
        for (let i = 0; i < coreCount; i++) {
            const freqs = this.cpuFreqsPerCore[i] || [];
            if (freqs.length > 0) {
                const minFreq = freqs[0]; const maxFreq = freqs[freqs.length - 1];
                promises.push(this.exec(`echo ${minFreq} > /sys/devices/system/cpu/cpu${i}/cpufreq/scaling_min_freq 2>/dev/null`));
                promises.push(this.exec(`echo ${maxFreq} > /sys/devices/system/cpu/cpu${i}/cpufreq/scaling_max_freq 2>/dev/null`));
            }
        }
        await Promise.all(promises);
        this.showLoading(false);
        this.showToast('频率已恢复默认');
    }
    initHomeCardClicks() {
        document.getElementById('cpu-card').addEventListener('click', () => { this.switchPage('settings'); setTimeout(() => { const cpuCard = document.getElementById('cpu-governor-card'); if (cpuCard) cpuCard.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300); });
        document.getElementById('swap-card').addEventListener('click', () => { this.switchPage('settings'); setTimeout(() => { const zramCard = document.getElementById('zram-card'); if (zramCard) zramCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300); });
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
        if (overlay) {
            overlay.classList.remove('hidden');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => overlay.classList.add('show'));
            });
            if (overlay.classList.contains('no-close-btn')) {
                const floatingHeader = document.getElementById('floating-header');
                if (floatingHeader) {
                    floatingHeader.classList.add('overlay-hidden');
                }
            }
        }
    }
    hideOverlay(id) {
        const overlay = document.getElementById(id);
        if (overlay) {
            if (id === 'module-intro-overlay') {
                overlay.classList.add('closing');
                overlay.classList.remove('show');
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    overlay.classList.remove('closing');
                }, 250);
                return;
            }
            overlay.classList.remove('show');
            if (overlay.classList.contains('no-close-btn')) {
                const floatingHeader = document.getElementById('floating-header');
                if (floatingHeader) {
                    floatingHeader.classList.remove('overlay-hidden');
                }
            }
            const onTransitionEnd = () => {
                overlay.classList.add('hidden');
                overlay.removeEventListener('transitionend', onTransitionEnd);
            };
            overlay.addEventListener('transitionend', onTransitionEnd);
            setTimeout(() => {
                overlay.classList.add('hidden');
                overlay.removeEventListener('transitionend', onTransitionEnd);
            }, 350);
        }
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
    async loadFreqLockConfig() {
        const config = await this.exec(`cat ${this.configDir}/freq_lock.conf 2>/dev/null`);
        this.freqMode = 'off';
        if (config) { const lines = config.split('\n'); for (const line of lines) { if (line.startsWith('mode=')) this.freqMode = line.split('=')[1]; } }
        const options = document.querySelectorAll('.freq-mode-option');
        options.forEach(opt => opt.classList.toggle('selected', opt.dataset.mode === this.freqMode));
        document.getElementById('freq-global-settings').classList.toggle('hidden', this.freqMode !== 'global');
        document.getElementById('freq-per-core-settings').classList.toggle('hidden', this.freqMode !== 'per-core');
        this.updateFreqLockStatus();
    }
    async loadGlobalFreqSelects() {
        const allFreqs = [];
        for (let i = 0; i < this.cpuCores.length; i++) { const freqs = this.cpuFreqsPerCore[i] || []; freqs.forEach(f => { if (!allFreqs.includes(f)) allFreqs.push(f); }); }
        allFreqs.sort((a, b) => a - b);
        const minSel = document.getElementById('global-min-freq');
        const maxSel = document.getElementById('global-max-freq');
        minSel.innerHTML = allFreqs.map(f => `<option value="${f}">${(f/1000).toFixed(0)} MHz</option>`).join('');
        maxSel.innerHTML = allFreqs.map(f => `<option value="${f}">${(f/1000).toFixed(0)} MHz</option>`).join('');
        if (allFreqs.length > 0) { minSel.value = allFreqs[0]; maxSel.value = allFreqs[allFreqs.length - 1]; }
    }
    renderPerCoreFreqSettings() {
        const container = document.getElementById('per-core-freq-list');
        container.innerHTML = '';
        for (let i = 0; i < this.cpuCores.length; i++) {
            const freqs = this.cpuFreqsPerCore[i] || [];
            if (freqs.length === 0) continue;
            const div = document.createElement('div');
            div.className = 'per-core-freq-item';
            div.innerHTML = `<div class="per-core-header">CPU ${i}</div><div class="per-core-selects"><select class="freq-select per-core-min" data-cpu="${i}">${freqs.map(f => `<option value="${f}">${(f/1000).toFixed(0)} MHz</option>`).join('')}</select><span>~</span><select class="freq-select per-core-max" data-cpu="${i}">${freqs.map(f => `<option value="${f}">${(f/1000).toFixed(0)} MHz</option>`).join('')}</select></div>`;
            container.appendChild(div);
            const minSel = div.querySelector('.per-core-min');
            const maxSel = div.querySelector('.per-core-max');
            if (freqs.length > 0) { minSel.value = freqs[0]; maxSel.value = freqs[freqs.length - 1]; }
            minSel.addEventListener('change', () => this.applyPerCoreFreq());
            maxSel.addEventListener('change', () => this.applyPerCoreFreq());
        }
    }
    async applyGlobalFreq() {
        const minFreq = document.getElementById('global-min-freq').value;
        const maxFreq = document.getElementById('global-max-freq').value;
        if (parseInt(minFreq) > parseInt(maxFreq)) { this.showToast('最小频率不能大于最大频率'); return; }
        this.showLoading(true);
        await Promise.all([
            this.exec(`for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_min_freq; do echo "${minFreq}" > "$f" 2>/dev/null; done`),
            this.exec(`for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq; do echo "${maxFreq}" > "$f" 2>/dev/null; done`)
        ]);
        await this.saveFreqLockConfig();
        this.showLoading(false);
        this.showToast(`频率已锁定: ${(minFreq/1000).toFixed(0)}~${(maxFreq/1000).toFixed(0)} MHz`);
        this.updateFreqLockStatus();
    }
    async applyPerCoreFreq() {
        this.showLoading(true);
        const minSels = document.querySelectorAll('.per-core-min');
        const maxSels = document.querySelectorAll('.per-core-max');
        const promises = [];
        for (let i = 0; i < minSels.length; i++) {
            const minFreq = minSels[i].value; const maxFreq = maxSels[i].value; const cpu = minSels[i].dataset.cpu;
            if (parseInt(minFreq) <= parseInt(maxFreq)) {
                promises.push(this.exec(`echo "${minFreq}" > /sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_min_freq 2>/dev/null`));
                promises.push(this.exec(`echo "${maxFreq}" > /sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_max_freq 2>/dev/null`));
            }
        }
        await Promise.all(promises);
        await this.saveFreqLockConfig();
        this.showLoading(false);
        this.showToast('核心频率已应用');
        this.updateFreqLockStatus();
    }
    async saveFreqLockConfig() {
        let config = `mode=${this.freqMode}\n`;
        if (this.freqMode === 'global') { const minFreq = document.getElementById('global-min-freq').value; const maxFreq = document.getElementById('global-max-freq').value; config += `global_min=${minFreq}\nglobal_max=${maxFreq}\n`; }
        if (this.freqMode === 'per-core') { const minSels = document.querySelectorAll('.per-core-min'); const maxSels = document.querySelectorAll('.per-core-max'); for (let i = 0; i < minSels.length; i++) { config += `cpu${i}_min=${minSels[i].value}\ncpu${i}_max=${maxSels[i].value}\n`; } }
        await this.exec(`echo '${config}' > ${this.configDir}/freq_lock.conf`);
    }
    updateFreqLockStatus() { const badge = document.getElementById('freq-lock-status'); const modeNames = { 'off': '关闭', 'global': '全局', 'per-core': '按核心' }; badge.textContent = modeNames[this.freqMode] || '关闭'; }
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
        document.querySelectorAll('.tab-item').forEach(tab => { tab.addEventListener('click', (e) => this.switchPage(e.currentTarget.dataset.page)); });
        document.getElementById('zram-switch').addEventListener('change', (e) => { this.state.zramEnabled = e.target.checked; this.toggleZramSettings(e.target.checked); this.saveZramConfig(); });
        document.getElementById('zram-size-slider').addEventListener('input', (e) => { this.state.zramSize = parseFloat(e.target.value); document.getElementById('zram-size-value').textContent = `${this.state.zramSize.toFixed(2)} GB`; });
        document.getElementById('zram-size-slider').addEventListener('change', (e) => { this.state.zramSize = parseFloat(e.target.value); if (this.state.zramEnabled) this.applyZramImmediate(); else this.saveZramConfig(); });
        document.getElementById('swappiness-slider').addEventListener('input', (e) => { this.state.swappiness = parseInt(e.target.value); document.getElementById('swappiness-value').textContent = this.state.swappiness; });
        document.getElementById('swappiness-slider').addEventListener('change', (e) => { this.state.swappiness = parseInt(e.target.value); if (this.state.zramEnabled) this.applySwappinessImmediate(); else this.saveZramConfig(); });
        document.getElementById('le9uo-switch').addEventListener('change', (e) => { this.state.le9uoEnabled = e.target.checked; this.toggleLe9uoSettings(e.target.checked); this.saveLe9uoConfig(); });
        document.getElementById('le9uo-anon-slider').addEventListener('input', (e) => { this.state.le9uoAnon = parseInt(e.target.value); document.getElementById('le9uo-anon-value').textContent = `${this.state.le9uoAnon}%`; });
        document.getElementById('le9uo-anon-slider').addEventListener('change', (e) => { this.state.le9uoAnon = parseInt(e.target.value); if (this.state.le9uoEnabled) this.applyLe9uoImmediate(); else this.saveLe9uoConfig(); });
        document.getElementById('le9uo-clean-low-slider').addEventListener('input', (e) => { this.state.le9uoCleanLow = parseInt(e.target.value); document.getElementById('le9uo-clean-low-value').textContent = `${this.state.le9uoCleanLow}%`; });
        document.getElementById('le9uo-clean-low-slider').addEventListener('change', (e) => { this.state.le9uoCleanLow = parseInt(e.target.value); if (this.state.le9uoEnabled) this.applyLe9uoImmediate(); else this.saveLe9uoConfig(); });
        document.getElementById('le9uo-clean-min-slider').addEventListener('input', (e) => { this.state.le9uoCleanMin = parseInt(e.target.value); document.getElementById('le9uo-clean-min-value').textContent = `${this.state.le9uoCleanMin}%`; });
        document.getElementById('le9uo-clean-min-slider').addEventListener('change', (e) => { this.state.le9uoCleanMin = parseInt(e.target.value); if (this.state.le9uoEnabled) this.applyLe9uoImmediate(); else this.saveLe9uoConfig(); });
    }
    toggleLe9uoSettings(show) { const settings = document.getElementById('le9uo-settings'); if (show) { settings.classList.remove('hidden'); this.loadLe9uoStatus(); } else { settings.classList.add('hidden'); } }
    async loadLe9uoConfig() {
        const exists = await this.exec('cat /proc/sys/vm/anon_min_ratio 2>/dev/null');
        this.le9uoSupported = !!exists;
        if (!exists) { document.getElementById('le9uo-card').style.display = 'none'; return; }
        const config = await this.exec(`cat ${this.configDir}/le9uo.conf 2>/dev/null`);
        if (config) {
            const enabledMatch = config.match(/enabled=(\d)/);
            const anonMatch = config.match(/anon_min=(\d+)/);
            const cleanLowMatch = config.match(/clean_low=(\d+)/);
            const cleanMinMatch = config.match(/clean_min=(\d+)/);
            if (enabledMatch) { this.state.le9uoEnabled = enabledMatch[1] === '1'; document.getElementById('le9uo-switch').checked = this.state.le9uoEnabled; this.toggleLe9uoSettings(this.state.le9uoEnabled); }
            if (anonMatch) { this.state.le9uoAnon = parseInt(anonMatch[1]); document.getElementById('le9uo-anon-slider').value = this.state.le9uoAnon; document.getElementById('le9uo-anon-value').textContent = `${this.state.le9uoAnon}%`; }
            if (cleanLowMatch) { this.state.le9uoCleanLow = parseInt(cleanLowMatch[1]); document.getElementById('le9uo-clean-low-slider').value = this.state.le9uoCleanLow; document.getElementById('le9uo-clean-low-value').textContent = `${this.state.le9uoCleanLow}%`; }
            if (cleanMinMatch) { this.state.le9uoCleanMin = parseInt(cleanMinMatch[1]); document.getElementById('le9uo-clean-min-slider').value = this.state.le9uoCleanMin; document.getElementById('le9uo-clean-min-value').textContent = `${this.state.le9uoCleanMin}%`; }
        }
        await this.loadLe9uoStatus();
    }
    async loadLe9uoStatus() {
        const [anon, cleanLow, cleanMin] = await Promise.all([
            this.exec('cat /proc/sys/vm/anon_min_ratio 2>/dev/null'),
            this.exec('cat /proc/sys/vm/clean_low_ratio 2>/dev/null'),
            this.exec('cat /proc/sys/vm/clean_min_ratio 2>/dev/null')
        ]);
        document.getElementById('le9uo-anon-current').textContent = anon ? `${parseInt(anon)}%` : '--';
        document.getElementById('le9uo-clean-low-current').textContent = cleanLow ? `${parseInt(cleanLow)}%` : '--';
        document.getElementById('le9uo-clean-min-current').textContent = cleanMin ? `${parseInt(cleanMin)}%` : '--';
        const le9uoBadge = document.getElementById('le9uo-badge');
        const hasConfig = (anon && parseInt(anon) > 0) || (cleanLow && parseInt(cleanLow) > 0) || (cleanMin && parseInt(cleanMin) > 0);
        if (le9uoBadge) le9uoBadge.textContent = hasConfig ? '已启用' : '未启用';
    }
    async saveLe9uoConfig() {
        const config = `enabled=${this.state.le9uoEnabled ? '1' : '0'}\nanon_min=${this.state.le9uoAnon}\nclean_low=${this.state.le9uoCleanLow}\nclean_min=${this.state.le9uoCleanMin}`;
        await this.exec(`echo '${config}' > ${this.configDir}/le9uo.conf`);
        if (this.state.le9uoEnabled) { this.showLoading(true); await this.applyLe9uoImmediate(); this.showLoading(false); }
        else { this.showToast('LE9UO 配置已保存（禁用状态）'); await this.updateModuleDescription(); }
    }
    async applyLe9uoImmediate() {
        await Promise.all([
            this.exec(`echo ${this.state.le9uoAnon} > /proc/sys/vm/anon_min_ratio`),
            this.exec(`echo ${this.state.le9uoCleanLow} > /proc/sys/vm/clean_low_ratio`),
            this.exec(`echo ${this.state.le9uoCleanMin} > /proc/sys/vm/clean_min_ratio`)
        ]);
        const config = `enabled=1\nanon_min=${this.state.le9uoAnon}\nclean_low=${this.state.le9uoCleanLow}\nclean_min=${this.state.le9uoCleanMin}`;
        await this.exec(`echo '${config}' > ${this.configDir}/le9uo.conf`);
        await this.updateModuleDescription();
        this.showToast('LE9UO 配置已应用');
        setTimeout(() => this.loadLe9uoStatus(), 500);
    }
    toggleZramSettings(show) { const settings = document.getElementById('zram-settings'); if (show) { settings.classList.remove('hidden'); this.loadZramStatus(); } else { settings.classList.add('hidden'); } }
    switchPage(pageName) {
        const pages = document.querySelectorAll('.page');
        const tabs = document.querySelectorAll('.tab-item');
        const slider = document.getElementById('tab-slider');
        const currentActive = document.querySelector('.page.active');
        const targetPage = document.getElementById(`page-${pageName}`);
        if (currentActive === targetPage) return;
        pages.forEach(p => p.classList.remove('left', 'right'));
        if (pageName === 'settings') { currentActive.classList.add('left'); slider.classList.add('right'); }
        else { currentActive.classList.add('right'); slider.classList.remove('right'); }
        currentActive.classList.remove('active');
        targetPage.classList.add('active');
        tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.page === pageName));
    }
    renderStaticOptions() { this.renderAlgorithmOptions(); this.renderReadaheadOptions(); }
    renderAlgorithmOptions() {
        const container = document.getElementById('algorithm-list');
        container.innerHTML = this.algorithms.map(alg => `<div class="option-item ${alg === this.state.algorithm ? 'selected' : ''}" data-value="${alg}">${alg}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => { container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected')); e.currentTarget.classList.add('selected'); this.state.algorithm = e.currentTarget.dataset.value; if (this.state.zramEnabled) await this.applyZramImmediate(); else await this.saveZramConfig(); });
        });
    }
    renderReadaheadOptions() {
        const container = document.getElementById('readahead-list');
        container.innerHTML = this.readaheadOptions.map(size => `<div class="option-item ${size === this.state.readahead ? 'selected' : ''}" data-value="${size}">${size}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => { container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected')); e.currentTarget.classList.add('selected'); this.state.readahead = parseInt(e.currentTarget.dataset.value); await this.applyReadaheadImmediate(); });
        });
    }
    async applyReadaheadImmediate() { await this.exec(`for f in /sys/block/*/queue/read_ahead_kb; do echo ${this.state.readahead} > "$f" 2>/dev/null; done`); await this.exec(`echo 'readahead=${this.state.readahead}' >> ${this.configDir}/io_scheduler.conf`); this.showToast(`预读取大小: ${this.state.readahead} KB`); }
    async loadDeviceInfo() {
        const [brand, model, socModel, hardware, chipname, androidVersion, sdk, kernelVersion, battDesign] = await Promise.all([
            this.exec('getprop ro.product.brand'),
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
        document.getElementById('device-model').textContent = model || '--';
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
        if (this.kernelVersion.toLowerCase().includes('corona')) {
            this.algorithms = ['lz4', 'lz4hc', 'lzo', 'lzo-rle', 'zstd', 'zstdn', 'deflate', 'lz4k', 'lz4kd'];
        } else {
            const algRaw = await this.exec('cat /sys/block/zram0/comp_algorithm 2>/dev/null');
            if (algRaw) {
                this.algorithms = algRaw.replace(/\[|\]/g, '').split(/\s+/).filter(a => a.length > 0);
            }
            if (!this.algorithms || this.algorithms.length === 0) {
                this.algorithms = ['lz4', 'lzo', 'zstd'];
            }
        }
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
    startRealtimeMonitor() { this.updateRealtimeData(); setInterval(() => this.updateRealtimeData(), 3000); }
    async updateRealtimeData() {
        const [batteryData, memData, cpuData] = await Promise.all([this.updateBatteryInfo(), this.updateMemoryInfo(), this.updateCpuUsage()]);
        await Promise.all([this.updateSwapInfo(), this.updateStorageInfo(), this.updateCpuTemp()]);
        const cpuTemp = parseFloat(document.getElementById('cpu-temp').textContent) || 0;
        const batteryTemp = parseFloat(document.getElementById('battery-temp').textContent) || 0;
        const memPercent = memData || 0;
        const cpuPercent = cpuData || 0;
        this.updateHistoryData(cpuPercent, memPercent, cpuTemp, batteryTemp);
        if (document.getElementById('page-settings').classList.contains('active')) await this.updateCpuLoads();
    }
    async updateCpuUsage() {
        const stat1 = await this.exec('cat /proc/stat | head -1');
        await this.sleep(100);
        const stat2 = await this.exec('cat /proc/stat | head -1');
        const parse = (line) => { const parts = line.split(/\s+/).slice(1).map(Number); const idle = parts[3] + (parts[4] || 0); const total = parts.reduce((a, b) => a + b, 0); return { idle, total }; };
        const s1 = parse(stat1); const s2 = parse(stat2);
        const idleDiff = s2.idle - s1.idle; const totalDiff = s2.total - s1.total;
        return totalDiff > 0 ? ((1 - idleDiff / totalDiff) * 100) : 0;
    }
    async updateBatteryInfo() {
        const [level, temp] = await Promise.all([this.exec('cat /sys/class/power_supply/battery/capacity'), this.exec('cat /sys/class/power_supply/battery/temp')]);
        document.getElementById('battery-level').textContent = `${level}%`;
        if (temp && !isNaN(temp)) document.getElementById('battery-temp').textContent = `${(parseInt(temp) / 10).toFixed(1)}°C`;
    }
    async updateCpuTemp() {
        const tempPaths = ['/sys/class/thermal/thermal_zone0/temp', '/sys/devices/virtual/thermal/thermal_zone0/temp', '/sys/class/hwmon/hwmon0/temp1_input'];
        for (const path of tempPaths) { const temp = await this.exec(`cat ${path} 2>/dev/null`); if (temp && !isNaN(temp)) { const val = parseInt(temp); document.getElementById('cpu-temp').textContent = `${(val > 1000 ? val / 1000 : val).toFixed(1)}°C`; return; } }
        document.getElementById('cpu-temp').textContent = '--';
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
        await Promise.all([ this.loadZramConfig(), this.loadLe9uoConfig(), this.loadIOConfig(), this.loadCpuGovernorConfig(), this.loadTCPConfig(), this.loadCpuCores(), this.loadPerformanceModeConfig(), this.loadFreqLockConfig() ]);
        await Promise.all([ this.loadZramStatus(), this.loadSwapStatus() ]);
        await this.updateModuleDescription();
        this.updateClusterBadge();
        document.querySelectorAll('.range-slider').forEach(slider => this.updateSliderProgress(slider));
    }
    updateClusterBadge() { const badge = document.getElementById('cpu-cluster-badge'); if (badge) { badge.textContent = this.formatClusterInfo() || '--'; } }
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
        }
        await this.loadZramStatus();
    }
    async loadZramStatus() {
        const zramBlock = this.state.zramPath.replace('/dev/block/', '').replace('/dev/', '');
        const [algRaw, disksize, swappiness] = await Promise.all([
            this.exec(`cat /sys/block/${zramBlock}/comp_algorithm 2>/dev/null`),
            this.exec(`cat /sys/block/${zramBlock}/disksize 2>/dev/null`),
            this.exec('cat /proc/sys/vm/swappiness 2>/dev/null')
        ]);
        const currentAlg = algRaw.match(/\[([^\]]+)\]/)?.[1] || algRaw.split(' ')[0] || '--';
        const sizeGB = disksize ? (parseInt(disksize) / 1024 / 1024 / 1024).toFixed(1) : '0';
        document.getElementById('zram-current-alg').textContent = currentAlg;
        document.getElementById('zram-current-size').textContent = `${sizeGB} GB`;
        document.getElementById('zram-current-swappiness').textContent = swappiness.trim() || '--';
        const statusEl = document.getElementById('zram-status');
        if (statusEl) statusEl.textContent = parseInt(disksize) > 0 ? currentAlg.toUpperCase() : '未启用';
        const memBadge = document.getElementById('memory-compression-badge');
        if (memBadge) memBadge.textContent = parseInt(disksize) > 0 ? `ZRAM: ${currentAlg.toUpperCase()}` : '未配置';
        const pathDisplay = document.getElementById('zram-current-path');
        if (pathDisplay) pathDisplay.textContent = this.state.zramPath;
    }
    async saveZramConfig() {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const config = `enabled=${this.state.zramEnabled ? '1' : '0'}\nalgorithm=${this.state.algorithm}\nsize=${sizeBytes}\nswappiness=${this.state.swappiness}\nzram_writeback=${this.state.zramWriteback}\nzram_path=${this.state.zramPath}`;
        await this.exec(`echo '${config}' > ${this.configDir}/zram.conf`);
        if (this.state.zramEnabled) { this.showLoading(true); await this.applyZramImmediate(); this.showLoading(false); }
        else { this.showToast('ZRAM 配置已保存（禁用状态）'); await this.updateModuleDescription(); }
    }
    async applyZramImmediate() {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const zramDev = this.state.zramPath;
        const zramBlock = zramDev.replace('/dev/block/', '').replace('/dev/', '');
        this.showLoading(true);
        await this.exec(`swapoff ${zramDev} 2>/dev/null`);
        await this.exec(`echo 1 > /sys/block/${zramBlock}/reset 2>/dev/null`);
        await this.exec(`echo "${this.state.algorithm}" > /sys/block/${zramBlock}/comp_algorithm`);
        if (this.state.zramWriteback === 'false') {
            await this.exec(`echo none > /sys/block/${zramBlock}/backing_dev 2>/dev/null`);
        }
        await this.exec(`echo "${sizeBytes}" > /sys/block/${zramBlock}/disksize`);
        await this.exec(`mkswap ${zramDev}`);
        await this.exec(`swapon ${zramDev} -p 32758 2>/dev/null || swapon ${zramDev}`);
        await this.exec(`echo "${this.state.swappiness}" > /proc/sys/vm/swappiness`);
        const config = `enabled=1\nalgorithm=${this.state.algorithm}\nsize=${sizeBytes}\nswappiness=${this.state.swappiness}\nzram_writeback=${this.state.zramWriteback}\nzram_path=${this.state.zramPath}`;
        await this.exec(`echo '${config}' > ${this.configDir}/zram.conf`);
        await this.updateModuleDescription();
        this.showLoading(false);
        this.showToast('ZRAM 配置已应用');
        setTimeout(() => this.loadZramStatus(), 500);
    }
    async applySwappinessImmediate() {
        await this.exec(`echo "${this.state.swappiness}" > /proc/sys/vm/swappiness`);
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const config = `enabled=${this.state.zramEnabled ? '1' : '0'}\nalgorithm=${this.state.algorithm}\nsize=${sizeBytes}\nswappiness=${this.state.swappiness}\nzram_writeback=${this.state.zramWriteback}\nzram_path=${this.state.zramPath}`;
        await this.exec(`echo '${config}' > ${this.configDir}/zram.conf`);
        await this.updateModuleDescription();
        this.showToast(`Swappiness: ${this.state.swappiness}`);
    }
    async loadIOConfig() {
        const schedulerRaw = await this.exec('cat /sys/block/sda/queue/scheduler 2>/dev/null || cat /sys/block/mmcblk0/queue/scheduler 2>/dev/null');
        const readahead = await this.exec('cat /sys/block/sda/queue/read_ahead_kb 2>/dev/null || cat /sys/block/mmcblk0/queue/read_ahead_kb 2>/dev/null');
        const availableSchedulers = [];
        let currentScheduler = '';
        if (schedulerRaw) {
            const matches = schedulerRaw.match(/\[([^\]]+)\]/);
            if (matches) currentScheduler = matches[1];
            schedulerRaw.replace(/\[([^\]]+)\]/g, '$1').split(/\s+/).filter(s => s).forEach(s => {
                if (!availableSchedulers.includes(s)) availableSchedulers.push(s);
            });
        }
        this.state.ioScheduler = currentScheduler;
        if (readahead) this.state.readahead = parseInt(readahead);
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
        if (currentEl) currentEl.textContent = currentScheduler || '--';
        this.renderReadaheadOptions();
    }
    async applyIOSchedulerImmediate() {
        const kernelVersion = await this.exec('uname -r');
        const isCorona = kernelVersion.toLowerCase().includes('corona');
        const schedCmd = isCorona ? `kernel:${this.state.ioScheduler}` : this.state.ioScheduler;
        await this.exec(`for f in /sys/block/*/queue/scheduler; do echo "${schedCmd}" > "$f" 2>/dev/null; done`);
        const config = `scheduler=${this.state.ioScheduler}\nreadahead=${this.state.readahead}`;
        await this.exec(`echo '${config}' > ${this.configDir}/io_scheduler.conf`);
        await this.updateModuleDescription();
        const currentEl = document.getElementById('io-current');
        if (currentEl) currentEl.textContent = this.state.ioScheduler;
        this.showToast(`I/O 调度器: ${this.state.ioScheduler}`);
    }
    async loadCpuGovernorConfig() {
        const governorRaw = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors 2>/dev/null');
        const currentGovernor = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null');
        const availableGovernors = governorRaw.split(/\s+/).filter(g => g);
        this.state.cpuGovernor = currentGovernor.trim();
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
        if (currentEl) currentEl.textContent = this.state.cpuGovernor || '--';
    }
    async applyCpuGovernorImmediate() {
        await this.exec(`for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo "${this.state.cpuGovernor}" > "$f" 2>/dev/null; done`);
        await this.exec(`echo 'governor=${this.state.cpuGovernor}' > ${this.configDir}/cpu_governor.conf`);
        await this.updateModuleDescription();
        document.getElementById('cpu-gov-current').textContent = this.state.cpuGovernor;
        this.showToast(`CPU 调频器: ${this.state.cpuGovernor}`);
    }
    async loadTCPConfig() {
        const tcpRaw = await this.exec('cat /proc/sys/net/ipv4/tcp_available_congestion_control 2>/dev/null');
        const currentTcp = await this.exec('cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null');
        const availableTcp = tcpRaw.split(/\s+/).filter(t => t);
        this.state.tcp = currentTcp.trim();
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
        document.getElementById('tcp-current').textContent = this.state.tcp || '--';
    }
    async applyTcpImmediate() {
        await this.exec(`echo "${this.state.tcp}" > /proc/sys/net/ipv4/tcp_congestion_control`);
        await this.exec(`echo 'tcp=${this.state.tcp}' > ${this.configDir}/tcp.conf`);
        await this.updateModuleDescription();
        document.getElementById('tcp-current').textContent = this.state.tcp;
        this.showToast(`TCP 拥塞算法: ${this.state.tcp}`);
    }
    async loadCpuCores() {
        const cpuCount = parseInt(await this.exec('ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null | wc -l')) || 8;
        const totalCores = this.getTotalCoreCount();
        const maxCores = totalCores > 0 ? totalCores : cpuCount;
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
            this.cpuCores.push({ id: i, online: i === 0 ? true : online === '1', locked: i === 0, maxFreq: maxFreq ? parseInt(maxFreq) : 0, load: '--' });
            const freqs = await this.exec(`cat /sys/devices/system/cpu/cpu${i}/cpufreq/scaling_available_frequencies 2>/dev/null`);
            if (freqs) this.cpuFreqsPerCore[i] = freqs.split(/\s+/).filter(f => f).map(Number).sort((a, b) => a - b);
        }
        this.cpuCores.sort((a, b) => a.id - b.id);
        this.renderCpuCores();
        this.loadGlobalFreqSelects();
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
        await this.exec(`echo '${config}' > ${this.configDir}/cpu_hotplug.conf`);
    }
    async updateModuleDescription() {
        const descParts = [];
        if (this.state.zramEnabled) {
            const algRaw = await this.exec('cat /sys/block/zram0/comp_algorithm 2>/dev/null');
            const currentAlg = algRaw.match(/\[([^\]]+)\]/)?.[1] || algRaw.split(' ')[0] || this.state.algorithm;
            descParts.push(`ZRAM:${currentAlg}`);
        } else { descParts.push(`ZRAM:关闭`); }
        if (this.state.ioScheduler) { descParts.push(`IO:${this.state.ioScheduler}`); }
        else {
            const schedulerRaw = await this.exec('cat /sys/block/sda/queue/scheduler 2>/dev/null || cat /sys/block/mmcblk0/queue/scheduler 2>/dev/null');
            if (schedulerRaw) { const current = schedulerRaw.match(/\[([^\]]+)\]/)?.[1] || schedulerRaw.split(' ')[0]; if (current) descParts.push(`IO:${current}`); else descParts.push(`IO:--`); }
            else { descParts.push(`IO:--`); }
        }
        if (this.state.cpuGovernor) { descParts.push(`CPU:${this.state.cpuGovernor}`); }
        else { const current = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null'); if (current) descParts.push(`CPU:${current.trim()}`); else descParts.push(`CPU:--`); }
        if (this.state.tcp) { descParts.push(`TCP:${this.state.tcp}`); }
        else { const current = await this.exec('cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null'); if (current) descParts.push(`TCP:${current.trim()}`); else descParts.push(`TCP:--`); }
        if (this.le9uoSupported && this.state.le9uoEnabled) { descParts.push(`LE9UO:开启`); }
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
    showLoading(show) { const el = document.getElementById('loading'); if (el) el.classList.toggle('show', show); }
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
    async loadPerformanceModeConfig() { await this.loadPriorityConfig(); }
    initProcessPriority() {
        this.priorityRules = {}; this.priorityProcesses = []; this.selectedPriorityProcess = null; this.selectedNice = 0; this.selectedIoClass = 2; this.selectedIoLevel = 4;
        document.getElementById('priority-add-btn').addEventListener('click', () => this.showPriorityProcessSelector());
        document.getElementById('priority-cancel-btn').addEventListener('click', () => this.hideOverlay('priority-setting-overlay'));
        document.getElementById('priority-save-btn').addEventListener('click', () => this.savePriorityRule());
        document.getElementById('priority-process-search').addEventListener('input', (e) => { this.filterPriorityProcessList(e.target.value); });
        document.getElementById('priority-process-overlay').addEventListener('click', (e) => { if (e.target.id === 'priority-process-overlay') this.hideOverlay('priority-process-overlay'); });
        document.getElementById('priority-setting-overlay').addEventListener('click', (e) => { if (e.target.id === 'priority-setting-overlay') this.hideOverlay('priority-setting-overlay'); });
        const niceSlider = document.getElementById('nice-slider');
        const niceValue = document.getElementById('nice-slider-value');
        niceSlider.addEventListener('input', () => { this.selectedNice = parseInt(niceSlider.value); niceValue.textContent = this.selectedNice; this.updateSliderProgress(niceSlider); });
        document.querySelectorAll('.io-option').forEach(opt => { opt.addEventListener('click', () => { document.querySelectorAll('.io-option').forEach(o => o.classList.remove('selected')); opt.classList.add('selected'); this.selectedIoClass = parseInt(opt.dataset.class); this.selectedIoLevel = parseInt(opt.dataset.level); }); });
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
    }
    renderPriorityRules() {
        const container = document.getElementById('priority-rules-list');
        const ruleNames = Object.keys(this.priorityRules);
        if (ruleNames.length === 0) { container.innerHTML = '<div class="priority-empty">暂无优先级规则</div>'; return; }
        const ioClassNames = { 1: '实时', 2: '尽力', 3: '空闲' };
        container.innerHTML = ruleNames.map(name => { const rule = this.priorityRules[name]; const initial = name.charAt(0).toUpperCase(); return `<div class="priority-rule-item" data-process="${name}"><div class="priority-rule-icon">${initial}</div><div class="priority-rule-info"><div class="priority-rule-name">${name}</div><div class="priority-rule-values">nice: ${rule.nice} | I/O: ${ioClassNames[rule.ioClass] || '尽力'}</div></div><div class="priority-rule-actions"><button class="priority-rule-btn edit" data-action="edit" data-name="${name}">✎</button><button class="priority-rule-btn delete" data-action="delete" data-name="${name}">✕</button></div></div>`; }).join('');
        container.querySelectorAll('.priority-rule-btn').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); const action = btn.dataset.action; const name = btn.dataset.name; if (action === 'edit') this.editPriorityRule(name); else if (action === 'delete') this.deletePriorityRule(name); }); });
    }
    updatePriorityCount() { document.getElementById('priority-count').textContent = `${Object.keys(this.priorityRules).length} 条`; }
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
        if (!this.selectedPriorityProcess) { this.showToast('请先选择进程'); return; }
        this.priorityRules[this.selectedPriorityProcess] = { nice: this.selectedNice, ioClass: this.selectedIoClass, ioLevel: this.selectedIoLevel };
        await this.savePriorityConfig();
        const appliedCount = await this.applyPriorityRule(this.selectedPriorityProcess);
        this.hideOverlay('priority-setting-overlay');
        this.renderPriorityRules();
        this.updatePriorityCount();
        const ioClassNames = { 1: '实时', 2: '尽力', 3: '空闲' };
        if (appliedCount > 0) { this.showToast(`已设置 ${this.selectedPriorityProcess}: nice=${this.selectedNice}, I/O=${ioClassNames[this.selectedIoClass]}`); }
        else { this.showToast(`已保存规则，进程启动时生效`); }
    }
    async savePriorityConfig() { let configContent = ''; for (const [name, rule] of Object.entries(this.priorityRules)) { configContent += `${name}=${rule.nice},${rule.ioClass},${rule.ioLevel}\n`; } await this.exec(`echo '${configContent}' > ${this.configDir}/process_priority.conf`); }
    async applyPriorityRule(processName) {
        const rule = this.priorityRules[processName]; if (!rule) return 0;
        let appliedCount = 0;
        const pids = await this.exec(`pgrep -f "${processName}" 2>/dev/null`);
        if (pids && pids.trim()) {
            const pidList = pids.trim().split('\n').filter(p => p.trim());
            const promises = [];
            for (const pid of pidList) { const trimmedPid = pid.trim(); if (trimmedPid) { promises.push(this.exec(`renice -n ${rule.nice} -p ${trimmedPid} 2>/dev/null`)); promises.push(this.exec(`ionice -c ${rule.ioClass} -n ${rule.ioLevel} -p ${trimmedPid} 2>/dev/null`)); appliedCount++; } }
            await Promise.all(promises);
        }
        return appliedCount;
    }
    async editPriorityRule(processName) { this.selectedPriorityProcess = processName; this.showPrioritySetting(); }
    async deletePriorityRule(processName) { const confirmed = await this.showConfirm(`确定要删除 ${processName} 的优先级规则吗？`, '删除规则'); if (!confirmed) return; delete this.priorityRules[processName]; await this.savePriorityConfig(); this.renderPriorityRules(); this.updatePriorityCount(); this.showToast(`已删除 ${processName} 的优先级规则`); }
    async applyAllPriorityRules() { const promises = Object.keys(this.priorityRules).map(name => this.applyPriorityRule(name)); await Promise.all(promises); }
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
                await this.saveZramConfig();
                await this.loadZramStatus();
                this.showToast('ZRAM 路径已保存');
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
                if (this.state.swapEnabled) this.applySwapConfig();
            });
        }
        if (priorityList) {
            priorityList.querySelectorAll('.option-item').forEach(item => {
                item.addEventListener('click', () => {
                    priorityList.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    this.state.swapPriority = parseInt(item.dataset.value);
                    if (this.state.swapEnabled) this.applySwapConfig();
                });
            });
        }
        this.loadSwapConfig();
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
        const config = await this.exec(`cat ${this.configDir}/swap.conf 2>/dev/null`);
        if (config) {
            const enabledMatch = config.match(/enabled=(\d)/);
            const sizeMatch = config.match(/size=(\d+)/);
            const priorityMatch = config.match(/priority=([\-\d]+)/);
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
        }
        await this.loadSwapStatus();
    }
    async saveSwapConfig() {
        const config = `enabled=${this.state.swapEnabled ? '1' : '0'}\nsize=${this.state.swapSize}\npriority=${this.state.swapPriority}`;
        await this.exec(`echo '${config}' > ${this.configDir}/swap.conf`);
        if (this.state.swapEnabled) {
            this.showLoading(true);
            await this.applySwapImmediate();
            this.showLoading(false);
        } else {
            await this.exec('swapoff /data/swapfile 2>/dev/null');
            await this.exec('rm -f /data/swapfile 2>/dev/null');
            this.showToast('Swap 已关闭');
            await this.loadSwapStatus();
        }
    }
    async applySwapImmediate() {
        await this.exec('swapoff /data/swapfile 2>/dev/null');
        await this.exec('rm -f /data/swapfile 2>/dev/null');
        await this.exec(`dd if=/dev/zero of=/data/swapfile bs=1M count=${this.state.swapSize} 2>/dev/null`);
        await this.exec('chmod 600 /data/swapfile');
        await this.exec('mkswap /data/swapfile');
        if (this.state.swapPriority !== 0) {
            await this.exec(`swapon /data/swapfile -p ${this.state.swapPriority}`);
        } else {
            await this.exec('swapon /data/swapfile');
        }
        this.showToast(`Swap 已启用 (${this.state.swapSize} MB)`);
        await this.loadSwapStatus();
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
    async applyVmConfig() {
        this.showLoading(true);
        const config = `watermark_scale_factor=${this.state.watermarkScale}\nextra_free_kbytes=${this.state.extraFreeKbytes}\ndirty_ratio=${this.state.dirtyRatio}\ndirty_background_ratio=${this.state.dirtyBgRatio}\nvfs_cache_pressure=${this.state.vfsCachePressure}`;
        await this.exec(`echo '${config}' > ${this.configDir}/vm.conf`);
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
        if (vmStatus) vmStatus.textContent = '已修改';
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
    async applyKernelFeatures() {
        this.showLoading(true);
        const config = `lru_gen=${this.state.lruGenEnabled ? '1' : '0'}\nthp=${this.state.thp}\nksm=${this.state.ksmEnabled ? '1' : '0'}\ncompaction=${this.state.compactionEnabled ? '1' : '0'}`;
        await this.exec(`echo '${config}' > ${this.configDir}/kernel.conf`);
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
    }
    initAutoClean() {
        const sw = this.$('auto-clean-switch');
        const container = document.getElementById('last-clean-container');
        if (sw) {
            sw.addEventListener('change', (e) => {
                this.state.autoCleanEnabled = e.target.checked;
                this.saveAutoCleanConfig();
                if (e.target.checked) {
                    this.startAutoClean();
                    if (container) container.classList.remove('hidden');
                    this.showToast('已开启自动清理');
                } else {
                    this.stopAutoClean();
                    if (container) container.classList.add('hidden');
                    this.showToast('已关闭自动清理');
                }
            });
        }
        if (container) container.classList.add('hidden');
        this.loadAutoCleanConfig();
    }
    async loadAutoCleanConfig() {
        const config = await this.exec(`cat ${this.configDir}/autoclean.conf 2>/dev/null`);
        const container = document.getElementById('last-clean-container');
        if (config) {
            const enabledMatch = config.match(/enabled=(\d)/);
            const lastCleanMatch = config.match(/last_clean=(\d+)/);
            if (enabledMatch) {
                this.state.autoCleanEnabled = enabledMatch[1] === '1';
                const sw = this.$('auto-clean-switch');
                if (sw) sw.checked = this.state.autoCleanEnabled;
                if (this.state.autoCleanEnabled) {
                    this.startAutoClean();
                    if (container) container.classList.remove('hidden');
                }
            }
            if (lastCleanMatch && this.state.autoCleanEnabled) {
                const lastTime = parseInt(lastCleanMatch[1]);
                this.updateLastCleanTime(lastTime);
            }
        }
    }
    async saveAutoCleanConfig() {
        const config = `enabled=${this.state.autoCleanEnabled ? '1' : '0'}\nlast_clean=${Date.now()}`;
        await this.exec(`echo '${config}' > ${this.configDir}/autoclean.conf`);
    }
    startAutoClean() {
        this.stopAutoClean();
        this.autoCleanTimer = setInterval(() => this.doAutoClean(), 3600000);
    }
    stopAutoClean() {
        if (this.autoCleanTimer) {
            clearInterval(this.autoCleanTimer);
            this.autoCleanTimer = null;
        }
    }
    async doAutoClean() {
        await this.exec('sync && echo 3 > /proc/sys/vm/drop_caches');
        const now = Date.now();
        this.updateLastCleanTime(now);
        await this.exec(`sed -i 's/last_clean=.*/last_clean=${now}/' ${this.configDir}/autoclean.conf`);
    }
    updateLastCleanTime(timestamp) {
        const el = this.$('last-clean-time');
        if (el && timestamp) {
            const date = new Date(timestamp);
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            el.textContent = `${month}月${day}日 ${hours}:${minutes}`;
        }
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
        let scriptContent = '#!/system/bin/sh\n';
        for (const id in this.customScripts) {
            const script = this.customScripts[id];
            if (script.enabled) {
                scriptContent += script.code + '\n';
            }
        }
        const base64Script = btoa(unescape(encodeURIComponent(scriptContent)));
        await this.exec(`echo '${base64Script}' | base64 -d > ${this.configDir}/user_scripts.sh`);
        await this.exec(`chmod 755 ${this.configDir}/user_scripts.sh`);
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
        this.customScripts[id] = { name, code, tag, enabled };
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
            this.customScripts[id].enabled = !this.customScripts[id].enabled;
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
    async saveAndApplySystemOpt(name) {
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
        const sw = document.getElementById(switchMap[name]);
        if (!sw) return;
        const enabled = sw.checked ? '1' : '0';
        await this.exec(`echo "enabled=${enabled}" > ${this.configDir}/${fileMap[name]}`);
        if (sw.checked) {
            this.showLoading(true);
            await this.applySystemOptNow(name);
            this.showLoading(false);
        }
        this.loadSystemOptConfig();
        this.showToast(sw.checked ? '已启用并应用' : '已禁用');
    }
    async applySystemOptNow(name) {
        const memInfo = await this.exec('cat /proc/meminfo | grep MemTotal');
        const memKb = parseInt(memInfo.replace(/[^0-9]/g, '')) || 8000000;
        const sdkVersion = parseInt(await this.exec('getprop ro.build.version.sdk')) || 30;
        const isXiaomi = (await this.exec('getprop ro.miui.ui.version.name')).trim() !== '';
        const isOplus = (await this.exec('find /proc -maxdepth 1 -name "oplus*" 2>/dev/null | head -1')).trim() !== '';
        if (name === 'lmk') {
            if (isXiaomi) {
                await this.exec('resetprop persist.sys.minfree_6g "16384,20480,32768,131072,262144,384000"');
                await this.exec('resetprop persist.sys.minfree_8g "16384,20480,32768,131072,384000,524288"');
                await this.exec('resetprop persist.sys.minfree_12g "16384,20480,131072,384000,524288,819200"');
            }
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
            await this.exec('echo 0 > /sys/kernel/mi_reclaim/enable 2>/dev/null');
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
                const apps = ['com.android.systemui', 'com.miui.home', 'com.android.launcher', 'surfaceflinger', 'system_server'];
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
        let headerShown = false;
        let lastScrollY = 0;
        const handleScroll = () => {
            const scrollY = window.scrollY;
            const activePage = document.querySelector('.page.active');
            let currentTitle = coronaTitle;
            if (activePage && activePage.id === 'page-settings') {
                currentTitle = coronaTitleSettings;
            }
            if (!currentTitle) return;
            const titleRect = currentTitle.getBoundingClientRect();
            const titleBottom = titleRect.bottom;
            const triggerPoint = 20;
            const fadeStart = 60;
            const fadeEnd = triggerPoint + 5;
            if (titleBottom > fadeStart) {
                currentTitle.style.opacity = '1';
            } else if (titleBottom > fadeEnd) {
                const progress = (titleBottom - fadeEnd) / (fadeStart - fadeEnd);
                currentTitle.style.opacity = String(progress);
            } else {
                currentTitle.style.opacity = '0';
            }
            if (titleBottom <= triggerPoint && !headerShown) {
                headerShown = true;
                floatingHeader.classList.add('visible');
            } else if (titleBottom > triggerPoint && headerShown) {
                headerShown = false;
                floatingHeader.classList.remove('visible');
            }
            lastScrollY = scrollY;
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
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
            'le9uo': {
                title: 'LE9UO 内存保护',
                content: `LE9UO (le9 Unofficial) 是一个内核补丁，用于保护工作集内存不被过度回收。

通过设置匿名页和文件页的保护阈值，可以防止系统在内存压力下过度回收正在使用的内存，从而避免频繁的页面换入换出导致的系统卡顿和假死。

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
}
document.addEventListener('DOMContentLoaded', () => { window.corona = new CoronaAddon(); });
