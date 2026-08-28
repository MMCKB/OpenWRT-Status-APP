# OpenWrt 路由器状态

> **面向 OpenWrt 的 Android 本地网络管理工具**（Vibe Coding）

[![GitHub Release](https://img.shields.io/github/v/release/MMCKB/OpenWRT-Status-APP?display_name=tag&style=for-the-badge&logo=android&logoColor=white&label=Release)](https://github.com/MMCKB/OpenWRT-Status-APP/releases)
[![Android 构建](https://img.shields.io/github/actions/workflow/status/MMCKB/OpenWRT-Status-APP/build-android.yml/Build%20and%20release%20Android%20APKs?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=Android%20Build)](https://github.com/MMCKB/OpenWRT-Status-APP/actions/workflows/build-android.yml)
[![GitHub Star](https://img.shields.io/github/stars/MMCKB/OpenWRT-Status-APP?style=for-the-badge&logo=github&label=Stars)](https://github.com/MMCKB/OpenWRT-Status-APP/stargazers)
[![GitHub 下载量](https://img.shields.io/github/downloads/MMCKB/OpenWRT-Status-APP/total?style=for-the-badge&logo=github&label=Downloads)](https://github.com/MMCKB/OpenWRT-Status-APP/releases)
[![许可证：MIT](https://img.shields.io/badge/License-MIT-0B6BCB?style=for-the-badge)](LICENSE)
[![OpenWrt 25.12](https://img.shields.io/badge/OpenWrt-25.12-00A0E9?style=for-the-badge&logo=openwrt&logoColor=white)](https://openwrt.org/)

[下载最新 APK](https://github.com/MMCKB/OpenWRT-Status-APP/releases/latest) · [查看自动构建](https://github.com/MMCKB/OpenWRT-Status-APP/actions) · [为项目点 Star](https://github.com/MMCKB/OpenWRT-Status-APP/stargazers)

**OpenWrt 路由器状态**是一款面向 Android 的本地网络管理工具，用于连接 OpenWrt 路由器并查看状态、执行受控维护操作。应用基于 Expo SDK 54、React Native 0.81 和 Android 原生 SSH 模块构建，保留 React Native 新架构，并面向 OpenWrt 25.12 的 `apk` 包管理方式适配。

> 本项目供具备路由器管理权限的用户在可信网络中使用。SSH、固件升级、防火墙、Docker 和批量操作可能影响网络可用性；执行前请确认已备份配置并了解所执行命令的影响。
> 本项目绝大部分都由AI制作
## 功能概览

| 分类         | 已实现能力                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| 路由器与状态 | 多路由器管理、LuCI/ubus 认证、系统资源、IPv4/IPv6 接口、无线状态、连接设备和路由器健康报告。                  |
| 实时网络     | 每秒级可选刷新、多 WAN/LAN 独立上下行速率曲线、完整图表与紧凑数据两种显示方式、诊断与 WAN 重连。              |
| SSH 与文件   | 应用内嵌 SSH 终端、密码/keyboard-interactive 认证、文件浏览、上传下载、复制移动、重命名、文本编辑和权限修改。 |
| OpenWrt 管理 | OpenWrt 25.12 `apk` 软件包管理、固件上传升级、配置备份恢复、DHCP 与静态租约、无线 SSID 与信道优化。           |
| 服务与安全   | OpenClash、AdGuard Home、Docker 容器、日志中心、防火墙区域、端口转发、UPnP、设备拉黑和 Wake-on-LAN。          |
| 诊断与更新   | 弱信号设备分析、性能基准与自定义域名 Ping、GitHub Release 固件检查、下载和二次确认更新。                      |
| 使用体验     | 简体中文界面、浅色/深色/跟随系统主题、应用内主题弹窗、安全区适配和 Android 返回导航。                         |

## 安装 APK

请前往 [Releases](https://github.com/MMCKB/OpenWRT-Status-APP/releases) 下载与设备 ABI 对应的 APK。每个成功的 `main` 分支构建都会以应用版本号创建或更新同名标签，例如版本 `1.0.16` 对应标签 `v1.0.16`。Release 同时包含 APK 的 SHA-256 校验文件。

| APK 后缀      | 适用设备                                           |
| ------------- | -------------------------------------------------- |
| `arm64-v8a`   | 绝大多数近年的 Android 手机、平板和 ARM64 模拟器。 |
| `armeabi-v7a` | 较旧的 32 位 ARM Android 设备。                    |
| `x86`         | 32 位 x86 Android 模拟器或特定设备。               |
| `x86_64`      | 64 位 x86 Android 模拟器或特定设备。               |

应用的最低 Android 版本为 **Android 7.0（API 24）**。首次安装时，Android 可能要求用户允许浏览器或文件管理器安装未知来源应用。若设备已安装由**不同签名证书**签名的同包名版本，需先卸载旧版本；同一发布签名的版本可以直接覆盖升级。

## 从源码构建

本项目需要 **Node.js 22**、**pnpm 9.12.0**、**JDK 21**、Android SDK、Build Tools 36.0.0 以及 NDK 27.1.12297006。克隆源码并安装依赖后，可先执行质量检查：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

Windows 用户请优先使用完整的四 ABI 自动构建说明：[WINDOWS_FOUR_ABI_BUILD.md](WINDOWS_FOUR_ABI_BUILD.md)。macOS、Linux 和 Windows 的通用环境准备、手动构建、16KB 对齐、签名与安装验证说明见：[LOCAL_ANDROID_BUILD.md](LOCAL_ANDROID_BUILD.md)。

GitHub Actions 会分别构建四种 ABI，使用 `zipalign -P 16` 做 16KB 页面边界对齐、重新进行 v1/v2/v3 签名，并校验 APK 清单中的 `versionName` 与 `versionCode`。为保证工作流可直接运行，它会在每次构建中生成并在结束后删除临时 debug keystore，密钥不会提交到 Git。

> 临时签名意味着不同工作流运行生成的 APK 不具有相同的安装签名。若 Android 报告签名不一致，请先卸载旧包再安装；卸载会清除应用本地存储的路由器资料。若需要长期支持直接覆盖升级，仓库维护者应在后续将稳定的发布 keystore 以 GitHub Secret 保存，并改用该稳定签名身份。

## GitHub Actions 发布机制

工作流位于 [`.github/workflows/build-android.yml`](.github/workflows/build-android.yml)，会在推送到 `main` 或手动运行时执行：

1. 使用 Node.js 22、JDK 21、Android NDK 27.1.12297006 和锁定的 pnpm 依赖进行类型检查和单元测试。
2. 分别构建 `arm64-v8a`、`armeabi-v7a`、`x86` 和 `x86_64` Release APK。
3. 对 APK 进行 16KB 对齐、v1/v2/v3 签名、签名校验和版本核验。
4. 使用 GitHub 平台提供的 `GITHUB_TOKEN` 创建或更新 `v<versionName>` GitHub Release，并上传四个 APK 及对应 SHA-256 文件。

同一个版本标签只能指向一个提交；若修改了发布内容，请先递增 `app.config.ts` 与 `android/app/build.gradle` 中保持一致的版本号，再推送到 `main`。

## 安全提示

请勿提交路由器密码、SSH 私钥、Android keystore、`.env` 文件或 APK 构建产物。

## 许可证

本项目采用 [MIT License](LICENSE) 发布。版权所有 © 2026 MMCKB。
