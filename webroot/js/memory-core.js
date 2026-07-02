(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["memory-core"]) return;
  Object.assign(CoronaAddon.prototype, {
    renderStaticOptions() { this.renderAlgorithmOptions(); this.renderReadaheadOptions(); this.renderIOAdvancedOptions(); },
    renderAlgorithmOptions() {
        const container = document.getElementById('algorithm-list');
        container.innerHTML = this.algorithms.map(alg => `<div class="option-item ${alg === this.state.algorithm ? 'selected' : ''}" data-value="${alg}">${alg}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => { container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected')); e.currentTarget.classList.add('selected'); this.state.algorithm = e.currentTarget.dataset.value; await this.saveZramConfig('algorithm'); });
        });
    },
    renderReadaheadOptions() {
        const container = document.getElementById('readahead-list');
        container.innerHTML = this.readaheadOptions.map(size => `<div class="option-item ${size === this.state.readahead ? 'selected' : ''}" data-value="${size}">${size}</div>`).join('');
        container.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async (e) => { container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected')); e.currentTarget.classList.add('selected'); this.state.readahead = parseInt(e.currentTarget.dataset.value); await this.applyReadaheadImmediate(); });
        });
    },
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
    },
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
    },
    async awaitInitialRealtimeReady() {
        await this.updateRealtimeData(true);
        await this.sleep(220);
        await this.updateRealtimeData(true);
    },
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
    },
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
            let appPolicyReady = false;
            let priorityThreadReady = false;
            let memoryOptReady = false;
            let customScriptsReady = false;
            let coronaKernelReady = false;
            let le9ecReady = false;
            try {
                await this.ensureFeatureScript('app-policy');
                appPolicyReady = true;
            } catch (e) {
                console.error('ensureFeatureScript(app-policy) failed', e);
            }
            try {
                await this.ensureFeatureScript('priority-thread');
                priorityThreadReady = true;
            } catch (e) {
                console.error('ensureFeatureScript(priority-thread) failed', e);
            }
            try {
                await this.ensureFeatureScript('memory-opt');
                memoryOptReady = true;
            } catch (e) {
                console.error('ensureFeatureScript(memory-opt) failed', e);
            }
            try {
                await this.ensureFeatureScript('custom-scripts');
                customScriptsReady = true;
            } catch (e) {
                console.error('ensureFeatureScript(custom-scripts) failed', e);
            }
            try {
                await this.ensureFeatureScript('corona-kernel');
                coronaKernelReady = true;
            } catch (e) {
                console.error('ensureFeatureScript(corona-kernel) failed', e);
            }
            try {
                await this.ensureFeatureScript('le9ec');
                le9ecReady = true;
            } catch (e) {
                console.error('ensureFeatureScript(le9ec) failed', e);
            }
            if (!this.settingsUiInitialized) {
                if (typeof this.renderStaticOptions === 'function') this.renderStaticOptions();
                if (priorityThreadReady && typeof this.initPerformanceMode === 'function') this.initPerformanceMode();
                if (typeof this.initExpandableCards === 'function') this.initExpandableCards();
                if (typeof this.initThemeSelector === 'function') this.initThemeSelector();
                if (typeof this.initLanguageToggle === 'function') this.initLanguageToggle();
                if (typeof this.initChangePreviewToggle === 'function') this.initChangePreviewToggle();
                if (typeof this.initSettingDescriptionToggle === 'function') this.initSettingDescriptionToggle();
                if (typeof this.initCategoryConfigVisibilityToggle === 'function') this.initCategoryConfigVisibilityToggle();
                if (typeof this.initSnapshots === 'function') this.initSnapshots();
                if (typeof this.initSliderProgress === 'function') this.initSliderProgress();
                if (typeof this.initSwapSettings === 'function') this.initSwapSettings();
                if (typeof this.initVmSettings === 'function') this.initVmSettings();
                if (typeof this.initZramWriteback === 'function') this.initZramWriteback();
                if (typeof this.initZramPath === 'function') this.initZramPath();
                if (customScriptsReady && typeof this.initCustomScripts === 'function') this.initCustomScripts();
                if (memoryOptReady && typeof this.initSystemOpt === 'function') this.initSystemOpt();
                if (appPolicyReady && typeof this.initAppPolicy === 'function') this.initAppPolicy();
                if (coronaKernelReady && typeof this.initCoronaKernel === 'function') this.initCoronaKernel();
                if (le9ecReady && typeof this.loadLe9ecConfig === 'function' && !this.le9ecSupported) {
                    // noop: allow later status/config loading to probe support without blocking init
                }
                this.settingsUiInitialized = true;
            }
            if (!this.settingsDataLoaded) {
                const configTasks = [
                    ['loadAllConfigs', () => this.loadAllConfigs()],
                    ['loadDualCellConfig', () => this.loadDualCellConfig()],
                    ['detectKernelFeatures', () => this.detectKernelFeatures()],
                    ['loadParameterSnapshots', () => this.loadParameterSnapshots()]
                ];
                const configResults = await Promise.allSettled(configTasks.map(([, task]) => task()));
                configResults.forEach((result, index) => {
                    if (result.status === 'rejected') console.error(`${configTasks[index][0]} failed`, result.reason);
                });
                this.initKernelFeatures();
                const statusTasks = [
                    ['loadZramStatus', () => this.loadZramStatus()],
                    ['loadLe9ecStatus', () => this.loadLe9ecStatus()],
                    ...(appPolicyReady && typeof this.loadAppRulesConfig === 'function' ? [['loadAppRulesConfig', () => this.loadAppRulesConfig()]] : [])
                ];
                const statusResults = await Promise.allSettled(statusTasks.map(([, task]) => task()));
                statusResults.forEach((result, index) => {
                    if (result.status === 'rejected') console.error(`${statusTasks[index][0]} failed`, result.reason);
                });
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
    async updateBatteryInfo() {
        const [level, temp] = await Promise.all([this.exec('cat /sys/class/power_supply/battery/capacity'), this.exec('cat /sys/class/power_supply/battery/temp')]);
        document.getElementById('battery-level').textContent = `${level}%`;
        if (temp && !isNaN(temp)) {
            const tempC = (parseInt(temp) / 10).toFixed(1);
            document.getElementById('battery-temp').textContent = `${tempC}°C`;
            return parseFloat(tempC) || 0;
        }
        return 0;
    },
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
    },
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
    },
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
    },
    async updateSwapInfo() {
        const swapinfo = await this.exec('cat /proc/meminfo | grep Swap');
        let total = 0, free = 0;
        for (const line of swapinfo.split('\n')) { if (line.startsWith('SwapTotal:')) total = parseInt(line.match(/\d+/)?.[0] || 0); else if (line.startsWith('SwapFree:')) free = parseInt(line.match(/\d+/)?.[0] || 0); }
        const used = total - free; const percent = total > 0 ? ((used / total) * 100).toFixed(1) : 0;
        document.getElementById('swap-total').textContent = total > 0 ? this.formatBytes(total * 1024) : '未启用';
        document.getElementById('swap-used').textContent = total > 0 ? this.formatBytes(used * 1024) : '--';
        document.getElementById('swap-free').textContent = total > 0 ? this.formatBytes(free * 1024) : '--';
        document.getElementById('swap-progress').style.width = `${percent}%`;
    },
    async loadAllConfigs() {
        const tasks = [
            this.loadZramConfig(),
            this.loadLe9ecConfig(),
            this.loadIOConfig(),
            this.loadCpuGovernorConfig(),
            this.loadTCPConfig(),
            this.loadCpuCores(),
            this.loadSwapStatus()
        ];
        if (typeof this.loadPerformanceModeConfig === 'function') {
            tasks.push(this.loadPerformanceModeConfig());
        }
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
    },
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
    },
    getZramFieldUpdates(changedField = 'zram') {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const field = changedField || 'zram';
        const updates = {};
        if (field === 'zram' || field === 'enabled') updates.enabled = this.state.zramEnabled ? '1' : '0';
        if (field === 'zram' || field === 'algorithm') updates.algorithm = this.state.algorithm;
        if (field === 'zram' || field === 'size') updates.size = String(sizeBytes);
        if (field === 'zram' || field === 'swappiness') updates.swappiness = String(this.state.swappiness);
        if (field === 'zram' || field === 'zram_writeback') updates.zram_writeback = this.state.zramWriteback;
        if (field === 'zram' || field === 'zram_path') updates.zram_path = this.state.zramPath;
        return updates;
    },
    async saveZramConfig(changedField = 'zram', skipPreview = false) {
        const config = await this.buildMergedConfigContent('zram.conf', this.getZramFieldUpdates(changedField), ['enabled', 'algorithm', 'size', 'swappiness', 'zram_writeback', 'zram_path']);
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
        await this.mergeConfigFile('zram.conf', this.getZramFieldUpdates(changedField), ['enabled', 'algorithm', 'size', 'swappiness', 'zram_writeback', 'zram_path']);
        await this.updateModuleDescription();
        this.showToast('ZRAM 配置已保存');
        return true;
    },
    async applyZramImmediate(manageLoading = true, skipPreview = false) {
      return this.withLock('zram', async () => {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const config = await this.buildMergedConfigContent('zram.conf', this.getZramFieldUpdates('zram'), ['enabled', 'algorithm', 'size', 'swappiness', 'zram_writeback', 'zram_path']);
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将通过官方初始化链应用 ZRAM。',
                configs: [{ filename: 'zram.conf', content: config }],
                actions: ['执行 /product/bin/init.oplus.nandswap.sh boot_completed', '由官方初始化后再叠加 mm-sys 显式参数'],
                notes: ['保留官方 nandswap / hybridswap 优化，仅覆写你显式设置的 ZRAM 项。']
            }, {
                onCancel: () => this.loadZramConfig()
            });
            if (!confirmed) return false;
        }
        if (manageLoading) {
            this.showLoading(true);
            await this.sleep(0);
        }
        await this.mergeConfigFile('zram.conf', this.getZramFieldUpdates('zram'), ['enabled', 'algorithm', 'size', 'swappiness', 'zram_writeback', 'zram_path']);
        await this.exec('/system/bin/sh /product/bin/init.oplus.nandswap.sh boot_completed >/dev/null 2>&1');
        await this.updateModuleDescription();
        if (manageLoading) this.showLoading(false);
        this.showToast('ZRAM 配置已应用');
        setTimeout(() => this.loadZramStatus(), 500);
        return true;
      });
    },
    async applySwappinessImmediate(skipPreview = false) {
      return this.withLock('zram', async () => {
        const config = await this.buildMergedConfigContent('zram.conf', this.getZramFieldUpdates('swappiness'), ['enabled', 'algorithm', 'size', 'swappiness', 'zram_writeback', 'zram_path']);
        if (!skipPreview) {
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: '即将通过官方初始化链更新 ZRAM Swappiness。',
                configs: [{ filename: 'zram.conf', content: config }],
                actions: ['执行 /product/bin/init.oplus.nandswap.sh boot_completed', '官方初始化后由 mm-sys 只覆写 swappiness'],
                notes: ['不会替你补全其它未设置的 ZRAM 参数。']
            }, {
                onCancel: () => this.loadZramConfig()
            });
            if (!confirmed) return false;
        }
        this.showLoading(true);
        await this.sleep(0);
        await this.mergeConfigFile('zram.conf', this.getZramFieldUpdates('swappiness'), ['enabled', 'algorithm', 'size', 'swappiness', 'zram_writeback', 'zram_path']);
        await this.exec('/system/bin/sh /product/bin/init.oplus.nandswap.sh boot_completed >/dev/null 2>&1');
        await this.updateModuleDescription();
        this.showLoading(false);
        this.showToast('Swappiness 已更新');
        setTimeout(() => this.loadZramStatus(), 500);
        return true;
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
    },
    async applyIOSchedulerImmediate(skipPreview = false) {
        return this.applyIOConfigImmediate('scheduler', skipPreview);
    },
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
    showToast(message) { const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2500); },
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
        const banner = document.querySelector('.banner-image');
        const authorCard = document.getElementById('author-card');
        const overlay = document.getElementById('easter-egg-overlay');
        const card = document.getElementById('easter-egg-card');
        if (!overlay || !card) return;
        if (banner) { banner.addEventListener('click', () => { this.easterEgg.clickCount++; if (this.easterEgg.clickTimer) { clearTimeout(this.easterEgg.clickTimer); } this.easterEgg.clickTimer = setTimeout(() => { this.easterEgg.clickCount = 0; }, 500); if (this.easterEgg.clickCount >= 1) { this.easterEgg.clickCount = 0; this.showEasterEgg(); } }); }
        const authorLinkBtn = document.getElementById('author-link-btn');
        if (authorLinkBtn && !authorLinkBtn.dataset.bound) {
            authorLinkBtn.dataset.bound = '1';
            authorLinkBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openExternalUrl('https://github.com/wswzgdg');
            });
        }
        if (authorCard) { authorCard.addEventListener('click', () => { this.easterEgg.authorClickCount = (this.easterEgg.authorClickCount || 0) + 1; if (this.easterEgg.authorClickTimer) { clearTimeout(this.easterEgg.authorClickTimer); } this.easterEgg.authorClickTimer = setTimeout(() => { this.easterEgg.authorClickCount = 0; }, 500); if (this.easterEgg.authorClickCount >= 1) { this.easterEgg.authorClickCount = 0; this.showCreditsCard(); } }); }
        let cardTouchStartX = 0, cardTouchStartY = 0, cardOffsetX = 0, cardOffsetY = 0;
        card.addEventListener('touchstart', (e) => { const touch = e.touches[0]; cardTouchStartX = touch.clientX; cardTouchStartY = touch.clientY; card.style.transition = 'none'; }, { passive: true });
        card.addEventListener('touchmove', (e) => { if (!this.easterEgg.isOverlayOpen) return; const touch = e.touches[0]; cardOffsetX = (touch.clientX - cardTouchStartX) * 0.15; cardOffsetY = (touch.clientY - cardTouchStartY) * 0.15; cardOffsetX = Math.max(-20, Math.min(20, cardOffsetX)); cardOffsetY = Math.max(-20, Math.min(20, cardOffsetY)); card.style.transform = `scale(1) translate(${cardOffsetX}px, ${cardOffsetY}px)`; }, { passive: true });
        card.addEventListener('touchend', () => { card.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'; card.style.transform = 'scale(1) translate(0, 0)'; cardOffsetX = 0; cardOffsetY = 0; });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { this.hideEasterEgg(); } });
    },
    showEasterEgg() { const overlay = document.getElementById('easter-egg-overlay'); const content = document.getElementById('easter-egg-content'); this.easterEgg.currentCard = 'thanks'; this.easterEgg.isOverlayOpen = true; content.innerHTML = `<div class="rainbow-text">感谢使用<span class="corona-c-rainbow">C</span>orona模块</div><div class="rainbow-text ciallo">Ciallo~(∠・ω< )⌒★</div>`; overlay.classList.add('show'); },
    openExternalUrl(url) {
        if (!url) return;
        try {
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (error) {
            try {
                window.location.href = url;
            } catch (_) {}
        }
    },
    buildCreditEntry(name, url = '') {
        const safeName = this.escapeHtml(name);
        const safeUrl = this.escapeHtml(url);
        const link = url ? `<button class="credit-link-btn" data-url="${safeUrl}" aria-label="打开 ${safeName} 的主页">&gt;</button>` : '';
        return `<div class="rainbow-text credit-entry"><span class="credit-name-text">${safeName}</span>${link}</div>`;
    },
    showCreditsCard() {
        const overlay = document.getElementById('easter-egg-overlay');
        const content = document.getElementById('easter-egg-content');
        this.easterEgg.currentCard = 'credits';
        this.easterEgg.isOverlayOpen = true;
        this.easterEgg.xinranClickCount = 0;
        content.innerHTML = `<div class="rainbow-text credit-entry" id="xinran-credit-wrap"><span class="credit-name-text" id="xinran-credit">致谢爱人❤️然(≧ω≦)/</span><button class="credit-link-btn" data-url="https://github.com/Winkmoon" aria-label="打开然的主页">&gt;</button></div><div class="credits-section"><div class="rainbow-text credits-title">模块制作感谢名单</div>${this.buildCreditEntry('Cloud_Yun', 'https://github.com/yspbwx2010')}${this.buildCreditEntry('穆远星', 'https://github.com/MuYuanXing')}${this.buildCreditEntry('嘟嘟Ski')}${this.buildCreditEntry('Kanata')}</div>`;
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
            const self = this;
            xinranEl.onclick = function(e) {
                e.stopPropagation();
                self.easterEgg.xinranClickCount++;
                if (self.easterEgg.xinranClickTimer) { clearTimeout(self.easterEgg.xinranClickTimer); }
                self.easterEgg.xinranClickTimer = setTimeout(() => { self.easterEgg.xinranClickCount = 0; }, 1500);
                if (self.easterEgg.xinranClickCount >= 3) { self.easterEgg.xinranClickCount = 0; self.hideEasterEgg(); setTimeout(() => { const xinranOverlay = document.getElementById('xinran-overlay'); xinranOverlay.classList.remove('hidden'); xinranOverlay.classList.add('show'); }, 300); }
            };
        }
    },
    hideEasterEgg() { const overlay = document.getElementById('easter-egg-overlay'); overlay.classList.remove('show'); this.easterEgg.isOverlayOpen = false; setTimeout(() => { const card = document.getElementById('easter-egg-card'); card.style.transform = ''; card.style.transition = ''; }, 400); },
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
        const list = document.getElementById('zram-writeback-list');
        if (!list) return;
        list.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', async () => {
                list.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                this.state.zramWriteback = item.dataset.value;
                await this.saveZramConfig('zram_writeback');
            });
        });
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
                const saved = await this.saveZramConfig('zram_path');
                if (!saved) return;
                await this.loadZramStatus();
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
    },
    initSwapSettings() {
        const swapSwitch = document.getElementById('swap-switch');
        const swapSizeSlider = document.getElementById('swap-size-slider');
        const priorityList = document.getElementById('swap-priority-list');
        if (swapSwitch) {
            swapSwitch.addEventListener('change', (e) => {
                this.state.swapEnabled = e.target.checked;
                this.toggleSwapSettings(e.target.checked);
                this.saveSwapConfig('enabled');
            });
        }
        if (swapSizeSlider) {
            swapSizeSlider.addEventListener('input', (e) => {
                this.state.swapSize = parseInt(e.target.value);
                document.getElementById('swap-size-value').textContent = `${this.state.swapSize} MB`;
            });
            swapSizeSlider.addEventListener('change', (e) => {
                this.state.swapSize = parseInt(e.target.value);
                this.saveSwapConfig('size');
            });
        }
        if (priorityList) {
            priorityList.querySelectorAll('.option-item').forEach(item => {
                item.addEventListener('click', () => {
                    priorityList.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    this.state.swapPriority = parseInt(item.dataset.value);
                    this.saveSwapConfig('priority');
                });
            });
        }
        this.loadSwapConfig();
        const swapApplyBtn = document.getElementById('swap-apply-btn');
        if (swapApplyBtn) swapApplyBtn.addEventListener('click', async (e) => { e.stopPropagation(); if (!this.state.swapEnabled) { this.showToast('Swap 未启用'); return; } await this.applySwapImmediate(); });
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
    async saveSwapConfig(changedField = 'swap', skipPreview = false) {
        const swapPath = this.state.swapPath || this.runtimeConfig.swapPath || `${this.modDir}/swapfile.img`;
        const config = await this.buildMergedConfigContent('swap.conf', this.getSwapFieldUpdates(changedField), ['enabled', 'size', 'priority', 'path']);
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
        await this.mergeConfigFile('swap.conf', this.getSwapFieldUpdates(changedField), ['enabled', 'size', 'priority', 'path']);
        if (!this.state.swapEnabled) {
            await this.exec(`swapoff ${this.shellQuote(swapPath)} 2>/dev/null`);
            await this.exec(`rm -f ${this.shellQuote(swapPath)} 2>/dev/null`);
            this.showToast('Swap 已关闭');
            await this.loadSwapStatus();
        } else {
            this.showToast('Swap 配置已保存');
        }
        return true;
    },
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
    },
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
