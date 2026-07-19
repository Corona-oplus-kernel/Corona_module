(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["priority-thread"]) return;
CoronaAddon.prototype.initPerformanceMode = function() { this.initProcessPriority();  }
CoronaAddon.prototype.loadPerformanceModeConfig = async function() { await this.loadPriorityConfig();  }
CoronaAddon.prototype.initProcessPriority = function() {
        this.priorityRules = {}; this.threadPriorityRules = []; this.priorityProcesses = []; this.selectedPriorityProcess = null; this.selectedNice = 0; this.selectedIoClass = 2; this.selectedIoLevel = 4; this.selectedThreadRuleKey = null; this.selectedThreadRulePackage = ''; this.selectedThreadRuleLabel = ''; this.selectedThreadPattern = '*'; this.selectedThreadRuleScope = 'app'; this.selectedThreadRuleTitleBase = ''; this.selectedThreadNice = 0; this.selectedThreadIoClass = 2; this.selectedThreadIoLevel = 4; this.selectedThreadAffinity = ''; this.selectedThreadCpuset = ''; this.selectedThreadUclampMin = ''; this.selectedThreadUclampMax = ''; this.selectedThreadSchedPolicy = 'normal'; this.selectedThreadRtPrio = 1; this.selectedThreadWaltBoost = false; this.selectedThreadWaltPipeline = false; this.threadPanelState = 'rules'; this.threadTagEditingIndex = -1; this.pendingThreadTagName = '';
        document.getElementById('priority-cancel-btn').addEventListener('click', () => this.hideOverlay('priority-setting-overlay'));
        document.getElementById('priority-save-btn').addEventListener('click', () => this.savePriorityRule());
        document.getElementById('priority-process-search').addEventListener('input', (e) => { this.filterPriorityProcessList(e.target.value); });
        document.getElementById('priority-process-overlay').addEventListener('click', (e) => { if (e.target.id === 'priority-process-overlay') this.hideOverlay('priority-process-overlay'); });
        document.getElementById('priority-setting-overlay').addEventListener('click', (e) => { if (e.target.id === 'priority-setting-overlay') this.hideOverlay('priority-setting-overlay'); });
        const niceSlider = document.getElementById('nice-slider');
        const niceValue = document.getElementById('nice-slider-value');
        niceSlider.addEventListener('input', () => { this.selectedNice = parseInt(niceSlider.value); niceValue.textContent = this.selectedNice; this.updateSliderProgress(niceSlider); });
        document.querySelectorAll('.io-option').forEach(opt => { opt.addEventListener('click', () => { document.querySelectorAll('.io-option').forEach(o => o.classList.remove('selected')); opt.classList.add('selected'); this.selectedIoClass = parseInt(opt.dataset.class); this.selectedIoLevel = parseInt(opt.dataset.level); }); });
        this.initThreadRuleUi();
    }
CoronaAddon.prototype.loadPriorityConfig = async function() {
        const config = await this.readConfig('process_priority.conf');
        this.priorityRules = {};
        if (config && config.trim()) {
            const lines = config.trim().split('\n');
            for (const line of lines) { if (line && line.includes('=')) { const [processName, values] = line.split('='); if (processName && values) { const [nice, ioClass, ioLevel] = values.split(',').map(Number); this.priorityRules[processName.trim()] = { nice, ioClass, ioLevel }; } } }
        }
        this.renderPriorityRules();
        this.updatePriorityCount();
        await this.loadThreadPriorityConfig();
    }
CoronaAddon.prototype.renderPriorityRules = function() {
        const container = document.getElementById('priority-rules-list');
        if (!container) return;
        const ruleNames = Object.keys(this.priorityRules || {});
        if (ruleNames.length === 0) { container.innerHTML = '<div class="priority-empty">暂无优先级规则</div>'; return; }
        const ioClassNames = { 1: '实时', 2: '尽力', 3: '空闲' };
        container.innerHTML = ruleNames.map(name => { const rule = this.priorityRules[name]; const initial = name.charAt(0).toUpperCase(); return `<div class="priority-rule-item" data-process="${name}"><div class="priority-rule-icon">${initial}</div><div class="priority-rule-info"><div class="priority-rule-name">${name}</div><div class="priority-rule-values">nice: ${rule.nice} | I/O: ${ioClassNames[rule.ioClass] || '尽力'}</div></div><div class="priority-rule-actions"><button class="priority-rule-btn edit" data-action="edit" data-name="${name}">✎</button><button class="priority-rule-btn delete" data-action="delete" data-name="${name}">✕</button></div></div>`; }).join('');
        container.querySelectorAll('.priority-rule-btn').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); const action = btn.dataset.action; const name = btn.dataset.name; if (action === 'edit') this.editPriorityRule(name); else if (action === 'delete') this.deletePriorityRule(name); }); });
    }
