# OpenWrt 状态 v1.0.14：电脑本地构建 APK 完整教程

**适用项目版本：v1.0.14（Android `versionCode 10`）**  
**应用包名：`com.app.openwrtstatusapp`**  
**适用系统：Windows 10/11、macOS、Ubuntu/Debian 等 Linux 发行版**

本项目是一个带有原生 Android SSH 模块的 Expo / React Native 应用。它不是纯网页，也不能只用 Expo Go 运行完整功能；SSH 终端、文件管理和固件升级均需要你编译并安装原生 APK。项目保留了 **Expo 新架构**（`newArchEnabled: true`）、Hermes 和四 ABI 配置，构建时不要关闭或删除这些设置。

> **最短可行路径**：下载本教程随附的源码 ZIP → 安装 Node 22、JDK 21、Android Studio → 在源码根目录执行 `pnpm install --frozen-lockfile` → 进入 `android` 目录执行 ARM64 单架构构建命令 → 使用 `adb install` 安装 APK。

## 1. 你将得到什么

| 项目 | 当前配置 |
|---|---|
| 应用名称 | OpenWrt 状态 |
| 版本 | `1.0.14` / `versionCode 10` |
| Android 最低版本 | Android 7.0（API 24） |
| 手机推荐 ABI | `arm64-v8a` |
| 完整 ABI | `arm64-v8a`、`armeabi-v7a`、`x86`、`x86_64` |
| JavaScript 工具链 | Node.js 22 LTS、pnpm 9.12.0 |
| Android 工具链 | Android Studio、Android SDK、Platform Tools、OpenJDK 21 |
| 生成调试包 | `assembleDebug` |
| 生成可安装发布包 | `assembleRelease` |
| Release 当前默认签名 | 项目现有 Debug keystore，仅适合个人安装、真机测试或侧载 |

本教程优先使用 **ARM64 单架构 APK**，因为绝大多数近年的真机使用 ARM64，而且该方式明显降低 React Native 新架构下的 CMake、NDK 和 Gradle 内存压力。若确实需要同时支持 ARM、x86 模拟器和 x86 设备，可在最后的“全 ABI 构建”章节执行完整构建。

## 2. 准备源码

将随附的 `openwrt-status-v1.0.14-source-fixed.zip` 解压到不含中文、空格过多或同步盘锁定的路径。例如：

| 系统 | 建议目录 |
|---|---|
| Windows | `C:\dev\openwrt-status-app` |
| macOS | `~/Developer/openwrt-status-app` |
| Linux | `~/Projects/openwrt-status-app` |

解压后必须能看到 `package.json`、`app.config.ts`、`android/`、`plugins/` 和 `pnpm-lock.yaml`。不要只复制 `app/` 文件夹；自定义 SSH 原生模块位于项目的原生配置插件中，缺少 `plugins/` 或 `android/` 都会导致构建不完整。

## 3. 安装工具链

本项目已经锁定 Expo SDK 54、React Native 0.81、TypeScript 5.9 和 Gradle Wrapper 8.14.3。你不需要全局安装 Gradle；应始终使用源码自带的 `gradlew` / `gradlew.bat`，以避免全局 Gradle 与项目版本不一致。[1]

### 3.1 必装软件

请安装以下软件，然后再继续后面的命令。

| 软件 | 建议版本 | 用途 |
|---|---:|---|
| Node.js | **22 LTS** | 运行 Expo、React Native、pnpm 和打包脚本 |
| OpenJDK | **21** | 运行 Gradle、`keytool` 和 Android 构建工具 |
| Android Studio | 当前稳定版 | 安装 Android SDK、Platform Tools、Build Tools、NDK 与模拟器 |
| Git | 当前稳定版 | 可选，用于管理源码更新 |

在 Android Studio 中依次进入 **More Actions → SDK Manager**，至少确认已安装以下组件：

| SDK Manager 区域 | 需要安装的项目 |
|---|---|
| **SDK Platforms** | 一个近期 Android SDK Platform；若 Gradle 报缺少 API 版本，按报错安装对应平台 |
| **SDK Tools** | Android SDK Build-Tools、Android SDK Platform-Tools、Android SDK Command-line Tools (latest) |
| **SDK Tools** | NDK (Side by side)、CMake；新架构首次编译若提示缺失，会给出所需版本 |

