# Kotlin Compose 迁移状态

## 当前分支

本文件记录 `dev` 分支的 R2→K1 覆盖升级路径。R2 为仍保留原版 Expo UI 的过渡构建，仅在升级前将本地路由器资料、凭证、应用设置、固件链接和流量历史写入 Android Keystore 保护的 `migration-v1` 存储。K1 为最终纯 Kotlin + Jetpack Compose 构建，保留相同 applicationId 与签名配置，在首次启动时验证摘要后幂等恢复该数据。

## 当前实现范围

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 自定义主题 | 已实现 | 使用原版蓝绿主色、浅深主题、圆角和非默认 MD3 仪表盘层级。 |
| 七项导航 | 已实现 | 状态、网络、DHCP、服务、终端、工具、设置均有独立一级入口。 |
| 路由器与状态 | 已实现 | 多路由器、LuCI ubus 状态读取、SSH 会话、接口/无线/系统状态。 |
| 文件与命令 | 已实现 | SSH 终端、SFTP 文件浏览、读写、复制、移动、删除、权限修改。 |
| 网络与服务 | 已实现 | 网络、无线、DHCP、防火墙、WOL、服务、软件包和 UCI 快照编辑入口。 |
| R2→K1 恢复 | 已实现 | 完整性摘要、版本校验、导入中断续跑、导入完成标记。 |
| 升级协议单元测试 | 已通过 | 9 项 JVM 测试覆盖 R2 v1 payload 解析、多路由器及凭证字段、摘要前数据格式、K1 中断后续跑门控、SSH 命令安全和 STUN NAT 解析。 |
| Kotlin 编译与 Lint | 已通过 | `:app:compileDebugKotlin` 与 `:app:lintDebug` 已在纯 Kotlin 工程中通过。 |
| Debug 四 ABI APK | 已通过 | 已生成 `armeabi-v7a`、`arm64-v8a`、`x86`、`x86_64` Debug APK。 |
| 截图回归 | 受环境限制 | 当前环境未安装 Android Emulator/adb 且无连接设备，无法伪造设备截图；K1 保留原版主题令牌、七项导航和仪表盘布局，待在有 Android 设备或模拟器的 CI/本机执行像素截图基线对比。 |
| 签名 Release 四 ABI | 已通过 | GitHub Actions [run 32342701491](https://github.com/MMCKB/OpenWRT-Status-APP/actions/runs/32342701491) 已使用既有四项 Release Secrets 成功执行 `:app:testDebugUnitTest`、`:app:assembleRelease` 和 `:app:lintDebug`；手动 Dev 构建不创建标签或 GitHub Release。 |

## 升级规则

覆盖升级需要保持 applicationId、签名证书和 Android Keystore 可访问性不变。卸载 R2、清除其应用数据、更换签名证书或恢复出厂设置都会使 Keystore 数据不可恢复；K1 会安全跳过不存在或校验失败的迁移仓，不会因此清空已存在的 K1 数据。
