(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["settings-ui"]) return;
  Object.assign(CoronaAddon.prototype, {
    initTheme() {
        const savedTheme = localStorage.getItem('corona_theme') || 'light';
        const normalizedTheme = savedTheme === 'auto' ? 'light' : savedTheme;
        this.state.theme = normalizedTheme;
        if (normalizedTheme !== savedTheme) {
            localStorage.setItem('corona_theme', normalizedTheme);
        }
        this.applyTheme(normalizedTheme);
    },
    initChangePreviewPreference() {
        const saved = localStorage.getItem('corona_change_preview');
        this.setChangePreviewEnabled(saved === null ? true : saved === '1');
    },
    setChangePreviewEnabled(enabled, persist = false) {
        const normalized = !!enabled;
        this.state.changePreviewEnabled = normalized;
        if (persist) {
            localStorage.setItem('corona_change_preview', normalized ? '1' : '0');
        }
        const toggle = document.getElementById('change-preview-switch');
        if (toggle) toggle.checked = normalized;
    },
    initSettingDescriptionPreference() {
        const saved = localStorage.getItem('corona_setting_descriptions');
        this.setSettingDescriptionsEnabled(saved === null ? true : saved === '1');
    },
    setSettingDescriptionsEnabled(enabled, persist = false) {
        const normalized = !!enabled;
        this.state.showSettingDescriptions = normalized;
        document.body.classList.toggle('setting-descriptions-hidden', !normalized);
        if (persist) {
            localStorage.setItem('corona_setting_descriptions', normalized ? '1' : '0');
        }
        const toggle = document.getElementById('setting-descriptions-switch');
        if (toggle) toggle.checked = normalized;
    },
    initCategoryConfigVisibilityPreference() {
        const saved = localStorage.getItem('corona_category_config_toggles');
        this.setCategoryConfigVisibility(saved === null ? true : saved === '1');
    },
    initLanguagePreference() {
        this.state.language = 'zh';
        document.documentElement.lang = 'zh-CN';
    },
    getTranslations() {
        return {
            zh: {
                tabHome: '主页',
                tabSettings: '配置',
                moduleSettings: '模块设置',
                lightTheme: '浅色模式',
                darkTheme: '深色模式',
                goldTheme: '皇涩主题',
                languageLabel: '界面语言',
                languageDesc: '切换中文或 English 界面文案',
                changePreview: '变更预览',
                changePreviewDesc: '关闭后跳过变更预览，直接应用设置',
                settingDescriptions: '设置说明',
                settingDescriptionsDesc: '显示各项功能的用途说明，关闭后仅保留标题与操作控件',
                categoryConfig: '显示分类配置',
                categoryConfigDesc: '关闭后隐藏各分类配置的启用开关，不影响模块功能和已保存参数',
                cardVisibility: '模块卡片显示',
                cardVisibilityDesc: '关闭后仅隐藏配置页卡片，不影响模块功能和已保存参数',
                themeSwitched: '主题已切换',
                previewEnabled: '变更预览已开启',
                previewDisabled: '变更预览已关闭',
                descriptionsShown: '设置说明已显示',
                descriptionsHidden: '设置说明已隐藏',
                categoryShown: '分类配置已显示',
                categoryHidden: '分类配置已隐藏',
                initDefault: '正在初始化，请稍候...',
                initResolve: '正在解析模块环境...',
                initPrepare: '正在准备配置...',
                initDevice: '正在加载设备信息...',
                initSettings: '正在预加载配置页面...',
                initRealtime: '正在获取实时状态...',
                initApps: '正在预加载应用列表...',
                unsupportedTitle: '设备不支持',
                unsupportedBody: '此模块仅支持 OnePlus / OPPO / realme / OPlus 设备',
                homeKicker: '设备状态',
                homeLead: '实时查看内存、温度与系统信息',
                deviceModel: '设备型号',
                processorArrow: '处理器 >',
                memoryArrow: '运行内存 >',
                swapZramArrow: '交换分区 / ZRAM >',
                storageArrow: '储存空间 >',
                batteryTempArrow: '电池 / 温度 >',
                systemVersionArrow: '系统版本 >',
                realtimeMonitor: '实时监控',
                cpuChart: 'CPU',
                memChart: '内存',
                tempChart: '温度',
                runtimeStatus: '运行状态',
                memoryOptimization: '内存优化',
                memoryCompression: '内存压缩',
                memoryCompressionDesc: '管理 ZRAM、交换分区、内核内存行为',
                ioScheduler: 'I/O 调度器',
                ioSchedulerDesc: '调节块设备调度器与队列参数',
                cpuGovernor: 'CPU 调速器',
                cpuGovernorDesc: '切换 governor 与核心上下线策略',
                tcpOptimization: 'TCP 优化',
                tcpOptimizationDesc: '网络拥塞算法与传输相关调整',
                processPriority: '进程优先级',
                processPriorityDesc: '管理进程 / 线程优先级与调度策略',
                appPolicy: '应用策略',
                appPolicyDesc: '按应用管理白名单、预设和线程规则',
                customScripts: '自定义脚本',
                customScriptsDesc: '保存并执行你自己的开机脚本',
                dangerZone: '危险操作',
                dangerZoneDesc: '重置配置或执行高风险操作',
                zramConfig: 'ZRAM 配置',
                swapConfig: '交换分区配置',
                kernelFeatures: '内核特性',
                vmConfig: '虚拟内存',
                applyZram: '应用 ZRAM',
                cancel: '取消',
                confirm: '确定',
                saveRule: '保存规则',
                addScript: '添加脚本',
                scriptNamePlaceholder: '例如: 性能优化',
                scriptCodePlaceholder: '#!/system/bin/sh\n# 在此输入Shell脚本代码\necho \'Hello Corona\'',
                processing: '处理中...'
            },
            en: {
                tabHome: 'Home',
                tabSettings: 'Settings',
                moduleSettings: 'Module Settings',
                lightTheme: 'Light',
                darkTheme: 'Dark',
                goldTheme: 'Gold',
                languageLabel: 'Language',
                languageDesc: 'Switch UI text between Chinese and English',
                changePreview: 'Change Preview',
                changePreviewDesc: 'Skip preview and apply changes directly when disabled',
                settingDescriptions: 'Setting Descriptions',
                settingDescriptionsDesc: 'Show feature descriptions; keep only titles and controls when disabled',
                categoryConfig: 'Show Category Toggles',
                categoryConfigDesc: 'Hide category enable toggles only; saved settings remain unchanged',
                cardVisibility: 'Module Cards',
                cardVisibilityDesc: 'Hide config cards only; module behavior and saved values stay unchanged',
                themeSwitched: 'Theme switched',
                previewEnabled: 'Change preview enabled',
                previewDisabled: 'Change preview disabled',
                descriptionsShown: 'Setting descriptions shown',
                descriptionsHidden: 'Setting descriptions hidden',
                categoryShown: 'Category toggles shown',
                categoryHidden: 'Category toggles hidden',
                initDefault: 'Initializing, please wait...',
                initResolve: 'Resolving module environment...',
                initPrepare: 'Preparing configuration...',
                initDevice: 'Loading device information...',
                initSettings: 'Preloading settings page...',
                initRealtime: 'Loading realtime status...',
                initApps: 'Preloading app list...',
                unsupportedTitle: 'Unsupported device',
                unsupportedBody: 'This module supports OnePlus / OPPO / realme / OPlus devices only',
                homeKicker: 'Device Status',
                homeLead: 'Monitor memory, temperature and system status in real time',
                deviceModel: 'Device Model',
                processorArrow: 'Processor >',
                memoryArrow: 'Memory >',
                swapZramArrow: 'Swap / ZRAM >',
                storageArrow: 'Storage >',
                batteryTempArrow: 'Battery / Temp >',
                systemVersionArrow: 'System Version >',
                realtimeMonitor: 'Realtime Monitor',
                cpuChart: 'CPU',
                memChart: 'Memory',
                tempChart: 'Temp',
                runtimeStatus: 'Runtime Status',
                memoryOptimization: 'Memory Optimization',
                memoryCompression: 'Memory Compression',
                memoryCompressionDesc: 'Manage ZRAM, swap and kernel memory behavior',
                ioScheduler: 'I/O Scheduler',
                ioSchedulerDesc: 'Tune block scheduler and queue parameters',
                cpuGovernor: 'CPU Governor',
                cpuGovernorDesc: 'Adjust governors and CPU online policies',
                tcpOptimization: 'TCP Optimization',
                tcpOptimizationDesc: 'Tweak congestion control and transport behavior',
                processPriority: 'Process Priority',
                processPriorityDesc: 'Manage process / thread priority and scheduling',
                appPolicy: 'App Policy',
                appPolicyDesc: 'Manage whitelist, profiles and thread rules per app',
                customScripts: 'Custom Scripts',
                customScriptsDesc: 'Save and run your own boot scripts',
                dangerZone: 'Danger Zone',
                dangerZoneDesc: 'Reset configs or run high-risk actions',
                zramConfig: 'ZRAM Config',
                swapConfig: 'Swap Config',
                kernelFeatures: 'Kernel Features',
                vmConfig: 'Virtual Memory',
                applyZram: 'Apply ZRAM',
                cancel: 'Cancel',
                confirm: 'Confirm',
                saveRule: 'Save Rule',
                addScript: 'Add Script',
                scriptNamePlaceholder: 'Example: Performance Tuning',
                scriptCodePlaceholder: '#!/system/bin/sh\n# Write your shell script here\necho \'Hello Corona\'',
                processing: 'Processing...'
            }
        };
    },
    t(key) {
        const fallback = this.getTranslations().zh || {};
        return fallback[key] || key;
    },
    setLanguage(language, persist = false) {
        this.state.language = 'zh';
        document.documentElement.lang = 'zh-CN';
        this.applyTranslations();
    },
    getGlobalStaticTranslationMap() {
        return [
            ['.page-lead-kicker', 'homeKicker'],
            ['.page-lead-copy', 'homeLead'],
            ['#page-home .card-device .card-title', 'deviceModel'],
            ['#cpu-card .card-title', 'processorArrow'],
            ['#mem-card .card-title', 'memoryArrow'],
            ['#swap-card .card-title', 'swapZramArrow'],
            ['#storage-card .card-title', 'storageArrow'],
            ['#battery-card .card-title', 'batteryTempArrow'],
            ['#system-card .card-title', 'systemVersionArrow'],
            ['#realtime-card .card-title', 'realtimeMonitor'],
            ['#chart-cpu', 'cpuChart'],
            ['#chart-mem', 'memChart'],
            ['#chart-temp', 'tempChart'],
            ['#page-home .section-marker span', 'runtimeStatus'],
            ['#page-settings .section-marker span', 'memoryOptimization'],
            ['#memory-compression-card .module-card-title', 'memoryCompression'],
            ['#memory-compression-card .module-card-desc', 'memoryCompressionDesc'],
            ['#io-scheduler-card .module-card-title', 'ioScheduler'],
            ['#io-scheduler-card .module-card-desc', 'ioSchedulerDesc'],
            ['#cpu-governor-card .module-card-title', 'cpuGovernor'],
            ['#cpu-governor-card .module-card-desc', 'cpuGovernorDesc'],
            ['#tcp-card .module-card-title', 'tcpOptimization'],
            ['#tcp-card .module-card-desc', 'tcpOptimizationDesc'],
            ['#process-priority-card .module-card-title', 'processPriority'],
            ['#process-priority-card .module-card-desc', 'processPriorityDesc'],
            ['#app-policy-card .module-card-title', 'appPolicy'],
            ['#app-policy-card .module-card-desc', 'appPolicyDesc'],
            ['#custom-scripts-card .module-card-title', 'customScripts'],
            ['#custom-scripts-card .module-card-desc', 'customScriptsDesc'],
            ['#danger-zone-card .module-card-title', 'dangerZone'],
            ['#danger-zone-card .module-card-desc', 'dangerZoneDesc'],
            ['#zram-toggle .sub-card-title', 'zramConfig'],
            ['#swap-toggle .sub-card-title', 'swapConfig'],
            ['#lru-toggle .sub-card-title', 'kernelFeatures'],
            ['#vm-toggle .sub-card-title', 'vmConfig'],
            ['#zram-apply-btn', 'applyZram'],
            ['#thread-rule-cancel-btn', 'cancel'],
            ['#thread-rule-save-btn', 'saveRule'],
            ['#confirm-dialog-cancel', 'cancel'],
            ['#confirm-dialog-ok', 'confirm'],
            ['#script-edit-title', 'addScript'],
            ['#script-name-input', 'scriptNamePlaceholder', 'placeholder'],
            ['#script-code-input', 'scriptCodePlaceholder', 'placeholder']
        ];
    },
    applyGlobalStaticTranslations() {
        const setValue = (el, attr, value) => {
            if (!el) return;
            if (attr === 'textContent') el.textContent = value;
            else el.setAttribute(attr, value);
        };
        this.getGlobalStaticTranslationMap().forEach(([selector, key, attr = 'textContent']) => {
            document.querySelectorAll(selector).forEach(el => setValue(el, attr, this.t(key)));
        });
    },
    applyTranslations() {
        const setText = (selector, value) => {
            const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
            if (el) el.textContent = value;
        };
        setText('.tab-item[data-page="home"] .tab-label', this.t('tabHome'));
        setText('.tab-item[data-page="settings"] .tab-label', this.t('tabSettings'));
        setText('#app-settings-card .module-card-title', this.t('moduleSettings'));
        const themeLabels = document.querySelectorAll('#theme-options .theme-option span');
        if (themeLabels[0]) themeLabels[0].textContent = this.t('lightTheme');
        if (themeLabels[1]) themeLabels[1].textContent = this.t('darkTheme');
        if (themeLabels[2]) themeLabels[2].textContent = this.t('goldTheme');
        setText('#language-switch-label', this.t('languageLabel'));
        setText('#language-switch-desc', this.t('languageDesc'));
        const langValue = document.getElementById('language-select-value');
        if (langValue) langValue.textContent = this.state.language === 'en' ? 'English' : '中文';
        const langOptions = document.querySelectorAll('#language-select-panel .language-picker-option');
        if (langOptions[0]) langOptions[0].textContent = this.state.language === 'en' ? 'Chinese' : '中文';
        if (langOptions[1]) langOptions[1].textContent = 'English';
        const prefRows = document.querySelectorAll('#app-settings-content .ui-pref-switch-container .switch-info');
        if (prefRows[1]) {
            const labels = prefRows[1].querySelectorAll('span');
            if (labels[0]) labels[0].textContent = this.t('changePreview');
            if (labels[1]) labels[1].textContent = this.t('changePreviewDesc');
        }
        if (prefRows[2]) {
            const labels = prefRows[2].querySelectorAll('span');
            if (labels[0]) labels[0].textContent = this.t('settingDescriptions');
            if (labels[1]) labels[1].textContent = this.t('settingDescriptionsDesc');
        }
        if (prefRows[3]) {
            const labels = prefRows[3].querySelectorAll('span');
            if (labels[0]) labels[0].textContent = this.t('categoryConfig');
            if (labels[1]) labels[1].textContent = this.t('categoryConfigDesc');
        }
        const cardHeader = document.getElementById('card-visibility-toggle');
        if (cardHeader) {
            const labels = cardHeader.querySelectorAll('span');
            if (labels[0]) labels[0].textContent = this.t('cardVisibility');
            if (labels[1]) labels[1].textContent = this.t('cardVisibilityDesc');
        }
        const loadingText = document.querySelector('#loading .loading-text');
        if (loadingText && !document.getElementById('loading')?.classList.contains('show')) {
            loadingText.textContent = this.t('processing');
        }
        this.applyGlobalStaticTranslations();
    },
    setCategoryConfigVisibility(enabled, persist = false) {
        const normalized = !!enabled;
        this.state.showCategoryConfigToggles = normalized;
        document.querySelectorAll('.category-config-toggle').forEach(item => item.classList.toggle('hidden', !normalized));
        if (persist) {
            localStorage.setItem('corona_category_config_toggles', normalized ? '1' : '0');
        }
        const toggle = document.getElementById('category-config-visibility-switch');
        if (toggle) toggle.checked = normalized;
    },
    applyTheme(theme) {
        const body = document.body;
        const normalizedTheme = theme === 'auto' ? 'light' : theme;
        body.classList.remove('theme-light', 'theme-dark', 'theme-gold');
        body.classList.add(`theme-${normalizedTheme}`);
        document.querySelectorAll('.range-slider').forEach(slider => this.updateSliderProgress(slider));
    },
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
                this.showToast(`${this.t('themeSwitched')}: ${opt.querySelector('span').textContent}`);
            });
        });
    },
    updateLanguagePickerState() {},
    closeLanguagePicker() {},
    initLanguageToggle() {
        const picker = document.getElementById('language-picker');
        if (picker) picker.style.display = 'none';
    },
    initChangePreviewToggle() {
        const toggle = document.getElementById('change-preview-switch');
        if (!toggle) return;
        toggle.checked = !!this.state.changePreviewEnabled;
        toggle.addEventListener('change', () => {
            this.setChangePreviewEnabled(toggle.checked, true);
            this.showToast(toggle.checked ? this.t('previewEnabled') : this.t('previewDisabled'));
        });
    },
    initSettingDescriptionToggle() {
        const toggle = document.getElementById('setting-descriptions-switch');
        if (!toggle) return;
        toggle.checked = !!this.state.showSettingDescriptions;
        toggle.addEventListener('change', () => {
            this.setSettingDescriptionsEnabled(toggle.checked, true);
            this.showToast(toggle.checked ? this.t('descriptionsShown') : this.t('descriptionsHidden'));
        });
    },
    initCategoryConfigVisibilityToggle() {
        const toggle = document.getElementById('category-config-visibility-switch');
        if (!toggle) return;
        this.setCategoryConfigVisibility(this.state.showCategoryConfigToggles);
        toggle.addEventListener('change', () => {
            this.setCategoryConfigVisibility(toggle.checked, true);
            this.showToast(toggle.checked ? this.t('categoryShown') : this.t('categoryHidden'));
        });
    },
    initSnapshots() {
        const saveBtn = document.getElementById('snapshot-save-btn');
        if (saveBtn) saveBtn.addEventListener('click', () => this.createParameterSnapshot());
        this.renderParameterSnapshots();
    },
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
    },
    async saveParameterSnapshots() {
        const path = `${this.configDir}/parameter_snapshots.b64`;
        const payload = { version: 1, snapshots: this.parameterSnapshots };
        const base64Data = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
        await this.exec(`echo '${base64Data}' > ${this.shellQuote(path)}`);
    },
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
    },
    formatSnapshotTime(timestamp) {
        const d = new Date(timestamp);
        if (Number.isNaN(d.getTime())) return '时间未知';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },
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
    },
    async collectSnapshotFiles() {
        const entries = await Promise.all(this.snapshotConfigFiles.map(async (filename) => {
            const content = await this.exec(`cat ${this.shellQuote(`${this.configDir}/${filename}`)} 2>/dev/null`);
            return content && content.trim() ? [filename, content.trim()] : null;
        }));
        return Object.fromEntries(entries.filter(Boolean));
    },
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
    },
    async reloadSnapshotTargets() {
        await this.loadAllConfigs();
        await this.loadSwapConfig();
        await this.loadVmConfig();
        await this.loadKernelFeaturesConfig();
        await this.loadCoronaKernelConfig();
    },
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
    },
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
  });
  window.CoronaFeatureScripts["settings-ui"] = true;
})();
