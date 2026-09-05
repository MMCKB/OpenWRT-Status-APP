# OpenWrt 路由器状态(Kotlin 重写版)

> **面向 OpenWrt 的 Android 本地网络管理工具 —— Kotlin + Jetpack Compose 原生重写**

本分支(`Kotlin-Dev`)是原 Expo/React Native 版本的**全量原生重写**:不再依赖 Expo、
React Native 与 JS 原生桥,直接使用 Kotlin + Jetpack Compose + sshj 构建,
APK 体积从四 ABI 各几十 MB 降到约 3.2 MB(R8 后),SSH 终端、后台轮询、
预测性返回等系统级能力全部走 Android 一等公民 API。

Expo 旧版代码保留在 `main` 分支,Releases 中的旧 APK 继续可用。

## 当前进度

| 模块 | 状态 |
| --- | --- |
| ubus/LuCI JSON-RPC 客户端(含会话复用与失效重试) | ✅ 已完成,带 MockWebServer 单测 |
| 状态解析与格式化(系统/接口/无线) | ✅ 已完成,带单测(与旧版逐字对齐) |
| LuCI 系统管理命令构建器(uci/shell,注入防护) | ✅ 已完成,带单测(与旧版逐字对齐) |
| SSH 执行/SFTP(sshj 替代 JSch) | ✅ 基础能力,交互式 PTY 终端待做 |
| 路由器管理(添加/编辑/删除/选择,Keystore 加密密码) | ✅ 已完成 |
| 状态仪表盘(轮询刷新,1 秒档位支持) | ✅ 已完成(暂无速率曲线) |
| 设置(刷新间隔/主题) | ✅ 已完成 |
| 其余 30+ 管理页面(防火墙、软件包、Docker 等) | ⏳ 见 [PORTING.md](PORTING.md) 路线图 |

详细平移路线图与模块映射见 [PORTING.md](PORTING.md)。

## 从源码构建

需要 **JDK 17** 与 **Android SDK(Platform 36, Build Tools 36)**;无需 Node.js。

```bash
./gradlew :core:test          # 引擎层单测(无需 Android SDK)
./gradlew :app:assembleDebug  # 调试 APK
./gradlew :app:assembleRelease
```

## 安全说明

- 路由器密码通过 Android Keystore 加密存储(`EncryptedSharedPreferences`),
  并已关闭云备份(`allowBackup="false"`);
- 所有发往路由器的 shell 命令由 core 模块构建,用户输入经白名单校验与
  POSIX 单引号转义,行为由单测锁定;
- 与旧版一致,SSH 暂时信任任意主机密钥,后续将改为按主机记录指纹;
- 请勿提交路由器密码、SSH 私钥、keystore 或 `.env` 文件。

## 许可证

[MIT License](LICENSE)
