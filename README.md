# Corona

Corona 是一款提供直观 WebUI 控制台的 Magisk/KernelSU 模块，让用户能够轻松管理 ZRAM、Swap、虚拟内存、IO 调度器、CPU 调频器、TCP 拥塞控制等核心系统参数，优化设备性能与响应速度。

- **Magisk 用户**：需要借助支持 WebUI 的第三方管理器

## 配置文件

所有配置会自动保存至 `/data/adb/modules/Corona/config/` 目录：

配置文件说明

配置文件 用途
zram.conf ZRAM 相关配置
swap.conf Swap 文件配置
vm.conf 虚拟内存参数
kernel.conf 内核特性配置（LRU/THP/KSM等）
le9ec.conf LE9EC 内存保护配置
io_scheduler.conf IO 调度器配置
cpu_governor.conf CPU 调频器配置
cpu_hotplug.conf CPU 核心开关配置
freq_lock.conf CPU 频率锁定配置
process_priority.conf 进程优先级规则
tcp.conf TCP 拥塞控制配置
custom_scripts.b64 自定义脚本配置
user_scripts.sh 合并后的用户脚本
autoclean.conf 自动清理设置
lmk.conf LMK (Low Memory Killer) 优化开关
device.conf 后台限制开关
reclaim.conf 禁用激进回收开关
kswapd.conf kswapd 优化开关
protect.conf 关键进程保护开关
fstrim.conf 开机 fstrim 开关

说明：所有配置会在每次开机后自动应用。

### 「系统优化」配置卡片说明（逻辑来自scene附加模块2）

| 功能 | 说明 |
|------|------|
| LMK 优化 | 根据RAM大小自动配置 minfree_levels，小米设备额外配置 persist.sys.minfree_* |
| 解锁后台限制 | max_cached_processes=32768，禁用幽灵进程监控 |
| 禁用激进回收 | 禁用 DAMON/process_reclaim/mi_reclaim，OPLUS设备禁用THP |
| kswapd 优化 | 将 kswapd 移至前台 cpuset，设置 uclamp.latency_sensitive |
| 关键进程保护 | 为 SystemUI/Launcher/surfaceflinger 创建 swappiness=0 的 memcg 组 |
| 开机 fstrim | 开机时执行 fstrim |

## 目录结构

```
Corona/
├── META-INF/                    # 安装脚本
├── webroot/                     # WebUI 资源
│   ├── index.html              # 主页面
│   ├── script.js               # 控制逻辑
│   ├── style.css               # 样式表
│   └── images/                 # 图片资源
├── module.prop                  # 模块信息
├── service.sh                   # 开机服务脚本
├── zram.ko                      # ZRAM 内核模块
└── zsmalloc.ko                  # zsmalloc 内核模块
```

## 更新日志

### v3.4.2
- 优化ui

### v3.4.1
- 拖动飞行时增加重力效果
- 优化模块设置配置卡片折叠展开动画
- 优化ui

### v3.4.0
合并scene附加模块2

### v3.3.17
- 修改配置页面模块卡片样式
- 卡片默认折叠
- 新增模块设置中的卡片显示控制
- 移除选择性重置功能
- 修复主页切换后滚动问题

### v3.3.0
- 新增 Swap 文件管理
- 新增虚拟内存参数调整
- 新增内核特性配置（MGLRU、THP、KSM、内存压缩）
- 新增自定义脚本功能（支持多脚本、分类管理）
- 新增自动清理缓存功能
- 新增 ZRAM 回写控制
- 优化配置保存逻辑

### v3.2.32
- 优化 UI & 彩蛋逻辑

### v3.2.29
- 重置模块后恢复模块描述

### v3.2.28
- 修复无法重置设置

### v3.2.27
- 加入 CPU 频率锁定
- 加入系统状态监控
- 主题切换
- 支持卡片折叠
- 优化 WebUI

### v3.2.14
- 优化 UI

### v3.2.13
- 优化 UI
- 修复重置设置无法使用

### v3.2.11
- 移除 CPU 亲和性修改
- 加入进程优先级修改
- 优化 UI

### v3.2.02
- 初步完成 CPU 亲和性设置
- 优化 UI

### v3.1.84
- 每个 CPU 编号只显示一次，避免重复显示
- 在线核心数不能超过架构总数
- 新增 CPU 架构信息显示
- 首页处理器卡片显示集群架构信息
- 新增 LE9EC 内存保护功能模块
- 支持配置 vm.anon_min_kbytes（匿名页硬保护）
- 支持配置 vm.clean_low_kbytes（文件页软保护）
- 支持配置 vm.clean_min_kbytes（文件页硬保护）
- 电池卡片点击显示详细电池信息
- 运行内存卡片点击显示 UFS 健康信息
- 存储空间卡片点击显示内存清理功能
- 新增 5 种清理模式
- 新增 F2FS GC 垃圾回收功能
- 清理进度条动画显示
- 清理完成显示释放内存量
- 新增重置所有设置功能
- 优化核心识别逻辑

### v3.1.76
- 优化动画
- 加入作者和其他修改

### v3.1.71
- 修复关闭 CPU 后重启，WebUI 识别不到已关闭的 CPU

### v3.1.69
- 修改前端为类 MIUI 风格

### v3.1.61
- 完成模块基本功能

## 作者

Frost_Bai