CoronaAddon.prototype.updatePriorityCount = function() { return Object.keys(this.priorityRules).length;  }
CoronaAddon.prototype.showPriorityProcessSelector = async function() { this.showOverlay('priority-process-overlay'); document.getElementById('priority-process-search').value = ''; document.getElementById('priority-process-list').innerHTML = '<div class="priority-loading">加载中...</div>'; await this.loadPriorityProcessList();  }
CoronaAddon.prototype.loadPriorityProcessList = async function() {
        const psOutput = await this.exec(`ps -Ao pid,args 2>/dev/null | tail -n +2`);
        const processes = []; const seen = new Set();
        if (psOutput) {
            const lines = psOutput.split('\n');
            for (const line of lines) {
                const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
                if (match) {
                    const pid = match[1]; let fullCmd = match[2].trim(); let name = fullCmd.split(/\s+/)[0];
                    if (name.includes('/')) name = name.split('/').pop();
                    const isApp = fullCmd.includes('com.') || fullCmd.includes('org.') || fullCmd.includes('net.');
                    let packageName = '';
                    if (isApp) { const pkgMatch = fullCmd.match(/([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)/); if (pkgMatch) { packageName = pkgMatch[1]; name = packageName; } }
                    if (!seen.has(name) && name && !name.startsWith('[')) { seen.add(name); processes.push({ pid, name, packageName, isApp }); }
                }
            }
        }
        processes.sort((a, b) => a.name.localeCompare(b.name));
        this.priorityProcesses = processes;
        this.renderPriorityProcessList(processes);
    }
CoronaAddon.prototype.renderPriorityProcessList = function(processes) {
        const container = document.getElementById('priority-process-list');
        if (processes.length === 0) { container.innerHTML = '<div class="priority-loading">未找到进程</div>'; return; }
        const appProcs = [], systemProcs = [], otherProcs = [];
        for (const proc of processes) {
            if (proc.isApp || proc.name.startsWith('com.') || (proc.name.includes('.') && !proc.name.includes('android.hardware'))) { appProcs.push(proc); }
            else if (['surfaceflinger', 'zygote', 'system_server', 'servicemanager', 'vold', 'logd'].some(s => proc.name.includes(s))) { systemProcs.push(proc); }
            else { otherProcs.push(proc); }
        }
        let html = '';
        if (appProcs.length > 0) { html += '<div class="process-category">应用进程</div>'; html += appProcs.map(p => this.renderPriorityProcessItem(p)).join(''); }
        if (systemProcs.length > 0) { html += '<div class="process-category">系统进程</div>'; html += systemProcs.map(p => this.renderPriorityProcessItem(p)).join(''); }
        if (otherProcs.length > 0) { html += '<div class="process-category">其他进程</div>'; html += otherProcs.map(p => this.renderPriorityProcessItem(p)).join(''); }
        container.innerHTML = html;
        container.querySelectorAll('.priority-process-item').forEach(item => { item.addEventListener('click', () => this.selectPriorityProcess(item.dataset.name)); });
    }
CoronaAddon.prototype.renderPriorityProcessItem = function(proc) { const initial = proc.name.charAt(0).toUpperCase(); return `<div class="priority-process-item" data-name="${proc.name}" data-pid="${proc.pid}"><div class="process-icon">${initial}</div><div class="process-details"><div class="process-name">${proc.name}</div><div class="process-pid">PID: ${proc.pid}</div></div></div>`;  }
CoronaAddon.prototype.filterPriorityProcessList = function(keyword) { const filtered = this.priorityProcesses.filter(p => p.name.toLowerCase().includes(keyword.toLowerCase())); this.renderPriorityProcessList(filtered);  }
CoronaAddon.prototype.selectPriorityProcess = function(processName) { this.selectedPriorityProcess = processName; this.hideOverlay('priority-process-overlay'); this.showPrioritySetting();  }
CoronaAddon.prototype.showPrioritySetting = function() {
        this.showOverlay('priority-setting-overlay');
        document.getElementById('priority-selected-process').innerHTML = `<span class="process-name">${this.selectedPriorityProcess}</span>`;
        if (this.priorityRules[this.selectedPriorityProcess]) { const rule = this.priorityRules[this.selectedPriorityProcess]; this.selectedNice = rule.nice; this.selectedIoClass = rule.ioClass; this.selectedIoLevel = rule.ioLevel; }
        else { this.selectedNice = 0; this.selectedIoClass = 2; this.selectedIoLevel = 4; }
        const niceSlider = document.getElementById('nice-slider'); const niceValue = document.getElementById('nice-slider-value');
        niceSlider.value = this.selectedNice; niceValue.textContent = this.selectedNice;
        this.updateSliderProgress(niceSlider);
        document.querySelectorAll('.io-option').forEach(opt => { opt.classList.toggle('selected', parseInt(opt.dataset.class) === this.selectedIoClass); });
    }
CoronaAddon.prototype.savePriorityRule = async function() {
        if (!this.selectedPriorityProcess) { this.showToast('请先选择进程'); return false; }
        const nextRules = { ...this.priorityRules, [this.selectedPriorityProcess]: { nice: this.selectedNice, ioClass: this.selectedIoClass, ioLevel: this.selectedIoLevel } };
        const configContent = this.serializePriorityRules(nextRules);
        const ioClassNames = { 1: '实时', 2: '尽力', 3: '空闲' };
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: `即将保存 ${this.selectedPriorityProcess} 的优先级规则。`,
            configs: [{ filename: 'process_priority.conf', content: configContent }],
            actions: [`尝试对当前同名进程执行 renice=${this.selectedNice} 与 ionice=${ioClassNames[this.selectedIoClass]}`],
            notes: ['如果目标进程当前未运行，则规则会在后续启动时生效。']
        }, {
            onCancel: () => this.loadPriorityConfig()
        });
        if (!confirmed) return false;
        this.priorityRules = nextRules;
        await this.savePriorityConfig();
        const appliedCount = await this.applyPriorityRule(this.selectedPriorityProcess);
        this.hideOverlay('priority-setting-overlay');
        this.renderPriorityRules();
        this.updatePriorityCount();
        this.updateAppPolicyRow(this.selectedPriorityProcess);
        this.reorderAppPolicyRow(this.selectedPriorityProcess);
        this.renderAppPolicySummary();
        if (appliedCount > 0) { this.showToast(`已设置 ${this.selectedPriorityProcess}: nice=${this.selectedNice}, I/O=${ioClassNames[this.selectedIoClass]}`); }
        else { this.showToast(`已保存规则，进程启动时生效`); }
        return true;
    }
