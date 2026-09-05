# Expo → Kotlin 平移路线图

本分支是 Kotlin + Compose 全量重写。旧版 `main` 分支的每个 TS 模块在此对应如下。

## 引擎层(全部完成,单测锁定行为)

| 旧模块(TS) | 新模块(Kotlin) | 说明 |
| --- | --- | --- |
| `shared/router-types.ts` | `core/model/RouterTypes.kt` | 类型定义;`themeMode` 为 Kotlin 新增 |
| `lib/openwrt-client.ts` | `core/ubus/StatusParsers.kt` + `UbusClient.kt` | **改进**:会话复用 + 失效自动重登重试 |
| `lib/openwrt-luci-system.ts` | `core/commands/LuciSystemCommands.kt` + `LuciSystemParsers.kt` | 全量平移(启动项/LED/挂载/SSH/APK 公钥/uHTTPd/主题/网络/计划任务) |
| `lib/openwrt-admin.ts` | `core/commands/OpenWrtAdmin.kt` | 全量平移(客户端/DHCP/拉黑/WoL/无线/Docker/诊断/测速/基准/硬件/固件/备份) |
| `lib/openwrt-advanced-admin.ts` | `core/commands/OpenWrtAdvancedAdmin.kt` | 全量平移(防火墙/UPnP/日志/健康报告/代理插件设置与配置) |
| `lib/router-package-commands.ts` | `core/commands/RouterPackageCommands.kt` | OpenWrt 25.12 APK 包与软件源 |
| `lib/router-file-commands.ts` | `core/commands/RouterFileCommands.kt` | 远程文件操作命令 |
| `lib/file-manager-utils.ts` | `core/commands/RouterFileCommands.kt`(FileManagerUtils) | 过滤与排序 |
| `lib/traffic-monitor.ts` / `traffic-history.ts` | `core/traffic/TrafficMonitor.kt` | 速率/选路/汇总;历史记录保留在内存(按 WAN 口采样) |
| `lib/github-release.ts` | `core/github/GithubRelease.kt` | Release 枚举/最新版/版本比对(OkHttp) |
| `lib/ssh-client.ts` | `core/ssh/SshTarget.kt` | SSH 目标推导 |
| 原生 `OpenWrtSshModule.java`(JSch) | `app/ssh/SshManager.kt`(sshj) | 含 SFTP;GSS-API 不可用已排除 |
| 原生 `OpenWrtNatModule.java` | `core/nat/NatDetector.kt` | STUN 检测平移为纯 Kotlin(JVM UDP socket) |
| `lib/native-ssh.ts` / `lib/native-nat.ts` | 被 `app/data/RouterSession.kt` 与 `NatDetector` 取代 | 不再需要 RN 桥 |
| `lib/github-firmware-download.ts` | app 层固件流程(sshj SFTP 上传) | 下载走浏览器/系统下载,上传走 SFTP |

测试:`StatusParsersTest`(8)、`LuciSystemCommandsTest`(7)、`UbusClientTest`(3)、
`OpenWrtAdminTest`(16)、`OpenWrtAdvancedAdminTest`/`RouterPackageCommandsTest`/
`RouterFileCommandsTest`/`TrafficMonitorTest`/`GithubReleaseTest`(共 22)。

## UI 层(全部页面已接入导航)

| 旧页面 | 新页面 | 状态 |
| --- | --- | --- |
| `(tabs)/index` + `details` | `DashboardScreen` | ✅ 系统卡片 + 实时速率曲线(Canvas) |
| `(tabs)/control` 内嵌终端 | `SshScreen` + `QuickActionsScreen` | ✅ 命令执行 + 重启/WAN 重连/硬件信息 |
| `(tabs)/tools` / `services` | `ToolsHubScreen` / `ServicesHubScreen` | ✅ 功能聚合入口 |
| `(tabs)/routers` + `router-form` | `RoutersScreen` + `RouterFormScreen` | ✅ |
| `(tabs)/settings` | `SettingsScreen` | ✅ 刷新间隔 + 主题 |
| `system-admin.tsx`(3210 行) | `SystemAdminScreen`(分区) | ✅ 启动项/LED/挂载/SSH 访问+实例+公钥/APK 公钥/uHTTPd/主题/网络接口+设备+全局/计划任务/root 密码 |
| `firewall.tsx` | `FirewallScreen` | ✅ 区域/端口转发/通信规则/UPnP |
| `dhcp-leases.tsx` | `DhcpLeasesScreen` | ✅ |
| `clients.tsx` | `ClientsScreen` | ✅ 含拉黑/解拉黑 |
| `wireless-manager.tsx` + `wireless-optimizer.tsx` | `WirelessManagerScreen` + `WirelessOptimizerScreen` | ✅ 含访客网络 `GuestNetworkScreen` |
| `weak-signal.tsx` | `WeakSignalScreen` | ✅ |
| `packages.tsx` | `PackagesScreen` | ✅ 已安装/可升级/搜索安装/软件源编辑 |
| `files.tsx` | `FilesScreen` | ✅ 浏览/查看编辑/改名/权限/删除/新建目录(上传下载经 SFTP 能力已备) |
| `docker.tsx` | `DockerScreen` | ✅ |
| `logs.tsx` | `LogsScreen` | ✅ 五类日志 + 筛选 |
| `services-health.tsx` | `ServicesHealthScreen` | ✅ 含 Markdown 健康报告 |
| `service-config.tsx` | `ProxyServicesScreen` 内插件设置 | ✅ UCI 设置读取 + 原始配置 base64 保存 |
| `diagnostics.tsx` | `DiagnosticsScreen` | ✅ ping/dns/trace/port + DNS 双栈延迟 |
| `disk-speed.tsx` / `performance-benchmark.tsx` | `DiskSpeedScreen` / `PerformanceBenchmarkScreen` | ✅ |
| `nat-detection.tsx` | `NatDetectionScreen` | ✅ 纯 Kotlin STUN |
| `wake-on-lan.tsx` | `WakeOnLanScreen` | ✅ 目标/候选/手动 |
| `maintenance-tools.tsx` + `firmware.tsx` | `MaintenanceToolsScreen` | ✅ 备份/恢复/固件校验/升级 |
| `firmware-release.tsx` | `FirmwareReleaseScreen` | ✅ GitHub Release 检查与版本比对 |
| `bulk-operations.tsx` | `BulkOperationsScreen` | ✅ 批量诊断/批量配置备份 |
| `quick-actions.tsx` | `QuickActionsScreen` | ✅ |
| `oauth/callback.tsx` 等模板页 | 未平移 | 模板遗留,不迁移 |

## 后续改进项

- 文件管理:SFTP 上传/下载 UI(explorador 能力已在 `SshManager` 中,待接 SAF 文件选择器);
- PTY 交互式终端(建议引入 Termux terminal-view,当前为单命令执行);
- 流量历史持久化(DataStore/Room)与更多时段用量统计;
- CI 发布签名(当前为 debug APK + 未签名 release artifact);
- SSH known_hosts 指纹校验(旧版同为信任任意指纹)。
