# OpenWrt 状态：本地 Android 编译指南

本文档对应当前源码版本，适用于 Windows、macOS 或 Linux 电脑。项目使用 **Expo SDK 54、React Native 和自定义 Android SSH 原生模块**；因此不能只用 Expo Go 测试 SSH、文件管理或固件升级功能，首次本地编译必须生成 Android 原生工程。[1]

| 项目 | 本指南使用的值 |
|---|---|
| Node.js | 22.x LTS |
| 包管理器 | pnpm 9.12.0 |
| Expo SDK | 54 |
| Android 包名 | `com.app.openwrtstatusapp` |
| 安装测试 APK 配置 | Debug APK |
| 商店发布构建 | 已配置 EAS `production` AAB；本地发布需自行签名 |
| React Native 新架构 | 已保留，`newArchEnabled: true` |
| Android ABI | `arm64-v8a`、`armeabi-v7a`、`x86`、`x86_64` |

## 1. 准备开发环境

请安装 Node.js 22、Android Studio（含 Android SDK、Platform Tools 和至少一个 Android SDK Platform）以及 OpenJDK。Android Studio 负责提供 Android SDK 和本地编译工具；Expo 官方将其列为本地 Android 编译的前置条件。[1]

安装完成后，在终端确认以下命令可用：

```bash
node --version
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm --version
adb --version
```

如果系统无法找到 `adb`，请将 Android SDK 的 `platform-tools` 目录加入 `PATH`。Windows 用户通常可通过 Android Studio 的 **SDK Manager** 确认 SDK 位置；macOS/Linux 用户可将 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 指向本机 Android SDK 目录。

## 2. 解压、安装依赖和基础校验

解压源码包后，在项目根目录执行：

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

如果只需要本地 Android 调试或生成 Debug APK，不需要配置 Expo Token。`EXPO_TOKEN` 只用于你主动使用 EAS 云构建时的账号认证；不要把 Token 写进源码、提交到 Git 或发到聊天中。

## 3. 连接设备或启动模拟器

你可以在 Android Studio 启动模拟器，或在真机开启“开发者选项”和“USB 调试”后连接数据线。然后执行：

```bash
adb devices
```

确认列表中能看到设备状态为 `device`。真机需要能访问局域网中的 OpenWrt 路由器，才能完整测试 SSH、文件管理和软件包管理功能。

## 4. 首次本地编译与安装

项目的自定义 SSH 模块由 Expo 配置插件在预构建阶段写入 Android 原生工程。首次构建或修改 `app.config.ts`、原生插件、原生依赖后，请在根目录执行：

```bash
pnpm exec expo prebuild --platform android --clean
pnpm exec expo run:android --device
```

该流程会生成 `android/` 目录，编译、安装 Debug 版本并启动 Metro。Expo 官方说明，`expo run:android` 会在原生目录不存在时先运行预构建，随后把 Debug 版本安装至设备或模拟器。[1]

> 本项目**保留 Expo / React Native 新架构**，没有关闭 `newArchEnabled`。`expo-build-properties` 已配置四种 Android ABI；其中两个 ARM ABI 面向实体机，两个 x86 ABI 便于 Android 模拟器或 x86 设备。Expo 的 `buildArchs` 支持这四种 ABI。[3]

完成首次安装后，如果只修改 TypeScript、TSX、样式或业务逻辑，可直接执行：

```bash
pnpm exec expo start
```

然后在终端按 `a` 打开 Android 设备；这类 JavaScript/TypeScript 修改通常不需要重新编译原生代码。[1]

## 5. 导出可安装的本地 Debug APK

如需生成可直接发送到手机安装的 Debug APK，请先完成预构建，然后执行：

```bash
pnpm exec expo prebuild --platform android --clean
cd android
./gradlew assembleDebug
```

如需显式输出全部已配置的 ABI，请直接使用上述命令。若只需快速调试单一设备，可临时指定 ABI；例如为 64 位 ARM 真机构建：

```bash
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
```

在 Windows PowerShell 中，将 `./gradlew` 替换为 `./gradlew.bat`。不要把这个临时参数写入项目配置，否则会缩小最终 APK 的兼容范围。

Windows PowerShell/CMD 请使用：

```powershell
cd android
.\gradlew.bat assembleDebug
```

APK 输出路径通常为：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

该 APK 使用 Debug 签名，适合真机安装与内部测试；不适合上架应用商店。

## 6. 本地发布构建与签名说明

如果需要生成用于 Google Play 的 AAB，必须准备并妥善保管自己的上传密钥。Expo 官方建议先生成 Android 原生工程，配置签名信息后执行 Gradle 的 `bundleRelease`，产物在 `android/app/build/outputs/bundle/release/`。[2]

> 不要将 `.jks` 密钥库、密钥密码或 `gradle.properties` 中的签名密码提交到 Git、发给他人或放入源码压缩包。

若仅需向个人设备分发，请优先使用上一节的 Debug APK。若需要由你的 Expo 账号生成已配置的安装 APK，也可在自己的电脑中登录 Expo 后执行：

```bash
pnpm exec eas build --platform android --profile preview
```

当前 `preview` 配置会生成 APK，`production` 配置会生成 AAB。

## 7. 常见问题

| 现象 | 建议处理 |
|---|---|
| `adb` 找不到设备 | 重新开启 USB 调试，安装手机厂商 USB 驱动，执行 `adb kill-server && adb start-server`。 |
| Gradle 下载或依赖失败 | 检查网络、Android Studio SDK 配置和 JDK；首次构建需要下载 Gradle 与 Maven 依赖。 |
| SSH 功能在 Expo Go 中不可用 | 正常现象。此项目需要通过 `expo run:android` 或 APK 安装原生模块。 |
| 修改 SSH 插件后没有生效 | 重新执行 `pnpm exec expo prebuild --platform android --clean` 后再编译。 |
| 安装提示签名冲突 | 卸载设备上的旧包，或使用同一签名密钥重新构建。 |
| 新架构 CMake 编译占用较高 | 保持已启用的新架构，关闭不必要的 Android Studio、模拟器和 Metro，再使用单 ABI 调试命令；最终发布时取消 ABI 限制。 |

## References

[1] [Expo: Create a debug build locally](https://docs.expo.dev/guides/local-app-development/)

[2] [Expo: Create a release build locally](https://docs.expo.dev/guides/local-app-production/)

[3] [Expo BuildProperties: `buildArchs`](https://docs.expo.dev/versions/latest/sdk/build-properties/)
