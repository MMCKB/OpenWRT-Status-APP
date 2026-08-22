# Android 平台集成实现依据

**日期：** 2026-08-22  
**范围：** Rust-Dev 分支的 Android 13+ 单色主题图标与预测性返回手势支持。

Dioxus 0.7 的文档确认 Android 打包由 `dx` 使用 Android SDK、NDK 和 Gradle 生成工程后完成。[1] 但 Dioxus 的公开问题记录显示，在 0.7.x 中仅设置 `Dioxus.toml` 图标并不能稳定替换 Android 打包输出的启动图标；社区复现需要在生成的 Android 工程中覆盖资源。[2] 因此，本项目会使用版本控制的 Android 资源覆盖层与可重复的打包脚本，在每次生成后注入自适应图标资源和 Manifest 设置，而不会手工修改 `target/` 后遗忘变更。

| 目标 | 已验证约束 | 实现策略 |
| --- | --- | --- |
| Android 13+ 主题图标 | 单靠 Dioxus `Dioxus.toml` 的 `icon` 配置在 Android 0.7.x 输出中存在已记录的不稳定问题。 | 将前景、背景和单色层作为版本控制的资源覆盖到生成工程；自适应图标 XML 显式声明 `<monochrome>` 层。 |
| 预测性返回 | Android 13+ 使用新的系统 Back API；应用或 Activity 使用 `android:enableOnBackInvokedCallback="true"` 时可以参与系统预测性返回动画。[3] | 生成后补丁在 application 节点启用该标记；无自定义返回拦截时系统负责根 Activity 的返回到桌面预览。后续 Dioxus 页面路由接入时，仅在有可返回栈或未保存表单时启用专用回调。 |
| 可维护打包 | Dioxus Android 工程属于构建输出，不能手工维护。 | 打包脚本必须每次从生成目录复制资源、验证 XML/Manifest 关键标记，再执行 Gradle AAB 打包。 |

> **设计界限：** 主题图标和系统预测性返回依赖 Android 资源与 Manifest；这些是纯 Rust 用户界面之外必要的 Android 打包元数据，不引入 Kotlin/Compose 或不稳定预览依赖。

## 参考资料

[1]: https://dioxuslabs.com/learn/0.7/tutorial/bundle/ "Dioxus 0.7 Bundling 文档"
[2]: https://github.com/DioxusLabs/dioxus/issues/3685 "Dioxus Android App Icon Configuration Not Working"
[3]: https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture "Android Developers: Predictive back gesture"
