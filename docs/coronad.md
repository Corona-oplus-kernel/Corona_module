# coronad 技术说明

## 作用

`coronad` 负责前台进程识别、线程分类、CPU 亲和性、线程调度参数、PSI 内存压力响应，以及 IRQ、网络队列、UFS、GPU 和块设备队列的动态调整。

## 输入节点

| 数据 | 节点或接口 | 用途 |
| --- | --- | --- |
| 前台进程 | `/dev/cpuset/top-app/cgroup.procs` | 获取 top-app 进程 PID |
| 前台线程 | `/dev/cpuset/top-app/tasks` | top-app cgroup 的线程列表回退 |
| cgroup v2 前台进程 | `/sys/fs/cgroup/top-app/cgroup.procs` | cgroup v2 设备前台进程识别 |
| 进程名称 | `/proc/PID/cmdline` | 从 PID 提取包名 |
| 线程名称 | `/proc/PID/task/TID/comm` | 线程类型分类 |
| 线程 CPU 时间 | `/proc/PID/task/TID/stat` | 计算线程负载变化 |
| 在线 CPU | `/sys/devices/system/cpu/online` | 生成可用 CPU 集合 |
| cpufreq policy | `/sys/devices/system/cpu/cpufreq/policy*/` | 按频率簇识别能效核和性能核 |
| CPU capacity | `/sys/devices/system/cpu/cpuX/cpu_capacity` | 识别延迟敏感核心集合 |
| 内存 PSI | `/proc/pressure/memory` | 计算动态 swappiness |
| CPU PSI | `/proc/pressure/cpu` | 降低非主线程的 CPU 分类 |
| IO PSI | `/proc/pressure/io` | 限制块设备预读和请求队列 |
| 中断统计 | `/proc/interrupts` | 计算 UFS、Wi-Fi 和移动网络 IRQ 活跃度 |
| 网络流量 | `/proc/net/dev` | 计算网络队列活跃度 |
| 网络状态 | `/sys/class/net/IFACE/operstate` | 判断接口是否在线 |
| 块设备统计 | `/proc/diskstats` | 计算存储吞吐和 IO 类型 |
| 温度 | `/sys/class/thermal/thermal_zone*/temp` | 计算运行模式 |
| 屏幕状态 | `/sys/class/backlight/*/brightness` | 计算息屏降级模式 |
| 省电模式 | `settings get global low_power` | 计算省电降级模式 |

前台 cgroup 无有效包名时，使用 `dumpsys activity activities`，再回退到 `dumpsys window windows`。

## CPU 拓扑计算

1. 读取 `policy*/related_cpus`；为空时读取 `affected_cpus`。
2. 每个 policy 读取 `cpuinfo_max_freq`；读取失败时使用 `scaling_max_freq`。
3. policy 按最大频率升序排序。
4. 最低频 policy 作为 `efficiency` 集合，最高频 policy 作为 `performance` 集合。
5. `balanced` 默认包含全部在线 CPU。
6. `cpu_capacity` 大于最小 capacity 的 CPU 组成 `latency` 集合。
7. 没有 `cpu_capacity` 时，`latency` 使用除最低频 policy 外的 CPU。
8. 仍无法分组时，取在线 CPU 的后半部分作为 `latency`。

该计算不依赖固定核心编号，可适配不同核心数量和不同 policy 拓扑。

## 前台进程识别

从 top-app cgroup 读取 PID 后，读取 `/proc/PID/cmdline`，并截断进程名中的 `:service` 后缀。以下名称不会作为应用包名：

- `android`
- `com.android.shell`
- `me.weishu.kernelsu`

包含 `.` 的其它进程名作为前台包名。

## 线程分类

名称以 `Binder:`、`HwBinder:`、`binder_` 开头，或包含 `binder thread` 的线程单独处理：

- 前台应用 Binder 线程使用 `latency` CPU 集合。
- 非前台 Binder 线程使用 `efficiency` CPU 集合。
- `warm` 模式把 `latency` 降为 `balanced`。
- `severe`、`saver` 和 `screen_off` 模式把 `latency` 降为 `efficiency`。

主线程、包名同名线程，以及名称包含下列关键字的线程归入 `performance`：

- `RenderThread`
- `UIThread`
- `GLThread`
- `GameThread`
- `RHIThread`
- `UnityMain`
- `UE4`
- `GPU completion`
- `HWUITask`
- `Vulkan`

名称包含下列关键字的线程归入 `efficiency`：

- `Finalizer`
- `ReferenceQueue`
- `Heap Task Daemon`
- `Profile Saver`
- `Signal Catcher`
- `JDWP`
- `JIT thread pool`

其它线程进入 `balanced` 或指定的默认分类。

## 线程负载计算

从 `/proc/PID/task/TID/stat` 读取：

```text
cpu_ticks = utime + stime
delta = current_cpu_ticks - previous_cpu_ticks
```

负载分数范围为 `-4..4`：

