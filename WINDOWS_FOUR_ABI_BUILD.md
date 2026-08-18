# Windows 10/11：构建 ARM、x86 的 32 位和 64 位 APK

**适用源码：OpenWrt 状态 v1.0.14；应用包名：`com.app.openwrtstatusapp`；版本号：`1.0.14`（`versionCode 10`）。** 本教程只面向 Windows PowerShell，讲解如何构建 ARM64、ARM 32 位、x86 32 位、x86 64 位的独立 Release APK，以及四 ABI 通用 APK。

本项目使用 Expo SDK 54、React Native 新架构和自定义 Android SSH 模块。请保留 `newArchEnabled=true`，不要删除 `plugins/with-openwrt-ssh.js`，首次构建前也不要运行 `expo prebuild --clean`。项目已经固定 Gradle Wrapper，始终使用 `android\gradlew.bat`，不必安装全局 Gradle。[1]

> **重要顺序**：生成 APK 后，先运行 `zipalign -P 16`，再运行 `apksigner sign`。在签名后修改 APK 内容会使其签名失效。[3]

## 1. 先确定要构建的 ABI

| APK ABI | 位数 | 适合的设备 | 建议 |
|---|---:|---|---|
| `arm64-v8a` | 64 位 | 绝大多数近年 Android 手机与平板 | **优先构建** |
| `armeabi-v7a` | 32 位 | 较旧 ARM 手机、部分嵌入式 Android 设备 | 按需构建 |
| `x86` | 32 位 | 较老 Android x86 模拟器 | 按需构建 |
| `x86_64` | 64 位 | Android Studio 的多数 x86_64 模拟器 | 按需构建 |
| `universal` | 四 ABI | 需要用一个 APK 分发给各种架构设备 | 按需构建 |

普通手机几乎都应安装 **`arm64-v8a`**。`x86` 与 `x86_64` 主要用于 Android Studio 模拟器，不能安装到普通 ARM 手机。

## 2. 解压源码和安装软件

将源码包解压到短的本地路径，例如 `C:\dev\openwrt-status-app`。不要放在 OneDrive、网盘同步目录、网络磁盘或包含中文的深层路径中，以避免 CMake 和 Gradle 文件锁定或路径过长。

在 Windows 中安装下列软件，然后重新打开 PowerShell：

