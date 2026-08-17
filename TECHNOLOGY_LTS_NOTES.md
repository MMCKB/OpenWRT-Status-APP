# 技术栈长期支持版本评估记录

## 外部兼容依据

| 来源 | 已核实的信息 | 对本项目的含义 |
| --- | --- | --- |
| [Expo SDK 54 变更日志](https://expo.dev/changelog/sdk-54) | SDK 54 对应 React Native 0.81 与 React 19.1。 | Expo、React Native 与 React 应作为同一兼容组维护，不应单独提升其中任一项。 |
| [Expo Build Properties 文档](https://docs.expo.dev/versions/latest/sdk/build-properties/) | `expo-build-properties` 用于配置 Android 原生构建属性。 | Android Gradle Plugin、Kotlin 与 SDK 版本应优先由 Expo SDK 对应模板和配置插件管理。 |
| [Gradle 兼容矩阵](https://docs.gradle.org/current/userguide/compatibility.html) | Java 运行版本必须与所用 Gradle 版本处于官方兼容范围。 | 已验证能本地构建的 Gradle 8.14.3 与 OpenJDK 21 组合应优先保持稳定。 |
| [Node.js 官方版本发布页](https://nodejs.org/en/about/previous-releases) | Node.js 24 为长期支持分支；Node.js 22 已进入维护期。Node.js 24 的官方支持窗口至 2028 年 4 月。 | Node.js 22.13.0 仍可用，但下一次依赖重装或 SDK 大版本升级时宜升级至 Node.js 24 LTS。 |
| [TypeScript 6.0 官方发布说明](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/) | TypeScript 6.0 已于 2026 年 3 月正式发布；TypeScript 没有类似 Node.js 的 LTS 分支制度。 | 项目当前使用 5.9.3。6.0 可作为独立兼容性升级项评估，但不应和 Expo/RN 大版本升级同时进行。 |
| [Oracle Java SE 支持路线图](https://www.oracle.com/java/technologies/java-se-support-roadmap.html) | JDK 21 与 JDK 25 均为长期支持版本；JDK 25 于 2025 年 9 月发布。 | 当前 JDK 21 已是稳定 LTS，建议继续作为 Expo SDK 54 本地 Android 构建 JDK；不要仅为“更新”切换到 JDK 25。 |
| [Gradle 兼容性矩阵](https://docs.gradle.org/current/userguide/compatibility.html) | Gradle 的 Java 运行时支持取决于包装器版本；Java 21 的完整运行时支持始于 Gradle 8.5。 | 项目当前 Gradle 8.14.3 与 JDK 21 组合安全，无需单独升级。Android Gradle Plugin 应随 Expo/RN 原生模板统一升级，不能独立追最新版。 |

## 当前本地基线

| 组件 | 当前版本/状态 |
| --- | --- |
| Expo | SDK 54（`~54.0.29`） |
| React Native / React | 0.81.5 / 19.1.0 |
| TypeScript | 5.9.3 |
| Java | OpenJDK 21.0.11（长期支持版本） |
| Gradle Wrapper | 8.14.3 |
| Node.js | 22.13.0（长期支持分支） |
| pnpm | 9.12.0 |
| Android 架构 | 新架构启用，四 ABI：armeabi-v7a、arm64-v8a、x86、x86_64 |