| 条件 | 分数变化 |
| --- | --- |
| `delta >= 20` | `score + 1`，最大为 `4` |
| `delta <= 1` | `score - 1`，最小为 `-4` |
| `1 < delta < 20` 且分数为正 | `score - 1` |
| `1 < delta < 20` 且分数为负 | `score + 1` |

- 主线程或 `score >= 2`：`performance`。
- `score <= -3`：`efficiency`。
- 其它情况使用线程名称分类结果。

TID 对应的 `start_time` 变化时视为新线程，旧负载分数不会复用。

## 运行模式

运行模式按以下优先级计算：

1. 所有 backlight 的 `brightness` 均为 `0`：`screen_off`。
2. `low_power=1`：`saver`。
3. 最高 thermal zone 温度达到严重阈值：`severe`。
4. 温度达到预热阈值：`warm`。
5. 其它情况：`normal`。

分类降级关系：

| 模式 | 分类变化 |
| --- | --- |
| `normal` | 不变 |
| `warm` | `performance -> balanced` |
| `severe`、`saver`、`screen_off` | `performance/balanced -> efficiency` |

## CPU 亲和性调用

CPU 列表转换为字节位图：

```text
mask[cpu / 8] |= 1 << (cpu % 8)
```

然后调用：

```c
sched_setaffinity(tid, mask_size, mask)
```

亲和性只在目标分类或 CPU 集合变化时重新写入。

## 手动线程调度接口

| 功能 | 系统调用或节点 | 作用 |
| --- | --- | --- |
| nice | `setpriority(PRIO_PROCESS, tid, value)` | 调整普通调度优先级 |
| IO 优先级 | `ioprio_set` syscall | 设置 IO class 和 level |
| CPU 亲和性 | `sched_setaffinity` | 限制线程可运行 CPU |
| 调度策略 | `sched_setscheduler` | 设置 `other`、`fifo`、`rr`、`batch` 或 `idle` |
| cpuset | `/dev/cpuset/GROUP/tasks` | 把 TID 加入指定 cpuset |
| OPlus uclamp | `/proc/oplus_qos_sched/qos_task_uclamp` | 按 TID 写入 uclamp min/max |
| 通用 uclamp | `/dev/cpuctl/GROUP/cpu.uclamp.min`、`cpu.uclamp.max` | 设置 cgroup uclamp |
| WALT boost | `/proc/sys/walt/sched_per_task_boost` | 开启逐任务 boost |
| WALT affinity | `/proc/sys/walt/task_reduce_affinity` | 关闭 WALT 自动缩减 affinity |
| WALT pipeline | `/proc/sys/walt/sched_pipeline_special` | 开启特殊流水线调度 |

精确线程名规则优先级为 `10000 + 名称长度`；通配符规则优先级为 `1000 + 非通配符字符数`。规则按优先级降序匹配。

## PSI swappiness 计算

从 `/proc/pressure/memory` 的 `some avg10` 读取压力值。

| 模式 | 中等阈值 | 严重阈值 | 中等目标 | 严重目标 | 检查周期 |
| --- | --- | --- | --- | --- | --- |
| sensitive | `0.50` | `2.00` | `170` | `200` | `4s` |
| balanced | `1.00` | `5.00` | `160` | `200` | `6s` |
| conservative | `2.00` | `8.00` | `140` | `180` | `8s` |

```text
avg10 >= critical  -> critical_target
avg10 >= moderate  -> moderate_target
其它                -> baseline
```

目标写入：

- `/proc/sys/vm/swappiness`
- `/dev/memcg/apps/memory.swappiness`

停止压力控制时恢复首次读取的 swappiness。

## CPU 与 IO PSI 联动

CPU 和 IO PSI 每 `2` 秒读取一次 `some avg10`。

CPU 压力等级：

| `cpu avg10` | 等级 | 非主线程变化 |
| --- | --- | --- |
| `< 35` | `0` | 不调整 |
| `35..70` | `1` | `performance -> balanced` |
| `>= 70` | `2` | `performance/balanced -> efficiency` |

应用主线程不受 CPU PSI 降级影响。

IO 压力等级：

| `io avg10` | 等级 | `read_ahead_kb` 上限 | `nr_requests` 上限 |
| --- | --- | --- | --- |
| `< 2` | `0` | 使用负载分类结果 | 使用负载分类结果 |
| `2..10` | `1` | `256` | `128` |
| `>= 10` | `2` | `128` | `64` |

## IRQ 与网络队列

每 `2` 秒读取 `/proc/interrupts`，只处理名称包含 `ufshcd`、`wlan`、`wifi`、`ipa` 或 `rmnet` 的 IRQ。

- UFS IRQ：两次 `/proc/diskstats` 采样的扇区差达到 `8192` 时判定繁忙。
- 网络 IRQ：两次 IRQ 计数差达到 `128` 时判定繁忙。
- 从前台主线程 `/proc/PID/stat` 读取当前 CPU，从 `/proc/PID/status` 读取 `Cpus_allowed_list`。
- 繁忙 IRQ 优先使用 `latency` 集合中不属于主线程 affinity 的 CPU，并排除主线程当前 CPU。
- 如果排除后没有可用 CPU，则回退到原始 `latency` 集合。
- 目标写入 `/proc/irq/IRQ/smp_affinity_list`。
- `screen_off`、`saver` 或 `severe` 模式写入 `efficiency` CPU 集合。
- 连续三轮空闲后恢复原始 affinity。

