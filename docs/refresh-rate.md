# 刷新率控制

## 模式读取

`coronad refresh-scan` 调用：

```sh
/system/bin/dumpsys SurfaceFlinger
```

从 SurfaceFlinger 输出读取显示模式 ID、分辨率和刷新率。当前模式读取 `activeMode`，并由 `refresh-scan` 以 `current=<模式ID>` 一并返回，不按固定 ID、CPU 架构或设备型号推断。

首次扫描会把 SurfaceFlinger 已公布的模式签名写入隐藏基线 `.refresh_rate.baseline`。后续扫描按分辨率和刷新率签名对比：基线内模式为原生档位，新增模式为候选超频档位。

模式记录格式：

```text
模式ID:宽度:高度:刷新率:native|overclock:基础模式:切换顺序
```

类型、基础模式和切换顺序由 `coronad refresh-scan` 自动生成。每组超频分辨率选择最高刷新率的原生模式作为基础模式，超频档位按刷新率和模式 ID 自动排序。切换时先回到基础模式，再按自动顺序经过中间模式，避免跨模式直接切换。

WebUI 初始化时扫描一次，前台可见期间每 20 秒复查一次。只有模式列表发生变化时才重写 `refresh_rate_modes.conf` 并通知守护进程重载，扫描失败时继续沿用上一次有效列表。

跨分辨率选择使用 `coronad refresh-preview <模式ID>` 临时应用。命令写入一次性预览状态并启动独立的 15 秒回滚进程；WebUI 只有调用 `refresh-confirm <令牌>` 后才把目标档位写入 `refresh_rate.conf`。取消、超时或 WebUI 进程退出均调用或触发 `refresh-cancel`，恢复预览前的原生档位。

## 模式应用

切换前临时放宽 Android 刷新率范围：

```sh
settings put system peak_refresh_rate 240.0
settings put system min_refresh_rate 10.0
```

随后调用 SurfaceFlinger：

```sh
service call SurfaceFlinger 1035 i32 <模式ID>
```

守护进程首次启用时保存 `peak_refresh_rate` 和 `min_refresh_rate` 原值，关闭功能或退出时恢复。相同目标模式不会重复调用。

## 应用策略

应用规则使用包名映射显示模式 ID。前台包名直接复用 coronad 的系统前台识别结果，不启动额外轮询进程。

守护循环只在以下情况计算目标模式：

- 前台应用发生变化
- 屏幕从熄灭恢复亮屏
- 配置重新加载

存在应用规则时优先使用应用模式；应用退出后恢复全局模式，未设置全局模式时交还系统。熄屏时不切换显示模式。开关、全局档位和应用档位均在操作后立即持久化，不依赖额外保存按钮。

## 状态统计

`coronad status` 和 `coronad web-status` 输出支持状态、当前模式、目标模式、成功次数和失败次数。WebUI 只读取这些状态，不重复执行 SurfaceFlinger 查询。