Expo 的本地原生构建流程要求准备 Java 环境；如 Android 原生目录需要重新生成，则应先运行 `npx expo prebuild`。[2]

### 3.2 配置环境变量

请先确定 Android SDK 路径。Windows 默认通常是 `%LOCALAPPDATA%\Android\Sdk`；macOS 常为 `$HOME/Library/Android/sdk`；Linux 常为 `$HOME/Android/Sdk`。

**Windows PowerShell（仅当前窗口生效）**：

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path += ";$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin"
```

**macOS / Linux（Bash 或 Zsh，当前窗口生效）**：

```bash
export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"
export ANDROID_HOME="$HOME/Android/Sdk"             # macOS 改为：$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

若要永久生效，请将对应命令写入 Windows 的用户环境变量，或 macOS/Linux 的 `~/.zshrc`、`~/.bashrc`。

执行以下命令核对环境。任何一项找不到时，不要急于构建，应先修正路径。

```bash
node --version
java -version
adb --version
```

预期 Node 主版本为 `v22`，Java 主版本为 `21`。Windows 命令提示符中可用 `where adb`，macOS/Linux 中可用 `which adb` 检查 Platform Tools 是否进入 `PATH`。

## 4. 安装项目依赖与基础校验

进入包含 `package.json` 的源码根目录，执行以下命令。`pnpm-lock.yaml` 已随源码提供，`--frozen-lockfile` 会防止依赖版本在你的电脑上被意外更新。

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

如果最后两条命令通过，说明 TypeScript 与单元测试环境可用。首次执行 `pnpm install`、Gradle Wrapper 和 Android 构建时都可能下载依赖；建议保持稳定网络并预留至少 **25 GB** 可用磁盘空间。

本源码压缩包**不包含任何签名密钥**。当前工程的 `assembleRelease` 为个人侧载方便，默认引用 `android/app/debug.keystore`；因此第一次构建前，请在源码根目录创建自己的调试密钥：

```bash
keytool -genkeypair -v \
  -keystore android/app/debug.keystore \
  -storepass android \
  -alias androiddebugkey \
  -keypass android \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US"
```

Windows PowerShell 可将以上命令写成一行，或用反引号作为续行符。此密钥只用于你自己的测试和侧载。请一直保存它：以后要覆盖安装你自己构建的同包名 APK，必须继续使用同一份密钥。不要将 `debug.keystore` 或后续创建的发布 `.jks` 文件上传到 Git、网盘公开链接或聊天群。

> 当前源码中已包含 `android/` 目录。**首次直接构建不要先执行 `expo prebuild --clean`**，避免无必要地重建原生目录。只有当你修改了 `app.config.ts`、`plugins/with-openwrt-ssh.js`、原生模块依赖，或从不含 `android/` 的源码分支开始时，才在根目录执行：`pnpm exec expo prebuild --platform android --clean`。该步骤会重新注入本项目的 SSH 原生模块。

## 5. 构建适合手机安装的 ARM64 APK

这是推荐命令。它使用一个 Gradle worker、关闭 Gradle 常驻守护进程，并只构建手机最常见的 ARM64 原生库，从而显著降低内存占用。

### Windows PowerShell

```powershell
cd android
.\gradlew.bat :app:assembleRelease `
  -PreactNativeArchitectures=arm64-v8a `
  --no-daemon `
  --max-workers=1
```

### macOS / Linux

```bash
cd android
./gradlew :app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  --no-daemon \
  --max-workers=1