网络流量计算：

```text
bytes = receive_bytes + transmit_bytes
delta = current_bytes - previous_bytes
```

`delta >= 65536` 时，把活动接口的 `queues/*/rps_cpus` 和 `xps_cpus` 写入 `latency` CPU 位掩码；受限模式写入 `efficiency` 位掩码。

## UFS 写入管理

从 `/sys/devices/platform` 向下搜索同时包含 `auto_hibern8` 和 Write Booster 节点的 UFS 目录。

输入节点：

- `attributes/wb_avail_buf`
- `attributes/wb_cur_buf`
- `wb_on`
- `enable_wb_buf_flush`
- `auto_hibern8`

写入类型按两秒采样计算：

```text
average_write_sectors = write_sectors / write_ops
```

- `write_sectors < 8192` 或没有写操作：空闲。
- `write_ops >= 64` 且平均请求不超过 `8` 扇区：小块随机写。
- `write_sectors >= 32768` 且平均请求不少于 `32` 扇区：连续大写。
- 其它情况：混合写入。

只有连续大写且运行模式为 `normal` 或 `warm` 时：

- `wb_on=1`
- `enable_wb_buf_flush=0`
- `auto_hibern8=0`
- 保持三轮后恢复

小块随机写会立即取消尚未结束的 boost，并恢复 Write Booster、flush 和 hibern8 的原始值。

`wb_avail_buf <= 2` 时执行 `enable_wb_buf_flush=1`。息屏时恢复 Write Booster 和 hibern8 的原始值。

## GPU 瞬时响应

使用 `/sys/class/kgsl/kgsl-3d0`：

- 忙碌率优先读取 `gpu_busy_percentage`。
- 不存在时读取 `gpubusy`，计算 `busy × 100 / total`。
- 目标最低频率为不低于 `max_freq × 40%` 的第一档可用频率。
- 忙碌率达到 `25%` 时，把 `devfreq/min_freq` 提升到目标频率并保持三轮。
- `severe`、`saver` 或 `screen_off` 模式恢复原始最低频率。

## 块设备队列

每 `2` 秒读取 `/proc/diskstats`，仅处理名称为 `sdX` 且存在以下节点的设备：

- `/sys/block/sdX/queue/read_ahead_kb`
- `/sys/block/sdX/queue/nr_requests`

设备满足 `总操作数 >= 64` 或 `总扇区数 >= 16384` 时判定活跃。

| IO 类型 | 判定 | `read_ahead_kb` | `nr_requests` |
| --- | --- | --- | --- |
| 顺序读 | 读扇区大于写扇区两倍，且读扇区 `>= 32768` | 限制到 `1024..2048` | 限制到 `192..256` |
| 随机读 | 读操作 `>= 32`、读扇区 `<= 65536`、平均每次读取 `< 64` 扇区 | 最大 `128` | 最大 `64` |
| 写入 | 写扇区不少于读扇区，且写扇区 `>= 8192` | 最大 `256` | 限制到 `192..256` |
| 混合 | 其它活跃情况 | 最大 `256` | 保持原值 |

设备空闲或运行模式受限时恢复原始队列参数。

## eBPF 接口

在 AArch64 上使用 `bpf` syscall：

- `BPF_MAP_CREATE`
- `BPF_PROG_LOAD`
- `BPF_RAW_TRACEPOINT_OPEN`
- `BPF_MAP_GET_NEXT_KEY`
- `BPF_MAP_DELETE_ELEM`

程序挂接 `sched_process_exec` raw tracepoint，把新执行进程的 PID 写入 BPF hash map。主循环读取 PID 后立即扫描对应进程线程；attach 失败时继续使用 `/proc` 周期扫描。

## 运行周期与恢复

主循环周期使用线程扫描间隔，范围 `250..10000 ms`。其它任务按累计时间执行：

- 环境状态：`10s`
- 省电模式：`30s`
- 保护进程刷新：`30s`
- IRQ、网络、UFS 和 IO：`2s`
- GPU：`1s`

停止时恢复 IRQ affinity、网络 RPS/XPS、UFS、GPU、块设备队列和 swappiness 的首次读取值。

## 状态输出

运行状态包含：

- 前台包名和识别来源
- efficiency、balanced、performance 和 latency CPU 集合
- CPU/IO PSI 数值、压力等级与运行模式
- eBPF attach 状态及错误阶段
- IRQ 实际目标 CPU、管理数量和繁忙数量
- UFS 写操作数、写扇区和平均请求大小
- GPU 忙碌率、最低频率和 IO 队列参数
- 已扫描线程数、亲和性成功/失败次数
- 前台变化次数、重载次数和循环次数
