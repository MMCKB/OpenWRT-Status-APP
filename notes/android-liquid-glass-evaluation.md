# AndroidLiquidGlass 评估记录

调研日期：2026-08-18

用户建议的仓库是 `Kyant0/AndroidLiquidGlass`，当前以 Compose Multiplatform 的 **Backdrop** 库形式发布，依赖坐标为 `io.github.kyant0:backdrop:<version>`。

该库通过复制背景（backdrop）并在前景层施加效果来实现液态玻璃。仓库未提供 React Native 组件；现有 Expo SDK 54 应用若要直接使用它，需要新增 Android Kotlin/Jetpack Compose 原生视图并通过 React Native ViewManager 桥接。当前项目已包含 Kotlin 原生 SSH 模块，因此可以采用同一原生工程接入方式，但应把可用范围控制在 Android 专用的独立原生组件。

推荐的首个落点是底部导航容器或工具页中的局部操作面板，而不是整页背景：这既与该库提供的 Glass Bottom Bar 示例一致，也能避免 React Native 页面与 Compose 绘制层之间无法自动共享完整背景快照的问题。

官方底部栏示例使用 `rememberLayerBackdrop()` 创建背景图层，再将主内容应用 `Modifier.layerBackdrop(backdrop)`；前景底部容器调用 `Modifier.drawBackdrop(...)`，配合 `vibrancy()`、`blur(...)`、`lens(...)` 和半透明 surface 绘制。该模式要求主内容与玻璃容器同在 Compose 层级中，不能直接对 React Native 的现有 `Tabs` 视图树应用。因此本项目不能在不改造导航宿主的情况下让库真实采样 React Native 页面内容；安全的最小接入应是 Compose 原生子视图内的局部液态玻璃操作面板，或在后续专门重构 Android 原生导航容器时才替换标签栏。

来源：

- https://github.com/Kyant0/AndroidLiquidGlass
- https://kyant.gitbook.io/backdrop
- https://kyant.gitbook.io/backdrop/tutorials/glass-bottom-bar
