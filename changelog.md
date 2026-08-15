# Corona v5.2.2

- 精简安装脚本并保留兼容检测
- 优化 `coronad` 常驻资源占用，减少前台探测、`/proc` 扫描与状态落盘频率
- 自动线程亲和性接入 eBPF fork、rename、exit 事件，降低新线程处理延迟
- 自动规则跳过易变 Binder/线程池名称，并处理 cpuset 限制导致的绑核失败
- 自动分配页面新增 eBPF 与 cgroup boost 状态展示
- 加入纯色设置解决web的部分性能问题

**Full Changelog**: https://github.com/Corona-oplus-kernel/Corona_module_source/compare/v5.2.0...v5.2.2
