(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["memory-extras"]) return;
  Object.assign(CoronaAddon.prototype, {
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
        this.openOverlayElement(overlay);
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
        this.openOverlayElement(overlay);
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
                        this.openOverlayElement(xinranOverlay);
                    }, 300);
                }
            };
        }
    },
    hideEasterEgg() {
        const overlay = document.getElementById('easter-egg-overlay');
        if (!overlay) return;
        this.easterEgg.isOverlayOpen = false;
        this.closeOverlayElement(overlay, { duration: 400, endSelector: '.easter-egg-card', endProperty: 'transform' });
        setTimeout(() => {
            const card = document.getElementById('easter-egg-card');
            if (card) {
                card.style.transform = '';
                card.style.transition = '';
            }
        }, 400);
    },
  });
  window.CoronaFeatureScripts["memory-extras"] = true;
})();