```

Gradle 成功结束后，APK 位于：

```text
android/app/build/outputs/apk/release/app-release.apk
```

请先复制并改名，防止下一次构建覆盖它。

```bash
# macOS / Linux
cp app/build/outputs/apk/release/app-release.apk ../openwrt-status-v1.0.14-arm64.apk
```

```powershell
# Windows PowerShell
Copy-Item .\app\build\outputs\apk\release\app-release.apk ..\openwrt-status-v1.0.14-arm64.apk
```

Gradle Wrapper 可在 Windows 使用 `gradlew.bat`，在 macOS/Linux 使用 `./gradlew`；Debug APK 与 Release APK 均由各自的 `assemble<Variant>` 任务输出。[1]

## 6. 安装到真机并验证

在手机中打开 **设置 → 关于手机**，连续点击“版本号”七次启用开发者选项；随后在开发者选项中启用 **USB 调试**。接入 USB 后执行：

```bash
adb devices
```

当状态显示为 `device` 时，安装 APK：

```bash
adb install -r ../openwrt-status-v1.0.14-arm64.apk
```

Android 官方文档说明，调试包可直接安装；命令行 APK 输出在模块的 `build/outputs/apk/` 下，也可通过 `adb install` 装入已连接的实体机。[1]

### 安装前的关键提醒

1. **`INSTALL_FAILED_UPDATE_INCOMPATIBLE` 或“应用未安装”**：通常表示设备中已有相同包名但由不同证书签名的版本。先记录现有路由器连接信息，再执行：

   ```bash
   adb uninstall com.app.openwrtstatusapp
   adb install ../openwrt-status-v1.0.14-arm64.apk
   ```

   卸载会清除应用本地数据，包括已保存的路由器资料，因此务必先记录路由器地址、账号和 SSH 端口。

2. **不要把旧 APK 手工解压、合并 ABI 或重新压缩后再安装**。这会破坏签名或原生库对齐。应直接分发 Gradle 生成的 APK；Android 签名验证要求 APK 内容在签名后保持不变。[3]

3. **Android 16 / 16KB 页面设备**：如你使用了任何人工重签、压缩或调整 APK 的操作，必须先完成 `zipalign`，再进行签名。Android 官方也明确要求：`zipalign` 必须在 `apksigner` 之前执行。[3]

## 7. 生成 Debug APK（便于日常调试）

如果只是自己改界面、排错或测试路由器连接，用 Debug APK 更快：

### Windows

```powershell
cd android
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=1
```

### macOS / Linux

```bash
cd android
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=1
```

输出路径为：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

可直接使用 `adb install -r app/build/outputs/apk/debug/app-debug.apk`。如果之后只改了 TS、TSX、样式或业务逻辑，也可以在项目根目录执行 `pnpm exec expo start`，再在 Android 开发版中刷新 JavaScript；但改动原生 SSH 插件、`app.config.ts` 或原生依赖后必须重新预构建并编译。

## 8. 构建四 ABI 通用 APK

仅当你要同时支持 ARM64、32 位 ARM、x86 和 x86_64 时才执行此节。完整构建消耗的内存、磁盘和时间都更多；建议电脑至少有 **16 GB 内存** 和 **35 GB 可用磁盘**。本项目保留 `arm64-v8a`、`armeabi-v7a`、`x86`、`x86_64` 四种 ABI 配置。

```bash
# Windows：将 ./gradlew 替换为 .\gradlew.bat
cd android
./gradlew :app:assembleRelease --no-daemon --max-workers=1
```

直接由 Gradle 生成的完整 APK 比手工合并多个 APK 更安全。若电脑内存不足，优先构建 ARM64 APK；不要尝试手动解压多个单 ABI APK 后合并其中的 `lib/` 目录。

## 9. 可选：使用自己的发布密钥重新签名

当前项目的 `release` 构建为了方便个人安装，暂时使用项目 Debug keystore 签名。它适合侧载、真机测试，但不适合发布到 Google Play。若你要长期分发或上架，请创建并永久保存自己的密钥；密钥丢失后无法给同一个已发布应用正常更新。[2]

### 9.1 创建密钥

在一个不参与 Git 同步、并已备份的目录中执行：

```bash
keytool -genkeypair -v \
  -keystore openwrt-status-release.jks \
  -alias openwrt-status \
  -keyalg RSA -keysize 2048 -validity 10000
