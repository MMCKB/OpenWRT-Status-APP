# Flutter UI 与 Rust 原生库契约

## 架构边界

Flutter 只承担页面布局、导航、动画、表单状态、Android 系统交互和 Android Keystore 支撑的机密存储适配。`openwrt-core` 是唯一的 OpenWrt 领域、安全策略、LuCI/ubus、SSH、SFTP、快照和审计实现；`openwrt-ffi` 仅将其编译为 Android `libopenwrt_ffi.so` 并提供极薄 C ABI。

```text
Flutter widgets / state
        │ UTF-8 JSON via dart:ffi
        ▼
openwrt-ffi (request dispatch, no duplicated policy)
        ▼
openwrt-core (LuCI, SSH/SFTP, fingerprints, snapshots, approvals, audit)
```

应用中**不存在**状态预览、模拟在线状态或伪操作入口。未创建路由器档案时，Flutter 显示明确的空状态；未提供可用凭据、连接失败或路由器拒绝请求时，Flutter 只展示 Rust 返回的真实错误。

## 统一 C ABI

| 导出函数 | 输入 | 输出与所有权 |
| --- | --- | --- |
| `openwrt_ffi_call_json` | NUL 结尾的 UTF-8 JSON 请求 | Rust 分配的 NUL 结尾 UTF-8 JSON 响应；Dart 必须调用释放函数。 |
| `openwrt_ffi_string_free` | 上述 Rust 返回指针 | 释放一次；不得释放空指针或静态字符串。 |
| `openwrt_ffi_version_json` | 无 | 静态 ABI/核心版本标识，仅用于加载自检；Dart 不释放。 |

所有请求都使用 `{"action":"...","payload":{...}}`，所有响应都使用以下信封之一：

```json
{"ok": true, "value": {}}
{"ok": false, "error": {"code":"connection_failed", "message":"...", "details":{}}}
```

错误 `message` 可展示给用户；`details` 只能包含脱敏的结构化上下文。响应不得包含密码、LuCI 会话令牌、私钥、Cookie、认证头、原始 SSH 主机公钥或未脱敏命令审计正文。

## 初始真实功能动作

| 动作 | 真实 Rust 行为 | 机密与安全约束 |
| --- | --- | --- |
| `normalize_endpoint` | 调用 `normalize_router_endpoint`。 | 不接受或返回凭据。 |
| `status.fetch` | 使用 `LuCiClient::login` 和 `fetch_status` 读取 `system.board`、`system.info`、接口与计数器。 | 密码只在本次 JSON 调用的 Rust 内存中存在；失败直接返回真实连接/RPC 错误。 |
| `traffic.sample` | 预留，尚未暴露为 ABI；当前状态页只显示 `status.fetch` 返回的真实接口累计计数。 | 实现前不得显示模拟速率或自动轮询文案。 |
| `profile.list/upsert/remove` | 用 `RouterProfileStore` 保存应用专属目录中的非机密档案、偏好、主机信任和审计记录。 | JSON 文档永远不保存密码、私钥、Token 或 Cookie。 |
| `operation.policy` | 基于 `RouterOperation` 生成确认级别与快照要求。 | Flutter 不得自行推断或放宽规则。 |
| `ssh.read` | 用 `SshClient::execute_read` 执行受限只读目录。 | 未知或变更的主机密钥返回精确 SHA-256 指纹确认请求。 |
| `ssh.terminal` | 已接入：调用 `SshClient::execute_terminal` 执行用户输入的终端命令。 | 每次必须精确输入“执行 SSH 终端命令”；未知或变更主机密钥仍需指纹确认。 |
| `snapshot.create/list` | 已接入：经已验证 SSH/SFTP 读取 `/etc/config/network`、`wireless`、`firewall`、`dhcp` 并保存为应用专属配置快照。 | 创建需单次确认；快照内容不进入审计摘要或 FFI 错误。 |
| `ssh.managed` | 已接入：服务、软件包、Docker、WOL、结构化 UCI 选项、固件升级和重启，全部经 `ManagedCommand::prepare` 和 `OperationApproval` 验证。 | 高风险操作还会读取本机快照文件，验证其存在且 `router_id` 与当前档案一致，再校验精确文本确认。 |
| `sftp.list/read/write/delete/rename` | 预留，尚未暴露为 ABI。 | 实现前不得在 Flutter 中展示为可用功能。 |

后续页面动作可扩展为稳定 `action` 名称，但不得暴露“执行任意未审批 shell 命令”“自动信任 SSH 主机密钥”或绕过 Rust 操作门禁的 ABI。

## 请求凭据模型

真实连接动作接收一次性 `connection` 对象：

```json
{
  "profile": {
    "id": "router-id",
    "name": "显示名称",
    "baseUrl": "https://router.example",
    "username": "root",
    "sshPort": 22
  },
  "luciPassword": "仅本次调用",
  "sshPassword": "仅本次调用",
  "approvedFingerprintSha256": "仅用户确认后提供"
}
```

Flutter 可以通过 Android Keystore 支撑的安全存储保存用户选择记住的机密，但每次调用只在内存中读取并传入 Rust；Rust 不会将它们写入档案、快照、错误、审计或 FFI 响应。用户名、端点、SSH 端口等非机密元数据由 Rust 档案仓库保存。

## Flutter 责任

Flutter 必须以请求中的 `routerId` 和 Rust 返回的状态渲染页面。每一个联网入口都要表现为加载、成功、空状态或明确错误；没有档案时引导用户创建档案，而不是填入默认路由器或构造示例数据。Flutter 负责呈现主机指纹、确认对话框和输入框，但由 Rust 校验确认短语、快照 ID 与实际执行条件。

## Android 打包

Gradle `preBuild` 任务使用 NDK r27d 构建 ARM64 `libopenwrt_ffi.so` 并复制到 APK 的 `lib/arm64-v8a/`。Dart 使用 `DynamicLibrary.open("libopenwrt_ffi.so")` 加载库。JNI 动态库是构建产物，不能提交；CI 必须构建 APK 并检查其中的原生库。
