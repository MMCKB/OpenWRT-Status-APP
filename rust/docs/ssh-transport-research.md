# SSH/SFTP 传输层实现依据

**日期：** 2026-08-22  
**范围：** Rust-Dev 分支的 SSH 终端、SFTP 文件管理与主机密钥验证基础层。

本实现选择 **Russh 0.63.0** 与 **russh-sftp 2.4.0**。两者均为 Rust 异步库，可在 Tokio 运行时中提供 SSH 会话、密码或公钥认证、命令通道，以及 SFTP 文件系统操作。[1] [2] [3]

| 需求 | 已验证的库能力 | 实现约束 |
| --- | --- | --- |
| 主机身份验证 | `Handler::check_server_key` 在 SSH 握手中返回接受或拒绝结果。 | 仅当 `TrustedHostStore` 判定为 `Trusted` 时返回接受；首次发现和指纹变化必须中断连接并由 UI 显示确认信息。 |
| SSH 密码认证 | `Handle::authenticate_password` 支持密码认证。 | 密码仅驻留当前连接内存，不能写入 JSON 档案、日志或诊断报告。 |
| 远程命令 | `Handle::channel_open_session` 可创建会话通道；通道执行命令并返回输出与退出码。 | 发送命令前必须实施操作策略；配置写入、删除、网络、防火墙和固件相关操作均需要 `OperationApproval::validate()`。 |
| SFTP 文件操作 | `SftpSession` 支持读取目录、读写文件、重命名、删除和元数据查询。 | 写入与删除前必须实施对应高风险操作审批；路径传递为参数而非拼接 shell 命令。 |
| 超时与失败 | Russh 客户端配置及 SFTP 会话都支持超时机制。 | SSH 连接、认证、命令、SFTP 操作都须设置上限，错误信息不得泄露密码或私钥内容。 |

> **不可接受的实现：** 不使用 `StrictHostKeyChecking=no`、不为首次发现的主机指纹静默放行、不以“发生连接错误后重试并接受”为回退策略。

## 参考资料

[1]: https://github.com/Eugeny/russh "Russh 项目：Tokio SSH2 客户端与服务端实现"
[2]: https://docs.rs/russh/0.63.0/russh/client/trait.Handler.html "Russh 0.63.0：client::Handler"
[3]: https://docs.rs/russh-sftp/2.4.0/russh_sftp/client/struct.SftpSession.html "russh-sftp 2.4.0：SftpSession"
