class CoronaAddon {
    
    constructor() {
        this.modDir = '/data/adb/modules/Corona';
        this.configDir = `${this.modDir}/config`;
        this.algorithms = ['lz4', 'lz4hc', 'lzo', 'lzo-rle', 'zstd', 'zstdn', 'deflate', 'lz4k', 'lz4kd'];
        this.readaheadOptions = [128, 256, 384, 512, 768, 1024, 2048, 4096];
        this.state = {
            algorithm: 'lz4', zramSize: 8, swappiness: 100,
            ioScheduler: null, readahead: 512, tcp: null, cpuGovernor: null,
            zramEnabled: false
        };
        this.cpuCores = [];
        
        this.easterEgg = {
            clickCount: 0,
            clickTimer: null,
            authorClickCount: 0,
            authorClickTimer: null,
            currentCard: 'thanks',
            isOverlayOpen: false
        };
        
        this.init();
    }
    
    async init() {
        await this.ensureConfigDir();
        this.bindAllEvents();
        this.renderStaticOptions();
        await this.loadDeviceInfo();
        this.startRealtimeMonitor();
        await this.loadAllConfigs();
        this.initBannerDrag();
        this.initEasterEgg();
    }
    
    async exec(cmd) {
        return new Promise((resolve) => {
            const callbackId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            const timeout = setTimeout(() => { delete window[callbackId]; resolve(''); }, 8000);
            window[callbackId] = (code, stdout, stderr) => {
                clearTimeout(timeout);
                delete window[callbackId];
                resolve(stdout ? stdout.trim() : '');
            };
            try { ksu.exec(cmd, '{}', callbackId); }
            catch (e) { clearTimeout(timeout); delete window[callbackId]; resolve(''); }
        });
    }
    
