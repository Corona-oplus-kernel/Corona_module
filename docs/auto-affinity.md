# Corona Auto Affinity

Corona Auto Affinity 是独立实现的前台应用线程亲和性功能，不包含第三方模块的代码、二进制或规则资产。

配置文件位于 `/data/adb/modules/Corona/config/auto_affinity.conf`。

```ini
enabled=0
ebpf=1
default_class=balanced
efficiency_cpus=
balanced_cpus=
performance_cpus=
exclude_packages=
scan_interval_ms=1000
load_learning=1
thermal_control=1
thermal_warm_c=65
thermal_severe_c=75
```

- `enabled`：设为 `1` 启用。
- `default_class`：未命中已知线程类型时使用 `efficiency`、`balanced` 或 `performance`。
- 三个 `*_cpus` 留空时，根据 cpufreq policy 的最高频率自动识别能效核与性能核。
- `exclude_packages`：逗号分隔的排除包名。
- `scan_interval_ms`：前台线程增量扫描间隔，范围 250–10000 毫秒。
- `ebpf`：尝试 attach `sched_process_exec` raw tracepoint；失败时自动回退普通扫描。
- `load_learning`：根据线程实际 CPU 时间进行带迟滞的动态分级。
- `thermal_control`：根据温度、省电模式和息屏状态自动降级核心分配。
- `thermal_warm_c` / `thermal_severe_c`：温控降级阈值。

手动配置的 `thread_priority.conf` 优先级更高。只要某个包存在手动线程规则，自动亲和性会跳过该包。

```sh
/data/adb/modules/Corona/app_policy.sh auto-affinity status
/data/adb/modules/Corona/app_policy.sh auto-affinity detect
/data/adb/modules/Corona/app_policy.sh auto-affinity enable
/data/adb/modules/Corona/app_policy.sh auto-affinity disable
/data/adb/modules/Corona/app_policy.sh auto-affinity apply com.example.game
```

该功能只调用 `taskset` 设置线程 affinity，不修改 cpuset、uclamp、nice、IO 优先级或实时调度策略。
