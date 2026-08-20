# OpenWrt 路由器状态

> **面向 OpenWrt 的 Android 本地网络管理工具，现已迁移为纯 Kotlin + Jetpack Compose。**

[![GitHub Release](https://img.shields.io/github/v/release/MMCKB/OpenWRT-Status-APP?display_name=tag&style=for-the-badge&logo=android&logoColor=white&label=Release)](https://github.com/MMCKB/OpenWRT-Status-APP/releases)
[![Android 构建](https://img.shields.io/github/actions/workflow/status/MMCKB/OpenWRT-Status-APP/android-apk-release.yml?style=for-the-badge&logo=githubactions&logoColor=white&label=Android%20Build)](https://github.com/MMCKB/OpenWRT-Status-APP/actions/workflows/android-apk-release.yml)
[![GitHub Star](https://img.shields.io/github/stars/MMCKB/OpenWRT-Status-APP?style=for-the-badge&logo=github&label=Stars)](https://github.com/MMCKB/OpenWRT-Status-APP/stargazers)
[![GitHub 下载量](https://img.shields.io/github/downloads/MMCKB/OpenWRT-Status-APP/total?style=for-the-badge&logo=github&label=Downloads)](https://github.com/MMCKB/OpenWRT-Status-APP/releases)
[![许可证：MIT](https://img.shields.io/badge/License-MIT-0B6BCB?style=for-the-badge)](LICENSE)
[![OpenWrt 25.12](https://img.shields.io/badge/OpenWrt-25.12-00A0E9?style=for-the-badge&logo=openwrt&logoColor=white)](https://openwrt.org/)

[下载最新 APK](https://github.com/MMCKB/OpenWRT-Status-APP/releases/latest) · [查看自动构建](https://github.com/MMCKB/OpenWRT-Status-APP/actions) · [为项目点 Star](https://github.com/MMCKB/OpenWRT-Status-APP/stargazers)

**OpenWrt 路由器状态**用于在可信网络中连接和维护 OpenWrt 路由器。`Dev` 分支上的 K1 客户端已完全采用 **Kotlin 2.0.21、Jetpack Compose Material 3、Android Gradle Plugin 8.8.2** 实现；项目不再包含或依赖 React Native、Expo、TypeScript、Node.js、Metro 或 pnpm 运行时。R2 为一次性覆盖升级过渡构建，会将原有本地数据加密写入 `migration-v1`，K1 首次启动会校验并导入该迁移仓。

> 本项目只应由拥有路由器管理权限的用户使用。SSH 命令、文件改写、软件包变更、防火墙、服务重载、系统升级与批量操作均可能导致网络中断；请先备份配置并核对每项操作的影响。

## 功能概览

| 分类 | 已迁移能力 |
| --- | --- |
| 路由器与状态 | 多路由器资料管理；LuCI/ubus HTTP 状态读取；系统、内核、CPU、内存、存储、接口 IPv4/IPv6、无线与网络设备状态。 |
| 网络管理 | 接口、无线网络、已连接设备、DHCP 与静态租约、防火墙、Wake-on-LAN、弱信号设备与无线优化配置入口。 |
| SSH 与文件 | JSch SSH/SFTP 共享会话、应用内终端、目录浏览、文本读写、上传下载、复制、移动、删除与权限修改。 |
| 服务与软件包 | OpenClash、PassWall、PassWall2、AdGuard Home、DDNS、Docker、计划任务与启动项的状态、启停、日志和配置快照编辑；OpenWrt 25.12 `apk` 软件包管理。 |
| 工具与维护 | 手机本地 UDP/STUN NAT 检测、DNS 延迟测试、性能采样、LuCI 主题、系统动作、固件工具、日志中心、批量操作、应用设置和关于页面。 |
| 数据与体验 | DataStore 保存非敏感偏好，EncryptedSharedPreferences 保存路由器密码；浅色、深色和跟随系统主题；Material 3 Compose 弹窗和页面导航。 |

## 纯 Android 技术栈

| 领域 | 选型 |
| --- | --- |
| 用户界面 | Kotlin + Jetpack Compose + Material 3 + Compose Navigation |
| 状态与生命周期 | AndroidX Lifecycle ViewModel、Kotlin Coroutines / Flow |
| 本地数据 | DataStore Preferences、EncryptedSharedPreferences |
| 路由器通信 | LuCI ubus HTTP、JSch SSH/SFTP、Android UDP Socket / STUN |
| 构建与测试 | Gradle 8.14.3、AGP 8.8.2、JDK 17、JUnit 4、Android Lint |
| 发布 | GitHub Actions、稳定 Release keystore、四 ABI APK |

## 安装 APK

请前往 [Releases](https://github.com/MMCKB/OpenWRT-Status-APP/releases) 下载与设备 ABI 对应的 APK。应用最低支持 **Android 7.0（API 24）**。使用同一稳定发布证书签名的后续版本可直接覆盖安装；若设备上的同包名应用由其他证书签名，Android 会拒绝覆盖，此时需要先备份资料并卸载旧包。

| APK 后缀 | 适用设备 |
| --- | --- |
| `arm64-v8a` | 大多数近年的 Android 手机、平板和 ARM64 模拟器。 |
| `armeabi-v7a` | 较旧的 32 位 ARM Android 设备。 |
| `x86` | 32 位 x86 Android 模拟器或特定设备。 |
| `x86_64` | 64 位 x86 Android 模拟器。 |

## 从源码构建

本项目仅需要 **JDK 17**、Android SDK（API 35 / Build Tools）和 Gradle Wrapper；不需要安装 Node.js、pnpm、Expo CLI 或任何 JavaScript 依赖。将 Android SDK 路径写入未跟踪的 `local.properties` 后，在项目根目录执行：

```properties
# local.properties（示例）
sdk.dir=C:\\Users\\<用户名>\\AppData\\Local\\Android\\Sdk
```

```bash
# Linux / macOS
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease

# Windows PowerShell
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease
```

Release APK 输出在 `app/build/outputs/apk/release/`。该模块使用 Gradle ABI split，一次 Release 构建将生成 `armeabi-v7a`、`arm64-v8a`、`x86`、`x86_64` 四种 APK。

若本地未配置发布签名环境变量，构建配置会使用 `app/openwrt-status-release.keystore`。**请勿提交**私有 keystore、`local.properties` 或任何路由器密码。GitHub Actions 使用仓库 Secrets 恢复稳定发布签名：`ANDROID_RELEASE_KEYSTORE_B64`、`ANDROID_RELEASE_KEYSTORE_PASSWORD`、`ANDROID_RELEASE_KEY_ALIAS`、`ANDROID_RELEASE_KEY_PASSWORD`。

## 自动发布

工作流为 [`.github/workflows/android-apk-release.yml`](.github/workflows/android-apk-release.yml)。推送 `v*` 标签或手动运行工作流时，CI 会使用 Temurin JDK 17 执行 Kotlin 单元测试、Android Lint 和四 ABI 签名 Release 构建；当由标签触发时，四个 APK 将上传至对应 GitHub Release。

```bash
git tag v2.0.0
git push origin v2.0.0
```

## 项目结构

```text
app/src/main/java/com/app/openwrtstatusapp/
├── data/       # DataStore、SSH 操作门面、文件与 UCI 处理
├── domain/     # 路由器、状态、软件包、服务等领域模型
├── network/    # LuCI ubus HTTP 与本地 STUN NAT 检测
├── ssh/        # JSch SSH/SFTP 会话管理
└── ui/         # Compose 主题、ViewModel、七项导航与功能弹窗
```

## 已验证的质量检查

| 检查 | 结果 |
| --- | --- |
| Kotlin Debug 编译 | 通过 |
| JUnit 单元测试 | 通过（9 项：升级 payload、导入中断续跑、命令安全与 STUN XOR-MAPPED-ADDRESS 解析） |
| Android Lint | 通过 |
| Debug APK | 通过，已生成四 ABI APK |
| Release APK | 等待 GitHub Actions 使用稳定签名 Secrets 在 `Dev` 分支执行四 ABI 构建 |

## 许可证

本项目采用 [MIT License](LICENSE) 发布。版权所有 © 2026 MMCKB。
