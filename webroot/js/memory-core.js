(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["memory-core"]) return;
  Object.assign(CoronaAddon.prototype, {

    initAdvancedFold(headerId, bodyId, { defaultOpen = false } = {}) {
        const header = document.getElementById(headerId);
        const body = document.getElementById(bodyId);
        if (!header || !body || header.dataset.bound) return;
        header.dataset.bound = '1';

        const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
        const durationFor = (height) => Math.round(Math.min(440, Math.max(240, (Number(height) || 0) * 0.28 + 190)));

        const setClosedInstant = () => {
            body.hidden = false; // keep in layout flow for measuring when opening
            body.style.display = 'block';
            body.style.overflow = 'hidden';
            body.style.transition = 'none';
            body.style.maxHeight = '0px';
            body.style.opacity = '0';
            body.style.transform = 'translateY(-8px) scale(0.985)';
            body.dataset.open = '0';
            header.classList.remove('expanded');
        };

        const openAnim = () => {
            if (body.dataset.open === '1' || body._foldAnim) return;
            body.hidden = false;
            body.style.display = 'block';
            body.style.overflow = 'hidden';
            body.style.transition = 'none';
            body.style.maxHeight = 'none';
            body.style.opacity = '1';
            body.style.transform = 'none';
            const target = Math.max(body.scrollHeight, 1);
            body.style.maxHeight = '0px';
            body.style.opacity = '0';
            body.style.transform = 'translateY(-8px) scale(0.985)';
            void body.offsetHeight;
            const d = durationFor(target);
            body.style.willChange = 'max-height, opacity, transform';
            body.style.transition = `max-height ${d}ms ${ease}, opacity ${Math.round(d * 0.72)}ms ease, transform ${d}ms ${ease}`;
            void body.offsetHeight;
            body.style.maxHeight = target + 'px';
            body.style.opacity = '1';
            body.style.transform = 'translateY(0) scale(1)';
            header.classList.add('expanded');
            body.dataset.open = '1';
            body._foldAnim = setTimeout(() => {
                body._foldAnim = null;
                if (body.dataset.open === '1') {
                    body.style.transition = 'none';
                    body.style.maxHeight = 'none';
                    body.style.overflow = 'visible';
                    body.style.transform = 'none';
                    body.style.willChange = 'auto';
                }
            }, d + 40);
        };

        const closeAnim = () => {
            if (body.dataset.open !== '1' || body._foldAnim) {
                // still allow reverse if mid-open
            }
            if (body._foldAnim) {
                clearTimeout(body._foldAnim);
                body._foldAnim = null;
            }
            body.style.overflow = 'hidden';
            body.style.transition = 'none';
            const from = Math.max(body.getBoundingClientRect().height || body.scrollHeight || 1, 1);
            body.style.maxHeight = from + 'px';
            body.style.opacity = '1';
            body.style.transform = 'translateY(0) scale(1)';
            void body.offsetHeight;
            const d = durationFor(from);
            body.style.willChange = 'max-height, opacity, transform';
            body.style.transition = `max-height ${d}ms ${ease}, opacity ${Math.round(d * 0.68)}ms ease, transform ${d}ms ${ease}`;
            void body.offsetHeight;
            body.style.maxHeight = '0px';
            body.style.opacity = '0';
            body.style.transform = 'translateY(-8px) scale(0.985)';
            header.classList.remove('expanded');
            body.dataset.open = '0';
            body._foldAnim = setTimeout(() => {
                body._foldAnim = null;
                body.style.transition = 'none';
                body.style.maxHeight = '0px';
                body.style.overflow = 'hidden';
                body.style.willChange = 'auto';
            }, d + 40);
        };

        const toggle = () => {
            if (body.dataset.open === '1') closeAnim();
            else openAnim();
        };

        header.addEventListener('click', toggle);
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });

        if (defaultOpen) openAnim();
        else setClosedInstant();
    },
    initIoAdvancedFold() {
        this.initAdvancedFold('io-advanced-toggle', 'io-advanced-body', { defaultOpen: false });
    },
    initZramRecompFold() {
        this.initAdvancedFold('zram-recomp-toggle', 'zram-recomp-body', { defaultOpen: false });
    },
    async getPreferredBlockDevice() {
        const device = (await this.exec("for d in /sys/block/*; do b=$(basename \"$d\"); case \"$b\" in loop*|ram*|zram*|dm-*) continue ;; esac; [ -d \"$d/queue\" ] || continue; echo \"$b\"; break; done")).trim();
        return device || '';
    },
    parseIoConfig(content) {
        const values = {};
        String(content || '').split('\n').forEach(line => {
            const idx = line.indexOf('=');
            if (idx <= 0) return;
            values[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        });
        return values;
    },
    getIOFieldUpdates(changedField = 'io') {
        const field = changedField || 'io';
        const updates = {};
        if (field === 'io' || field === 'enabled') updates.enabled = this.state.ioEnabled ? '1' : '0';
        if (field === 'io' || field === 'scheduler') updates.scheduler = this.state.ioScheduler || '';
        if (field === 'io' || field === 'readahead') updates.readahead = String(this.state.readahead);
        if (field === 'io' || field === 'nr_requests') updates.nr_requests = String(this.state.ioNrRequests);
        if (field === 'io' || field === 'rq_affinity') updates.rq_affinity = String(this.state.ioRqAffinity);
        if (field === 'io' || field === 'nomerges') updates.nomerges = String(this.state.ioNomerges);
        if (field === 'io' || field === 'iostats') updates.iostats = this.state.ioIostats ? '1' : '0';
        return updates;
    },
    buildIOWritePlan(changedField = 'io') {
        const writes = [];
        const field = changedField || 'io';
        if ((field === 'io' || field === 'scheduler') && this.state.ioScheduler) writes.push({ path: '/sys/block/*/queue/scheduler', value: this.isCoronaKernel ? `kernel:${this.state.ioScheduler}` : this.state.ioScheduler });
        if (field === 'io' || field === 'readahead') writes.push({ path: '/sys/block/*/queue/read_ahead_kb', value: String(this.state.readahead) });
        if (field === 'io' || field === 'nr_requests') writes.push({ path: '/sys/block/*/queue/nr_requests', value: String(this.state.ioNrRequests) });
        if (field === 'io' || field === 'rq_affinity') writes.push({ path: '/sys/block/*/queue/rq_affinity', value: String(this.state.ioRqAffinity) });
        if (field === 'io' || field === 'nomerges') writes.push({ path: '/sys/block/*/queue/nomerges', value: String(this.state.ioNomerges) });
        if (field === 'io' || field === 'iostats') writes.push({ path: '/sys/block/*/queue/iostats', value: this.state.ioIostats ? '1' : '0' });
        return writes;
    },
    async applyIOConfigImmediate(changedField = 'io', skipPreview = false) {
      return this.withLock('io', async () => {
        const schedCmd = this.state.ioScheduler ? (this.isCoronaKernel ? `kernel:${this.state.ioScheduler}` : this.state.ioScheduler) : '';
        const updates = this.getIOFieldUpdates(changedField);
        const order = ['enabled', 'scheduler', 'readahead', 'nr_requests', 'rq_affinity', 'nomerges', 'iostats'];
        const config = await this.buildMergedConfigContent('io_scheduler.conf', updates, order);
        if (!skipPreview) {
            const labels = {
                enabled: 'I/O 开关',
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
                writes: this.buildIOWritePlan(changedField)
            }, {
                onCancel: () => this.loadIOConfig()
            });
            if (!confirmed) return false;
        }
        if (!this.state.ioEnabled) {
            await this.mergeConfigFile('io_scheduler.conf', updates, order);
            await this.updateModuleDescription();
            this.showToast(changedField === 'enabled' || changedField === 'io' ? 'I/O 配置已保存（禁用状态）' : 'I/O 配置已保存');
            return true;
        }
        const quotedScheduler = schedCmd ? this.shellQuote(schedCmd) : '';
        const commands = [];
        if ((changedField === 'io' || changedField === 'scheduler') && schedCmd) commands.push(`[ -f "$q/scheduler" ] && echo ${quotedScheduler} > "$q/scheduler" 2>/dev/null`);
        if (changedField === 'io' || changedField === 'readahead') commands.push(`[ -f "$q/read_ahead_kb" ] && echo ${this.state.readahead} > "$q/read_ahead_kb" 2>/dev/null`);
        if (changedField === 'io' || changedField === 'nr_requests') commands.push(`[ -f "$q/nr_requests" ] && echo ${this.state.ioNrRequests} > "$q/nr_requests" 2>/dev/null`);
        if (changedField === 'io' || changedField === 'rq_affinity') commands.push(`[ -f "$q/rq_affinity" ] && echo ${this.state.ioRqAffinity} > "$q/rq_affinity" 2>/dev/null`);
        if (changedField === 'io' || changedField === 'nomerges') commands.push(`[ -f "$q/nomerges" ] && echo ${this.state.ioNomerges} > "$q/nomerges" 2>/dev/null`);
        if (changedField === 'io' || changedField === 'iostats') commands.push(`[ -f "$q/iostats" ] && echo ${this.state.ioIostats ? 1 : 0} > "$q/iostats" 2>/dev/null`);
        if (commands.length > 0) {
            await this.exec(`for d in /sys/block/*; do b=$(basename "$d"); case "$b" in loop*|ram*|zram*|dm-*) continue ;; esac; q="$d/queue"; [ -d "$q" ] || continue; ${commands.join('; ')}; done`);
        }
        await this.mergeConfigFile('io_scheduler.conf', updates, order);
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
    },
    async applyReadaheadImmediate(skipPreview = false) {
        return this.applyIOConfigImmediate('readahead', skipPreview);
    },
    async applyIOSchedulerImmediate(skipPreview = false) {
        return this.applyIOConfigImmediate('scheduler', skipPreview);
    },
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
        if (typeof this.detectZramFeatures === "function") await this.detectZramFeatures();
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
    },
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
,
    async getZramAlgorithmCommand(algorithm, zramBlock) {
        const algRaw = await this.exec(`cat /sys/block/${zramBlock}/comp_algorithm 2>/dev/null`);
        const prefixed = `kernel:${algorithm}`;
        if (this.isCoronaKernel && algRaw && algRaw.includes(prefixed)) return prefixed;
        return algorithm;
    },
    getZramBlockName(zramPath) {
        const raw = String(zramPath || '').replace('/dev/block/', '').replace('/dev/', '').trim();
        return raw.replace(/[^a-zA-Z0-9_.-].*$/, '');
    },
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
    },
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
    },
    formatClusterInfo() { const parts = []; if (this.cpuClusterInfo.little > 0) parts.push(this.cpuClusterInfo.little); if (this.cpuClusterInfo.mid > 0) parts.push(this.cpuClusterInfo.mid); if (this.cpuClusterInfo.big > 0) parts.push(this.cpuClusterInfo.big); if (this.cpuClusterInfo.prime > 0) parts.push(this.cpuClusterInfo.prime); return parts.length === 0 ? '' : parts.join('+'); },
    getTotalCoreCount() { return this.cpuClusterInfo.little + this.cpuClusterInfo.mid + this.cpuClusterInfo.big + this.cpuClusterInfo.prime; },
    startRealtimeMonitor() {
        this.stopRealtimeMonitor();
        const schedule = (delay = this.realtimeIntervalMs) => {
            if (document.hidden || this.realtimeTimer) return;
            this.realtimeTimer = setTimeout(async () => {
                this.realtimeTimer = null;
                await this.updateRealtimeData(false);
                schedule();
            }, delay);
        };
        this._scheduleRealtimeUpdate = schedule;
        schedule();
        if (!this.realtimeVisibilityBound) {
            this.realtimeVisibilityBound = true;
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.stopRealtimeMonitor();
                    return;
                }
                this.updateRealtimeData(false).finally(() => this._scheduleRealtimeUpdate?.());
            });
        }
    },
    stopRealtimeMonitor() {
        if (!this.realtimeTimer) return;
        clearTimeout(this.realtimeTimer);
        this.realtimeTimer = null;
    },
    async awaitInitialRealtimeReady() {
        await this.updateRealtimeData(true);
    },
    async updateRealtimeData(forceHeavy) {
        if (this.realtimeBusy) return;
        this.realtimeBusy = true;
        this.realtimeTick += 1;
        try {
            const runHeavy = forceHeavy || (this.realtimeTick % 2 === 0);
            const snapshot = await this.readRealtimeSnapshot(runHeavy);
            const batteryTemp = this.updateBatteryInfo(snapshot.batteryLevel, snapshot.batteryTemp);
            const memData = this.updateMemoryInfo(snapshot.memory);
            const cpuData = this.updateCpuUsage(snapshot.cpuStat);
            let cpuTemp = 0;
            if (runHeavy) {
                this.updateSwapInfo(snapshot.swap);
                this.updateStorageInfo(snapshot.storage);
                cpuTemp = this.updateCpuTemp(snapshot.cpuTemp) || 0;
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
    },
    async readRealtimeSnapshot(includeHeavy = false) {
        const heavy = includeHeavy ? `awk '/^SwapTotal:/ { total=$2 } /^SwapFree:/ { free=$2 } END { printf "SWAP %s %s\\n", total+0, free+0 }' /proc/meminfo; df /data 2>/dev/null | awk 'END { printf "STORAGE %s %s %s\\n", $2+0, $3+0, $4+0 }'; temp=; for node in /sys/class/thermal/thermal_zone0/temp /sys/devices/virtual/thermal/thermal_zone0/temp /sys/class/hwmon/hwmon0/temp1_input; do [ -r "$node" ] || continue; read temp < "$node"; [ -n "$temp" ] && break; done; printf 'TEMP %s\\n' "\${temp:-0}";` : '';
        const command = `printf 'CPU '; sed -n '1p' /proc/stat 2>/dev/null; level=; temp=; [ -r /sys/class/power_supply/battery/capacity ] && read level < /sys/class/power_supply/battery/capacity; [ -r /sys/class/power_supply/battery/temp ] && read temp < /sys/class/power_supply/battery/temp; printf 'BATTERY %s %s\\n' "\${level:-0}" "\${temp:-0}"; awk '/^MemTotal:/ { total=$2 } /^MemAvailable:/ { available=$2 } /^MemFree:/ { free=$2 } /^Buffers:/ { buffers=$2 } /^Cached:/ { cached=$2 } END { printf "MEM %s %s %s %s %s\\n", total+0, available+0, free+0, buffers+0, cached+0 }' /proc/meminfo; ${heavy}`;
        const output = await this.exec(command);
        const snapshot = { cpuStat: '', batteryLevel: '', batteryTemp: '', memory: [], swap: [], storage: [], cpuTemp: '' };
        String(output || '').split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            const tag = parts.shift();
            if (tag === 'CPU') snapshot.cpuStat = parts.join(' ');
            else if (tag === 'BATTERY') [snapshot.batteryLevel, snapshot.batteryTemp] = parts;
            else if (tag === 'MEM') snapshot.memory = parts.map(Number);
            else if (tag === 'SWAP') snapshot.swap = parts.map(Number);
            else if (tag === 'STORAGE') snapshot.storage = parts.map(Number);
            else if (tag === 'TEMP') snapshot.cpuTemp = parts[0] || '';
        });
        return snapshot;
    },
    updateCpuUsage(stat = '') {
        const parse = (line) => {
            const parts = line.split(/\s+/).slice(1).map(Number);
            const idle = parts[3] + (parts[4] || 0);
            const total = parts.reduce((a, b) => a + b, 0);
            return { idle, total };
        };
        const current = parse(stat);
        if (!Number.isFinite(current.total) || current.total <= 0) return 0;
        if (!this.prevCpuStat) {
            this.prevCpuStat = current;
            const lastPoint = this.historyData.cpu.length ? this.historyData.cpu[this.historyData.cpu.length - 1].value : 0;
            return parseFloat((lastPoint || 0).toFixed(1));
        }
        const idleDiff = current.idle - this.prevCpuStat.idle;
        const totalDiff = current.total - this.prevCpuStat.total;
        this.prevCpuStat = current;
        return totalDiff > 0 ? ((1 - idleDiff / totalDiff) * 100) : 0;
    },
    initStaticHeader() {
        const title = document.getElementById('corona-title');
        const floatingHeader = document.getElementById('floating-header');
        const floatingTitle = floatingHeader ? floatingHeader.querySelector('.floating-header-title') : null;
        if (title && floatingTitle) floatingTitle.textContent = title.textContent;
        if (floatingHeader) floatingHeader.classList.remove('visible', 'overlay-hidden');
        if (title) title.style.opacity = '1';
        const settingsTitle = document.getElementById('corona-title-settings');
        if (settingsTitle) settingsTitle.style.opacity = '1';
    },
    scheduleDeferredInit() {
        if (this.deferredHomeReady) return;
        this.deferredHomeReady = true;
        const run = async () => {
            try {
                this.initBannerDrag();
                this.initEasterEgg();
                this.initDeviceImageInteraction();
                this.initScrollEffect();
            } catch (e) {}
        };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => setTimeout(run, 120), { timeout: 1500 });
        } else {
            setTimeout(run, 600);
        }
    },
    async ensureSettingsPageReady(silent = false) {
        if (this.settingsUiInitialized && this.settingsDataLoaded) return;
        if (this.settingsInitPromise) return this.settingsInitPromise;
        if (!silent) this.showLoading(true);
        this.settingsInitPromise = (async () => {
            if (!this.settingsUiInitialized) {
                if (typeof this.loadMemoryPageTextResources === 'function') await this.loadMemoryPageTextResources();
                if (typeof this.loadMemoryPageConfig === 'function') await this.loadMemoryPageConfig();
                if (typeof this.renderStaticOptions === 'function') this.renderStaticOptions();
                if (typeof this.initExpandableCards === 'function') this.initExpandableCards();
                if (typeof this.initThemeSelector === 'function') this.initThemeSelector();
                if (typeof this.initChangePreviewToggle === 'function') this.initChangePreviewToggle();
                if (typeof this.initSettingDescriptionToggle === 'function') this.initSettingDescriptionToggle();
                if (typeof this.initCategoryConfigVisibilityToggle === 'function') this.initCategoryConfigVisibilityToggle();
                if (typeof this.initSnapshots === 'function') this.initSnapshots();
                if (typeof this.initSliderProgress === 'function') this.initSliderProgress();
                if (typeof this.initSwapSettings === 'function') this.initSwapSettings();
                if (typeof this.initVmSettings === 'function') this.initVmSettings();
                if (typeof this.initZramWriteback === 'function') this.initZramWriteback();
                if (typeof this.initZstdLevel === 'function') this.initZstdLevel();
                if (typeof this.initZramPath === 'function') this.initZramPath();
                if (typeof this.initIoAdvancedFold === 'function') this.initIoAdvancedFold();
                this.settingsUiInitialized = true;
            }
            if (!this.settingsDataLoaded) {
                const configTasks = [
                    ['loadAllConfigs', () => this.loadAllConfigs()],
                    ['loadDualCellConfig', () => this.loadDualCellConfig()],
                    ['detectKernelFeatures', () => this.detectKernelFeatures()]
                ];
                const configResults = await Promise.allSettled(configTasks.map(([, task]) => task()));
                configResults.forEach((result, index) => {
                    if (result.status === 'rejected') console.error(`${configTasks[index][0]} failed`, result.reason);
                });
                this.initKernelFeatures();
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
    },
    ensureSettingsSectionReady(section) {
        if (!this.settingsSectionPromises) this.settingsSectionPromises = {};
        if (this.settingsSectionPromises[section]) return this.settingsSectionPromises[section];
        const load = async () => {
            if (section === 'memory-compression') {
                await Promise.all([this.detectZramFeatures(), this.loadZramStatus()]);
                return;
            }
            if (section === 'le9ec') {
                await this.ensureFeatureScript('le9ec');
                await this.loadLe9ecConfig();
                return;
            }
            if (section === 'app-policy') {
                await Promise.all([this.ensureFeatureScript('app-policy'), this.ensureFeatureScript('priority-thread')]);
                this.initPerformanceMode();
                this.initAppPolicy();
                await Promise.all([this.loadPerformanceModeConfig(), this.loadAppRulesConfig()]);
                return;
            }
            if (section === 'custom-scripts') {
                await this.ensureFeatureScript('custom-scripts');
                this.initCustomScripts();
                return;
            }
            if (section === 'system-opt') {
                await this.ensureFeatureScript('memory-opt');
                this.initSystemOpt();
                return;
            }
            if (section === 'corona-kernel') {
                await this.ensureFeatureScript('corona-kernel');
                this.initCoronaKernel();
                return;
            }
            if (section === 'app-settings') {
                await this.loadParameterSnapshots();
            }
        };
        const promise = load().catch(error => {
            delete this.settingsSectionPromises[section];
            throw error;
        });
        this.settingsSectionPromises[section] = promise;
        return promise;
    },
    updateBatteryInfo(level, temp) {
        const levelElement = document.getElementById('battery-level');
        if (levelElement) levelElement.textContent = `${level || '--'}%`;
        if (temp && !isNaN(temp)) {
            const tempC = (parseInt(temp) / 10).toFixed(1);
            const tempElement = document.getElementById('battery-temp');
            if (tempElement) tempElement.textContent = `${tempC}°C`;
            return parseFloat(tempC) || 0;
        }
        return 0;
    },
    updateCpuTemp(temp) {
        const element = document.getElementById('cpu-temp');
        if (temp && !isNaN(temp)) {
            const value = parseInt(temp);
            const tempC = (value > 1000 ? value / 1000 : value).toFixed(1);
            if (element) element.textContent = `${tempC}°C`;
            return parseFloat(tempC) || 0;
        }
        if (element) element.textContent = '--';
        return 0;
    },
    updateMemoryInfo(memory = []) {
        let [total = 0, available = 0, free = 0, buffers = 0, cached = 0] = memory;
        if (!available) available = free + buffers + cached;
        const used = Math.max(0, total - available);
        const percent = total > 0 ? ((used / total) * 100).toFixed(1) : '0';
        const totalElement = document.getElementById('mem-total');
        const usedElement = document.getElementById('mem-used');
        const availableElement = document.getElementById('mem-available');
        if (totalElement) totalElement.textContent = this.formatBytes(total * 1024);
        if (usedElement) usedElement.textContent = this.formatBytes(used * 1024);
        if (availableElement) availableElement.textContent = this.formatBytes(available * 1024);
        const progressEl = document.getElementById('mem-progress');
        if (progressEl) { progressEl.style.width = `${percent}%`; progressEl.className = `progress-fill${Number(percent) > 85 ? ' danger' : ''}`; }
        return parseFloat(percent);
    },
    updateStorageInfo(storage = []) {
        const [totalKb = 0, usedKb = 0, availableKb = 0] = storage;
        const total = totalKb * 1024;
        const used = usedKb * 1024;
        const available = availableKb * 1024;
        const percent = total > 0 ? ((used / total) * 100).toFixed(1) : 0;
        const totalEl = document.getElementById('storage-total'); const usedEl = document.getElementById('storage-used');
        const availableEl = document.getElementById('storage-available'); const progressEl = document.getElementById('storage-progress');
        if (totalEl) totalEl.textContent = this.formatBytes(total);
        if (usedEl) usedEl.textContent = this.formatBytes(used);
        if (availableEl) availableEl.textContent = this.formatBytes(available);
        if (progressEl) { progressEl.style.width = `${percent}%`; progressEl.className = `progress-fill storage${Number(percent) > 85 ? ' danger' : ''}`; }
    },
    updateSwapInfo(swap = []) {
        const [total = 0, free = 0] = swap;
        const used = total - free; const percent = total > 0 ? ((used / total) * 100).toFixed(1) : 0;
        const totalElement = document.getElementById('swap-total');
        const usedElement = document.getElementById('swap-used');
        const freeElement = document.getElementById('swap-free');
        const progressElement = document.getElementById('swap-progress');
        if (totalElement) totalElement.textContent = total > 0 ? this.formatBytes(total * 1024) : this.t('inactive');
        if (usedElement) usedElement.textContent = total > 0 ? this.formatBytes(used * 1024) : '--';
        if (freeElement) freeElement.textContent = total > 0 ? this.formatBytes(free * 1024) : '--';
        if (progressElement) progressElement.style.width = `${percent}%`;
    },
    async loadAllConfigs() {
        const tasks = [
            this.loadZramConfig(),
            this.loadIOConfig(),
            this.loadCpuGovernorConfig(),
            this.loadTCPConfig(),
            this.loadCpuCores(),
            this.loadSwapStatus()
        ];
        await Promise.all(tasks);
        await this.updateModuleDescription();
        this.updateClusterBadge();
        document.querySelectorAll('.range-slider').forEach(slider => this.updateSliderProgress(slider));
    },
    updateClusterBadge() { const badge = document.getElementById('cpu-cluster-badge'); if (badge) { badge.textContent = this.formatClusterInfo() || '--'; } },
    async detectActiveZramPath() {
        const activePath = (await this.exec(`awk 'NR > 1 && ($1 ~ /^\/dev\/block\/zram/ || $1 ~ /^\/dev\/zram/) { print $1; exit }' /proc/swaps 2>/dev/null`)).trim();
        if (activePath) {
            this.state.zramPath = activePath;
            const pathInput = document.getElementById('zram-path-input');
            if (pathInput) pathInput.value = activePath;
        }
        return activePath;
    },
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
    },
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
    },
    async loadZramConfig() {
        const config = await this.readConfig('zram.conf');
        if (config) {
            const algMatch = config.match(/algorithm=(\S+)/);
            const sizeMatch = config.match(/size=(\d+)/);
            const swapMatch = config.match(/swappiness=(\d+)/);
            const enabledMatch = config.match(/enabled=(\d)/);
            const pathMatch = config.match(/zram_path=(\S+)/);
            if (algMatch) { this.state.algorithm = algMatch[1]; this.renderAlgorithmOptions(); }
            if (sizeMatch) { this.state.zramSize = parseInt(sizeMatch[1]) / 1024 / 1024 / 1024; document.getElementById('zram-size-slider').value = this.state.zramSize; document.getElementById('zram-size-value').textContent = `${this.state.zramSize.toFixed(2)} GB`; }
            if (swapMatch) { this.state.swappiness = parseInt(swapMatch[1]); document.getElementById('swappiness-slider').value = this.state.swappiness; document.getElementById('swappiness-value').textContent = this.state.swappiness; }
            if (enabledMatch) { this.state.zramEnabled = enabledMatch[1] === '1'; document.getElementById('zram-switch').checked = this.state.zramEnabled; this.toggleZramSettings(this.state.zramEnabled); }
            if (pathMatch) {
                this.state.zramPath = pathMatch[1];
                const pathInput = document.getElementById('zram-path-input');
                if (pathInput) pathInput.value = this.state.zramPath;
            }
            for (let i = 1; i <= 3; i++) {
                const m = config.match(new RegExp(`recomp_algorithm${i}=(\S+)`));
                this.state[`recompAlgorithm${i}`] = m ? m[1] : 'none';
            }
            if (typeof this.renderRecompAlgorithmOptions === 'function') this.renderRecompAlgorithmOptions();
            const zstdMatch = config.match(/zstd_compression_level=(\d+)/);
            if (zstdMatch) {
                this.state.zstdCompressionLevel = parseInt(zstdMatch[1], 10) || 1;
                const zstdSlider = document.getElementById('zstd-level-slider');
                const zstdValue = document.getElementById('zstd-level-value');
                if (zstdSlider) { zstdSlider.value = this.state.zstdCompressionLevel; this.updateSliderProgress(zstdSlider); }
                if (zstdValue) zstdValue.textContent = this.state.zstdCompressionLevel;
            }
            this.updateZstdLevelVisibility();
        } else {
            this.state.zramEnabled = false;
            const sw = document.getElementById('zram-switch');
            if (sw) sw.checked = false;
            this.toggleZramSettings(false);
        }
        await this.loadLoopConfig(config);
        if (typeof this.updateLoopControlState === 'function') this.updateLoopControlState();
        await this.loadZramStatus();
    },
    async loadLoopConfig(legacyZramConfig = '') {
        const loopConfig = await this.readConfig('loop.conf');
        const source = loopConfig || legacyZramConfig;
        const enabledMatch = loopConfig
            ? loopConfig.match(/enabled=(\d)/)
            : source.match(/zram_writeback=(\S+)/);
        const sizeMatch = loopConfig
            ? loopConfig.match(/size_mb=(\d+)/)
            : source.match(/writeback_size_mb=(\d+)/);
        this.state.loopEnabled = loopConfig
            ? enabledMatch?.[1] === '1'
            : enabledMatch?.[1] === 'true';
        if (sizeMatch) this.state.loopSizeGb = Math.max(0.5, parseInt(sizeMatch[1], 10) / 1024);
        const toggle = document.getElementById('zram-writeback-switch');
        const slider = document.getElementById('zram-writeback-size-slider');
        const value = document.getElementById('zram-writeback-size-value');
        if (toggle) toggle.checked = this.state.loopEnabled;
        if (slider) {
            slider.value = this.state.loopSizeGb;
            this.updateSliderProgress(slider);
        }
        if (value) value.textContent = `${this.state.loopSizeGb.toFixed(1)} GB`;
        if (!loopConfig && (enabledMatch || sizeMatch)) await this.persistLoopConfig();
    },
    parseNumericList(text) {
        return String(text || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map(item => Number(item));
    },
    formatZramRatio(raw, compressed) {
        const r = Number(raw) || 0;
        const c = Number(compressed) || 0;
        if (!r || !c) return '--';
        return `${(r / c).toFixed(1)}:1`;
    },
    normalizeBackingDev(value) {
        const normalized = String(value || '')
            .trim()
            .replace(/^\/dev\/block\/\(null\)$/i, '')
            .replace(/^none$/i, '');
        return normalized || '';
    },
    formatBackingDevName(value) {
        const raw = this.normalizeBackingDev(value);
        if (!raw) return '';
        // show short loop device name: /dev/block/loop20 -> loop20
        return raw
            .replace(/^\/dev\/block\//, '')
            .replace(/^\/dev\//, '')
            .replace(/^block\//, '');
    },
    parseHybridMap(text) {
        const result = {};
        String(text || '').split('\n').forEach(line => {
            const raw = line.trim();
            if (!raw) return;
            // formats: "KEY: value KB" or "key value"
            let m = raw.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.+)$/);
            if (m) {
                result[m[1]] = m[2].trim();
                return;
            }
            m = raw.match(/^([A-Za-z0-9_\-]+)\s+(.+)$/);
            if (m) result[m[1]] = m[2].trim();
        });
        return result;
    },
    parseHybridSizeToBytes(value) {
        if (value === undefined || value === null || value === '') return 0;
        const s = String(value).trim();
        const m = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*([KMG]?B?)?$/i);
        if (!m) {
            const n = parseInt(s, 10);
            return Number.isFinite(n) ? n : 0;
        }
        let num = parseFloat(m[1]);
        const unit = (m[2] || '').toUpperCase();
        if (unit.startsWith('G')) num *= 1024 * 1024 * 1024;
        else if (unit.startsWith('M')) num *= 1024 * 1024;
        else if (unit.startsWith('K')) num *= 1024;
        return Math.round(num);
    },
    formatHybridPair(compr, orig) {
        const c = this.parseHybridSizeToBytes(compr);
        const o = this.parseHybridSizeToBytes(orig);
        if (!c && !o) return '';
        if (o > 0 && c > 0) return `${this.formatBytes(c)} / ${this.formatBytes(o)}`;
        return this.formatBytes(c || o);
    },
    summarizeHybridEnable(text) {
        const t = String(text || '').trim();
        if (!t) return '--';
        // e.g. hybridswap enable reclaim_in enable swapd enable
        const parts = [];
        if (/reclaim_in\s+enable/i.test(t) || /reclaimin\s+enable/i.test(t)) parts.push('回写');
        if (/swapd\s+enable/i.test(t)) parts.push('swapd');
        if (/hybridswap\s+enable/i.test(t)) parts.unshift('开');
        else if (/disable/i.test(t)) return '关';
        return parts.length ? parts.join('+') : t.split(/\s+/).slice(0, 3).join(' ');
    },
    isEmptyMetric(value) {
        if (value === undefined || value === null) return true;
        const s = String(value).trim();
        if (!s || s === '--' || s === '-' || s === 'none' || s === '未启用') return true;
        if (s === '0' || s === '0 B' || s === '0B' || s === '0.0 GB' || s === '0.00 GB') return true;
        if (/^R 0 B \/ W 0 B$/i.test(s)) return true;
        if (/^0 B \/ 0 B$/i.test(s)) return true;
        return false;
    },
    setMetricValue(id, value, { always = false } = {}) {
        const el = document.getElementById(id);
        if (!el) return false;
        const item = el.closest('.info-item');
        const empty = this.isEmptyMetric(value);
        // when always (runtime active), keep zero values like "0 B" visible
        const text = (!always && empty) ? '--' : (value === undefined || value === null || value === '' ? '--' : String(value));
        if (el.textContent !== text) el.textContent = text;
        if (item) {
            const hidden = always ? false : empty;
            if (item.hidden !== hidden) item.hidden = hidden;
        }
        return always || !empty;
    },
    refreshMetricCard(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;
        const items = card.querySelectorAll('.info-item');
        const visible = [...items].some(item => !item.hidden && item.style.display !== 'none');
        card.hidden = !visible;
        card.style.display = visible ? '' : 'none';
    },
    decodeSnapshotValue(value) {
        if (!value) return '';
        try { return atob(value); } catch (error) { return ''; }
    },
    async readZramStatusSnapshot(configuredPath) {
        const path = this.shellQuote(configuredPath || '/dev/block/zram0');
        const command = `emit_value() { tag="$1"; value="$2"; printf '%s ' "$tag"; printf '%s' "$value" | base64 2>/dev/null | tr -d '\\r\\n'; printf '\\n'; }; configured=${path}; active=$(awk 'NR > 1 && ($1 ~ /^\\/dev\\/block\\/zram/ || $1 ~ /^\\/dev\\/zram/) { print $1; exit }' /proc/swaps 2>/dev/null); zram_path=\${active:-$configured}; block=\${zram_path##*/}; case "$block" in zram[0-9]*) ;; *) block= ;; esac; emit_value PATH "$zram_path"; if [ -n "$block" ]; then base=/sys/block/$block; emit_value ALG "$(cat "$base/comp_algorithm" 2>/dev/null)"; emit_value SIZE "$(cat "$base/disksize" 2>/dev/null)"; emit_value MM "$(cat "$base/mm_stat" 2>/dev/null)"; emit_value BD "$(cat "$base/bd_stat" 2>/dev/null)"; emit_value BACKING "$(cat "$base/backing_dev" 2>/dev/null)"; emit_value BLOCK "$(cat "$base/stat" 2>/dev/null)"; emit_value HYB_MEM "$(cat "$base/hybridswap_meminfo" 2>/dev/null)"; emit_value HYB_SNAP "$(cat "$base/hybridswap_stat_snap" 2>/dev/null)"; emit_value HYB_VM "$(cat "$base/hybridswap_vmstat" 2>/dev/null)"; emit_value HYB_LOOP "$(cat "$base/hybridswap_loop_device" 2>/dev/null)"; emit_value HYB_ENABLE "$(cat "$base/hybridswap_enable" 2>/dev/null)"; fi; emit_value SWAPPINESS "$(cat /proc/sys/vm/swappiness 2>/dev/null)"; emit_value SWAP "$(awk -v path="$zram_path" 'NR > 1 && $1 == path { print $1, $2, $3, $4, $5; exit }' /proc/swaps 2>/dev/null)"`;
        const output = await this.exec(command);
        const values = {};
        String(output || '').split('\n').forEach(line => {
            const separator = line.indexOf(' ');
            if (separator <= 0) return;
            values[line.slice(0, separator)] = this.decodeSnapshotValue(line.slice(separator + 1).trim());
        });
        const swapParts = String(values.SWAP || '').trim().split(/\s+/);
        return {
            path: values.PATH || configuredPath || '/dev/block/zram0',
            algorithm: values.ALG || '',
            disksize: values.SIZE || '',
            swappiness: values.SWAPPINESS || '',
            mmStat: values.MM || '',
            bdStat: values.BD || '',
            backingDevice: values.BACKING || '',
            blockStat: values.BLOCK || '',
            swapInfo: swapParts.length >= 5 ? { device: swapParts[0], type: swapParts[1], size: swapParts[2], used: swapParts[3], priority: swapParts[4] } : null,
            hybrid: {
                meminfo: values.HYB_MEM || '',
                stat: values.HYB_SNAP || '',
                vmstat: values.HYB_VM || '',
                loop: values.HYB_LOOP || '',
                enabled: values.HYB_ENABLE || ''
            }
        };
    },
    async loadHybridSwapMetrics(zramBlock, metrics = {}) {
        const section = document.getElementById('hybridswap-metrics');
        if (!section) return;
        if (!zramBlock) {
            section.hidden = true;
            section.style.display = 'none';
            return;
        }
        const meminfoRaw = metrics.meminfo || '';
        const snapRaw = metrics.stat || '';
        const vmstatRaw = metrics.vmstat || '';
        const loopRaw = metrics.loop || '';
        const enableRaw = metrics.enabled || '';
        const hasNode = !!(meminfoRaw || snapRaw || enableRaw || loopRaw);
        if (!hasNode) {
            section.hidden = true;
            section.style.display = 'none';
            return;
        }
        section.hidden = false;
        section.style.display = '';

        const mem = this.parseHybridMap(meminfoRaw);
        const snap = this.parseHybridMap(snapRaw);
        const vm = this.parseHybridMap(vmstatRaw);
        const loop = String(loopRaw || '').trim();

        this.setMetricValue('hyb-loop', (loop && loop !== 'none') ? loop.replace(/^\/dev\/block\//, '').replace(/^\/dev\//, '') : '');

        const zst = this.parseHybridSizeToBytes(mem.ZST);
        const est = this.parseHybridSizeToBytes(mem.EST);
        this.setMetricValue('hyb-zst', zst > 0 ? this.formatBytes(zst) : '');
        this.setMetricValue('hyb-zsu', this.formatHybridPair(mem.ZSU_C, mem.ZSU_O));
        this.setMetricValue('hyb-est', est > 0 ? this.formatBytes(est) : '');
        this.setMetricValue('hyb-esu', this.formatHybridPair(mem.ESU_C, mem.ESU_O));

        const reclaim = this.parseHybridSizeToBytes(snap.reclaimin_bytes || snap.reclaimin_real_load);
        const batch = this.parseHybridSizeToBytes(snap.batchout_bytes || snap.batchout_real_load);
        const reclaimCnt = parseInt(snap.reclaimin_cnt || '0', 10) || 0;
        const batchCnt = parseInt(snap.batchout_cnt || '0', 10) || 0;
        this.setMetricValue('hyb-reclaimin', reclaim > 0 ? this.formatBytes(reclaim) : (reclaimCnt > 0 ? String(reclaimCnt) : ''));
        this.setMetricValue('hyb-batchout', batch > 0 ? this.formatBytes(batch) : (batchCnt > 0 ? String(batchCnt) : ''));

        const wakeup = parseInt(vm.swapd_wakeup || '0', 10) || 0;
        this.setMetricValue('hyb-swapd-wakeup', wakeup > 0 ? String(wakeup) : '');

        this.refreshMetricCard('hybridswap-metrics');
    },
    async loadZramStatus() {
        if (this.zramStatusBusy) return;
        this.zramStatusBusy = true;
        try {
            return await this.loadZramStatusSnapshot();
        } finally {
            this.zramStatusBusy = false;
        }
    },
    async loadZramStatusSnapshot() {
        const snapshot = await this.readZramStatusSnapshot(this.state.zramPath);
        const zramPath = snapshot.path || this.state.zramPath;
        if (zramPath && zramPath !== this.state.zramPath) {
            this.state.zramPath = zramPath;
            const pathInput = document.getElementById('zram-path-input');
            if (pathInput) pathInput.value = zramPath;
        }
        const zramBlock = this.getZramBlockName(zramPath);
        const pageSize = 4096;
        const algRaw = snapshot.algorithm;
        const disksize = snapshot.disksize;
        const swappiness = snapshot.swappiness;
        const swapInfo = snapshot.swapInfo;
        const mmStatRaw = snapshot.mmStat;
        const bdStatRaw = snapshot.bdStat;
        const backingDevRaw = snapshot.backingDevice;
        const blockStatRaw = snapshot.blockStat;
        const currentAlg = algRaw.match(/\[([^\]]+)\]/)?.[1] || algRaw.split(' ')[0] || '--';
        const sizeGB = disksize ? (parseInt(disksize) / 1024 / 1024 / 1024).toFixed(1) : '0';
        const swappinessValue = parseInt((swappiness || '').trim(), 10);
        this.setMetricValue('zram-current-alg', currentAlg && currentAlg !== '--' ? currentAlg : '', { always: true });
        this.setMetricValue('zram-current-size', disksize && parseInt(disksize, 10) > 0 ? `${sizeGB} GB` : '', { always: true });
        this.setMetricValue('zram-current-swappiness', (swappiness || '').trim() || '', { always: true });
        this.setMetricValue('zram-current-path', zramPath || '', { always: true });

        // mm_stat / bd_stat — hide empties
        const mmStat = this.parseNumericList(mmStatRaw);
        const bdStat = this.parseNumericList(bdStatRaw);
        const rawDataSize = Number(mmStat[0] || 0);
        const compressedSize = Number(mmStat[1] || 0);
        const physicalMemoryUsed = Number(mmStat[2] || 0);
        const compressionRatio = this.formatZramRatio(rawDataSize, compressedSize);
        const backingDevice = this.normalizeBackingDev(backingDevRaw);
        const bdRead = Number(bdStat[1] || 0) * pageSize;
        const bdWrite = Number(bdStat[2] || 0) * pageSize;

        // block layer stat: read_sectors / write_sectors (512-byte units)
        const blockStat = this.parseNumericList(blockStatRaw);
        const totalReadBytes = Number(blockStat[2] || 0) * 512;
        const totalWriteBytes = Number(blockStat[6] || 0) * 512;
        const bdCount = Number(bdStat[0] || 0);

        const runtime = !!(disksize && parseInt(disksize, 10) > 0);
        const swapSizeBytes = Number(swapInfo?.size || 0) * 1024;
        const swapUsedBytes = Number(swapInfo?.used || 0) * 1024;
        const swapUsedPercent = swapSizeBytes > 0 ? Math.min(100, (swapUsedBytes / swapSizeBytes) * 100) : 0;
        const overviewState = document.getElementById('zram-overview-state');
        const overviewUsed = document.getElementById('zram-overview-used');
        const overviewMemory = document.getElementById('zram-overview-memory');
        const overviewRatio = document.getElementById('zram-overview-ratio');
        const overviewBacking = document.getElementById('zram-overview-backing');
        const overviewProgress = document.getElementById('zram-overview-progress');
        if (overviewState) overviewState.textContent = swapInfo ? this.t('active') : this.t('inactive');
        if (overviewUsed) overviewUsed.textContent = swapSizeBytes > 0 ? `${this.formatBytes(swapUsedBytes)} / ${this.formatBytes(swapSizeBytes)}` : '--';
        if (overviewMemory) overviewMemory.textContent = physicalMemoryUsed > 0 ? this.formatBytes(physicalMemoryUsed) : '--';
        if (overviewRatio) overviewRatio.textContent = compressionRatio !== '--' ? compressionRatio : '--';
        if (overviewBacking) overviewBacking.textContent = backingDevice ? this.formatBackingDevName(backingDevice) : this.t('none');
        if (overviewProgress) overviewProgress.style.width = `${swapUsedPercent.toFixed(1)}%`;
        const opt = { always: runtime };
        this.setMetricValue('zram-raw-size', this.formatBytes(rawDataSize), opt);
        this.setMetricValue('zram-compr-size', this.formatBytes(compressedSize), opt);
        this.setMetricValue('zram-mem-used', this.formatBytes(physicalMemoryUsed), opt);
        this.setMetricValue('zram-compr-ratio', compressionRatio !== '--' ? compressionRatio : '0:1', opt);
        this.setMetricValue('zram-total-reads', this.formatBytes(totalReadBytes), opt);
        this.setMetricValue('zram-total-writes', this.formatBytes(totalWriteBytes), opt);
        this.setMetricValue('zram-backing-dev', (backingDevice && backingDevice !== '--') ? this.formatBackingDevName(backingDevice) : '');
        const hasWb = !!(backingDevice || (bdStatRaw && String(bdStatRaw).trim()));
        const wbOpt = { always: hasWb };
        this.setMetricValue('zram-bd-count', hasWb ? `${bdCount} 页` : '', wbOpt);
        this.setMetricValue('zram-bd-read', hasWb ? this.formatBytes(bdRead) : '', wbOpt);
        this.setMetricValue('zram-bd-write', hasWb ? this.formatBytes(bdWrite) : '', wbOpt);
        this.refreshMetricCard('zram-status-card');

        const isActive = !!swapInfo;
        const runtimeInfo = {
            currentAlg,
            sizeBytes: parseInt(disksize || '0', 10) || 0,
            swappinessValue,
            isActive,
            path: zramPath,
            compressionRatio,
            physicalMemoryUsed
        };
        if (!this.state.zramEnabled) this.syncZramControlsFromRuntime(runtimeInfo);

        const statusEl = document.getElementById('zram-status');
        if (statusEl) {
            if (!isActive) statusEl.textContent = this.t('inactive');
            else statusEl.textContent = (currentAlg && currentAlg !== '--') ? currentAlg : '--';
        }
        const memBadge = document.getElementById('memory-compression-badge');
        if (memBadge) {
            if (!isActive) memBadge.textContent = this.t('unconfigured');
            else memBadge.textContent = this.t(this.state.zramEnabled ? 'moduleManagedZram' : 'systemManagedZram');
        }

        await this.loadHybridSwapMetrics(zramBlock, snapshot.hybrid);
        this.updateZramModeHint(this.state.zramEnabled ? 'module' : (isActive ? 'system' : 'off'), runtimeInfo);
    },
    startZramMetricsRefresh(intervalMs = 8000) {
        this.stopZramMetricsRefresh();
        if (!this.zramMetricsVisibilityBound) {
            this.zramMetricsVisibilityBound = true;
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) return;
                const content = document.getElementById('zram-content');
                if (content && content.classList.contains('expanded') && typeof this.loadZramStatus === 'function') {
                    this.loadZramStatus().finally(() => this._scheduleZramMetrics?.());
                }
            });
        }
        // let expand animation start before shell reads
        setTimeout(() => {
            if (typeof this.loadZramStatus === 'function') this.loadZramStatus();
        }, 60);
        const schedule = () => {
            if (this.zramMetricsTimer || document.hidden) return;
            this.zramMetricsTimer = setTimeout(async () => {
                this.zramMetricsTimer = null;
                const content = document.getElementById('zram-content');
                if (!content || !content.classList.contains('expanded')) return;
                if (document.hidden) return;
                await this.loadZramStatus();
                schedule();
            }, intervalMs);
        };
        this._scheduleZramMetrics = schedule;
        schedule();
    },
    stopZramMetricsRefresh() {
        if (this.zramMetricsTimer) {
            clearTimeout(this.zramMetricsTimer);
            this.zramMetricsTimer = null;
        }
    },
    async detectZramFeatures() {
        if (!this.zramFeatures) this.zramFeatures = { multiComp: false, zstdLevel: false, writebackControl: false, writebackMode: 'none' };
        const zramBlock = this.getZramBlockName(this.state.zramPath) || 'zram0';
        const [recompNode, zstdNode, writebackNode] = await Promise.all([
            this.exec(`[ -f /sys/block/${zramBlock}/recomp_algorithm ] && echo 1 || echo 0`),
            this.exec('[ -f /sys/module/zstd/parameters/compression_level ] && echo 1 || echo 0'),
            this.exec(`if [ ! -x /product/bin/nandswap_tool ]; then echo none; elif [ -f /sys/block/${zramBlock}/hybridswap_loop_device ]; then echo hybrid; elif [ -f /sys/block/${zramBlock}/backing_dev ] && [ -f /sys/block/${zramBlock}/writeback_limit_enable ]; then echo standard; else echo none; fi`)
        ]);
        this.zramFeatures.multiComp = (recompNode || '').trim() === '1';
        this.zramFeatures.zstdLevel = (zstdNode || '').trim() === '1';
        this.zramFeatures.writebackMode = (writebackNode || '').trim() || 'none';
        this.zramFeatures.writebackControl = this.zramFeatures.writebackMode !== 'none';
        if (typeof this.renderRecompAlgorithmOptions === 'function') this.renderRecompAlgorithmOptions();
        this.updateZstdLevelVisibility();
        if (typeof this.updateLoopControlState === 'function') this.updateLoopControlState();
        return this.zramFeatures;
    },
    usesZstdAlgorithm() {
        const algs = [
            this.state.algorithm,
            this.state.recompAlgorithm1,
            this.state.recompAlgorithm2,
            this.state.recompAlgorithm3
        ].map(a => String(a || '').toLowerCase());
        return algs.some(a => a === 'zstd' || a.startsWith('zstd'));
    },
    updateZstdLevelVisibility() {
        const section = document.getElementById('zstd-level-section');
        if (!section) return;
        const supported = !!(this.zramFeatures && this.zramFeatures.zstdLevel);
        const needed = this.usesZstdAlgorithm();
        const show = !!(supported && needed);
        section.hidden = !show;
        section.style.display = show ? '' : 'none';
        section.setAttribute('aria-hidden', show ? 'false' : 'true');
    },
    initZstdLevel() {
        const slider = document.getElementById('zstd-level-slider');
        const valueEl = document.getElementById('zstd-level-value');
        if (!slider || slider.dataset.bound) return;
        slider.dataset.bound = '1';
        slider.addEventListener('input', (e) => {
            slider.dataset.userTouched = '1';
            this.state.zstdCompressionLevel = parseInt(e.target.value, 10) || 1;
            if (valueEl) valueEl.textContent = this.state.zstdCompressionLevel;
            this.updateSliderProgress(slider);
        });
        slider.addEventListener('change', (e) => {
            slider.dataset.userTouched = '1';
            this.state.zstdCompressionLevel = parseInt(e.target.value, 10) || 1;
            if (valueEl) valueEl.textContent = this.state.zstdCompressionLevel;
            this.markZramDirty();
        });
    },
    markZramDirty() {
        this._zramDirty = true;
        const btn = document.getElementById('zram-apply-btn');
        if (btn && !btn.dataset.dirtyHint) {
            btn.dataset.dirtyHint = '1';
            btn.textContent = this.t('applyZramDirty');
        }
        this.persistZramConfig().catch(() => this.showToast('ZRAM 配置保存失败'));
    },
    clearZramDirty() {
        this._zramDirty = false;
        const btn = document.getElementById('zram-apply-btn');
        if (btn) {
            btn.dataset.dirtyHint = '';
            btn.textContent = this.t('applyZram');
        }
    },
    markSwapDirty() {
        this._swapDirty = true;
        const btn = document.getElementById('swap-apply-btn');
        if (btn) btn.textContent = '应用 Swap 配置 *';
        this.persistSwapConfig().catch(() => this.showToast('Swap 配置保存失败'));
    },
    clearSwapDirty() {
        this._swapDirty = false;
        const btn = document.getElementById('swap-apply-btn');
        if (btn) btn.textContent = '应用 Swap 配置';
    },
    getZramFieldUpdates(changedField = 'zram') {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const field = changedField || 'zram';
        const updates = {};
        if (field === 'zram' || field === 'enabled') updates.enabled = this.state.zramEnabled ? '1' : '0';
        if (field === 'zram' || field === 'algorithm') updates.algorithm = this.state.algorithm;
        if (field === 'zram' || field === 'zstd_compression_level') updates.zstd_compression_level = String(this.state.zstdCompressionLevel || 1);
        if (field === 'zram' || field === 'recomp_algorithm1' || field === 'recomp_algorithm2' || field === 'recomp_algorithm3') {
            updates.recomp_algorithm1 = this.state.recompAlgorithm1 || 'none';
            updates.recomp_algorithm2 = this.state.recompAlgorithm2 || 'none';
            updates.recomp_algorithm3 = this.state.recompAlgorithm3 || 'none';
        }
        if (field === 'zram' || field === 'size') updates.size = String(sizeBytes);
        if (field === 'zram' || field === 'swappiness') updates.swappiness = String(this.state.swappiness);
        if (field === 'zram' || field === 'zram_path') updates.zram_path = this.state.zramPath;
        return updates;
    },
    getZramConfigKeys() {
        return ['enabled', 'algorithm', 'recomp_algorithm1', 'recomp_algorithm2', 'recomp_algorithm3', 'zstd_compression_level', 'size', 'swappiness', 'zram_path'];
    },
    persistLoopConfig() {
        const save = this.withLock('loop-config', async () => {
            const updates = {
                enabled: this.state.loopEnabled ? '1' : '0',
                size_mb: String(Math.round(this.state.loopSizeGb * 1024))
            };
            await this.mergeConfigFile('loop.conf', updates, ['enabled', 'size_mb']);
            await this.removeConfigKeys('zram.conf', ['zram_writeback', 'writeback_size_mb'], this.getZramConfigKeys());
            return true;
        });
        this._loopConfigSavePromise = save;
        return save;
    },
    async applyLoopImmediate(action) {
        return this.withLock('loop-apply', async () => {
            const command = action === 'stop' ? 'stop' : 'start';
            const button = document.getElementById('zram-loop-action');
            let succeeded = false;
            try {
                if (command === 'start') this.state.loopEnabled = true;
                await this.persistLoopConfig();
                if (button) button.disabled = true;
                this.showLoading(true);
                const script = this.shellQuote(`${this.modDir}/scripts/apply-loop.sh`);
                const result = await this.execResult(`/system/bin/sh ${script} ${command}`);
                await this.refreshZramLoopDevice(false, true);
                succeeded = result.code === 0 && (command === 'stop' ? !this._loopActive : this._loopActive);
            } catch (error) {
                try { await this.refreshZramLoopDevice(false, true); } catch (refreshError) {}
            } finally {
                this.showLoading(false);
                if (button) button.disabled = !this.zramFeatures?.writebackControl;
            }
            this.showToast(this.t(succeeded
                ? (command === 'stop' ? 'loopStopped' : 'loopStarted')
                : (command === 'stop' ? 'loopStopFailed' : 'loopStartFailed')), succeeded ? 'success' : 'error');
            return succeeded;
        });
    },
    persistZramConfig(changedField = 'zram') {
        const save = this.withLock('zram-config', async () => {
            await this.mergeConfigFile('zram.conf', this.getZramFieldUpdates(changedField), this.getZramConfigKeys());
            await this.updateModuleDescription();
            return true;
        });
        this._zramConfigSavePromise = save;
        return save;
    },
    async saveZramConfig(changedField = 'zram', skipPreview = false) {
        const config = await this.buildMergedConfigContent('zram.conf', this.getZramFieldUpdates(changedField), this.getZramConfigKeys());
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
        await this.persistZramConfig(changedField);
        this.showToast('ZRAM 配置已保存');
        return true;
    },
    async verifyZramApplyResult(options = {}) {
        const expectAlg = options.algorithm !== undefined ? options.algorithm : this.state.algorithm;
        const expectSize = options.sizeBytes !== undefined ? options.sizeBytes : Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const expectSwap = options.swappiness !== undefined ? options.swappiness : this.state.swappiness;
        const expectZstd = options.zstdLevel !== undefined ? options.zstdLevel : this.state.zstdCompressionLevel;
        const checkAlg = options.checkAlgorithm !== false;
        const checkSize = options.checkSize !== false;
        const checkSwap = options.checkSwappiness !== false;
        const checkZstd = options.checkZstd === true || (this.usesZstdAlgorithm && this.usesZstdAlgorithm() && this.zramFeatures && this.zramFeatures.zstdLevel);

        // wait a bit for nandswap/mm-sys chain to settle
        await this.sleep(options.delayMs || 800);

        const zramPath = await this.detectActiveZramPath() || this.state.zramPath;
        const zramBlock = this.getZramBlockName(zramPath);
        if (!zramBlock) {
            this.showToast('ZRAM 校验失败：未找到活动设备');
            return false;
        }

        const mismatches = [];
        const [algRaw, disksizeRaw, swapRaw, zstdRaw, recompRaw] = await Promise.all([
            this.exec(`cat /sys/block/${zramBlock}/comp_algorithm 2>/dev/null`),
            this.exec(`cat /sys/block/${zramBlock}/disksize 2>/dev/null`),
            this.exec('cat /proc/sys/vm/swappiness 2>/dev/null'),
            checkZstd ? this.exec('cat /sys/module/zstd/parameters/compression_level 2>/dev/null') : Promise.resolve(''),
            this.zramFeatures && this.zramFeatures.multiComp
                ? this.exec(`cat /sys/block/${zramBlock}/recomp_algorithm 2>/dev/null`)
                : Promise.resolve('')
        ]);

        if (checkAlg && expectAlg) {
            const currentAlg = (algRaw.match(/\[([^\]]+)\]/)?.[1] || algRaw.split(/\s+/)[0] || '').replace(/^kernel:/, '');
            const want = String(expectAlg).replace(/^kernel:/, '');
            if (currentAlg && currentAlg !== want) {
                mismatches.push(`算法 ${currentAlg}≠${want}`);
            }
        }

        if (checkSize && expectSize) {
            const now = parseInt(String(disksizeRaw || '').trim(), 10) || 0;
            // allow 1MB tolerance
            if (now > 0 && Math.abs(now - expectSize) > 1024 * 1024) {
                const nowGb = (now / 1024 / 1024 / 1024).toFixed(2);
                const wantGb = (expectSize / 1024 / 1024 / 1024).toFixed(2);
                mismatches.push(`大小 ${nowGb}G≠${wantGb}G`);
            }
        }

        if (checkSwap && expectSwap !== undefined && expectSwap !== null && expectSwap !== '') {
            const now = parseInt(String(swapRaw || '').trim(), 10);
            const want = parseInt(expectSwap, 10);
            if (Number.isFinite(now) && Number.isFinite(want) && now !== want) {
                mismatches.push(`swappiness ${now}≠${want}`);
            }
        }

        if (checkZstd && expectZstd !== undefined && expectZstd !== null && expectZstd !== '') {
            const now = parseInt(String(zstdRaw || '').trim(), 10);
            const want = parseInt(expectZstd, 10);
            if (Number.isFinite(now) && Number.isFinite(want) && now !== want) {
                mismatches.push(`zstd ${now}≠${want}`);
            }
        }

        // soft check recomp: if configured non-none, recomp node should mention algo (best-effort)
        if (this.zramFeatures && this.zramFeatures.multiComp) {
            for (let i = 1; i <= 3; i++) {
                const want = this.state[`recompAlgorithm${i}`];
                if (!want || want === 'none') continue;
                const raw = String(recompRaw || '');
                if (raw && raw.indexOf(want) < 0 && !new RegExp(`#${i}.*${want}|${want}.*#${i}`).test(raw)) {
                    // many kernels only show current selected recomp format differently; warn lightly
                    // skip hard fail if recomp node empty after apply (common when busy)
                    if (raw.trim()) mismatches.push(`重压缩${i} 未见 ${want}`);
                }
            }
        }

        if (mismatches.length) {
            this.showToast(`ZRAM 部分未生效: ${mismatches.join(' / ')}`);
            return false;
        }
        if (options.toastSuccess) this.showToast(options.toastSuccess);
        return true;
    },
    async applyZramImmediate(manageLoading = true) {
      return this.withLock('zram', async () => {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const requestedAlgorithm = this.state.algorithm;
        await this.persistZramConfig('zram');
        if (manageLoading) {
            this.showLoading(true);
            await this.sleep(0);
        }
        await this.exec(`/system/bin/sh ${this.modDir}/scripts/apply-zram.sh >/dev/null 2>&1`);
        const savedAlgorithm = (await this.exec(`sed -n 's/^algorithm=//p' ${this.shellQuote(`${this.configDir}/zram.conf`)} 2>/dev/null | head -n1`)).trim();
        const fallbackApplied = !!(savedAlgorithm && savedAlgorithm !== requestedAlgorithm);
        if (fallbackApplied) {
            this.state.algorithm = savedAlgorithm;
            if (typeof this.renderAlgorithmOptions === 'function') this.renderAlgorithmOptions();
        }
        if (typeof this.clearZramDirty === 'function') this.clearZramDirty();
        if (manageLoading) this.showLoading(false);
        if (!this.state.zramEnabled) {
            this.showToast('ZRAM 已恢复系统默认配置');
            setTimeout(() => this.loadZramStatus(), 200);
            return true;
        }
        const ok = await this.verifyZramApplyResult({
            algorithm: this.state.algorithm,
            sizeBytes: sizeBytes,
            swappiness: this.state.swappiness,
            zstdLevel: this.state.zstdCompressionLevel,
            checkZstd: !!(this.usesZstdAlgorithm && this.usesZstdAlgorithm())
        });
        if (ok) {
            this.showToast(fallbackApplied
                ? `${requestedAlgorithm} 不受支持，已回退 ${savedAlgorithm}`
                : 'ZRAM 配置已应用并校验');
        }
        setTimeout(() => this.loadZramStatus(), 300);
        return ok;
      });
    },
    async applySwappinessImmediate(skipPreview = false) {
      return this.withLock('zram', async () => {
        const config = await this.buildMergedConfigContent('zram.conf', this.getZramFieldUpdates('swappiness'), this.getZramConfigKeys());
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将通过官方初始化链更新 ZRAM Swappiness。',
                configs: [{ filename: 'zram.conf', content: config }],
                actions: ['执行模块内 apply-zram helper', '官方初始化后由模块 mm-sys 只覆写 swappiness'],
                notes: ['不会替你补全其它未设置的 ZRAM 参数。']
            }, {
                onCancel: () => this.loadZramConfig()
            });
            if (!confirmed) return false;
        }
        this.showLoading(true);
        await this.sleep(0);
        await this.mergeConfigFile('zram.conf', this.getZramFieldUpdates('swappiness'), this.getZramConfigKeys());
        await this.exec(`/system/bin/sh ${this.modDir}/scripts/apply-zram.sh >/dev/null 2>&1`);
        await this.updateModuleDescription();
        this.showLoading(false);
        const ok = await this.verifyZramApplyResult({
            checkAlgorithm: false,
            checkSize: false,
            checkSwappiness: true,
            checkZstd: false,
            swappiness: this.state.swappiness
        });
        if (ok) this.showToast('Swappiness 已更新并校验');
        setTimeout(() => this.loadZramStatus(), 300);
        return ok;
      });
    },
    async loadIOConfig() {
        const preferred = await this.getPreferredBlockDevice();
        const schedulerRaw = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/scheduler 2>/dev/null`) : '';
        const readahead = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/read_ahead_kb 2>/dev/null`) : '';
        const nrRequests = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/nr_requests 2>/dev/null`) : '';
        const rqAffinity = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/rq_affinity 2>/dev/null`) : '';
        const nomerges = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/nomerges 2>/dev/null`) : '';
        const iostats = preferred ? await this.exec(`cat /sys/block/${preferred}/queue/iostats 2>/dev/null`) : '';
        const conf = await this.readConfig('io_scheduler.conf');
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
    },
    async applyIOSchedulerImmediate(skipPreview = false) {
        return this.applyIOConfigImmediate('scheduler', skipPreview);
    },
    async loadCpuGovernorConfig() {
        const governorRaw = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors 2>/dev/null');
        const currentGovernor = await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null');
        const conf = await this.readConfig('cpu_governor.conf');
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
                    await this.applyCpuGovernorImmediate('governor');
                });
            });
        }
        const currentEl = document.getElementById('cpu-gov-current');
        if (currentEl) currentEl.textContent = this.state.cpuEnabled ? (this.state.cpuGovernor || '--') : '已禁用';
    },
    async applyCpuGovernorImmediate(changedField = 'governor', skipPreview = false) {
      return this.withLock('governor', async () => {
        const updates = {};
        if (changedField === 'governor' || changedField === 'cpu' || changedField === 'enabled') updates.enabled = this.state.cpuEnabled ? '1' : '0';
        if (changedField === 'governor' || changedField === 'cpu') updates.governor = this.state.cpuGovernor;
        const config = await this.buildMergedConfigContent('cpu_governor.conf', updates, ['enabled', 'governor']);
        const writes = [];
        if ((changedField === 'governor' || changedField === 'cpu') && this.state.cpuEnabled) {
            writes.push({ path: '/sys/devices/system/cpu/cpu*/cpufreq/scaling_governor', value: this.state.cpuGovernor });
        }
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将应用 CPU 调频器。',
                configs: [{ filename: 'cpu_governor.conf', content: config }],
                writes
            }, {
                onCancel: () => this.loadCpuGovernorConfig()
            });
            if (!confirmed) return false;
        }
        if (!this.state.cpuEnabled) {
            await this.mergeConfigFile('cpu_governor.conf', updates, ['enabled', 'governor']);
            await this.updateModuleDescription();
            this.showToast('CPU 配置已保存（禁用状态）');
            return true;
        }
        if (changedField === 'governor' || changedField === 'cpu') await this.exec(`for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo "${this.state.cpuGovernor}" > "$f" 2>/dev/null; done`);
        const readback = (await this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null')).trim();
        await this.mergeConfigFile('cpu_governor.conf', updates, ['enabled', 'governor']);
        await this.updateModuleDescription();
        document.getElementById('cpu-gov-current').textContent = readback || this.state.cpuGovernor;
        if (readback && readback !== this.state.cpuGovernor) {
            this.showToast(`CPU 调频器写入未生效（当前: ${readback}）`);
        } else {
            this.showToast(`CPU 调频器: ${this.state.cpuGovernor}`);
        }
        return true;
      });
    },
    async loadTCPConfig() {
        const tcpRaw = await this.exec('cat /proc/sys/net/ipv4/tcp_available_congestion_control 2>/dev/null');
        const currentTcp = await this.exec('cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null');
        const conf = await this.readConfig('tcp.conf');
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
                await this.applyTcpImmediate('congestion');
            });
        });
        document.getElementById('tcp-current').textContent = this.state.tcpEnabled ? (this.state.tcp || '--') : '已禁用';
    },
    async applyTcpImmediate(changedField = 'congestion', skipPreview = false) {
      return this.withLock('tcp', async () => {
        const updates = {};
        if (changedField === 'congestion' || changedField === 'tcp' || changedField === 'enabled') updates.enabled = this.state.tcpEnabled ? '1' : '0';
        if (changedField === 'congestion' || changedField === 'tcp') updates.congestion = this.state.tcp;
        const config = await this.buildMergedConfigContent('tcp.conf', updates, ['enabled', 'congestion']);
        const writes = [];
        if ((changedField === 'congestion' || changedField === 'tcp') && this.state.tcpEnabled) {
            writes.push({ path: '/proc/sys/net/ipv4/tcp_congestion_control', value: this.state.tcp });
        }
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将应用 TCP 拥塞算法。',
                configs: [{ filename: 'tcp.conf', content: config }],
                writes
            }, {
                onCancel: () => this.loadTCPConfig()
            });
            if (!confirmed) return false;
        }
        if (!this.state.tcpEnabled) {
            await this.mergeConfigFile('tcp.conf', updates, ['enabled', 'congestion']);
            await this.updateModuleDescription();
            this.showToast('TCP 配置已保存（禁用状态）');
            return true;
        }
        const ok = (changedField === 'congestion' || changedField === 'tcp') ? await this.writeAndVerifySysfs(this.state.tcp, '/proc/sys/net/ipv4/tcp_congestion_control', 'TCP 拥塞算法') : true;
        await this.mergeConfigFile('tcp.conf', updates, ['enabled', 'congestion']);
        await this.updateModuleDescription();
        document.getElementById('tcp-current').textContent = this.state.tcp;
        if (ok) this.showToast(`TCP 拥塞算法: ${this.state.tcp}`);
        return ok;
      });
    },
    async loadCpuCores() {
        const cpuCount = parseInt(await this.exec('ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null | wc -l')) || 8;
        const totalCores = this.getTotalCoreCount();
        const maxCores = totalCores > 0 ? totalCores : cpuCount;
        const hotplugConf = await this.readConfig('cpu_hotplug.conf');
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
    },
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
    },
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
    },
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
    },
    async saveCpuHotplugConfig() {
        const config = this.cpuCores.map(c => `cpu${c.id}=${c.online ? '1' : '0'}`).join('\n');
        await this.writeConfig('cpu_hotplug.conf', config);
    },
    async applyCpuHotplugConfigImmediate() {
        const writes = this.cpuCores.filter(core => core.id !== 0).map(core => this.exec(`echo ${core.online ? '1' : '0'} > /sys/devices/system/cpu/cpu${core.id}/online 2>/dev/null`));
        if (writes.length > 0) await Promise.all(writes);
        await this.saveCpuHotplugConfig();
        return true;
    },
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
    },
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },
    showToast(message, type = '') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        const text = this.localizeMessage(String(message || ''));
        let resolvedType = type;
        if (!resolvedType) {
            if (/失败|错误|无法|不足|未生效|failed|error|unable|insufficient/i.test(text)) resolvedType = 'error';
            else if (/不支持|请先|警告|未检测|不存在|unsupported|warning|not found/i.test(text)) resolvedType = 'warning';
            else if (/成功|已保存|已应用|已启用|已关闭|完成|success|saved|applied|enabled|disabled|complete/i.test(text)) resolvedType = 'success';
            else resolvedType = 'info';
        }
        if (this._toastTimer) clearTimeout(this._toastTimer);
        toast.classList.remove('info', 'success', 'warning', 'error', 'language', 'show');
        toast.textContent = text;
        toast.classList.add(resolvedType, 'show');
        this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
    },
    isRollbackAnimVisible(el) {
        if (!el) return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    },
    collectRollbackAnimationTargets(explicitTargets = null) {
        if (explicitTargets && explicitTargets.length) {
            return explicitTargets.flatMap(target => {
                if (!target) return [];
                if (typeof target === 'string') return Array.from(document.querySelectorAll(target));
                return [target];
            }).filter(el => this.isRollbackAnimVisible(el));
        }
        const selectors = [
            '.option-item.selected',
            '.io-option.selected',
            '.thread-mode-chip.active',
            '.thread-rule-section.active',
            '.algorithm-option.selected',
            '.switch input:checked + .slider',
            '.switch input:not(:checked) + .slider',
            '.range-slider',
            'select.thread-rule-select',
            '#app-policy-content .summary-chip.active'
        ];
        return Array.from(document.querySelectorAll(selectors.join(','))).filter(el => this.isRollbackAnimVisible(el));
    },
    playRollbackAnimation(targets = null) {
        const elements = this.collectRollbackAnimationTargets(targets);
        elements.forEach(el => {
            const node = el.matches('.range-slider') ? (el.closest('.priority-nice-slider-container, .slider-container') || el) : el;
            node.classList.remove('rollback-animate', 'rollback-animate-soft');
            void node.offsetWidth;
            node.classList.add(node.matches('.switch .slider, .priority-nice-slider-container, .slider-container') ? 'rollback-animate-soft' : 'rollback-animate');
            setTimeout(() => node.classList.remove('rollback-animate', 'rollback-animate-soft'), 340);
        });
    },
    showInitOverlay(show, message = '正在初始化，请稍候...') {
        const el = document.getElementById('loading');
        const text = el ? el.querySelector('.loading-text') : null;
        if (!el) return;
        if (show) {
            document.body.classList.remove('app-ready');
            document.body.classList.add('init-lock', 'app-booting');
            el.classList.add('init-mode');
            if (text) text.textContent = message;
            el.classList.add('show');
        } else {
            el.classList.remove('init-mode');
            if (text) text.textContent = this.t('processing');
            el.classList.remove('show');
            document.body.classList.remove('init-lock', 'app-booting');
            document.body.classList.add('app-ready');
        }
    },
    updateInitOverlayMessage(message) {
        const text = document.getElementById('loading')?.querySelector('.loading-text');
        if (text) text.textContent = message || this.t('initDefault');
    },
    showUnsupportedDevice(brand) {
        document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;padding:24px;text-align:center;font-family:system-ui,sans-serif">
            <div><h2 style="color:#e53935;margin-bottom:12px">${this.t('unsupportedTitle')}</h2>
            <p style="color:#666;font-size:14px">${this.t('unsupportedBody')}<br>Brand: ${brand}</p></div></div>`;
    },
    showLoading(show) {
        if (this.isInitializing) return;
        const el = document.getElementById('loading');
        if (el) el.classList.toggle('show', show);
    },
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
    },
    initEasterEgg() {
        if (this._easterEggBound) return;
        const banner = document.querySelector('.banner-image');
        const authorCard = document.getElementById('author-card');
        const overlay = document.getElementById('easter-egg-overlay');
        const card = document.getElementById('easter-egg-card');
        if (!overlay || !card) return;
        this._easterEggBound = true;

        if (banner && !banner.dataset.easterBound) {
            banner.dataset.easterBound = '1';
            banner.addEventListener('click', () => this.showEasterEgg());
        }

        const authorLinkBtn = document.getElementById('author-link-btn');
        if (authorLinkBtn && !authorLinkBtn.dataset.bound) {
            authorLinkBtn.dataset.bound = '1';
            authorLinkBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openExternalUrl('https://github.com/wswzgdg');
            });
        }

        if (authorCard && !authorCard.dataset.easterBound) {
            authorCard.dataset.easterBound = '1';
            authorCard.addEventListener('click', (e) => {
                // ignore clicks on the external link button
                if (e.target && e.target.closest && e.target.closest('#author-link-btn')) return;
                this.showCreditsCard();
            });
        }

        // touch drag on card
        let cardTouchStartX = 0, cardTouchStartY = 0, cardOffsetX = 0, cardOffsetY = 0;
        card.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            cardTouchStartX = touch.clientX;
            cardTouchStartY = touch.clientY;
            card.style.transition = 'none';
        }, { passive: true });
        card.addEventListener('touchmove', (e) => {
            if (!this.easterEgg.isOverlayOpen) return;
            const touch = e.touches[0];
            cardOffsetX = Math.max(-20, Math.min(20, (touch.clientX - cardTouchStartX) * 0.15));
            cardOffsetY = Math.max(-20, Math.min(20, (touch.clientY - cardTouchStartY) * 0.15));
            card.style.transform = `scale(1) translate(${cardOffsetX}px, ${cardOffsetY}px)`;
        }, { passive: true });
        card.addEventListener('touchend', () => {
            card.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
            card.style.transform = 'scale(1) translate(0, 0)';
            cardOffsetX = 0;
            cardOffsetY = 0;
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hideEasterEgg();
        });
    },
    showEasterEgg() {
        const overlay = document.getElementById('easter-egg-overlay');
        const content = document.getElementById('easter-egg-content');
        if (!overlay || !content) return;
        this.easterEgg.currentCard = 'thanks';
        this.easterEgg.isOverlayOpen = true;
        content.innerHTML = `<div class="rainbow-text">感谢使用<span class="corona-c-rainbow">C</span>orona模块</div><div class="rainbow-text ciallo">Ciallo~(∠・ω< )⌒★</div>`;
        overlay.classList.remove('hidden');
        overlay.classList.add('show');
    },
    openExternalUrl(url) {
        if (!url) return;
        if (typeof this.openAnimatedExternalUrl === 'function') {
            this.openAnimatedExternalUrl(url);
            return;
        }
        try { window.open(url, '_blank', 'noopener,noreferrer'); }
        catch (error) {
            try { window.location.href = url; } catch (_) {}
        }
    },
    buildCreditEntry(name, url = '') {
        const safeName = this.escapeHtml ? this.escapeHtml(name) : String(name);
        const safeUrl = this.escapeHtml ? this.escapeHtml(url) : String(url);
        const link = url ? `<button class="credit-link-btn" data-url="${safeUrl}" aria-label="打开 ${safeName} 的主页">&gt;</button>` : '';
        return `<div class="rainbow-text credit-entry"><span class="credit-name-text">${safeName}</span>${link}</div>`;
    },
    showCreditsCard() {
        const overlay = document.getElementById('easter-egg-overlay');
        const content = document.getElementById('easter-egg-content');
        if (!overlay || !content) return;
        this.easterEgg.currentCard = 'credits';
        this.easterEgg.isOverlayOpen = true;
        this.easterEgg.xinranClickCount = 0;
        content.innerHTML = `<div class="rainbow-text credit-entry" id="xinran-credit-wrap"><span class="credit-name-text" id="xinran-credit">致谢爱人❤️然(≧ω≦)/</span><button class="credit-link-btn" data-url="https://github.com/Winkmoon" aria-label="打开然的主页">&gt;</button></div><div class="credits-section"><div class="rainbow-text credits-title">模块制作感谢名单</div>${this.buildCreditEntry('Cloud_Yun', 'https://github.com/yspbwx2010')}${this.buildCreditEntry('穆远星', 'https://github.com/MuYuanXing')}${this.buildCreditEntry('嘟嘟Ski')}${this.buildCreditEntry('Kanata')}</div>`;
        if (typeof this.translateDom === 'function') this.translateDom(content);
        overlay.classList.remove('hidden');
        overlay.classList.add('show');
        content.querySelectorAll('.credit-link-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = btn.dataset.url || '';
                if (url) this.openExternalUrl(url);
            });
        });
        const xinranEl = document.getElementById('xinran-credit');
        if (xinranEl) {
            xinranEl.onclick = (e) => {
                e.stopPropagation();
                this.easterEgg.xinranClickCount = (this.easterEgg.xinranClickCount || 0) + 1;
                if (this.easterEgg.xinranClickTimer) clearTimeout(this.easterEgg.xinranClickTimer);
                this.easterEgg.xinranClickTimer = setTimeout(() => { this.easterEgg.xinranClickCount = 0; }, 1500);
                if (this.easterEgg.xinranClickCount >= 3) {
                    this.easterEgg.xinranClickCount = 0;
                    this.hideEasterEgg();
                    setTimeout(() => {
                        const xinranOverlay = document.getElementById('xinran-overlay');
                        if (!xinranOverlay) return;
                        xinranOverlay.classList.remove('hidden');
                        xinranOverlay.classList.add('show');
                    }, 300);
                }
            };
        }
    },
    hideEasterEgg() {
        const overlay = document.getElementById('easter-egg-overlay');
        if (!overlay) return;
        overlay.classList.remove('show');
        this.easterEgg.isOverlayOpen = false;
        setTimeout(() => {
            const card = document.getElementById('easter-egg-card');
            if (card) {
                card.style.transform = '';
                card.style.transition = '';
            }
        }, 400);
    },

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
    },
    initZramWriteback() {
        const toggle = document.getElementById('zram-writeback-switch');
        if (!toggle) return;
        if (typeof this.updateLoopControlState === 'function') this.updateLoopControlState();
        if (!toggle.dataset.bound) {
            toggle.dataset.bound = '1';
            toggle.addEventListener('change', async () => {
                if (!this.zramFeatures?.writebackControl) {
                    toggle.checked = this.state.loopEnabled;
                    this.showToast(this.t('writebackUnsupported'), 'warning');
                    return;
                }
                const previous = this.state.loopEnabled;
                this.state.loopEnabled = toggle.checked;
                if (typeof this.updateLoopControlState === 'function') this.updateLoopControlState();
                try {
                    await this.persistLoopConfig();
                    if (!toggle.checked && this._loopActive) await this.applyLoopImmediate('stop');
                } catch (error) {
                    this.state.loopEnabled = previous;
                    toggle.checked = previous;
                    if (typeof this.updateLoopControlState === 'function') this.updateLoopControlState();
                    this.showToast(this.t('loopConfigSaveFailed'), 'error');
                }
            });
        }
        const sizeSlider = document.getElementById('zram-writeback-size-slider');
        const sizeValue = document.getElementById('zram-writeback-size-value');
        if (sizeSlider && !sizeSlider.dataset.bound) {
            sizeSlider.dataset.bound = '1';
            sizeSlider.addEventListener('input', (event) => {
                this.state.loopSizeGb = parseFloat(event.target.value) || 4;
                if (sizeValue) sizeValue.textContent = `${this.state.loopSizeGb.toFixed(1)} GB`;
                this.updateSliderProgress(sizeSlider);
                if (typeof this.updateLoopParameterDisplay === 'function') this.updateLoopParameterDisplay(this._loopActive ? document.getElementById('zram-loop-device-value')?.textContent : '');
            });
            sizeSlider.addEventListener('change', () => this.persistLoopConfig().catch(() => this.showToast(this.t('loopConfigSaveFailed'), 'error')));
        }
        const loopRefresh = document.getElementById('zram-loop-device-refresh');
        if (loopRefresh && !loopRefresh.dataset.bound) {
            loopRefresh.dataset.bound = '1';
            loopRefresh.addEventListener('click', () => {
                if (typeof this.refreshZramLoopDevice === 'function') this.refreshZramLoopDevice(true);
            });
        }
        const loopAction = document.getElementById('zram-loop-action');
        if (loopAction && !loopAction.dataset.bound) {
            loopAction.dataset.bound = '1';
            loopAction.addEventListener('click', () => this.applyLoopImmediate(this._loopActive ? 'stop' : 'start'));
        }
    },
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
                        if (typeof this.updateLoopParameterDisplay === 'function') this.updateLoopParameterDisplay(this._loopActive ? document.getElementById('zram-loop-device-value')?.textContent : '');
                        this.markZramDirty();
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
            saveBtn.addEventListener('click', () => {
            const pathInput = document.getElementById('zram-path-input');
            const val = (pathInput && pathInput.value || '').trim();
            if (!val) { this.showToast('路径不能为空'); return; }
            this.state.zramPath = val;
            if (typeof this.updateLoopParameterDisplay === 'function') this.updateLoopParameterDisplay(this._loopActive ? document.getElementById('zram-loop-device-value')?.textContent : '');
            this.markZramDirty();
            this.showToast('路径已保存，点应用生效');
        });
        }
    },
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
                if (typeof this.updateLoopParameterDisplay === 'function') this.updateLoopParameterDisplay(this._loopActive ? document.getElementById('zram-loop-device-value')?.textContent : '');
                if (typeof this.markZramDirty === 'function') this.markZramDirty();
                overlay.classList.remove('show');
                setTimeout(() => overlay.remove(), 300);
                this.showToast(`已选择并保存: ${opt.dataset.path}（点应用生效）`);
            });
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('show');
                setTimeout(() => overlay.remove(), 300);
            }
        });
    },
    initSwapSettings() {
        const swapSwitch = document.getElementById('swap-switch');
        const swapSizeSlider = document.getElementById('swap-size-slider');
        const priorityList = document.getElementById('swap-priority-list');
        if (swapSwitch) {
            swapSwitch.addEventListener('change', (e) => {
                this.state.swapEnabled = e.target.checked;
                this.toggleSwapSettings(e.target.checked);
                this.markSwapDirty();
            });
        }
        if (swapSizeSlider) {
            swapSizeSlider.addEventListener('input', (e) => {
                this.state.swapSize = parseInt(e.target.value);
                document.getElementById('swap-size-value').textContent = `${this.state.swapSize} MB`;
            });
            swapSizeSlider.addEventListener('change', (e) => {
                this.state.swapSize = parseInt(e.target.value);
                this.markSwapDirty();
            });
        }
        if (priorityList) {
            priorityList.querySelectorAll('.option-item').forEach(item => {
                item.addEventListener('click', () => {
                    priorityList.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    this.state.swapPriority = parseInt(item.dataset.value);
                    this.markSwapDirty();
                });
            });
        }
        this.loadSwapConfig();
        const swapApplyBtn = document.getElementById('swap-apply-btn');
        if (swapApplyBtn) swapApplyBtn.addEventListener('click', async (e) => { e.stopPropagation(); /* enable check moved into applySwapImmediate */ await this.applySwapImmediate(); });
    },
    toggleSwapSettings(show) {
        const settings = document.getElementById('swap-settings');
        if (show) {
            settings.classList.remove('hidden');
        } else {
            settings.classList.add('hidden');
        }
    },
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
    },
    getSwapFieldUpdates(changedField = 'swap') {
        const swapPath = this.state.swapPath || this.runtimeConfig.swapPath || `${this.modDir}/swapfile.img`;
        const updates = {};
        if (changedField === 'swap' || changedField === 'enabled') updates.enabled = this.state.swapEnabled ? '1' : '0';
        if (changedField === 'swap' || changedField === 'size') updates.size = String(this.state.swapSize);
        if (changedField === 'swap' || changedField === 'priority') updates.priority = String(this.state.swapPriority);
        if (changedField === 'swap' || changedField === 'path') updates.path = swapPath;
        return updates;
    },
    persistSwapConfig(changedField = 'swap') {
        const save = this.withLock('swap-config', async () => {
            await this.mergeConfigFile('swap.conf', this.getSwapFieldUpdates(changedField), ['enabled', 'size', 'priority', 'path']);
            return true;
        });
        this._swapConfigSavePromise = save;
        return save;
    },
    async saveSwapConfig(changedField = 'swap', skipPreview = false) {
        const config = await this.buildMergedConfigContent('swap.conf', this.getSwapFieldUpdates(changedField), ['enabled', 'size', 'priority', 'path']);
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将保存 Swap 配置。',
                configs: [{ filename: 'swap.conf', content: config }],
                notes: ['仅保存配置，点击应用后才修改当前系统。']
            }, {
                onCancel: () => this.loadSwapConfig()
            });
            if (!confirmed) return false;
        }
        await this.persistSwapConfig(changedField);
        this.showToast('Swap 配置已保存');
        return true;
    },
    async applySwapImmediate() {
      return this.withLock('swap', async () => {
        const swapPath = this.state.swapPath || this.runtimeConfig.swapPath || `${this.modDir}/swapfile.img`;
        const q = this.shellQuote(swapPath);
        await this.persistSwapConfig('swap');
        if (!this.state.swapEnabled) {
            this.showLoading(true);
            await this.exec(`swapoff ${q} 2>/dev/null`);
            await this.exec(`rm -f ${q} 2>/dev/null`);
            this.showLoading(false);
            if (typeof this.clearSwapDirty === 'function') this.clearSwapDirty();
            this.showToast('Swap 已关闭');
            await this.loadSwapStatus();
            return true;
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
    },
    parseSwapDevices(text) {
        return String(text || '')
            .trim()
            .split('\n')
            .slice(1)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const parts = line.split(/\s+/);
                return {
                    path: parts[0] || '-',
                    type: parts[1] || '-',
                    sizeKiB: parseInt(parts[2], 10) || 0,
                    usedKiB: parseInt(parts[3], 10) || 0,
                    priority: parts[4] || '-'
                };
            });
    },
    async loadSwapStatus() {
        const pageSize = 4096;
        const [swapsRaw, vmstatRaw] = await Promise.all([
            this.exec('cat /proc/swaps 2>/dev/null'),
            this.exec('cat /proc/vmstat 2>/dev/null')
        ]);
        const devices = this.parseSwapDevices(swapsRaw);
        const fileDevices = devices.filter(d => !/zram/i.test(d.path));
        const statusEl = document.getElementById('swap-current-status');
        const sizeEl = document.getElementById('swap-current-size');
        const badgeEl = document.getElementById('swap-status');
        const listEl = document.getElementById('swap-devices-list');
        const ioInEl = document.getElementById('swap-io-in');
        const ioOutEl = document.getElementById('swap-io-out');

        if (fileDevices.length > 0) {
            const totalKiB = fileDevices.reduce((s, d) => s + d.sizeKiB, 0);
            if (statusEl) statusEl.textContent = `已启用 x${fileDevices.length}`;
            if (sizeEl) sizeEl.textContent = `${(totalKiB / 1024).toFixed(0)} MB`;
            if (badgeEl) badgeEl.textContent = '已启用';
        } else if (devices.length > 0) {
            if (statusEl) statusEl.textContent = '仅 ZRAM';
            if (sizeEl) sizeEl.textContent = '--';
            if (badgeEl) badgeEl.textContent = 'ZRAM';
        } else {
            if (statusEl) statusEl.textContent = '未启用';
            if (sizeEl) sizeEl.textContent = '--';
            if (badgeEl) badgeEl.textContent = '未启用';
        }

        const vm = {};
        String(vmstatRaw || '').split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2 && /^-?\d+$/.test(parts[1])) vm[parts[0]] = Number(parts[1]);
        });
        const pswpin = (Number(vm.pswpin) || 0) * pageSize;
        const pswpout = (Number(vm.pswpout) || 0) * pageSize;
        if (ioInEl) ioInEl.textContent = pswpin > 0 ? this.formatBytes(pswpin) : '0 B';
        if (ioOutEl) ioOutEl.textContent = pswpout > 0 ? this.formatBytes(pswpout) : '0 B';

        // 仅文件 Swap 时展示设备列表；只有 zram 时整段隐藏
        const devicesSection = document.getElementById('swap-devices-section') || (listEl && listEl.closest('.setting-section'));
        if (listEl) {
            if (!fileDevices.length) {
                listEl.innerHTML = '';
                if (devicesSection) {
                    devicesSection.hidden = true;
                    devicesSection.style.display = 'none';
                }
            } else {
                if (devicesSection) {
                    devicesSection.hidden = false;
                    devicesSection.style.display = '';
                }
                listEl.innerHTML = fileDevices.map(d => {
                    const name = this.escapeHtml ? this.escapeHtml(d.path) : d.path;
                    const used = this.formatBytes(d.usedKiB * 1024);
                    const total = this.formatBytes(d.sizeKiB * 1024);
                    const kind = d.type || 'file';
                    return `<div class="swap-device-row"><div class="swap-device-title">${name}</div><div class="swap-device-meta"><span>${kind}</span><span>${used} / ${total}</span><span>prio ${d.priority}</span></div></div>`;
                }).join('');
            }
        }
    },
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
            watermarkSlider.addEventListener('change', () => this.applyVmConfig(['watermark_scale_factor']));
        }
        if (extraFreeSlider) {
            extraFreeSlider.addEventListener('input', (e) => {
                this.state.extraFreeKbytes = parseInt(e.target.value);
                document.getElementById('extra-free-value').textContent = `${this.state.extraFreeKbytes} KB`;
            });
            extraFreeSlider.addEventListener('change', () => this.applyVmConfig(['extra_free_kbytes']));
        }
        if (dirtyRatioSlider) {
            dirtyRatioSlider.addEventListener('input', (e) => {
                this.state.dirtyRatio = parseInt(e.target.value);
                document.getElementById('dirty-ratio-value').textContent = `${this.state.dirtyRatio}%`;
            });
            dirtyRatioSlider.addEventListener('change', () => this.applyVmConfig(['dirty_ratio']));
        }
        if (dirtyBgSlider) {
            dirtyBgSlider.addEventListener('input', (e) => {
                this.state.dirtyBgRatio = parseInt(e.target.value);
                document.getElementById('dirty-bg-value').textContent = `${this.state.dirtyBgRatio}%`;
            });
            dirtyBgSlider.addEventListener('change', () => this.applyVmConfig(['dirty_background_ratio']));
        }
        if (vfsPressureSlider) {
            vfsPressureSlider.addEventListener('input', (e) => {
                this.state.vfsCachePressure = parseInt(e.target.value);
                document.getElementById('vfs-pressure-value').textContent = this.state.vfsCachePressure;
            });
            vfsPressureSlider.addEventListener('change', () => this.applyVmConfig(['vfs_cache_pressure']));
        }
        this.loadVmConfig();
    },
    async loadVmConfig() {
        const config = await this.readConfig('vm.conf');
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
    },
    updateVmSlider(sliderId, valueId, val, suffix) {
        const slider = document.getElementById(sliderId);
        const value = document.getElementById(valueId);
        if (slider) { slider.value = val; this.updateSliderProgress(slider); }
        if (value) value.textContent = `${val}${suffix}`;
    },
    async applyVmConfig(changedKeys = null, skipPreview = false) {
      return this.withLock('vm', async () => {
        const keys = Array.isArray(changedKeys) ? changedKeys : (changedKeys ? [changedKeys] : ['enabled', 'watermark_scale_factor', 'extra_free_kbytes', 'dirty_ratio', 'dirty_background_ratio', 'vfs_cache_pressure']);
        const updates = {};
        if (keys.includes('enabled')) updates.enabled = this.state.vmEnabled ? '1' : '0';
        if (keys.includes('watermark_scale_factor')) updates.watermark_scale_factor = String(this.state.watermarkScale);
        if (keys.includes('extra_free_kbytes')) updates.extra_free_kbytes = String(this.state.extraFreeKbytes);
        if (keys.includes('dirty_ratio')) updates.dirty_ratio = String(this.state.dirtyRatio);
        if (keys.includes('dirty_background_ratio')) updates.dirty_background_ratio = String(this.state.dirtyBgRatio);
        if (keys.includes('vfs_cache_pressure')) updates.vfs_cache_pressure = String(this.state.vfsCachePressure);
        const config = await this.buildMergedConfigContent('vm.conf', updates, ['enabled', 'watermark_scale_factor', 'extra_free_kbytes', 'dirty_ratio', 'dirty_background_ratio', 'vfs_cache_pressure']);
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将应用虚拟内存参数。',
                configs: [{ filename: 'vm.conf', content: config }],
                writes: [
                    ...(keys.includes('watermark_scale_factor') ? [{ path: '/proc/sys/vm/watermark_scale_factor', value: String(this.state.watermarkScale) }] : []),
                    ...(keys.includes('extra_free_kbytes') ? [{ path: '/proc/sys/vm/extra_free_kbytes', value: String(this.state.extraFreeKbytes) }] : []),
                    ...(keys.includes('dirty_ratio') ? [{ path: '/proc/sys/vm/dirty_ratio', value: String(this.state.dirtyRatio) }] : []),
                    ...(keys.includes('dirty_background_ratio') ? [{ path: '/proc/sys/vm/dirty_background_ratio', value: String(this.state.dirtyBgRatio) }] : []),
                    ...(keys.includes('vfs_cache_pressure') ? [{ path: '/proc/sys/vm/vfs_cache_pressure', value: String(this.state.vfsCachePressure) }] : [])
                ]
            }, {
                onCancel: () => this.loadVmConfig()
            });
            if (!confirmed) return false;
        }
        if (!this.state.vmEnabled) {
            await this.mergeConfigFile('vm.conf', updates, ['enabled', 'watermark_scale_factor', 'extra_free_kbytes', 'dirty_ratio', 'dirty_background_ratio', 'vfs_cache_pressure']);
            this.showToast('VM 配置已保存（禁用状态）');
            return true;
        }
        this.showLoading(true);
        await this.mergeConfigFile('vm.conf', updates, ['enabled', 'watermark_scale_factor', 'extra_free_kbytes', 'dirty_ratio', 'dirty_background_ratio', 'vfs_cache_pressure']);
        await Promise.all([
            ...(keys.includes('watermark_scale_factor') ? [this.exec(`echo ${this.state.watermarkScale} > /proc/sys/vm/watermark_scale_factor 2>/dev/null`)] : []),
            ...(keys.includes('extra_free_kbytes') ? [this.exec(`echo ${this.state.extraFreeKbytes} > /proc/sys/vm/extra_free_kbytes 2>/dev/null`)] : []),
            ...(keys.includes('dirty_ratio') ? [this.exec(`echo ${this.state.dirtyRatio} > /proc/sys/vm/dirty_ratio 2>/dev/null`)] : []),
            ...(keys.includes('dirty_background_ratio') ? [this.exec(`echo ${this.state.dirtyBgRatio} > /proc/sys/vm/dirty_background_ratio 2>/dev/null`)] : []),
            ...(keys.includes('vfs_cache_pressure') ? [this.exec(`echo ${this.state.vfsCachePressure} > /proc/sys/vm/vfs_cache_pressure 2>/dev/null`)] : [])
        ]);
        this.showLoading(false);
        this.showToast('VM 参数已应用');
        const vmStatus = document.getElementById('vm-status');
        if (vmStatus) vmStatus.textContent = this.state.vmEnabled ? '已修改' : '已禁用';
        return true;
      });
    },
    initKernelFeatures() {
        const emptyEl = document.getElementById('kernel-features-empty');
        const lruStatus = document.getElementById('lru-status');
        let featureCount = 0;
        if (this.kernelFeatures.lruGen) {
            featureCount++;
            const el = document.getElementById('lru-gen-container');
            if (el) el.style.display = '';
            const sw = document.getElementById('lru-gen-switch');
            if (sw) sw.addEventListener('change', (e) => { this.state.lruGenEnabled = e.target.checked; this.applyKernelFeatures(['lru_gen']); });
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
                        this.applyKernelFeatures(['thp']);
                    });
                });
            }
        }
        if (this.kernelFeatures.ksm) {
            featureCount++;
            const el = document.getElementById('ksm-container');
            if (el) el.style.display = '';
            const sw = document.getElementById('ksm-switch');
            if (sw) sw.addEventListener('change', (e) => { this.state.ksmEnabled = e.target.checked; this.applyKernelFeatures(['ksm']); });
        }
        if (this.kernelFeatures.compaction) {
            featureCount++;
            const el = document.getElementById('compaction-container');
            if (el) el.style.display = '';
            const sw = document.getElementById('compaction-switch');
            if (sw) sw.addEventListener('change', (e) => { this.state.compactionEnabled = e.target.checked; this.applyKernelFeatures(['compaction']); });
        }
        if (featureCount > 0) {
            if (emptyEl) emptyEl.style.display = 'none';
            if (lruStatus) lruStatus.textContent = `${featureCount}项可用`;
        } else {
            if (lruStatus) lruStatus.textContent = '不可用';
        }
        this.loadKernelFeaturesConfig();
    },
    async loadKernelFeaturesConfig() {
        const config = await this.readConfig('kernel.conf');
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
    },
    async applyKernelFeatures(changedKeys = null, skipPreview = false) {
      return this.withLock('kernel-features', async () => {
        const keys = Array.isArray(changedKeys) ? changedKeys : (changedKeys ? [changedKeys] : ['lru_gen', 'thp', 'ksm', 'compaction']);
        const updates = {};
        if (keys.includes('lru_gen')) updates.lru_gen = this.state.lruGenEnabled ? '1' : '0';
        if (keys.includes('thp')) updates.thp = this.state.thp;
        if (keys.includes('ksm')) updates.ksm = this.state.ksmEnabled ? '1' : '0';
        if (keys.includes('compaction')) updates.compaction = this.state.compactionEnabled ? '1' : '0';
        const config = await this.buildMergedConfigContent('kernel.conf', updates, ['lru_gen', 'thp', 'ksm', 'compaction']);
        if (!skipPreview) {
            const writes = [];
            if (keys.includes('lru_gen') && this.kernelFeatures.lruGen) writes.push({ path: '/sys/kernel/mm/lru_gen/enabled', value: this.state.lruGenEnabled ? 'Y' : 'N' });
            if (keys.includes('thp') && this.kernelFeatures.thp) writes.push({ path: '/sys/kernel/mm/transparent_hugepage/enabled', value: this.state.thp });
            if (keys.includes('ksm') && this.kernelFeatures.ksm) writes.push({ path: '/sys/kernel/mm/ksm/run', value: this.state.ksmEnabled ? '1' : '0' });
            if (keys.includes('compaction') && this.kernelFeatures.compaction) writes.push({ path: '/proc/sys/vm/compaction_proactiveness', value: this.state.compactionEnabled ? '20' : '0' });
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
        await this.mergeConfigFile('kernel.conf', updates, ['lru_gen', 'thp', 'ksm', 'compaction']);
        const promises = [];
        if (keys.includes('lru_gen') && this.kernelFeatures.lruGen) {
            promises.push(this.exec(`echo ${this.state.lruGenEnabled ? 'Y' : 'N'} > /sys/kernel/mm/lru_gen/enabled 2>/dev/null`));
        }
        if (keys.includes('thp') && this.kernelFeatures.thp) {
            promises.push(this.exec(`echo ${this.state.thp} > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null`));
        }
        if (keys.includes('ksm') && this.kernelFeatures.ksm) {
            promises.push(this.exec(`echo ${this.state.ksmEnabled ? '1' : '0'} > /sys/kernel/mm/ksm/run 2>/dev/null`));
        }
        if (keys.includes('compaction') && this.kernelFeatures.compaction) {
            promises.push(this.exec(`echo ${this.state.compactionEnabled ? '20' : '0'} > /proc/sys/vm/compaction_proactiveness 2>/dev/null`));
        }
        await Promise.all(promises);
        this.showLoading(false);
        this.showToast('内核特性已应用');
        return true;
      });
    }
  });
  window.CoronaFeatureScripts["memory-core"] = true;
})();
