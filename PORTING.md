# Expo → Kotlin 平移路线图

本分支是 Kotlin + Compose 全量重写。旧版 `main` 分支的每个 TS 模块在此对应如下。

## 引擎层(已全部完成,单测锁定行为)

| 旧模块(TS) | 新模块(Kotlin) | 说明 |
| --- | --- | --- |
| `shared/router-types.ts` | `core/model/RouterTypes.kt` | 类型定义;`themeMode` 为 Kotlin 新增 |
| `lib/openwrt-client.ts` | `core/ubus/StatusParsers.kt` + `core/ubus/UbusClient.kt` | **改进**:会话复用 + 失效自动重登重试(旧版每次刷新都重新登录) |
| `lib/openwrt-luci-system.ts` | `core/commands/LuciSystemCommands.kt` + `LuciSystemParsers.kt` + `LuciSystemTypes.kt` | 全部构建器/解析器逐字平移;`parseListenEntries`(旧版死代码)未平移 |
| `lib/ssh-client.ts` | `core/ssh/SshTarget.kt` | getSshTarget/makeSshUri |
| `lib/router-storage.ts` | `app/data/RouterRepository.kt` | AsyncStorage→DataStore;SecureStore→EncryptedSharedPreferences;**关闭云备份** |
| 原生 `OpenWrtSshModule.java`(JSch) | `app/ssh/SshManager.kt`(sshj) | JSch 不再维护;GSS-API 认证在 Android 不可用已排除 |
| 原生 `OpenWrtNatModule.java` | ⏳ 待平移 | NAT 类型检测 |
| `lib/traffic-monitor.ts` / `traffic-history.ts` | ⏳ 待平移 | 速率计算与历史(依赖 Room 或自建存储) |
| `lib/github-release.ts` / `github-firmware-download.ts` | ⏳ 待平移 | 固件更新检查 |

已平移的测试:`tests/openwrt-client.test.ts` → `StatusParsersTest`(8)、
`tests/openwrt-luci-system.test.ts` → `LuciSystemCommandsTest`(7)、
新增 `UbusClientTest`(3,MockWebServer 验证登录/复用/重试)。

## UI 层

| 旧页面 | 新页面 | 状态 |
| --- | --- | --- |
| `app/(tabs)/index.tsx` + `details.tsx` | `ui/dashboard/DashboardScreen.kt` | ✅ 系统/接口/无线卡片 + 轮询;速率曲线待做 |
| `app/(tabs)/routers.tsx` + `router-form.tsx` | `ui/routers/RoutersScreen.kt` + `RouterFormScreen.kt` | ✅ |
| `app/(tabs)/control.tsx` 内嵌终端 | `ui/ssh/SshScreen.kt` | ✅ 简化版(命令执行);**PTY 终端建议引入 Termux terminal-view + terminal-emulator** |
| `app/(tabs)/settings.tsx` | `ui/settings/SettingsScreen.kt` | ✅ 刷新间隔 + 主题 |
| `app/system-admin.tsx`(3210 行) | 按 LuciSystemCommands 拆分 | ⏳ 启动项/LED/挂载/SSH 实例/uHTTPd/网络接口/计划任务 命令层已就绪 |
| `app/files.tsx` | 基于 SshManager SFTP | ⏳ |
| `app/packages.tsx`(apk 包管理) | ⏳ | 需平移 `lib/router-package-commands.ts` |
| `app/firewall.tsx` / `dhcp-leases.tsx` / `wireless-manager.tsx` 等 | ⏳ | 需平移 `lib/openwrt-admin.ts` / `router-file-commands.ts` |
| 固件升级、Docker、OpenClash、AdGuardHome、WoL、UPnP、日志、弱信号、性能基准 | ⏳ | 按使用频率排期 |

## 建议的迭代顺序

1. **真实设备联调**:仪表盘 + SSH 执行 + 会话复用验证(重点回归 1 秒刷新);
2. **PTY 交互式终端**(Termux terminal-view,这是换原生的最大收益点);
3. **系统管理页**(命令层已全部就绪,只差 UI):启动项 → SSH 实例 → 网络接口 → LED → 挂载;
4. **流量速率曲线**(port `traffic-monitor.ts`,Compose Canvas 绘制);
5. **文件管理器**(SFTP 浏览/上传/下载/权限);
6. **软件包管理 + 固件检查升级**(`router-package-commands.ts`、`github-release.ts`);
7. 其余管理页按需推进;预测性返回在 Compose Navigation 中开箱即用,无需额外工作。

## 已知差异/待办

- SSH 主机密钥:旧版与新版均信任任意指纹,应改为按主机持久化 known_hosts;
- CI 目前产出 debug APK + 未签名 release APK,发布签名流程待恢复(参照 `main` 分支旧工作流);
- WoL 的 UDP 广播在原生侧可直接实现,无需原生模块。
