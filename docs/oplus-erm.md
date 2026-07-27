# OPlus ERM 自适应策略

## 作用

`scripts/zram-policy.sh` 根据当前内存后端调整 OPlus 回收水位、swappiness、ZRAM 上限和 HybridSwap 写回强度。支持 ERM、HybridSwapD 和通用 VM 三条路径。

## 后端判定

按以下顺序检测：

1. `/sys/kernel/oplus_mm/erm/stats` 可读，且 `/dev/memcg/memory.erm_avail_buffer` 可写：`memory_backend=erm`。
2. 活动 ZRAM 存在 `/sys/block/zramX/hybridswap_vmstat`：`memory_backend=hybridswapd`。
3. 以上节点均不存在：`memory_backend=generic`。

活动 ZRAM 从 `/proc/swaps` 中第一个 `zramX` 设备取得

## 输入节点

| 数据 | 节点或命令 | 用途 |
| --- | --- | --- |
| 物理内存 | `/proc/meminfo` 的 `MemTotal` | 选择 ERM 水位和 ZRAM 上限 |
| ZRAM 容量、已用量 | `/proc/swaps` | 计算 ZRAM 使用率 |
| 原始页、压缩量、内存占用 | `/sys/block/zramX/mm_stat` | 计算压缩率和额外开销 |
| 内存压力 | `/proc/pressure/memory` 的 `some avg10` | 判断当前回收压力 |
| ERM 当前值 | `/sys/kernel/oplus_mm/erm/stats` | 保存官方水位和 swappiness 基线 |
| ERM 可用内存区间 | `/dev/memcg/memory.erm_avail_buffer` | 控制开始回收和提高回收强度的区间 |
| HybridSwap 统计 | `hybridswap_meminfo`、`hybridswap_stat_snap`、`hybridswap_vmstat` | 计算磁盘交换占用、写回量和快速回读 |
| 屏幕状态 | `dumpsys power` 的 `mWakefulness` | 选择亮屏或息屏执行周期 |
| 温度 | `/sys/class/thermal/thermal_zone*/temp` | 限制重压缩和 compact |
| 电量 | `/sys/class/power_supply/battery/` | 限制息屏重压缩 |

## ERM 参数计算

`MemTotal` 先转换为 MiB，再选择参数：

| `MemTotal` | `erm_avail_buffer` | `wmarks` | `hybridswap_zram_increase` | `zram_used_limit_mb` |
| --- | --- | --- | --- | --- |
| `>= 14336` | `4500 5000` | `229376 196608` | `2048` | `10240` |
| `>= 10240` | `3600 4000` | `196608 163840` | `1536` | `8192` |
| `>= 7168` | `2800 3200` | `163840 131072` | `1024` | `6144` |
| `< 7168` | `1800 2200` | `114688 98304` | `512` | `4096` |

ERM 路径使用固定目标：

| 参数 | 写入值 |
| --- | --- |
| `vm_swappiness` | `180` |
| `direct_swappiness` | `140` |
| `swapd_swappiness` | `200` |
| `kswapd_swappiness1` | `4096 140` |
| `kswapd_swappiness2` | `2048 180` |
| `direct_swappiness1` | `2048 140` |
| `thrashing_limit_pct` | `30` |

## 状态计算

- ZRAM 使用率：`/proc/swaps 已用 KiB × 100 / ZRAM 总 KiB`。
- 压缩率：`mm_stat.orig_data_size × 100 / mm_stat.compr_data_size`。
- 额外开销：`max(mm_stat.mem_used_total - mm_stat.compr_data_size, 0)`。
- 额外开销比例：`额外开销 × 100 / mm_stat.compr_data_size`。
- HybridSwap 已用量：`hybridswap_meminfo` 的 `ESU_C / 1024`，单位 MiB。
- HybridSwap 容量：`hybridswap_meminfo` 的 `EST / 1024`，单位 MiB。

回收预算先按压缩率缩放：

| 压缩率 | 缩放 |
| --- | --- |
| `>= 300%` | `125%` |
| `>= 240%` | `115%` |
| `>= 180%` | `100%` |
| `>= 150%` | `85%` |
| `< 150%` | `70%` |

快速回读反馈再乘以 `100%`、`75%`、`55%` 或 `35%`。最终回收预算为：

```text
reclaim_scale = compression_scale × feedback_scale / 100
```

## 写入节点

| 节点 | 写入内容 | 作用 |
| --- | --- | --- |
| `/proc/sys/vm/swappiness` | `180` | 提高匿名页进入交换的优先级 |
| `/proc/oplus_mem/swappiness_para` | `vm_swappiness=180`、`direct_swappiness=140`、`swapd_swappiness=200` | 同步 OPlus 内存参数 |
| `/proc/oplus_mem/dynamic_swappiness` | `140 4096 180 2048` | 设置两级 kswapd 动态 swappiness |
| `/dev/memcg/memory.erm_avail_buffer` | 表格中的低、高水位 | 设置 ERM 回收窗口 |
| `/sys/kernel/oplus_mm/erm/wmarks` | 表格中的 direct、min 水位 | 设置 ERM 水位 |
| `/sys/kernel/oplus_mm/erm/kswapd_swappiness1` | `4096 140` | 第一档 kswapd 参数 |
| `/sys/kernel/oplus_mm/erm/kswapd_swappiness2` | `2048 180` | 第二档 kswapd 参数 |
| `/sys/kernel/oplus_mm/erm/direct_swappiness1` | `2048 140` | direct reclaim 参数 |
| `/sys/kernel/oplus_mm/erm/thrashing_limit_pct` | `30` | 限制抖动比例 |
| `/dev/memcg/memory.zram_used_limit_mb` | 按内存容量计算 | 设置 ZRAM 使用上限 |
| `/sys/block/zramX/hybridswap_zram_increase` | 按内存容量计算 | 增加 HybridSwap 可使用的 ZRAM 空间 |

节点不存在或不可写时跳过该项。

## 动作调用

默认检查周期：

- 亮屏且上次无动作：`45` 秒。
- 息屏且上次无动作：`90` 秒。
- 上次执行过动作：`30` 秒。

动作顺序：

1. 读取节点并应用 ERM/HybridSwapD/通用 VM 参数。
2. 更新快速回读反馈和回收预算。
3. 息屏、ZRAM 使用率达到 `70%`、温度不高于 `48°C`，且距离上次重压缩至少 `1800` 秒时，向 `/sys/block/zramX/idle` 写入 `600`，再向 `recompress` 写入 `type=idle`。
4. ERM 路径在息屏时检查 compact；`mem_used_total - compr_data_size >= 256 MiB`、开销比例达到 `12%`、温度不高于 `55°C`，且距离上次 compact 至少 `1800` 秒时，向 `/sys/block/zramX/compact` 写入 `1`。
5. 前面没有动作时执行 HybridSwap 主动写回或 HybridSwapD 匿名页回收。
6. 连续三次写回或回收失败后暂停对应动作 `900` 秒。

