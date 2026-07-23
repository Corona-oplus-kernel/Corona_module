(function() {
  if (typeof CoronaAddon === 'undefined') return;
  window.CoronaFeatureScripts = window.CoronaFeatureScripts || {};
  if (window.CoronaFeatureScripts['memory-opt']) return;

  const CONFIG_FILE = 'system_opt.conf';
  const CONFIG_ORDER = ['background_enabled', 'reclaim_enabled', 'protect_enabled', 'fstrim_enabled'];
  const POLICIES = Object.freeze({
    background: Object.freeze({
      key: 'background_enabled',
      switchId: 'lmk-switch',
      titleKey: 'systemOptBackground',
      actionKeys: ['systemOptActionLmk', 'systemOptActionBackgroundLimits']
    }),
    reclaim: Object.freeze({
      key: 'reclaim_enabled',
      switchId: 'reclaim-switch',
      titleKey: 'systemOptReclaim',
      actionKeys: ['systemOptActionReclaim', 'systemOptActionKswapd']
    }),
    protect: Object.freeze({
      key: 'protect_enabled',
      switchId: 'protect-switch',
      titleKey: 'systemOptProtect',
      actionKeys: ['systemOptActionProtect']
    }),
    fstrim: Object.freeze({
      key: 'fstrim_enabled',
      switchId: 'fstrim-switch',
      titleKey: 'systemOptFstrim',
      actionKeys: ['systemOptActionFstrim']
    })
  });

  Object.assign(CoronaAddon.prototype, {
    async initSystemOpt() {
      Object.entries(POLICIES).forEach(([name, policy]) => {
        const toggle = document.getElementById(policy.switchId);
        if (!toggle || toggle.dataset.bound === '1') return;
        toggle.dataset.bound = '1';
        toggle.addEventListener('change', () => this.saveAndApplySystemOpt(name));
      });
      await this.loadSystemOptConfig();
    },
    async readSystemOptConfig() {
      await this.runSystemOptService('--migrate-system-opt');
      return new Map(this.parseSimpleConfig(await this.readConfig(CONFIG_FILE)));
    },
    async loadSystemOptConfig() {
      const values = await this.readSystemOptConfig();
      let enabledCount = 0;
      Object.values(POLICIES).forEach(policy => {
        const toggle = document.getElementById(policy.switchId);
        const enabled = values.get(policy.key) === '1';
        if (toggle) toggle.checked = enabled;
        if (enabled) enabledCount += 1;
      });
      const badge = document.getElementById('system-opt-badge');
      if (badge) {
        badge.textContent = enabledCount
          ? this.t('systemOptEnabledCount').replace('{count}', String(enabledCount))
          : this.t('systemOptUnconfigured');
      }
    },
    async saveAndApplySystemOpt(name, skipPreview = false) {
      const policy = POLICIES[name];
      const toggle = policy && document.getElementById(policy.switchId);
      if (!policy || !toggle) return false;
      const updates = { [policy.key]: toggle.checked ? '1' : null };
      const config = await this.buildMergedConfigContent(CONFIG_FILE, updates, CONFIG_ORDER);
      if (!skipPreview) {
        const confirmed = await this.confirmChangePreview(this.t('changePreview'), {
          summary: this.t(toggle.checked ? 'systemOptEnableSummary' : 'systemOptDisableSummary')
            .replace('{name}', this.t(policy.titleKey)),
          configs: [{ filename: CONFIG_FILE, content: config }],
          actions: toggle.checked ? policy.actionKeys.map(key => this.t(key)) : [],
          notes: toggle.checked ? [] : [this.t('systemOptDisableNote')]
        }, { onCancel: () => this.loadSystemOptConfig() });
        if (!confirmed) return false;
      }
      await this.mergeConfigFile(CONFIG_FILE, updates, CONFIG_ORDER);
      if (toggle.checked) {
        this.showLoading(true);
        try {
          await this.applySystemOptNow(name);
        } finally {
          this.showLoading(false);
        }
      }
      await this.loadSystemOptConfig();
      this.showToast(this.t(toggle.checked ? 'systemOptApplied' : 'systemOptDisabled'));
      return true;
    },
    async applySystemOptNow(name) {
      if (!POLICIES[name]) return false;
      await this.runSystemOptService('--apply-system-opt', name);
      return true;
    },
    async runSystemOptService(action, argument = '') {
      const command = `CORONA_CONFIG_DIR=${this.shellQuote(this.configDir)} /system/bin/sh ${this.shellQuote(`${this.modDir}/service.sh`)} ${action}${argument ? ` ${this.shellQuote(argument)}` : ''}`;
      const result = await this.execResult(command);
      if (result.code !== 0) throw new Error(result.stderr || `Failed to run ${action}`);
    }
  });

  window.CoronaFeatureScripts['memory-opt'] = true;
})();
