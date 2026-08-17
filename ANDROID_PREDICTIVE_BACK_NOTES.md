# Android 预测性返回实现依据

本轮修复参考 Android Developers 官方文档：

- [Add support for the predictive back gesture](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)
- [Add support for predictive back animations](https://developer.android.com/guide/navigation/custom-back/support-animations)

## 关键要求

1. 应用应启用 `android:enableOnBackInvokedCallback="true"`，以获得 Android 13+ 的预测性返回系统动画。
2. 不应以 `Activity.onBackPressed()` 或 `KeyEvent.KEYCODE_BACK` 拦截返回；自定义页面行为应通过 AndroidX `OnBackPressedDispatcher` / `OnBackPressedCallback` 或平台 `OnBackInvokedCallback` 实现。
3. 回调必须仅在存在可返回的界面状态时启用；根页面无可返回状态时不应消费事件，使系统能够展示返回主屏、跨任务或跨 Activity 预览动画。
4. 多个回调按后进先出顺序生效，因此弹窗、编辑状态和页面栈的回调应彼此独立，并在不再需要时禁用。

本项目使用 Expo Router / React Navigation；本轮将核查其 Android Manifest、Activity 配置与 JavaScript 返回监听，避免根页面和工具页无条件消费系统返回事件。
