(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["app-policy"]) return;
CoronaAddon.prototype.ensureAppPolicyState = function() {
    if (!this.appPolicy) {
        this.appPolicy = { monitorEnabled: false, notifyEnabled: true, whitelist: [], blacklist: [], protect: [], profiles: [] };
    }
    if (!Array.isArray(this.installedApps)) this.installedApps = [];
    if (!this.currentAppPolicyMode) this.currentAppPolicyMode = 'whitelist';
};
CoronaAddon.prototype.getAppPolicyScript = function(...args) {
    const parts = [`sh ${this.shellQuote(`${this.modDir}/app_policy.sh`)}`];
    args.filter(Boolean).forEach(arg => parts.push(arg));
    return parts.join(' ');
};
CoronaAddon.prototype.parseAppRulesConfig = function(content) {
    this.ensureAppPolicyState();
    const next = { monitorEnabled: false, notifyEnabled: true, whitelist: [], protect: [], profiles: [] };
    String(content || '').split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx <= 0) return;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key === 'monitor_enabled') next.monitorEnabled = value === '1';
        if (key === 'notify_enabled') next.notifyEnabled = value !== '0';
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
    const configuredCount = new Set([...(this.appPolicy.whitelist || []), ...(this.appPolicy.protect || []), ...(this.appPolicy.profiles || []), ...Object.keys(this.priorityRules || {}), ...threadPackages]).size;
    const badge = document.getElementById('app-policy-badge');
    if (badge) badge.textContent = configuredCount > 0 ? `${configuredCount} 个应用` : '未配置';
    const status = document.getElementById('app-policy-status');
    if (status) {
        if (configuredCount <= 0) {
            status.textContent = '还没有配置任何应用策略';
        } else if (this.appPolicy.monitorEnabled && pf > 0) {
            status.textContent = `已配置 ${configuredCount} 个应用，应用预设自动切换已开启`;
        } else {
            status.textContent = `已配置 ${configuredCount} 个应用`;
        }
    }
    const switchMonitor = document.getElementById('app-monitor-switch');
    const switchNotify = document.getElementById('app-notify-switch');
    const manageBtn = document.getElementById('app-policy-manage-btn');
    if (switchMonitor) switchMonitor.checked = !!this.appPolicy.monitorEnabled;
    if (switchNotify) switchNotify.checked = !!this.appPolicy.notifyEnabled;
    if (manageBtn) {
        if (this.appPolicyManageLoading) {
            manageBtn.classList.add('is-loading');
            manageBtn.disabled = true;
            manageBtn.innerHTML = '<span class="btn-inline-spinner"></span><span>正在加载</span>';
        } else {
            manageBtn.classList.remove('is-loading');
            manageBtn.disabled = false;
            manageBtn.innerHTML = configuredCount > 0
                ? `应用列表 <span id="app-policy-manage-count">${configuredCount}</span>`
                : '应用列表';
        }
    }
    const pairs = [
        ['app-policy-manage-count', configuredCount]
    ];
    pairs.forEach(([id, count]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(count);
    });
};
CoronaAddon.prototype.loadAppRulesConfig = async function() {
    this.ensureAppPolicyState();
    const content = await this.exec(this.getAppPolicyScript('dump-rules'));
    this.parseAppRulesConfig(content);
    this.renderAppPolicySummary();
};
CoronaAddon.prototype.syncAppPolicyDaemon = async function() {
    const shouldRun = !!this.appPolicy.monitorEnabled || (this.appPolicy.protect || []).length > 0 || (this.appPolicy.profiles || []).length > 0 || this.getThreadRulePackages().length > 0;
    const pidFile = `${this.modDir}/.app_policy_daemon.pid`;
    if (shouldRun) {
        const runningPid = (await this.exec(this.getAppPolicyScript('daemon-status'))).trim();
        if (!runningPid) {
            await this.exec(`${this.getAppPolicyScript('daemon')} >/dev/null 2>&1 &`);
        }
        return;
    }
    const pid = (await this.exec(`cat ${this.shellQuote(pidFile)} 2>/dev/null`)).trim();
    if (pid) await this.exec(`kill ${pid} 2>/dev/null`);
    await this.exec(`rm -f ${this.shellQuote(pidFile)} ${this.shellQuote(`${this.modDir}/.app_policy_state`)}`);
    await this.exec(`sh ${this.shellQuote(`${this.modDir}/service.sh`)} --apply-runtime-config >/dev/null 2>&1`);
};
CoronaAddon.prototype.scheduleAppPolicySync = function() {
    if (this.appPolicySyncTimer) clearTimeout(this.appPolicySyncTimer);
    this.appPolicySyncTimer = setTimeout(() => {
        this.syncAppPolicyDaemon().catch(() => {});
        this.appPolicySyncTimer = null;
    }, 120);
};
CoronaAddon.prototype.saveAppRulesConfig = async function(showToastText = '', options = {}) {
    await this.writeConfig('app_rules.conf', this.buildAppRulesConfig());
    if (options.syncNow) {
        await this.syncAppPolicyDaemon();
    } else {
        this.scheduleAppPolicySync();
    }
    this.renderAppPolicySummary();
    if (showToastText) this.showToast(showToastText);
};
CoronaAddon.prototype.persistAppRulesSoon = function(showToastText = '') {
    if (showToastText) this.showToast(showToastText);
    this.renderAppPolicySummary();
    if (this.appRulesPersistTimer) clearTimeout(this.appRulesPersistTimer);
    this.appRulesPersistTimer = setTimeout(() => {
        this.saveAppRulesConfig('', { syncNow: false }).catch(() => {});
        this.appRulesPersistTimer = null;
    }, 180);
};
CoronaAddon.prototype.initAppPolicy = function() {
    this.ensureAppPolicyState();
    const monitorSwitch = document.getElementById('app-monitor-switch');
    const notifySwitch = document.getElementById('app-notify-switch');
    if (monitorSwitch && !monitorSwitch.dataset.bound) {
        monitorSwitch.dataset.bound = '1';
        monitorSwitch.addEventListener('change', async () => {
            const previous = this.appPolicy.monitorEnabled;
            this.appPolicy.monitorEnabled = monitorSwitch.checked;
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: `即将${monitorSwitch.checked ? '开启' : '关闭'}应用预设自动切换。`,
                configs: this.buildAppPolicyPreviewConfigs(['rules']),
                actions: [monitorSwitch.checked ? '启动应用策略守护，前台应用命中预设时自动切换配置' : '停止自动切换，仅保留当前默认配置'],
                notes: ['白名单、保护和应用预设名单不会丢失。']
            }, { onCancel: () => { this.appPolicy.monitorEnabled = previous; this.renderAppPolicySummary(); } });
            if (!confirmed) return;
            await this.saveAppRulesConfig(`应用预设自动切换已${monitorSwitch.checked ? '开启' : '关闭'}`);
        });
    }
    if (notifySwitch && !notifySwitch.dataset.bound) {
        notifySwitch.dataset.bound = '1';
        notifySwitch.addEventListener('change', async () => {
            const previous = this.appPolicy.notifyEnabled;
            this.appPolicy.notifyEnabled = notifySwitch.checked;
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: `即将${notifySwitch.checked ? '开启' : '关闭'}应用策略通知。`,
                configs: this.buildAppPolicyPreviewConfigs(['rules']),
                notes: ['仅影响应用预设切换通知，不影响名单和守护逻辑。']
            }, { onCancel: () => { this.appPolicy.notifyEnabled = previous; this.renderAppPolicySummary(); } });
            if (!confirmed) return;
            await this.saveAppRulesConfig(`切换通知已${notifySwitch.checked ? '开启' : '关闭'}`);
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
        search.addEventListener('input', () => this.renderAppPolicyList());
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
    if (!force && this.installedApps.length > 0) return this.installedApps;
    const output = await this.exec(this.getAppPolicyScript('list-meta'));
    const apps = [];
    let cacheChanged = false;
    String(output || '').split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const parts = trimmed.split('|');
        const pkg = (parts[0] || '').trim();
        const componentName = (parts[1] || '').trim();
        const fetchedLabel = (parts[2] || '').trim();
        if (!pkg) return;
        const cached = (this.appMetaCache && this.appMetaCache[pkg]) || {};
        const label = fetchedLabel && fetchedLabel !== pkg ? fetchedLabel : (cached.label && cached.label !== pkg ? cached.label : this.humanizePackageName(pkg));
        apps.push({ packageName: pkg, componentName, label, labelLoaded: true });
        const nextCache = { ...cached, label, componentName };
        if (JSON.stringify(nextCache) !== JSON.stringify(cached)) {
            this.appMetaCache[pkg] = nextCache;
            cacheChanged = true;
        }
    });
    apps.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN-u-co-pinyin') || a.packageName.localeCompare(b.packageName));
    this.installedApps = apps;
    if (cacheChanged) await this.saveAppMetaCache();
    return apps;
};
CoronaAddon.prototype.prewarmAppPolicyData = async function(force = false) {
    this.ensureAppPolicyState();
    if (this.appPolicyPrewarmPromise) return this.appPolicyPrewarmPromise;
    this.appPolicyPrewarmPromise = (async () => {
        let apps = [];
        let lastError = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                apps = await this.loadInstalledApps(force || attempt > 0);
                if (apps.length > 0) break;
            } catch (error) {
                lastError = error;
            }
            await this.sleep(220);
        }
        if (lastError && apps.length === 0) throw lastError;
        this.appPolicyPrewarmDone = apps.length > 0;
        return apps;
    })();
    try {
        return await this.appPolicyPrewarmPromise;
    } finally {
        this.appPolicyPrewarmPromise = null;
    }
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
        img.src = this.getAppPolicyIconSource(img.dataset.pkg || '');
    });
};
CoronaAddon.prototype.getAppPolicyMembership = function() {
    this.ensureAppPolicyState();
    return {
        whitelist: new Set(this.appPolicy.whitelist || []),
        protect: new Set(this.appPolicy.protect || []),
        profiles: new Set(this.appPolicy.profiles || []),
        threads: new Set(this.getThreadRulePackages()),
        priority: new Set(Object.keys(this.priorityRules || {}))
    };
};
CoronaAddon.prototype.isAppPolicyConfigured = function(pkg, membership = null) {
    const refs = membership || this.getAppPolicyMembership();
    return refs.whitelist.has(pkg) || refs.protect.has(pkg) || refs.profiles.has(pkg) || refs.priority.has(pkg) || refs.threads.has(pkg);
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
    if (refs.profiles.has(pkg)) return ['预设'];
    if (refs.threads.has(pkg)) return ['线程'];
    if (refs.protect.has(pkg)) return ['保护'];
    if (refs.whitelist.has(pkg)) return ['白名单'];
    if (refs.priority.has(pkg)) return ['优先级'];
    return [];
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
            profiles: [...(this.appProfileStateSnapshot.profiles || [])]
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
    this.currentAppPolicyMode = mode;
    const titleMap = { manage: '应用列表' };
    const title = document.getElementById('app-policy-title');
    if (title) title.textContent = titleMap[mode] || '选择应用';
    this.setAppPolicyManageLoading(true);
    this.showOverlay('app-policy-overlay');
    if (this.installedApps && this.installedApps.length > 0) {
        this.renderAppPolicyList();
        this.setAppPolicyManageLoading(false);
        setTimeout(async () => {
            try {
                await this.loadInstalledApps(true);
                this.renderAppPolicyList();
            } catch (error) {
                console.error('refresh installed apps failed', error);
            }
        }, 80);
        return;
    }
    this.renderAppPolicyLoadingState();
    try {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await this.loadInstalledApps();
        this.renderAppPolicyList();
    } catch (error) {
        this.renderAppPolicyLoadingState('读取应用列表失败');
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
CoronaAddon.prototype.renderAppPolicyList = function() {
    this.ensureAppPolicyState();
    const list = document.getElementById('app-policy-list');
    if (!list) return;
    const keyword = (document.getElementById('app-policy-search')?.value || '').trim().toLowerCase();
    const membership = this.getAppPolicyMembership();
    const apps = this.installedApps
        .filter(app => !keyword || app.label.toLowerCase().includes(keyword) || app.packageName.toLowerCase().includes(keyword))
        .sort((a, b) => {
            const aActive = this.isAppPolicyConfigured(a.packageName, membership);
            const bActive = this.isAppPolicyConfigured(b.packageName, membership);
            if (aActive !== bActive) return aActive ? -1 : 1;
            return a.label.localeCompare(b.label, 'zh-Hans-CN-u-co-pinyin') || a.packageName.localeCompare(b.packageName);
        });
    if (apps.length === 0) {
        list.innerHTML = '<div class="priority-empty">没有匹配的应用</div>';
        return;
    }
    list.innerHTML = apps.map(app => {
        const tags = this.renderAppPolicyTags(app.packageName, membership);
        return `<div class="app-policy-row ${this.isAppPolicyConfigured(app.packageName, membership) ? 'active' : ''}" data-pkg="${this.escapeHtml(app.packageName)}" data-label="${this.escapeHtml(app.label)}">${this.renderAppPolicyIcon(app)}<div class="app-policy-info"><div class="app-policy-name">${this.escapeHtml(app.label)}</div><div class="app-policy-package">${this.escapeHtml(app.packageName)}</div><div class="app-policy-tags">${tags}</div></div><div class="app-policy-check">✓</div></div>`;
    }).join('');
    this.hydrateAppPolicyIcons(list);
    list.querySelectorAll('.app-policy-row').forEach(row => {
        row.addEventListener('click', async () => {
            const pkg = row.dataset.pkg;
            await this.openAppProfilePicker(pkg, row.dataset.label || pkg);
        });
    });
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
    if (adding) set.add(pkg); else set.delete(pkg);
    const nextItems = [...set];
    const label = key === 'whitelist' ? '白名单' : key === 'protect' ? '保护列表' : '列表';
    const confirmed = await this.confirmChangePreview('变更预览', {
        summary: `即将${adding ? '加入' : '移出'} ${pkg} 到${label}。`,
        configs: this.buildAppPolicyPreviewConfigs([key], { [key]: nextItems }),
        actions: key === 'protect'
            ? ['更新保护进程名单，并在守护运行时重新应用受保护内存组']
            : ['更新应用策略名单']
    });
    if (!confirmed) return;
    this.appPolicy[key] = nextItems;
    this.refreshAppPolicyPackage(pkg, { reorder: true, toast: `${pkg} 已${adding ? '加入' : '移出'}${label}` });
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
        profiles: [...(this.appPolicy.profiles || [])]
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
    const priorityRule = this.priorityRules?.[pkg] || null;
    const currentConfigCount = Number(this.currentProfileConfigCount || 0);
    const actionOptions = [
        `<div class="doze-preset" data-mode="toggle-whitelist"><div class="doze-preset-name">${inWhitelist ? '移出白名单' : '加入白名单'}</div><div class="doze-preset-desc">紧急回收时跳过这个应用</div></div>`,
        `<div class="doze-preset" data-mode="toggle-protect"><div class="doze-preset-name">${inProtect ? '取消保护进程' : '加入保护进程'}</div><div class="doze-preset-desc">尝试持续保活并迁入受保护内存组</div></div>`,
        `<div class="doze-preset" data-mode="threads"><div class="doze-preset-name">管理线程规则</div><div class="doze-preset-desc">自定义线程亲和性、调度策略与优先级</div></div>`,
        `<div class="doze-preset" data-mode="priority"><div class="doze-preset-name">${priorityRule ? '调整优先级策略' : '设置优先级策略'}</div><div class="doze-preset-desc">nice ${priorityRule?.nice ?? 0} · I/O ${priorityRule ? `${priorityRule.ioClass}/${priorityRule.ioLevel}` : '2/4'}</div></div>`
    ];
    if (currentConfigCount > 0) {
        actionOptions.push(`<div class="doze-preset" data-mode="current"><div class="doze-preset-name">${hasProfile ? '覆盖应用预设' : '使用当前配置创建预设'}</div><div class="doze-preset-desc">将当前 config 下的已保存参数写入该应用独立预设目录</div></div>`);
    }
    const clearOption = hasProfile ? `<div class="doze-preset" data-mode="clear"><div class="doze-preset-name">清除应用预设</div><div class="doze-preset-desc">删除该应用的独立预设，下次切回默认配置</div></div>` : '';
    const snapshotOptions = snapshots.map(snapshot => `<div class="doze-preset" data-mode="snapshot" data-snapshot-id="${this.escapeHtml(snapshot.id || '')}"><div class="doze-preset-name">套用快照：${this.escapeHtml(snapshot.name || '未命名快照')}</div><div class="doze-preset-desc">${this.escapeHtml(this.formatSnapshotTime(snapshot.createdAt))} · ${Object.keys(snapshot.files || {}).length} 个配置</div></div>`).join('');
    container.innerHTML = actionOptions.join('') + snapshotOptions + clearOption;
    container.querySelectorAll('.doze-preset').forEach(item => {
        item.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const mode = item.dataset.mode;
            const pkg = this.selectedAppProfilePackage;
            const label = this.selectedAppProfileLabel || pkg;
            const snapshotId = item.dataset.snapshotId;
            if (!pkg) return;
            if (mode === 'toggle-whitelist') await this.toggleAppPolicyPackage('whitelist', pkg);
            if (mode === 'toggle-protect') await this.toggleAppPolicyPackage('protect', pkg);
            if (mode === 'threads') {
                this.closeAppProfilePicker(false);
                this.hideOverlay('app-policy-overlay');
                await this.openThreadRuleManager(pkg, label);
                return;
            }
            if (mode === 'priority') {
                this.selectedPriorityProcess = pkg;
                this.closeAppProfilePicker(false);
                this.hideOverlay('app-policy-overlay');
                requestAnimationFrame(() => requestAnimationFrame(() => this.showPrioritySetting()));
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
