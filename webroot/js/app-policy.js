(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["app-policy"]) return;
CoronaAddon.prototype.ensureAppPolicyState = function() {
    if (!this.appPolicy) {
        this.appPolicy = { monitorEnabled: false, notifyEnabled: false, whitelist: [], blacklist: [], protect: [], profiles: [], affinityExclude: [] };
    }
    if (!Array.isArray(this.appPolicy.affinityExclude)) this.appPolicy.affinityExclude = [];
    if (!Array.isArray(this.installedApps)) this.installedApps = [];
    if (!this.appPolicyCollator) this.appPolicyCollator = new Intl.Collator(['zh-CN', 'en'], { numeric: true, sensitivity: 'base' });
    if (!this.currentAppPolicyMode) this.currentAppPolicyMode = 'whitelist';
};
CoronaAddon.prototype.getAppPolicyScript = function(...args) {
    const parts = [`sh ${this.shellQuote(`${this.modDir}/app_policy.sh`)}`];
    args.filter(Boolean).forEach(arg => parts.push(arg));
    return parts.join(' ');
};
CoronaAddon.prototype.getBackgroundAppPolicyScript = function(...args) {
    return `nice -n 10 ionice -c 3 ${this.getAppPolicyScript(...args)}`;
};
CoronaAddon.prototype.parseAppRulesConfig = function(content) {
    this.ensureAppPolicyState();
    const next = { monitorEnabled: false, notifyEnabled: false, whitelist: [], protect: [], profiles: [], affinityExclude: [...(this.appPolicy.affinityExclude || [])] };
    String(content || '').split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx <= 0) return;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key === 'monitor_enabled') next.monitorEnabled = value === '1';
        if (key === 'notify_enabled') next.notifyEnabled = value === '1';
        if (key === 'whitelist') next.whitelist = value ? value.split(',').filter(Boolean) : [];
        if (key === 'protect') next.protect = value ? value.split(',').filter(Boolean) : [];
        if (key === 'profiles') next.profiles = value ? value.split(',').filter(Boolean) : [];
    });
    next.whitelist = [...new Set(next.whitelist)];
    next.protect = [...new Set(next.protect)];
    next.profiles = [...new Set(next.profiles)];
    this.appPolicy = next;
};
CoronaAddon.prototype.buildAppRulesConfig = function() {
    this.ensureAppPolicyState();
    const lines = [
        `monitor_enabled=${this.appPolicy.monitorEnabled ? '1' : '0'}`,
        `notify_enabled=${this.appPolicy.notifyEnabled ? '1' : '0'}`
    ];
    return lines.join('\n');
};
CoronaAddon.prototype.getAppPolicyListFilename = function(key) {
    if (key === 'whitelist') return 'app_whitelist.list';
    if (key === 'protect') return 'app_protect.list';
    if (key === 'profiles') return 'app_profiles.list';
    return `${key || 'app_policy'}.list`;
};
CoronaAddon.prototype.serializeAppPolicyList = function(items = []) {
    return [...new Set((items || []).filter(Boolean))].join('\n');
};
CoronaAddon.prototype.buildAppPolicyPreviewConfigs = function(keys = ['whitelist', 'protect', 'profiles'], overrides = {}) {
    const configs = [];
    if (keys.includes('rules')) {
        configs.push({ filename: 'app_rules.conf', content: this.buildAppRulesConfig() });
    }
    ['whitelist', 'protect', 'profiles'].forEach(key => {
        if (!keys.includes(key)) return;
        const items = overrides[key] || this.appPolicy[key] || [];
        configs.push({ filename: this.getAppPolicyListFilename(key), content: this.serializeAppPolicyList(items) || '# empty' });
    });
    return configs;
};
CoronaAddon.prototype.renderAppPolicySummary = function() {
    this.ensureAppPolicyState();
    const wl = this.appPolicy.whitelist.length;
    const pr = this.appPolicy.protect.length;
    const pf = this.appPolicy.profiles.length;
    const pt = Object.keys(this.priorityRules || {}).length;
    const threadPackages = this.getThreadRulePackages();
    const configuredCount = new Set([...(this.appPolicy.whitelist || []), ...(this.appPolicy.protect || []), ...(this.appPolicy.profiles || []), ...(this.appPolicy.affinityExclude || []), ...Object.keys(this.priorityRules || {}), ...threadPackages]).size;
    const badge = document.getElementById('app-policy-badge');
    if (badge) badge.textContent = configuredCount > 0 ? `${configuredCount} 个应用` : '未配置';
    const status = document.getElementById('app-policy-status');
    if (status) {
        if (configuredCount <= 0) {
            status.textContent = '还没有配置任何应用';
        } else if (this.appPolicy.monitorEnabled && pf > 0) {
            status.textContent = `已配置 ${configuredCount} 个应用，应用预设自动切换已开启`;
        } else {
            status.textContent = `已配置 ${configuredCount} 个应用`;
        }
    }
    const switchNotify = document.getElementById('app-notify-switch');
    const manageBtn = document.getElementById('app-policy-manage-btn');
    if (switchNotify) switchNotify.checked = !!this.appPolicy.notifyEnabled;
    if (manageBtn) {
        if (this.appPolicyManageLoading) {
            manageBtn.classList.add('is-loading');
            manageBtn.disabled = true;
            manageBtn.innerHTML = '<span class="btn-inline-spinner"></span><span>正在加载</span>';
        } else {
            manageBtn.classList.remove('is-loading');
            manageBtn.disabled = false;
            manageBtn.textContent = this.t('text_01d8b3ce');
        }
    }
};
CoronaAddon.prototype.loadAppRulesConfig = async function() {
    this.ensureAppPolicyState();
    const [content, affinityContent] = await Promise.all([
        this.exec(this.getAppPolicyScript('dump-rules')),
        this.readConfig('auto_affinity.conf')
    ]);
    this.parseAppRulesConfig(content);
    const affinityConfig = Object.fromEntries(this.parseSimpleConfig(affinityContent));
    this.appPolicy.affinityExclude = [...new Set(String(affinityConfig.exclude_packages || '').split(',').map(item => item.trim()).filter(Boolean))];
    this.renderAppPolicySummary();
};
CoronaAddon.prototype.syncAppPolicyDaemon = async function() {
    const shouldRun = !!this.appPolicy.monitorEnabled || (this.appPolicy.protect || []).length > 0 || (this.appPolicy.profiles || []).length > 0 || this.getThreadRulePackages().length > 0;
    if (shouldRun) {
        const runningPid = (await this.exec(this.getAppPolicyScript('daemon-status'))).trim();
        if (!runningPid) {
            await this.exec(`${this.getAppPolicyScript('daemon')} >/dev/null 2>&1 &`);
        } else {
            await this.exec(this.getAppPolicyScript('daemon-reload'));
        }
        return;
    }
    await this.exec(this.getAppPolicyScript('daemon-stop'));
    // skip full service.sh re-apply here; rules file already written, daemon stop is enough for UI path
};
CoronaAddon.prototype.scheduleAppPolicySync = function() {
    if (this.appPolicySyncTimer) clearTimeout(this.appPolicySyncTimer);
    this.appPolicySyncTimer = setTimeout(() => {
        this.syncAppPolicyDaemon().catch(() => {});
        this.appPolicySyncTimer = null;
    }, 80);
};
CoronaAddon.prototype.saveAppRulesConfig = async function(showToastText = '', options = {}) {
    const updates = {};
    if (options.changedKey === 'monitor_enabled') updates.monitor_enabled = this.appPolicy.monitorEnabled ? '1' : '0';
    if (options.changedKey === 'notify_enabled') updates.notify_enabled = this.appPolicy.notifyEnabled ? '1' : '0';
    if (Object.keys(updates).length > 0) {
        const content = await this.mergeConfigFile('app_rules.conf', updates, ['monitor_enabled', 'notify_enabled']);
        if (!content) {
            this.appPolicy.monitorEnabled = false;
            this.appPolicy.notifyEnabled = false;
        }
    }
    if (options.syncNow) {
        await this.syncAppPolicyDaemon();
    } else {
        this.scheduleAppPolicySync();
    }
    this.renderAppPolicySummary();
    if (showToastText) this.showToast(showToastText);
};
CoronaAddon.prototype.persistAppRulesSoon = function(changedKey, showToastText = '') {
    if (showToastText) this.showToast(showToastText);
    this.renderAppPolicySummary();
    if (this.appRulesPersistTimer) clearTimeout(this.appRulesPersistTimer);
    this.appRulesPersistTimer = setTimeout(() => {
        this.saveAppRulesConfig('', { syncNow: false, changedKey }).catch(() => {});
        this.appRulesPersistTimer = null;
    }, 100);
};
CoronaAddon.prototype.initAppPolicy = function() {
    this.ensureAppPolicyState();
    const notifySwitch = document.getElementById('app-notify-switch');
    if (notifySwitch && !notifySwitch.dataset.bound) {
        notifySwitch.dataset.bound = '1';
        notifySwitch.addEventListener('change', () => {
            this.appPolicy.notifyEnabled = notifySwitch.checked;
            this.persistAppRulesSoon('notify_enabled', `切换通知已${notifySwitch.checked ? '开启' : '关闭'}`);
        });
    }
    const buttons = {
        'app-policy-manage-btn': 'manage'
    };
    Object.entries(buttons).forEach(([id, mode]) => {
        const btn = document.getElementById(id);
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => this.openAppPolicyOverlay(mode));
        }
    });
    const search = document.getElementById('app-policy-search');
    if (search && !search.dataset.bound) {
        search.dataset.bound = '1';
        search.addEventListener('input', () => {
            if (this.appPolicySearchTimer) clearTimeout(this.appPolicySearchTimer);
            this.appPolicySearchTimer = setTimeout(() => {
                this.appPolicySearchTimer = null;
                this.renderAppPolicyList();
            }, 120);
        });
    }
    ['app-policy-overlay', 'app-profile-overlay'].forEach(id => {
        const overlay = document.getElementById(id);
        if (overlay && !overlay.dataset.bound) {
            overlay.dataset.bound = '1';
            overlay.addEventListener('click', (e) => {
                if (e.target !== overlay) return;
                if (id === 'app-profile-overlay') {
                    this.closeAppProfilePicker(false);
                    return;
                }
                this.hideOverlay(id);
            });
        }
    });
};
CoronaAddon.prototype.loadInstalledApps = async function(force = false) {
    this.ensureAppPolicyState();
    if (!force && this.installedAppsScanned && this.installedApps.length > 0) return this.installedApps;
    if (this.installedAppsLoadPromise) return this.installedAppsLoadPromise;
    this.installedAppsLoadPromise = (async () => {
        const output = await this.exec(this.getAppPolicyScript('list'));
        const apps = [];
        String(output || '').split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const parts = trimmed.split('|');
            const packageName = (parts[0] || '').trim();
            const componentName = (parts[1] || '').trim();
            if (!packageName) return;
            const cached = (this.appMetaCache && this.appMetaCache[packageName]) || {};
            const cachedLabel = cached.label && cached.label !== packageName ? cached.label : '';
            const label = cachedLabel || this.humanizePackageName(packageName);
            apps.push({
                packageName,
                componentName: cached.componentName || componentName,
                label,
                labelLoaded: !!cachedLabel,
                searchText: `${label}\n${packageName}`.toLowerCase()
            });
        });
        this.installedApps = apps;
        this.installedAppsScanned = apps.length > 0;
        return apps;
    })();
    try {
        return await this.installedAppsLoadPromise;
    } finally {
        this.installedAppsLoadPromise = null;
    }
};
CoronaAddon.prototype.hydrateInstalledAppsFromCache = function() {
    this.ensureAppPolicyState();
    if (this.installedApps.length > 0 || !this.appMetaCache || typeof this.appMetaCache !== 'object') {
        return this.installedApps;
    }
    this.installedApps = Object.entries(this.appMetaCache).map(([packageName, cached]) => {
        const meta = cached && typeof cached === 'object' ? cached : {};
        const cachedLabel = meta.label && meta.label !== packageName ? meta.label : '';
        const label = cachedLabel || this.humanizePackageName(packageName);
        return {
            packageName,
            componentName: meta.componentName || '',
            label,
            labelLoaded: !!cachedLabel,
            searchText: `${label}\n${packageName}`.toLowerCase()
        };
    });
    return this.installedApps;
};
CoronaAddon.prototype.refreshInstalledAppLabels = async function(force = false) {
    this.ensureAppPolicyState();
    if (!force && this.installedApps.length > 0 && this.installedApps.every(app => app.labelLoaded)) return this.installedApps;
    if (this.appLabelRefreshPromise) return this.appLabelRefreshPromise;
    this.appLabelRefreshPromise = (async () => {
        const output = await this.exec(this.getBackgroundAppPolicyScript('list-meta'));
        const metadata = new Map();
        let cacheChanged = false;
        String(output || '').split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const parts = trimmed.split('|');
            const packageName = (parts[0] || '').trim();
            const componentName = (parts[1] || '').trim();
            const fetchedLabel = (parts.slice(2).join('|') || '').trim();
            if (!packageName) return;
            const label = fetchedLabel && fetchedLabel !== packageName ? fetchedLabel : this.humanizePackageName(packageName);
            metadata.set(packageName, { componentName, label });
            const cached = (this.appMetaCache && this.appMetaCache[packageName]) || {};
            if (cached.label !== label || cached.componentName !== componentName) {
                this.appMetaCache[packageName] = { ...cached, label, componentName };
                cacheChanged = true;
            }
        });
        this.installedApps.forEach(app => {
            const meta = metadata.get(app.packageName);
            if (!meta) return;
            app.componentName = meta.componentName || app.componentName;
            app.label = meta.label;
            app.labelLoaded = true;
            app.searchText = `${app.label}\n${app.packageName}`.toLowerCase();
        });
        if (cacheChanged) this.scheduleSaveAppMetaCache();
        const search = document.getElementById('app-policy-search');
        const overlayOpen = document.getElementById('app-policy-overlay')?.classList.contains('show');
        if (overlayOpen && search?.value.trim()) this.renderAppPolicyList();
        else if (overlayOpen) this.refreshRenderedAppPolicyLabels();
        return this.installedApps;
    })();
    try {
        return await this.appLabelRefreshPromise;
    } finally {
        this.appLabelRefreshPromise = null;
    }
};
CoronaAddon.prototype.scheduleSaveAppMetaCache = function() {
    if (this._appMetaSaveTimer) clearTimeout(this._appMetaSaveTimer);
    this._appMetaSaveTimer = setTimeout(() => {
        this.saveAppMetaCache().catch(() => {});
        this._appMetaSaveTimer = null;
    }, 600);
};
CoronaAddon.prototype.humanizePackageName = function(pkg) {
    const parts = String(pkg || '').split('.').filter(Boolean);
    if (parts.length === 0) return pkg || '--';
    const generic = new Set(['com', 'org', 'net', 'android', 'app', 'cn']);
    const core = parts.filter(part => !generic.has(part.toLowerCase()));
    let picked = core.slice(-2);
    if (picked.length === 0) picked = parts.slice(-1);
    return picked.map(part => part.replace(/[_-]+/g, ' ').replace(/\w/g, c => c.toUpperCase())).join(' ');
};
CoronaAddon.prototype.getAppPolicyIconSource = function(pkg) {
    return `ksu://icon/${encodeURIComponent(String(pkg || ''))}`;
};
CoronaAddon.prototype.renderAppPolicyIcon = function(app) {
    const pkg = this.escapeHtml(app.packageName);
    return `<div class="app-policy-icon-wrap"><img class="app-policy-icon" data-pkg="${pkg}" alt="" loading="lazy" decoding="async"></div>`;
};
CoronaAddon.prototype.hydrateAppPolicyIcons = function(container) {
    if (!container) return;
    const list = document.getElementById('app-policy-list');
    if (!this.appPolicyIconObserver && 'IntersectionObserver' in window) {
        this.appPolicyIconObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const img = entry.target;
                this.appPolicyIconObserver.unobserve(img);
                img.src = this.getAppPolicyIconSource(img.dataset.pkg || '');
            });
        }, { root: list, rootMargin: '240px 0px' });
    }
    container.querySelectorAll('.app-policy-icon[data-pkg]').forEach(img => {
        if (img.dataset.bound === '1') return;
        img.dataset.bound = '1';
        img.addEventListener('load', () => {
            img.classList.add('loaded');
        });
        img.addEventListener('error', () => {
            img.classList.remove('loaded');
            img.closest('.app-policy-icon-wrap')?.classList.add('hidden');
        });
        if (this.appPolicyIconObserver) this.appPolicyIconObserver.observe(img);
        else img.src = this.getAppPolicyIconSource(img.dataset.pkg || '');
    });
};
CoronaAddon.prototype.getAppPolicyMembership = function() {
    this.ensureAppPolicyState();
    return {
        whitelist: new Set(this.appPolicy.whitelist || []),
        protect: new Set(this.appPolicy.protect || []),
        profiles: new Set(this.appPolicy.profiles || []),
        affinityExclude: new Set(this.appPolicy.affinityExclude || []),
        threads: new Set(this.getThreadRulePackages()),
        priority: new Set(Object.keys(this.priorityRules || {}))
    };
};
CoronaAddon.prototype.isAppPolicyConfigured = function(pkg, membership = null) {
    const refs = membership || this.getAppPolicyMembership();
    return refs.whitelist.has(pkg) || refs.protect.has(pkg) || refs.profiles.has(pkg) || refs.affinityExclude.has(pkg) || refs.priority.has(pkg) || refs.threads.has(pkg);
};
CoronaAddon.prototype.refreshAppPolicyPackage = function(pkg, { reorder = false, toast = '' } = {}) {
    this.renderAppPolicySummary();
    this.updateAppPolicyRow(pkg);
    if (reorder) this.reorderAppPolicyRow(pkg);
    if (toast) this.showToast(toast);
};
CoronaAddon.prototype.markAppProfileSaved = function(pkg, toast = '应用预设已保存') {
    if (!this.appPolicy.profiles.includes(pkg)) this.appPolicy.profiles.push(pkg);
    this.appPolicy.profiles = [...new Set(this.appPolicy.profiles)];
    this.refreshAppPolicyPackage(pkg, { reorder: true, toast });
    this.exec(this.getAppPolicyScript('list-set', 'profiles', 'add', this.shellQuote(pkg))).catch(() => {});
    this.scheduleAppPolicySync();
};
CoronaAddon.prototype.getAppPolicyTags = function(pkg, membership = null) {
    const refs = membership || this.getAppPolicyMembership();
    const tags = [];
    if (refs.profiles.has(pkg)) tags.push('预设');
    if (refs.threads.has(pkg)) tags.push('线程');
    if (refs.protect.has(pkg)) tags.push('保护');
    if (refs.whitelist.has(pkg)) tags.push('白名单');
    if (refs.affinityExclude.has(pkg)) tags.push('绑核排除');
    if (refs.priority.has(pkg)) tags.push('优先级');
    return tags;
};
CoronaAddon.prototype.renderAppPolicyLoadingState = function(message = '正在读取应用列表...') {
    const list = document.getElementById('app-policy-list');
    if (!list) return;
    list.innerHTML = `<div class="app-policy-loading-state"><div class="loading-spinner"></div><span class="loading-text">${this.escapeHtml(message)}</span></div>`;
};

