# OPlus ZRAM 与 HybridSwap 适配

## 目标

Corona 不替换 OPlus 的完整启动链。模块等待官方 ZRAM 初始化完成，再对用户明确配置的字段做增量覆盖；未写入 `config/zram.conf` 的字段保持官方值。

## 官方启动文件

当前测试设备（OnePlus PJZ110，Android 16，Linux 6.6）使用以下文件：

- `/product/etc/init/init.oplus.nandswap.rc`
- `/product/bin/init.oplus.nandswap.sh`
- `/product/bin/nandswap_tool`
- `/system_ext/etc/fstab.zram.50p`
- `/system/etc/init/hw/init.rc`

其它 OPlus 设备还可能使用：

- `/odm/etc/init.oplus.mm-sys.sh`
- `/odm/etc/oplus_mm_config.xml`
- `/odm/etc/nandswap.cfg`

设备映射名不能假定为 `hybridswap_crypto`。模块按当前 `backing_dev`、保存状态、官方 rc 的 `encryptDev` 参数、mapper 设备和 by-name 分区依次发现后端。

## 官方流程

1. 官方脚本选择压缩算法、ZRAM 大小和系统参数。
2. 对 ZRAM 执行 `mkswap`，再以官方优先级执行 `swapon`。
3. `nandswap_tool` 或对应脚本绑定 HybridSwap 后端并启用驱动。
4. Corona 等待活动 ZRAM 出现，仅覆盖配置文件中存在的键。
5. 需要重建 ZRAM 时，先保存官方后端状态，重建后再恢复后端和 HybridSwap 参数。

## 可配置键

| 键 | 节点 | 是否重建 ZRAM |
| --- | --- | --- |
| `algorithm` | `/sys/block/zramX/comp_algorithm` | 是 |
| `size` | `/sys/block/zramX/disksize` | 是 |
| `recomp_algorithm1..3` | `/sys/block/zramX/recomp_algorithm` | 是 |
| `zstd_compression_level` | `/sys/module/zstd/parameters/compression_level` | 否 |
| `priority` | `/proc/swaps` / `swapon -p` | 仅重挂载 |
| `swappiness` | OPlus `vm_swappiness` 与标准 VM/memcg 节点 | 否 |
| `direct_swappiness` | `/proc/oplus_mem/swappiness_para` | 否 |
| `zram_used_limit_mb` | `/dev/memcg/memory.zram_used_limit_mb` | 否 |
| `hybridswap_zram_increase` | `/sys/block/zramX/hybridswap_zram_increase` | 否 |
| `hybridswap_quota_day` | `/sys/block/zramX/hybridswap_quota_day` | 否 |

WebUI 会检测节点，当前内核没有的项目不会显示。启用 ZRAM 但不配置任何参数时，配置文件只保存 `enabled=1`，不会覆盖官方参数。

回写块使用独立的 `config/loop.conf` 保存模块覆盖状态和系统扩展容量。WebUI 修改时立即保存配置，点击“应用回写块设置”后通过 `service.sh --apply-writeback-block` 执行；开机服务在官方 ZRAM 初始化后调用同一入口，因此回写块不依赖模块 ZRAM 配置是否启用。

模块不会自行创建 `/data` 文件、Loop 设备或替代官方后端。应用配置时先清理旧版 Corona 遗留的文件回写设备，再动态发现并恢复系统创建的后端；它可能是加密 mapper、by-name 分区，也可能是官方 `/data/nandswap/swapfile` 对应的 Loop 设备，因此不能根据设备名判断来源。容量档位读取 `persist.sys.oplus.nandswap.cfg`，并同步写入官方档位索引 `persist.sys.oplus.nandswap.lvl`、目标档位 `persist.sys.oplus.nandswap.swapsize` 和当前档位 `persist.sys.oplus.nandswap.swapsize.curr`。属性立即保存，后端文件或分区容量由 OPlus 官方启动流程在重启时应用。

## 实机验证

测试前保存官方运行状态，测试后逐项恢复并复核。

- `direct_swappiness`：写入临近值后恢复，`vm_swappiness` 未被连带修改。
- `zram_used_limit_mb`：写入并恢复成功。
- `hybridswap_zram_increase`：写入并恢复成功。
- `hybridswap_quota_day`：写入并恢复成功。
- ZSTD 压缩级别：写入并恢复成功。
- ZRAM 重建：`lz4` 临时切换到 `lzo-rle`，大小减少 256 MiB，优先级临时调整，随后全部恢复成功。
- 重建前后 HybridSwap 后端、ZRAM 增量、每日配额和 ZSTD 级别均保持或恢复为官方值。
- 回写块应用：当前节点始终保持官方加密 mapper，未生成 Corona 文件或 Loop 设备；系统扩展容量属性写入后可读取，并在测试结束后恢复。

测试快照和中间文件只保存在 `~/tmp/`，不会随模块安装。

## 安全约束

- 不硬编码 mapper 名称或 ZRAM 设备编号。
- 不配置的字段不写节点。
- 节点不存在时跳过，不把其它设备的参数强加到当前设备。
- `swapoff`、reset、`disksize`、`mkswap`、`swapon` 任一步失败都会中止重建。
- 官方后端恢复失败时不继续伪装成功。
