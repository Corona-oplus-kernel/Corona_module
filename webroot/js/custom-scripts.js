(function() {
  if (typeof CoronaAddon === "undefined") return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts["custom-scripts"]) return;
  Object.assign(CoronaAddon.prototype, {
    initCustomScripts() {
        this.customScripts = {};
        this.editingScriptId = null;
        document.getElementById('scripts-add-btn').addEventListener('click', () => this.showScriptEditor());
        document.getElementById('script-cancel-btn').addEventListener('click', () => this.hideOverlay('script-edit-overlay'));
        document.getElementById('script-save-btn').addEventListener('click', () => this.saveScript());
        document.getElementById('script-edit-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'script-edit-overlay') this.hideOverlay('script-edit-overlay');
        });
        document.querySelectorAll('#script-tags .script-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                document.querySelectorAll('#script-tags .script-tag').forEach(t => t.classList.remove('selected'));
                tag.classList.add('selected');
            });
        });
        this.loadCustomScripts();
    },
    async loadCustomScripts() {
        const base64Data = await this.readConfig('custom_scripts.b64');
        if (base64Data && base64Data.trim()) {
            try {
                const json = decodeURIComponent(escape(atob(base64Data.trim())));
                this.customScripts = JSON.parse(json);
            } catch (e) {
                this.customScripts = {};
            }
        }
        this.renderScriptsList();
        this.updateScriptsCount();
    },
    async saveCustomScripts() {
        const json = JSON.stringify(this.customScripts);
        const base64Data = btoa(unescape(encodeURIComponent(json)));
        await this.writeConfig('custom_scripts.b64', base64Data);
        await this.generateScriptsFile();
    },
    async generateScriptsFile() {
        const scriptsDir = this.modDir + '/scripts.d';
        await this.exec(`rm -f ${scriptsDir}/*.sh 2>/dev/null`);
        for (const id in this.customScripts) {
            const script = this.customScripts[id];
            if (script.enabled) {
                const safeName = id.replace(/[^a-zA-Z0-9_]/g, '_');
                const content = '#!/system/bin/sh\n' + script.code + '\n';
                const base64 = btoa(unescape(encodeURIComponent(content)));
                await this.exec(`echo '${base64}' | base64 -d > ${scriptsDir}/${safeName}.sh && chmod 755 ${scriptsDir}/${safeName}.sh`);
            }
        }
    },
    renderScriptsList() {
        const container = document.getElementById('scripts-list');
        const scripts = Object.entries(this.customScripts);
        if (scripts.length === 0) {
            container.innerHTML = '<div class="scripts-empty">暂无自定义脚本</div>';
            return;
        }
        container.innerHTML = scripts.map(([id, script]) => `
            <div class="script-item ${script.enabled ? '' : 'disabled'}" data-id="${id}">
                <div class="script-info">
                    <div class="script-header">
                        <span class="script-name">${this.escapeHtml(script.name)}</span>
                        <span class="script-tag-badge tag-${script.tag}">${script.tag}</span>
                    </div>
                    <div class="script-preview">${this.escapeHtml(script.code.split('\n')[0])}</div>
                </div>
                <div class="script-actions">
                    <button class="script-action-btn toggle" data-id="${id}" title="${script.enabled ? '禁用' : '启用'}">${script.enabled ? '✓' : '○'}</button>
                    <button class="script-action-btn edit" data-id="${id}" title="编辑">✎</button>
                    <button class="script-action-btn delete" data-id="${id}" title="删除">✕</button>
                </div>
            </div>
        `).join('');
        container.querySelectorAll('.script-action-btn.toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleScript(btn.dataset.id);
            });
        });
        container.querySelectorAll('.script-action-btn.edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editScript(btn.dataset.id);
            });
        });
        container.querySelectorAll('.script-action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteScript(btn.dataset.id);
            });
        });
    },
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    updateScriptsCount() {
        const count = Object.keys(this.customScripts).length;
        const enabledCount = Object.values(this.customScripts).filter(s => s.enabled).length;
        document.getElementById('scripts-count').textContent = count > 0 ? `${enabledCount}/${count} 个` : '0 个';
    },
    showScriptEditor(scriptId = null) {
        this.editingScriptId = scriptId;
        const titleEl = document.getElementById('script-edit-title');
        const nameInput = document.getElementById('script-name-input');
        const codeInput = document.getElementById('script-code-input');
        const enabledSwitch = document.getElementById('script-enabled-switch');
        if (scriptId && this.customScripts[scriptId]) {
            const script = this.customScripts[scriptId];
            titleEl.textContent = '编辑脚本';
            nameInput.value = script.name;
            codeInput.value = script.code;
            enabledSwitch.checked = script.enabled;
            document.querySelectorAll('#script-tags .script-tag').forEach(t => {
                t.classList.toggle('selected', t.dataset.tag === script.tag);
            });
        } else {
            titleEl.textContent = '添加脚本';
            nameInput.value = '';
            codeInput.value = '';
            enabledSwitch.checked = true;
            document.querySelectorAll('#script-tags .script-tag').forEach((t, i) => {
                t.classList.toggle('selected', i === 0);
            });
        }
        codeInput.scrollTop = 0;
        nameInput.scrollTop = 0;
        this.showOverlay('script-edit-overlay');
    },
    async saveScript() {
        const nameInput = document.getElementById('script-name-input');
        const codeInput = document.getElementById('script-code-input');
        const enabledSwitch = document.getElementById('script-enabled-switch');
        const selectedTag = document.querySelector('#script-tags .script-tag.selected');
        const name = nameInput.value.trim();
        const code = codeInput.value.trim();
        const tag = selectedTag ? selectedTag.dataset.tag : '其他';
        const enabled = enabledSwitch.checked;
        if (!name) {
            this.showToast('请输入脚本名称');
            return;
        }
        if (!code) {
            this.showToast('请输入脚本内容');
            return;
        }
        const id = this.editingScriptId || `script_${Date.now()}`;
        const nextScripts = { ...this.customScripts, [id]: { name, code, tag, enabled } };
        const safeName = id.replace(/[^a-zA-Z0-9_]/g, '_');
        const confirmed = await this.confirmChangePreview('变更预览', {
            summary: this.editingScriptId ? `即将更新脚本 ${name}。` : `即将添加脚本 ${name}。`,
            configs: [{ filename: 'custom_scripts.b64 (decoded)', content: JSON.stringify(nextScripts, null, 2) }],
            actions: enabled ? [`生成 scripts.d/${safeName}.sh 并赋予可执行权限`] : ['脚本已禁用，仅保存配置。'],
            notes: enabled ? ['启用的脚本会在模块启动时以 root 权限执行。'] : []
        });
        if (!confirmed) return;
        this.customScripts = nextScripts;
        await this.saveCustomScripts();
        this.renderScriptsList();
        this.updateScriptsCount();
        this.hideOverlay('script-edit-overlay');
        this.showToast(this.editingScriptId ? '脚本已更新' : '脚本已添加');
    },
    editScript(id) {
        this.showScriptEditor(id);
    },
    async toggleScript(id) {
        if (this.customScripts[id]) {
            const script = this.customScripts[id];
            const nextEnabled = !script.enabled;
            const nextScripts = { ...this.customScripts, [id]: { ...script, enabled: nextEnabled } };
            const safeName = id.replace(/[^a-zA-Z0-9_]/g, '_');
            const confirmed = await this.confirmChangePreview('变更预览', {
                summary: `即将${nextEnabled ? '启用' : '禁用'}脚本 ${script.name}。`,
                configs: [{ filename: 'custom_scripts.b64 (decoded)', content: JSON.stringify(nextScripts, null, 2) }],
                actions: nextEnabled ? [`生成 scripts.d/${safeName}.sh 并赋予可执行权限`] : [`移除 scripts.d/${safeName}.sh`]
            });
            if (!confirmed) return;
            this.customScripts = nextScripts;
            await this.saveCustomScripts();
            this.renderScriptsList();
            this.updateScriptsCount();
            this.showToast(this.customScripts[id].enabled ? '脚本已启用' : '脚本已禁用');
        }
    },
    async deleteScript(id) {
        const script = this.customScripts[id];
        if (!script) return;
        const confirmed = await this.showConfirm(`确定要删除脚本 "${script.name}" 吗？`, '删除脚本');
        if (!confirmed) return;
        delete this.customScripts[id];
        await this.saveCustomScripts();
        this.renderScriptsList();
        this.updateScriptsCount();
        this.showToast('脚本已删除');
    }
  });
  window.CoronaFeatureScripts["custom-scripts"] = true;
})();
