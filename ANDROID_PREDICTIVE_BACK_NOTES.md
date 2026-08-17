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

## Expo SDK 54 兼容性结论

在 Expo SDK 54 的标准 Expo Router / React Navigation 导航栈中，React Navigation 官方文档明确说明尚未支持 Android 的预测性返回预览动画。若强制开启 `enableOnBackInvokedCallback`，系统的边缘返回可能无法正确委派给现有导航器。

因此，本项目应采用官方推荐的兼容路径：保留标准导航栈，并将 `android:enableOnBackInvokedCallback` / `android.predictiveBackGestureEnabled` 设为 `false`，使 Android 边缘返回手势以兼容模式可靠地触发 Expo Router 的页面返回。该方式提供可用的返回手势，但不提供 Android 13+ 的预览动画。

Expo Router 的 `ExperimentalStack` 才提供原生预测性返回支持，但该 API 从 Expo SDK 56 起才以 alpha 形式提供，不能安全地混入本项目 SDK 54 的标准 Stack。

### 参考

- [Android Developers：Add support for the predictive back gesture](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)
- [React Navigation：Opting-out of predictive back on Android](https://reactnavigation.org/docs/getting-started/#opting-out-of-predictive-back-on-android)
- [Expo Router：Experimental Stack](https://docs.expo.dev/versions/latest/sdk/router/experimental-stack/)
