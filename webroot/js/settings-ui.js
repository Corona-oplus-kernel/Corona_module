(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["settings-ui"]) return;
  Object.assign(CoronaAddon.prototype, {
    initTheme() {
        const savedTheme = localStorage.getItem('corona_theme') || 'light';
        const normalizedTheme = savedTheme === 'dark' ? 'dark' : 'light';
        this.state.theme = normalizedTheme;
        this.state.hue = this.normalizeHue(localStorage.getItem('corona_color_hue') || '214');
        if (normalizedTheme !== savedTheme) {
            localStorage.setItem('corona_theme', normalizedTheme);
        }
        this.applyTheme(normalizedTheme, false);
    },
    initChangePreviewPreference() {
        const saved = localStorage.getItem('corona_change_preview');
        this.setChangePreviewEnabled(saved === '1');
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
        this.setSettingDescriptionsEnabled(saved === '1');
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
        this.setCategoryConfigVisibility(saved === '1');
    },
    getTranslations() {
        return {
            zh: window.CoronaLocales?.zh?.messages || {},
            en: window.CoronaLocales?.en?.messages || {}
        };
    },
    initLanguage() {
        const saved = localStorage.getItem('corona_language');
        this.state.language = saved === 'en' || saved === 'zh' ? saved : 'zh';
        document.documentElement.lang = this.state.language === 'en' ? 'en' : 'zh-CN';
    },
    async setLanguage(language, persist = true) {
        const normalized = language === 'en' ? 'en' : 'zh';
        const changed = this.state.language !== normalized;
        this.state.language = normalized;
        document.documentElement.lang = normalized === 'en' ? 'en' : 'zh-CN';
        if (persist) localStorage.setItem('corona_language', normalized);
        document.querySelectorAll('#language-options .language-option').forEach(item => {
            item.classList.toggle('selected', item.dataset.language === normalized);
        });
        if (changed && document.body) {
            const token = (this._languageSwitchToken || 0) + 1;
            this._languageSwitchToken = token;
            document.body.classList.remove('language-switch-in');
            document.body.classList.add('language-switching', 'language-switch-out');
            await new Promise(resolve => setTimeout(resolve, 110));
            if (this._languageSwitchToken !== token) return false;
            document.body.classList.remove('language-switch-out');
            this.applyTranslations();
            if (this.customScripts && typeof this.renderScriptsList === 'function') this.renderScriptsList();
            void document.body.offsetWidth;
            document.body.classList.add('language-switch-in');
            if (typeof this.updateLoopControlState === 'function') this.updateLoopControlState();
            await new Promise(resolve => setTimeout(resolve, 320));
            if (this._languageSwitchToken === token) {
                document.body.classList.remove('language-switching', 'language-switch-in');
            }
            return true;
        }
        this.applyTranslations();
        if (this.customScripts && typeof this.renderScriptsList === 'function') this.renderScriptsList();
        if (typeof this.updateLoopControlState === 'function') this.updateLoopControlState();
        return changed;
    },
    initLanguageSelector() {
        const options = document.querySelectorAll('#language-options .language-option');
        options.forEach(item => {
            item.classList.toggle('selected', item.dataset.language === this.state.language);
            if (item.dataset.bound) return;
            item.dataset.bound = '1';
            item.addEventListener('click', async () => {
                const changed = await this.setLanguage(item.dataset.language, true);
                if (!changed) return;
                if (typeof this.loadZramStatus === 'function') this.loadZramStatus();
                this.showToast(this.t('languageChanged'), 'language');
            });
        });
    },
    t(key) {
        const translations = this.getTranslations();
        const current = translations[this.state.language] || translations.zh || {};
        const fallback = translations.zh || {};
        return current[key] || fallback[key] || key;
    },
    localizeMessage(message) {
        const text = String(message || '');
        const language = this.state.language === 'en' ? 'en' : 'zh';
        const translator = window.CoronaI18n?.translate;
        const fullTranslation = typeof translator === 'function' ? translator(text, language) : text;
        if (fullTranslation !== text) return fullTranslation;
        const translateLine = line => {
            const match = line.match(/^(\s*(?:[-•*]\s*)?)(.*?)(\s*)$/);
            const prefix = match?.[1] || '';
            const core = match?.[2] || line;
            const suffix = match?.[3] || '';
            const translated = typeof translator === 'function' ? translator(core, language) : core;
            return `${prefix}${translated}${suffix}`;
        };
        return text.split('\n').map(translateLine).join('\n');
    },
    translateDomNode(node) {
        if (!node) return;
        if (node.parentElement?.hasAttribute('data-i18n')) return;
        if (!this._translationTextOriginals) this._translationTextOriginals = new WeakMap();
        if (!this._translationTextTranslated) this._translationTextTranslated = new WeakMap();
        const parentTag = node.parentElement?.tagName?.toLowerCase();
        if (parentTag === 'script' || parentTag === 'style' || parentTag === 'textarea') return;
        const current = node.nodeValue;
        let original = this._translationTextOriginals.get(node);
        if (original === undefined) {
            original = current;
            if (!/[\u3400-\u9fff]/.test(original)) return;
            this._translationTextOriginals.set(node, original);
        } else {
            const previousTranslation = this._translationTextTranslated.get(node);
            if (current !== original && current !== previousTranslation && /[\u3400-\u9fff]/.test(current)) {
                original = current;
                this._translationTextOriginals.set(node, original);
            }
        }
        if (this.state.language !== 'en') {
            if (node.nodeValue !== original) node.nodeValue = original;
            this._translationTextTranslated.delete(node);
            return;
        }
        const leading = original.match(/^\s*/)?.[0] || '';
        const trailing = original.match(/\s*$/)?.[0] || '';
        const core = original.trim();
        const translated = this.localizeMessage(core);
        const next = translated === core ? original : `${leading}${translated}${trailing}`;
        this._translationTextTranslated.set(node, next);
        if (node.nodeValue !== next) node.nodeValue = next;
    },
    translateDomElement(element) {
        if (!element || element.nodeType !== 1) return;
        const textKey = element.getAttribute('data-i18n');
        if (textKey) {
            const text = this.t(textKey);
            if (element.textContent !== text) element.textContent = text;
        }
        const fallbackAttributes = [];
        ['placeholder', 'title', 'aria-label', 'alt'].forEach(attribute => {
            const translationKey = element.getAttribute(`data-i18n-${attribute}`);
            if (translationKey) {
                const translated = this.t(translationKey);
                if (element.getAttribute(attribute) !== translated) element.setAttribute(attribute, translated);
            } else if (element.hasAttribute(attribute)) {
                fallbackAttributes.push(attribute);
            }
        });
        if (!fallbackAttributes.length) return;
        if (!this._translationAttributeOriginals) this._translationAttributeOriginals = new WeakMap();
        if (!this._translationAttributeTranslated) this._translationAttributeTranslated = new WeakMap();
        let originals = this._translationAttributeOriginals.get(element);
        let translations = this._translationAttributeTranslated.get(element);
        if (!originals) {
            originals = {};
            this._translationAttributeOriginals.set(element, originals);
        }
        if (!translations) {
            translations = {};
            this._translationAttributeTranslated.set(element, translations);
        }
        fallbackAttributes.forEach(attribute => {
            const current = element.getAttribute(attribute);
            if (!(attribute in originals)) originals[attribute] = current;
            else if (current !== originals[attribute] && current !== translations[attribute] && /[\u3400-\u9fff]/.test(current)) originals[attribute] = current;
            const original = originals[attribute];
            const next = this.state.language === 'en' ? this.localizeMessage(original) : original;
            translations[attribute] = next;
            if (element.getAttribute(attribute) !== next) element.setAttribute(attribute, next);
        });
    },
    translateDom(root = document.body) {
        if (!root) return;
        this._translationBusy = true;
        try {
            if (root.nodeType === 1) this.translateDomElement(root);
            if (root.nodeType === 3) this.translateDomNode(root);
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                if (node.nodeType === 1) this.translateDomElement(node);
                else if (node.nodeType === 3) this.translateDomNode(node);
            }
            if (!this._translationTitleOriginal) this._translationTitleOriginal = document.title;
            document.title = this.state.language === 'en'
                ? this.localizeMessage(this._translationTitleOriginal)
                : this._translationTitleOriginal;
        } finally {
            this._translationBusy = false;
        }
    },
    startTranslationObserver() {
        if (this._translationObserver || !document.body) return;
        this._translationObserver = new MutationObserver(mutations => {
            if (this._translationBusy || this.state.language !== 'en') return;
            mutations.forEach(mutation => {
                if (mutation.type === 'characterData') this.translateDomNode(mutation.target);
                mutation.addedNodes?.forEach(node => this.translateDom(node));
            });
        });
        this._translationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    },
    applyTranslations() {
        this.translateDom(document.body);
        const zramApply = document.getElementById('zram-apply-btn');
        if (zramApply) zramApply.textContent = this.t(this._zramDirty ? 'applyZramDirty' : 'applyZram');
        if (typeof this.renderModuleVersion === 'function') this.renderModuleVersion();
        if (typeof this.renderKernelWorkflowBuild === 'function') this.renderKernelWorkflowBuild();
        if (typeof this.renderKernelReleaseUpdate === 'function') this.renderKernelReleaseUpdate();
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
    applyThemeTransition(theme, origin = null) {
        const body = document.body;
        const overlay = document.getElementById('theme-transition-overlay');
        const targetTheme = theme === 'dark' || theme === 'light'
            ? theme
            : (body.classList.contains('theme-dark') ? 'dark' : 'light');
        const x = Number.isFinite(origin?.x) ? origin.x : window.innerWidth / 2;
        const y = Number.isFinite(origin?.y) ? origin.y : window.innerHeight / 2;
        body.style.setProperty('--theme-switch-x', `${x}px`);
        body.style.setProperty('--theme-switch-y', `${y}px`);
        body.classList.remove('theme-switch-in');
        body.classList.add('theme-animate', 'theme-switching', 'theme-switch-out');
        if (overlay) {
            overlay.dataset.theme = targetTheme;
            overlay.classList.remove('active');
            void overlay.offsetWidth;
            overlay.classList.add('active');
        }
        if (this._themeAnimTimer) clearTimeout(this._themeAnimTimer);
        this._themeAnimTimer = setTimeout(() => {
            body.classList.remove('theme-animate', 'theme-switching', 'theme-switch-out', 'theme-switch-in');
            overlay?.classList.remove('active');
        }, 560);
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
        const refreshControls = options.refreshControls !== false;
        const emit = options.emit !== false;
        if (animate && document.body) {
            document.body.classList.add('theme-animate');
            if (this._themeAnimTimer) clearTimeout(this._themeAnimTimer);
            this._themeAnimTimer = setTimeout(() => document.body.classList.remove('theme-animate'), 440);
        }
        document.documentElement.style.setProperty('--hue', String(value));
        document.body.style.setProperty('--hue', String(value));
        // explicit solid colors for WebView compatibility
        const isDark = document.body.classList.contains('theme-dark');
        const sat = isDark ? 78 : 82;
        const light = isDark ? 62 : 50;
        const primary = `hsl(${value}, ${sat}%, ${light}%)`;
        const dim = `hsla(${value}, ${sat}%, ${light}%, ${isDark ? 0.22 : 0.18})`;
        const lite = `hsla(${value}, ${sat}%, ${light}%, ${isDark ? 0.14 : 0.12})`;
        const accent = `hsl(${value}, ${Math.max(sat - 10, 50)}%, ${Math.max(light - 8, 36)}%)`;
        const strong = `hsl(${value}, ${sat}%, ${Math.max(light - 9, 34)}%)`;
        const soft = `hsla(${value}, ${sat}%, ${light}%, ${isDark ? 0.12 : 0.08})`;
        const border = `hsla(${value}, ${sat}%, ${light}%, ${isDark ? 0.34 : 0.26})`;
        const shadow = `hsla(${value}, ${sat}%, ${light}%, ${isDark ? 0.3 : 0.22})`;
        const gradientEnd = `hsl(${value}, ${Math.min(sat + 6, 96)}%, ${Math.min(light + 14, 76)}%)`;
        [document.documentElement, document.body].forEach(el => {
            el.style.setProperty('--primary', primary);
            el.style.setProperty('--primary-dim', dim);
            el.style.setProperty('--primary-light', lite);
            el.style.setProperty('--accent', accent);
            el.style.setProperty('--primary-strong', strong);
            el.style.setProperty('--primary-soft', soft);
            el.style.setProperty('--primary-border', border);
            el.style.setProperty('--primary-shadow', shadow);
            el.style.setProperty('--primary-gradient-end', gradientEnd);
        });
        document.documentElement.dataset.hue = String(value);
        const themeMeta = document.getElementById('theme-color-meta');
        if (themeMeta) themeMeta.setAttribute('content', primary);
        if (updateState) this.state.hue = value;
        if (persist) {
            localStorage.setItem('corona_color_hue', String(value));
            try { localStorage.removeItem('corona_accent'); } catch (e) {}
        }

        if (typeof this.updateColorPrefUI === 'function') this.updateColorPrefUI(value);

        // refresh slider fills that use primary color
        if (refreshControls && typeof this.updateSliderProgress === 'function') {
            document.querySelectorAll('.range-slider').forEach(el => this.updateSliderProgress(el));
        }
        if (emit) try {
            document.dispatchEvent(new CustomEvent('colorChanged', {
                detail: { hue: value, primary, accent, source: 'corona' }
            }));
        } catch (e) {}
        return { value, primary, dim, lite, accent, strong, soft, border, shadow, gradientEnd };
    },
    async applyTheme(theme, animate = true, origin = null) {
        const body = document.body;
        const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
        const token = (this._themeSwitchToken || 0) + 1;
        this._themeSwitchToken = token;
        if (animate) {
            this.applyThemeTransition(normalizedTheme, origin);
            await new Promise(resolve => setTimeout(resolve, 90));
            if (this._themeSwitchToken !== token) return false;
        }
        body.classList.remove('theme-light', 'theme-dark');
        body.classList.add(`theme-${normalizedTheme}`);
        const hue = this.state.hue ?? this.normalizeHue(localStorage.getItem('corona_color_hue') || 214);
        this.state.theme = normalizedTheme;
        this.applyHue(hue, false, { persist: false, updateState: false });
        if (animate) {
            body.classList.remove('theme-switch-out');
            void body.offsetWidth;
            body.classList.add('theme-switch-in');
            await new Promise(resolve => setTimeout(resolve, 360));
            if (this._themeSwitchToken === token) {
                body.classList.remove('theme-animate', 'theme-switching', 'theme-switch-in');
                document.getElementById('theme-transition-overlay')?.classList.remove('active');
            }
        }
        return true;
    },
    initAccentSelector() {
        const current = this.normalizeHue(this.state.hue ?? localStorage.getItem('corona_color_hue') ?? 214);
        this.applyHue(current, false);

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
                await this.applyTheme('light', true);
                this.applyHue(214, false);
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
        const originalHue = this.normalizeHue(this.state.hue ?? localStorage.getItem('corona_color_hue') ?? 214);
        let draftHue = originalHue;
        const colorPresets = [
            { hue: 0, name: '红色' },
            { hue: 28, name: '橙色' },
            { hue: 48, name: '琥珀' },
            { hue: 126, name: '绿色' },
            { hue: 178, name: '青色' },
            { hue: 214, name: this.t('blueColor') },
            { hue: 252, name: '靛蓝' },
            { hue: 286, name: '紫色' },
            { hue: 330, name: '粉色' }
        ];

        const overlay = document.createElement('div');
        overlay.className = 'color-picker-overlay';
        const dialog = document.createElement('div');
        dialog.className = 'color-picker-dialog';
        dialog.innerHTML = `
            <div class="color-picker-header">
                <div class="color-picker-header-swatch" id="picker-header-swatch"></div>
                <div class="color-picker-header-copy">
                    <h2>全局主题颜色</h2>
                    <p>调整后立即同步到整个 WebUI</p>
                </div>
                <span class="color-global-badge">全局生效</span>
            </div>
            <div class="color-picker-content">
                <div class="color-global-preview">
                    <div class="color-preview-topbar">
                        <strong>Corona</strong>
                        <span id="picker-live-desc">色调 ${originalHue}°</span>
                    </div>
                    <div class="color-preview-tabs">
                        <span class="active">主页</span>
                        <span>配置</span>
                        <i id="picker-live-dot"></i>
                    </div>
                    <div class="color-preview-grid">
                        <div class="color-preview-card">
                            <small>运行内存</small>
                            <strong id="picker-live-value">68%</strong>
                            <span class="color-live-bar"><i id="picker-live-bar"></i></span>
                        </div>
                        <div class="color-preview-card color-preview-actions">
                            <span class="color-live-chip" id="picker-live-chip">选中项</span>
                            <span class="color-live-btn" id="picker-live-btn">主按钮</span>
                        </div>
                    </div>
                </div>
                <div class="color-picker-section-title">预设颜色</div>
                <div class="preset-colors">
                    ${colorPresets.map(preset => `
                        <button type="button" class="preset-color${Math.abs(preset.hue - originalHue) <= 2 ? ' active' : ''}" data-hue="${preset.hue}" aria-label="${preset.name}">
                            <span class="preset-color-dot" style="--preview-hue:${preset.hue}"></span>
                            <span class="preset-color-name">${preset.name}</span>
                        </button>
                    `).join('')}
                </div>
                <label class="hue-setting-label">
                    <span>自定义色调</span>
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
        this.translateDom(dialog);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const slider = dialog.querySelector('#picker-hue-slider');
        const output = dialog.querySelector('#picker-hue-value');
        const presets = dialog.querySelectorAll('.preset-color');
        const headerSwatch = dialog.querySelector('#picker-header-swatch');
        const liveDesc = dialog.querySelector('#picker-live-desc');
        const liveChip = dialog.querySelector('#picker-live-chip');
        const liveBtn = dialog.querySelector('#picker-live-btn');
        const liveDot = dialog.querySelector('#picker-live-dot');
        const liveBar = dialog.querySelector('#picker-live-bar');
        const liveValue = dialog.querySelector('#picker-live-value');

        const paintLocalPreview = (value, primary, dim) => {
            if (headerSwatch) headerSwatch.style.background = primary;
            if (liveDesc) liveDesc.textContent = this.localizeMessage(`色调 ${value}° · 全局同步`);
            if (liveChip) {
                liveChip.style.background = dim;
                liveChip.style.color = primary;
                liveChip.style.borderColor = primary;
            }
            if (liveBtn) liveBtn.style.background = primary;
            if (liveDot) liveDot.style.background = primary;
            if (liveValue) liveValue.style.color = primary;
            if (liveBar) liveBar.style.background = primary;
        };

        let previewFrame = 0;
        let committedHue = originalHue;
        const renderHue = (persist = false, toast = false) => {
            const painted = this.applyHue(draftHue, false, { persist, updateState: true, refreshControls: persist, emit: persist });
            if (persist) committedHue = draftHue;
            paintLocalPreview(painted.value, painted.primary, painted.dim);
            if (slider && typeof this.updateSliderProgress === 'function') this.updateSliderProgress(slider);
            if (toast && typeof this.showToast === 'function') this.showToast(`${this.t('colorChanged')}: ${draftHue}°`);
        };
        const previewHue = (hue, { toast = false, persist = false, immediate = false } = {}) => {
            draftHue = this.normalizeHue(hue);
            if (output) output.textContent = `${draftHue}°`;
            if (slider && String(slider.value) !== String(draftHue)) slider.value = String(draftHue);
            presets.forEach(p => {
                const ph = parseInt(p.dataset.hue, 10);
                p.classList.toggle('active', Math.abs(ph - draftHue) <= 2);
            });
            if (immediate) {
                if (previewFrame) cancelAnimationFrame(previewFrame);
                previewFrame = 0;
                renderHue(persist, toast);
                return;
            }
            if (previewFrame) return;
            previewFrame = requestAnimationFrame(() => {
                previewFrame = 0;
                renderHue(false, false);
            });
        };

        previewHue(originalHue, { immediate: true });

        presets.forEach(p => {
            p.addEventListener('click', () => previewHue(p.dataset.hue, { toast: true, persist: true, immediate: true }));
        });
        slider.addEventListener('input', () => previewHue(slider.value));
        slider.addEventListener('change', () => previewHue(slider.value, { toast: true, persist: true, immediate: true }));

        const closeDialog = () => {
            if (previewFrame) cancelAnimationFrame(previewFrame);
            if (committedHue !== draftHue) renderHue(true, false);
            overlay.classList.add('closing');
            dialog.classList.add('closing');
            setTimeout(() => overlay.remove(), 170);
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
            opt.addEventListener('click', async (event) => {
                if (opt.dataset.theme === this.state.theme || document.body.classList.contains('theme-switching')) return;
                themeOptions.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                const nextTheme = opt.dataset.theme;
                localStorage.setItem('corona_theme', nextTheme);
                await this.applyTheme(nextTheme, true, { x: event.clientX, y: event.clientY });
                this.showToast(`${this.t('themeSwitched')}: ${opt.querySelector('span').textContent}`);
            });
        });
        if (typeof this.initAccentSelector === 'function') this.initAccentSelector();
    },
    openAnimatedExternalUrl(url) {
        if (!url) return;
        const overlay = document.getElementById('link-transition-overlay');
        if (overlay) {
            const label = overlay.querySelector('.link-transition-label');
            if (label) label.textContent = this.localizeMessage('正在打开链接');
            overlay.classList.remove('leaving');
            overlay.classList.add('show');
        }
        setTimeout(() => {
            try {
                const opened = window.open(url, '_blank', 'noopener,noreferrer');
                if (!opened) window.location.href = url;
            } catch (error) {
                try { window.location.href = url; } catch (_) {}
            }
            if (overlay) {
                overlay.classList.add('leaving');
                setTimeout(() => overlay.classList.remove('show', 'leaving'), 220);
            }
        }, overlay ? 180 : 0);
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
            const content = await this.readConfig(filename);
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
