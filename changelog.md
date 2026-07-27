# Corona v5.1.2

- webui: 修复快速展开折叠面板导致滚动锁死
- webui: 修复连续折叠面板导致页面卡住
- webui: 配置文件有实际配置时自动启用对应分类开关
- webui: 页面切换改为可中断式，快速连续切换不再卡顿
- webui: 隐藏分类开关时自动启用分类并显示实际配置值
- webui: fix tab switching sometimes requiring multiple clicks
- webui: fix delayed response on rapid page switching
- webui: fix page switch auto-scroll-down on return to home
- webui: fix multiple causes of frontend stuttering
- bump version to v5.1.1
- 完善mm-sys动态调节：baseline导出、daemon生命周期管理、刷新率扫描重试