CoronaAddon.prototype.savePriorityConfig = async function() {
        const processName = this.selectedPriorityProcess;
        const rule = processName ? this.priorityRules[processName] : null;
        if (processName && rule) {
            await this.exec(this.getAppPolicyScript('priority-set', this.shellQuote(processName), String(rule.nice), String(rule.ioClass), String(rule.ioLevel)));
            return;
        }
        const configContent = this.serializePriorityRules();
        await this.writeConfig('process_priority.conf', configContent);
    }
CoronaAddon.prototype.applyPriorityRule = async function(processName) {
        const rule = this.priorityRules[processName]; if (!rule) return 0;
        let appliedCount = 0;
        const escaped = processName.replace(/[.[\](){}*+?\\^$|]/g, '\\$&');
        let pids = await this.exec(`pgrep -f "${escaped}" 2>/dev/null`);
        if (!pids || !pids.trim()) {
            pids = await this.exec(`for d in /proc/[0-9]*; do [ -r "$d/cmdline" ] || continue; if tr '\\0' ' ' < "$d/cmdline" 2>/dev/null | grep -F -q "${escaped.replace(/"/g, '\\"')}"; then basename "$d"; fi; done`);
        }
        if (pids && pids.trim()) {
            const pidList = pids.trim().split('\n').filter(p => p.trim());
            const promises = [];
            for (const pid of pidList) { const trimmedPid = pid.trim(); if (trimmedPid) { promises.push(this.exec(`renice -n ${rule.nice} -p ${trimmedPid} 2>/dev/null`)); promises.push(this.exec(`ionice -c ${rule.ioClass} -n ${rule.ioLevel} -p ${trimmedPid} 2>/dev/null`)); appliedCount++; } }
            await Promise.all(promises);
        }
        return appliedCount;
    }
CoronaAddon.prototype.editPriorityRule = async function(processName) { this.selectedPriorityProcess = processName; this.showPrioritySetting();  }
CoronaAddon.prototype.deletePriorityRule = async function(processName) {
        const nextRules = { ...this.priorityRules };
        delete nextRules[processName];
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: `即将删除 ${processName} 的优先级规则。`,
            configs: [{ filename: 'process_priority.conf', content: this.serializePriorityRules(nextRules) || '# empty' }],
            notes: ['删除后不会再对该应用或进程应用保存的 nice / I/O 优先级。']
        });
        if (!confirmed) return;
        delete this.priorityRules[processName];
        this.selectedPriorityProcess = processName;
        await this.exec(this.getAppPolicyScript('priority-del', this.shellQuote(processName)));
        this.renderPriorityRules();
        this.updatePriorityCount();
        this.updateAppPolicyRow(processName);
        this.renderAppPolicySummary();
        this.showToast(`已删除 ${processName} 的优先级规则`);
    }
