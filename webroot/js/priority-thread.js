(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["priority-thread"]) return;
CoronaAddon.prototype.initPerformanceMode = function() { this.initProcessPriority();  }
CoronaAddon.prototype.loadPerformanceModeConfig = async function() { await this.loadPriorityConfig(); await this.loadThreadPriorityConfig();  }
CoronaAddon.prototype.initProcessPriority = function() {
        this.priorityRules = {}; this.threadPriorityRules = []; this.priorityProcesses = []; this.selectedPriorityProcess = null; this.selectedNice = 0; this.selectedIoClass = 2; this.selectedIoLevel = 4; this.selectedThreadRuleKey = null; this.selectedThreadRulePackage = ''; this.selectedThreadRuleLabel = ''; this.selectedThreadPattern = ''; this.selectedThreadNice = 0; this.selectedThreadIoClass = 2; this.selectedThreadIoLevel = 4; this.selectedThreadAffinity = ''; this.selectedThreadCpuset = ''; this.selectedThreadUclampMin = ''; this.selectedThreadUclampMax = ''; this.selectedThreadSchedPolicy = 'normal'; this.selectedThreadRtPrio = 1; this.selectedThreadWaltBoost = false; this.selectedThreadWaltPipeline = false; this.threadPanelState = 'rules'; this.selectedThreadModePreset = 'custom'; this.threadTagEditingIndex = -1; this.pendingThreadTagName = ''; 
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
        const config = await this.exec(`cat ${this.configDir}/process_priority.conf 2>/dev/null`);
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
        document.getElementById('thread-rule-cancel-btn')?.addEventListener('click', () => { this.hideOverlay('thread-rule-editor-overlay'); this.showOverlay('thread-rule-overlay'); this.toggleThreadTagForm(true); });
        document.getElementById('thread-rule-save-btn')?.addEventListener('click', () => this.saveThreadRule());
                document.getElementById('thread-tag-save-btn')?.addEventListener('click', () => this.saveThreadTag());
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
        const config = await this.exec(`cat ${this.configDir}/thread_priority.conf 2>/dev/null`);
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
CoronaAddon.prototype.getThreadModePresets = function() { return [{ key: 'daily', label: '日用省电', desc: '偏保守，适合轻应用与低功耗', values: { nice: 2, ioClass: 3, ioLevel: 7, affinity: '', cpuset: 'background', uclampMin: '0', uclampMax: '256', schedPolicy: 'idle', rtPrio: 1, waltBoost: false, waltPipeline: false } }, { key: 'balanced', label: '均衡调度', desc: '响应与功耗平衡，适合日常常驻', values: { nice: 0, ioClass: 2, ioLevel: 4, affinity: '', cpuset: 'foreground', uclampMin: '128', uclampMax: '512', schedPolicy: 'normal', rtPrio: 1, waltBoost: false, waltPipeline: false } }, { key: 'render', label: '渲染优先', desc: '偏重渲染与交互线程，适合 UI / RenderThread', values: { nice: -6, ioClass: 2, ioLevel: 2, affinity: '', cpuset: 'top-app', uclampMin: '256', uclampMax: '768', schedPolicy: 'fifo', rtPrio: 2, waltBoost: true, waltPipeline: true } }, { key: 'extreme', label: '极限性能', desc: '高性能高功耗，适合重负载游戏线程', values: { nice: -10, ioClass: 1, ioLevel: 0, affinity: '', cpuset: 'top-app', uclampMin: '512', uclampMax: '1024', schedPolicy: 'rr', rtPrio: 4, waltBoost: true, waltPipeline: true } }, { key: 'custom', label: '自定义规则', desc: '保持当前填写内容，自由调整所有参数', values: null }];  }
CoronaAddon.prototype.renderThreadModePresets = function(activeKey = 'custom') { const container = document.getElementById('thread-mode-list'); if (!container) return; const presets = this.getThreadModePresets(); container.innerHTML = presets.map(item => `<div class="thread-mode-chip ${item.key === activeKey ? 'active' : ''}" data-key="${this.escapeHtml(item.key)}"><div class="thread-mode-name">${this.escapeHtml(item.label)}</div></div>`).join(''); container.querySelectorAll('.thread-mode-chip').forEach(chip => chip.addEventListener('click', () => this.applyThreadModePreset(chip.dataset.key || 'custom')));  }
CoronaAddon.prototype.applyThreadModePreset = function(key) { const preset = this.getThreadModePresets().find(item => item.key === key); this.selectedThreadModePreset = key || 'custom'; if (!preset) return; if (preset.values) { const values = preset.values; this.selectedThreadAffinity = values.affinity; this.selectedThreadCpuset = values.cpuset; this.selectedThreadUclampMin = values.uclampMin; this.selectedThreadUclampMax = values.uclampMax; this.selectedThreadSchedPolicy = values.schedPolicy; this.selectedThreadRtPrio = values.rtPrio; this.selectedThreadWaltBoost = values.waltBoost; this.selectedThreadWaltPipeline = values.waltPipeline; this.syncThreadRuleEditorFields(); } this.renderThreadModePresets(this.selectedThreadModePreset);  }
CoronaAddon.prototype.syncThreadRuleEditorFields = function() { const affinity = document.getElementById('thread-affinity-input'); const cpuset = document.getElementById('thread-cpuset-group'); const uclampMin = document.getElementById('thread-uclamp-min'); const uclampMax = document.getElementById('thread-uclamp-max'); const sched = document.getElementById('thread-sched-policy'); const rt = document.getElementById('thread-rt-prio'); const waltBoost = document.getElementById('thread-walt-boost'); const waltPipeline = document.getElementById('thread-walt-pipeline'); if (affinity) affinity.value = this.selectedThreadAffinity; if (cpuset) cpuset.value = this.selectedThreadCpuset; if (uclampMin) uclampMin.value = this.selectedThreadUclampMin; if (uclampMax) uclampMax.value = this.selectedThreadUclampMax; if (sched) sched.value = this.selectedThreadSchedPolicy; if (rt) rt.value = String(this.selectedThreadRtPrio); if (waltBoost) waltBoost.checked = this.selectedThreadWaltBoost; if (waltPipeline) waltPipeline.checked = this.selectedThreadWaltPipeline;  }
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
        list.innerHTML = rules.map(rule => `<div class="thread-rule-item" data-key="${this.escapeHtml(rule.key)}"><div class="thread-rule-info"><div class="thread-rule-name">${this.escapeHtml(rule.threadPattern)}</div><div class="thread-rule-values">${rule.affinity ? `亲和性 ${this.escapeHtml(rule.affinity)}` : '未设置亲和性'}${rule.cpuset ? ` · cpuset ${this.escapeHtml(rule.cpuset)}` : ''}${rule.uclampMin !== '' ? ` · uclamp.min ${this.escapeHtml(String(rule.uclampMin))}` : ''}${rule.uclampMax !== '' ? ` · uclamp.max ${this.escapeHtml(String(rule.uclampMax))}` : ''}${rule.schedPolicy && rule.schedPolicy !== 'normal' ? ` · ${this.escapeHtml(rule.schedPolicy)}(${rule.rtPrio})` : ''}${rule.waltBoost ? ' · WALT boost' : ''}${rule.waltPipeline ? ' · pipeline' : ''}</div></div><div class="thread-rule-actions"><button class="priority-rule-btn edit" data-action="edit" data-key="${this.escapeHtml(rule.key)}">✎</button><button class="priority-rule-btn delete" data-action="delete" data-key="${this.escapeHtml(rule.key)}">✕</button></div></div>`).join('');
        list.querySelectorAll('.priority-rule-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const key = btn.dataset.key; if (btn.dataset.action === 'edit') this.openThreadRuleEditor(key); else this.deleteThreadRule(key); }));
    }
CoronaAddon.prototype.openThreadRuleManager = async function(pkg, label) {
        this.selectedThreadRulePackage = pkg;
        this.selectedThreadRuleLabel = label || pkg;
        this.selectedThreadRuleKey = null;
        const title = document.getElementById('thread-rule-title');
        if (title) title.textContent = `${label || pkg} · 线程规则`;
        this.renderThreadRuleList();
        this.toggleThreadTagForm(false);
        this.renderCustomThreadTags();
        this.hideOverlay('app-policy-overlay');
        this.showOverlay('thread-rule-overlay');
        this.toggleThreadTagForm(true);
    }
CoronaAddon.prototype.openThreadRuleEditor = function(ruleKey = null, presetPattern = '') {
        const existing = ruleKey ? (this.threadPriorityRules || []).find(item => item.key === ruleKey) : null;
        this.selectedThreadRuleKey = ruleKey || null;
        this.selectedThreadPattern = existing?.threadPattern || presetPattern || '';
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
        const title = document.getElementById('thread-rule-editor-title');
        if (title) title.textContent = this.pendingThreadTagName ? `${this.pendingThreadTagName} · 线程规则` : `${this.selectedThreadRuleLabel || this.selectedThreadRulePackage} · 线程规则`;
        this.pendingThreadTagName = ''; 
        const appInfo = document.getElementById('thread-rule-selected-app');
        if (appInfo) appInfo.innerHTML = `<span class="process-name">${this.escapeHtml(this.selectedThreadRulePackage)}</span>`;
        const input = document.getElementById('thread-pattern-input');
        if (input) input.value = this.selectedThreadPattern;
        this.selectedThreadModePreset = existing ? 'custom' : (presetPattern ? 'custom' : 'balanced');
        this.syncThreadRuleEditorFields();
        this.renderThreadModePresets(this.selectedThreadModePreset);
        this.showOverlay('thread-rule-editor-overlay');
    }
CoronaAddon.prototype.collectThreadRuleEditorState = function() {
        return {
            threadPattern: (document.getElementById('thread-pattern-input')?.value || '').trim(),
            affinity: (document.getElementById('thread-affinity-input')?.value || '').trim(),
            cpuset: (document.getElementById('thread-cpuset-group')?.value || '').trim(),
            uclampMin: (document.getElementById('thread-uclamp-min')?.value || '').trim(),
            uclampMax: (document.getElementById('thread-uclamp-max')?.value || '').trim(),
            schedPolicy: (document.getElementById('thread-sched-policy')?.value || 'normal').trim(),
            rtPrio: parseInt(document.getElementById('thread-rt-prio')?.value || '1', 10) || 1,
            waltBoost: !!document.getElementById('thread-walt-boost')?.checked,
            waltPipeline: !!document.getElementById('thread-walt-pipeline')?.checked
        };
    }
CoronaAddon.prototype.buildThreadRulePreviewActions = function(rule) {
        return [
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
        this.showOverlay('thread-rule-overlay');
        this.toggleThreadTagForm(true);
    }
CoronaAddon.prototype.refreshThreadRulePackageState = function(packageName, { reorder = false } = {}) {
        this.renderThreadRuleList();
        this.renderAppPolicySummary();
        this.updateAppPolicyRow(packageName);
        if (reorder) this.reorderAppPolicyRow(packageName);
    }
CoronaAddon.prototype.saveThreadRule = async function() {
        const editorState = this.collectThreadRuleEditorState();
        if (!editorState.threadPattern) { this.showToast('请输入线程名或模式'); return false; }
        const nextRule = {
            key: this.getThreadRuleKey(this.selectedThreadRulePackage, editorState.threadPattern),
            packageName: this.selectedThreadRulePackage,
            threadPattern: editorState.threadPattern,
            nice: 0,
            ioClass: 2,
            ioLevel: 4,
            affinity: editorState.affinity,
            cpuset: editorState.cpuset,
            uclampMin: editorState.uclampMin,
            uclampMax: editorState.uclampMax,
            schedPolicy: editorState.schedPolicy,
            rtPrio: editorState.rtPrio,
            waltBoost: editorState.waltBoost,
            waltPipeline: editorState.waltPipeline
        };
        const nextRules = (this.threadPriorityRules || []).filter(rule => rule.key !== this.selectedThreadRuleKey && rule.key !== nextRule.key);
        nextRules.push(nextRule);
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: `即将为 ${this.selectedThreadRulePackage} 保存线程规则 ${editorState.threadPattern}。`,
            configs: [{ filename: 'thread_priority.conf', content: this.serializeThreadPriorityRules(nextRules) }],
            actions: this.buildThreadRulePreviewActions(nextRule),
            notes: ['规则会对命中的线程 TID 应用，不影响未匹配线程。']
        });
        if (!confirmed) return false;
        this.threadPriorityRules = nextRules;
        await this.saveThreadPriorityConfig();
        await this.applyThreadPriorityRulesNow();
        this.reopenThreadRuleManager('rules');
        this.refreshThreadRulePackageState(this.selectedThreadRulePackage, { reorder: true });
        this.showToast('线程规则已保存');
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
