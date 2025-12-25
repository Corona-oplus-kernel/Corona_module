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
            ioScheduler: null,
            readahead: 512,
            tcp: null,
            cpuGovernor: null,
            zramEnabled: false,
            le9ecEnabled: false,
            le9ecAnon: 0,
            le9ecCleanLow: 0,
            le9ecCleanMin: 0,
            dualCell: false,
            freqLockEnabled: false,
            perCoreFreqEnabled: false,
            theme: 'auto'
        };
        this.cpuCores = [];
        this.cpuClusterInfo = { little: 0, mid: 0, big: 0, prime: 0 };
        this.cpuStats = {};
        this.memCleanRunning = false;
        this.easterEgg = { clickCount: 0, clickTimer: null, authorClickCount: 0, authorClickTimer: null, xinranClickCount: 0, xinranClickTimer: null, currentCard: 'thanks', isOverlayOpen: false };
        this.deviceImageState = { rotation: 0, scale: 1, isRotating: false, isDragging: false, currentScale: 1, rotateCount: 0, isInfiniteRotating: false };
        this.cpuMaxFreqs = [];
        this.cpuFreqsPerCore = {};
        this.historyData = { cpu: [], mem: [], cpuTemp: [], batteryTemp: [] };
        this.chartType = 'cpu';
        this.maxHistoryPoints = 60;
        this.le9ecSupported = false;
        this.init();
    }
    async init() {
        await this.ensureConfigDir();
        this.initTheme();
        this.bindAllEvents();
        this.renderStaticOptions();
        await this.loadDeviceInfo();
        this.startRealtimeMonitor();
        await this.loadAllConfigs();
        await this.loadDualCellConfig();
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
        document.body.classList.remove('theme-light', 'theme-dark');
        if (theme === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.body.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
        } else { document.body.classList.add(`theme-${theme}`); }
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
        if (data.length < 2) { ctx.fillStyle = 'var(--text-sub)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('收集数据中...', width / 2, height / 2); return; }
        const padding = { top: 10, right: 10, bottom: 25, left: 35 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) { const y = padding.top + (chartHeight / 4) * i; ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke(); }
        ctx.fillStyle = 'var(--text-sub)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
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
        ctx.fillStyle = 'var(--text-main)'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(`${label}: ${lastVal.toFixed(1)}${unit}`, padding.left, height - 5);
    }
    drawMultiLineChart(ctx, width, height, series, maxVal, unit) {
        const padding = { top: 10, right: 10, bottom: 25, left: 35 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) { const y = padding.top + (chartHeight / 4) * i; ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke(); }
        ctx.fillStyle = 'var(--text-sub)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
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
                ctx.fillStyle = 'var(--text-main)'; ctx.textAlign = 'left';
                ctx.fillText(`${s.label}: ${lastVal.toFixed(1)}${unit}`, legendX + 12, height - 5);
                legendX += ctx.measureText(`${s.label}: ${lastVal.toFixed(1)}${unit}`).width + 25;
            }
        });
    }
    initExpandableCards() {
        const cards = [
            { toggle: 'zram-toggle', content: 'zram-content', onExpand: () => this.loadZramStatus(), defaultExpanded: true },
            { toggle: 'le9ec-toggle', content: 'le9ec-content', onExpand: () => this.loadLe9ecStatus(), defaultExpanded: true },
            { toggle: 'io-scheduler-toggle', content: 'io-scheduler-content', onExpand: null, defaultExpanded: true },
            { toggle: 'cpu-governor-toggle', content: 'cpu-governor-content', onExpand: null, defaultExpanded: true },
            { toggle: 'process-priority-toggle', content: 'process-priority-content', onExpand: null, defaultExpanded: true },
            { toggle: 'tcp-toggle', content: 'tcp-content', onExpand: null, defaultExpanded: true },
            { toggle: 'app-settings-toggle', content: 'app-settings-content', onExpand: null, defaultExpanded: false }
        ];
        cards.forEach(card => {
            const toggle = document.getElementById(card.toggle);
            const content = document.getElementById(card.content);
            if (toggle && content) {
                const icon = toggle.querySelector('.expand-icon');
                content.classList.remove('hidden');
                if (card.defaultExpanded) {
                    content.classList.add('expanded');
                    if (icon) icon.classList.add('expanded');
                    if (card.onExpand) card.onExpand();
                } else {
                    content.classList.remove('expanded');
                    if (icon) icon.classList.remove('expanded');
                }
                toggle.addEventListener('click', () => {
                    const isExpanded = content.classList.contains('expanded');
                    if (isExpanded) {
                        content.classList.remove('expanded');
                        if (icon) icon.classList.remove('expanded');
                    } else {
                        content.classList.add('expanded');
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
        document.getElementById('apply-global-freq-btn').addEventListener('click', () => this.applyGlobalFreq());
        document.getElementById('apply-per-core-freq-btn').addEventListener('click', () => this.applyPerCoreFreq());
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
        document.getElementById('reset-all-btn').addEventListener('click', async () => await this.resetAllSettings());
    }
    showOverlay(id) {
        const overlay = document.getElementById(id);
        if (overlay) {
            overlay.classList.remove('hidden');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => overlay.classList.add('show'));
            });
        }
    }
    hideOverlay(id) {
        const overlay = document.getElementById(id);
        if (overlay) {
            overlay.classList.remove('show');
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
    async resetAllSettings() { const confirmed = await this.showConfirm('确定要重置所有设置吗？\n\n此操作将删除所有配置文件并立刻重启，且不可撤销！', '重置所有设置'); if (!confirmed) return; this.showLoading(true); await this.exec(`rm -rf ${this.configDir}`); await this.exec(`sed -i 's/^description=.*/description=等待首次设置……/' '${this.modDir}/module.prop' 2>/dev/null`); this.showToast('配置已清除，正在重启...'); await this.sleep(500); await this.exec('reboot'); }
    initDeviceImageInteraction() {
        const container = document.getElementById('device-image-container');
        const img = document.getElementById('device-image');
        if (!container || !img) return;
        let touchStartTime = 0, isLongPress = false, longPressTimer = null, startY = 0, currentScale = 1;
        this.deviceImageState.stopClickCount = 0; this.deviceImageState.isFlying = false; this.deviceImageState.flyAnimationId = null;
        container.addEventListener('click', (e) => {
            if (isLongPress || this.deviceImageState.isDragging) { e.preventDefault(); return; }
            if (this.deviceImageState.isFlying) return;
            if (this.deviceImageState.isInfiniteRotating) { this.deviceImageState.stopClickCount++; if (this.deviceImageState.stopClickCount >= 3) { this.deviceImageState.isInfiniteRotating = false; this.deviceImageState.rotateCount = 0; this.deviceImageState.stopClickCount = 0; img.classList.remove('infinite-rotate'); img.style.animation = ''; this.startFlyingAnimation(container, img); } return; }
            if (this.deviceImageState.isRotating) return;
            this.deviceImageState.rotateCount++;
            if (this.deviceImageState.rotateCount >= 5) { this.deviceImageState.isInfiniteRotating = true; this.deviceImageState.isRotating = true; this.deviceImageState.stopClickCount = 0; img.style.transition = 'none'; img.classList.add('infinite-rotate'); return; }
            this.deviceImageState.isRotating = true; this.deviceImageState.rotation += 360;
            img.style.transition = 'transform 0.6s ease-in-out'; img.style.transform = `rotate(${this.deviceImageState.rotation}deg) scale(${currentScale})`;
            setTimeout(() => { this.deviceImageState.isRotating = false; }, 600);
            if (this.deviceImageState.rotateResetTimer) clearTimeout(this.deviceImageState.rotateResetTimer);
            this.deviceImageState.rotateResetTimer = setTimeout(() => { if (!this.deviceImageState.isInfiniteRotating) this.deviceImageState.rotateCount = 0; }, 2000);
        });
        container.addEventListener('touchstart', (e) => { if (this.deviceImageState.isFlying) return; touchStartTime = Date.now(); startY = e.touches[0].clientY; isLongPress = false; longPressTimer = setTimeout(() => { isLongPress = true; this.deviceImageState.isDragging = true; container.style.zIndex = '100'; }, 300); }, { passive: true });
        container.addEventListener('touchmove', (e) => { if (this.deviceImageState.isFlying) return; if (!isLongPress) { clearTimeout(longPressTimer); return; } e.preventDefault(); const currentY = e.touches[0].clientY; const deltaY = startY - currentY; currentScale = Math.max(0.5, Math.min(3, 1 + deltaY / 100)); this.deviceImageState.currentScale = currentScale; img.style.transition = 'none'; img.style.transform = `rotate(${this.deviceImageState.rotation}deg) scale(${currentScale})`; }, { passive: false });
        container.addEventListener('touchend', () => { if (this.deviceImageState.isFlying) return; clearTimeout(longPressTimer); if (isLongPress) { img.style.transition = 'transform 0.3s ease-out'; container.style.zIndex = ''; } setTimeout(() => { this.deviceImageState.isDragging = false; isLongPress = false; }, 100); });
    }
    startFlyingAnimation(container, img) {
        this.deviceImageState.isFlying = true;
        const rect = container.getBoundingClientRect();
        this.deviceImageState.originalPosition = { left: rect.left, top: rect.top };
        this.deviceImageState.flyingContainer = container; this.deviceImageState.flyingImg = img;
        document.body.appendChild(container);
        container.style.position = 'fixed'; container.style.left = rect.left + 'px'; container.style.top = rect.top + 'px';
        container.style.width = '80px'; container.style.height = '80px'; container.style.zIndex = '9999';
        container.style.margin = '0'; container.style.pointerEvents = 'auto'; container.style.cursor = 'pointer';
        img.style.width = '80px'; img.style.height = '80px';
        let x = rect.left, y = rect.top;
        let vx = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 2);
        let vy = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 2);
        let rotation = 0, rotationSpeed = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 6);
        const containerWidth = 80, containerHeight = 80, screenWidth = window.innerWidth, screenHeight = window.innerHeight;
        this.deviceImageState.flyData = { x, y, vx, vy, rotation, rotationSpeed };
        const animate = () => {
            if (!this.deviceImageState.isFlying) return;
            const data = this.deviceImageState.flyData;
            data.x += data.vx; data.y += data.vy; data.rotation += data.rotationSpeed;
            if (data.x <= 0) { data.x = 0; data.vx = Math.abs(data.vx) * (0.9 + Math.random() * 0.2); data.rotationSpeed = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 6); }
            else if (data.x + containerWidth >= screenWidth) { data.x = screenWidth - containerWidth; data.vx = -Math.abs(data.vx) * (0.9 + Math.random() * 0.2); data.rotationSpeed = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 6); }
            if (data.y <= 0) { data.y = 0; data.vy = Math.abs(data.vy) * (0.9 + Math.random() * 0.2); data.rotationSpeed = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 6); }
            else if (data.y + containerHeight >= screenHeight) { data.y = screenHeight - containerHeight; data.vy = -Math.abs(data.vy) * (0.9 + Math.random() * 0.2); data.rotationSpeed = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 6); }
            container.style.left = data.x + 'px'; container.style.top = data.y + 'px';
            img.style.transition = 'none'; img.style.transform = `rotate(${data.rotation}deg)`;
            this.deviceImageState.flyAnimationId = requestAnimationFrame(animate);
        };
        container.onclick = (e) => { e.stopPropagation(); this.stopFlyingAnimation(); };
        this.deviceImageState.flyAnimationId = requestAnimationFrame(animate);
    }
    stopFlyingAnimation() {
        if (!this.deviceImageState.isFlying) return;
        this.deviceImageState.isFlying = false;
        if (this.deviceImageState.flyAnimationId) cancelAnimationFrame(this.deviceImageState.flyAnimationId);
        const container = this.deviceImageState.flyingContainer;
        const img = this.deviceImageState.flyingImg;
        const deviceCard = document.querySelector('.card-device');
        const finishReturn = () => {
            container.style.position = ''; container.style.left = ''; container.style.top = '';
            container.style.width = ''; container.style.height = ''; container.style.zIndex = '';
            container.style.margin = ''; container.style.transition = ''; container.style.pointerEvents = '';
            container.style.cursor = ''; img.style.width = ''; img.style.height = '';
            img.style.transition = ''; img.style.transform = ''; container.onclick = null;
            if (deviceCard) deviceCard.appendChild(container);
            this.deviceImageState.rotation = 0; this.deviceImageState.rotateCount = 0; this.deviceImageState.isRotating = false;
        };
        const animateToTarget = () => {
            const homePage = document.getElementById('page-home');
            if (homePage) homePage.scrollTop = 0;
            setTimeout(() => {
                const targetRect = deviceCard.getBoundingClientRect();
                const targetLeft = targetRect.left + (targetRect.width - 80) / 2;
                const targetTop = targetRect.top + 40;
                container.style.transition = 'left 0.5s ease-out, top 0.5s ease-out';
                img.style.transition = 'transform 0.5s ease-out';
                container.style.left = targetLeft + 'px'; container.style.top = targetTop + 'px';
                img.style.transform = 'rotate(0deg)';
                setTimeout(finishReturn, 500);
            }, 50);
        };
        if (deviceCard) {
            const homePage = document.getElementById('page-home');
            const isHomeVisible = homePage && homePage.classList.contains('active');
            if (isHomeVisible) animateToTarget(); else { this.switchPage('home'); setTimeout(animateToTarget, 150); }
        } else finishReturn();
    }
    bindAllEvents() {
        document.querySelectorAll('.tab-item').forEach(tab => { tab.addEventListener('click', (e) => this.switchPage(e.currentTarget.dataset.page)); });
        document.getElementById('zram-switch').addEventListener('change', (e) => { this.state.zramEnabled = e.target.checked; this.toggleZramSettings(e.target.checked); this.saveZramConfig(); });
        document.getElementById('zram-size-slider').addEventListener('input', (e) => { this.state.zramSize = parseFloat(e.target.value); document.getElementById('zram-size-value').textContent = `${this.state.zramSize.toFixed(2)} GB`; });
        document.getElementById('zram-size-slider').addEventListener('change', (e) => { this.state.zramSize = parseFloat(e.target.value); if (this.state.zramEnabled) this.applyZramImmediate(); else this.saveZramConfig(); });
        document.getElementById('swappiness-slider').addEventListener('input', (e) => { this.state.swappiness = parseInt(e.target.value); document.getElementById('swappiness-value').textContent = this.state.swappiness; });
        document.getElementById('swappiness-slider').addEventListener('change', (e) => { this.state.swappiness = parseInt(e.target.value); if (this.state.zramEnabled) this.applySwappinessImmediate(); else this.saveZramConfig(); });
        document.getElementById('le9ec-switch').addEventListener('change', (e) => { this.state.le9ecEnabled = e.target.checked; this.toggleLe9ecSettings(e.target.checked); this.saveLe9ecConfig(); });
        document.getElementById('le9ec-anon-slider').addEventListener('input', (e) => { this.state.le9ecAnon = parseInt(e.target.value); document.getElementById('le9ec-anon-value').textContent = `${(this.state.le9ecAnon / 1024).toFixed(0)} MB`; });
        document.getElementById('le9ec-anon-slider').addEventListener('change', (e) => { this.state.le9ecAnon = parseInt(e.target.value); if (this.state.le9ecEnabled) this.applyLe9ecImmediate(); else this.saveLe9ecConfig(); });
        document.getElementById('le9ec-clean-low-slider').addEventListener('input', (e) => { this.state.le9ecCleanLow = parseInt(e.target.value); document.getElementById('le9ec-clean-low-value').textContent = `${(this.state.le9ecCleanLow / 1024).toFixed(0)} MB`; });
        document.getElementById('le9ec-clean-low-slider').addEventListener('change', (e) => { this.state.le9ecCleanLow = parseInt(e.target.value); if (this.state.le9ecEnabled) this.applyLe9ecImmediate(); else this.saveLe9ecConfig(); });
        document.getElementById('le9ec-clean-min-slider').addEventListener('input', (e) => { this.state.le9ecCleanMin = parseInt(e.target.value); document.getElementById('le9ec-clean-min-value').textContent = `${(this.state.le9ecCleanMin / 1024).toFixed(0)} MB`; });
        document.getElementById('le9ec-clean-min-slider').addEventListener('change', (e) => { this.state.le9ecCleanMin = parseInt(e.target.value); if (this.state.le9ecEnabled) this.applyLe9ecImmediate(); else this.saveLe9ecConfig(); });
    }
    toggleLe9ecSettings(show) { const settings = document.getElementById('le9ec-settings'); if (show) { settings.classList.remove('hidden'); this.loadLe9ecStatus(); } else { settings.classList.add('hidden'); } }
    async loadLe9ecConfig() {
        const exists = await this.exec('cat /proc/sys/vm/anon_min_kbytes 2>/dev/null');
        this.le9ecSupported = !!exists;
        if (!exists) { document.getElementById('le9ec-card').style.display = 'none'; return; }
        const config = await this.exec(`cat ${this.configDir}/le9ec.conf 2>/dev/null`);
        if (config) {
            const enabledMatch = config.match(/enabled=(\d)/);
            const anonMatch = config.match(/anon_min=(\d+)/);
            const cleanLowMatch = config.match(/clean_low=(\d+)/);
            const cleanMinMatch = config.match(/clean_min=(\d+)/);
            if (enabledMatch) { this.state.le9ecEnabled = enabledMatch[1] === '1'; document.getElementById('le9ec-switch').checked = this.state.le9ecEnabled; this.toggleLe9ecSettings(this.state.le9ecEnabled); }
            if (anonMatch) { this.state.le9ecAnon = parseInt(anonMatch[1]); document.getElementById('le9ec-anon-slider').value = this.state.le9ecAnon; document.getElementById('le9ec-anon-value').textContent = `${(this.state.le9ecAnon / 1024).toFixed(0)} MB`; }
            if (cleanLowMatch) { this.state.le9ecCleanLow = parseInt(cleanLowMatch[1]); document.getElementById('le9ec-clean-low-slider').value = this.state.le9ecCleanLow; document.getElementById('le9ec-clean-low-value').textContent = `${(this.state.le9ecCleanLow / 1024).toFixed(0)} MB`; }
            if (cleanMinMatch) { this.state.le9ecCleanMin = parseInt(cleanMinMatch[1]); document.getElementById('le9ec-clean-min-slider').value = this.state.le9ecCleanMin; document.getElementById('le9ec-clean-min-value').textContent = `${(this.state.le9ecCleanMin / 1024).toFixed(0)} MB`; }
        }
        await this.loadLe9ecStatus();
    }
    async loadLe9ecStatus() {
        const [anon, cleanLow, cleanMin] = await Promise.all([
            this.exec('cat /proc/sys/vm/anon_min_kbytes 2>/dev/null'),
            this.exec('cat /proc/sys/vm/clean_low_kbytes 2>/dev/null'),
            this.exec('cat /proc/sys/vm/clean_min_kbytes 2>/dev/null')
        ]);
        document.getElementById('le9ec-anon-current').textContent = anon ? `${(parseInt(anon) / 1024).toFixed(0)} MB` : '--';
        document.getElementById('le9ec-clean-low-current').textContent = cleanLow ? `${(parseInt(cleanLow) / 1024).toFixed(0)} MB` : '--';
        document.getElementById('le9ec-clean-min-current').textContent = cleanMin ? `${(parseInt(cleanMin) / 1024).toFixed(0)} MB` : '--';
    }
    async saveLe9ecConfig() {
        const config = `enabled=${this.state.le9ecEnabled ? '1' : '0'}\nanon_min=${this.state.le9ecAnon}\nclean_low=${this.state.le9ecCleanLow}\nclean_min=${this.state.le9ecCleanMin}`;
        await this.exec(`echo '${config}' > ${this.configDir}/le9ec.conf`);
        if (this.state.le9ecEnabled) { this.showLoading(true); await this.applyLe9ecImmediate(); this.showLoading(false); }
        else { this.showToast('LE9EC 配置已保存（禁用状态）'); await this.updateModuleDescription(); }
    }
    async applyLe9ecImmediate() {
        await Promise.all([
            this.exec(`echo ${this.state.le9ecAnon} > /proc/sys/vm/anon_min_kbytes`),
            this.exec(`echo ${this.state.le9ecCleanLow} > /proc/sys/vm/clean_low_kbytes`),
            this.exec(`echo ${this.state.le9ecCleanMin} > /proc/sys/vm/clean_min_kbytes`)
        ]);
        const config = `enabled=1\nanon_min=${this.state.le9ecAnon}\nclean_low=${this.state.le9ecCleanLow}\nclean_min=${this.state.le9ecCleanMin}`;
        await this.exec(`echo '${config}' > ${this.configDir}/le9ec.conf`);
        await this.updateModuleDescription();
        this.showToast('LE9EC 配置已应用');
        setTimeout(() => this.loadLe9ecStatus(), 500);
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
        await Promise.all([ this.loadZramConfig(), this.loadLe9ecConfig(), this.loadIOConfig(), this.loadCpuGovernorConfig(), this.loadTCPConfig(), this.loadCpuCores(), this.loadPerformanceModeConfig(), this.loadFreqLockConfig() ]);
        await this.updateModuleDescription();
        this.updateClusterBadge();
    }
    updateClusterBadge() { const badge = document.getElementById('cpu-cluster-badge'); if (badge) { badge.textContent = this.formatClusterInfo() || '--'; } }
    async loadZramConfig() {
        const config = await this.exec(`cat ${this.configDir}/zram.conf 2>/dev/null`);
        if (config) {
            const algMatch = config.match(/algorithm=(\S+)/);
            const sizeMatch = config.match(/size=(\d+)/);
            const swapMatch = config.match(/swappiness=(\d+)/);
            const enabledMatch = config.match(/enabled=(\d)/);
            if (algMatch) { this.state.algorithm = algMatch[1]; this.renderAlgorithmOptions(); }
            if (sizeMatch) { this.state.zramSize = parseInt(sizeMatch[1]) / 1024 / 1024 / 1024; document.getElementById('zram-size-slider').value = this.state.zramSize; document.getElementById('zram-size-value').textContent = `${this.state.zramSize.toFixed(2)} GB`; }
            if (swapMatch) { this.state.swappiness = parseInt(swapMatch[1]); document.getElementById('swappiness-slider').value = this.state.swappiness; document.getElementById('swappiness-value').textContent = this.state.swappiness; }
            if (enabledMatch) { this.state.zramEnabled = enabledMatch[1] === '1'; document.getElementById('zram-switch').checked = this.state.zramEnabled; this.toggleZramSettings(this.state.zramEnabled); }
        }
        await this.loadZramStatus();
    }
    async loadZramStatus() {
        const [algRaw, disksize, swappiness] = await Promise.all([
            this.exec('cat /sys/block/zram0/comp_algorithm 2>/dev/null'),
            this.exec('cat /sys/block/zram0/disksize 2>/dev/null'),
            this.exec('cat /proc/sys/vm/swappiness 2>/dev/null')
        ]);
        const currentAlg = algRaw.match(/\[([^\]]+)\]/)?.[1] || algRaw.split(' ')[0] || '--';
        document.getElementById('zram-current-alg').textContent = currentAlg;
        document.getElementById('zram-current-size').textContent = `${disksize ? (parseInt(disksize) / 1024 / 1024 / 1024).toFixed(2) : '0'} GB`;
        document.getElementById('zram-current-swappiness').textContent = swappiness.trim() || '--';
    }
    async saveZramConfig() {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const config = `enabled=${this.state.zramEnabled ? '1' : '0'}\nalgorithm=${this.state.algorithm}\nsize=${sizeBytes}\nswappiness=${this.state.swappiness}`;
        await this.exec(`echo '${config}' > ${this.configDir}/zram.conf`);
        if (this.state.zramEnabled) { this.showLoading(true); await this.applyZramImmediate(); this.showLoading(false); }
        else { this.showToast('ZRAM 配置已保存（禁用状态）'); await this.updateModuleDescription(); }
    }
    async applyZramImmediate() {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        this.showLoading(true);
        await this.exec('swapoff /dev/block/zram0 2>/dev/null');
        await this.exec('echo 1 > /sys/block/zram0/reset 2>/dev/null');
        await this.exec(`echo "${this.state.algorithm}" > /sys/block/zram0/comp_algorithm`);
        await this.exec(`echo "${sizeBytes}" > /sys/block/zram0/disksize`);
        await this.exec('mkswap /dev/block/zram0');
        await this.exec('swapon /dev/block/zram0 -p 32758 2>/dev/null || swapon /dev/block/zram0');
        await this.exec(`echo "${this.state.swappiness}" > /proc/sys/vm/swappiness`);
        const config = `enabled=1\nalgorithm=${this.state.algorithm}\nsize=${sizeBytes}\nswappiness=${this.state.swappiness}`;
        await this.exec(`echo '${config}' > ${this.configDir}/zram.conf`);
        await this.updateModuleDescription();
        this.showLoading(false);
        this.showToast('ZRAM 配置已应用');
        setTimeout(() => this.loadZramStatus(), 500);
    }
    async applySwappinessImmediate() {
        await this.exec(`echo "${this.state.swappiness}" > /proc/sys/vm/swappiness`);
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const config = `enabled=${this.state.zramEnabled ? '1' : '0'}\nalgorithm=${this.state.algorithm}\nsize=${sizeBytes}\nswappiness=${this.state.swappiness}`;
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
        await this.exec(`for f in /sys/block/*/queue/scheduler; do echo "${this.state.ioScheduler}" > "$f" 2>/dev/null; done`);
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
        content.innerHTML = `<div class="rainbow-text credit-name" id="xinran-credit">致谢爱人❤️然(≧ω≦)/</div><div class="credits-section"><div class="rainbow-text credits-title">模块制作感谢名单</div><div class="rainbow-text credit-name">Cloud_Yun</div><div class="rainbow-text credit-name">穆远星</div></div>`;
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
        document.getElementById('priority-process-close').addEventListener('click', () => this.hideOverlay('priority-process-overlay'));
        document.getElementById('priority-setting-close').addEventListener('click', () => this.hideOverlay('priority-setting-overlay'));
        document.getElementById('priority-cancel-btn').addEventListener('click', () => this.hideOverlay('priority-setting-overlay'));
        document.getElementById('priority-save-btn').addEventListener('click', () => this.savePriorityRule());
        document.getElementById('priority-process-search').addEventListener('input', (e) => { this.filterPriorityProcessList(e.target.value); });
        document.getElementById('priority-process-overlay').addEventListener('click', (e) => { if (e.target.id === 'priority-process-overlay') this.hideOverlay('priority-process-overlay'); });
        document.getElementById('priority-setting-overlay').addEventListener('click', (e) => { if (e.target.id === 'priority-setting-overlay') this.hideOverlay('priority-setting-overlay'); });
        const niceSlider = document.getElementById('nice-slider');
        const niceValue = document.getElementById('nice-slider-value');
        niceSlider.addEventListener('input', () => { this.selectedNice = parseInt(niceSlider.value); niceValue.textContent = this.selectedNice; });
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
    updatePriorityCount() { document.getElementById('priority-count').textContent = `${Object.keys(this.priorityRules).length} 条规则`; }
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
}
document.addEventListener('DOMContentLoaded', () => { window.corona = new CoronaAddon(); });
