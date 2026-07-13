(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["home-ui"]) return;
  Object.assign(CoronaAddon.prototype, {
    ensureCollapsible(content) {
        if (!content) return null;
        if (content.dataset.collapsibleReady === '1') {
            return content.querySelector(':scope > .collapsible-inner') || content.firstElementChild;
        }
        const inner = document.createElement('div');
        inner.className = 'collapsible-inner';
        while (content.firstChild) inner.appendChild(content.firstChild);
        content.appendChild(inner);
        content.dataset.collapsibleReady = '1';
        content.classList.add('collapsible-panel');
        content.classList.remove('expanded');
        content.style.removeProperty('max-height');
        content.style.removeProperty('overflow');
        content.style.removeProperty('opacity');
        content.style.removeProperty('transform');
        content.style.removeProperty('padding');
        content.style.removeProperty('transition-duration');
        return inner;
    },
    getPanelAnimMs(heightPx) {
        // taller content -> longer anim; short content stays snappy
        const h = Math.max(0, Number(heightPx) || 0);
        // ~0.55ms per px, clamp 220ms .. 720ms
        return Math.round(Math.min(720, Math.max(220, h * 0.55 + 180)));
    },
    setPanelTransition(content, durationMs, mode = 'both') {
        if (!content) return;
        const d = Math.max(180, Number(durationMs) || 320);
        const ease = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
        if (mode === 'height') {
            // collapse: only fold height so inner content stays visible while closing
            content.style.transition = `max-height ${d}ms ${ease}`;
            return;
        }
        content.style.transition = `max-height ${d}ms ${ease}, opacity ${Math.round(d * 0.7)}ms ease, transform ${Math.round(d * 0.8)}ms ${ease}`;
    },
    clearPanelTransition(content) {
        if (!content) return;
        content.style.removeProperty('transition');
        content.style.removeProperty('transition-duration');
    },

    forceClosePanel(content, toggle = null) {
        if (!content) return;
        if (content._animTimer) { clearTimeout(content._animTimer); content._animTimer = null; }
        if (content._anim) {
            try { content.removeEventListener('transitionend', content._anim); } catch (e) {}
            content._anim = null;
        }
        this.clearPanelTransition(content);
        content.classList.remove('expanded', 'expanding', 'panel-animating');
        content.classList.add('hidden');
        content.style.maxHeight = '0px';
        content.style.opacity = '0';
        content.style.transform = 'translateY(-8px)';
        content.style.overflow = 'hidden';
        content.style.pointerEvents = 'none';

        if (toggle) {
            toggle.classList.remove('expanded');
            const icon = toggle.querySelector ? toggle.querySelector('.expand-icon') : null;
            if (icon) icon.classList.remove('expanded');
            const header = (toggle.closest && (toggle.closest('.module-card-header') || toggle.closest('.sub-card-header'))) || null;
            if (header) header.classList.remove('expanded');
        }
    },
    forceCloseAllPanels() {
        document.querySelectorAll('.module-card-content, .sub-expandable-content').forEach((content) => {
            let toggle = null;
            if (content.id && content.id.endsWith('-content')) {
                toggle = document.getElementById(content.id.replace(/-content$/, '-toggle'));
            }
            this.forceClosePanel(content, toggle);
        });
        document.querySelectorAll('.module-card-header.expanded, .sub-card-header.expanded, .module-card-expand.expanded').forEach((el) => {
            el.classList.remove('expanded');
        });
        document.querySelectorAll('.module-card.expanding').forEach((el) => el.classList.remove('expanding'));
        if (typeof this.stopZramMetricsRefresh === 'function') this.stopZramMetricsRefresh();
    },
    expandPanelContent(content, toggle, { icon = null, cardEl = null, onExpand = null } = {}) {
        if (!content) return;
        this.ensureCollapsible(content);
        if (content._animTimer) { clearTimeout(content._animTimer); content._animTimer = null; }
        if (content._anim) { content.removeEventListener('transitionend', content._anim); content._anim = null; }

        content.classList.remove('hidden');
        content.style.removeProperty('pointer-events');
        content.style.overflow = 'hidden';

        // measure target height with expanded class/padding
        content.classList.add('expanded');
        content.style.maxHeight = 'none';
        content.style.opacity = '1';
        content.style.transform = 'translateY(0)';
        const target = Math.max(content.scrollHeight, 1);
        const duration = this.getPanelAnimMs(target);

        // start collapsed frame
        content.style.maxHeight = '0px';
        content.style.opacity = '0';
        content.style.transform = 'translateY(-8px)';
        this.setPanelTransition(content, duration);
        void content.offsetHeight;

        // animate open
        content.style.maxHeight = target + 'px';
        content.style.opacity = '1';
        content.style.transform = 'translateY(0)';

        if (toggle) toggle.classList.add('expanded');
        if (icon) icon.classList.add('expanded');
        const header = toggle && (toggle.closest('.module-card-header') || toggle.closest('.sub-card-header'));
        if (header) header.classList.add('expanded');

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            if (content._anim) content.removeEventListener('transitionend', content._anim);
            clearTimeout(content._animTimer);
            content._anim = null;
            content._animTimer = null;
            this.clearPanelTransition(content);
            if (content.classList.contains('expanded')) {
                content.style.maxHeight = 'none';
                content.style.overflow = 'visible';
                content.style.opacity = '1';
                content.style.transform = 'none';
            }
            if (cardEl) cardEl.classList.remove('expanding');
            if (typeof endExpand === 'function') endExpand();
            if (typeof onExpand === 'function') {
                Promise.resolve().then(() => onExpand()).catch(() => {});
            }
        };
        const onEnd = (e) => {
            if (e && e.target !== content) return;
            if (e && e.propertyName && e.propertyName !== 'max-height') return;
            finish();
        };
        content._anim = onEnd;
        content.addEventListener('transitionend', onEnd);
        content._animTimer = setTimeout(finish, duration + 100);
    },
    collapsePanelContent(content, toggle, { icon = null, cardEl = null, onCollapse = null, beforeCollapse = null } = {}) {
        if (!content) return;
        this.ensureCollapsible(content);
        if (content._animTimer) { clearTimeout(content._animTimer); content._animTimer = null; }
        if (content._anim) { content.removeEventListener('transitionend', content._anim); content._anim = null; }
        if (typeof beforeCollapse === 'function') {
            try { beforeCollapse(); } catch (e) {}
        }

        // Keep expanded class during fold so padding/content stay visible;
        // only animate height — avoids "content vanishes then collapses".
        content.classList.add('expanded');
        content.classList.remove('hidden');
        content.style.overflow = 'hidden';
        content.style.opacity = '1';
        content.style.transform = 'none';
        content.style.pointerEvents = 'none';

        const rectH = content.getBoundingClientRect().height;
        const from = Math.max(rectH || content.scrollHeight || 1, 1);
        content.style.maxHeight = from + 'px';
        const duration = this.getPanelAnimMs(from);
        this.setPanelTransition(content, duration, 'height');
        void content.offsetHeight;

        // fold height only
        content.style.maxHeight = '0px';

        // chevrons can turn immediately
        if (toggle) toggle.classList.remove('expanded');
        if (icon) icon.classList.remove('expanded');
        const header = toggle && (toggle.closest('.module-card-header') || toggle.closest('.sub-card-header'));
        if (header) header.classList.remove('expanded');
        if (typeof onCollapse === 'function') {
            try { onCollapse(); } catch (e) {}
        }

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            if (content._anim) content.removeEventListener('transitionend', content._anim);
            clearTimeout(content._animTimer);
            content._anim = null;
            content._animTimer = null;
            // only now hide content / remove expanded
            if (typeof this.forceClosePanel === 'function') {
                this.forceClosePanel(content, toggle);
            } else {
                this.clearPanelTransition(content);
                content.classList.remove('expanded');
                content.classList.add('hidden');
                content.style.maxHeight = '0px';
                content.style.opacity = '0';
                content.style.overflow = 'hidden';
            }
            if (cardEl) cardEl.classList.remove('expanding');
            if (typeof endExpand === 'function') endExpand();
        };
        const onEnd = (e) => {
            if (e && e.target !== content) return;
            if (e && e.propertyName && e.propertyName !== 'max-height') return;
            finish();
        };
        content._anim = onEnd;
        content.addEventListener('transitionend', onEnd);
        content._animTimer = setTimeout(finish, duration + 120);
    },

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
    },
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
        if (document.getElementById('page-home')?.classList.contains('active')) {
            this.pendingChartDraw = false;
            this.drawChart();
        } else {
            this.pendingChartDraw = true;
        }
    },
    drawChart() {
        if (!this.chartCtx) return;
        const homeActive = document.getElementById('page-home')?.classList.contains('active');
        if (!homeActive) { this.pendingChartDraw = true; return; }
        const canvas = this.chartCanvas;
        const ctx = this.chartCtx;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const width = rect.width;
        const height = rect.height;
        ctx.clearRect(0, 0, width, height);
        const styles = getComputedStyle(document.body);
        const textMain = styles.getPropertyValue('--text-main').trim() || '#1A1A1A';
        const textSub = styles.getPropertyValue('--text-sub').trim() || '#6E6E6E';
        const primaryColor = styles.getPropertyValue('--primary').trim() || '#3482FF';
        const primaryDim = styles.getPropertyValue('--primary-dim').trim() || 'rgba(52, 130, 255, 0.2)';
        let data = [], maxVal = 100, unit = '%', color1 = primaryColor, color2 = primaryDim, label = 'CPU 使用率';
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
    },
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
    },
    initExpandableCards() {
        const cards = [
            { toggle: 'memory-compression-toggle', content: 'memory-compression-content', onExpand: null },
            { toggle: 'le9ec-toggle', content: 'le9ec-content', onExpand: () => this.loadLe9ecStatus() },
            { toggle: 'io-scheduler-toggle', content: 'io-scheduler-content', onExpand: null },
            { toggle: 'cpu-governor-toggle', content: 'cpu-governor-content', onExpand: null },
            { toggle: 'app-policy-toggle', content: 'app-policy-content', onExpand: null },
            { toggle: 'tcp-toggle', content: 'tcp-content', onExpand: null },
            { toggle: 'custom-scripts-toggle', content: 'custom-scripts-content', onExpand: null },
            { toggle: 'system-opt-toggle', content: 'system-opt-content', onExpand: null },
            { toggle: 'corona-kernel-toggle', content: 'corona-kernel-content', onExpand: () => { setTimeout(() => this.loadCoronaKernelConfig(), 0); } },
            { toggle: 'app-settings-toggle', content: 'app-settings-content', onExpand: null }
        ];
        cards.forEach(card => {
            const toggle = document.getElementById(card.toggle);
            const content = document.getElementById(card.content);
            if (!toggle || !content) return;
            this.ensureCollapsible(content);
            content.classList.remove('hidden', 'expanded');
            toggle.classList.remove('expanded');
            toggle.addEventListener('click', () => {
                const open = content.classList.contains('expanded');
                const cardEl = toggle.closest('.module-card');
                if (cardEl) cardEl.classList.add('expanding');
                if (typeof beginExpand === 'function') beginExpand();
                if (open) {
                    this.collapsePanelContent(content, toggle, {
                        cardEl,
                        beforeCollapse: content.id === 'memory-compression-content'
                            ? () => this.collapseMemoryCompressionChildren(content)
                            : null
                    });
                } else {
                    this.expandPanelContent(content, toggle, {
                        cardEl,
                        onExpand: card.onExpand || null
                    });
                }
            });
        });
        this.initSubCards();
        this.initCardVisibility();
    },
    initCardVisibility() {
        const toggle = document.getElementById('card-visibility-toggle');
        const list = document.getElementById('card-visibility-list');
        if (toggle && list) {
            list.classList.remove('expanded');
            toggle.classList.remove('expanded');
            toggle.addEventListener('click', () => {
                const isExpanded = list.classList.contains('expanded');
                list.classList.toggle('expanded', !isExpanded);
                toggle.classList.toggle('expanded', !isExpanded);
                this.refreshExpandedContentHeight('app-settings-content');
            });
        }
        const appSettingsCard = document.querySelector('.module-card[data-card-key="app-settings"]');
        if (appSettingsCard) appSettingsCard.classList.remove('card-hidden');
        const savedVisibility = localStorage.getItem('corona_card_visibility');
        let visibility = savedVisibility ? (() => { try { return JSON.parse(savedVisibility); } catch (e) { return {}; } })() : {};
        if (!visibility || typeof visibility !== 'object' || Array.isArray(visibility)) visibility = {};
        if (visibility['app-settings'] === false) {
            delete visibility['app-settings'];
            localStorage.setItem('corona_card_visibility', JSON.stringify(visibility));
        }
        const switches = document.querySelectorAll('.card-visibility-switch');
        switches.forEach(sw => {
            const cardKey = sw.dataset.card;
            if (!cardKey || cardKey === 'app-settings') {
                this.setCardVisibilityOptionState(sw, false);
                sw.checked = true;
                return;
            }
            const card = document.querySelector(`.module-card[data-card-key="${cardKey}"]`);
            const isVisible = visibility[cardKey] !== false;
            this.setCardVisibilityOptionState(sw, this.isCardVisibilityOptionAvailable(card), { forceChecked: isVisible });
            if (card) card.classList.toggle('card-hidden', !isVisible);
            sw.addEventListener('change', () => {
                visibility[cardKey] = sw.checked;
                localStorage.setItem('corona_card_visibility', JSON.stringify(visibility));
                if (card) card.classList.toggle('card-hidden', !sw.checked);
                if (appSettingsCard) appSettingsCard.classList.remove('card-hidden');
                this.refreshSettingsSectionMarkers();
                this.refreshExpandedContentHeight('app-settings-content');
            });
        });
        this.refreshCardVisibilityAvailability();
    },
    isCardVisibilityOptionAvailable(card) {
        if (!card) return false;
        return card.style.display !== 'none';
    },
    setCardVisibilityOptionState(input, enabled, options = {}) {
        if (!input) return;
        input.disabled = !enabled;
        const container = input.closest('.card-visibility-switch-container');
        if (container) container.classList.toggle('disabled', !enabled);
        if (options.forceChecked !== undefined) input.checked = !!options.forceChecked;
    },
    isSettingsCardVisible(card) {
        if (!card) return false;
        return getComputedStyle(card).display !== 'none';
    },
    refreshCardVisibilityAvailability() {
        document.querySelectorAll('.card-visibility-switch').forEach(sw => {
            const cardKey = sw.dataset.card;
            if (!cardKey || cardKey === 'app-settings') return;
            const card = document.querySelector(`.module-card[data-card-key="${cardKey}"]`);
            const available = this.isCardVisibilityOptionAvailable(card);
            this.setCardVisibilityOptionState(sw, available, { forceChecked: available ? sw.checked : false });
        });
        this.refreshSettingsSectionMarkers();
    },
    refreshSettingsSectionMarkers() {
        document.querySelectorAll('.section-marker-settings').forEach(marker => {
            let hasVisibleCard = false;
            let sibling = marker.nextElementSibling;
            while (sibling) {
                if (sibling.classList.contains('section-marker-settings')) break;
                if (sibling.classList.contains('module-card') && sibling.dataset.cardKey) {
                    if (this.isSettingsCardVisible(sibling)) {
                        hasVisibleCard = true;
                        break;
                    }
                    if (sibling.dataset.cardKey === 'app-settings') break;
                }
                sibling = sibling.nextElementSibling;
            }
            marker.style.display = hasVisibleCard ? '' : 'none';
        });
        this.refreshExpandedContentHeight('app-settings-content');
    },
    initSubCards() {
        const subCards = [
            { toggle: 'zram-toggle', content: 'zram-content', onExpand: () => this.startZramMetricsRefresh(), onCollapse: () => this.stopZramMetricsRefresh() },
            { toggle: 'swap-toggle', content: 'swap-content', onExpand: () => this.loadSwapStatus() },
            { toggle: 'lru-toggle', content: 'lru-content', onExpand: null },
            { toggle: 'vm-toggle', content: 'vm-content', onExpand: null }
        ];
        subCards.forEach(card => {
            const toggle = document.getElementById(card.toggle);
            const content = document.getElementById(card.content);
            if (!toggle || !content) return;
            const icon = toggle.querySelector('.expand-icon');
            this.ensureCollapsible(content);
            content.classList.remove('expanded');
            toggle.classList.remove('expanded');
            if (icon) icon.classList.remove('expanded');
            toggle.addEventListener('click', () => {
                const open = content.classList.contains('expanded');
                const cardEl = toggle.closest('.module-card');
                if (cardEl) cardEl.classList.add('expanding');
                if (typeof beginExpand === 'function') beginExpand();
                if (open) {
                    this.collapsePanelContent(content, toggle, {
                        icon, cardEl, onCollapse: card.onCollapse || null
                    });
                } else {
                    this.expandPanelContent(content, toggle, {
                        icon, cardEl, onExpand: card.onExpand || null
                    });
                }
            });
        });
    },
    collapseMemoryCompressionChildren(parentContent) {
        if (typeof this.stopZramMetricsRefresh === 'function') this.stopZramMetricsRefresh();
        if (!parentContent) return;
        parentContent.querySelectorAll('.sub-expandable-content').forEach((content) => {
            let toggle = null;
            if (content.id && content.id.endsWith('-content')) {
                toggle = document.getElementById(content.id.replace(/-content$/, '-toggle'));
            }
            if (typeof this.forceClosePanel === 'function') this.forceClosePanel(content, toggle);
            else {
                content.classList.remove('expanded');
                content.classList.add('hidden');
                content.style.maxHeight = '0px';
            }
        });
    },
    refreshExpandedContentHeight(contentId) {
        const content = typeof contentId === 'string' ? document.getElementById(contentId) : contentId;
        if (content) this.ensureCollapsible(content);
    },
    async ensureExpandableOpen(toggleId, contentId) {
        const toggle = document.getElementById(toggleId);
        const content = document.getElementById(contentId);
        if (!toggle || !content) return;
        if (content.classList.contains('expanded')) return;
        toggle.click();
        await this.sleep(360);
    },
    async openSettingsTarget({ cardId, cardToggleId, cardContentId, subToggleId, subContentId, scrollBlock = 'center' }) {
        await this.switchPage('settings');
        await this.sleep(80);
        if (cardToggleId && cardContentId) {
            await this.ensureExpandableOpen(cardToggleId, cardContentId);
        }
        if (subToggleId && subContentId) {
            await this.ensureExpandableOpen(subToggleId, subContentId);
        }
        const target = document.getElementById(subToggleId || cardId || cardToggleId);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: scrollBlock });
    },
    initHomeCardClicks() {
        document.getElementById('cpu-card').addEventListener('click', async () => {
            await this.openSettingsTarget({
                cardId: 'cpu-governor-card',
                cardToggleId: 'cpu-governor-toggle',
                cardContentId: 'cpu-governor-content',
                scrollBlock: 'center'
            });
        });
        document.getElementById('swap-card').addEventListener('click', async () => {
            await this.openSettingsTarget({
                cardId: 'memory-compression-card',
                cardToggleId: 'memory-compression-toggle',
                cardContentId: 'memory-compression-content',
                scrollBlock: 'start'
            });
        });
        document.getElementById('battery-card').addEventListener('click', () => this.showBatteryDetail());
        document.getElementById('mem-card').addEventListener('click', () => this.showUFSDetail());
        document.getElementById('storage-card').addEventListener('click', () => this.showStorageDetail());
    },
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
    },
    showOverlay(id) {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        if (overlay._hideTimer) {
            clearTimeout(overlay._hideTimer);
            overlay._hideTimer = null;
        }
        if (overlay._hideTransitionEnd) {
            overlay.removeEventListener('transitionend', overlay._hideTransitionEnd);
            overlay._hideTransitionEnd = null;
        }
        overlay.classList.remove('hidden', 'closing');
        overlay.querySelectorAll('.detail-card, .priority-process-card, .script-edit-card').forEach(card => {
            card.scrollTop = 0;
            card.style.height = '';
            card.style.maxHeight = '';
            card.style.transform = '';
        });
        overlay.querySelectorAll('textarea').forEach(t => { t.scrollTop = 0; });
        requestAnimationFrame(() => {
            requestAnimationFrame(() => overlay.classList.add('show'));
        });
        if (overlay.classList.contains('no-close-btn')) {
            const floatingHeader = document.getElementById('floating-header');
            if (floatingHeader) floatingHeader.classList.add('overlay-hidden');
        }
    },
    hideOverlay(id) {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        if (overlay._hideTimer) {
            clearTimeout(overlay._hideTimer);
            overlay._hideTimer = null;
        }
        if (overlay._hideTransitionEnd) {
            overlay.removeEventListener('transitionend', overlay._hideTransitionEnd);
            overlay._hideTransitionEnd = null;
        }
        if (id === 'module-intro-overlay') {
            overlay.classList.add('closing');
            overlay.classList.remove('show');
            overlay._hideTimer = setTimeout(() => {
                overlay.classList.add('hidden');
                overlay.classList.remove('closing');
                overlay._hideTimer = null;
            }, 250);
            return;
        }
        overlay.classList.remove('show');
        if (overlay.classList.contains('no-close-btn')) {
            const floatingHeader = document.getElementById('floating-header');
            if (floatingHeader) floatingHeader.classList.remove('overlay-hidden');
        }
        const finalize = () => {
            if (overlay._hideTimer) {
                clearTimeout(overlay._hideTimer);
                overlay._hideTimer = null;
            }
            if (overlay._hideTransitionEnd) {
                overlay.removeEventListener('transitionend', overlay._hideTransitionEnd);
                overlay._hideTransitionEnd = null;
            }
            overlay.classList.add('hidden');
        };
        const onTransitionEnd = (e) => {
            if (e.propertyName === 'transform' && e.target.classList && e.target.classList.contains('detail-card')) {
                finalize();
            }
        };
        overlay._hideTransitionEnd = onTransitionEnd;
        overlay.addEventListener('transitionend', onTransitionEnd);
        overlay._hideTimer = setTimeout(finalize, 360);
    },
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
    },
    async loadDualCellConfig() { const result = await this.exec(`cat ${this.configDir}/dual_cell.conf 2>/dev/null`); if (result) this.state.dualCell = result.includes('dualCell=1'); },
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
    },
    showStorageDetail() { this.showOverlay('storage-detail-overlay'); },
    async runGC() { this.showLoading(true); await this.exec('sync && echo 1 > /sys/fs/f2fs/*/gc_urgent'); await this.sleep(2000); await this.exec('echo 0 > /sys/fs/f2fs/*/gc_urgent'); this.showLoading(false); this.showToast('GC 执行完成'); },
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
    },
    async getMemoryInfo() {
        const meminfo = await this.exec('cat /proc/meminfo');
        let total = 0, available = 0, free = 0, buffers = 0, cached = 0;
        for (const line of meminfo.split('\n')) { const match = line.match(/^(\w+):\s+(\d+)/); if (!match) continue; const [, key, value] = match; const kb = parseInt(value); if (key === 'MemTotal') total = kb; else if (key === 'MemAvailable') available = kb; else if (key === 'MemFree') free = kb; else if (key === 'Buffers') buffers = kb; else if (key === 'Cached') cached = kb; }
        if (!available) available = free + buffers + cached;
        return { total, available, free, buffers, cached };
    },
    sendNotification(title, message) { this.exec(`su -c 'cmd notification post -S bigtext -t "${title}" corona_memclean "${message}"'`); },
    initResetAllBtn() {
        const btn = document.getElementById('reset-all-btn');
        if (!btn || btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => this.resetAllSettings());
    },
    async resetAllSettings() {
        const confirmed = await this.showConfirm('确定要重置所有设置吗？\n\n此操作将删除所有配置文件并立刻重启，且不可撤销！', '一键重置');
        if (!confirmed) return;
        this.showLoading(true);
        await this.exec(`rm -rf ${this.configDir}`);
        await this.exec(`sed -i 's/^description=.*/description=等待首次设置……/' '${this.modDir}/module.prop' 2>/dev/null`);
        this.showToast('配置已重置，正在重启...');
        await this.sleep(500);
        await this.exec('reboot');
    },
    renderKernelWorkflowBuild() {
        const section = document.getElementById('kernel-build-section');
        const text = document.getElementById('kernel-build-text');
        const show = !!(this.isCoronaKernel && this.localKernelWorkflowBuild);
        if (section) section.classList.toggle('hidden', !show);
        if (text && show) text.textContent = `当前迭代：#${this.localKernelWorkflowBuild}`;
    },
    async loadModuleVersion() {
        const prop = await this.exec(`cat ${this.modDir}/module.prop`);
        const match = prop.match(/version=(\S+)/);
        const ver = match ? match[1] : '--';
        const el = document.getElementById('current-version-text');
        if (el) el.textContent = `当前版本：${ver}`;
        this.renderKernelWorkflowBuild();
        await this.checkKernelReleaseUpdate();
    },
    extractKernelBuildNumber(source) {
        const text = String(source || '').trim();
        if (!text) return 0;
        const match = text.match(/全量构建\s*#(\d+)/) || text.match(/#(\d+)/) || text.match(/(\d+)/);
        return match ? parseInt(match[1], 10) || 0 : 0;
    },
    async fetchLatestKernelReleaseInfo() {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timer = null;
        try {
            if (controller) timer = setTimeout(() => controller.abort(), 8000);
            const response = await fetch('https://api.github.com/repos/wswzgdg/Corona-5.15-action/releases/latest', {
                headers: { 'Accept': 'application/vnd.github+json' },
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
            if (response.ok) {
                const data = await response.json();
                if (data && (data.prerelease || data.draft)) return null;
                const title = String(data.name || data.tag_name || '');
                const build = this.extractKernelBuildNumber(title);
                if (build) {
                    return {
                        build,
                        title,
                        url: String(data.html_url || 'https://github.com/wswzgdg/Corona-5.15-action/releases/latest')
                    };
                }
            }
        } catch (_) {}
        try {
            const fallbackResponse = await fetch('https://github.com/wswzgdg/Corona-5.15-action/releases/latest', {
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
            if (!fallbackResponse.ok) return null;
            const latestUrl = String(fallbackResponse.url || '');
            if (latestUrl && !latestUrl.includes('/releases/')) return null;
            const html = await fallbackResponse.text();
            const titleMatch = html.match(/全量构建\s*#\d+/);
            const title = titleMatch ? titleMatch[0] : '';
            const build = this.extractKernelBuildNumber(title || html);
            if (!build) return null;
            return {
                build,
                title: title || `全量构建 #${build}`,
                url: latestUrl || 'https://github.com/wswzgdg/Corona-5.15-action/releases/latest'
            };
        } catch (_) {
            return null;
        } finally {
            if (timer) clearTimeout(timer);
        }
    },
    renderKernelReleaseUpdate() {
        const hasUpdate = !!(this.kernelUpdateInfo && this.kernelUpdateInfo.build > this.localKernelWorkflowBuild);
        const floatingBadge = document.getElementById('floating-header-new');
        const floatingBlock = document.getElementById('floating-update-block');
        const floatingLink = document.getElementById('floating-header-link');
        if (floatingBadge) floatingBadge.classList.toggle('hidden', !hasUpdate);
        if (floatingBlock) floatingBlock.classList.toggle('hidden', !hasUpdate);
        if (floatingLink) floatingLink.classList.toggle('has-update', hasUpdate);
    },
    openKernelReleasePage() {
        const url = this.kernelUpdateInfo?.url || 'https://github.com/wswzgdg/Corona-5.15-action/releases/latest';
        if (!url) return;
        if (typeof window !== 'undefined' && typeof window.open === 'function') {
            const opened = window.open(url, '_blank');
            if (opened) return;
        }
        if (typeof location !== 'undefined') location.href = url;
    },
    bindKernelReleaseUpdateEvents() {
        const floatingLink = document.getElementById('floating-header-link');
        if (floatingLink && !floatingLink.dataset.bound) {
            floatingLink.dataset.bound = '1';
            floatingLink.addEventListener('click', (event) => {
                if (!this.kernelUpdateInfo) return;
                event.preventDefault();
                this.openKernelReleasePage();
            });
        }
    },
    async checkKernelReleaseUpdate() {
        this.bindKernelReleaseUpdateEvents();
        this.kernelUpdateInfo = null;
        this.localKernelWorkflowBuild = 0;
        if (!this.isCoronaKernel) {
            this.renderKernelWorkflowBuild();
            this.renderKernelReleaseUpdate();
            return;
        }
        const localBuild = this.extractKernelBuildNumber(await this.exec('cat /proc/corona 2>/dev/null'));
        if (!localBuild) {
            this.renderKernelWorkflowBuild();
            this.renderKernelReleaseUpdate();
            return;
        }
        this.localKernelWorkflowBuild = localBuild;
        this.renderKernelWorkflowBuild();
        const latest = await this.fetchLatestKernelReleaseInfo();
        if (latest && latest.build > localBuild) this.kernelUpdateInfo = latest;
        this.renderKernelReleaseUpdate();
    },
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
    },
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
    },
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
    },
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
,
    initScrollEffect() {
        const floatingHeader = document.getElementById('floating-header');
        const coronaTitle = document.getElementById('corona-title');
        const coronaTitleSettings = document.getElementById('corona-title-settings');
        const titleOverlines = document.querySelectorAll('.title-overline');
        let headerShown = false;
        const scroller = document.querySelector('.container') || window;
        const handleScroll = () => {
            const activePage = document.querySelector('.page.active');
            let currentTitle = coronaTitle;
            if (activePage && activePage.id === 'page-settings') {
                currentTitle = coronaTitleSettings;
            }
            if (!currentTitle || !floatingHeader) return;
            const titleRect = currentTitle.getBoundingClientRect();
            const titleBottom = titleRect.bottom;
            const triggerPoint = 26;
            const fadeStart = 78;
            const fadeEnd = 34;
            const progress = Math.max(0, Math.min(1, (titleBottom - fadeEnd) / (fadeStart - fadeEnd)));
            currentTitle.style.opacity = String(progress);
            currentTitle.style.transform = `translateY(${(1 - progress) * -5}px)`;
            titleOverlines.forEach(el => {
                const sameBlock = el.parentElement && el.parentElement.contains(currentTitle);
                el.style.opacity = sameBlock ? String(Math.max(0.18, progress)) : el.style.opacity;
                el.style.transform = sameBlock ? `translateY(${(1 - progress) * -4}px)` : el.style.transform;
            });
            const scrollTop = scroller === window ? window.scrollY : scroller.scrollTop;
            if (scrollTop > 28 && !headerShown) {
                headerShown = true;
                floatingHeader.classList.add('visible');
            } else if (scrollTop <= 8 && headerShown) {
                headerShown = false;
                floatingHeader.classList.remove('visible');
            }
            if (scrollTop <= 4 || (activePage && activePage.getBoundingClientRect().top >= -2) || titleRect.top >= 8) {
                currentTitle.style.opacity = '1';
                currentTitle.style.transform = 'translateY(0)';
                titleOverlines.forEach(el => {
                    if (el.parentElement && el.parentElement.contains(currentTitle)) {
                        el.style.opacity = '0.92';
                        el.style.transform = 'translateY(0)';
                    }
                });
                floatingHeader.classList.remove('visible', 'overlay-hidden');
                headerShown = false;
            }
        };
        scroller.addEventListener('scroll', rafThrottle(handleScroll), { passive: true });
        window.addEventListener('resize', rafThrottle(handleScroll), { passive: true });
        handleScroll();
    },
    initModuleIntro() {
        const moduleIntros = {
            'memory-compression': {
                title: '内存压缩',
                content: `ZRAM 是 Linux 内核的一个功能，它在内存中创建一个压缩的块设备作为交换空间。

当物理内存不足时，系统会将不常用的内存页压缩后存储到 ZRAM 中，从而有效扩展可用内存容量。

Swap 文件则是在存储设备上创建的交换空间，可以作为 ZRAM 的补充，适合内存较小的设备使用。`
            },
            'le9ec': {
                title: 'LE9EC 内存保护',
                content: `LE9EC 是一个内核补丁，用于保护工作集内存不被过度回收。

通过设置匿名页和文件页的保护阈值（以KB为单位），可以防止系统在内存压力下过度回收正在使用的内存，从而避免频繁的页面换入换出导致的系统卡顿和假死。

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
            'corona-kernel': {
                title: 'Corona 内核优化',
                content: `Corona 内核独有的省电与响应模块集合，按场景分组：

· 用户在场窗口：息屏后这段时间内的自动唤醒（调制解调器心跳、Alarm、传感器批送）会跳过 PM_POST_SUSPEND 的 restore，省掉一整轮存/恢复抖动。

· 挂起省电：分别从 swap 抑制、脏页冻结、compaction 关停、网络静默、watchdog 拆除、timer slack 抬高、调度 slack 抬高、pm_qos 钳位、RCU 慢路径九个角度，让 suspend 尾声真正闲下来。

· 唤醒响应：仅在真实用户唤醒时短暂拉高 cpufreq 下限，吃掉首屏延迟。

· 后台空闲：机会性 zram 回写与 vmstat 合并，降低长期空闲期的内核噪音。

非 Corona 内核会自动隐藏此卡片。`
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
  });
  window.CoronaFeatureScripts["home-ui"] = true;
})();
