# Corona
#只是一个一个一个一个模块

#Corona 是一款提供直观的 WebUI 控制台，让Corona内核用户能够轻松管理 ZRAM、IO 调度器、CPU 调频器和 TCP 拥塞控制等核心系统参数，优化设备性能与响应速度。

- 设备型号与处理器信息展示
- 运行内存实时监控（已用/可用）
- 交换分区 / ZRAM 使用状态
- 存储空间使用情况
- 电池电量、容量与温度
- CPU 温度实时监测
- 系统版本与内核版本信息

#Magisk 用户
- 需要借助支持 WebUI 的第三方管理器

所有配置会自动保存至 `/data/adb/modules/Corona/config/` 目录：

| 配置文件 | 用途 |
|---------|------|
| `zram.conf` | ZRAM 相关配置 |
| `io_scheduler.conf` | IO 调度器配置 |
| `cpu_governor.conf` | CPU 调频器配置 |
| `tcp.conf` | TCP 拥塞控制配置 |
| `cpu_hotplug.conf` | CPU 核心开关配置 |

配置会在每次开机后自动应用。

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

### v3.1.76
- 优化动画
- 加入作者和其他修改

### v3.1.71
- 修复关闭CPU后重启，webui识别不到已经关闭的cpu

### v3.1.69
- 修改前端为类miuix

### v3.1.61
- 完成模块基本功能