| 软件 | 安装版本 | 用途 |
|---|---|---|
| [Node.js](https://nodejs.org/) | **Node.js 22 LTS x64** | Expo、React Native、pnpm |
| [Eclipse Temurin](https://adoptium.net/) | **JDK 21 x64** | Java、Gradle、签名工具 |
| [Android Studio](https://developer.android.com/studio) | 当前稳定版 | Android SDK、NDK、CMake、模拟器 |
| Git | 可选 | 拉取或更新源码 |

在 Android Studio 欢迎页打开 **More Actions → SDK Manager**。在 **SDK Tools** 中安装 Android SDK Build-Tools、Android SDK Platform-Tools、Android SDK Command-line Tools (latest)、NDK (Side by side) 和 CMake；在 **SDK Platforms** 中安装一个近期 Android SDK Platform。若 Gradle 后续明确提示缺少特定版本，请按错误信息安装对应 SDK/NDK/CMake。[1]

## 3. 设置 PowerShell 当前会话环境变量

在 PowerShell 粘贴以下命令。将 JDK 路径替换为你的真实安装目录；Android SDK 默认位置通常不必修改。

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21'
$env:ANDROID_SDK_ROOT = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
$env:Path += ";$env:JAVA_HOME\bin;$env:ANDROID_SDK_ROOT\platform-tools;$env:ANDROID_SDK_ROOT\cmdline-tools\latest\bin"

node --version
java -version
adb --version
```

Node 主版本应为 `22`，Java 主版本应为 `21`。如果其中任一命令无法执行，请先修复环境变量，再开始构建。验证后，可将 `JAVA_HOME`、`ANDROID_SDK_ROOT` 和对应 `Path` 项保存到 Windows 系统环境变量。

## 4. 安装项目依赖并创建自己的密钥

进入项目根目录并安装锁定依赖：

```powershell
cd C:\dev\openwrt-status-app
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

源码包不会包含 `.keystore` 或 `.jks` 私钥文件。项目的个人 Release 构建默认使用 `android\app\debug.keystore`，请执行以下命令为自己生成一份密钥：

```powershell
keytool -genkeypair -v -keystore android\app\debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Android Debug,O=Android,C=US'
```

**务必离线备份 `android\app\debug.keystore`。** 以后更新同包名 APK 必须使用同一密钥；若更换或丢失密钥，Android 会拒绝覆盖安装，只能先卸载旧应用。不要将密钥、密码或包含密钥的整个 Android 目录上传到公开位置。[2]

## 5. 推荐方式：自动生成四个单 ABI APK

项目包含 `scripts\build-windows-four-abis.ps1`，它按顺序完成 **Gradle Release 构建 → 16KB 对齐 → APK 签名 → 签名核验 → SHA-256 输出**。首次构建建议预留至少 16 GB 内存和 35 GB 可用磁盘，关闭 Android 模拟器及大型程序。

在项目根目录执行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
./scripts/build-windows-four-abis.ps1
```

脚本会先清理 Android 旧构建和 `apk-output` 中旧的签名 APK，再从 `android\app\build.gradle` 读取真实的 `versionName` 与 `versionCode`；签名后会用 `aapt` 校验 APK 清单版本。控制台必须显示：

```text
Building source version: 1.0.14 (versionCode 10)
Verified manifest: versionName 1.0.14, versionCode 10
```

若没有看到以上两行，**不要安装 `apk-output` 里的任何旧文件**；先确认你解压的是本次更新后的源码包。

完成后会在 `apk-output\` 看到：

```text
openwrt-status-v1.0.14-arm64-v8a-16kb-signed.apk
openwrt-status-v1.0.14-armeabi-v7a-16kb-signed.apk
openwrt-status-v1.0.14-x86-16kb-signed.apk
openwrt-status-v1.0.14-x86_64-16kb-signed.apk
```

如果只需一种架构，使用 `-Only` 参数：

```powershell
./scripts/build-windows-four-abis.ps1 -Only arm64-v8a
./scripts/build-windows-four-abis.ps1 -Only armeabi-v7a
./scripts/build-windows-four-abis.ps1 -Only x86
./scripts/build-windows-four-abis.ps1 -Only x86_64
```

脚本固定使用 `--no-daemon --max-workers=1`，以降低新架构、CMake 与 NDK 的内存峰值。你的电脑内存非常充足时可自行调整，但第一次成功前不建议修改。

## 6. 手动逐个构建 ARM、x86 的 32/64 位 APK

如果你希望逐条查看 Gradle 输出，进入 Android 目录。**每次构建都会覆盖相同的 `app-release.apk`，所以每次成功后必须立即复制并改名。**

```powershell
cd C:\dev\openwrt-status-app\android
New-Item -ItemType Directory -Force ..\apk-output
```

| 目标 | 构建命令 | 成功后立即执行的复制命令 |
|---|---|---|
| ARM64 | `.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=1` | `Copy-Item .\app\build\outputs\apk\release\app-release.apk ..\apk-output\openwrt-status-v1.0.14-arm64-v8a-raw.apk` |
| ARM 32 位 | `.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=armeabi-v7a --no-daemon --max-workers=1` | `Copy-Item .\app\build\outputs\apk\release\app-release.apk ..\apk-output\openwrt-status-v1.0.14-armeabi-v7a-raw.apk` |
| x86 32 位 | `.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=x86 --no-daemon --max-workers=1` | `Copy-Item .\app\build\outputs\apk\release\app-release.apk ..\apk-output\openwrt-status-v1.0.14-x86-raw.apk` |
| x86 64 位 | `.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=x86_64 --no-daemon --max-workers=1` | `Copy-Item .\app\build\outputs\apk\release\app-release.apk ..\apk-output\openwrt-status-v1.0.14-x86_64-raw.apk` |

`raw.apk` 是中间文件。要让 APK 在 16KB 页面设备上兼容，必须执行第 8 节的对齐与签名步骤；更简单的方式是使用第 5 节脚本。

## 7. 构建四 ABI 通用 APK

通用包同时包含 `armeabi-v7a`、`arm64-v8a`、`x86` 和 `x86_64` 原生库。它的体积和构建资源消耗最高，但用户无需按设备 ABI 选择下载文件。

**应让 Gradle 在一次构建内生成通用 APK，禁止手动解压多个 APK 再拼接 `lib\` 目录。** 运行：

```powershell
cd C:\dev\openwrt-status-app
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
./scripts/build-windows-four-abis.ps1 -Universal
```

这会生成四个单 ABI APK，另加：

```text
apk-output\openwrt-status-v1.0.14-universal-16kb-signed.apk
```

只构建通用包而不生成四个单 ABI 包时，在 `android\` 目录执行：

```powershell
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64 --no-daemon --max-workers=1
```

然后对 `app\build\outputs\apk\release\app-release.apk` 运行第 8 节命令。

## 8. 手动执行 16KB 对齐、签名和核验

Android 的 16KB 页面兼容要求会影响 APK 内未压缩原生库的 ZIP 对齐方式。按照以下顺序处理：**Gradle APK → `zipalign -P 16` → `apksigner sign` → `apksigner verify`**。[3]

将 `<BuildToolsVersion>` 替换为你 Android SDK 中 `build-tools` 下的目录名，例如 `36.0.0`；并将 `$Input` 与 `$Output` 改为对应 ABI 或 universal 文件名。

```powershell
$Sdk = $env:ANDROID_SDK_ROOT
$Tools = Join-Path $Sdk 'build-tools\<BuildToolsVersion>'
$ZipAlign = Join-Path $Tools 'zipalign.exe'
$ApkSigner = Join-Path $Tools 'apksigner.bat'
$Input = 'C:\dev\openwrt-status-app\apk-output\openwrt-status-v1.0.14-arm64-v8a-raw.apk'
$Aligned = 'C:\dev\openwrt-status-app\apk-output\aligned-unsigned.apk'
$Output = 'C:\dev\openwrt-status-app\apk-output\openwrt-status-v1.0.14-arm64-v8a-16kb-signed.apk'

& $ZipAlign -P 16 -f -v 4 $Input $Aligned
& $ApkSigner sign --ks 'C:\dev\openwrt-status-app\android\app\debug.keystore' --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out $Output $Aligned
& $ApkSigner verify --verbose --print-certs $Output
Get-FileHash $Output -Algorithm SHA256
```

只有 `apksigner verify` 成功后，才应安装或分发 APK。[3]

## 9. 检查 APK 包含的 ABI

使用 JDK 自带 `jar.exe` 检查通用包：

```powershell
& "$env:JAVA_HOME\bin\jar.exe" tf .\apk-output\openwrt-status-v1.0.14-universal-16kb-signed.apk |
  Select-String '^lib/(arm64-v8a|armeabi-v7a|x86|x86_64)/'
```

通用包应输出四种 `lib/<ABI>/` 路径；单 ABI 包应只输出一种。连接设备后，也可检查设备支持的架构：

```powershell
adb shell getprop ro.product.cpu.abilist
```

## 10. 安装、覆盖安装和卸载

开启手机的“开发者选项 → USB 调试”，连接 USB 并确认授权：

```powershell
adb devices
adb install -r .\apk-output\openwrt-status-v1.0.14-arm64-v8a-16kb-signed.apk
```

若返回 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`，说明手机已有相同包名但不同密钥签名的版本。先备份应用中保存的路由器资料，再执行：

```powershell
adb uninstall com.app.openwrtstatusapp
adb install .\apk-output\openwrt-status-v1.0.14-arm64-v8a-16kb-signed.apk
```

卸载会清除应用本地保存的路由器资料。以后保持同一份 `debug.keystore`，即可使用 `adb install -r` 覆盖更新。

## 11. 构建后仍显示旧版本

当前源码的 `android\app\build.gradle` 必须显示 `versionName "1.0.14"` 和 `versionCode 10`。先在项目根目录核对它，而不是只看旧 APK 文件名：

```powershell
Select-String -Path .\android\app\build.gradle -Pattern 'versionName|versionCode'
Remove-Item -Recurse -Force .\apk-output -ErrorAction SilentlyContinue
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\build-windows-four-abis.ps1 -Only arm64-v8a
```

修正后的脚本会自行执行 `:app:clean`、删除旧输出，并从构建脚本读取版本。安装前必须在控制台看到 `Verified manifest: versionName 1.0.14, versionCode 10`；否则停止安装并确认解压的不是旧源码包。

也可以手动检查最终 APK，下面命令输出中的 `versionName` 和 `versionCode` 必须分别为 `1.0.14` 与 `10`：

```powershell
$Sdk = $env:ANDROID_SDK_ROOT
if (-not $Sdk) { $Sdk = "$env:LOCALAPPDATA\Android\Sdk" }
$BuildTools = Get-ChildItem "$Sdk\build-tools" -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
& "$($BuildTools.FullName)\aapt.exe" dump badging .\apk-output\openwrt-status-v1.0.14-arm64-v8a-16kb-signed.apk
```

安装时只选择刚刚生成的 `apk-output\openwrt-status-v1.0.14-arm64-v8a-16kb-signed.apk`；不要从下载目录、旧的 `apk_output` 文件夹或聊天软件缓存中选择同名旧包。

## 12. 常见错误处理

| 现象 | 处理方法 |
|---|---|
| `JAVA_HOME is not set` | 安装 JDK 21，修正第 3 节路径并重新打开 PowerShell。 |
| `SDK location not found` | 在 Android Studio SDK Manager 查看 SDK 路径，并设置 `ANDROID_SDK_ROOT`。 |
| 缺 SDK、NDK 或 CMake | 在 SDK Manager 安装 Gradle 报错中点名的版本。 |
| Gradle/CMake 被终止或内存不足 | 先构建 `-Only arm64-v8a`，关闭模拟器与大型程序，保留单 worker 参数。 |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 旧 APK 与新 APK 签名不同；备份数据后卸载旧应用。 |
| APK 无法安装 | 使用 `apksigner verify --verbose` 检查；不要经过会二次压缩 APK 的聊天软件；重新打包时必须重新对齐和签名。 |
| x86 APK 装不上真机 | 真机一般是 ARM64；x86/x86_64 面向模拟器。 |
| Expo Go 内无法使用 SSH | 自定义 SSH 模块是 Android 原生模块，必须安装本教程构建出的 APK。 |

## 13. 推荐执行顺序

先运行 `pnpm check` 与 `pnpm test`，然后执行 `./scripts/build-windows-four-abis.ps1 -Only arm64-v8a` 并在真机上安装。确认无误后，再按需生成 ARM 32 位、x86 与 x86_64 包；最后如果需要统一对外分发，再运行 `./scripts/build-windows-four-abis.ps1 -Universal`。

## References

[1] [Android Developers：从命令行构建应用](https://developer.android.com/build/building-cmdline)  
[2] [Android Developers：应用签名](https://developer.android.com/studio/publish/app-signing)  
[3] [Android Developers：支持 16KB 页面大小](https://developer.android.com/guide/practices/page-sizes)  
[4] [Expo：本地生产构建](https://docs.expo.dev/guides/local-app-production/)
