# OpenWrt Status Rust Workspace

本目录是 `Rust-Dev` 分支的 Rust-first 客户端工作区。它将可测试、可共享的领域逻辑从现有 Expo/React Native 实现中抽离，并使用 Dioxus 作为 Rust UI 候选。

## 模块

| Crate | 职责 |
|---|---|
| `openwrt-core` | 路由器/状态模型、实时流量采样、配置快照 diff、诊断报告、SSH 主机指纹信任策略 |
| `openwrt-mobile` | Dioxus Rust UI：状态仪表盘、主题、Tab 入口、指标条和局部刷新状态 |
| `openwrt-cli` | 不依赖 Android SDK 的核心验收入口，供 CI 执行 |

## 本地验证

```bash
cd rust
cargo fmt --check
cargo check --workspace
cargo test --workspace
cargo run -p openwrt-cli
```

## Android 构建前置条件

纯 Rust Android UI 仍需要 Android SDK、NDK、JDK、Gradle/Activity 打包层和四个 ABI 的交叉链接器。当前 Rust 工具链已固定以下 target：

- `aarch64-linux-android`
- `armv7-linux-androideabi`
- `i686-linux-android`
- `x86_64-linux-android`

在 Android SDK/NDK 可用的开发或 CI 环境中，应先完成 Dioxus Android 原型的 Debug 和 Release 包构建，再继续迁移文件选择、通知、系统主题图标、SSH/SFTP 与高风险路由器管理操作。

## 安全原则

`openwrt-core::ssh::TrustedHostStore` 已建立“首次确认、后续验证、指纹变化阻断”的领域模型。任何未来 SSH 客户端实现都不得回退到自动接受未知主机密钥的策略。