CoronaAddon.prototype.closeAppProfilePicker = function(committed = false) {
    if (!committed && this.appProfileStateSnapshot) {
        this.appPolicy = {
            monitorEnabled: !!this.appProfileStateSnapshot.monitorEnabled,
            notifyEnabled: !!this.appProfileStateSnapshot.notifyEnabled,
            whitelist: [...(this.appProfileStateSnapshot.whitelist || [])],
            protect: [...(this.appProfileStateSnapshot.protect || [])],
            profiles: [...(this.appProfileStateSnapshot.profiles || [])],
            affinityExclude: [...(this.appProfileStateSnapshot.affinityExclude || [])]
        };
    }
    const pkg = this.selectedAppProfilePackage;
    this.selectedAppProfilePackage = '';
    this.selectedAppProfileLabel = '';
    this.appProfileStateSnapshot = null;
    this.hideOverlay('app-profile-overlay');
    if (pkg) {
        this.updateAppPolicyRow(pkg);
        this.renderAppPolicySummary();
    }
};
CoronaAddon.prototype.setAppPolicyManageLoading = function(loading) {
    this.appPolicyManageLoading = !!loading;
    this.renderAppPolicySummary();
};
CoronaAddon.prototype.openAppPolicyOverlay = async function(mode) {
    this.ensureAppPolicyState();
    this.hydrateInstalledAppsFromCache();
    this.currentAppPolicyMode = mode;
    const titleMap = { manage: '应用列表' };
    const title = document.getElementById('app-policy-title');
    if (title) title.textContent = titleMap[mode] || '选择应用';

    // show overlay immediately — never wait for shell/list before paint
    this.setAppPolicyManageLoading(true);
    this.showOverlay('app-policy-overlay');
    const hasImmediateApps = this.installedApps.length > 0;
    if (hasImmediateApps) {
        this.renderAppPolicyList();
        this.setAppPolicyManageLoading(false);
    } else {
        this.renderAppPolicyLoadingState();
    }

    // yield so overlay animation can start (animation must not block on list build)
    await this.waitForUiPaint();

    try {
        await this.loadInstalledApps();
        if (document.getElementById('app-policy-overlay')?.classList.contains('show')) {
            this.renderAppPolicyList();
        }
        this.refreshInstalledAppLabels().catch(() => {});
    } catch (error) {
        if (!hasImmediateApps) this.renderAppPolicyLoadingState('读取应用列表失败');
    } finally {
        this.setAppPolicyManageLoading(false);
    }
};
CoronaAddon.prototype.renderAppPolicyTags = function(pkg, membership = null) {
    const tags = this.getAppPolicyTags(pkg, membership).map(tag => `<span class="app-policy-tag">${this.escapeHtml(tag)}</span>`).join('');
    return tags || '<span class="app-policy-tag">未配置</span>';
};
CoronaAddon.prototype.updateAppPolicyRow = function(pkg) {
    const safePkg = String(pkg).replace(/"/g, '\"');
    const row = document.querySelector(`.app-policy-row[data-pkg="${safePkg}"]`);
    if (!row) return;
    const membership = this.getAppPolicyMembership();
    row.classList.toggle('active', this.isAppPolicyConfigured(pkg, membership));
    const tagsEl = row.querySelector('.app-policy-tags');
    if (tagsEl) tagsEl.innerHTML = this.renderAppPolicyTags(pkg, membership);
};
CoronaAddon.prototype.refreshRenderedAppPolicyLabels = function() {
    const list = document.getElementById('app-policy-list');
    if (!list) return;
    const appMap = new Map((this.installedApps || []).map(app => [app.packageName, app]));
    list.querySelectorAll('.app-policy-row[data-pkg]').forEach(row => {
        const app = appMap.get(row.dataset.pkg || '');
        if (!app) return;
        row.dataset.label = app.label;
        const name = row.querySelector('.app-policy-name');
        if (name) name.textContent = app.label;
    });
};
CoronaAddon.prototype.renderAppPolicyList = function() {
    this.ensureAppPolicyState();
    const list = document.getElementById('app-policy-list');
    if (!list) return;
    const keyword = (document.getElementById('app-policy-search')?.value || '').trim().toLowerCase();
    const membership = this.getAppPolicyMembership();

    // event delegation once — avoid thousands of listeners
    if (!list.dataset.clickBound) {
        list.dataset.clickBound = '1';
        list.addEventListener('click', (e) => {
            const row = e.target.closest('.app-policy-row');
            if (!row || !list.contains(row)) return;
            const pkg = row.dataset.pkg;
            if (!pkg) return;
            this.openAppProfilePicker(pkg, row.dataset.label || pkg).catch((err) => console.error(err));
        });
    }

    // cancel previous chunk render
    if (list._renderToken) list._renderToken.cancelled = true;
    if (list._renderObserver) {
        list._renderObserver.disconnect();
        list._renderObserver = null;
    }
    const token = { cancelled: false };
    list._renderToken = token;

    const configured = new Set();
    (this.installedApps || []).forEach((app) => {
        if (this.isAppPolicyConfigured(app.packageName, membership)) configured.add(app.packageName);
    });

    const apps = (this.installedApps || [])
        .filter(app => !keyword || (app.searchText || `${app.label}\n${app.packageName}`.toLowerCase()).includes(keyword))
        .sort((a, b) => {
            const aActive = configured.has(a.packageName);
            const bActive = configured.has(b.packageName);
            if (aActive !== bActive) return aActive ? -1 : 1;
            // plain compare first (much cheaper than pinyin collator on full list)
            return this.appPolicyCollator.compare(a.label, b.label) || this.appPolicyCollator.compare(a.packageName, b.packageName);
        });

    if (apps.length === 0) {
        list.innerHTML = '<div class="priority-empty">没有匹配的应用</div>';
        return;
    }

    const rowHtml = (app) => {
        const active = configured.has(app.packageName);
        const tags = this.renderAppPolicyTags(app.packageName, membership);
        return `<div class="app-policy-row ${active ? 'active' : ''}" data-pkg="${this.escapeHtml(app.packageName)}" data-label="${this.escapeHtml(app.label)}">${this.renderAppPolicyIcon(app)}<div class="app-policy-info"><div class="app-policy-name">${this.escapeHtml(app.label)}</div><div class="app-policy-package">${this.escapeHtml(app.packageName)}</div><div class="app-policy-tags">${tags}</div></div><div class="app-policy-check">✓</div></div>`;
    };

    list.innerHTML = '';
    const chunk = 40;
    let index = 0;
    const paint = () => {
        if (token.cancelled) return;
        const end = Math.min(index + chunk, apps.length);
        const template = document.createElement('template');
        let html = '';
        for (let i = index; i < end; i++) html += rowHtml(apps[i]);
        template.innerHTML = html;
        this.hydrateAppPolicyIcons(template.content);
        list.appendChild(template.content);
        index = end;
        if (index < apps.length) {
            const sentinel = document.createElement('div');
            sentinel.className = 'app-policy-render-sentinel';
            list.appendChild(sentinel);
            if ('IntersectionObserver' in window) {
                const observer = new IntersectionObserver((entries) => {
                    if (!entries.some(entry => entry.isIntersecting) || token.cancelled) return;
                    observer.disconnect();
                    list._renderObserver = null;
                    sentinel.remove();
                    requestAnimationFrame(paint);
                }, { root: list, rootMargin: '320px 0px' });
                list._renderObserver = observer;
                observer.observe(sentinel);
            } else {
                sentinel.remove();
                requestAnimationFrame(paint);
            }
        }
    };
    paint();
};
CoronaAddon.prototype.reorderAppPolicyRow = function(pkg) {
    const list = document.getElementById('app-policy-list');
    const safePkg = String(pkg).replace(/"/g, '\"');
    const row = document.querySelector(`.app-policy-row[data-pkg="${safePkg}"]`);
    if (!list || !row) return;
    if (this.isAppPolicyConfigured(pkg)) list.prepend(row);
};
CoronaAddon.prototype.toggleAppPolicyPackage = async function(mode, pkg) {
    this.ensureAppPolicyState();
    const key = mode;
    const previous = [...(this.appPolicy[key] || [])];
    const set = new Set(previous);
    const adding = !set.has(pkg);
    if (key === 'affinityExclude' && adding && !this.isRuntimeDaemonEnabled()) {
        this.showToast(this.t('runtimeDaemonRequired'), 'warning');
        return false;
    }
    if (adding) set.add(pkg); else set.delete(pkg);
    const nextItems = [...set];
    const label = key === 'whitelist' ? '白名单' : key === 'protect' ? '保护列表' : key === 'affinityExclude' ? '自动绑核排除' : '列表';
    const previewConfigs = key === 'affinityExclude'
        ? [{ filename: 'auto_affinity.conf', content: await this.buildMergedConfigContent('auto_affinity.conf', { exclude_packages: nextItems.join(',') }, ['enabled', 'ebpf', 'default_class', 'efficiency_cpus', 'balanced_cpus', 'performance_cpus', 'exclude_packages', 'scan_interval_ms', 'load_learning', 'thermal_control', 'thermal_warm_c', 'thermal_severe_c']) }]
        : this.buildAppPolicyPreviewConfigs([key], { [key]: nextItems });
    const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将${adding ? '加入' : '移出'} ${pkg} 到${label}。`,
        configs: previewConfigs,
        actions: key === 'protect'
            ? ['更新保护进程名单，并在守护运行时重新应用受保护内存组']
            : key === 'affinityExclude'
                ? ['更新自动绑核排除名单，并重载通用设置']
                : ['更新应用配置名单']
    });
    if (!confirmed) return;
    this.appPolicy[key] = nextItems;
    this.refreshAppPolicyPackage(pkg, { reorder: true, toast: `${pkg} 已${adding ? '加入' : '移出'}${label}` });
    if (key === 'affinityExclude') {
        await this.mergeConfigFile('auto_affinity.conf', { exclude_packages: nextItems.join(',') }, ['enabled', 'ebpf', 'default_class', 'efficiency_cpus', 'balanced_cpus', 'performance_cpus', 'exclude_packages', 'scan_interval_ms', 'load_learning', 'thermal_control', 'thermal_warm_c', 'thermal_severe_c']);
        await this.exec(`sh ${this.shellQuote(`${this.modDir}/service.sh`)} --sync-daemon`);
        return;
    }
    this.exec(this.getAppPolicyScript('list-set', key, adding ? 'add' : 'del', this.shellQuote(pkg))).catch(() => {});
    this.scheduleAppPolicySync();
};
CoronaAddon.prototype.estimateCurrentProfileConfigCount = async function() {
    const names = this.snapshotConfigFiles || [];
    if (!Array.isArray(names) || names.length === 0) return 0;
    const checks = names.map(name => `[ -s ${this.shellQuote(`${this.configDir}/${name}`)} ] && echo 1`).join('; ');
    const output = await this.exec(`/system/bin/sh -c ${this.shellQuote(checks)}`);
    return String(output || '').split('\n').filter(Boolean).length;
};
CoronaAddon.prototype.openAppProfilePicker = async function(pkg, label) {
    this.ensureAppPolicyState();
    this.appProfileStateSnapshot = {
        monitorEnabled: !!this.appPolicy.monitorEnabled,
        notifyEnabled: !!this.appPolicy.notifyEnabled,
        whitelist: [...(this.appPolicy.whitelist || [])],
        protect: [...(this.appPolicy.protect || [])],
        profiles: [...(this.appPolicy.profiles || [])],
        affinityExclude: [...(this.appPolicy.affinityExclude || [])]
    };
    this.selectedAppProfilePackage = pkg;
    this.selectedAppProfileLabel = label || pkg;
    this.currentProfileConfigCount = 0;
    const title = document.getElementById('app-profile-title');
    if (title) title.textContent = label || pkg;
    this.renderAppProfileChoices();
    this.showOverlay('app-profile-overlay');
    this.estimateCurrentProfileConfigCount().then((count) => {
        if (this.selectedAppProfilePackage !== pkg) return;
        this.currentProfileConfigCount = count;
        this.renderAppProfileChoices();
    }).catch(() => {});
};
CoronaAddon.prototype.renderAppProfileChoices = function() {
    const container = document.getElementById('app-profile-options');
    if (!container) return;
    const snapshots = Array.isArray(this.parameterSnapshots) ? this.parameterSnapshots : [];
    const pkg = this.selectedAppProfilePackage;
    const inWhitelist = this.appPolicy.whitelist.includes(pkg);
    const inProtect = this.appPolicy.protect.includes(pkg);
    const hasProfile = this.appPolicy.profiles.includes(pkg);
    const currentConfigCount = Number(this.currentProfileConfigCount || 0);
    const basicOptions = [
        `<div class="doze-preset" data-mode="toggle-whitelist"><div class="doze-preset-name">${inWhitelist ? '移出白名单' : '加入白名单'}</div><div class="doze-preset-desc">紧急回收时跳过这个应用</div></div>`,
        `<div class="doze-preset" data-mode="toggle-protect"><div class="doze-preset-name">${inProtect ? '取消保护进程' : '加入保护进程'}</div><div class="doze-preset-desc">尝试持续保活并迁入受保护内存组</div></div>`
    ];
    const tuningOptions = [
        `<div class="doze-preset" data-mode="threads"><div class="doze-preset-name">管理应用规则</div><div class="doze-preset-desc">按整个应用或指定线程设置 CPU、优先级、调度策略与 WALT 增强</div></div>`
    ];
    const profileOptions = [];
    if (currentConfigCount > 0) {
        profileOptions.push(`<div class="doze-preset" data-mode="current"><div class="doze-preset-name">${hasProfile ? '覆盖应用预设' : '使用当前配置创建预设'}</div><div class="doze-preset-desc">将当前 config 下的已保存参数写入该应用独立预设目录</div></div>`);
    }
    const clearOption = hasProfile ? `<div class="doze-preset" data-mode="clear"><div class="doze-preset-name">清除应用预设</div><div class="doze-preset-desc">删除该应用的独立预设，下次切回默认配置</div></div>` : '';
    const snapshotOptions = snapshots.map(snapshot => `<div class="doze-preset" data-mode="snapshot" data-snapshot-id="${this.escapeHtml(snapshot.id || '')}"><div class="doze-preset-name">套用快照：${this.escapeHtml(snapshot.name || '未命名快照')}</div><div class="doze-preset-desc">${this.escapeHtml(this.formatSnapshotTime(snapshot.createdAt))} · ${Object.keys(snapshot.files || {}).length} 个配置</div></div>`).join('');
    if (snapshotOptions) profileOptions.push(snapshotOptions);
    if (clearOption) profileOptions.push(clearOption);
    const renderGroup = (title, items) => items.length
        ? `<div class="app-config-action-group"><div class="app-config-action-title">${title}</div>${items.join('')}</div>`
        : '';
    container.innerHTML = renderGroup('基础策略', basicOptions)
        + renderGroup('调度设置', tuningOptions)
        + renderGroup('应用预设', profileOptions);
    container.querySelectorAll('.doze-preset').forEach(item => {
        item.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const mode = item.dataset.mode;
            const pkg = this.selectedAppProfilePackage;
            const label = this.selectedAppProfileLabel || pkg;
            const snapshotId = item.dataset.snapshotId;
            if (!pkg) return;
            if (mode === 'toggle-whitelist' || mode === 'toggle-protect') {
                if (mode === 'toggle-whitelist') await this.toggleAppPolicyPackage('whitelist', pkg);
                if (mode === 'toggle-protect') await this.toggleAppPolicyPackage('protect', pkg);
                this.appProfileStateSnapshot = {
                    monitorEnabled: !!this.appPolicy.monitorEnabled,
                    notifyEnabled: !!this.appPolicy.notifyEnabled,
                    whitelist: [...(this.appPolicy.whitelist || [])],
                    protect: [...(this.appPolicy.protect || [])],
                    profiles: [...(this.appPolicy.profiles || [])],
                    affinityExclude: [...(this.appPolicy.affinityExclude || [])]
                };
                this.refreshAppPolicyPackage(pkg, { reorder: true });
                this.renderAppProfileChoices();
                return;
            }
            if (mode === 'threads') {
                this.openApplicationRuleEditor(pkg, label);
                return;
            }
            if (mode === 'current') await this.setAppProfileFromCurrentConfig(pkg);
            if (mode === 'snapshot') await this.setAppProfileFromSnapshot(pkg, snapshotId);
            if (mode === 'clear') await this.clearAppProfile(pkg);
            this.refreshAppPolicyPackage(pkg);
            this.closeAppProfilePicker(true);
        });
    });
};
CoronaAddon.prototype.writeProfileFiles = async function(pkg, files) {
    const dir = `${this.configDir}/app_profiles/${pkg}`;
    const entries = Object.entries(files || {}).filter(([, content]) => String(content || '').trim());
    if (entries.length === 0) {
        await this.exec(`rm -rf ${this.shellQuote(dir)}`);
        this.showToast('没有可写入的预设配置');
        return false;
    }
    await this.exec(`rm -rf ${this.shellQuote(dir)} && mkdir -p ${this.shellQuote(dir)}`);
    for (const [filename, content] of entries) {
        const b64 = btoa(unescape(encodeURIComponent(String(content).trim())));
        await this.exec(`echo '${b64}' | base64 -d > ${this.shellQuote(`${dir}/${filename}`)}`);
    }
    this.markAppProfileSaved(pkg);
    return true;
};
CoronaAddon.prototype.copyCurrentConfigToProfile = async function(pkg) {
    const dir = `${this.configDir}/app_profiles/${pkg}`;
    const files = await this.collectSnapshotFiles();
    const names = Object.keys(files || {});
    if (names.length === 0) {
        await this.exec(`rm -rf ${this.shellQuote(dir)}`);
        this.showToast('当前没有可保存的预设配置');
        return false;
    }
    const copyCmd = names.map(name => `cp ${this.shellQuote(`${this.configDir}/${name}`)} ${this.shellQuote(`${dir}/${name}`)} 2>/dev/null`).join('; ');
    await this.exec(`rm -rf ${this.shellQuote(dir)} && mkdir -p ${this.shellQuote(dir)}; ${copyCmd}; find ${this.shellQuote(dir)} -maxdepth 1 -type f ! -size +0c -delete; find ${this.shellQuote(dir)} -mindepth 1 -maxdepth 1 | grep -q . || rmdir ${this.shellQuote(dir)} 2>/dev/null`);
    this.markAppProfileSaved(pkg);
    return true;
};
CoronaAddon.prototype.setAppProfileFromCurrentConfig = async function(pkg) {
    const files = await this.collectSnapshotFiles();
    if (!files || Object.keys(files).length === 0) {
        this.showToast('当前没有可保存为预设的配置');
        return;
    }
    const nextProfiles = [...new Set([...(this.appPolicy.profiles || []), pkg])];
    const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将为 ${pkg} 保存当前应用预设。`,
        configs: [
            ...this.buildAppPolicyPreviewConfigs(['profiles'], { profiles: nextProfiles }),
            ...Object.keys(files).map(filename => ({ filename: `app_profiles/${pkg}/${filename}`, content: files[filename] }))
        ],
        actions: ['写入该应用的独立预设目录，命中前台时可自动切换']
    });
    if (!confirmed) return;
    await this.copyCurrentConfigToProfile(pkg);
};
CoronaAddon.prototype.setAppProfileFromSnapshot = async function(pkg, snapshotId) {
    const snapshot = (this.parameterSnapshots || []).find(item => item.id === snapshotId);
    if (!snapshot || !snapshot.files || Object.keys(snapshot.files).length === 0) {
        this.showToast('快照不存在或为空');
        return;
    }
    const nextProfiles = [...new Set([...(this.appPolicy.profiles || []), pkg])];
    const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将为 ${pkg} 套用参数快照预设。`,
        configs: [
            ...this.buildAppPolicyPreviewConfigs(['profiles'], { profiles: nextProfiles }),
            ...Object.keys(snapshot.files).map(filename => ({ filename: `app_profiles/${pkg}/${filename}`, content: snapshot.files[filename] }))
        ],
        actions: ['写入应用独立预设目录，并在命中前台时自动切换']
    });
    if (!confirmed) return;
    await this.writeProfileFiles(pkg, snapshot.files);
};
CoronaAddon.prototype.clearAppProfile = async function(pkg) {
    const nextProfiles = (this.appPolicy.profiles || []).filter(item => item !== pkg);
    const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将清除 ${pkg} 的应用预设。`,
        configs: this.buildAppPolicyPreviewConfigs(['profiles'], { profiles: nextProfiles }),
        actions: [`删除 app_profiles/${pkg}/ 下的独立预设文件`]
    });
    if (!confirmed) return;
    await this.exec(`rm -rf ${this.shellQuote(`${this.configDir}/app_profiles/${pkg}`)}`);
    await this.exec(this.getAppPolicyScript('list-set', 'profiles', 'del', this.shellQuote(pkg)));
    this.appPolicy.profiles = nextProfiles;
    await this.saveAppRulesConfig('应用预设已清除');
    this.refreshAppPolicyPackage(pkg);
};
CoronaAddon.prototype.runMemClean = async function(mode) {
    const modeNames = { 'drop-caches': '清理缓存', 'drop-all': '深度清理', compact: '内存整理', 'kill-bg': '清理后台', 'emergency-reclaim': '紧急回收', 'full-clean': '紧急回收' };
    const modeActions = {
        'drop-caches': ['执行 `echo 3 > /proc/sys/vm/drop_caches`'],
        'drop-all': ['执行 `drop_caches`', '执行 `compact_memory`'],
        compact: ['执行 `echo 1 > /proc/sys/vm/compact_memory`'],
        'kill-bg': ['尝试停止第三方后台应用', '跳过白名单与保护进程名单'],
        'emergency-reclaim': ['执行 `drop_caches`', '执行 `compact_memory`', '尝试停止第三方后台应用', '跳过白名单与保护进程名单'],
        'full-clean': ['执行 `drop_caches`', '执行 `compact_memory`', '尝试停止第三方后台应用', '跳过白名单与保护进程名单']
    };
    const modeNotes = {
        'drop-caches': ['不会修改已保存配置，仅影响当前系统缓存。'],
        'drop-all': ['不会修改已保存配置，仅影响当前系统缓存与内存整理状态。'],
        compact: ['不会修改已保存配置，仅触发一次内存整理。'],
        'kill-bg': ['可能导致部分后台应用被重新启动。'],
        'emergency-reclaim': ['这是高强度回收操作，适合临时腾内存。'],
        'full-clean': ['这是高强度回收操作，适合临时腾内存。']
    };
    const modeName = modeNames[mode] || mode;
    const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将执行${modeName}。`,
        actions: modeActions[mode] || [`执行 ${modeName}`],
        notes: modeNotes[mode] || ['不会修改已保存配置。']
    }, { okText: '继续执行' });
    if (!confirmed) return;
    this.memCleanRunning = true;
    const section = document.getElementById('memclean-section');
    const progress = document.getElementById('memclean-progress');
    const resultDiv = document.getElementById('memclean-result');
    const fill = document.getElementById('memclean-fill');
    const percent = document.getElementById('memclean-percent');
    const status = document.getElementById('memclean-status');
    const resultContent = document.getElementById('memclean-result-content');
    section.classList.add('memclean-running');
    progress.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    fill.style.width = '0%';
    percent.textContent = '0%';
    status.textContent = '准备中...';
    fill.style.width = '30%';
    percent.textContent = '30%';
    status.textContent = '正在执行系统回收...';
    const raw = await this.exec(this.getAppPolicyScript('memclean', mode));
    fill.style.width = '85%';
    percent.textContent = '85%';
    status.textContent = '整理结果...';
    const info = {};
    String(raw || '').split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) info[line.slice(0, idx)] = line.slice(idx + 1);
    });
    const before = (parseInt(info.before_kb || '0', 10) || 0) * 1024;
    const after = (parseInt(info.after_kb || '0', 10) || 0) * 1024;
    const freed = (parseInt(info.freed_kb || '0', 10) || 0) * 1024;
    const killed = String(info.killed || '').trim();
    fill.style.width = '100%';
    percent.textContent = '100%';
    status.textContent = '清理完成';
    resultContent.innerHTML = `<div class="result-item"><span>清理前可用</span><span>${this.formatBytes(before)}</span></div><div class="result-item"><span>清理后可用</span><span>${this.formatBytes(after)}</span></div><div class="result-item result-highlight"><span>已释放内存</span><span>${this.formatBytes(freed)}</span></div>${killed ? `<div class="result-item"><span>处理应用</span><span>${this.escapeHtml(killed)}</span></div>` : ''}`;
    resultDiv.classList.remove('hidden');
    this.sendNotification('Corona 内存清理', `${modeName}完成，释放了 ${this.formatBytes(freed)}`);
    await this.sleep(800);
    progress.classList.add('hidden');
    section.classList.remove('memclean-running');
    this.memCleanRunning = false;
    this.showToast(`${modeName} 完成`);
};

  window.CoronaFeatureScripts["app-policy"] = true;
})();