```

Windows PowerShell 中把反斜杠续行改为反引号，或直接写成一行。请使用仅自己掌握的强密码，不要把 `.jks`、别名密码或证书发给任何人，也不要加入 Git。

### 9.2 对 APK 进行 16KB 对齐并重新签名

先在 Android SDK 的 `build-tools/<版本>/` 目录找到 `zipalign` 与 `apksigner`。Windows 典型路径：

```text
%LOCALAPPDATA%\Android\Sdk\build-tools\<版本>\zipalign.exe
%LOCALAPPDATA%\Android\Sdk\build-tools\<版本>\apksigner.bat
```

macOS/Linux 典型路径：

```text
$ANDROID_HOME/build-tools/<版本>/zipalign
$ANDROID_HOME/build-tools/<版本>/apksigner
```

以下命令以已经由 Gradle 生成的 `app-release.apk` 为输入。先对齐，再签名，最后验证：

```bash
zipalign -P 16 -f -v 4 app-release.apk app-release-aligned.apk

apksigner sign \
  --ks /安全路径/openwrt-status-release.jks \
  --ks-key-alias openwrt-status \
  --out openwrt-status-v1.0.14-arm64-signed.apk \
  app-release-aligned.apk

apksigner verify --verbose --print-certs openwrt-status-v1.0.14-arm64-signed.apk
```

`apksigner verify` 会确认 APK 签名能否在该应用支持的 Android 版本上通过验证；官方文档同时说明，若需要 `zipalign`，必须在签名前运行。[3]

> 重新签名后，手机上的旧版本若使用不同密钥，将不能“覆盖安装”。这是 Android 的安全机制，并非 APK 损坏；需要先卸载旧包或使用原始相同密钥签名。

## 10. 常见错误与处理

| 现象 | 原因与处理 |
|---|---|
| `JAVA_HOME is not set`、Gradle 找错 Java | 安装 JDK 21，设置 `JAVA_HOME`，重新打开终端并确认 `java -version`。 |
| `SDK location not found` | 在 Android Studio 的 SDK Manager 确认 SDK 路径，设置 `ANDROID_HOME` 与 `ANDROID_SDK_ROOT`。 |
| 缺少 NDK、CMake 或 Android Platform | 打开 Android Studio SDK Manager，按 Gradle 报错安装对应的 SDK Platform、NDK (Side by side) 或 CMake。 |
| Gradle 在 CMake / `configureCMake*` 阶段内存不足 | 关闭模拟器、浏览器和 Android Studio；执行 ARM64 单 ABI 命令，并保留 `--no-daemon --max-workers=1`。不要关闭新架构。 |
| `Could not resolve` / 下载超时 | 检查网络、代理和系统时间；首次下载 Gradle/Maven/Node 依赖可能较慢。不要删除 `pnpm-lock.yaml`。 |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 新旧 APK 证书不同。记录路由器配置后执行 `adb uninstall com.app.openwrtstatusapp`，再安装。 |
| 安卓安装器提示 APK 无法安装 | 确保 APK 没被聊天软件二次压缩；不要手工合并 APK；用 `apksigner verify --verbose` 验证，并直接安装 Gradle 输出文件。 |
| 修改 SSH 原生插件后没生效 | 在项目根目录执行 `pnpm exec expo prebuild --platform android --clean`，再重新执行 Gradle 构建。 |
| `adb devices` 显示 `unauthorized` | 解锁手机并在弹窗中允许 USB 调试；必要时执行 `adb kill-server` 后重新连接。 |

## 11. 建议的构建顺序

先使用 ARM64 Debug APK 确认 Java、SDK、设备连接和 SSH 原生模块均正常；再生成 ARM64 Release APK；只有在需要模拟器或多 ABI 分发时才执行完整四 ABI 构建。这样可以大幅缩短排错时间，也避免在第一次构建时因资源不足误判项目有问题。

在真机上安装 v1.0.14 后，请优先确认以下路径：**路由器列表与添加路由器页的深色模式、性能基准测试中输入域名 Ping、`https://github.com/MMCKB/OpenWRT/releases/tag/JDCloud` 指定标签的固件检查，以及应用内主题确认弹窗**。

## References

[1] [Android Developers：通过命令行构建应用](https://developer.android.com/build/building-cmdline)

[2] [Expo Documentation：Create a release build locally](https://docs.expo.dev/guides/local-app-production/)

[3] [Android Developers：apksigner](https://developer.android.com/tools/apksigner)
