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
            dualCell: false
        };
        this.cpuCores = [];
        this.cpuClusterInfo = { little: 0, mid: 0, big: 0, prime: 0 };
        this.cpuStats = {};
        this.memCleanRunning = false;
        this.easterEgg = {
            clickCount: 0,
            clickTimer: null,
            authorClickCount: 0,
            authorClickTimer: null,
            xinranClickCount: 0,
            xinranClickTimer: null,
            currentCard: 'thanks',
            isOverlayOpen: false
        };
        this.deviceImageState = {
            rotation: 0,
            scale: 1,
            isRotating: false,
            isDragging: false,
            currentScale: 1
        };
        this.affinityRules = {};
        this.affinityProcesses = [];
        this.selectedProcess = null;
        this.selectedCpus = [];
        this.cpuMaxFreqs = [];
        this.init();
    }
    
    async init() {
        await this.ensureConfigDir();
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
        this.initAffinityFeature();
    }
    
    async exec(cmd) {
        return new Promise((resolve) => {
            const callbackId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            const timeout = setTimeout(() => {
                delete window[callbackId];
                resolve('');
            }, 8000);
            window[callbackId] = (code, stdout, stderr) => {
                clearTimeout(timeout);
                delete window[callbackId];
                resolve(stdout ? stdout.trim() : '');
            };
            try {
                ksu.exec(cmd, '{}', callbackId);
            } catch (e) {
                clearTimeout(timeout);
                delete window[callbackId];
                resolve('');
            }
        });
    }
    
    async ensureConfigDir() {
        await this.exec(`mkdir -p ${this.configDir}`);
    }
    initHomeCardClicks() {
        document.getElementById('cpu-card').addEventListener('click', () => {
            this.switchPage('settings');
            setTimeout(() => {
                const cpuCard = document.getElementById('cpu-governor-card');
                if (cpuCard) cpuCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        });
        document.getElementById('swap-card').addEventListener('click', () => {
            this.switchPage('settings');
            setTimeout(() => {
                const zramCard = document.getElementById('zram-card');
                if (zramCard) zramCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
        });
        document.getElementById('battery-card').addEventListener('click', () => {
            this.showBatteryDetail();
        });
        document.getElementById('mem-card').addEventListener('click', () => {
            this.showUFSDetail();
        });
        document.getElementById('storage-card').addEventListener('click', () => {
            this.showStorageDetail();
        });
    }
    
    initDetailOverlays() {
        const overlays = ['battery-detail-overlay', 'ufs-detail-overlay', 'storage-detail-overlay'];
        overlays.forEach(id => {
            const overlay = document.getElementById(id);
            const closeBtn = document.getElementById(id.replace('-overlay', '-close'));
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    overlay.classList.add('hidden');
                    overlay.classList.remove('show');
                });
            }
            if (overlay) {
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        overlay.classList.add('hidden');
                        overlay.classList.remove('show');
                    }
                });
            }
        });
        document.getElementById('xinran-overlay').addEventListener('click', (e) => {
            const overlay = document.getElementById('xinran-overlay');
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.classList.add('hidden');
            }, 300);
        });
        document.getElementById('gc-btn').addEventListener('click', async () => {
            await this.runGC();
        });
        document.querySelectorAll('.memclean-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                if (this.memCleanRunning) return;
                const mode = opt.dataset.mode;
                await this.runMemClean(mode);
            });
        });
        document.getElementById('reset-all-btn').addEventListener('click', async () => {
            await this.resetAllSettings();
        });
    }
    
    showOverlay(id) {
        const overlay = document.getElementById(id);
        if (overlay) {
            overlay.classList.remove('hidden');
            requestAnimationFrame(() => {
                overlay.classList.add('show');
            });
        }
    }
    
    hideOverlay(id) {
        const overlay = document.getElementById(id);
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.classList.add('hidden');
            }, 300);
        }
    }
    async showBatteryDetail() {
        this.showOverlay('battery-detail-overlay');
        const content = document.getElementById('battery-detail-content');
        content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-sub)">加载中...</div>';
        const status = await this.exec('cat /sys/class/power_supply/battery/status 2>/dev/null');
        const health = await this.exec('cat /sys/class/power_supply/battery/health 2>/dev/null');
        const voltage = await this.exec('cat /sys/class/power_supply/battery/voltage_now 2>/dev/null');
        const temp = await this.exec('cat /sys/class/power_supply/battery/temp 2>/dev/null');
        let capacity = await this.exec('cat /sys/class/power_supply/battery/capacity 2>/dev/null');
        if (!capacity || capacity === '') {
            const uevent = await this.exec('cat /sys/class/power_supply/battery/uevent 2>/dev/null | grep POWER_SUPPLY_CAPACITY= | cut -d= -f2');
            if (uevent) capacity = uevent;
        }
        const chargeType = await this.exec('cat /sys/class/power_supply/battery/charge_type 2>/dev/null');
        const technology = await this.exec('cat /sys/class/power_supply/battery/technology 2>/dev/null');
        const cycleCount = await this.exec('cat /sys/class/power_supply/battery/cycle_count 2>/dev/null');
        const chargeFull = await this.exec('cat /sys/class/power_supply/battery/charge_full 2>/dev/null');
        const chargeFullDesign = await this.exec('cat /sys/class/power_supply/battery/charge_full_design 2>/dev/null');
        const statusMap = {
            'Charging': '充电中',
            'Discharging': '放电中',
            'Full': '已充满',
            'Not charging': '未充电',
            'Unknown': '未知'
        };
        const healthMap = {
            'Good': '良好',
            'Overheat': '过热',
            'Dead': '损坏',
            'Over voltage': '过压',
            'Unknown': '未知',
            'Cold': '过冷'
        };
        const voltageV = voltage ? (parseInt(voltage) / 1000000).toFixed(3) : '--';
        const tempC = temp ? (parseInt(temp) / 10).toFixed(1) : '--';
        let healthPercent = '--';
        if (chargeFull && chargeFullDesign && parseInt(chargeFullDesign) > 0) {
            healthPercent = ((parseInt(chargeFull) / parseInt(chargeFullDesign)) * 100).toFixed(1);
        }
        content.innerHTML = `
            <div class="info-item"><span class="info-label">充电状态</span><span class="info-value">${statusMap[status] || status || '--'}</span></div>
            <div class="info-item"><span class="info-label">健康状态</span><span class="info-value">${healthMap[health] || health || '--'}</span></div>
            <div class="info-item"><span class="info-label">电池电量</span><span class="info-value">${capacity || '--'}%</span></div>
            <div class="info-item"><span class="info-label">电池电压</span><span class="info-value">${voltageV} V</span></div>
            <div class="info-item"><span class="info-label">温度</span><span class="info-value">${tempC} °C</span></div>
            <div class="info-item"><span class="info-label">充电类型</span><span class="info-value">${chargeType || '--'}</span></div>
            <div class="info-item"><span class="info-label">电池技术</span><span class="info-value">${technology || '--'}</span></div>
            <div class="info-item"><span class="info-label">循环次数</span><span class="info-value">${cycleCount || '--'}</span></div>
            <div class="info-item"><span class="info-label">电池健康度</span><span class="info-value">${healthPercent}%</span></div>
        `;
    }
    
    async loadDualCellConfig() {
        const result = await this.exec(`cat ${this.configDir}/dual_cell.conf 2>/dev/null`);
        if (result) {
            const enabled = result.includes('dualCell=1');
            this.state.dualCell = enabled;
        }
    }
    async showUFSDetail() {
        this.showOverlay('ufs-detail-overlay');
        const content = document.getElementById('ufs-detail-content');
        content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-sub)">加载中...</div>';
        const lifeA = await this.exec('cat /sys/devices/platform/soc/*/health_descriptor/life_time_estimation_a 2>/dev/null || cat /sys/block/sda/device/life_time_estimation_a 2>/dev/null');
        const lifeB = await this.exec('cat /sys/devices/platform/soc/*/health_descriptor/life_time_estimation_b 2>/dev/null || cat /sys/block/sda/device/life_time_estimation_b 2>/dev/null');
        const eol = await this.exec('cat /sys/devices/platform/soc/*/health_descriptor/eol_info 2>/dev/null || cat /sys/block/sda/device/eol_info 2>/dev/null');
        const lifeRanges = {
            '0x00': '未定义',
            '0x01': '0% ~ 10%',
            '0x02': '10% ~ 20%',
            '0x03': '20% ~ 30%',
            '0x04': '30% ~ 40%',
            '0x05': '40% ~ 50%',
            '0x06': '50% ~ 60%',
            '0x07': '60% ~ 70%',
            '0x08': '70% ~ 80%',
            '0x09': '80% ~ 90%',
            '0x0A': '90% ~ 100%',
            '0x0B': '超过使用寿命'
        };
        const eolMap = {
            '0x00': '未定义',
            '0x01': '正常',
            '0x02': '警告 (消耗80%)',
            '0x03': '紧急 (消耗90%)'
        };
        const getLifeDisplay = (val) => {
            if (!val) return '--';
            const hex = '0x' + parseInt(val).toString(16).toUpperCase().padStart(2, '0');
            return lifeRanges[hex] || val;
        };
        const getEolDisplay = (val) => {
            if (!val) return '--';
            const hex = '0x' + parseInt(val).toString(16).toUpperCase().padStart(2, '0');
            return eolMap[hex] || val;
        };
        content.innerHTML = `
            <div class="info-item"><span class="info-label">寿命估计 A (SLC)</span><span class="info-value">${getLifeDisplay(lifeA)}</span></div>
            <div class="info-item"><span class="info-label">寿命估计 B (MLC)</span><span class="info-value">${getLifeDisplay(lifeB)}</span></div>
            <div class="info-item"><span class="info-label">寿命终止状态 (EOL)</span><span class="info-value">${getEolDisplay(eol)}</span></div>
            <div class="ufs-note"><p>SLC: 高速缓存区域</p><p>MLC: 主存储区域</p><p>数值越低表示磨损越少</p></div>
        `;
    }
    
    async showStorageDetail() {
        this.showOverlay('storage-detail-overlay');
        const resultDiv = document.getElementById('memclean-result');
        if (resultDiv) resultDiv.classList.add('hidden');
    }
    
    async runGC() {
        this.showLoading(true);
        await this.exec('sync');
        await this.exec('echo 1 > /sys/fs/f2fs/*/gc_urgent');
        await this.sleep(2000);
        await this.exec('echo 0 > /sys/fs/f2fs/*/gc_urgent');
        this.showLoading(false);
        this.showToast('GC 执行完成');
    }
    async runMemClean(mode) {
        if (this.memCleanRunning) return;
        this.memCleanRunning = true;
        const section = document.getElementById('memclean-section');
        const progress = document.getElementById('memclean-progress');
        const fill = document.getElementById('memclean-fill');
        const percent = document.getElementById('memclean-percent');
        const status = document.getElementById('memclean-status');
        const resultDiv = document.getElementById('memclean-result');
        const resultContent = document.getElementById('memclean-result-content');
        section.classList.add('memclean-running');
        progress.classList.remove('hidden');
        resultDiv.classList.add('hidden');
        fill.style.width = '0%';
        percent.textContent = '0%';
        status.textContent = '正在获取内存信息...';
        const modeNames = {
            'drop-caches': '清理缓存',
            'drop-all': '深度清理',
            'compact': '内存整理',
            'kill-bg': '清理后台',
            'full-clean': '完全清理'
        };
        const modeName = modeNames[mode];
        this.sendNotification('Corona 内存清理', `开始 ${modeName}...`);
        const memBefore = await this.getMemoryInfo();
        fill.style.width = '10%';
        percent.textContent = '10%';
        status.textContent = '正在执行清理...';
        await this.sleep(300);
        if (mode === 'drop-caches' || mode === 'drop-all' || mode === 'full-clean') {
            fill.style.width = '20%';
            percent.textContent = '20%';
            status.textContent = '同步文件系统...';
            await this.exec('sync');
            await this.sleep(200);
            fill.style.width = '30%';
            percent.textContent = '30%';
            status.textContent = '释放页面缓存...';
            await this.exec('echo 1 > /proc/sys/vm/drop_caches');
            await this.sleep(300);
        }
        if (mode === 'drop-all' || mode === 'full-clean') {
            fill.style.width = '40%';
            percent.textContent = '40%';
            status.textContent = '释放目录项缓存...';
            await this.exec('echo 2 > /proc/sys/vm/drop_caches');
            await this.sleep(300);
            fill.style.width = '50%';
            percent.textContent = '50%';
            status.textContent = '释放inode缓存...';
            await this.exec('echo 3 > /proc/sys/vm/drop_caches');
            await this.sleep(300);
        }
        if (mode === 'compact' || mode === 'full-clean') {
            fill.style.width = '60%';
            percent.textContent = '60%';
            status.textContent = '整理内存碎片...';
            await this.exec('echo 1 > /proc/sys/vm/compact_memory 2>/dev/null');
            await this.sleep(500);
        }
        if (mode === 'kill-bg' || mode === 'full-clean') {
            fill.style.width = '70%';
            percent.textContent = '70%';
            status.textContent = '清理后台应用...';
            await this.exec('am kill-all 2>/dev/null');
            await this.sleep(300);
            fill.style.width = '80%';
            percent.textContent = '80%';
            status.textContent = '释放后台进程...';
            await this.exec('for pkg in $(pm list packages -3 | cut -d: -f2); do am force-stop $pkg 2>/dev/null; done &');
            await this.sleep(500);
        }
        fill.style.width = '90%';
        percent.textContent = '90%';
        status.textContent = '完成清理...';
        await this.sleep(500);
        const memAfter = await this.getMemoryInfo();
        fill.style.width = '100%';
        percent.textContent = '100%';
        status.textContent = '清理完成!';
        const freedMB = Math.max(0, memAfter.available - memBefore.available);
        const freedStr = this.formatBytes(freedMB * 1024);
        resultContent.innerHTML = `
            <div class="result-item"><span>清理前可用</span><span>${this.formatBytes(memBefore.available * 1024)}</span></div>
            <div class="result-item"><span>清理后可用</span><span>${this.formatBytes(memAfter.available * 1024)}</span></div>
            <div class="result-item result-highlight"><span>已释放内存</span><span>${freedStr}</span></div>
        `;
        resultDiv.classList.remove('hidden');
        this.sendNotification('Corona 内存清理', `${modeName}完成，释放了 ${freedStr}`);
        await this.sleep(1000);
        progress.classList.add('hidden');
        section.classList.remove('memclean-running');
        this.memCleanRunning = false;
        this.showToast(`${modeName} 完成`);
    }
    
    async getMemoryInfo() {
        const meminfo = await this.exec('cat /proc/meminfo');
        let total = 0, available = 0, free = 0, buffers = 0, cached = 0;
        for (const line of meminfo.split('\n')) {
            const match = line.match(/^(\w+):\s+(\d+)/);
            if (!match) continue;
            const [, key, value] = match;
            const kb = parseInt(value);
            if (key === 'MemTotal') total = kb;
            else if (key === 'MemAvailable') available = kb;
            else if (key === 'MemFree') free = kb;
            else if (key === 'Buffers') buffers = kb;
            else if (key === 'Cached') cached = kb;
        }
        if (!available) available = free + buffers + cached;
        return { total, available, free, buffers, cached };
    }
    
    sendNotification(title, message) {
        this.exec(`su -c 'cmd notification post -S bigtext -t "${title}" corona_memclean "${message}"'`);
    }
    async resetAllSettings() {
        if (!confirm('确定要重置所有设置吗？\n\n此操作将删除所有配置文件，恢复到默认状态，且不可撤销！')) {
            return;
        }
        this.showLoading(true);
        await this.exec(`rm -rf ${this.configDir}/*`);
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
            dualCell: false
        };
        document.getElementById('zram-switch').checked = false;
        document.getElementById('le9ec-switch').checked = false;
        this.toggleZramSettings(false);
        this.toggleLe9ecSettings(false);
        document.getElementById('zram-size-slider').value = 8;
        document.getElementById('zram-size-value').textContent = '8.00 GB';
        document.getElementById('swappiness-slider').value = 100;
        document.getElementById('swappiness-value').textContent = '100';
        document.getElementById('le9ec-anon-slider').value = 0;
        document.getElementById('le9ec-anon-value').textContent = '0 MB';
        document.getElementById('le9ec-clean-low-slider').value = 0;
        document.getElementById('le9ec-clean-low-value').textContent = '0 MB';
        document.getElementById('le9ec-clean-min-slider').value = 0;
        document.getElementById('le9ec-clean-min-value').textContent = '0 MB';
        document.querySelectorAll('.option-item.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.algorithm-item.selected').forEach(el => el.classList.remove('selected'));
        this.showLoading(false);
        this.showToast('所有设置已重置');
        this.sendNotification('Corona', '所有设置已重置为默认值');
    }
    initDeviceImageInteraction() {
        const container = document.getElementById('device-image-container');
        const img = document.getElementById('device-image');
        if (!container || !img) return;
        let touchStartTime = 0;
        let isLongPress = false;
        let longPressTimer = null;
        let startY = 0;
        let currentScale = 1;
        container.addEventListener('click', (e) => {
            if (isLongPress || this.deviceImageState.isDragging) {
                e.preventDefault();
                return;
            }
            if (this.deviceImageState.isRotating) return;
            this.deviceImageState.isRotating = true;
            this.deviceImageState.rotation += 360;
            img.style.transition = 'transform 0.6s ease-in-out';
            img.style.transform = `rotate(${this.deviceImageState.rotation}deg) scale(${currentScale})`;
            setTimeout(() => {
                this.deviceImageState.isRotating = false;
            }, 600);
        });
        container.addEventListener('touchstart', (e) => {
            touchStartTime = Date.now();
            startY = e.touches[0].clientY;
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                this.deviceImageState.isDragging = true;
                container.style.zIndex = '100';
            }, 300);
        }, { passive: true });
        container.addEventListener('touchmove', (e) => {
            if (!isLongPress) {
                clearTimeout(longPressTimer);
                return;
            }
            e.preventDefault();
            const currentY = e.touches[0].clientY;
            const deltaY = startY - currentY;
            currentScale = Math.max(0.5, Math.min(3, 1 + deltaY / 100));
            this.deviceImageState.currentScale = currentScale;
            img.style.transition = 'none';
            img.style.transform = `rotate(${this.deviceImageState.rotation}deg) scale(${currentScale})`;
        }, { passive: false });
        container.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
            if (isLongPress) {
                img.style.transition = 'transform 0.3s ease-out';
                container.style.zIndex = '';
            }
            setTimeout(() => {
                this.deviceImageState.isDragging = false;
                isLongPress = false;
            }, 100);
        });
    }
    bindAllEvents() {
        document.querySelectorAll('.tab-item').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchPage(e.currentTarget.dataset.page));
        });
        document.getElementById('zram-switch').addEventListener('change', (e) => {
            this.state.zramEnabled = e.target.checked;
            this.toggleZramSettings(e.target.checked);
            this.saveZramConfig();
        });
        document.getElementById('zram-size-slider').addEventListener('input', (e) => {
            this.state.zramSize = parseFloat(e.target.value);
            document.getElementById('zram-size-value').textContent = `${this.state.zramSize.toFixed(2)} GB`;
        });
        document.getElementById('zram-size-slider').addEventListener('change', (e) => {
            this.state.zramSize = parseFloat(e.target.value);
            if (this.state.zramEnabled) this.applyZramImmediate();
            else this.saveZramConfig();
        });
        document.getElementById('swappiness-slider').addEventListener('input', (e) => {
            this.state.swappiness = parseInt(e.target.value);
            document.getElementById('swappiness-value').textContent = this.state.swappiness;
        });
        document.getElementById('swappiness-slider').addEventListener('change', (e) => {
            this.state.swappiness = parseInt(e.target.value);
            if (this.state.zramEnabled) this.applySwappinessImmediate();
            else this.saveZramConfig();
        });
        document.getElementById('le9ec-switch').addEventListener('change', (e) => {
            this.state.le9ecEnabled = e.target.checked;
            this.toggleLe9ecSettings(e.target.checked);
            this.saveLe9ecConfig();
        });
        document.getElementById('le9ec-anon-slider').addEventListener('input', (e) => {
            this.state.le9ecAnon = parseInt(e.target.value);
            document.getElementById('le9ec-anon-value').textContent = `${(this.state.le9ecAnon / 1024).toFixed(0)} MB`;
        });
        document.getElementById('le9ec-anon-slider').addEventListener('change', (e) => {
            this.state.le9ecAnon = parseInt(e.target.value);
            if (this.state.le9ecEnabled) this.applyLe9ecImmediate();
            else this.saveLe9ecConfig();
        });
        document.getElementById('le9ec-clean-low-slider').addEventListener('input', (e) => {
            this.state.le9ecCleanLow = parseInt(e.target.value);
            document.getElementById('le9ec-clean-low-value').textContent = `${(this.state.le9ecCleanLow / 1024).toFixed(0)} MB`;
        });
        document.getElementById('le9ec-clean-low-slider').addEventListener('change', (e) => {
            this.state.le9ecCleanLow = parseInt(e.target.value);
            if (this.state.le9ecEnabled) this.applyLe9ecImmediate();
            else this.saveLe9ecConfig();
        });
        document.getElementById('le9ec-clean-min-slider').addEventListener('input', (e) => {
            this.state.le9ecCleanMin = parseInt(e.target.value);
            document.getElementById('le9ec-clean-min-value').textContent = `${(this.state.le9ecCleanMin / 1024).toFixed(0)} MB`;
        });
        document.getElementById('le9ec-clean-min-slider').addEventListener('change', (e) => {
            this.state.le9ecCleanMin = parseInt(e.target.value);
            if (this.state.le9ecEnabled) this.applyLe9ecImmediate();
            else this.saveLe9ecConfig();
        });
    }
    
    toggleLe9ecSettings(show) {
        const settings = document.getElementById('le9ec-settings');
        if (show) {
            settings.classList.remove('hidden');
            this.loadLe9ecStatus();
        } else {
            settings.classList.add('hidden');
        }
    }
    async loadLe9ecConfig() {
        const exists = await this.exec('cat /proc/sys/vm/anon_min_kbytes 2>/dev/null');
        if (!exists) {
            document.getElementById('le9ec-card').style.display = 'none';
            return;
        }
        const config = await this.exec(`cat ${this.configDir}/le9ec.conf 2>/dev/null`);
        if (config) {
            const enabledMatch = config.match(/enabled=(\d)/);
            const anonMatch = config.match(/anon_min=(\d+)/);
            const cleanLowMatch = config.match(/clean_low=(\d+)/);
            const cleanMinMatch = config.match(/clean_min=(\d+)/);
            if (enabledMatch) {
                this.state.le9ecEnabled = enabledMatch[1] === '1';
                document.getElementById('le9ec-switch').checked = this.state.le9ecEnabled;
                this.toggleLe9ecSettings(this.state.le9ecEnabled);
            }
            if (anonMatch) {
                this.state.le9ecAnon = parseInt(anonMatch[1]);
                document.getElementById('le9ec-anon-slider').value = this.state.le9ecAnon;
                document.getElementById('le9ec-anon-value').textContent = `${(this.state.le9ecAnon / 1024).toFixed(0)} MB`;
            }
            if (cleanLowMatch) {
                this.state.le9ecCleanLow = parseInt(cleanLowMatch[1]);
                document.getElementById('le9ec-clean-low-slider').value = this.state.le9ecCleanLow;
                document.getElementById('le9ec-clean-low-value').textContent = `${(this.state.le9ecCleanLow / 1024).toFixed(0)} MB`;
            }
            if (cleanMinMatch) {
                this.state.le9ecCleanMin = parseInt(cleanMinMatch[1]);
                document.getElementById('le9ec-clean-min-slider').value = this.state.le9ecCleanMin;
                document.getElementById('le9ec-clean-min-value').textContent = `${(this.state.le9ecCleanMin / 1024).toFixed(0)} MB`;
            }
        }
        await this.loadLe9ecStatus();
    }
    
    async loadLe9ecStatus() {
        const anon = await this.exec('cat /proc/sys/vm/anon_min_kbytes 2>/dev/null');
        const cleanLow = await this.exec('cat /proc/sys/vm/clean_low_kbytes 2>/dev/null');
        const cleanMin = await this.exec('cat /proc/sys/vm/clean_min_kbytes 2>/dev/null');
        document.getElementById('le9ec-anon-current').textContent = anon ? `${(parseInt(anon) / 1024).toFixed(0)} MB` : '--';
        document.getElementById('le9ec-clean-low-current').textContent = cleanLow ? `${(parseInt(cleanLow) / 1024).toFixed(0)} MB` : '--';
        document.getElementById('le9ec-clean-min-current').textContent = cleanMin ? `${(parseInt(cleanMin) / 1024).toFixed(0)} MB` : '--';
    }
    
    async saveLe9ecConfig() {
        const config = `enabled=${this.state.le9ecEnabled ? '1' : '0'}\nanon_min=${this.state.le9ecAnon}\nclean_low=${this.state.le9ecCleanLow}\nclean_min=${this.state.le9ecCleanMin}`;
        await this.exec(`echo '${config}' > ${this.configDir}/le9ec.conf`);
        if (this.state.le9ecEnabled) {
            await this.applyLe9ecImmediate();
        } else {
            this.showToast('LE9EC 配置已保存（禁用状态）');
        }
    }
    
    async applyLe9ecImmediate() {
        await this.exec(`echo ${this.state.le9ecAnon} > /proc/sys/vm/anon_min_kbytes`);
        await this.exec(`echo ${this.state.le9ecCleanLow} > /proc/sys/vm/clean_low_kbytes`);
        await this.exec(`echo ${this.state.le9ecCleanMin} > /proc/sys/vm/clean_min_kbytes`);
        const config = `enabled=1\nanon_min=${this.state.le9ecAnon}\nclean_low=${this.state.le9ecCleanLow}\nclean_min=${this.state.le9ecCleanMin}`;
        await this.exec(`echo '${config}' > ${this.configDir}/le9ec.conf`);
        this.showToast('LE9EC 配置已应用');
        setTimeout(() => this.loadLe9ecStatus(), 500);
    }
    switchPage(pageName) {
        const pages = document.querySelectorAll('.page');
        const tabs = document.querySelectorAll('.tab-item');
        const slider = document.getElementById('tab-slider');
        const targetPage = document.getElementById(`page-${pageName}`);
        const currentActive = document.querySelector('.page.active');
        if (currentActive === targetPage) return;
        const isGoingRight = pageName === 'settings';
        pages.forEach(p => {
            p.classList.remove('active', 'left', 'right');
        });
        if (currentActive) {
            currentActive.classList.add(isGoingRight ? 'left' : 'right');
        }
        targetPage.classList.add('active');
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab-item[data-page="${pageName}"]`).classList.add('active');
        if (slider) {
            slider.classList.toggle('right', isGoingRight);
        }
        if (pageName === 'settings') this.loadAllConfigs();
        setTimeout(() => {
            pages.forEach(p => {
                if (!p.classList.contains('active')) {
                    p.classList.remove('left', 'right');
                }
            });
        }, 550);
    }
    
    toggleZramSettings(show) {
        const settings = document.getElementById('zram-settings');
        if (show) {
            settings.classList.remove('hidden');
            this.loadZramStatus();
        } else {
            settings.classList.add('hidden');
        }
    }
    
    renderStaticOptions() {
        this.renderAlgorithmOptions();
        this.renderReadaheadOptions();
    }
    
    renderAlgorithmOptions() {
        const container = document.getElementById('algorithm-list');
        container.innerHTML = this.algorithms.map(alg => 
            `<div class="option-item ${alg === this.state.algorithm ? 'selected' : ''}" data-value="${alg}">${alg}</div>`
        ).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.state.algorithm = e.currentTarget.dataset.value;
                if (this.state.zramEnabled) await this.applyZramImmediate();
                else await this.saveZramConfig();
            });
        });
    }
    
    renderReadaheadOptions() {
        const container = document.getElementById('readahead-list');
        container.innerHTML = this.readaheadOptions.map(val => 
            `<div class="option-item ${val === this.state.readahead ? 'selected' : ''}" data-value="${val}">${val}</div>`
        ).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.state.readahead = parseInt(e.currentTarget.dataset.value);
                await this.applyReadaheadImmediate();
            });
        });
    }
    async loadDeviceInfo() {
        const brand = await this.exec('getprop ro.product.brand');
        const model = await this.exec('getprop ro.product.model');
        const brandEl = document.getElementById('device-brand');
        if (brandEl) brandEl.textContent = brand || '--';
        document.getElementById('device-model').textContent = model || '--';
        const socModel = await this.exec('getprop ro.board.platform');
        const hardware = await this.exec('getprop ro.hardware');
        const chipname = await this.exec('getprop ro.hardware.chipname');
        const cpuName = chipname || socModel || hardware || 'Unknown';
        await this.detectCpuClusters();
        const clusterStr = this.formatClusterInfo();
        document.getElementById('cpu-info').textContent = cpuName;
        document.getElementById('cpu-cluster-info').textContent = clusterStr || '--';
        
        const cpuBrandBadge = document.getElementById('cpu-brand-badge');
        const cpuNameLower = cpuName.toLowerCase();
        const hardwareLower = (hardware || '').toLowerCase();
        const socModelLower = (socModel || '').toLowerCase();
        
        const isSnapdragon = cpuNameLower.includes('sm') || 
                            cpuNameLower.includes('sdm') || 
                            cpuNameLower.includes('msm') ||
                            cpuNameLower.includes('qcom') ||
                            cpuNameLower.includes('snapdragon') ||
                            hardwareLower.includes('qcom') ||
                            socModelLower.includes('sm') ||
                            socModelLower.includes('sdm') ||
                            socModelLower.includes('msm');
        
        const isDimensity = cpuNameLower.includes('mt') || 
                           cpuNameLower.includes('dimensity') ||
                           cpuNameLower.includes('mediatek') ||
                           hardwareLower.includes('mt') ||
                           socModelLower.includes('mt');
        
        if (isSnapdragon) {
            cpuBrandBadge.textContent = 'Snapdragon';
            cpuBrandBadge.className = 'cpu-brand-badge snapdragon';
        } else if (isDimensity) {
            cpuBrandBadge.textContent = 'MediaTek';
            cpuBrandBadge.className = 'cpu-brand-badge mediatek';
        } else {
            cpuBrandBadge.classList.add('hidden');
        }
        
        const androidVer = await this.exec('getprop ro.build.version.release');
        const sdk = await this.exec('getprop ro.build.version.sdk');
        document.getElementById('system-version').textContent = `Android ${androidVer} (API ${sdk})`;
        const kernel = await this.exec('uname -r');
        document.getElementById('kernel-version').textContent = kernel || '--';
        const battDesign = await this.exec('cat /sys/class/power_supply/battery/charge_full_design 2>/dev/null');
        if (battDesign && parseInt(battDesign) > 0) {
            const mah = Math.round(parseInt(battDesign) / 1000);
            document.getElementById('battery-capacity').textContent = `${mah} mAh`;
        }
    }
    
    async detectCpuClusters() {
        this.cpuClusterInfo = { little: 0, mid: 0, big: 0, prime: 0 };
        const cpuCount = parseInt(await this.exec('ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null | wc -l')) || 0;
        const freqs = [];
        for (let i = 0; i < cpuCount; i++) {
            const maxFreq = await this.exec(`cat /sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq 2>/dev/null`);
            if (maxFreq) {
                freqs.push({ cpu: i, freq: parseInt(maxFreq) });
            }
        }
        if (freqs.length === 0) return;
        const uniqueFreqs = [...new Set(freqs.map(f => f.freq))].sort((a, b) => a - b);
        if (uniqueFreqs.length === 1) {
            this.cpuClusterInfo.little = freqs.length;
        } else if (uniqueFreqs.length === 2) {
            freqs.forEach(f => {
                if (f.freq === uniqueFreqs[0]) this.cpuClusterInfo.little++;
                else this.cpuClusterInfo.big++;
            });
        } else if (uniqueFreqs.length === 3) {
            freqs.forEach(f => {
                if (f.freq === uniqueFreqs[0]) this.cpuClusterInfo.little++;
                else if (f.freq === uniqueFreqs[1]) this.cpuClusterInfo.mid++;
                else this.cpuClusterInfo.big++;
            });
        } else if (uniqueFreqs.length >= 4) {
            freqs.forEach(f => {
                if (f.freq === uniqueFreqs[0]) this.cpuClusterInfo.little++;
                else if (f.freq === uniqueFreqs[1]) this.cpuClusterInfo.mid++;
                else if (f.freq === uniqueFreqs[uniqueFreqs.length - 1]) this.cpuClusterInfo.prime++;
                else this.cpuClusterInfo.big++;
            });
        }
    }
    
    formatClusterInfo() {
        const parts = [];
        if (this.cpuClusterInfo.little > 0) parts.push(this.cpuClusterInfo.little);
        if (this.cpuClusterInfo.mid > 0) parts.push(this.cpuClusterInfo.mid);
        if (this.cpuClusterInfo.big > 0) parts.push(this.cpuClusterInfo.big);
        if (this.cpuClusterInfo.prime > 0) parts.push(this.cpuClusterInfo.prime);
        if (parts.length === 0) return '';
        return parts.join('+');
    }
    
    getTotalCoreCount() {
        return this.cpuClusterInfo.little + this.cpuClusterInfo.mid + this.cpuClusterInfo.big + this.cpuClusterInfo.prime;
    }
    startRealtimeMonitor() {
        this.updateRealtimeData();
        setInterval(() => this.updateRealtimeData(), 3000);
    }
    
    async updateRealtimeData() {
        await Promise.all([
            this.updateBatteryInfo(),
            this.updateMemoryInfo(),
            this.updateSwapInfo(),
            this.updateStorageInfo(),
            this.updateCpuTemp()
        ]);
        if (document.getElementById('page-settings').classList.contains('active')) {
            await this.updateCpuLoads();
        }
    }
    
    async updateBatteryInfo() {
        const level = await this.exec('cat /sys/class/power_supply/battery/capacity');
        document.getElementById('battery-level').textContent = `${level}%`;
        const temp = await this.exec('cat /sys/class/power_supply/battery/temp');
        if (temp && !isNaN(temp)) {
            document.getElementById('battery-temp').textContent = `${(parseInt(temp) / 10).toFixed(1)}°C`;
        }
    }
    
    async updateCpuTemp() {
        const tempPaths = [
            '/sys/class/thermal/thermal_zone0/temp',
            '/sys/devices/virtual/thermal/thermal_zone0/temp',
            '/sys/class/hwmon/hwmon0/temp1_input'
        ];
        for (const path of tempPaths) {
            const temp = await this.exec(`cat ${path} 2>/dev/null`);
            if (temp && !isNaN(temp)) {
                const val = parseInt(temp);
                document.getElementById('cpu-temp').textContent = `${(val > 1000 ? val / 1000 : val).toFixed(1)}°C`;
                return;
            }
        }
        document.getElementById('cpu-temp').textContent = '--';
    }
    
    async updateMemoryInfo() {
        const meminfo = await this.exec('cat /proc/meminfo');
        let total = 0, available = 0, free = 0, buffers = 0, cached = 0;
        for (const line of meminfo.split('\n')) {
            const match = line.match(/^(\w+):\s+(\d+)/);
            if (!match) continue;
            const [, key, value] = match;
            const kb = parseInt(value);
            if (key === 'MemTotal') total = kb;
            else if (key === 'MemAvailable') available = kb;
            else if (key === 'MemFree') free = kb;
            else if (key === 'Buffers') buffers = kb;
            else if (key === 'Cached') cached = kb;
        }
        if (!available) available = free + buffers + cached;
        const used = total - available;
        const percent = ((used / total) * 100).toFixed(1);
        document.getElementById('mem-total').textContent = this.formatBytes(total * 1024);
        document.getElementById('mem-used').textContent = this.formatBytes(used * 1024);
        document.getElementById('mem-available').textContent = this.formatBytes(available * 1024);
        const progressEl = document.getElementById('mem-progress');
        progressEl.style.width = `${percent}%`;
        progressEl.className = `progress-fill${percent > 85 ? ' danger' : ''}`;
    }
    
    async updateStorageInfo() {
        const dfOutput = await this.exec('df /data 2>/dev/null | tail -1');
        if (dfOutput) {
            const parts = dfOutput.split(/\s+/);
            if (parts.length >= 4) {
                const total = parseInt(parts[1]) * 1024;
                const used = parseInt(parts[2]) * 1024;
                const available = parseInt(parts[3]) * 1024;
                const percent = total > 0 ? ((used / total) * 100).toFixed(1) : 0;
                const totalEl = document.getElementById('storage-total');
                const usedEl = document.getElementById('storage-used');
                const availableEl = document.getElementById('storage-available');
                const progressEl = document.getElementById('storage-progress');
                if (totalEl) totalEl.textContent = this.formatBytes(total);
                if (usedEl) usedEl.textContent = this.formatBytes(used);
                if (availableEl) availableEl.textContent = this.formatBytes(available);
                if (progressEl) {
                    progressEl.style.width = `${percent}%`;
                    progressEl.className = `progress-fill storage${percent > 85 ? ' danger' : ''}`;
                }
            }
        }
    }
    
    async updateSwapInfo() {
        const swapinfo = await this.exec('cat /proc/meminfo | grep Swap');
        let total = 0, free = 0;
        for (const line of swapinfo.split('\n')) {
            if (line.startsWith('SwapTotal:')) total = parseInt(line.match(/\d+/)?.[0] || 0);
            else if (line.startsWith('SwapFree:')) free = parseInt(line.match(/\d+/)?.[0] || 0);
        }
        const used = total - free;
        const percent = total > 0 ? ((used / total) * 100).toFixed(1) : 0;
        document.getElementById('swap-total').textContent = total > 0 ? this.formatBytes(total * 1024) : '未启用';
        document.getElementById('swap-used').textContent = total > 0 ? this.formatBytes(used * 1024) : '--';
        document.getElementById('swap-free').textContent = total > 0 ? this.formatBytes(free * 1024) : '--';
        document.getElementById('swap-progress').style.width = `${percent}%`;
    }
    async loadAllConfigs() {
        await Promise.all([
            this.loadZramConfig(),
            this.loadLe9ecConfig(),
            this.loadIOConfig(),
            this.loadCpuGovernorConfig(),
            this.loadTCPConfig(),
            this.loadCpuCores(),
            this.loadAffinityConfig()
        ]);
        await this.updateModuleDescription();
        this.updateClusterBadge();
    }
    
    updateClusterBadge() {
        const badge = document.getElementById('cpu-cluster-badge');
        if (badge) {
            badge.textContent = this.formatClusterInfo() || '--';
        }
    }
    
    async loadZramConfig() {
        const config = await this.exec(`cat ${this.configDir}/zram.conf 2>/dev/null`);
        if (config) {
            const algMatch = config.match(/algorithm=(\S+)/);
            const sizeMatch = config.match(/size=(\d+)/);
            const swapMatch = config.match(/swappiness=(\d+)/);
            const enabledMatch = config.match(/enabled=(\d)/);
            if (algMatch) {
                this.state.algorithm = algMatch[1];
                this.renderAlgorithmOptions();
            }
            if (sizeMatch) {
                this.state.zramSize = parseInt(sizeMatch[1]) / 1024 / 1024 / 1024;
                document.getElementById('zram-size-slider').value = this.state.zramSize;
                document.getElementById('zram-size-value').textContent = `${this.state.zramSize.toFixed(2)} GB`;
            }
            if (swapMatch) {
                this.state.swappiness = parseInt(swapMatch[1]);
                document.getElementById('swappiness-slider').value = this.state.swappiness;
                document.getElementById('swappiness-value').textContent = this.state.swappiness;
            }
            if (enabledMatch) {
                this.state.zramEnabled = enabledMatch[1] === '1';
                document.getElementById('zram-switch').checked = this.state.zramEnabled;
                this.toggleZramSettings(this.state.zramEnabled);
            }
        }
        await this.loadZramStatus();
    }
    
    async loadZramStatus() {
        const algRaw = await this.exec('cat /sys/block/zram0/comp_algorithm 2>/dev/null');
        const currentAlg = algRaw.match(/\[([^\]]+)\]/)?.[1] || algRaw.split(' ')[0] || '--';
        document.getElementById('zram-current-alg').textContent = currentAlg;
        const disksize = await this.exec('cat /sys/block/zram0/disksize 2>/dev/null');
        document.getElementById('zram-current-size').textContent = `${disksize ? (parseInt(disksize) / 1024 / 1024 / 1024).toFixed(2) : '0'} GB`;
    }
    
    async saveZramConfig() {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const config = `enabled=${this.state.zramEnabled ? '1' : '0'}\nalgorithm=${this.state.algorithm}\nsize=${sizeBytes}\nswappiness=${this.state.swappiness}`;
        await this.exec(`echo '${config}' > ${this.configDir}/zram.conf`);
        if (this.state.zramEnabled) {
            this.showLoading(true);
            await this.applyZramImmediate();
            this.showLoading(false);
        } else {
            this.showToast('ZRAM 配置已保存（禁用状态）');
            await this.updateModuleDescription();
        }
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
        const availableSchedulers = schedulerRaw.replace(/[\[\]]/g, '').split(/\s+/).filter(s => s);
        const currentScheduler = schedulerRaw.match(/\[([^\]]+)\]/)?.[1] || '';
        this.state.ioScheduler = currentScheduler;
        const container = document.getElementById('io-scheduler-list');
        container.innerHTML = availableSchedulers.map(s => 
            `<div class="option-item ${s === currentScheduler ? 'selected' : ''}" data-value="${s}">${s}</div>`
        ).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.state.ioScheduler = e.currentTarget.dataset.value;
                await this.applyIOSchedulerImmediate();
            });
        });
        document.getElementById('io-current').textContent = currentScheduler || '--';
        const configReadahead = await this.exec(`grep "^readahead=" ${this.configDir}/io_scheduler.conf 2>/dev/null | cut -d'=' -f2`);
        if (configReadahead) {
            this.state.readahead = parseInt(configReadahead);
            this.renderReadaheadOptions();
        }
    }
    
    async applyIOSchedulerImmediate() {
        await this.exec(`for f in /sys/block/*/queue/scheduler; do echo "${this.state.ioScheduler}" > "$f" 2>/dev/null; done`);
        const config = `scheduler=${this.state.ioScheduler}\nreadahead=${this.state.readahead}`;
        await this.exec(`echo '${config}' > ${this.configDir}/io_scheduler.conf`);
        document.getElementById('io-current').textContent = this.state.ioScheduler;
        await this.updateModuleDescription();
        this.showToast(`IO 调度器: ${this.state.ioScheduler}`);
    }
    
    async applyReadaheadImmediate() {
        await this.exec(`for f in /sys/block/*/queue/read_ahead_kb; do echo "${this.state.readahead}" > "$f" 2>/dev/null; done`);
        const config = `scheduler=${this.state.ioScheduler || ''}\nreadahead=${this.state.readahead}`;
        await this.exec(`echo '${config}' > ${this.configDir}/io_scheduler.conf`);
        this.showToast(`预读取: ${this.state.readahead} KB`);
    }
    
    async loadCpuGovernorConfig() {
        const governorRaw = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors 2>/dev/null');
        const currentGovernor = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null');
        const availableGovernors = governorRaw.split(/\s+/).filter(g => g);
        this.state.cpuGovernor = currentGovernor;
        const container = document.getElementById('cpu-governor-list');
        container.innerHTML = availableGovernors.map(g => 
            `<div class="option-item ${g === currentGovernor ? 'selected' : ''}" data-value="${g}">${g}</div>`
        ).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.state.cpuGovernor = e.currentTarget.dataset.value;
                await this.applyCpuGovernorImmediate();
            });
        });
        document.getElementById('cpu-gov-current').textContent = currentGovernor || '--';
    }
    
    async applyCpuGovernorImmediate() {
        await this.exec(`for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo "${this.state.cpuGovernor}" > "$f" 2>/dev/null; done`);
        await this.exec(`echo "governor=${this.state.cpuGovernor}" > ${this.configDir}/cpu_governor.conf`);
        document.getElementById('cpu-gov-current').textContent = this.state.cpuGovernor;
        await this.updateModuleDescription();
        this.showToast(`CPU 调频器: ${this.state.cpuGovernor}`);
    }
    
    async loadTCPConfig() {
        const tcpRaw = await this.exec('cat /proc/sys/net/ipv4/tcp_available_congestion_control 2>/dev/null');
        const currentTcp = await this.exec('cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null');
        const availableTcp = tcpRaw.split(/\s+/).filter(t => t);
        this.state.tcp = currentTcp;
        const container = document.getElementById('tcp-list');
        container.innerHTML = availableTcp.map(t => 
            `<div class="option-item ${t === currentTcp ? 'selected' : ''}" data-value="${t}">${t}</div>`
        ).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.state.tcp = e.currentTarget.dataset.value;
                await this.applyTcpImmediate();
            });
        });
        document.getElementById('tcp-current').textContent = currentTcp || '--';
    }
    
    async applyTcpImmediate() {
        await this.exec(`echo "${this.state.tcp}" > /proc/sys/net/ipv4/tcp_congestion_control`);
        await this.exec(`echo "congestion=${this.state.tcp}" > ${this.configDir}/tcp.conf`);
        document.getElementById('tcp-current').textContent = this.state.tcp;
        await this.updateModuleDescription();
        this.showToast(`TCP 拥塞算法: ${this.state.tcp}`);
    }
    async loadCpuCores() {
        this.cpuCores = [];
        const cpuCount = parseInt(await this.exec('ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null | wc -l')) || 0;
        const totalCores = this.getTotalCoreCount();
        const maxCores = totalCores > 0 ? totalCores : cpuCount;
        const seenIds = new Set();
        for (let i = 0; i < cpuCount && this.cpuCores.length < maxCores; i++) {
            if (seenIds.has(i)) continue;
            const online = await this.exec(`cat /sys/devices/system/cpu/cpu${i}/online 2>/dev/null`);
            const maxFreq = await this.exec(`cat /sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq 2>/dev/null`);
            const stat = await this.exec(`grep "^cpu${i} " /proc/stat 2>/dev/null`);
            if (!maxFreq && !stat) continue;
            seenIds.add(i);
            this.cpuCores.push({
                id: i,
                online: i === 0 ? true : online === '1',
                locked: i === 0,
                maxFreq: maxFreq ? parseInt(maxFreq) : 0,
                load: '--'
            });
        }
        this.cpuCores.sort((a, b) => a.id - b.id);
        this.renderCpuCores();
        await this.updateCpuLoads();
    }
    
    renderCpuCores() {
        const container = document.getElementById('cpu-cores-list');
        if (!container) return;
        container.innerHTML = this.cpuCores.map(core => `
            <div class="cpu-core ${core.online ? 'online' : 'offline'} ${core.locked ? 'locked' : ''}" 
                 data-cpu="${core.id}" onclick="corona.toggleCpuCore(${core.id})">
                <div class="cpu-core-id">CPU ${core.id}</div>
                <div class="cpu-core-load" id="cpu-load-${core.id}">${core.load}</div>
            </div>
        `).join('');
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
            if (!core.online) {
                const el = document.getElementById(`cpu-load-${core.id}`);
                if (el) el.textContent = 'OFF';
                continue;
            }
            const s1 = await this.getCpuStat(core.id);
            if (!s1) continue;
            if (!this.cpuStats[core.id]) {
                this.cpuStats[core.id] = s1;
                continue;
            }
            const s2 = s1;
            const prev = this.cpuStats[core.id];
            this.cpuStats[core.id] = s2;
            const el = document.getElementById(`cpu-load-${core.id}`);
            if (el) {
                const totalDiff = s2.total - prev.total;
                const activeDiff = s2.active - prev.active;
                const usage = totalDiff > 0 ? Math.round((activeDiff / totalDiff) * 100) : 0;
                el.textContent = `${usage}%`;
                core.load = `${usage}%`;
            }
        }
    }
    
    async toggleCpuCore(cpuId) {
        const core = this.cpuCores.find(c => c.id === cpuId);
        if (!core || core.locked) return;
        const totalCores = this.getTotalCoreCount();
        const currentOnlineCount = this.cpuCores.filter(c => c.online).length;
        if (core.online) {
            if (currentOnlineCount <= 1) {
                this.showToast('至少需要保留一个核心在线');
                return;
            }
        } else {
            if (currentOnlineCount >= totalCores) {
                this.showToast(`核心数不能超过架构总数 (${this.formatClusterInfo()} = ${totalCores})`);
                return;
            }
        }
        const newState = core.online ? '0' : '1';
        await this.exec(`echo ${newState} > /sys/devices/system/cpu/cpu${cpuId}/online`);
        core.online = newState === '1';
        await this.saveCpuHotplugConfig();
        await this.updateModuleDescription();
        this.renderCpuCores();
        this.showToast(`CPU${cpuId} 已${core.online ? '启用' : '禁用'}`);
    }
    
    async saveCpuHotplugConfig() {
        const disabledCores = this.cpuCores.filter(c => c.id > 0 && !c.online);
        let configContent = '';
        for (const core of disabledCores) {
            configContent += `cpu${core.id}=0\n`;
        }
        if (configContent) {
            await this.exec(`echo '${configContent}' > ${this.configDir}/cpu_hotplug.conf`);
        } else {
            await this.exec(`rm -f ${this.configDir}/cpu_hotplug.conf 2>/dev/null`);
        }
    }
    async updateModuleDescription() {
        const descParts = [];
        if (this.state.zramEnabled) {
            const algRaw = await this.exec('cat /sys/block/zram0/comp_algorithm 2>/dev/null');
            const currentAlg = algRaw.match(/\[([^\]]+)\]/)?.[1] || algRaw.split(' ')[0] || this.state.algorithm;
            descParts.push(`ZRAM:${currentAlg}`);
        } else {
            descParts.push(`ZRAM:关闭`);
        }
        if (this.state.ioScheduler) {
            descParts.push(`IO:${this.state.ioScheduler}`);
        } else {
            const schedulerRaw = await this.exec('cat /sys/block/sda/queue/scheduler 2>/dev/null || cat /sys/block/mmcblk0/queue/scheduler 2>/dev/null');
            if (schedulerRaw) {
                const current = schedulerRaw.match(/\[([^\]]+)\]/)?.[1] || schedulerRaw.split(' ')[0];
                if (current) descParts.push(`IO:${current}`);
                else descParts.push(`IO:--`);
            } else {
                descParts.push(`IO:--`);
            }
        }
        if (this.state.cpuGovernor) {
            descParts.push(`CPU:${this.state.cpuGovernor}`);
        } else {
            const current = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null');
            if (current) descParts.push(`CPU:${current.trim()}`);
            else descParts.push(`CPU:--`);
        }
        if (this.state.tcp) {
            descParts.push(`TCP:${this.state.tcp}`);
        } else {
            const current = await this.exec('cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null');
            if (current) descParts.push(`TCP:${current.trim()}`);
            else descParts.push(`TCP:--`);
        }
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
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }
    
    showLoading(show) {
        const el = document.getElementById('loading');
        if (el) el.classList.toggle('show', show);
    }
    
    initBannerDrag() {
        const banner = document.querySelector('.banner-image');
        if (!banner) return;
        let isDragging = false;
        let startX = 0, startY = 0;
        let currentX = 0, currentY = 0;
        const maxOffset = 15;
        const handleStart = (e) => {
            isDragging = true;
            banner.classList.add('dragging');
            const touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX - currentX;
            startY = touch.clientY - currentY;
        };
        const handleMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;
            let newX = touch.clientX - startX;
            let newY = touch.clientY - startY;
            newX = Math.max(-maxOffset, Math.min(maxOffset, newX));
            newY = Math.max(-maxOffset, Math.min(maxOffset, newY));
            currentX = newX;
            currentY = newY;
            banner.style.transform = `translate(${currentX}px, ${currentY}px)`;
        };
        const handleEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            banner.classList.remove('dragging');
            banner.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
            banner.style.transform = 'translate(0, 0)';
            currentX = 0;
            currentY = 0;
            setTimeout(() => {
                banner.style.transition = 'transform 0.15s ease-out';
            }, 400);
        };
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
        if (banner) {
            banner.addEventListener('click', () => {
                this.easterEgg.clickCount++;
                if (this.easterEgg.clickTimer) {
                    clearTimeout(this.easterEgg.clickTimer);
                }
                this.easterEgg.clickTimer = setTimeout(() => {
                    this.easterEgg.clickCount = 0;
                }, 500);
                if (this.easterEgg.clickCount >= 1) {
                    this.easterEgg.clickCount = 0;
                    this.showEasterEgg();
                }
            });
        }
        if (authorCard) {
            authorCard.addEventListener('click', () => {
                this.easterEgg.authorClickCount = (this.easterEgg.authorClickCount || 0) + 1;
                if (this.easterEgg.authorClickTimer) {
                    clearTimeout(this.easterEgg.authorClickTimer);
                }
                this.easterEgg.authorClickTimer = setTimeout(() => {
                    this.easterEgg.authorClickCount = 0;
                }, 500);
                if (this.easterEgg.authorClickCount >= 1) {
                    this.easterEgg.authorClickCount = 0;
                    this.showCreditsCard();
                }
            });
        }
        let cardTouchStartX = 0, cardTouchStartY = 0;
        let cardOffsetX = 0, cardOffsetY = 0;
        card.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            cardTouchStartX = touch.clientX;
            cardTouchStartY = touch.clientY;
            card.style.transition = 'none';
        }, { passive: true });
        card.addEventListener('touchmove', (e) => {
            if (!this.easterEgg.isOverlayOpen) return;
            const touch = e.touches[0];
            cardOffsetX = (touch.clientX - cardTouchStartX) * 0.15;
            cardOffsetY = (touch.clientY - cardTouchStartY) * 0.15;
            cardOffsetX = Math.max(-20, Math.min(20, cardOffsetX));
            cardOffsetY = Math.max(-20, Math.min(20, cardOffsetY));
            card.style.transform = `scale(1) translate(${cardOffsetX}px, ${cardOffsetY}px)`;
        }, { passive: true });
        card.addEventListener('touchend', () => {
            card.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
            card.style.transform = 'scale(1) translate(0, 0)';
            cardOffsetX = 0;
            cardOffsetY = 0;
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.hideEasterEgg();
            }
        });
    }
    
    showEasterEgg() {
        const overlay = document.getElementById('easter-egg-overlay');
        const content = document.getElementById('easter-egg-content');
        this.easterEgg.currentCard = 'thanks';
        this.easterEgg.isOverlayOpen = true;
        content.innerHTML = `
            <div class="rainbow-text">感谢使用<span class="corona-c-rainbow">C</span>orona模块</div>
            <div class="rainbow-text ciallo">Ciallo~(∠・ω< )⌒★</div>
        `;
        overlay.classList.add('show');
    }
    
    showCreditsCard() {
        const overlay = document.getElementById('easter-egg-overlay');
        const content = document.getElementById('easter-egg-content');
        this.easterEgg.currentCard = 'credits';
        this.easterEgg.isOverlayOpen = true;
        this.easterEgg.xinranClickCount = 0;
        content.innerHTML = `
            <div class="credit-name" id="xinran-credit">致谢爱人❤️然(≧ω≦)/</div>
            <div class="credit-name">
            <div class="credits-title">模块制作感谢名单</div>
                <div class="credit-name">Cloud_Yun</div>
                <div class="credit-name">穆远星</div>
            </div>
        `;
        overlay.classList.add('show');
        const xinranEl = document.getElementById('xinran-credit');
        if (xinranEl) {
            const self = this;
            xinranEl.onclick = function(e) {
                e.stopPropagation();
                self.easterEgg.xinranClickCount++;
                if (self.easterEgg.xinranClickTimer) {
                    clearTimeout(self.easterEgg.xinranClickTimer);
                }
                self.easterEgg.xinranClickTimer = setTimeout(() => {
                    self.easterEgg.xinranClickCount = 0;
                }, 1500);
                if (self.easterEgg.xinranClickCount >= 3) {
                    self.easterEgg.xinranClickCount = 0;
                    self.hideEasterEgg();
                    setTimeout(() => {
                        const xinranOverlay = document.getElementById('xinran-overlay');
                        xinranOverlay.classList.remove('hidden');
                        xinranOverlay.classList.add('show');
                    }, 300);
                }
            };
        }
    }
    
    hideEasterEgg() {
        const overlay = document.getElementById('easter-egg-overlay');
        overlay.classList.remove('show');
        this.easterEgg.isOverlayOpen = false;
        setTimeout(() => {
            const card = document.getElementById('easter-egg-card');
            card.style.transform = '';
            card.style.transition = '';
        }, 400);
    }

    initAffinityFeature() {
        document.getElementById('affinity-add-btn').addEventListener('click', () => {
            this.showProcessSelector();
        });
        document.getElementById('affinity-process-close').addEventListener('click', () => {
            this.hideOverlay('affinity-process-overlay');
        });
        document.getElementById('affinity-cpu-close').addEventListener('click', () => {
            this.hideOverlay('affinity-cpu-overlay');
        });
        document.getElementById('affinity-cancel-btn').addEventListener('click', () => {
            this.hideOverlay('affinity-cpu-overlay');
        });
        document.getElementById('affinity-save-btn').addEventListener('click', () => {
            this.saveAffinityRule();
        });
        document.getElementById('process-search').addEventListener('input', (e) => {
            this.filterProcessList(e.target.value);
        });
        document.getElementById('affinity-process-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'affinity-process-overlay') {
                this.hideOverlay('affinity-process-overlay');
            }
        });
        document.getElementById('affinity-cpu-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'affinity-cpu-overlay') {
                this.hideOverlay('affinity-cpu-overlay');
            }
        });
    }

    async loadAffinityConfig() {
        const config = await this.exec(`cat ${this.configDir}/cpu_affinity.conf 2>/dev/null`);
        this.affinityRules = {};
        if (config && config.trim()) {
            const lines = config.trim().split('\n');
            for (const line of lines) {
                if (line && line.includes('=')) {
                    const [processName, cpuMask] = line.split('=');
                    if (processName && cpuMask) {
                        this.affinityRules[processName.trim()] = cpuMask.trim();
                    }
                }
            }
        }
        this.renderAffinityRules();
        this.updateAffinityCount();
    }

    renderAffinityRules() {
        const container = document.getElementById('affinity-rules-list');
        const ruleNames = Object.keys(this.affinityRules);
        if (ruleNames.length === 0) {
            container.innerHTML = '<div class="affinity-empty">暂无亲和性规则</div>';
            return;
        }
        container.innerHTML = ruleNames.map(name => `
            <div class="affinity-rule-item" data-process="${name}">
                <div class="affinity-rule-info">
                    <div class="affinity-rule-name">${name}</div>
                    <div class="affinity-rule-cpus">CPU: ${this.affinityRules[name]}</div>
                </div>
                <div class="affinity-rule-actions">
                    <button class="affinity-rule-btn edit" onclick="corona.editAffinityRule('${name}')">✎</button>
                    <button class="affinity-rule-btn delete" onclick="corona.deleteAffinityRule('${name}')">✕</button>
                </div>
            </div>
        `).join('');
    }

    updateAffinityCount() {
        const count = Object.keys(this.affinityRules).length;
        document.getElementById('affinity-count').textContent = `${count} 条规则`;
    }

    async showProcessSelector() {
        this.showOverlay('affinity-process-overlay');
        document.getElementById('process-search').value = '';
        document.getElementById('process-list').innerHTML = '<div class="affinity-loading">加载中...</div>';
        await this.loadProcessList();
    }

    async loadProcessList() {
        const psOutput = await this.exec(`ps -A -o pid,comm 2>/dev/null | tail -n +2`);
        const processes = [];
        const seen = new Set();
        if (psOutput) {
            const lines = psOutput.split('\n');
            for (const line of lines) {
                const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
                if (match) {
                    const pid = match[1];
                    const name = match[2].trim();
                    if (!seen.has(name) && name && !name.startsWith('[')) {
                        seen.add(name);
                        processes.push({ pid, name });
                    }
                }
            }
        }
        processes.sort((a, b) => a.name.localeCompare(b.name));
        this.affinityProcesses = processes;
        this.renderProcessList(processes);
    }

    renderProcessList(processes) {
        const container = document.getElementById('process-list');
        if (processes.length === 0) {
            container.innerHTML = '<div class="affinity-loading">未找到进程</div>';
            return;
        }
        const systemProcs = [];
        const appProcs = [];
        const otherProcs = [];
        for (const proc of processes) {
            if (proc.name.startsWith('com.') || proc.name.includes('.')) {
                appProcs.push(proc);
            } else if (['surfaceflinger', 'zygote', 'system_server', 'servicemanager', 'vold', 'logd', 'lmkd', 'hwservicemanager', 'android.hardware'].some(s => proc.name.includes(s))) {
                systemProcs.push(proc);
            } else {
                otherProcs.push(proc);
            }
        }
        let html = '';
        if (appProcs.length > 0) {
            html += '<div class="process-category">应用进程</div>';
            html += appProcs.map(p => this.renderProcessItem(p)).join('');
        }
        if (systemProcs.length > 0) {
            html += '<div class="process-category">系统进程</div>';
            html += systemProcs.map(p => this.renderProcessItem(p)).join('');
        }
        if (otherProcs.length > 0) {
            html += '<div class="process-category">其他进程</div>';
            html += otherProcs.map(p => this.renderProcessItem(p)).join('');
        }
        container.innerHTML = html;
        container.querySelectorAll('.affinity-process-item').forEach(item => {
            item.addEventListener('click', () => {
                const name = item.dataset.name;
                this.selectProcess(name);
            });
        });
    }

    renderProcessItem(proc) {
        const initial = proc.name.charAt(0).toUpperCase();
        return `
            <div class="affinity-process-item" data-name="${proc.name}" data-pid="${proc.pid}">
                <div class="process-icon">${initial}</div>
                <div class="process-details">
                    <div class="process-name">${proc.name}</div>
                    <div class="process-pid">PID: ${proc.pid}</div>
                </div>
            </div>
        `;
    }

    filterProcessList(keyword) {
        const filtered = this.affinityProcesses.filter(p => 
            p.name.toLowerCase().includes(keyword.toLowerCase())
        );
        this.renderProcessList(filtered);
    }

    async selectProcess(processName) {
        this.selectedProcess = processName;
        this.hideOverlay('affinity-process-overlay');
        await this.showCpuSelector();
    }

    async showCpuSelector() {
        this.showOverlay('affinity-cpu-overlay');
        document.getElementById('selected-process-info').innerHTML = `
            <span class="process-name">${this.selectedProcess}</span>
        `;
        if (this.affinityRules[this.selectedProcess]) {
            this.selectedCpus = this.parseCpuMask(this.affinityRules[this.selectedProcess]);
        } else {
            this.selectedCpus = [];
        }
        await this.renderCpuGrid();
        this.renderPresetButtons();
    }

    parseCpuMask(mask) {
        const cpus = [];
        if (!mask) return cpus;
        const parts = mask.split(',');
        for (const part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                for (let i = start; i <= end; i++) {
                    cpus.push(i);
                }
            } else {
                cpus.push(parseInt(part));
            }
        }
        return [...new Set(cpus)].sort((a, b) => a - b);
    }

    formatCpuMask(cpus) {
        if (cpus.length === 0) return '';
        const sorted = [...cpus].sort((a, b) => a - b);
        const ranges = [];
        let start = sorted[0];
        let end = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === end + 1) {
                end = sorted[i];
            } else {
                ranges.push(start === end ? `${start}` : `${start}-${end}`);
                start = sorted[i];
                end = sorted[i];
            }
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        return ranges.join(',');
    }

    async renderCpuGrid() {
        const container = document.getElementById('affinity-cpu-grid');
        const cpuCount = this.cpuCores.length || 8;
        if (this.cpuMaxFreqs.length === 0) {
            for (let i = 0; i < cpuCount; i++) {
                const freq = await this.exec(`cat /sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq 2>/dev/null`);
                this.cpuMaxFreqs[i] = freq ? Math.round(parseInt(freq) / 1000) : 0;
            }
        }
        let html = '';
        for (let i = 0; i < cpuCount; i++) {
            const isSelected = this.selectedCpus.includes(i);
            const freq = this.cpuMaxFreqs[i] ? `${this.cpuMaxFreqs[i]} MHz` : '--';
            html += `
                <div class="affinity-cpu-item ${isSelected ? 'selected' : ''}" data-cpu="${i}" onclick="corona.toggleAffinityCpu(${i})">
                    <div class="cpu-item-id">CPU ${i}</div>
                    <div class="cpu-item-freq">${freq}</div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    renderPresetButtons() {
        const container = document.getElementById('preset-buttons');
        const totalCpus = this.cpuCores.length || 8;
        const presets = [
            { name: '全部', cpus: Array.from({length: totalCpus}, (_, i) => i) },
            { name: '小核', cpus: this.getClusterCpus('little') },
            { name: '中核', cpus: this.getClusterCpus('mid') },
            { name: '大核', cpus: this.getClusterCpus('big') },
            { name: '超大核', cpus: this.getClusterCpus('prime') }
        ].filter(p => p.cpus.length > 0);
        container.innerHTML = presets.map(p => `
            <button class="preset-btn" onclick="corona.applyPreset([${p.cpus.join(',')}])">${p.name} (${p.cpus.length})</button>
        `).join('');
    }

    getClusterCpus(clusterType) {
        const freqs = [];
        for (let i = 0; i < this.cpuCores.length; i++) {
            freqs.push({ cpu: i, freq: this.cpuMaxFreqs[i] || 0 });
        }
        freqs.sort((a, b) => a.freq - b.freq);
        const uniqueFreqs = [...new Set(freqs.map(f => f.freq))].sort((a, b) => a - b);
        if (uniqueFreqs.length === 1) {
            return clusterType === 'little' ? freqs.map(f => f.cpu) : [];
        } else if (uniqueFreqs.length === 2) {
            if (clusterType === 'little') return freqs.filter(f => f.freq === uniqueFreqs[0]).map(f => f.cpu);
            if (clusterType === 'big') return freqs.filter(f => f.freq === uniqueFreqs[1]).map(f => f.cpu);
            return [];
        } else if (uniqueFreqs.length === 3) {
            if (clusterType === 'little') return freqs.filter(f => f.freq === uniqueFreqs[0]).map(f => f.cpu);
            if (clusterType === 'mid') return freqs.filter(f => f.freq === uniqueFreqs[1]).map(f => f.cpu);
            if (clusterType === 'big') return freqs.filter(f => f.freq === uniqueFreqs[2]).map(f => f.cpu);
            return [];
        } else if (uniqueFreqs.length >= 4) {
            if (clusterType === 'little') return freqs.filter(f => f.freq === uniqueFreqs[0]).map(f => f.cpu);
            if (clusterType === 'mid') return freqs.filter(f => f.freq === uniqueFreqs[1]).map(f => f.cpu);
            if (clusterType === 'big') return freqs.filter(f => f.freq !== uniqueFreqs[0] && f.freq !== uniqueFreqs[1] && f.freq !== uniqueFreqs[uniqueFreqs.length - 1]).map(f => f.cpu);
            if (clusterType === 'prime') return freqs.filter(f => f.freq === uniqueFreqs[uniqueFreqs.length - 1]).map(f => f.cpu);
            return [];
        }
        return [];
    }

    toggleAffinityCpu(cpuId) {
        const idx = this.selectedCpus.indexOf(cpuId);
        if (idx >= 0) {
            this.selectedCpus.splice(idx, 1);
        } else {
            this.selectedCpus.push(cpuId);
        }
        this.selectedCpus.sort((a, b) => a - b);
        this.updateCpuGridSelection();
    }

    applyPreset(cpus) {
        this.selectedCpus = [...cpus];
        this.updateCpuGridSelection();
    }

    updateCpuGridSelection() {
        document.querySelectorAll('.affinity-cpu-item').forEach(item => {
            const cpuId = parseInt(item.dataset.cpu);
            item.classList.toggle('selected', this.selectedCpus.includes(cpuId));
        });
    }

    async saveAffinityRule() {
        if (!this.selectedProcess) {
            this.showToast('请先选择进程');
            return;
        }
        if (this.selectedCpus.length === 0) {
            this.showToast('请至少选择一个CPU核心');
            return;
        }
        const cpuMask = this.formatCpuMask(this.selectedCpus);
        this.affinityRules[this.selectedProcess] = cpuMask;
        await this.saveAffinityConfig();
        await this.applyAffinityRule(this.selectedProcess, cpuMask);
        this.hideOverlay('affinity-cpu-overlay');
        this.renderAffinityRules();
        this.updateAffinityCount();
        this.showToast(`已设置 ${this.selectedProcess} 的CPU亲和性: ${cpuMask}`);
    }

    async saveAffinityConfig() {
        let configContent = '';
        for (const [name, mask] of Object.entries(this.affinityRules)) {
            configContent += `${name}=${mask}\n`;
        }
        await this.exec(`echo '${configContent}' > ${this.configDir}/cpu_affinity.conf`);
    }

    async applyAffinityRule(processName, cpuMask) {
        const pids = await this.exec(`pgrep -f "${processName}" 2>/dev/null`);
        if (pids) {
            const pidList = pids.trim().split('\n');
            for (const pid of pidList) {
                if (pid && pid.trim()) {
                    await this.exec(`taskset -p ${this.cpuMaskToHex(this.parseCpuMask(cpuMask))} ${pid.trim()} 2>/dev/null`);
                }
            }
        }
    }

    cpuMaskToHex(cpus) {
        let mask = 0;
        for (const cpu of cpus) {
            mask |= (1 << cpu);
        }
        return '0x' + mask.toString(16);
    }

    async editAffinityRule(processName) {
        this.selectedProcess = processName;
        await this.showCpuSelector();
    }

    async deleteAffinityRule(processName) {
        if (!confirm(`确定要删除 ${processName} 的亲和性规则吗？`)) {
            return;
        }
        delete this.affinityRules[processName];
        await this.saveAffinityConfig();
        this.renderAffinityRules();
        this.updateAffinityCount();
        this.showToast(`已删除 ${processName} 的亲和性规则`);
    }

    async applyAllAffinityRules() {
        for (const [name, mask] of Object.entries(this.affinityRules)) {
            await this.applyAffinityRule(name, mask);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.corona = new CoronaAddon();
});
