# Corona

Corona 提供 WebUI，用于管理 ZRAM、Swap、虚拟内存、IO 调度器、CPU 调频器、TCP 拥塞控制等系统参数。

配置保存在 `/data/adb/modules/Corona/config/`。

## 文档

- [OPlus ZRAM 与 HybridSwap](docs/oplus-zram.md)：官方启动链、后端发现、ZRAM 重建与回写块管理。
- [OPlus ERM 自适应策略](docs/oplus-erm.md)：后端检测、节点读写、参数计算与基线恢复。
- [coronad 技术说明](docs/coronad.md)：系统节点、线程分类、调度计算与系统调用。
- [自动线程亲和性](docs/auto-affinity.md)：CPU 拓扑检测、线程分类与亲和性应用。

## 参考

- 部分逻辑来自 Scene 附加模块 2。
- 部分逻辑参考 [NetizenNemo/Aether_OptExt](https://github.com/NetizenNemo/Aether_OptExt)。

## 开源协议

本项目采用 [GPL-3.0](LICENSE) 协议开源。
