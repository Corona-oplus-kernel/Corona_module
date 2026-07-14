(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["settings-ui"]) return;
  Object.assign(CoronaAddon.prototype, {
    initTheme() {
        const savedTheme = localStorage.getItem('corona_theme') || 'light';
        const normalizedTheme = savedTheme === 'auto' ? 'light' : savedTheme;
        this.state.theme = normalizedTheme;
        this.state.hue = parseInt(localStorage.getItem('corona_color_hue') || '214', 10) || 214;
        if (normalizedTheme !== savedTheme) {
            localStorage.setItem('corona_theme', normalizedTheme);
        }
        this.applyTheme(normalizedTheme, false);
        this.applyHue(this.state.hue, false);
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
    getTranslations() {
        return {
            zh: {
                tabHome: '主页',
                tabSettings: '配置',
                moduleSettings: '模块设置',
                lightTheme: '浅色模式',
                darkTheme: '深色模式',
                goldTheme: '皇涩主题',
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
                processing: '处理中...'
            }
        };
    },
    t(key) {
        const fallback = this.getTranslations().zh || {};
        return fallback[key] || key;
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
    applyThemeTransition() {
        const body = document.body;
        body.classList.add('theme-animate');
        if (this._themeAnimTimer) clearTimeout(this._themeAnimTimer);
        this._themeAnimTimer = setTimeout(() => {
            body.classList.remove('theme-animate');
        }, 300);
    },
    normalizeHue(hue) {
        const n = parseInt(hue, 10);
        if (!Number.isFinite(n)) return 214;
        return Math.max(0, Math.min(360, n));
    },
    applyHue(hue, animate = true, options = {}) {
        const value = this.normalizeHue(hue);
        const persist = options.persist !== false;
        const updateState = options.updateState !== false;
        if (animate) this.applyThemeTransition();
        document.documentElement.style.setProperty('--hue', String(value));
        document.body.style.setProperty('--hue', String(value));
        // explicit solid colors for WebView compatibility
        const isDark = document.body.classList.contains('theme-dark');
        const isGold = document.body.classList.contains('theme-gold');
        const sat = isGold ? 58 : (isDark ? 78 : 82);
        const light = isGold ? 42 : (isDark ? 62 : 50);
        const primary = `hsl(${value}, ${sat}%, ${light}%)`;
        const dim = `hsla(${value}, ${sat}%, ${light}%, ${isDark ? 0.22 : 0.18})`;
        const lite = `hsla(${value}, ${sat}%, ${light}%, ${isDark ? 0.14 : 0.12})`;
        const accent = `hsl(${value}, ${Math.max(sat - 10, 50)}%, ${Math.max(light - 8, 36)}%)`;
        [document.documentElement, document.body].forEach(el => {
            el.style.setProperty('--primary', primary);
            el.style.setProperty('--primary-dim', dim);
            el.style.setProperty('--primary-light', lite);
            el.style.setProperty('--accent', accent);
        });
        if (updateState) this.state.hue = value;
        if (persist) {
            localStorage.setItem('corona_color_hue', String(value));
            try { localStorage.removeItem('corona_accent'); } catch (e) {}
        }

        if (typeof this.updateColorPrefUI === 'function') this.updateColorPrefUI(value);

        // refresh slider fills that use primary color
        document.querySelectorAll('.range-slider').forEach(el => {
            if (typeof this.updateSliderProgress === 'function') this.updateSliderProgress(el);
        });
        return { value, primary, dim, lite, accent };
    },
    applyTheme(theme, animate = true) {
        const body = document.body;
        const normalizedTheme = theme === 'auto' ? 'light' : theme;
        if (animate) this.applyThemeTransition();
        body.classList.remove('theme-light', 'theme-dark', 'theme-gold');
        body.classList.add(`theme-${normalizedTheme}`);
        // ensure hue still drives primary after theme class changes
        const hue = this.state.hue || this.normalizeHue(localStorage.getItem('corona_color_hue') || 214);
        document.documentElement.style.setProperty('--hue', String(hue));
        body.style.setProperty('--hue', String(hue));
        document.querySelectorAll('.range-slider').forEach(slider => {
            if (typeof this.updateSliderProgress === 'function') this.updateSliderProgress(slider);
        });
    },
    initAccentSelector() {
        const current = this.normalizeHue(this.state.hue || localStorage.getItem('corona_color_hue') || 214);
        this.applyHue(current, false);
        this.updateColorPrefUI(current);

        const openBtn = document.getElementById('color-picker-btn');
        if (openBtn && !openBtn.dataset.bound) {
            openBtn.dataset.bound = '1';
            openBtn.addEventListener('click', () => this.showColorPicker());
        }

        const resetBtn = document.getElementById('theme-reset-btn');
        if (resetBtn && !resetBtn.dataset.bound) {
            resetBtn.dataset.bound = '1';
            resetBtn.addEventListener('click', async () => {
                this.state.theme = 'light';
                localStorage.setItem('corona_theme', 'light');
                document.querySelectorAll('#theme-options .theme-option').forEach(o => {
                    o.classList.toggle('selected', o.dataset.theme === 'light');
                });
                this.applyTheme('light', true);
                this.applyHue(214, false);
                this.updateColorPrefUI(214);
                if (typeof this.resetUiLayout === 'function') this.resetUiLayout();
                if (typeof this.switchPage === 'function') await this.switchPage('home');
                if (typeof this.showToast === 'function') this.showToast('已返回默认界面');
            });
        }
    },
    updateColorPrefUI(hue) {
        const value = this.normalizeHue(hue);
        const swatch = document.getElementById('color-pref-swatch');
        const desc = document.getElementById('color-pref-desc');
        if (swatch) swatch.style.background = `hsl(${value}, 82%, 50%)`;
        if (desc) desc.textContent = `当前色调 ${value}°`;
    },
    showColorPicker() {
        if (document.querySelector('.color-picker-overlay')) return;
        const originalHue = this.normalizeHue(this.state.hue || localStorage.getItem('corona_color_hue') || 214);
        let draftHue = originalHue;

        const overlay = document.createElement('div');
        overlay.className = 'color-picker-overlay';
        const dialog = document.createElement('div');
        dialog.className = 'color-picker-dialog';
        dialog.innerHTML = `
            <h2>颜色选择器</h2>
            <div class="color-picker-content">
                <div class="color-live-preview" id="color-live-preview">
                    <div class="color-live-swatch" id="picker-live-swatch"></div>
                    <div class="color-live-meta">
                        <div class="color-live-title">实时预览</div>
                        <div class="color-live-desc" id="picker-live-desc">色调 ${originalHue}°</div>
                        <div class="color-live-samples">
                            <span class="color-live-chip" id="picker-live-chip">选中项</span>
                            <span class="color-live-btn" id="picker-live-btn">主按钮</span>
                            <span class="color-live-dot" id="picker-live-dot"></span>
                        </div>
                        <div class="color-live-home">
                            <div class="color-live-home-title">主页效果</div>
                            <div class="color-live-home-row">
                                <span class="color-live-kicker" id="picker-live-kicker">设备状态</span>
                                <span class="color-live-badge" id="picker-live-badge">ZRAM</span>
                            </div>
                            <div class="color-live-home-row">
                                <span class="color-live-home-label">运行内存</span>
                                <span class="color-live-bar"><i id="picker-live-bar"></i></span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="preset-colors">
                    ${[0, 30, 60, 120, 180, 214, 260, 300, 330].map(h => `
                        <button type="button" class="preset-color${Math.abs(h - originalHue) <= 2 ? ' active' : ''}" data-hue="${h}" aria-label="色调 ${h}" style="--preview-hue:${h};background:hsl(${h}, 82%, 50%)"></button>
                    `).join('')}
                </div>
                <label>
                    <span>色调值</span>
                    <div class="hue-control">
                        <input type="range" id="picker-hue-slider" min="0" max="360" value="${originalHue}">
                        <output id="picker-hue-value">${originalHue}°</output>
                    </div>
                </label>
            </div>
            <div class="dialog-buttons">
                <button type="button" class="dialog-button filled" id="close-color" style="flex:1">完成</button>
            </div>
        `;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const slider = dialog.querySelector('#picker-hue-slider');
        const output = dialog.querySelector('#picker-hue-value');
        const presets = dialog.querySelectorAll('.preset-color');
        const liveSwatch = dialog.querySelector('#picker-live-swatch');
        const liveDesc = dialog.querySelector('#picker-live-desc');
        const liveChip = dialog.querySelector('#picker-live-chip');
        const liveBtn = dialog.querySelector('#picker-live-btn');
        const liveDot = dialog.querySelector('#picker-live-dot');

        const liveKicker = dialog.querySelector('#picker-live-kicker');
        const liveBadge = dialog.querySelector('#picker-live-badge');
        const liveBar = dialog.querySelector('#picker-live-bar');

        const paintLocalPreview = (value, primary, dim) => {
            if (liveSwatch) liveSwatch.style.background = primary;
            if (liveDesc) liveDesc.textContent = `色调 ${value}° · 主页与配置同步`;
            if (liveChip) {
                liveChip.style.background = dim;
                liveChip.style.color = primary;
                liveChip.style.borderColor = primary;
            }
            if (liveBtn) liveBtn.style.background = primary;
            if (liveDot) liveDot.style.background = primary;
            if (liveKicker) liveKicker.style.color = primary;
            if (liveBadge) {
                liveBadge.style.background = dim;
                liveBadge.style.color = primary;
            }
            if (liveBar) liveBar.style.background = primary;
            // refresh home progress bars live while dragging
            document.querySelectorAll('.progress-fill, .progress-bar-mini .progress-fill').forEach(() => {});
            if (typeof this.updateSliderProgress === 'function') {
                document.querySelectorAll('.range-slider').forEach(el => this.updateSliderProgress(el));
            }
            // redraw chart with new primary if on home
            if (typeof this.drawChart === 'function') {
                try { this.drawChart(); } catch (e) {}
            }
        };

        const previewHue = (hue, { toast = false } = {}) => {
            draftHue = this.normalizeHue(hue);
            // 默认即时应用并保存，无需点「应用」
            const painted = this.applyHue(draftHue, false, { persist: true, updateState: true });
            if (output) output.textContent = `${draftHue}°`;
            if (slider && String(slider.value) !== String(draftHue)) slider.value = String(draftHue);
            presets.forEach(p => {
                const ph = parseInt(p.dataset.hue, 10);
                p.classList.toggle('active', Math.abs(ph - draftHue) <= 2);
            });
            paintLocalPreview(painted.value, painted.primary, painted.dim);
            if (typeof this.updateColorPrefUI === 'function') this.updateColorPrefUI(draftHue);
            if (toast && typeof this.showToast === 'function') {
                this.showToast(`${this.t('colorChanged')}: ${draftHue}°`);
            }
        };

        // initial paint (already current color, no toast)
        previewHue(originalHue);

        presets.forEach(p => {
            p.addEventListener('click', () => previewHue(p.dataset.hue, { toast: true }));
        });
        // drag applies live; release toast once
        slider.addEventListener('input', () => previewHue(slider.value));
        slider.addEventListener('change', () => previewHue(slider.value, { toast: true }));

        const closeDialog = () => {
            // already persisted on each change
            this.applyHue(draftHue, false, { persist: true, updateState: true });
            overlay.classList.add('closing');
            dialog.classList.add('closing');
            setTimeout(() => overlay.remove(), 180);
        };

        dialog.querySelector('#close-color').addEventListener('click', () => closeDialog());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeDialog();
        });
    },
    initThemeSelector() {
        const themeOptions = document.querySelectorAll('#theme-options .theme-option');
        themeOptions.forEach(opt => {
            if (opt.dataset.theme === this.state.theme) opt.classList.add('selected');
            else opt.classList.remove('selected');
            if (opt.dataset.bound) return;
            opt.dataset.bound = '1';
            opt.addEventListener('click', () => {
                themeOptions.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                this.state.theme = opt.dataset.theme;
                localStorage.setItem('corona_theme', this.state.theme);
                this.applyTheme(this.state.theme, true);
                this.showToast(`${this.t('themeSwitched')}: ${opt.querySelector('span').textContent}`);
            });
        });
        if (typeof this.initAccentSelector === 'function') this.initAccentSelector();
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