    async ensureConfigDir() { await this.exec(`mkdir -p ${this.configDir}`); }
    
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
        if (show) { settings.classList.remove('hidden'); this.loadZramStatus(); }
        else { settings.classList.add('hidden'); }
    }
    
    renderStaticOptions() { this.renderAlgorithmOptions(); this.renderReadaheadOptions(); }
    
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
        const cpuDirs = await this.exec('ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null | wc -l');
        const coreCount = parseInt(cpuDirs) || 8;
        const cpuName = chipname || socModel || hardware || 'Unknown';
        document.getElementById('cpu-info').textContent = `${cpuName} (${coreCount} 核心)`;
        
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
    
    startRealtimeMonitor() {
        this.updateRealtimeData();
        setInterval(() => this.updateRealtimeData(), 3000);
    }
    
    async updateRealtimeData() {
        await Promise.all([this.updateBatteryInfo(), this.updateMemoryInfo(), this.updateSwapInfo(), this.updateStorageInfo(), this.updateCpuTemp()]);
        if (document.getElementById('page-settings').classList.contains('active')) await this.updateCpuLoads();
    }
    
    async updateBatteryInfo() {
        const level = await this.exec('cat /sys/class/power_supply/battery/capacity');
        document.getElementById('battery-level').textContent = `${level}%`;
        const temp = await this.exec('cat /sys/class/power_supply/battery/temp');
        if (temp && !isNaN(temp)) document.getElementById('battery-temp').textContent = `${(parseInt(temp) / 10).toFixed(1)}°C`;
    }
    
    async updateCpuTemp() {
        const tempPaths = ['/sys/class/thermal/thermal_zone0/temp', '/sys/devices/virtual/thermal/thermal_zone0/temp', '/sys/class/hwmon/hwmon0/temp1_input'];
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
        await Promise.all([this.loadZramConfig(), this.loadIOConfig(), this.loadCpuGovernorConfig(), this.loadTCPConfig(), this.loadCpuCores()]);
        await this.updateModuleDescription();
    }
    
    async loadZramConfig() {
        const config = await this.exec(`cat ${this.configDir}/zram.conf 2>/dev/null`);
        if (config) {
            const algMatch = config.match(/algorithm=(\S+)/);
            const sizeMatch = config.match(/size=(\d+)/);
            const swapMatch = config.match(/swappiness=(\d+)/);
            const enabledMatch = config.match(/enabled=(\d)/);
            
            if (algMatch) { this.state.algorithm = algMatch[1]; this.renderAlgorithmOptions(); }
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
        if (!schedulerRaw) {
            document.getElementById('io-scheduler-list').innerHTML = '<span style="color:#666;font-size:11px;">读取失败</span>';
            return;
        }
        const schedulers = schedulerRaw.replace(/[\[\]]/g, '').split(/\s+/).filter(s => s);
        const current = schedulerRaw.match(/\[([^\]]+)\]/)?.[1] || '';
        document.getElementById('io-current').textContent = current;
        this.state.ioScheduler = current;
        
        const container = document.getElementById('io-scheduler-list');
        container.innerHTML = schedulers.map(s => `<div class="option-item ${s === current ? 'current selected' : ''}" data-value="${s}">${s}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.state.ioScheduler = e.currentTarget.dataset.value;
                await this.applyIOSchedulerImmediate();
            });
        });
        
        const readahead = await this.exec('cat /sys/block/sda/queue/read_ahead_kb 2>/dev/null || cat /sys/block/mmcblk0/queue/read_ahead_kb 2>/dev/null');
        if (readahead) { this.state.readahead = parseInt(readahead); this.renderReadaheadOptions(); }
    }
    
    async applyIOSchedulerImmediate() {
        if (!this.state.ioScheduler) return;
        await this.exec(`for f in /sys/block/*/queue/scheduler; do echo "${this.state.ioScheduler}" > "$f" 2>/dev/null; done`);
        await this.exec(`echo 'scheduler=${this.state.ioScheduler}\nreadahead=${this.state.readahead}' > ${this.configDir}/io_scheduler.conf`);
        await this.updateModuleDescription();
        document.getElementById('io-current').textContent = this.state.ioScheduler;
        this.showToast(`IO 调度器: ${this.state.ioScheduler}`);
    }
    
    async applyReadaheadImmediate() {
        await this.exec(`for f in /sys/block/*/queue/read_ahead_kb; do echo "${this.state.readahead}" > "$f" 2>/dev/null; done`);
        await this.exec(`echo 'scheduler=${this.state.ioScheduler}\nreadahead=${this.state.readahead}' > ${this.configDir}/io_scheduler.conf`);
        await this.updateModuleDescription();
        this.showToast(`预读取: ${this.state.readahead}KB`);
    }
    
    async loadCpuGovernorConfig() {
        const available = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors 2>/dev/null');
        const current = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null');
        if (!available) { document.getElementById('cpu-governor-list').innerHTML = '<span style="color:#666;font-size:11px;">读取失败</span>'; return; }
        
        const governors = available.split(/\s+/).filter(g => g);
        document.getElementById('cpu-gov-current').textContent = current;
        this.state.cpuGovernor = current;
        
        const container = document.getElementById('cpu-governor-list');
        container.innerHTML = governors.map(g => `<div class="option-item ${g === current ? 'current selected' : ''}" data-value="${g}">${g}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.state.cpuGovernor = e.currentTarget.dataset.value;
                await this.applyCpuGovernorImmediate();
            });
        });
    }
    
    async applyCpuGovernorImmediate() {
        if (!this.state.cpuGovernor) return;
        await this.exec(`for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo "${this.state.cpuGovernor}" > "$f" 2>/dev/null; done`);
        await this.exec(`echo 'governor=${this.state.cpuGovernor}' > ${this.configDir}/cpu_governor.conf`);
        await this.updateModuleDescription();
        document.getElementById('cpu-gov-current').textContent = this.state.cpuGovernor;
        this.showToast(`调频器: ${this.state.cpuGovernor}`);
    }
    
    async loadTCPConfig() {
        const available = await this.exec('cat /proc/sys/net/ipv4/tcp_available_congestion_control');
        const current = await this.exec('cat /proc/sys/net/ipv4/tcp_congestion_control');
        if (!available) { document.getElementById('tcp-list').innerHTML = '<span style="color:#666;font-size:11px;">读取失败</span>'; return; }
        
        const algorithms = available.split(/\s+/).filter(a => a);
        document.getElementById('tcp-current').textContent = current;
        this.state.tcp = current;
        
        const container = document.getElementById('tcp-list');
        container.innerHTML = algorithms.map(a => `<div class="option-item ${a === current ? 'current selected' : ''}" data-value="${a}">${a}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.state.tcp = e.currentTarget.dataset.value;
                await this.applyTCPImmediate();
            });
        });
    }
    
    async applyTCPImmediate() {
        if (!this.state.tcp) return;
        await this.exec(`echo "${this.state.tcp}" > /proc/sys/net/ipv4/tcp_congestion_control`);
        await this.exec(`echo 'congestion=${this.state.tcp}' > ${this.configDir}/tcp.conf`);
        await this.updateModuleDescription();
        document.getElementById('tcp-current').textContent = this.state.tcp;
        this.showToast(`TCP 算法: ${this.state.tcp}`);
    }
    
    async loadCpuCores() {
        this.cpuCores = [];
        
        const cpuList = await this.exec('ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null');
        if (cpuList) {
            const cpuPaths = cpuList.split('\n').filter(p => p.trim() !== '');
            
            for (const cpuPath of cpuPaths) {
                const match = cpuPath.match(/cpu(\d+)/);
                if (!match) continue;
                
                const cpuId = parseInt(match[1]);
                
                let online = true;
                if (cpuId !== 0) {
                    const onlineVal = await this.exec(`cat ${cpuPath}/online 2>/dev/null`);
                    online = onlineVal !== '0';
                }
                
                if (!this.cpuCores.some(core => core.id === cpuId)) {
                    this.cpuCores.push({ id: cpuId, online, locked: cpuId === 0, load: '--' });
                }
            }
        }
        
        if (this.cpuCores.length === 0) {
            const stat = await this.exec('cat /proc/stat 2>/dev/null');
            if (stat) {
                const lines = stat.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('cpu') && !line.startsWith('cpu ')) {
                        const match = line.match(/^cpu(\d+)\s+/);
                        if (match) {
                            const cpuId = parseInt(match[1]);
                            
                            let online = true;
                            if (cpuId !== 0) {
                                const onlineVal = await this.exec(`cat /sys/devices/system/cpu/cpu${cpuId}/online 2>/dev/null`);
                                online = onlineVal !== '0';
                            }
                            
                            if (!this.cpuCores.some(core => core.id === cpuId)) {
                                this.cpuCores.push({ id: cpuId, online, locked: cpuId === 0, load: '--' });
                            }
                        }
                    }
                }
            }
        }
        
        this.cpuCores.sort((a, b) => a.id - b.id);
        
        await this.loadCpuHotplugConfig();
        this.renderCpuCores();
        await this.updateCpuLoads();
    }
    
    async loadCpuHotplugConfig() {
        const configContent = await this.exec(`cat ${this.configDir}/cpu_hotplug.conf 2>/dev/null`);
        
        if (configContent) {
            const config = {};
            const lines = configContent.split('\n').filter(line => line.trim() !== '' && line.includes('='));
            
            for (const line of lines) {
                const match = line.match(/^cpu(\d+)=(\d+)/);
                if (match) {
                    const cpuId = parseInt(match[1]);
                    const value = parseInt(match[2]);
                    
                    if (value === 0) {
                        const core = this.cpuCores.find(c => c.id === cpuId);
                        if (core && cpuId > 0) {
                            core.online = false;
                        }
                    }
                }
            }
        }
    }
    
    renderCpuCores() {
        const container = document.getElementById('cpu-cores-list');
        container.innerHTML = this.cpuCores.map(core => 
            `<div class="cpu-core ${core.online ? 'online' : 'offline'} ${core.locked ? 'locked' : ''}" data-cpu="${core.id}">
                <div class="cpu-core-id">CPU${core.id}</div>
                <div class="cpu-core-load" id="cpu-load-${core.id}">${core.load}</div>
            </div>`
        ).join('');
        container.querySelectorAll('.cpu-core').forEach(el => {
            el.addEventListener('click', async () => await this.toggleCpuCore(parseInt(el.dataset.cpu)));
        });
    }
    
    async updateCpuLoads() {
        const stat1 = await this.exec('cat /proc/stat');
        await this.sleep(200);
        const stat2 = await this.exec('cat /proc/stat');
        
        const parseCpuLine = (line) => {
            const parts = line.split(/\s+/);
            const user = parseInt(parts[1]) || 0, nice = parseInt(parts[2]) || 0;
            const system = parseInt(parts[3]) || 0, idle = parseInt(parts[4]) || 0;
            const iowait = parseInt(parts[5]) || 0, irq = parseInt(parts[6]) || 0, softirq = parseInt(parts[7]) || 0;
            const total = user + nice + system + idle + iowait + irq + softirq;
            return { total, active: total - idle - iowait };
        };
        
        for (const core of this.cpuCores) {
            const el = document.getElementById(`cpu-load-${core.id}`);
            if (!el) continue;
            if (!core.online) { el.textContent = '离线'; continue; }
            
            const regex = new RegExp(`^cpu${core.id}\\s+`, 'm');
            const line1 = stat1.split('\n').find(l => regex.test(l));
            const line2 = stat2.split('\n').find(l => regex.test(l));
            if (line1 && line2) {
                const s1 = parseCpuLine(line1), s2 = parseCpuLine(line2);
                const usage = (s2.total - s1.total) > 0 ? Math.round(((s2.active - s1.active) / (s2.total - s1.total)) * 100) : 0;
                el.textContent = `${usage}%`;
                core.load = `${usage}%`;
            } else { el.textContent = '--'; }
        }
    }
    
    async toggleCpuCore(cpuId) {
        const core = this.cpuCores.find(c => c.id === cpuId);
        if (!core || core.locked) return;
        
        const newState = core.online ? '0' : '1';
        await this.exec(`echo ${newState} > /sys/devices/system/cpu/cpu${cpuId}/online`);
        core.online = newState === '1';
        
        await this.saveCpuHotplugConfig();
        await this.updateModuleDescription();
        this.renderCpuCores();
        this.showToast(`CPU${cpuId} 已${core.online ? '启用' : '禁用'}`);
    }
    
    async saveCpuHotplugConfig() {
        const disabledCores = this.cpuCores.filter(core => core.id > 0 && !core.online);
        
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
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    
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
                
                if (this.easterEgg.clickCount >= 7) {
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
                
                if (this.easterEgg.authorClickCount >= 7) {
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
            <div class="rainbow-text">感谢使用<span class="corona-c">C</span>orona模块</div>
            <div class="rainbow-text ciallo">Ciallo~(∠・ω< )⌒★</div>
        `;
        
        overlay.classList.add('show');
    }
    
    showCreditsCard() {
        const overlay = document.getElementById('easter-egg-overlay');
        const content = document.getElementById('easter-egg-content');
        
        this.easterEgg.currentCard = 'credits';
        this.easterEgg.isOverlayOpen = true;
        
        content.innerHTML = `
            <div class="credit-name">致谢爱人❤️李欣然(≧ω≦)/</div>
            <div class="credits-title">模块制作感谢名单</div>
            <div class="credits-list">
                <div class="credit-name">Cloud_Yun</div>
                <div class="credit-name">穆远星</div>
            </div>
        `;
        
        overlay.classList.add('show');
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
}

document.addEventListener('DOMContentLoaded', () => { window.corona = new CoronaAddon(); });