CoronaAddon.prototype.applyAllPriorityRules = async function() { const promises = Object.keys(this.priorityRules).map(name => this.applyPriorityRule(name)); await Promise.all(promises);  }
CoronaAddon.prototype.initThreadRuleUi = function() {
        document.getElementById('thread-rule-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'thread-rule-overlay') this.hideOverlay('thread-rule-overlay'); });
        document.getElementById('thread-rule-editor-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'thread-rule-editor-overlay') this.hideOverlay('thread-rule-editor-overlay'); });
        document.getElementById('thread-rule-cancel-btn')?.addEventListener('click', () => { this.hideOverlay('thread-rule-editor-overlay'); this.showOverlay('app-profile-overlay'); });
        document.getElementById('thread-rule-save-btn')?.addEventListener('click', () => this.saveThreadRule());
        document.getElementById('thread-tag-save-btn')?.addEventListener('click', () => this.saveThreadTag());
        document.getElementById('thread-app-rule-btn')?.addEventListener('click', () => this.openApplicationThreadRule());
        document.getElementById('thread-resource-toggle')?.addEventListener('click', () => this.toggleThreadResourceSection());
        document.getElementById('thread-scheduler-toggle')?.addEventListener('click', () => this.toggleThreadSchedulerAdvanced());
        this.initRuleDropdowns();
        [['thread-nice-input', 'thread-nice-value'], ['thread-io-level', 'thread-io-level-value']].forEach(([inputId, valueId]) => {
            const input = document.getElementById(inputId);
            const value = document.getElementById(valueId);
            input?.addEventListener('input', () => {
                if (value) value.textContent = input.value;
                this.updateSliderProgress(input);
                this.updateThreadResourceSummary();
            });
        });
        document.getElementById('thread-io-class')?.addEventListener('change', () => this.updateThreadResourceSummary());
        document.getElementById('thread-affinity-exclude-switch')?.addEventListener('change', async (event) => {
            const pkg = this.selectedThreadRulePackage;
            if (!pkg) return;
            await this.toggleAppPolicyPackage('affinityExclude', pkg);
            event.currentTarget.checked = (this.appPolicy.affinityExclude || []).includes(pkg);
        });
    }
CoronaAddon.prototype.syncThreadCpuSchedulingUi = function() {
        const excludeRow = document.getElementById('thread-affinity-exclude-row');
        if (excludeRow) excludeRow.classList.remove('hidden');
    }
CoronaAddon.prototype.setThreadSchedulerExpanded = function(expanded) {
        const toggle = document.getElementById('thread-scheduler-toggle');
        const content = document.getElementById('thread-scheduler-content');
        if (!toggle || !content) return;
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        content.setAttribute('aria-hidden', expanded ? 'false' : 'true');
        if (expanded) {
            content.classList.add('expanded');
            content.style.maxHeight = `${content.scrollHeight}px`;
        } else {
            content.classList.remove('expanded');
            content.style.maxHeight = '0px';
        }
    }
CoronaAddon.prototype.toggleThreadSchedulerAdvanced = function() {
        const expanded = document.getElementById('thread-scheduler-toggle')?.getAttribute('aria-expanded') === 'true';
        this.setThreadSchedulerExpanded(!expanded);
    }
CoronaAddon.prototype.setThreadResourceExpanded = function(expanded) {
        const toggle = document.getElementById('thread-resource-toggle');
        const content = document.getElementById('thread-resource-content');
        if (!toggle || !content) return;
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        content.setAttribute('aria-hidden', expanded ? 'false' : 'true');
        if (expanded) {
            content.classList.add('expanded');
            content.style.maxHeight = `${content.scrollHeight}px`;
        } else {
            content.classList.remove('expanded');
            content.style.maxHeight = '0px';
        }
    }
CoronaAddon.prototype.toggleThreadResourceSection = function() {
        const expanded = document.getElementById('thread-resource-toggle')?.getAttribute('aria-expanded') === 'true';
        this.setThreadResourceExpanded(!expanded);
    }
CoronaAddon.prototype.initRuleDropdowns = function() {
        document.querySelectorAll('.rule-dropdown').forEach(dropdown => {
            const trigger = dropdown.querySelector('.rule-dropdown-trigger');
            const select = document.getElementById(dropdown.dataset.selectId || '');
            trigger?.addEventListener('click', event => {
                event.stopPropagation();
                this.closeRuleDropdowns(dropdown);
                const opening = !dropdown.classList.contains('open');
                dropdown.classList.toggle('open', opening);
                this.refreshThreadEditorSectionHeights();
            });
            dropdown.querySelectorAll('.rule-dropdown-menu button').forEach(option => option.addEventListener('click', event => {
                event.stopPropagation();
                if (select) {
                    select.value = option.dataset.value ?? '';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                dropdown.classList.remove('open');
                this.syncRuleDropdown(dropdown);
                this.refreshThreadEditorSectionHeights();
            }));
            select?.addEventListener('change', () => this.syncRuleDropdown(dropdown));
            this.syncRuleDropdown(dropdown);
        });
        document.addEventListener('click', () => this.closeRuleDropdowns());
    }
CoronaAddon.prototype.closeRuleDropdowns = function(except = null) {
        let changed = false;
        document.querySelectorAll('.rule-dropdown.open').forEach(item => {
            if (item === except) return;
            item.classList.remove('open');
            changed = true;
        });
        if (changed) {
            this.refreshThreadEditorSectionHeights();
        }
    }
CoronaAddon.prototype.refreshThreadEditorSectionHeights = function() {
        [
            ['thread-resource-toggle', 'thread-resource-content'],
            ['thread-scheduler-toggle', 'thread-scheduler-content']
        ].forEach(([toggleId, contentId]) => {
            const toggle = document.getElementById(toggleId);
            const content = document.getElementById(contentId);
            if (toggle?.getAttribute('aria-expanded') === 'true' && content) content.style.maxHeight = `${content.scrollHeight}px`;
        });
    }
CoronaAddon.prototype.syncRuleDropdown = function(dropdown) {
        const select = document.getElementById(dropdown?.dataset.selectId || '');
        const value = dropdown?.querySelector('.rule-dropdown-value');
        if (!select || !value) return;
        const option = [...dropdown.querySelectorAll('.rule-dropdown-menu button')].find(item => item.dataset.value === select.value);
        value.textContent = option?.querySelector('strong')?.textContent?.trim() || select.options[select.selectedIndex]?.textContent?.trim() || 'Auto';
        dropdown.querySelectorAll('.rule-dropdown-menu button').forEach(item => item.classList.toggle('selected', item.dataset.value === select.value));
    }
CoronaAddon.prototype.updateThreadResourceSummary = function() {
        const nice = document.getElementById('thread-nice-input')?.value || '0';
        const ioClass = document.getElementById('thread-io-class')?.value || '2';
        const ioLevel = document.getElementById('thread-io-level')?.value || '4';
        const names = { '1': this.t('threadIoRealtime'), '2': this.t('threadIoBestEffort'), '3': this.t('threadIoIdle') };
        const summary = document.getElementById('thread-resource-summary');
        if (summary) summary.textContent = `Nice ${nice} · I/O ${names[ioClass] || 'Auto'} ${ioLevel}`;
    }
CoronaAddon.prototype.getThreadRuleKey = function(pkg, pattern) { return `${pkg}|${pattern}`;  }
CoronaAddon.prototype.getThreadRulesForPackage = function(pkg) { return (this.threadPriorityRules || []).filter(rule => rule.packageName === pkg);  }
CoronaAddon.prototype.getThreadRulePackages = function() { return [...new Set((this.threadPriorityRules || []).map(rule => rule.packageName).filter(Boolean))];  }
CoronaAddon.prototype.parseThreadPriorityRuleLine = function(line) {
        if (!line || !line.includes('=')) return null;
        const idx = line.indexOf('=');
        const target = line.slice(0, idx).trim();
        const values = line.slice(idx + 1).trim();
        const splitIndex = target.indexOf('|');
        if (splitIndex <= 0) return null;
        const packageName = target.slice(0, splitIndex).trim();
        const threadPattern = target.slice(splitIndex + 1).trim();
        const parts = values.split('|');
        const [nice, ioClass, ioLevel, affinity = '', schedPolicy = 'normal', rtPrio = '1', cpuset = '', waltBoost = '0', waltPipeline = '0', uclampMin = '', uclampMax = ''] = parts;
        return {
            key: this.getThreadRuleKey(packageName, threadPattern),
            packageName,
            threadPattern,
            nice: parseInt(nice || '0', 10) || 0,
            ioClass: parseInt(ioClass || '2', 10) || 2,
            ioLevel: parseInt(ioLevel || '4', 10) || 4,
            affinity: String(affinity || '').trim(),
            schedPolicy: String(schedPolicy || 'normal').trim() || 'normal',
            rtPrio: parseInt(rtPrio || '1', 10) || 1,
            cpuset: String(cpuset || '').trim(),
            waltBoost: String(waltBoost || '0') === '1',
            waltPipeline: String(waltPipeline || '0') === '1',
            uclampMin: String(uclampMin || '').trim(),
            uclampMax: String(uclampMax || '').trim()
        };
    }
CoronaAddon.prototype.serializeThreadPriorityRules = function(rules = this.threadPriorityRules || []) {
        return (rules || []).map(rule => `${rule.packageName}|${rule.threadPattern}=${rule.nice}|${rule.ioClass}|${rule.ioLevel}|${rule.affinity || ''}|${rule.schedPolicy || 'normal'}|${rule.rtPrio ?? 1}|${rule.cpuset || ''}|${rule.waltBoost ? '1' : '0'}|${rule.waltPipeline ? '1' : '0'}|${rule.uclampMin ?? ''}|${rule.uclampMax ?? ''}`).join('\n');
    }
CoronaAddon.prototype.loadThreadPriorityConfig = async function() {
        const config = await this.readConfig('thread_priority.conf');
        this.threadPriorityRules = [];
        if (config && config.trim()) {
            config.trim().split('\n').forEach(line => {
                const parsedRule = this.parseThreadPriorityRuleLine(line);
                if (parsedRule) this.threadPriorityRules.push(parsedRule);
            });
        }
        this.renderAppPolicySummary();
    }
CoronaAddon.prototype.saveThreadPriorityConfig = async function() {
        await this.writeConfig('thread_priority.conf', this.serializeThreadPriorityRules());
    }
CoronaAddon.prototype.applyThreadPriorityRulesNow = async function() {
        await this.exec(`sh ${this.shellQuote(`${this.modDir}/service.sh`)} --apply-thread-priority >/dev/null 2>&1`);
        await this.syncAppPolicyDaemon();
    }
CoronaAddon.prototype.getThreadTagStorageKey = function() { return 'corona_thread_tags_v1'; }
CoronaAddon.prototype.loadCustomThreadTags = function() {
        try {
            const raw = localStorage.getItem(this.getThreadTagStorageKey()) || '[]';
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map(item => ({ name: String(item?.name || '').trim() })).filter(item => item.name);
        } catch {
            return [];
        }
    }
CoronaAddon.prototype.saveCustomThreadTags = function(tags) {
        try {
            localStorage.setItem(this.getThreadTagStorageKey(), JSON.stringify((tags || []).map(item => ({ name: String(item?.name || '').trim() })).filter(item => item.name)));
        } catch {}
    }
CoronaAddon.prototype.toggleThreadTagForm = function(show = true, item = null, index = -1) {
        this.threadTagEditingIndex = show ? index : -1;
        const nameInput = document.getElementById('thread-tag-name-input');
        const saveBtn = document.getElementById('thread-tag-save-btn');
        if (nameInput) nameInput.value = item?.name || '';
        if (saveBtn) saveBtn.textContent = index >= 0 ? '保存修改' : '保存标签';
        if (show) nameInput?.focus();
    }
CoronaAddon.prototype.renderCustomThreadTags = function() {
        const container = document.getElementById('thread-rule-tag-list');
        if (!container) return;
        const tags = this.loadCustomThreadTags();
        if (!tags.length) {
            container.innerHTML = '';
            this.toggleThreadTagForm(true);
            return;
        }
        container.innerHTML = tags.map((item, index) => `<button class="thread-tag-card" data-thread-tag-index="${index}"><div class="thread-tag-card-name">${this.escapeHtml(item.name)}</div><div class="thread-tag-card-actions"><span class="thread-tag-card-action" data-thread-tag-action="use" data-thread-tag-index="${index}">编辑规则</span><span class="thread-tag-card-action" data-thread-tag-action="edit" data-thread-tag-index="${index}">改名</span><span class="thread-tag-card-action delete" data-thread-tag-action="delete" data-thread-tag-index="${index}">删除</span></div></button>`).join('');
        container.querySelectorAll('.thread-tag-card').forEach(card => card.addEventListener('click', (event) => {
            const actionEl = event.target.closest('[data-thread-tag-action]');
            const idx = parseInt((actionEl?.dataset.threadTagIndex || card.dataset.threadTagIndex || '-1'), 10);
            const tag = tags[idx];
            if (!tag) return;
            if (!actionEl || actionEl.dataset.threadTagAction === 'use') {
                this.pendingThreadTagName = tag.name;
                this.openThreadRuleEditor(null, '');
                return;
            }
            if (actionEl.dataset.threadTagAction === 'edit') {
                this.toggleThreadTagForm(true, tag, idx);
                return;
            }
            if (actionEl.dataset.threadTagAction === 'delete') {
                const nextTags = tags.filter((_, i) => i !== idx);
                this.saveCustomThreadTags(nextTags);
                this.renderCustomThreadTags();
                this.showToast(`已删除标签 ${tag.name}`);
            }
        }));
    }
CoronaAddon.prototype.saveThreadTag = function() {
        const name = (document.getElementById('thread-tag-name-input')?.value || '').trim();
        if (!name) { this.showToast('请先设置标签名称'); return false; }
        const tags = this.loadCustomThreadTags();
        const next = [...tags];
        const item = { name };
        const editing = this.threadTagEditingIndex >= 0 && this.threadTagEditingIndex < next.length;
        if (editing) next[this.threadTagEditingIndex] = item;
        else next.unshift(item);
        this.saveCustomThreadTags(next);
        this.toggleThreadTagForm(false);
        this.renderCustomThreadTags();
        if (editing) {
            this.showToast(`已更新标签 ${name}`);
            this.toggleThreadTagForm(true);
            return true;
        }
        this.pendingThreadTagName = name;
        this.showToast(`已保存标签 ${name}`);
        const nameInput = document.getElementById('thread-tag-name-input');
        if (nameInput) nameInput.value = '';
        this.openThreadRuleEditor(null, '');
        return true;
    }
CoronaAddon.prototype.syncThreadRuleEditorFields = function() {
        const values = {
            'thread-nice-input': String(this.selectedThreadNice),
            'thread-io-class': String(this.selectedThreadIoClass),
            'thread-io-level': String(this.selectedThreadIoLevel),
            'thread-affinity-input': this.selectedThreadAffinity,
            'thread-cpuset-group': this.selectedThreadCpuset,
            'thread-uclamp-min': this.selectedThreadUclampMin,
            'thread-uclamp-max': this.selectedThreadUclampMax,
            'thread-sched-policy': this.selectedThreadSchedPolicy,
            'thread-rt-prio': String(this.selectedThreadRtPrio)
        };
        Object.entries(values).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.value = value; });
        const waltBoost = document.getElementById('thread-walt-boost');
        const waltPipeline = document.getElementById('thread-walt-pipeline');
        if (waltBoost) waltBoost.checked = this.selectedThreadWaltBoost;
        if (waltPipeline) waltPipeline.checked = this.selectedThreadWaltPipeline;
        const niceValue = document.getElementById('thread-nice-value');
        const ioLevelValue = document.getElementById('thread-io-level-value');
        if (niceValue) niceValue.textContent = String(this.selectedThreadNice);
        if (ioLevelValue) ioLevelValue.textContent = String(this.selectedThreadIoLevel);
        document.querySelectorAll('.rule-dropdown').forEach(dropdown => this.syncRuleDropdown(dropdown));
        ['thread-nice-input', 'thread-io-level'].forEach(id => { const input = document.getElementById(id); if (input) this.updateSliderProgress(input); });
        this.updateThreadResourceSummary();
    }
CoronaAddon.prototype.loadLiveThreadSuggestions = async function(pkg, force = false) {
        const key = String(pkg || '').trim();
        if (!force && this.threadSuggestionCache && Array.isArray(this.threadSuggestionCache[key])) return this.threadSuggestionCache[key];
        const output = await this.exec(this.getAppPolicyScript('thread-list', this.shellQuote(pkg)));
        const items = String(output || '').split('\n').map(item => item.trim()).filter(Boolean);
        this.threadSuggestionCache[key] = items;
        return items;
    }
CoronaAddon.prototype.renderThreadRuleList = function() {
        const list = document.getElementById('thread-rule-list');
        if (!list) return;
        const rules = this.getThreadRulesForPackage(this.selectedThreadRulePackage);
        if (rules.length === 0) {
            list.innerHTML = '<div class="priority-empty">该应用还没有线程规则，可以切到自定义标签新建一个入口</div>'; 
            return;
        }
        list.innerHTML = rules.map(rule => `<div class="thread-rule-item" data-key="${this.escapeHtml(rule.key)}"><div class="thread-rule-info"><div class="thread-rule-name">${this.escapeHtml(rule.threadPattern)}</div><div class="thread-rule-values">nice ${rule.nice} · I/O ${rule.ioClass}/${rule.ioLevel}${rule.affinity ? ` · 亲和性 ${this.escapeHtml(rule.affinity)}` : ''}${rule.cpuset ? ` · cpuset ${this.escapeHtml(rule.cpuset)}` : ''}${rule.uclampMin !== '' ? ` · uclamp.min ${this.escapeHtml(String(rule.uclampMin))}` : ''}${rule.uclampMax !== '' ? ` · uclamp.max ${this.escapeHtml(String(rule.uclampMax))}` : ''}${rule.schedPolicy && rule.schedPolicy !== 'normal' ? ` · ${this.escapeHtml(rule.schedPolicy)}(${rule.rtPrio})` : ''}${rule.waltBoost ? ' · WALT boost' : ''}${rule.waltPipeline ? ' · pipeline' : ''}</div></div><div class="thread-rule-actions"><button class="priority-rule-btn edit" data-action="edit" data-key="${this.escapeHtml(rule.key)}">✎</button><button class="priority-rule-btn delete" data-action="delete" data-key="${this.escapeHtml(rule.key)}">✕</button></div></div>`).join('');
        list.querySelectorAll('.priority-rule-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const key = btn.dataset.key; if (btn.dataset.action === 'edit') this.openThreadRuleEditor(key); else this.deleteThreadRule(key); }));
    }
CoronaAddon.prototype.openThreadRuleManager = async function(pkg, label) {
        this.selectedThreadRulePackage = pkg;
        this.selectedThreadRuleLabel = label || pkg;
        this.selectedThreadRuleKey = null;
        const title = document.getElementById('thread-rule-title');
        if (title) title.textContent = `${label || pkg} · 线程规则`;
        const excludeSwitch = document.getElementById('thread-affinity-exclude-switch');
        if (excludeSwitch) excludeSwitch.checked = (this.appPolicy.affinityExclude || []).includes(pkg);
        const appRule = (this.threadPriorityRules || []).find(rule => rule.packageName === pkg && rule.threadPattern === '*');
        const appRuleButton = document.getElementById('thread-app-rule-btn');
        if (appRuleButton) appRuleButton.classList.toggle('active', !!appRule || !!this.priorityRules?.[pkg]);
        this.renderThreadRuleList();
        this.toggleThreadTagForm(false);
        this.renderCustomThreadTags();
        this.hideOverlay('app-policy-overlay');
        this.showOverlay('thread-rule-overlay');
        this.toggleThreadTagForm(true);
    }
CoronaAddon.prototype.openApplicationThreadRule = function() {
        const pkg = this.selectedThreadRulePackage;
        if (!pkg) return;
        const key = this.getThreadRuleKey(pkg, '*');
        const existing = (this.threadPriorityRules || []).find(rule => rule.key === key);
        if (existing) {
            this.openThreadRuleEditor(key);
            return;
        }
        const legacy = this.priorityRules?.[pkg] || null;
        this.openThreadRuleEditor(null, '*');
        if (legacy) {
            this.selectedThreadNice = legacy.nice;
            this.selectedThreadIoClass = legacy.ioClass;
            this.selectedThreadIoLevel = legacy.ioLevel;
            this.syncThreadRuleEditorFields();
        }
    }
CoronaAddon.prototype.openApplicationRuleEditor = function(pkg, label) {
        this.selectedThreadRulePackage = pkg;
        this.selectedThreadRuleLabel = label || pkg;
        this.selectedThreadRuleKey = null;
        this.hideOverlay('app-profile-overlay');
        this.hideOverlay('app-policy-overlay');
        this.openApplicationThreadRule();
    }
CoronaAddon.prototype.openThreadRuleEditor = function(ruleKey = null, presetPattern = '') {
        const appRuleKey = this.getThreadRuleKey(this.selectedThreadRulePackage, '*');
        const existing = (this.threadPriorityRules || []).find(item => item.key === appRuleKey) || null;
        this.selectedThreadRuleKey = existing?.key || null;
        this.selectedThreadPattern = '*';
        this.selectedThreadRuleScope = 'app';
        this.hideOverlay('thread-rule-overlay');
        this.selectedThreadNice = existing?.nice ?? 0;
        this.selectedThreadIoClass = existing?.ioClass ?? 2;
        this.selectedThreadIoLevel = existing?.ioLevel ?? 4;
        this.selectedThreadAffinity = existing?.affinity || '';
        this.selectedThreadCpuset = existing?.cpuset || '';
        this.selectedThreadUclampMin = existing?.uclampMin ?? '';
        this.selectedThreadUclampMax = existing?.uclampMax ?? '';
        this.selectedThreadSchedPolicy = existing?.schedPolicy || 'normal';
        this.selectedThreadRtPrio = existing?.rtPrio ?? 1;
        this.selectedThreadWaltBoost = !!existing?.waltBoost;
        this.selectedThreadWaltPipeline = !!existing?.waltPipeline;
        this.selectedThreadRuleTitleBase = this.pendingThreadTagName || this.selectedThreadRuleLabel || this.selectedThreadRulePackage;
        const title = document.getElementById('thread-rule-editor-title');
        if (title) title.textContent = `${this.selectedThreadRuleTitleBase} · 应用规则`;
        this.pendingThreadTagName = ''; 
        const appInfo = document.getElementById('thread-rule-selected-app');
        if (appInfo) appInfo.innerHTML = `<span class="process-name">${this.escapeHtml(this.selectedThreadRulePackage)}</span>`;
        this.syncThreadCpuSchedulingUi();
        const excludeSwitch = document.getElementById('thread-affinity-exclude-switch');
        if (excludeSwitch) excludeSwitch.checked = (this.appPolicy.affinityExclude || []).includes(this.selectedThreadRulePackage);
        this.syncThreadRuleEditorFields();
        this.setThreadResourceExpanded(false);
        this.setThreadSchedulerExpanded(!!existing && (this.selectedThreadSchedPolicy !== 'normal' || this.selectedThreadRtPrio > 1 || this.selectedThreadWaltBoost || this.selectedThreadWaltPipeline));
        this.showOverlay('thread-rule-editor-overlay');
    }
CoronaAddon.prototype.collectThreadRuleEditorState = function() {
        const niceValue = parseInt(document.getElementById('thread-nice-input')?.value || '0', 10);
        const ioClassValue = parseInt(document.getElementById('thread-io-class')?.value || '2', 10);
        const ioLevelValue = parseInt(document.getElementById('thread-io-level')?.value || '4', 10);
        const rtPrioValue = parseInt(document.getElementById('thread-rt-prio')?.value || '1', 10);
        return {
            threadPattern: '*',
            nice: Math.max(-20, Math.min(19, Number.isFinite(niceValue) ? niceValue : 0)),
            ioClass: Math.max(1, Math.min(3, Number.isFinite(ioClassValue) ? ioClassValue : 2)),
            ioLevel: Math.max(0, Math.min(7, Number.isFinite(ioLevelValue) ? ioLevelValue : 4)),
            affinity: (document.getElementById('thread-affinity-input')?.value || '').trim(),
            cpuset: (document.getElementById('thread-cpuset-group')?.value || '').trim(),
            uclampMin: (document.getElementById('thread-uclamp-min')?.value || '').trim(),
            uclampMax: (document.getElementById('thread-uclamp-max')?.value || '').trim(),
            schedPolicy: (document.getElementById('thread-sched-policy')?.value || 'normal').trim(),
            rtPrio: Math.max(0, Math.min(99, Number.isFinite(rtPrioValue) ? rtPrioValue : 1)),
            waltBoost: !!document.getElementById('thread-walt-boost')?.checked,
            waltPipeline: !!document.getElementById('thread-walt-pipeline')?.checked
        };
    }
CoronaAddon.prototype.buildThreadRulePreviewActions = function(rule) {
        return [
            `设置 nice=${rule.nice}、I/O=${rule.ioClass}/${rule.ioLevel}`,
            rule.affinity ? `对命中线程设置亲和性 ${rule.affinity}` : '不修改线程亲和性',
            rule.cpuset ? `将命中线程迁入 cpuset ${rule.cpuset}` : '不调整 cpuset 分组',
            rule.uclampMin !== '' ? `设置 uclamp.min=${rule.uclampMin}` : '不设置 uclamp.min',
            rule.uclampMax !== '' ? `设置 uclamp.max=${rule.uclampMax}` : '不设置 uclamp.max',
            rule.schedPolicy !== 'normal' ? `设置调度策略 ${rule.schedPolicy} (rt=${rule.rtPrio})` : '保持 normal 调度策略',
            rule.waltBoost ? '启用 WALT per-task boost 并关闭 task_reduce_affinity' : '不启用 WALT per-task boost',
            rule.waltPipeline ? '启用 WALT pipeline special' : '不启用 WALT pipeline special'
        ];
    }
CoronaAddon.prototype.reopenThreadRuleManager = function() {
        this.hideOverlay('thread-rule-editor-overlay');
        this.showOverlay('app-profile-overlay');
    }
CoronaAddon.prototype.refreshThreadRulePackageState = function(packageName, { reorder = false } = {}) {
        this.renderThreadRuleList();
        this.renderAppPolicySummary();
        this.updateAppPolicyRow(packageName);
        const appRule = (this.threadPriorityRules || []).find(rule => rule.packageName === packageName && rule.threadPattern === '*');
        const appRuleButton = document.getElementById('thread-app-rule-btn');
        if (appRuleButton) appRuleButton.classList.toggle('active', !!appRule || !!this.priorityRules?.[packageName]);
        if (reorder) this.reorderAppPolicyRow(packageName);
    }
CoronaAddon.prototype.saveThreadRule = async function() {
        const editorState = this.collectThreadRuleEditorState();
        const nextRule = {
            key: this.getThreadRuleKey(this.selectedThreadRulePackage, editorState.threadPattern),
            packageName: this.selectedThreadRulePackage,
            threadPattern: editorState.threadPattern,
            nice: editorState.nice,
            ioClass: editorState.ioClass,
            ioLevel: editorState.ioLevel,
            affinity: editorState.affinity,
            cpuset: editorState.cpuset,
            uclampMin: editorState.uclampMin,
            uclampMax: editorState.uclampMax,
            schedPolicy: editorState.schedPolicy,
            rtPrio: editorState.rtPrio,
            waltBoost: editorState.waltBoost,
            waltPipeline: editorState.waltPipeline
        };
        const removedThreadRules = (this.threadPriorityRules || []).filter(rule => rule.packageName === this.selectedThreadRulePackage && rule.threadPattern !== '*').length;
        const nextRules = (this.threadPriorityRules || []).filter(rule => rule.packageName !== this.selectedThreadRulePackage);
        nextRules.push(nextRule);
        const migratesLegacyPriority = editorState.threadPattern === '*' && !!this.priorityRules?.[this.selectedThreadRulePackage];
        const nextPriorityRules = { ...(this.priorityRules || {}) };
        if (migratesLegacyPriority) delete nextPriorityRules[this.selectedThreadRulePackage];
        const previewConfigs = [{ filename: 'thread_priority.conf', content: this.serializeThreadPriorityRules(nextRules) }];
        if (migratesLegacyPriority) previewConfigs.push({ filename: 'process_priority.conf', content: this.serializePriorityRules(nextPriorityRules) || '# empty' });
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: `即将为 ${this.selectedThreadRulePackage} 保存应用规则。`,
            configs: previewConfigs,
            actions: this.buildThreadRulePreviewActions(nextRule),
            notes: [
                '规则会统一应用到该应用当前和后续创建的全部线程。',
                ...(removedThreadRules > 0 ? [`同时合并并移除 ${removedThreadRules} 条旧的按线程规则，避免重复生效。`] : []),
                ...(migratesLegacyPriority ? ['应用规则会接管原应用优先级配置，并删除旧的 process_priority 规则。'] : [])
            ]
        });
        if (!confirmed) return false;
        this.threadPriorityRules = nextRules;
        await this.saveThreadPriorityConfig();
        if (migratesLegacyPriority) {
            this.priorityRules = nextPriorityRules;
            await this.exec(this.getAppPolicyScript('priority-del', this.shellQuote(this.selectedThreadRulePackage)));
        }
        await this.applyThreadPriorityRulesNow();
        this.reopenThreadRuleManager('rules');
        this.refreshThreadRulePackageState(this.selectedThreadRulePackage, { reorder: true });
        this.showToast('应用规则已保存');
        return true;
    }
CoronaAddon.prototype.deleteThreadRule = async function(ruleKey) {
        const nextRules = (this.threadPriorityRules || []).filter(rule => rule.key !== ruleKey);
        const rule = (this.threadPriorityRules || []).find(item => item.key === ruleKey);
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: `即将删除线程规则 ${rule?.threadPattern || ruleKey}。`,
            configs: [{ filename: 'thread_priority.conf', content: this.serializeThreadPriorityRules(nextRules) || '# empty' }],
            notes: ['删除后不会再对匹配线程应用自定义亲和性与调度策略。']
        });
        if (!confirmed) return;
        this.threadPriorityRules = nextRules;
        await this.saveThreadPriorityConfig();
        await this.applyThreadPriorityRulesNow();
        this.reopenThreadRuleManager('rules');
        this.refreshThreadRulePackageState(this.selectedThreadRulePackage);
        this.showToast('线程规则已删除');
    }
  window.CoronaFeatureScripts["priority-thread"] = true;
})();
