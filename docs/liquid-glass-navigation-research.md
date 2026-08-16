# 液体玻璃导航研究笔记

## React Navigation 开源讨论

来源：[react-navigation/react-navigation Discussion #13088](https://github.com/react-navigation/react-navigation/discussions/13088)

- 讨论指出：真正的原生 Liquid Glass 会在选中项切换时呈现随几何变化的动画气泡，并对背后内容产生放大效果；纯 Reanimated/模糊层方案只能做跨平台近似。
- 对当前 Expo/React Navigation 项目，保留自定义 Tab 栏适合 Android、Web 和旧版 iOS 的一致性，但应避免将不透明色板覆盖在模糊层之上。
- 用于本次重构的原则：以透明 BlurView 为主体；只保留低透明度折射洗色；通过多层边缘高光、选中项内层和微弱动态光带模拟玻璃体积；保持场景底部避让由导航器承担。

## 已搜索的候选参考

- [@ventur8/react-native-liquid-glass-tab-bar](https://www.npmjs.com/package/@ventur8/react-native-liquid-glass-tab-bar)：面向 React Native 与 Expo Router 的浮动 Liquid Glass Tab Bar。
- [Expo Router Native Tabs 文档](https://docs.expo.dev/router/advanced/native-tabs/)：原生 iOS 路径可利用系统视觉，但不适合作为当前 Android/Web 统一实现的唯一方案。

## expo-glass-tabs 仓库

来源：[davidmokos/expo-glass-tabs](https://github.com/davidmokos/expo-glass-tabs)

该仓库采用“视觉结构与交互运动分离”的方式：导航结构交由 Expo Router，玻璃几何、模糊材质与高光由原生视图承担，滑动高亮只使用 UI 线程的 transform 动画。当前项目不引入其 iOS 专用原生实现，因为还需兼容 Android 与 Web；但会吸收其三项可迁移原则，即不在玻璃层上铺设不透明底色、只对滑动高亮使用 transform 动画、让主玻璃轮廓和高光边缘保持同一椭圆几何。

## 长按拖动交互参考

来源：[Expo 官方手势教程](https://docs.expo.dev/tutorial/gestures/)

- 使用 React Native Gesture Handler 识别原生手势，并用 Reanimated 在 UI 线程更新拖动位置与回弹动画。
- 手势组件须处于 `GestureHandlerRootView` 根容器内；项目现有根布局已具备该基础设施。
- 本轮 Tab 改造采用“长按激活 → 水平拖动预览 → 释放提交顺序或回弹”模型，避免普通点按导航与重排手势冲突。
