# Corona v4.3.6

- 自定义颜色改为色调预设+滑条，并优化主题切换过渡
- 完善主题切换动画与强调色自定义
- 应用 ZRAM 后校验算法/大小/swappiness/zstd 是否生效
- Swap 面板展示 I/O 与全部 Swap 设备列表
- WebUI 展示 OPLUS HybridSwap 运行状态指标
- ZRAM 面板展开时自动刷新 mm_stat 运行指标
- 支持 ZSTD compression_level 调节并在应用 ZRAM 时写入
- 支持 ZRAM multi_comp 三级重压缩算法配置与应用
- 从 Zram_WebUI 借鉴 mm_stat/bd_stat 状态指标，ZRAM 面板展示压缩比/物理占用/回写读写
- release: v4.3.6
- 优化主卡片动画并适配模块字体
- 优化模块设置联动与 WebUI 性能体验
