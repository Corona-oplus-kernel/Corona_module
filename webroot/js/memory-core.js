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

        const expandMotion = { height: 'cubic-bezier(0.16, 1, 0.3, 1)', content: 'cubic-bezier(0.22, 1.32, 0.36, 1)' };
        const collapseMotion = { height: 'cubic-bezier(0.4, 0, 0.2, 1)', content: 'cubic-bezier(0.32, 0, 0.2, 1)' };
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
            if (body.dataset.open === '1' && !body._foldAnim) return;
            if (body._foldAnim) {
                clearTimeout(body._foldAnim);
                body._foldAnim = null;
            }
            body.hidden = false;
            body.style.display = 'block';
            body.style.overflow = 'hidden';
            body.style.transition = 'none';
            const currentHeight = Math.max(body.getBoundingClientRect().height || 0, 0);
            const currentStyle = currentHeight > 1 ? getComputedStyle(body) : null;
            const currentOpacity = currentStyle ? Math.max(0, Math.min(1, parseFloat(currentStyle.opacity) || 0)) : 0;
            const currentTransform = currentStyle?.transform && currentStyle.transform !== 'none'
                ? currentStyle.transform
                : 'translateY(-8px) scale(0.985)';
            body.style.maxHeight = 'none';
            body.style.opacity = '1';
            body.style.transform = 'none';
            const target = Math.max(body.scrollHeight, 1);
            body.style.maxHeight = `${Math.min(currentHeight, target)}px`;
            body.style.opacity = String(currentOpacity);
            body.style.transform = currentTransform;
            void body.offsetHeight;
            const d = durationFor(target);
            body.style.willChange = 'max-height, opacity, transform';
            body.style.transition = `max-height ${d}ms ${expandMotion.height}, opacity ${Math.round(d * 0.72)}ms ease, transform ${Math.round(d * 0.92)}ms ${expandMotion.content}`;
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
            body.style.transition = `max-height ${d}ms ${collapseMotion.height}, opacity ${Math.round(d * 0.62)}ms ease, transform ${Math.round(d * 0.82)}ms ${collapseMotion.content}`;
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
    initZramAdvancedFold() {
        this.initAdvancedFold('zram-advanced-toggle', 'zram-advanced-body', { defaultOpen: false });
    },
    setSubSettingsExpanded(settings, show, options = {}) {
        if (!settings) return;
        const instant = options.instant === true || this.isInitializing;
        const expandDuration = 320;
        const collapseDuration = 260;
        const hidden = settings.classList.contains('hidden');
        const expanded = settings.classList.contains('sub-settings-expanded');
        if (!instant && ((show && expanded && !hidden) || (!show && hidden))) return;
        const revision = (settings._expandRevision || 0) + 1;
        settings._expandRevision = revision;
        if (settings._expandTimer) {
            clearTimeout(settings._expandTimer);
            settings._expandTimer = null;
        }
        if (instant) {
            settings.classList.toggle('hidden', !show);
            settings.classList.toggle('sub-settings-expanded', show);
            settings.style.maxHeight = show ? 'none' : '0px';
            settings.style.opacity = show ? '1' : '0';
            settings.style.transform = show ? 'translateY(0)' : 'translateY(-6px)';
            settings.style.overflow = show ? 'visible' : 'hidden';
            return;
        }
        settings.style.overflow = 'hidden';
        settings.style.willChange = 'max-height, opacity, transform';
        if (show) {
            settings.classList.remove('hidden');
            settings.classList.remove('sub-settings-expanded');
            settings.style.transition = 'none';
            settings.style.maxHeight = '0px';
            settings.style.opacity = '0';
            settings.style.transform = 'translateY(-6px)';
            const targetHeight = settings.scrollHeight;
            requestAnimationFrame(() => {
                if (settings._expandRevision !== revision) return;
                settings.style.transition = `max-height ${expandDuration}ms var(--motion-ease), opacity 180ms ease, transform ${expandDuration}ms var(--motion-spring)`;
                settings.style.maxHeight = `${targetHeight}px`;
                settings.style.opacity = '1';
                settings.style.transform = 'translateY(0)';
                settings.classList.add('sub-settings-expanded');
            });
            settings._expandTimer = setTimeout(() => {
                if (settings._expandRevision !== revision) return;
                settings.style.maxHeight = 'none';
                settings.style.overflow = 'visible';
                settings.style.willChange = 'auto';
                settings._expandTimer = null;
            }, expandDuration + 40);
            return;
        }
        if (settings.classList.contains('hidden')) return;
        settings.style.transition = 'none';
        settings.style.maxHeight = `${settings.scrollHeight}px`;
        settings.style.opacity = '1';
        settings.style.transform = 'translateY(0)';
        void settings.offsetHeight;
        requestAnimationFrame(() => {
            if (settings._expandRevision !== revision) return;
            settings.style.transition = `max-height ${collapseDuration}ms var(--motion-ease), opacity 160ms ease, transform ${collapseDuration}ms var(--motion-ease)`;
            settings.style.maxHeight = '0px';
            settings.style.opacity = '0';
            settings.style.transform = 'translateY(-6px)';
            settings.classList.remove('sub-settings-expanded');
        });
        settings._expandTimer = setTimeout(() => {
            if (settings._expandRevision !== revision) return;
            settings.classList.add('hidden');
            settings.style.overflow = 'hidden';
            settings.style.willChange = 'auto';
            settings._expandTimer = null;
        }, collapseDuration + 40);
    },
    async getPreferredBlockDevice() {
        const device = (await this.exec("for d in /sys/block/*; do b=$(basename \"$d\"); case \"$b\" in loop*|ram*|zram*|dm-*) continue ;; esac; [ -d \"$d/queue\" ] || continue; echo \"$b\"; break; done")).trim();
        return device || '';
    },
    setFeatureSupport(target, supported) {
        const element = typeof target === 'string' ? document.getElementById(target) : target;
        if (!element) return;
        const enabled = !!supported;
        element.classList.toggle('feature-disabled', !enabled);
        if (element.matches('input, button, select')) element.disabled = !enabled;
        element.querySelectorAll('input, button, select').forEach(control => { control.disabled = !enabled; });
        element.querySelectorAll('.option-item').forEach(item => {
            item.classList.toggle('feature-disabled', !enabled);
            item.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        });
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
        const raw = String(zramPath || '').trim().split('/').filter(Boolean).pop() || '';
        return raw.replace(/[^a-zA-Z0-9_.-].*$/, '');
    },
    async getActiveSwapInfo(devicePath) {
        const swaps = await this.exec('cat /proc/swaps 2>/dev/null');
        if (!swaps) return null;
        const targetBlock = String(devicePath || '').split('/').pop();
        const lines = swaps.split('\n').slice(1);
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts[0]?.split('/').pop() === targetBlock) {
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
        const heavy = includeHeavy ? `awk '/^SwapTotal:/ { total=$2 } /^SwapFree:/ { free=$2 } END { printf "SWAP %s %s\\n", total+0, free+0 }' /proc/meminfo; df /data 2>/dev/null | awk 'END { printf "STORAGE %s %s %s\\n", $2+0, $3+0, $4+0 }'; temp=0; for zone in /sys/class/thermal/thermal_zone*; do [ -r "$zone/type" ] && [ -r "$zone/temp" ] || continue; type=$(cat "$zone/type" 2>/dev/null | tr '[:upper:]' '[:lower:]'); case "$type" in *cpu*|*cpuss*|*soc*) ;; *) continue ;; esac; value=$(cat "$zone/temp" 2>/dev/null); case "$value" in ''|*[!0-9-]*) continue ;; esac; [ "$value" -ge 10000 ] 2>/dev/null && [ "$value" -le 150000 ] 2>/dev/null || continue; [ "$value" -gt "$temp" ] && temp=$value; done; if [ "$temp" -eq 0 ]; then for node in /sys/class/thermal/thermal_zone*/temp /sys/class/hwmon/hwmon*/temp*_input; do [ -r "$node" ] || continue; value=$(cat "$node" 2>/dev/null); case "$value" in ''|*[!0-9-]*) continue ;; esac; [ "$value" -ge 10000 ] 2>/dev/null && [ "$value" -le 150000 ] 2>/dev/null || continue; temp=$value; break; done; fi; printf 'TEMP %s\\n' "$temp";` : '';
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
    initializeHomeInteractions() {
        if (this.deferredHomeReady) return;
        this.deferredHomeReady = true;
        this.initBannerDrag();
        this.initEasterEgg();
        this.initDeviceImageInteraction();
        this.initScrollEffect();
    },
    async ensureSettingsPageReady() {
        if (this.settingsReadyState === 'ready') return this.settingsInitPromise;
        if (this.settingsInitPromise) return this.settingsInitPromise;
        this.settingsReadyState = 'loading';
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
                if (typeof this.initConfigValidation === 'function') this.initConfigValidation();
                if (typeof this.initSliderProgress === 'function') this.initSliderProgress();
                if (typeof this.initSwapSettings === 'function') this.initSwapSettings();
                if (typeof this.initMemoryPressureSettings === 'function') this.initMemoryPressureSettings();
                if (typeof this.initZramPolicySettings === 'function') this.initZramPolicySettings();
                if (typeof this.initVmSettings === 'function') this.initVmSettings();
                if (typeof this.initZramWriteback === 'function') this.initZramWriteback();
                if (typeof this.initZstdLevel === 'function') this.initZstdLevel();
                if (typeof this.initZramPath === 'function') this.initZramPath();
                if (typeof this.initIoAdvancedFold === 'function') this.initIoAdvancedFold();
                this.settingsUiInitialized = true;
            }
            if (!this.settingsDataLoaded) {
                await Promise.all([
                    this.loadAllConfigs(),
                    this.loadDualCellConfig(),
                    this.detectKernelFeatures()
                ]);
                this.initKernelFeatures();
                this.settingsDataLoaded = true;
            }
        })();
        try {
            await this.settingsInitPromise;
            this.settingsReadyState = 'ready';
            return this.settingsInitPromise;
        } catch (error) {
            this.settingsReadyState = 'idle';
            this.settingsInitPromise = null;
            throw error;
        }
    },
    ensureSettingsSectionReady(section) {
        if (!this.settingsSectionPromises) this.settingsSectionPromises = {};
        if (this.settingsSectionPromises[section]) return this.settingsSectionPromises[section];
        const load = async () => {
            if (section === 'memory-compression') {
                await Promise.all([this.detectZramFeatures(), this.loadZramStatus(), this.loadMemoryPressureStatus()]);
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
                await Promise.all([this.loadAppMetaCache(), this.loadPerformanceModeConfig(), this.loadAppRulesConfig()]);
                this.hydrateInstalledAppsFromCache();
                return;
            }
            if (section === 'custom-scripts') {
                await this.ensureFeatureScript('custom-scripts');
                await this.initCustomScripts();
                return;
            }
            if (section === 'system-opt') {
                await this.ensureFeatureScript('memory-opt');
                await this.initSystemOpt();
                return;
            }
            if (section === 'corona-kernel') {
                await this.ensureFeatureScript('corona-kernel');
                await this.initCoronaKernel();
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
    ensureAllSettingsSectionsReady() {
        if (this.allSettingsSectionsPromise) return this.allSettingsSectionsPromise;
        const sections = ['memory-compression', 'le9ec', 'app-policy', 'custom-scripts', 'system-opt', 'corona-kernel', 'app-settings'];
        this.allSettingsSectionsPromise = (async () => {
            await this.ensureSettingsPageReady();
            await Promise.all(sections.map(section => this.ensureSettingsSectionReady(section)));
        })().catch(error => {
            this.allSettingsSectionsPromise = null;
            throw error;
        });
        return this.allSettingsSectionsPromise;
    },
    initConfigValidation() {
        const button = document.getElementById('config-validation-btn');
        if (!button || button.dataset.bound) return;
        button.dataset.bound = '1';
        button.addEventListener('click', () => this.validateConfiguration('all', { toast: true }));
    },
    async collectConfigurationIssues(scope = 'all') {
        const issues = [];
        const include = name => scope === 'all' || scope === name;
        const memTotalKb = parseInt((await this.exec("awk '/^MemTotal:/ {print $2; exit}' /proc/meminfo 2>/dev/null")).trim(), 10) || 0;

        if (include('zram') && this.state.zramEnabled) {
            const fields = this.zramConfiguredFields || {};
            if (fields.size && memTotalKb > 0) {
                const sizeKb = Math.round(this.state.zramSize * 1024 * 1024);
                if (sizeKb > memTotalKb * 2) issues.push({ type: 'error', message: this.t('validationZramTooLarge') });
            }
            if (fields.priority && (this.state.zramPriority < -1 || this.state.zramPriority > 32767)) {
                issues.push({ type: 'error', message: this.t('validationPriorityRange') });
            }
            const recompression = [this.state.recompAlgorithm1, this.state.recompAlgorithm2, this.state.recompAlgorithm3]
                .filter(algorithm => algorithm && algorithm !== 'none');
            if (new Set(recompression).size !== recompression.length) {
                issues.push({ type: 'error', message: this.t('validationDuplicateRecomp') });
            }
        }

        if ((include('zram') || include('swap')) && this.state.zramEnabled && this.state.swapEnabled) {
            const zramPriorityConfigured = !!this.zramConfiguredFields?.priority;
            const swapPriorityConfigured = !!this.swapConfiguredFields?.priority;
            if (zramPriorityConfigured && swapPriorityConfigured && this.state.zramPriority <= this.state.swapPriority) {
                issues.push({ type: 'error', message: this.t('validationSwapPriorityConflict') });
            }
        }

        if (include('swap') && this.state.swapEnabled) {
            const fields = this.swapConfiguredFields || {};
            if (fields.priority && (this.state.swapPriority < -1 || this.state.swapPriority > 32767)) {
                issues.push({ type: 'error', message: this.t('validationPriorityRange') });
            }
            const swapPath = this.state.swapPath || this.runtimeConfig.swapPath || `${this.modDir}/swapfile.img`;
            const parent = swapPath.substring(0, swapPath.lastIndexOf('/')) || '/data';
            const freeKb = parseInt((await this.exec(`df -k ${this.shellQuote(parent)} 2>/dev/null | awk 'END {print $4}'`)).trim(), 10) || 0;
            if (fields.size && freeKb > 0 && this.state.swapSize * 1024 + 51200 > freeKb) {
                issues.push({ type: 'error', message: this.t('validationSwapSpace') });
            }
        }

        if (include('vm') && this.state.vmEnabled) {
            if (this.state.dirtyBgRatio >= this.state.dirtyRatio) {
                issues.push({ type: 'error', message: this.t('validationDirtyRatio') });
            }
            if (memTotalKb > 0 && this.state.extraFreeKbytes > memTotalKb / 2) {
                issues.push({ type: 'warning', message: this.t('validationExtraFreeHigh') });
            }
        }
        return issues;
    },
    renderConfigurationIssues(issues = []) {
        const status = document.getElementById('config-validation-status');
        if (!status) return;
        if (!issues.length) {
            status.className = 'config-validation-status valid';
            status.textContent = this.t('validationPassed');
            return;
        }
        status.className = 'config-validation-status invalid';
        const escape = value => typeof this.escapeHtml === 'function'
            ? this.escapeHtml(value)
            : String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
        status.innerHTML = issues.map(issue => `<div class="config-validation-issue ${issue.type}">${escape(issue.message)}</div>`).join('');
    },
    async validateConfiguration(scope = 'all', options = {}) {
        const issues = await this.collectConfigurationIssues(scope);
        this.renderConfigurationIssues(issues);
        const errors = issues.filter(issue => issue.type === 'error');
        if (errors.length) this.showToast(`${this.t('validationFailed')}: ${errors[0].message}`);
        else if (options.toast !== false && issues.length) this.showToast(`${this.t('validationWarning')}: ${issues[0].message}`);
        else if (options.toast !== false) this.showToast(this.t('validationPassed'));
        return errors.length === 0;
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
            this.loadSwapStatus(),
            this.loadMemoryPressureConfig(),
            this.loadZramPolicyConfig()
        ];
        await Promise.all(tasks);
        this.updateCpuControlSupport();
        await this.updateModuleDescription();
        this.updateClusterBadge();
        document.querySelectorAll('.range-slider').forEach(slider => this.updateSliderProgress(slider));
    },
    updateClusterBadge() { const badge = document.getElementById('cpu-cluster-badge'); if (badge) { badge.textContent = this.formatClusterInfo() || '--'; } },
    async detectActiveZramPath() {
        const activePath = (await this.exec(`block=$(awk 'NR > 1 { dev=$1; sub(/^.*\\//, "", dev); if (dev ~ /^zram[0-9]+$/) { print dev; exit } }' /proc/swaps 2>/dev/null); if [ -n "$block" ]; then for path in /dev/block/$block /dev/$block; do [ -e "$path" ] && { echo "$path"; exit; }; done; fi`)).trim();
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
    toggleZramSettings(show) {
        const settings = document.getElementById('zram-settings');
        if (!settings) return;
        this.setSubSettingsExpanded(settings, show);
    },
    syncZramControlsFromRuntime(runtimeInfo, fields = {}) {
        if (!runtimeInfo) return;
        const syncAlgorithm = fields.algorithm !== false;
        const syncSize = fields.size !== false;
        const syncSwappiness = fields.swappiness !== false;
        const syncPriority = fields.priority !== false;
        if (syncAlgorithm && runtimeInfo.currentAlg && runtimeInfo.currentAlg !== '--') this.state.algorithm = runtimeInfo.currentAlg;
        if (syncSize && runtimeInfo.sizeBytes > 0) this.state.zramSize = runtimeInfo.sizeBytes / 1024 / 1024 / 1024;
        if (syncSwappiness && Number.isFinite(runtimeInfo.swappinessValue)) this.state.swappiness = runtimeInfo.swappinessValue;
        const sizeSlider = document.getElementById('zram-size-slider');
        if (sizeSlider && syncSize) {
            sizeSlider.value = this.state.zramSize;
            this.updateSliderProgress(sizeSlider);
        }
        const sizeValue = document.getElementById('zram-size-value');
        if (sizeValue && syncSize) sizeValue.textContent = `${this.state.zramSize.toFixed(2)} GB`;
        const swSlider = document.getElementById('swappiness-slider');
        if (swSlider && syncSwappiness) {
            swSlider.value = this.state.swappiness;
            this.updateSliderProgress(swSlider);
        }
        const swValue = document.getElementById('swappiness-value');
        if (swValue && syncSwappiness) swValue.textContent = this.state.swappiness;
        if (syncPriority && Number.isFinite(Number(runtimeInfo.priority))) this.state.zramPriority = parseInt(runtimeInfo.priority, 10);
        if (syncPriority) this.renderZramPriorityOptions();
        if (syncAlgorithm) this.renderAlgorithmOptions();
    },
    renderZramPriorityOptions() {
        const list = document.getElementById('zram-priority-list');
        if (!list) return;
        const presetPriorities = [100, 1000, 32758];
        const custom = !presetPriorities.includes(this.state.zramPriority);
        list.querySelectorAll('.option-item').forEach(item => {
            const selected = item.dataset.custom === '1'
                ? custom
                : parseInt(item.dataset.value, 10) === this.state.zramPriority;
            item.classList.toggle('selected', selected);
        });
        this.syncAnimatedOptionIndicator(list);
        const editor = document.getElementById('zram-priority-custom-editor');
        const input = document.getElementById('zram-priority-custom-input');
        if (editor) editor.classList.toggle('visible', custom);
        if (input) input.value = String(this.state.zramPriority);
    },
    syncAnimatedOptionIndicator(target) {
        const list = typeof target === 'string' ? document.getElementById(target) : target;
        if (!list) return;
        const items = [...list.querySelectorAll('.option-item')];
        const selectedIndex = items.findIndex(item => item.classList.contains('selected'));
        list.style.setProperty('--animated-option-count', String(Math.max(1, items.length)));
        list.style.setProperty('--animated-option-index', String(Math.max(0, selectedIndex)));
        list.classList.toggle('indicator-ready', selectedIndex >= 0);
    },
    async loadZramConfig() {
        const config = await this.readConfig('zram.conf');
        if (config) {
            const algMatch = config.match(/algorithm=(\S+)/);
            const sizeMatch = config.match(/size=(\d+)/);
            const swapMatch = config.match(/swappiness=(\d+)/);
            const enabledMatch = config.match(/enabled=(\d)/);
            const pathMatch = config.match(/zram_path=(\S+)/);
            const priorityMatch = config.match(/priority=(-?\d+)/);
            const directSwapMatch = config.match(/direct_swappiness=(\d+)/);
            const usedLimitMatch = config.match(/zram_used_limit_mb=(\d+)/);
            const increaseMatch = config.match(/hybridswap_zram_increase=(\d+)/);
            const quotaMatch = config.match(/hybridswap_quota_day=(\d+)/);
            this.zramConfiguredFields = {
                algorithm: !!algMatch,
                size: !!sizeMatch,
                swappiness: !!swapMatch,
                priority: !!priorityMatch
            };
            if (directSwapMatch) this.state.directSwappiness = parseInt(directSwapMatch[1], 10);
            if (usedLimitMatch) this.state.zramUsedLimitMb = parseInt(usedLimitMatch[1], 10);
            if (increaseMatch) this.state.hybridswapIncreaseMb = parseInt(increaseMatch[1], 10);
            if (quotaMatch) this.state.hybridswapQuotaGb = parseInt(quotaMatch[1], 10) / 1024 / 1024 / 1024;
            if (algMatch) { this.state.algorithm = algMatch[1]; this.renderAlgorithmOptions(); }
            if (sizeMatch) { this.state.zramSize = parseInt(sizeMatch[1]) / 1024 / 1024 / 1024; }
            if (swapMatch) { this.state.swappiness = parseInt(swapMatch[1]); }
            if (priorityMatch) this.state.zramPriority = parseInt(priorityMatch[1], 10);
            this.syncZramControlsFromRuntime({}, {
                algorithm: false,
                size: !!sizeMatch,
                swappiness: !!swapMatch,
                priority: !!priorityMatch
            });
            if (enabledMatch) {
                this.state.zramEnabled = enabledMatch[1] === '1';
                const zramSwitch = document.getElementById('zram-switch');
                if (zramSwitch) zramSwitch.checked = this.state.zramEnabled;
                this.toggleZramSettings(this.state.zramEnabled);
            }
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
            this.zramConfiguredFields = {};
            const sw = document.getElementById('zram-switch');
            if (sw) sw.checked = false;
            this.toggleZramSettings(false);
        }
        await this.loadLoopConfig(config);
        await this.loadZramOfficialExtensions();
        if (typeof this.updateLoopControlState === 'function') this.updateLoopControlState();
        await this.loadZramStatus();
    },
    async loadLoopConfig(legacyZramConfig = '') {
        const loopConfig = await this.readConfig('loop.conf');
        const source = loopConfig || legacyZramConfig;
        const officialSizesRaw = await this.exec('getprop persist.sys.oplus.nandswap.cfg 2>/dev/null');
        const officialSizes = String(officialSizesRaw || '')
            .split(/[\s,]+/)
            .map(value => parseInt(value, 10))
            .filter(value => Number.isFinite(value) && value > 0);
        this.loopSizeOptions = [...new Set(officialSizes)].sort((left, right) => left - right);
        this.loopSizeFixed = this.loopSizeOptions.length > 0;
        const enabledMatch = loopConfig
            ? loopConfig.match(/enabled=(\d)/)
            : source.match(/zram_writeback=(\S+)/);
        const sizeMatch = loopConfig
            ? loopConfig.match(/size_mb=(\d+)/)
            : source.match(/writeback_size_mb=(\d+)/);
        this.state.loopEnabled = loopConfig
            ? enabledMatch?.[1] === '1'
            : enabledMatch?.[1] === 'true';
        let requestedSize = 0;
        if (sizeMatch) {
            requestedSize = Math.max(1, Math.round(parseInt(sizeMatch[1], 10) / 1024));
        } else {
            const officialSize = parseInt((await this.exec('getprop persist.sys.oplus.nandswap.swapsize.curr 2>/dev/null || getprop persist.sys.oplus.nandswap.swapsize 2>/dev/null')).trim(), 10);
            if (Number.isFinite(officialSize) && officialSize > 0) requestedSize = officialSize;
        }
        if (this.loopSizeFixed) {
            if (!requestedSize) requestedSize = this.loopSizeOptions[this.loopSizeOptions.length - 1];
            this.state.loopSizeGb = this.loopSizeOptions.reduce((nearest, candidate) => (
                Math.abs(candidate - requestedSize) < Math.abs(nearest - requestedSize) ? candidate : nearest
            ), this.loopSizeOptions[0]);
        } else {
            this.state.loopSizeGb = Math.max(1, Math.min(16, requestedSize || 4));
        }
        const toggle = document.getElementById('zram-writeback-switch');
        if (toggle) toggle.checked = this.state.loopEnabled;
        this.renderLoopSizeOptions();
        const configuredSizeMb = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
        if (loopConfig && configuredSizeMb > 0 && configuredSizeMb !== this.state.loopSizeGb * 1024) {
            await this.persistLoopConfig('size_mb');
        }
        if (!loopConfig && (enabledMatch || sizeMatch)) await this.persistLoopConfig('loop');
    },
    renderLoopSizeOptions() {
        const container = document.getElementById('zram-writeback-size-options');
        const sliderContainer = document.getElementById('zram-writeback-size-slider-container');
        const slider = document.getElementById('zram-writeback-size-slider');
        const value = document.getElementById('zram-writeback-size-value');
        if (container) {
            container.hidden = !this.loopSizeFixed;
            if (this.loopSizeFixed) {
                const selectedIndex = Math.max(0, this.loopSizeOptions.indexOf(this.state.loopSizeGb));
                container.style.setProperty('--writeback-size-count', String(this.loopSizeOptions.length));
                container.style.setProperty('--writeback-size-index', String(selectedIndex));
                container.style.gridTemplateColumns = `repeat(${this.loopSizeOptions.length}, minmax(0, 1fr))`;
                container.innerHTML = this.loopSizeOptions.map(size => {
                    const selected = size === this.state.loopSizeGb;
                    return `<button type="button" class="writeback-size-option${selected ? ' selected' : ''}" data-size-gb="${size}" role="radio" aria-checked="${selected}">${size} GB</button>`;
                }).join('');
            }
        }
        if (sliderContainer) sliderContainer.hidden = this.loopSizeFixed;
        if (!this.loopSizeFixed && slider) {
            slider.value = String(this.state.loopSizeGb);
            this.updateSliderProgress(slider);
        }
        if (!this.loopSizeFixed && value) value.textContent = `${this.state.loopSizeGb} GB`;
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
        const command = `emit_value() { tag="$1"; value="$2"; printf '%s ' "$tag"; printf '%s' "$value" | base64 2>/dev/null | tr -d '\\r\\n'; printf '\\n'; }; configured=${path}; active_entry=$(awk 'NR > 1 { dev=$1; sub(/^.*\\//, "", dev); if (dev ~ /^zram[0-9]+$/) { print $1; exit } }' /proc/swaps 2>/dev/null); active_block=\${active_entry##*/}; configured_block=\${configured##*/}; block=\${active_block:-$configured_block}; case "$block" in zram[0-9]*) ;; *) block= ;; esac; zram_path=$configured; if [ -n "$active_block" ]; then for candidate in /dev/block/$active_block /dev/$active_block; do [ -e "$candidate" ] && { zram_path=$candidate; break; }; done; fi; emit_value PATH "$zram_path"; if [ -n "$block" ]; then base=/sys/block/$block; emit_value ALG "$(cat "$base/comp_algorithm" 2>/dev/null)"; emit_value SIZE "$(cat "$base/disksize" 2>/dev/null)"; emit_value MM "$(cat "$base/mm_stat" 2>/dev/null)"; emit_value BLOCK "$(cat "$base/stat" 2>/dev/null)"; fi; emit_value SWAPPINESS "$(cat /proc/sys/vm/swappiness 2>/dev/null)"; emit_value SWAP "$(awk -v block="$block" 'NR > 1 { dev=$1; sub(/^.*\\//, "", dev); if (dev == block) { print $1, $2, $3, $4, $5; exit } }' /proc/swaps 2>/dev/null)"`;
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
            blockStat: values.BLOCK || '',
            swapInfo: swapParts.length >= 5 ? { device: swapParts[0], type: swapParts[1], size: swapParts[2], used: swapParts[3], priority: swapParts[4] } : null
        };
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
        const algRaw = snapshot.algorithm;
        const disksize = snapshot.disksize;
        const swappiness = snapshot.swappiness;
        const swapInfo = snapshot.swapInfo;
        const mmStatRaw = snapshot.mmStat;
        const blockStatRaw = snapshot.blockStat;
        const currentAlg = algRaw.match(/\[([^\]]+)\]/)?.[1] || algRaw.split(' ')[0] || '--';
        const sizeGB = disksize ? (parseInt(disksize) / 1024 / 1024 / 1024).toFixed(1) : '0';
        const swappinessValue = parseInt((swappiness || '').trim(), 10);
        this.setMetricValue('zram-current-alg', currentAlg && currentAlg !== '--' ? currentAlg : '', { always: true });
        this.setMetricValue('zram-current-size', disksize && parseInt(disksize, 10) > 0 ? `${sizeGB} GB` : '', { always: true });
        this.setMetricValue('zram-current-swappiness', (swappiness || '').trim() || '', { always: true });
        this.setMetricValue('zram-current-priority', swapInfo?.priority || '', { always: true });
        this.setMetricValue('zram-current-path', zramPath || '', { always: true });

        // mm_stat and block layer statistics
        const mmStat = this.parseNumericList(mmStatRaw);
        const rawDataSize = Number(mmStat[0] || 0);
        const compressedSize = Number(mmStat[1] || 0);
        const physicalMemoryUsed = Number(mmStat[2] || 0);
        const compressionRatio = this.formatZramRatio(rawDataSize, compressedSize);

        // block layer stat: read_sectors / write_sectors (512-byte units)
        const blockStat = this.parseNumericList(blockStatRaw);
        const totalReadBytes = Number(blockStat[2] || 0) * 512;
        const totalWriteBytes = Number(blockStat[6] || 0) * 512;

        const runtime = !!(disksize && parseInt(disksize, 10) > 0);
        const swapSizeBytes = Number(swapInfo?.size || 0) * 1024;
        const swapUsedBytes = Number(swapInfo?.used || 0) * 1024;
        const swapUsedPercent = swapSizeBytes > 0 ? Math.min(100, (swapUsedBytes / swapSizeBytes) * 100) : 0;
        const overviewState = document.getElementById('zram-overview-state');
        const overviewUsed = document.getElementById('zram-overview-used');
        const overviewMemory = document.getElementById('zram-overview-memory');
        const overviewRatio = document.getElementById('zram-overview-ratio');
        const overviewProgress = document.getElementById('zram-overview-progress');
        if (overviewState) overviewState.textContent = swapInfo ? this.t('active') : this.t('inactive');
        if (overviewUsed) overviewUsed.textContent = swapSizeBytes > 0 ? `${this.formatBytes(swapUsedBytes)} / ${this.formatBytes(swapSizeBytes)}` : '--';
        if (overviewMemory) overviewMemory.textContent = physicalMemoryUsed > 0 ? this.formatBytes(physicalMemoryUsed) : '--';
        if (overviewRatio) overviewRatio.textContent = compressionRatio !== '--' ? compressionRatio : '--';
        if (overviewProgress) overviewProgress.style.width = `${swapUsedPercent.toFixed(1)}%`;
        const opt = { always: runtime };
        this.setMetricValue('zram-raw-size', this.formatBytes(rawDataSize), opt);
        this.setMetricValue('zram-compr-size', this.formatBytes(compressedSize), opt);
        this.setMetricValue('zram-mem-used', this.formatBytes(physicalMemoryUsed), opt);
        this.setMetricValue('zram-compr-ratio', compressionRatio !== '--' ? compressionRatio : '0:1', opt);
        this.setMetricValue('zram-total-reads', this.formatBytes(totalReadBytes), opt);
        this.setMetricValue('zram-total-writes', this.formatBytes(totalWriteBytes), opt);
        this.refreshMetricCard('zram-status-card');

        const isActive = !!swapInfo;
        const runtimeInfo = {
            currentAlg,
            sizeBytes: parseInt(disksize || '0', 10) || 0,
            swappinessValue,
            priority: swapInfo?.priority,
            isActive,
            path: zramPath,
            compressionRatio,
            physicalMemoryUsed
        };
        const configuredFields = this.zramConfiguredFields || {};
        this.syncZramControlsFromRuntime(runtimeInfo, {
            algorithm: !this.state.zramEnabled || !configuredFields.algorithm,
            size: !this.state.zramEnabled || !configuredFields.size,
            swappiness: !this.state.zramEnabled || !configuredFields.swappiness,
            priority: !this.state.zramEnabled || !configuredFields.priority
        });

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
    async loadZramOfficialExtensions() {
        const zramBlock = this.getZramBlockName(this.state.zramPath) || 'zram0';
        const raw = await this.exec(`for node in /proc/oplus_mem/swappiness_para /proc/oplus_healthinfo/swappiness_para; do [ -r "$node" ] || continue; awk -F': *' '/^direct_swappiness:/ { print "DIRECT=" $2; exit }' "$node"; break; done; [ -r /dev/memcg/memory.zram_used_limit_mb ] && echo LIMIT=$(cat /dev/memcg/memory.zram_used_limit_mb); [ -r /sys/block/${zramBlock}/hybridswap_zram_increase ] && echo INCREASE=$(cat /sys/block/${zramBlock}/hybridswap_zram_increase); [ -r /sys/block/${zramBlock}/hybridswap_quota_day ] && echo QUOTA=$(cat /sys/block/${zramBlock}/hybridswap_quota_day)`);
        const values = Object.fromEntries(String(raw || '').split(/\n/).map(line => line.split('=')).filter(parts => parts.length === 2));
        const configured = this.parseIoConfig(await this.readConfig('zram.conf'));
        const controls = [
            ['DIRECT', 'direct_swappiness', 'directSwappiness', 'direct-swappiness', value => parseInt(value, 10), value => String(value)],
            ['LIMIT', 'zram_used_limit_mb', 'zramUsedLimitMb', 'zram-used-limit', value => parseInt(value, 10), value => `${value} MB`],
            ['INCREASE', 'hybridswap_zram_increase', 'hybridswapIncreaseMb', 'hybridswap-increase', value => parseInt(value, 10), value => `${value} MB`],
            ['QUOTA', 'hybridswap_quota_day', 'hybridswapQuotaGb', 'hybridswap-quota', value => parseInt(value, 10) / 1024 / 1024 / 1024, value => `${Math.round(value)} GB`]
        ];
        controls.forEach(([runtimeKey, configKey, stateKey, id, parser, formatter]) => {
            const section = document.getElementById(`${id}-section`);
            const supported = values[runtimeKey] !== undefined && values[runtimeKey] !== '';
            if (section) { section.hidden = !supported; section.style.display = supported ? '' : 'none'; }
            if (!supported) return;
            const source = configured[configKey] !== undefined ? configured[configKey] : values[runtimeKey];
            const parsed = parser(source);
            if (Number.isFinite(parsed)) this.state[stateKey] = parsed;
            const slider = document.getElementById(`${id}-slider`);
            const value = document.getElementById(`${id}-value`);
            if (slider) { slider.value = this.state[stateKey]; this.updateSliderProgress(slider); }
            if (value) value.textContent = formatter(this.state[stateKey]);
        });
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
            this.markZramDirty('zstd_compression_level');
        });
    },
    markZramDirty(changedField) {
        this._zramDirty = true;
        if (['algorithm', 'size', 'swappiness', 'priority', 'direct_swappiness', 'zram_used_limit_mb', 'hybridswap_zram_increase', 'hybridswap_quota_day'].includes(changedField)) {
            this.zramConfiguredFields = this.zramConfiguredFields || {};
            this.zramConfiguredFields[changedField] = true;
        }
        const btn = document.getElementById('zram-apply-btn');
        if (btn && !btn.dataset.dirtyHint) {
            btn.dataset.dirtyHint = '1';
            btn.textContent = this.t('applyZramDirty');
        }
        if (changedField) {
            const revision = (this._zramConfigRevision || 0) + 1;
            this._zramConfigRevision = revision;
            this.persistZramConfig(changedField)
                .then(() => {
                    if (this._zramConfigRevision === revision) this.showToast('ZRAM 配置已保存');
                })
                .catch(() => {
                    if (this._zramConfigRevision === revision) this.showToast('ZRAM 配置保存失败');
                });
        }
    },
    clearZramDirty() {
        this._zramDirty = false;
        const btn = document.getElementById('zram-apply-btn');
        if (btn) {
            btn.dataset.dirtyHint = '';
            btn.textContent = this.t('applyZram');
        }
    },
    markSwapDirty(changedField) {
        this._swapDirty = true;
        if (['size', 'priority', 'path'].includes(changedField)) {
            this.swapConfiguredFields = this.swapConfiguredFields || {};
            this.swapConfiguredFields[changedField] = true;
        }
        const btn = document.getElementById('swap-apply-btn');
        if (btn) btn.textContent = '应用 Swap 配置 *';
        if (changedField) {
            const revision = (this._swapConfigRevision || 0) + 1;
            this._swapConfigRevision = revision;
            this.persistSwapConfig(changedField)
                .then(() => {
                    if (this._swapConfigRevision === revision) this.showToast('Swap 配置已保存');
                })
                .catch(() => {
                    if (this._swapConfigRevision === revision) this.showToast('Swap 配置保存失败');
                });
        }
    },
    clearSwapDirty() {
        this._swapDirty = false;
        const btn = document.getElementById('swap-apply-btn');
        if (btn) btn.textContent = '应用 Swap 配置';
    },
    getZramFieldUpdates(changedField = 'enabled') {
        const sizeBytes = Math.round(this.state.zramSize * 1024 * 1024 * 1024);
        const field = changedField || 'enabled';
        const updates = {};
        if (field === 'zram' || field === 'enabled') updates.enabled = this.state.zramEnabled ? '1' : '0';
        if (field === 'zram' || field === 'algorithm') updates.algorithm = this.state.algorithm;
        if (field === 'zram' || field === 'zstd_compression_level') updates.zstd_compression_level = String(this.state.zstdCompressionLevel || 1);
        if (field === 'zram' || field === 'recomp_algorithm1') updates.recomp_algorithm1 = this.state.recompAlgorithm1 || 'none';
        if (field === 'zram' || field === 'recomp_algorithm2') updates.recomp_algorithm2 = this.state.recompAlgorithm2 || 'none';
        if (field === 'zram' || field === 'recomp_algorithm3') updates.recomp_algorithm3 = this.state.recompAlgorithm3 || 'none';
        if (field === 'zram' || field === 'size') updates.size = String(sizeBytes);
        if (field === 'zram' || field === 'swappiness') updates.swappiness = String(this.state.swappiness);
        if (field === 'zram' || field === 'direct_swappiness') updates.direct_swappiness = String(this.state.directSwappiness);
        if (field === 'zram' || field === 'zram_used_limit_mb') updates.zram_used_limit_mb = String(this.state.zramUsedLimitMb);
        if (field === 'zram' || field === 'hybridswap_zram_increase') updates.hybridswap_zram_increase = String(this.state.hybridswapIncreaseMb);
        if (field === 'zram' || field === 'hybridswap_quota_day') updates.hybridswap_quota_day = String(Math.round(this.state.hybridswapQuotaGb * 1024 * 1024 * 1024));
        if (field === 'zram' || field === 'priority') updates.priority = String(this.state.zramPriority);
        if (field === 'zram' || field === 'zram_path') updates.zram_path = this.state.zramPath;
        return updates;
    },
    getZramConfigKeys() {
        return ['enabled', 'algorithm', 'recomp_algorithm1', 'recomp_algorithm2', 'recomp_algorithm3', 'zstd_compression_level', 'size', 'swappiness', 'direct_swappiness', 'zram_used_limit_mb', 'hybridswap_zram_increase', 'hybridswap_quota_day', 'priority', 'zram_path'];
    },
    persistLoopConfig(changedField = 'enabled') {
        const save = this.withLock('loop-config', async () => {
            const updates = {};
            if (changedField === 'loop' || changedField === 'enabled') updates.enabled = this.state.loopEnabled ? '1' : '0';
            if (changedField === 'loop' || changedField === 'size_mb') updates.size_mb = String(Math.round(this.state.loopSizeGb * 1024));
            await this.mergeConfigFile('loop.conf', updates, ['enabled', 'size_mb']);
            await this.removeConfigKeys('zram.conf', ['zram_writeback', 'writeback_size_mb'], this.getZramConfigKeys());
            return true;
        });
        this._loopConfigSavePromise = save;
        return save;
    },
    markWritebackBlockDirty() {
        const button = document.getElementById('zram-loop-action');
        if (!button) return;
        button.dataset.dirtyHint = '1';
        button.textContent = this.t('applyWritebackBlockDirty');
    },
    clearWritebackBlockDirty() {
        const button = document.getElementById('zram-loop-action');
        if (!button) return;
        button.dataset.dirtyHint = '';
        button.textContent = this.t('applyWritebackBlock');
    },
    async applyLoopImmediate() {
        return this.withLock('loop-apply', async () => {
            const command = this.state.loopEnabled ? 'start' : 'stop';
            const button = document.getElementById('zram-loop-action');
            let succeeded = false;
            try {
                if (this._loopConfigSavePromise) await this._loopConfigSavePromise.catch(() => {});
                const configured = this.parseIoConfig(await this.readConfig('loop.conf'));
                if (command === 'start' && !configured.size_mb) {
                    this.showToast(this.t('writebackBlockSizeRequired'), 'warning');
                    return false;
                }
                if (button) button.disabled = true;
                this.showLoading(true);
                const service = this.shellQuote(`${this.modDir}/service.sh`);
                const result = await this.execResult(`/system/bin/sh ${service} --apply-writeback-block`);
                await this.refreshZramLoopDevice(false, true);
                succeeded = result.code === 0 && (command === 'stop' ? !this._loopActive : this._loopActive);
                if (succeeded) this.clearWritebackBlockDirty();
            } catch (error) {
                try { await this.refreshZramLoopDevice(false, true); } catch (refreshError) {}
            } finally {
                this.showLoading(false);
                if (button) button.disabled = !this.zramFeatures?.writebackControl;
            }
            this.showToast(this.t(succeeded
                ? (command === 'stop' ? 'writebackBlockDisabled' : 'writebackBlockApplied')
                : 'writebackBlockApplyFailed'), succeeded ? 'success' : 'error');
            return succeeded;
        });
    },
    persistZramConfig(changedField = 'enabled') {
        const save = this.withLock('zram-config', async () => {
            await this.mergeConfigFile('zram.conf', this.getZramFieldUpdates(changedField), this.getZramConfigKeys());
            await this.updateModuleDescription();
            return true;
        });
        this._zramConfigSavePromise = save;
        return save;
    },
    async saveZramConfig(changedField = 'enabled', skipPreview = false) {
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
        const expectPriority = options.priority !== undefined ? options.priority : this.state.zramPriority;
        const extensionExpected = options.extensions || {};
        const checkAlg = options.checkAlgorithm !== false;
        const checkSize = options.checkSize !== false;
        const checkSwap = options.checkSwappiness !== false;
        const checkZstd = options.checkZstd === true || (this.usesZstdAlgorithm && this.usesZstdAlgorithm() && this.zramFeatures && this.zramFeatures.zstdLevel);
        const checkRecomp = options.checkRecomp === true;
        const checkPriority = options.checkPriority === true;

        // wait a bit for nandswap/mm-sys chain to settle
        await this.sleep(options.delayMs || 800);

        const zramPath = await this.detectActiveZramPath() || this.state.zramPath;
        const zramBlock = this.getZramBlockName(zramPath);
        if (!zramBlock) {
            this.showToast('ZRAM 校验失败：未找到活动设备');
            return false;
        }

        const mismatches = [];
        const [algRaw, disksizeRaw, swapRaw, oplusSwapRaw, zstdRaw, recompRaw, priorityRaw, directRaw, usedLimitRaw, increaseRaw, quotaRaw] = await Promise.all([
            this.exec(`cat /sys/block/${zramBlock}/comp_algorithm 2>/dev/null`),
            this.exec(`cat /sys/block/${zramBlock}/disksize 2>/dev/null`),
            this.exec('cat /proc/sys/vm/swappiness 2>/dev/null'),
            checkSwap ? this.exec(`for node in /proc/oplus_mem/swappiness_para /proc/oplus_healthinfo/swappiness_para; do [ -r "$node" ] || continue; awk -F': *' '/^vm_swappiness:/ { print $2; exit }' "$node"; break; done`) : Promise.resolve(''),
            checkZstd ? this.exec('cat /sys/module/zstd/parameters/compression_level 2>/dev/null') : Promise.resolve(''),
            this.zramFeatures && this.zramFeatures.multiComp
                ? this.exec(`cat /sys/block/${zramBlock}/recomp_algorithm 2>/dev/null`)
                : Promise.resolve(''),
            checkPriority ? this.exec(`awk -v block=${this.shellQuote(zramBlock)} 'NR > 1 { dev=$1; sub(/^.*\//, "", dev); if (dev == block) { print $5; exit } }' /proc/swaps 2>/dev/null`) : Promise.resolve(''),
            extensionExpected.direct_swappiness !== undefined ? this.exec(`for node in /proc/oplus_mem/swappiness_para /proc/oplus_healthinfo/swappiness_para; do [ -r "$node" ] || continue; awk -F': *' '/^direct_swappiness:/ { print $2; exit }' "$node"; break; done`) : Promise.resolve(''),
            extensionExpected.zram_used_limit_mb !== undefined ? this.exec('cat /dev/memcg/memory.zram_used_limit_mb 2>/dev/null') : Promise.resolve(''),
            extensionExpected.hybridswap_zram_increase !== undefined ? this.exec(`cat /sys/block/${zramBlock}/hybridswap_zram_increase 2>/dev/null`) : Promise.resolve(''),
            extensionExpected.hybridswap_quota_day !== undefined ? this.exec(`cat /sys/block/${zramBlock}/hybridswap_quota_day 2>/dev/null`) : Promise.resolve('')
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
            const oplusNow = parseInt(String(oplusSwapRaw || '').trim(), 10);
            if (Number.isFinite(oplusNow) && Number.isFinite(want) && oplusNow !== want) {
                mismatches.push(`Oplus swappiness ${oplusNow}≠${want}`);
            }
        }

        if (checkZstd && expectZstd !== undefined && expectZstd !== null && expectZstd !== '') {
            const now = parseInt(String(zstdRaw || '').trim(), 10);
            const want = parseInt(expectZstd, 10);
            if (Number.isFinite(now) && Number.isFinite(want) && now !== want) {
                mismatches.push(`zstd ${now}≠${want}`);
            }
        }

        if (checkPriority) {
            const now = parseInt(String(priorityRaw || '').trim(), 10);
            const want = parseInt(expectPriority, 10);
            if (Number.isFinite(now) && Number.isFinite(want) && now !== want) mismatches.push(`优先级 ${now}≠${want}`);
        }

        [
            ['direct_swappiness', directRaw],
            ['zram_used_limit_mb', usedLimitRaw],
            ['hybridswap_zram_increase', increaseRaw],
            ['hybridswap_quota_day', quotaRaw]
        ].forEach(([key, raw]) => {
            if (extensionExpected[key] === undefined) return;
            const now = parseInt(String(raw || '').trim(), 10);
            const want = parseInt(extensionExpected[key], 10);
            if (Number.isFinite(now) && Number.isFinite(want) && now !== want) mismatches.push(`${key} ${now}≠${want}`);
        });

        // soft check recomp: if configured non-none, recomp node should mention algo (best-effort)
        if (checkRecomp && this.zramFeatures && this.zramFeatures.multiComp) {
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
        if (!await this.validateConfiguration('zram', { toast: false })) return false;
        const requestedAlgorithm = this.state.algorithm;
        if (this._zramConfigSavePromise) await this._zramConfigSavePromise.catch(() => {});
        const configured = this.parseIoConfig(await this.readConfig('zram.conf'));
        if (manageLoading) {
            this.showLoading(true);
            await this.sleep(0);
        }
        await this.exec(`/system/bin/sh ${this.modDir}/scripts/apply-zram.sh >/dev/null 2>&1`);
        const appliedConfig = this.parseIoConfig(await this.readConfig('zram.conf'));
        const savedAlgorithm = appliedConfig.algorithm || '';
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
        const actionableKeys = ['algorithm', 'recomp_algorithm1', 'recomp_algorithm2', 'recomp_algorithm3', 'zstd_compression_level', 'size', 'swappiness', 'direct_swappiness', 'zram_used_limit_mb', 'hybridswap_zram_increase', 'hybridswap_quota_day', 'priority', 'zram_path'];
        if (!actionableKeys.some(key => configured[key] !== undefined)) {
            this.showToast('ZRAM 已启用，但未配置参数，未修改当前系统');
            return true;
        }
        const ok = await this.verifyZramApplyResult({
            algorithm: appliedConfig.algorithm,
            sizeBytes: configured.size ? parseInt(configured.size, 10) : undefined,
            swappiness: configured.swappiness,
            zstdLevel: configured.zstd_compression_level,
            checkAlgorithm: !!appliedConfig.algorithm,
            checkSize: configured.size !== undefined,
            checkSwappiness: configured.swappiness !== undefined,
            priority: configured.priority,
            checkPriority: configured.priority !== undefined,
            checkZstd: configured.zstd_compression_level !== undefined,
            checkRecomp: ['recomp_algorithm1', 'recomp_algorithm2', 'recomp_algorithm3'].some(key => configured[key] !== undefined),
            extensions: Object.fromEntries(['direct_swappiness', 'zram_used_limit_mb', 'hybridswap_zram_increase', 'hybridswap_quota_day']
                .filter(key => configured[key] !== undefined)
                .map(key => [key, configured[key]]))
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
        const queuePath = preferred ? `/sys/block/${preferred}/queue` : '';
        const [schedulerRaw, readahead, nrRequests, rqAffinity, nomerges, iostats, supportRaw] = await Promise.all([
            queuePath ? this.exec(`cat ${queuePath}/scheduler 2>/dev/null`) : Promise.resolve(''),
            queuePath ? this.exec(`cat ${queuePath}/read_ahead_kb 2>/dev/null`) : Promise.resolve(''),
            queuePath ? this.exec(`cat ${queuePath}/nr_requests 2>/dev/null`) : Promise.resolve(''),
            queuePath ? this.exec(`cat ${queuePath}/rq_affinity 2>/dev/null`) : Promise.resolve(''),
            queuePath ? this.exec(`cat ${queuePath}/nomerges 2>/dev/null`) : Promise.resolve(''),
            queuePath ? this.exec(`cat ${queuePath}/iostats 2>/dev/null`) : Promise.resolve(''),
            queuePath ? this.exec(`q=${queuePath}; for key in scheduler read_ahead_kb nr_requests rq_affinity nomerges iostats; do [ -w "$q/$key" ] && echo "$key=1" || echo "$key=0"; done`) : Promise.resolve('')
        ]);
        this.ioFeatureSupport = {};
        supportRaw.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=([01])$/);
            if (match) this.ioFeatureSupport[match[1]] = match[2] === '1';
        });
        const conf = await this.readConfig('io_scheduler.conf');
        const saved = this.parseIoConfig(conf);
        this.state.ioEnabled = this.parseEnabledFlag(conf, false);
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
            this.bindOptionItems(container, async value => {
                this.state.ioScheduler = value;
                await this.applyIOSchedulerImmediate();
            }, { enabled: () => this.ioFeatureSupport?.scheduler });
        }
        const currentEl = document.getElementById('io-current');
        if (currentEl) currentEl.textContent = !this.ioFeatureSupport.scheduler ? this.t('unsupported') : (this.state.ioEnabled ? (currentScheduler || '--') : '已禁用');
        const iostatsContainer = document.getElementById('io-iostats-container');
        const iostatsSwitch = document.getElementById('io-iostats-switch');
        if (iostatsSwitch) iostatsSwitch.checked = this.state.ioIostats;
        this.renderReadaheadOptions();
        this.renderIOAdvancedOptions();
        this.setFeatureSupport(container?.closest('.setting-section'), this.ioFeatureSupport.scheduler);
        this.setFeatureSupport(document.getElementById('readahead-list')?.closest('.setting-section'), this.ioFeatureSupport.read_ahead_kb);
        this.setFeatureSupport(document.getElementById('io-nr-requests-list')?.closest('.setting-section'), this.ioFeatureSupport.nr_requests);
        this.setFeatureSupport(document.getElementById('io-rq-affinity-list')?.closest('.setting-section'), this.ioFeatureSupport.rq_affinity);
        this.setFeatureSupport(document.getElementById('io-nomerges-list')?.closest('.setting-section'), this.ioFeatureSupport.nomerges);
        this.setFeatureSupport(iostatsContainer, this.ioFeatureSupport.iostats);
        const ioSupported = Object.values(this.ioFeatureSupport).some(Boolean);
        this.setFeatureSupport(document.getElementById('io-switch')?.closest('.switch-container'), ioSupported);
        this.refreshExpandedContentHeight('io-scheduler-content');
    },
    async applyIOSchedulerImmediate(skipPreview = false) {
        return this.applyIOConfigImmediate('scheduler', skipPreview);
    },
    async loadCpuGovernorConfig() {
        const [governorRaw, currentGovernor, governorWritable] = await Promise.all([
            this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors 2>/dev/null'),
            this.exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null'),
            this.exec('[ -w /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor ] && echo 1 || echo 0')
        ]);
        const conf = await this.readConfig('cpu_governor.conf');
        this.state.cpuEnabled = this.parseEnabledFlag(conf, false);
        const cpuSwitch = document.getElementById('cpu-switch');
        if (cpuSwitch) cpuSwitch.checked = this.state.cpuEnabled;
        const availableGovernors = governorRaw.split(/\s+/).filter(g => g);
        this.cpuGovernorSupported = availableGovernors.length > 0 && governorWritable.trim() === '1';
        let resolved = currentGovernor.trim();
        if (conf) {
            const m = conf.match(/governor=(\S+)/);
            if (m && availableGovernors.includes(m[1])) resolved = m[1];
        }
        this.state.cpuGovernor = resolved;
        const container = document.getElementById('cpu-governor-list');
        if (container) {
            container.innerHTML = availableGovernors.map(g => `<div class="option-item ${g === this.state.cpuGovernor ? 'selected' : ''}" data-value="${g}">${g}</div>`).join('');
            this.bindOptionItems(container, async value => {
                this.state.cpuGovernor = value;
                await this.applyCpuGovernorImmediate('governor');
            }, { enabled: () => this.cpuGovernorSupported });
        }
        const currentEl = document.getElementById('cpu-gov-current');
        if (currentEl) currentEl.textContent = !this.cpuGovernorSupported ? this.t('unsupported') : (this.state.cpuEnabled ? (this.state.cpuGovernor || '--') : '已禁用');
        this.setFeatureSupport(container, this.cpuGovernorSupported);
        this.updateCpuControlSupport();
    },
    updateCpuControlSupport() {
        if (typeof this.cpuGovernorSupported !== 'boolean' || typeof this.cpuHotplugSupported !== 'boolean') return;
        const supported = this.cpuGovernorSupported || this.cpuHotplugSupported;
        this.setFeatureSupport(document.getElementById('cpu-switch')?.closest('.switch-container'), supported);
    },
    async applyCpuGovernorImmediate(changedField = 'governor', skipPreview = false) {
      return this.withLock('governor', async () => {
        if ((changedField === 'governor' || changedField === 'cpu') && !this.cpuGovernorSupported && this.state.cpuEnabled) {
            this.showToast(this.t('unsupported'), 'warning');
            return false;
        }
        const updates = {};
        if (changedField === 'cpu' || changedField === 'enabled') updates.enabled = this.state.cpuEnabled ? '1' : '0';
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
        const [tcpRaw, currentTcp, tcpWritable] = await Promise.all([
            this.exec('cat /proc/sys/net/ipv4/tcp_available_congestion_control 2>/dev/null'),
            this.exec('cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null'),
            this.exec('[ -w /proc/sys/net/ipv4/tcp_congestion_control ] && echo 1 || echo 0')
        ]);
        const conf = await this.readConfig('tcp.conf');
        this.state.tcpEnabled = this.parseEnabledFlag(conf, false);
        const tcpSwitch = document.getElementById('tcp-switch');
        if (tcpSwitch) tcpSwitch.checked = this.state.tcpEnabled;
        const availableTcp = tcpRaw.split(/\s+/).filter(t => t);
        this.tcpSupported = availableTcp.length > 0 && tcpWritable.trim() === '1';
        let resolved = currentTcp.trim();
        if (conf) {
            const m = conf.match(/congestion=(\S+)/);
            if (m && availableTcp.includes(m[1])) resolved = m[1];
        }
        this.state.tcp = resolved;
        const container = document.getElementById('tcp-list');
        container.innerHTML = availableTcp.map(t => `<div class="option-item ${t === this.state.tcp ? 'selected' : ''}" data-value="${t}">${t}</div>`).join('');
        this.bindOptionItems(container, async value => {
            this.state.tcp = value;
            await this.applyTcpImmediate('congestion');
        }, { enabled: () => this.tcpSupported });
        document.getElementById('tcp-current').textContent = !this.tcpSupported ? this.t('unsupported') : (this.state.tcpEnabled ? (this.state.tcp || '--') : '已禁用');
        this.setFeatureSupport(document.getElementById('tcp-switch')?.closest('.switch-container'), this.tcpSupported);
        this.setFeatureSupport(container, this.tcpSupported);
    },
    async applyTcpImmediate(changedField = 'congestion', skipPreview = false) {
      return this.withLock('tcp', async () => {
        if (!this.tcpSupported && this.state.tcpEnabled) {
            this.showToast(this.t('unsupported'), 'warning');
            return false;
        }
        const updates = {};
        if (changedField === 'tcp' || changedField === 'enabled') updates.enabled = this.state.tcpEnabled ? '1' : '0';
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
            const [online, maxFreq, stat, writable] = await Promise.all([
                this.exec(`cat /sys/devices/system/cpu/cpu${i}/online 2>/dev/null`),
                this.exec(`cat /sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq 2>/dev/null`),
                this.exec(`grep "^cpu${i} " /proc/stat 2>/dev/null`),
                this.exec(`[ -w /sys/devices/system/cpu/cpu${i}/online ] && echo 1 || echo 0`)
            ]);
            if (!maxFreq && !stat) continue;
            seenIds.add(i);
            const savedOnline = savedStates[`cpu${i}`];
            const effectiveOnline = i === 0 ? true : (!this.state.cpuEnabled && typeof savedOnline === 'boolean' ? savedOnline : online === '1');
            this.cpuCores.push({ id: i, online: effectiveOnline, controllable: i !== 0 && writable.trim() === '1', maxFreq: maxFreq ? parseInt(maxFreq) : 0, load: '--' });
            const freqs = await this.exec(`cat /sys/devices/system/cpu/cpu${i}/cpufreq/scaling_available_frequencies 2>/dev/null`);
            if (freqs) this.cpuFreqsPerCore[i] = freqs.split(/\s+/).filter(f => f).map(Number).sort((a, b) => a - b);
        }
        this.cpuCores.sort((a, b) => a.id - b.id);
        this.cpuHotplugSupported = this.cpuCores.some(core => core.controllable);
        this.renderCpuCores();
        this.updateCpuControlSupport();
        await this.updateCpuLoads();
    },
    renderCpuCores() {
        const container = document.getElementById('cpu-cores-list');
        if (!container) return;
        container.innerHTML = this.cpuCores.map(core => `<div class="cpu-core ${core.online ? 'online' : 'offline'} ${core.controllable || core.id === 0 ? '' : 'locked'}" data-cpu="${core.id}"><div class="cpu-core-id">CPU ${core.id}</div><div class="cpu-core-load" id="cpu-load-${core.id}">${core.online ? '--' : 'OFF'}</div></div>`).join('');
        container.querySelectorAll('.cpu-core').forEach(item => {
            item.addEventListener('click', async () => {
                const cpuId = parseInt(item.dataset.cpu);
                const core = this.cpuCores.find(entry => entry.id === cpuId);
                if (!core) return;
                if (!core.controllable) { this.showToast(cpuId === 0 ? this.t('text_7e92b27c') : this.t('unsupported'), 'warning'); return; }
                const newState = core.online ? '0' : '1';
                const nextConfig = this.cpuCores.map(c => `cpu${c.id}=${c.id === cpuId ? newState : (c.online ? '1' : '0')}`).join('\n');
                const confirmed = await this.confirmChangePreview('变更预览', {
                    summary: `即将${newState === '1' ? '启用' : '禁用'} CPU${cpuId}。`,
                    configs: [{ filename: 'cpu_hotplug.conf', content: nextConfig }],
                    writes: [{ path: `/sys/devices/system/cpu/cpu${cpuId}/online`, value: newState }]
                });
                if (!confirmed) return;
                const savedOnly = !this.state.cpuEnabled;
                if (!savedOnly) await this.exec(`echo ${newState} > /sys/devices/system/cpu/cpu${cpuId}/online`);
                core.online = !core.online;
                item.className = `cpu-core ${core.online ? 'online' : 'offline'}`;
                const load = document.getElementById(`cpu-load-${cpuId}`);
                if (load) {
                    load.textContent = core.online ? '--' : 'OFF';
                    load.classList.remove('has-usage');
                }
                await this.saveCpuHotplugConfig(cpuId);
                await this.updateModuleDescription();
                this.showToast(savedOnly ? `CPU${cpuId} 配置已保存（禁用状态）` : `CPU${cpuId} 已${core.online ? '启用' : '禁用'}`);
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
            if (!core.online) {
                el.textContent = 'OFF';
                el.classList.remove('has-usage');
                continue;
            }
            const s1 = await this.getCpuStat(core.id);
            if (!s1) continue;
            if (!this.cpuStats[core.id]) { this.cpuStats[core.id] = s1; continue; }
            const prev = this.cpuStats[core.id];
            this.cpuStats[core.id] = s1;
            const totalDiff = s1.total - prev.total;
            const activeDiff = s1.active - prev.active;
            const usage = totalDiff > 0 ? Math.round((activeDiff / totalDiff) * 100) : 0;
            el.textContent = `${usage}%`;
            el.classList.add('has-usage');
            core.load = `${usage}%`;
        }
    },
    async saveCpuHotplugConfig(cpuId = null) {
        if (cpuId === null || cpuId === undefined) {
            const updates = Object.fromEntries(this.cpuCores.map(core => [`cpu${core.id}`, core.online ? '1' : '0']));
            await this.mergeConfigFile('cpu_hotplug.conf', updates, Object.keys(updates));
            return;
        }
        const core = this.cpuCores.find(item => item.id === Number(cpuId));
        if (!core) return;
        await this.mergeConfigFile('cpu_hotplug.conf', { [`cpu${core.id}`]: core.online ? '1' : '0' }, [`cpu${core.id}`]);
    },
    async applyCpuHotplugConfigImmediate() {
        const writes = this.cpuCores.filter(core => core.controllable).map(core => this.exec(`echo ${core.online ? '1' : '0'} > /sys/devices/system/cpu/cpu${core.id}/online 2>/dev/null`));
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
    showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        const text = this.localizeMessage(String(message || ''));
        if (this._toastTimer) clearTimeout(this._toastTimer);
        toast.classList.remove('info', 'success', 'warning', 'error', 'language');
        toast.textContent = text;
        toast.classList.add('show');
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
        content.innerHTML = `<div class="rainbow-text credit-entry" id="xinran-credit-wrap"><span class="credit-name-text" id="xinran-credit">致谢爱人❤️然(≧ω≦)/</span><button class="credit-link-btn" data-url="https://github.com/Winkmoon" aria-label="打开然的主页">&gt;</button></div><div class="credits-section"><div class="rainbow-text credits-title">模块制作感谢名单</div>${this.buildCreditEntry('Cloud_Yun', 'https://github.com/yspbwx2010')}${this.buildCreditEntry('穆远星', 'https://github.com/MuYuanXing')}${this.buildCreditEntry('NetizenNemo', 'https://github.com/NetizenNemo')}${this.buildCreditEntry('嘟嘟Ski')}${this.buildCreditEntry('Kanata')}</div>`;
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
                    await this.persistLoopConfig('enabled');
                    this.markWritebackBlockDirty();
                    this.showToast(this.t('writebackBlockConfigSaved'));
                } catch (error) {
                    this.state.loopEnabled = previous;
                    toggle.checked = previous;
                    if (typeof this.updateLoopControlState === 'function') this.updateLoopControlState();
                    this.showToast(this.t('loopConfigSaveFailed'), 'error');
                }
            });
        }
        const persistLoopSize = async () => {
            try {
                await this.persistLoopConfig('size_mb');
                this.markWritebackBlockDirty();
                this.showToast(this.t('writebackBlockConfigSaved'));
            } catch (error) {
                this.showToast(this.t('loopConfigSaveFailed'), 'error');
            }
        };
        const sizeOptions = document.getElementById('zram-writeback-size-options');
        if (sizeOptions && !sizeOptions.dataset.bound) {
            sizeOptions.dataset.bound = '1';
            sizeOptions.addEventListener('click', async (event) => {
                const button = event.target.closest('.writeback-size-option');
                if (!button || !sizeOptions.contains(button)) return;
                const sizeGb = parseInt(button.dataset.sizeGb, 10);
                if (!this.loopSizeFixed || !Number.isFinite(sizeGb) || !this.loopSizeOptions.includes(sizeGb)) return;
                if (this.state.loopSizeGb === sizeGb) return;
                this.state.loopSizeGb = sizeGb;
                this.renderLoopSizeOptions();
                if (typeof this.updateLoopParameterDisplay === 'function') this.updateLoopParameterDisplay(this._loopActive ? document.getElementById('zram-loop-device-value')?.textContent : '');
                await persistLoopSize();
            });
        }
        const sizeSlider = document.getElementById('zram-writeback-size-slider');
        const sizeValue = document.getElementById('zram-writeback-size-value');
        if (sizeSlider && !sizeSlider.dataset.bound) {
            sizeSlider.dataset.bound = '1';
            sizeSlider.addEventListener('input', (event) => {
                if (this.loopSizeFixed) return;
                this.state.loopSizeGb = Math.max(1, Math.min(16, parseInt(event.target.value, 10) || 1));
                if (sizeValue) sizeValue.textContent = `${this.state.loopSizeGb} GB`;
                this.updateSliderProgress(sizeSlider);
                if (typeof this.updateLoopParameterDisplay === 'function') this.updateLoopParameterDisplay(this._loopActive ? document.getElementById('zram-loop-device-value')?.textContent : '');
            });
            sizeSlider.addEventListener('change', async () => {
                if (this.loopSizeFixed) return;
                await persistLoopSize();
            });
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
            loopAction.addEventListener('click', () => this.applyLoopImmediate());
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
                        this.markZramDirty('zram_path');
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
            this.markZramDirty('zram_path');
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
                if (typeof this.markZramDirty === 'function') this.markZramDirty('zram_path');
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
    initZramPolicySettings() {
        const toggle = document.getElementById('zram-policy-switch');
        if (!toggle || toggle.dataset.bound) return;
        toggle.dataset.bound = '1';
        toggle.addEventListener('change', async () => {
            const enabled = toggle.checked;
            await this.waitForUiPaint();
            toggle.disabled = true;
            if (enabled) {
                const daemonEnabled = this.parseEnabledFlag(await this.readConfig('coronad.conf'));
                this.state.runtimeDaemonEnabled = daemonEnabled;
                if (!daemonEnabled) {
                    if (typeof this.rejectDaemonDependentToggle === 'function') {
                        this.rejectDaemonDependentToggle(toggle);
                    } else {
                        this.showToast(this.t('runtimeDaemonRequired'), 'warning');
                        setTimeout(() => {
                            toggle.checked = false;
                        }, 180);
                    }
                    setTimeout(() => {
                        toggle.disabled = false;
                    }, 180);
                    return;
                }
            }
            try {
                await this.mergeConfigFile('zram_policy.conf', { enabled: enabled ? '1' : '0' }, ['enabled']);
                await this.exec(`/system/bin/sh ${this.shellQuote(`${this.modDir}/service.sh`)} --sync-zram-policy`);
                await this.sleep(500);
                await this.loadZramPolicyConfig();
                this.showToast(this.t(toggle.checked ? 'zramPolicyEnabled' : 'zramPolicyDisabled'));
            } catch (error) {
                toggle.checked = !enabled;
                await this.waitForUiPaint();
                this.showToast(this.t('zramPolicyApplyFailed'), 'error');
            } finally {
                toggle.disabled = false;
            }
        });
    },
    async loadZramPolicyConfig() {
        const [configContent, daemonConfigContent, statusContent] = await Promise.all([
            this.readConfig('zram_policy.conf'),
            this.readConfig('coronad.conf'),
            this.exec(`/system/bin/sh ${this.shellQuote(`${this.modDir}/scripts/zram-policy.sh`)} status 2>/dev/null`)
        ]);
        const config = this.parseIoConfig(configContent);
        const daemonEnabled = this.parseEnabledFlag(daemonConfigContent);
        this.state.runtimeDaemonEnabled = daemonEnabled;
        const toggle = document.getElementById('zram-policy-switch');
        if (toggle) toggle.checked = daemonEnabled && config.enabled === '1';
        return this.loadZramPolicyStatus(statusContent);
    },
    async loadZramPolicyStatus(statusContent) {
        if (statusContent === undefined) await this.waitForUiPaint();
        const content = statusContent ?? await this.exec(`/system/bin/sh ${this.shellQuote(`${this.modDir}/scripts/zram-policy.sh`)} status 2>/dev/null`);
        const status = this.parseIoConfig(content);
        const supported = status.supported === '1';
        const running = status.running === '1';
        const badge = document.getElementById('zram-policy-status');
        if (badge) badge.textContent = this.t(!supported ? 'unsupported' : running ? 'running' : 'inactive');
        const setText = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value || '--';
        };
        setText('zram-policy-usage', status.usage_percent ? `${status.usage_percent}%` : '--');
        setText('zram-policy-overhead', status.overhead_mb ? `${status.overhead_mb} MB` : '--');
        const compressionRatioPercent = Number.parseInt(status.compression_ratio_percent || '0', 10);
        const reclaimScalePercent = Number.parseInt(status.reclaim_budget_scale_percent || '100', 10);
        const compressionRatio = compressionRatioPercent > 0
            ? (compressionRatioPercent / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
            : '';
        setText('zram-policy-compression-benefit', running && compressionRatio
            ? `${compressionRatio}:1 · ${reclaimScalePercent}%`
            : '--');
        const feedbackLevel = Math.min(3, Math.max(0, Number.parseInt(status.adaptive_feedback_level || '0', 10)));
        const writebackCircuit = status.writeback_circuit_active === '1';
        const reclaimCircuit = status.reclaim_circuit_active === '1';
        let feedbackKey = ['zramPolicyFeedbackNormal', 'zramPolicyFeedbackReduced', 'zramPolicyFeedbackConservative', 'zramPolicyFeedbackProtected'][feedbackLevel];
        if (writebackCircuit && reclaimCircuit) feedbackKey = 'zramPolicyFeedbackCircuitBoth';
        else if (writebackCircuit) feedbackKey = 'zramPolicyFeedbackCircuitWriteback';
        else if (reclaimCircuit) feedbackKey = 'zramPolicyFeedbackCircuitReclaim';
        const refaultMb = Number.parseInt(status.last_refault_mb || '0', 10);
        const feedbackText = `${this.t(feedbackKey)}${refaultMb > 0 ? ` · ${this.t('zramPolicyRefault')} ${refaultMb} MB` : ''}`;
        setText('zram-policy-adaptive-feedback', running ? feedbackText : '--');
        setText('zram-policy-pressure', status.pressure_avg10 ? `${status.pressure_avg10}%` : '--');
        const backendText = {
            erm: 'OPlus ERM',
            hybridswapd: 'HybridSwapD',
            generic: this.t('zramPolicyBackendGeneric')
        }[status.memory_backend] || '--';
        setText('zram-policy-backend', running ? backendText : '--');
        setText('zram-policy-reclaim-window', running && status.reclaim_window_mb ? `${status.reclaim_window_mb} MB` : '--');
        setText('zram-policy-vendor-clean', running ? (status.atomic_clean_disabled === 'true' ? this.t('zramPolicyVendorCleanDisabled') : this.t('zramPolicyVendorCleanDefault')) : '--');
        setText('zram-policy-oplus', status.oplus_vm_swappiness ? `${status.oplus_vm_swappiness} / ${status.oplus_direct_swappiness || '--'} / ${status.oplus_swapd_swappiness || '--'}` : '--');
        const eswapAvailable = status.eswap_available === '1';
        const writebackRow = document.getElementById('zram-policy-writeback')?.closest('.info-item');
        const dailyWritebackRow = document.getElementById('zram-policy-daily-writeback')?.closest('.info-item');
        if (eswapAvailable) {
            if (writebackRow) writebackRow.style.display = '';
            if (dailyWritebackRow) dailyWritebackRow.style.display = '';
            const writebackStatus = status.memory_backend === 'hybridswapd' || status.memory_backend === 'erm'
                ? this.t('zramPolicyWritebackAdaptive')
                    : status.hybridswap_paused === '1'
                        ? this.t('zramPolicyWritebackPaused')
                        : this.t('zramPolicyWritebackAllowed');
            setText('zram-policy-writeback', running ? writebackStatus : '--');
            const writebackUsed = Number.parseInt(status.hybridswap_used_mb || '0', 10);
            const writebackCapacity = Number.parseInt(status.hybridswap_capacity_mb || '0', 10);
            setText('zram-policy-daily-writeback', writebackCapacity > 0 ? `${writebackUsed} / ${writebackCapacity} MB` : '--');
        } else {
            if (writebackRow) writebackRow.style.display = 'none';
            if (dailyWritebackRow) dailyWritebackRow.style.display = 'none';
        }
        const actionKey = {
            recompress: 'zramPolicyActionRecompress',
            compact: 'zramPolicyActionCompact',
            reclaim: 'zramPolicyActionReclaim',
            writeback: 'zramPolicyActionWriteback',
            idle: 'zramPolicyActionIdle'
        }[status.last_action] || 'zramPolicyActionIdle';
        const waitingKey = {
            system_managed: 'zramPolicyWaitSystemManaged',
            hybridswap_adaptive: 'zramPolicyWaitHybridAdaptive',
            screen_on: 'zramPolicyWaitScreenOff',
            low_usage: 'zramPolicyWaitLowUsage',
            high_temperature: 'zramPolicyWaitTemperature',
            low_battery: 'zramPolicyWaitBattery',
            recompress_cooldown: 'zramPolicyWaitCooldown',
            no_zram: 'zramPolicyWaitNoZram'
        }[status.last_reason];
        const saved = Number.parseInt(status.recompress_saved_mb || '0', 10);
        const written = Number.parseInt(status.writeback_mb || '0', 10);
        const reclaimed = Number.parseInt(status.reclaim_mb || '0', 10);
        const actionText = this.t(status.last_action === 'idle' && waitingKey ? waitingKey : actionKey);
        const actionDetail = status.last_action === 'recompress' && saved > 0
            ? `${actionText} (-${saved} MB)`
            : status.last_action === 'reclaim' && reclaimed > 0
                ? `${actionText} (${reclaimed} MB)`
            : status.last_action === 'writeback' && written > 0
                ? `${actionText} (${written} MB)`
                : actionText;
        setText('zram-policy-action', running ? actionDetail : '--');
        return { supported, running };
    },
    initMemoryPressureSettings() {
        const toggle = document.getElementById('memory-pressure-switch');
        if (toggle && !toggle.dataset.bound) {
            toggle.dataset.bound = '1';
            toggle.addEventListener('change', async () => {
                const previous = this.state.pressureEnabled;
                this.state.pressureEnabled = toggle.checked;
                this.toggleMemoryPressureSettings(toggle.checked);
                try {
                    await this.persistMemoryPressureConfig('enabled');
                    if (toggle.checked) this.showToast(this.t('pressureConfigSaved'));
                    else await this.applyMemoryPressureConfig();
                } catch (error) {
                    this.state.pressureEnabled = previous;
                    toggle.checked = previous;
                    this.toggleMemoryPressureSettings(previous);
                    this.showToast(this.t('pressureConfigSaveFailed'), 'error');
                }
            });
        }
        const profiles = document.getElementById('memory-pressure-profile-list');
        this.bindOptionItems(profiles, value => {
            this.state.pressureProfile = value || 'balanced';
            this.renderMemoryPressureProfile();
            return this.persistMemoryPressureConfig('profile')
                .then(() => this.showToast(this.t('pressureConfigSaved')))
                .catch(() => this.showToast(this.t('pressureConfigSaveFailed'), 'error'));
        });
        const applyButton = document.getElementById('memory-pressure-apply');
        if (applyButton && !applyButton.dataset.bound) {
            applyButton.dataset.bound = '1';
            applyButton.addEventListener('click', () => this.applyMemoryPressureConfig());
        }
    },
    toggleMemoryPressureSettings(show) {
        const settings = document.getElementById('memory-pressure-settings');
        this.setSubSettingsExpanded(settings, show);
    },
    renderMemoryPressureProfile() {
        const list = document.getElementById('memory-pressure-profile-list');
        list?.querySelectorAll('.option-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.value === this.state.pressureProfile);
        });
        this.syncAnimatedOptionIndicator(list);
    },
    async loadMemoryPressureConfig() {
        const config = await this.readConfig('memory_pressure.conf');
        const enabledMatch = config.match(/^enabled=(\d)$/m);
        const profileMatch = config.match(/^profile=(sensitive|balanced|conservative)$/m);
        this.state.pressureEnabled = enabledMatch?.[1] === '1';
        this.state.pressureProfile = profileMatch?.[1] || 'balanced';
        const toggle = document.getElementById('memory-pressure-switch');
        if (toggle) toggle.checked = this.state.pressureEnabled;
        this.toggleMemoryPressureSettings(this.state.pressureEnabled);
        this.renderMemoryPressureProfile();
        await this.loadMemoryPressureStatus();
    },
    persistMemoryPressureConfig(changedField = 'enabled') {
        const updates = {};
        if (changedField === 'enabled') updates.enabled = this.state.pressureEnabled ? '1' : '0';
        if (changedField === 'profile') updates.profile = this.state.pressureProfile;
        return this.withLock('memory-pressure-config', () => this.mergeConfigFile('memory_pressure.conf', updates, ['enabled', 'profile']));
    },
    async loadMemoryPressureStatus() {
        const status = await this.exec(`/system/bin/sh ${this.shellQuote(`${this.modDir}/scripts/memory-pressure.sh`)} status 2>/dev/null`);
        const values = this.parseIoConfig(status);
        const supported = (await this.exec('[ -r /proc/pressure/memory ] && echo 1 || echo 0')).trim() === '1';
        const enabled = values.enabled === '1';
        const running = values.running === '1';
        const badge = document.getElementById('memory-pressure-status');
        if (badge) badge.textContent = this.t(!supported ? 'unsupported' : (running ? 'running' : 'inactive'));
        const psi = document.getElementById('memory-pressure-psi');
        if (psi) psi.textContent = values.avg10 ? `${values.avg10}%` : '--';
        const swappiness = document.getElementById('memory-pressure-swappiness');
        if (swappiness) swappiness.textContent = values.swappiness || '--';
        const applyButton = document.getElementById('memory-pressure-apply');
        if (applyButton) applyButton.disabled = !supported;
        return { supported, enabled, running, manager: values.manager || 'none' };
    },
    async applyMemoryPressureConfig() {
        const button = document.getElementById('memory-pressure-apply');
        if (button) button.disabled = true;
        try {
            await this.persistMemoryPressureConfig('enabled');
            const result = await this.execResult(`/system/bin/sh ${this.shellQuote(`${this.modDir}/scripts/memory-pressure.sh`)} apply`);
            let status = { supported: true, enabled: false, running: false, manager: 'none' };
            for (let attempt = 0; attempt < 7; attempt += 1) {
                await this.sleep(attempt === 0 ? 200 : 400);
                status = await this.loadMemoryPressureStatus();
                if (this.state.pressureEnabled ? status.running : !status.running) break;
            }
            const succeeded = result.code === 0 && (this.state.pressureEnabled ? status.running : !status.running);
            const message = succeeded ? 'pressureApplied' : (status.supported ? 'pressureApplyFailed' : 'pressureUnsupported');
            this.showToast(this.t(message), succeeded ? 'success' : 'error');
            return succeeded;
        } finally {
            if (button) button.disabled = false;
        }
    },
    initSwapSettings() {
        const swapSwitch = document.getElementById('swap-switch');
        const swapSizeSlider = document.getElementById('swap-size-slider');
        const priorityList = document.getElementById('swap-priority-list');
        if (swapSwitch) {
            swapSwitch.addEventListener('change', (e) => {
                this.state.swapEnabled = e.target.checked;
                this.toggleSwapSettings(e.target.checked);
                this.markSwapDirty('enabled');
            });
        }
        if (swapSizeSlider) {
            swapSizeSlider.addEventListener('input', (e) => {
                this.state.swapSize = parseInt(e.target.value);
                document.getElementById('swap-size-value').textContent = `${this.state.swapSize} MB`;
            });
            swapSizeSlider.addEventListener('change', (e) => {
                this.state.swapSize = parseInt(e.target.value);
                this.markSwapDirty('size');
            });
        }
        if (priorityList) {
            this.bindOptionItems(priorityList, value => {
                this.state.swapPriority = parseInt(value);
                this.markSwapDirty('priority');
            }, { animate: true });
            this.syncAnimatedOptionIndicator(priorityList);
        }
        this.loadSwapConfig();
        const swapApplyBtn = document.getElementById('swap-apply-btn');
        if (swapApplyBtn) swapApplyBtn.addEventListener('click', async (e) => { e.stopPropagation(); /* enable check moved into applySwapImmediate */ await this.applySwapImmediate(); });
    },
    toggleSwapSettings(show) {
        const settings = document.getElementById('swap-settings');
        this.setSubSettingsExpanded(settings, show);
    },
    async loadSwapConfig() {
        const config = await this.exec(`cat ${this.shellQuote(`${this.configDir}/swap.conf`)} 2>/dev/null`);
        if (config) {
            const enabledMatch = config.match(/enabled=(\d)/);
            const sizeMatch = config.match(/size=(\d+)/);
            const priorityMatch = config.match(/priority=([\-\d]+)/);
            const pathMatch = config.match(/^path=(.+)$/m);
            this.swapConfiguredFields = {
                size: !!sizeMatch,
                priority: !!priorityMatch,
                path: !!pathMatch
            };
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
                    this.syncAnimatedOptionIndicator(list);
                }
            }
            if (pathMatch && pathMatch[1].trim()) this.state.swapPath = pathMatch[1].trim();
        } else {
            this.swapConfiguredFields = {};
        }
        await this.loadSwapStatus();
    },
    getSwapFieldUpdates(changedField = 'enabled') {
        const swapPath = this.state.swapPath || this.runtimeConfig.swapPath || `${this.modDir}/swapfile.img`;
        const updates = {};
        if (changedField === 'swap' || changedField === 'enabled') updates.enabled = this.state.swapEnabled ? '1' : '0';
        if (changedField === 'swap' || changedField === 'size') updates.size = String(this.state.swapSize);
        if (changedField === 'swap' || changedField === 'priority') updates.priority = String(this.state.swapPriority);
        if (changedField === 'swap' || changedField === 'path') updates.path = swapPath;
        return updates;
    },
    persistSwapConfig(changedField = 'enabled') {
        const save = this.withLock('swap-config', async () => {
            await this.mergeConfigFile('swap.conf', this.getSwapFieldUpdates(changedField), ['enabled', 'size', 'priority', 'path']);
            return true;
        });
        this._swapConfigSavePromise = save;
        return save;
    },
    async saveSwapConfig(changedField = 'enabled', skipPreview = false) {
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
        if (!await this.validateConfiguration('swap', { toast: false })) return false;
        if (this._swapConfigSavePromise) await this._swapConfigSavePromise.catch(() => {});
        const configured = this.parseIoConfig(await this.readConfig('swap.conf'));
        const swapPath = configured.path || `${this.modDir}/swapfile.img`;
        const configuredSize = parseInt(configured.size, 10);
        const configuredPriority = parseInt(configured.priority, 10);
        const q = this.shellQuote(swapPath);
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
        if (!Number.isFinite(configuredSize) || configuredSize <= 0) {
            this.showToast('Swap 已启用，但未设置大小，未修改当前系统');
            return true;
        }
        this.showLoading(true);
        try {
            await this.exec(`swapoff ${q} 2>/dev/null`);
            await this.exec(`rm -f ${q} 2>/dev/null`);
            const free = parseInt((await this.exec(`df -k ${this.shellQuote(swapPath.substring(0, swapPath.lastIndexOf('/')) || '/data')} 2>/dev/null | awk 'NR==2{print $4}'`)).trim()) || 0;
            const needKb = configuredSize * 1024;
            if (free && free < needKb + 51200) {
                this.showToast(`Swap 创建失败：剩余空间不足（需 ${configuredSize}MB，剩 ${Math.floor(free/1024)}MB）`);
                await this.loadSwapStatus();
                return false;
            }
            const allocOut = await this.exec(`(fallocate -l ${configuredSize}M ${q} 2>&1 || dd if=/dev/zero of=${q} bs=1M count=${configuredSize} 2>&1) ; ls -l ${q} 2>/dev/null`);
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
            if (Number.isFinite(configuredPriority) && configuredPriority !== 0) {
                onOut = await this.exec(`swapon ${q} -p ${configuredPriority} 2>&1`);
            } else {
                onOut = await this.exec(`swapon ${q} 2>&1`);
            }
            if (/error|fail|invalid/i.test(onOut)) {
                this.showToast(`swapon 失败：${onOut.split('\n')[0]}`);
                await this.loadSwapStatus();
                return false;
            }
            this.showToast(`Swap 已启用 (${configuredSize} MB)`);
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
        const [config, supportRaw] = await Promise.all([
            this.readConfig('vm.conf'),
            this.exec('for key in watermark_scale_factor extra_free_kbytes dirty_ratio dirty_background_ratio vfs_cache_pressure; do [ -w "/proc/sys/vm/$key" ] && echo "$key=1" || echo "$key=0"; done')
        ]);
        this.vmFeatureSupport = {};
        supportRaw.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=([01])$/);
            if (match) this.vmFeatureSupport[match[1]] = match[2] === '1';
        });
        const vmControls = {
            watermark_scale_factor: 'watermark-slider',
            extra_free_kbytes: 'extra-free-slider',
            dirty_ratio: 'dirty-ratio-slider',
            dirty_background_ratio: 'dirty-bg-slider',
            vfs_cache_pressure: 'vfs-pressure-slider'
        };
        Object.entries(vmControls).forEach(([key, id]) => {
            this.setFeatureSupport(document.getElementById(id)?.closest('.setting-section'), this.vmFeatureSupport[key]);
        });
        const vmSupported = Object.values(this.vmFeatureSupport).some(Boolean);
        this.setFeatureSupport(document.getElementById('vm-switch')?.closest('.switch-container'), vmSupported);
        this.state.vmEnabled = this.parseEnabledFlag(config, false);
        const vmSwitch = document.getElementById('vm-switch');
        if (vmSwitch) vmSwitch.checked = this.state.vmEnabled;
        const vmStatus = document.getElementById('vm-status');
        if (vmStatus) vmStatus.textContent = !vmSupported ? this.t('unsupported') : (this.state.vmEnabled ? (config ? '已修改' : '默认') : '已禁用');
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
        if (!await this.validateConfiguration('vm', { toast: false })) return false;
        const requestedKeys = Array.isArray(changedKeys) ? changedKeys : (changedKeys ? [changedKeys] : ['enabled', 'watermark_scale_factor', 'extra_free_kbytes', 'dirty_ratio', 'dirty_background_ratio', 'vfs_cache_pressure']);
        const keys = requestedKeys.filter(key => key === 'enabled' || this.vmFeatureSupport?.[key] !== false);
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
            this.bindOptionItems(list, value => {
                this.state.thp = value;
                this.applyKernelFeatures(['thp']);
            });
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
