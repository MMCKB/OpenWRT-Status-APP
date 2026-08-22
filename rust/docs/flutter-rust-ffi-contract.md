# Flutter UI 与 Rust 原生库契约

## 架构

Flutter 只承担界面、路由、动画、表单状态和 Android 系统交互。`openwrt-core` 保留为唯一的 OpenWrt 领域与安全策略实现；新增 `openwrt-ffi` 以 `cdylib` 形式编译为 Android `libopenwrt_ffi.so`，通过稳定的 C ABI 供 Dart `dart:ffi` 调用。

```text
Flutter widgets / Riverpod state
        │ JSON UTF-8 through dart:ffi
        ▼
openwrt-ffi (small C ABI, no policy duplication)
        ▼
openwrt-core (LuCI, SSH fingerprints, snapshots, approvals, audit)
```

## 初始 FFI 端点

| 导出函数 | 输入 | 输出 | 安全边界 |
| --- | --- | --- | --- |
| `openwrt_ffi_version` | 无 | 静态版本字符串 | 仅用于加载自检。 |
| `openwrt_normalize_endpoint_json` | `{"baseUrl":"..."}` | `{"endpoint":"..."}` 或 `{"error":"..."}` | 复用 Rust URL 规范化，不在 Dart 重写规则。 |
| `openwrt_operation_policy_json` | 操作类型与路由器 ID | 确认级别、快照需求、错误 | 复用 `OperationApproval::validate()`。 |
| `openwrt_status_preview_json` | 脱敏状态输入 | Flutter 状态卡片可消费 JSON | 供启动与离线 UI 自检；真实 LuCI 拉取在后续端点接入。 |
| `openwrt_string_free` | Rust 返回字符串指针 | 无 | 每个 Rust 分配的结果必须由调用方显式释放。 |

## 不允许越过 Rust 的路径

Flutter 不保存 SSH 指纹信任结果、不会生成 shell 命令、不会判断固件路径是否安全，也不会自行放宽文本确认或快照规则。密码、令牌和私钥不返回给 Dart；页面只保留表单输入直到 Rust 原生调用完成。

## Android 打包

Gradle 的 `preBuild` 任务负责使用 NDK r27d 生成 ARM64 `libopenwrt_ffi.so`，复制到 `android/app/src/main/jniLibs/arm64-v8a/`。Flutter 的 `DynamicLibrary.open("libopenwrt_ffi.so")` 从 APK 内的 JNI 库目录加载该文件。初始提交先将 Flutter scaffold、Rust cdylib 和明确的 Gradle 构建脚本置于同一分支；CI 随后构建 APK 验证。
