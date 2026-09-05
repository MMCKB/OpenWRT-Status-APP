package com.app.openwrtstatusapp.ui.tools

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.core.commands.DhcpStaticLeaseDraft
import com.app.openwrtstatusapp.core.commands.DnsFamily
import com.app.openwrtstatusapp.core.commands.DiskSpeedResult
import com.app.openwrtstatusapp.core.commands.FirmwareDeviceInfo
import com.app.openwrtstatusapp.core.commands.ManagedBy
import com.app.openwrtstatusapp.core.commands.OpenWrtAdmin
import com.app.openwrtstatusapp.core.commands.PerformanceBenchmark
import com.app.openwrtstatusapp.core.commands.RouterHardwareDetails
import com.app.openwrtstatusapp.core.commands.ServiceAction
import com.app.openwrtstatusapp.core.commands.WanDiagnosticKind
import com.app.openwrtstatusapp.core.commands.WifiConfigEntry
import com.app.openwrtstatusapp.core.commands.WolDevice
import com.app.openwrtstatusapp.core.model.OpenWrtConnectionException
import com.app.openwrtstatusapp.core.nat.NatDetector
import com.app.openwrtstatusapp.core.ubus.formatBytes
import com.app.openwrtstatusapp.ui.common.ActionButton
import com.app.openwrtstatusapp.ui.common.ConfirmDialog
import com.app.openwrtstatusapp.ui.common.InfoRow
import com.app.openwrtstatusapp.ui.common.OutputPanel
import com.app.openwrtstatusapp.ui.common.ScreenScaffold
import com.app.openwrtstatusapp.ui.common.SectionCard
import com.app.openwrtstatusapp.ui.common.TaskState
import com.app.openwrtstatusapp.ui.common.rememberTaskState
import com.app.openwrtstatusapp.ui.common.runTask
import com.app.openwrtstatusapp.ui.common.selectedRouterOrNull
import kotlinx.coroutines.launch

/** 快捷操作:重启、WAN 重连、硬件详情。 */
@Composable
fun QuickActionsScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var confirmReboot by remember { mutableStateOf(false) }
    var details by remember { mutableStateOf<RouterHardwareDetails?>(null) }
    var wanName by remember { mutableStateOf("wan") }

    fun loadDetails() = runTask(scope, state, silent = true) {
        details = OpenWrtAdmin.parseRouterHardwareDetails(
            AppGraph.session.exec(router, OpenWrtAdmin.buildRouterHardwareDetailsCommand()),
        )
        "已加载硬件信息。"
    }
    LaunchedEffect(router.id) { loadDetails() }

    ScreenScaffold("快捷操作") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionCard("系统操作") {
                OutlinedTextField(wanName, { wanName = it }, label = { Text("WAN 接口名") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionButton("重启路由器", danger = true) { confirmReboot = true }
                    ActionButton("重连 WAN", enabled = !state.loading) {
                        scope.launch {
                            runTask(scope, state) {
                                AppGraph.session.exec(router, OpenWrtAdmin.buildWanReconnectCommand(wanName.ifBlank { "wan" }))
                            }
                        }
                    }
                }
            }
            details?.let { current ->
                SectionCard("硬件信息") {
                    InfoRow("CPU", current.cpuModel ?: "—")
                    InfoRow("核心数", current.cpuCores?.toInt()?.toString() ?: "—")
                    InfoRow("内核", current.kernelVersion ?: "—")
                    if (current.wifiTemperaturesC.isNotEmpty()) {
                        InfoRow("无线温度", current.wifiTemperaturesC.joinToString("、") { "$it °C" })
                    }
                    if (current.sensorTemperaturesC.isNotEmpty()) {
                        InfoRow("传感器温度", current.sensorTemperaturesC.joinToString("、") { "$it °C" })
                    }
                }
            }
            OutputPanel(state)
        }
    }

    if (confirmReboot) {
        ConfirmDialog(
            title = "重启路由器",
            text = "重启期间网络会中断,确定继续吗?",
            confirmLabel = "重启",
            onConfirm = {
                confirmReboot = false
                scope.launch {
                    runTask(scope, state) {
                        AppGraph.session.exec(router, "/sbin/reboot; echo '重启命令已下发。'")
                    }
                }
            },
            onDismiss = { confirmReboot = false },
        )
    }
}

/** WAN 诊断:ping / DNS / 路由追踪 / 端口连通性 + DNS 延迟。 */
@Composable
fun DiagnosticsScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var target by remember { mutableStateOf("openwrt.org") }
    var wanName by remember { mutableStateOf("wan") }
    var dnsServer by remember { mutableStateOf("1.1.1.1") }

    fun runDiagnostic(kind: WanDiagnosticKind) = runTask(scope, state) {
        AppGraph.session.exec(router, OpenWrtAdmin.buildWanDiagnosticCommand(wanName, kind, target))
    }

    ScreenScaffold("网络诊断") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionCard("诊断目标") {
                OutlinedTextField(target, { target = it }, label = { Text("域名或 IPv4 地址") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(wanName, { wanName = it }, label = { Text("WAN 接口名") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            }
            SectionCard("连通性测试") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionButton("Ping", enabled = !state.loading) { runDiagnostic(WanDiagnosticKind.PING) }
                    ActionButton("DNS 解析", enabled = !state.loading) { runDiagnostic(WanDiagnosticKind.DNS) }
                    ActionButton("路由追踪", enabled = !state.loading) { runDiagnostic(WanDiagnosticKind.TRACE) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionButton("端口 443", enabled = !state.loading) { runDiagnostic(WanDiagnosticKind.PORT) }
                }
            }
            SectionCard("DNS 延迟") {
                OutlinedTextField(dnsServer, { dnsServer = it }, label = { Text("DNS 服务器") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionButton("IPv4 查询", enabled = !state.loading) {
                        scope.launch {
                            runTask(scope, state) {
                                AppGraph.session.exec(router, OpenWrtAdmin.buildDnsLatencyCommand(wanName, dnsServer, DnsFamily.IPV4, target.ifBlank { "openwrt.org" }))
                            }
                        }
                    }
                    ActionButton("IPv6 查询", enabled = !state.loading) {
                        scope.launch {
                            runTask(scope, state) {
                                AppGraph.session.exec(router, OpenWrtAdmin.buildDnsLatencyCommand(wanName, dnsServer, DnsFamily.IPV6, target.ifBlank { "openwrt.org" }))
                            }
                        }
                    }
                }
            }
            OutputPanel(state)
        }
    }
}

/** 硬盘读写测速。 */
@Composable
fun DiskSpeedScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var directory by remember { mutableStateOf("/tmp") }
    var sizeMb by remember { mutableStateOf("128") }
    var result by remember { mutableStateOf<DiskSpeedResult?>(null) }

    ScreenScaffold("硬盘测速") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionCard("测速参数") {
                OutlinedTextField(directory, { directory = it }, label = { Text("测速目录(绝对路径)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(sizeMb, { sizeMb = it.filter { ch -> ch.isDigit() } }, label = { Text("测试文件大小(MB,1–2048)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                ActionButton("开始测速", enabled = !state.loading) {
                    scope.launch {
                        runTask(scope, state) {
                            val output = AppGraph.session.exec(
                                router,
                                OpenWrtAdmin.buildDiskSpeedCommand(directory, sizeMb.toIntOrNull() ?: 128),
                            )
                            result = OpenWrtAdmin.parseDiskSpeedResult(output)
                            output
                        }
                    }
                }
            }
            result?.let { current ->
                SectionCard("测速结果") {
                    InfoRow("目录", current.directory)
                    InfoRow("写入速度", current.writeSpeedMBps?.let { "$it MB/s" } ?: "失败")
                    InfoRow("读取速度", current.readSpeedMBps?.let { "$it MB/s" } ?: "失败")
                    InfoRow("耗时", "写 ${current.writeDurationMs ?: "—"} ms / 读 ${current.readDurationMs ?: "—"} ms")
                }
            }
            OutputPanel(state)
        }
    }
}

/** 性能基准。 */
@Composable
fun PerformanceBenchmarkScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var benchmark by remember { mutableStateOf<PerformanceBenchmark?>(null) }

    ScreenScaffold("性能基准") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ActionButton("采集基准数据", enabled = !state.loading) {
                scope.launch {
                    runTask(scope, state) {
                        val output = AppGraph.session.exec(router, OpenWrtAdmin.buildPerformanceBenchmarkCommand())
                        benchmark = OpenWrtAdmin.parsePerformanceBenchmark(output)
                        "采集完成。"
                    }
                }
            }
            benchmark?.let { current ->
                SectionCard("系统") {
                    InfoRow("CPU", current.cpuModel ?: "—")
                    InfoRow("核心数", current.cpuCores?.toInt()?.toString() ?: "—")
                    InfoRow("负载", current.loadAverage?.toString() ?: "—")
                    InfoRow("内存", "${formatBytes(current.memoryAvailableKb?.times(1024))} 可用 / ${formatBytes(current.memoryTotalKb?.times(1024))}")
                    InfoRow("存储", "已用 ${formatBytes(current.storageUsedKb?.times(1024))} / 可用 ${formatBytes(current.storageAvailableKb?.times(1024))}")
                }
            }
            OutputPanel(state)
        }
    }
}

/** 手机侧 NAT 类型检测(STUN,不经路由器)。 */
@Composable
fun NatDetectionScreen() {
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var result by remember { mutableStateOf<com.app.openwrtstatusapp.core.nat.PhoneNatResult?>(null) }

    ScreenScaffold("NAT 检测(手机网络)") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "通过 STUN 检测手机当前网络的公网映射与 NAT 类型,不连接路由器。",
                style = MaterialTheme.typography.bodySmall,
            )
            ActionButton("开始检测", enabled = !state.loading) {
                scope.launch {
                    runTask(scope, state) {
                        result = NatDetector.detect()
                        "检测完成。"
                    }
                }
            }
            result?.let { current ->
                SectionCard("检测结果") {
                    InfoRow("公网地址", "${current.publicAddress}:${current.publicPort}")
                    InfoRow("主检测服务器", current.primaryServer)
                    InfoRow("NAT 类型", current.typeLabel)
                    if (current.comparisonAddress != null) {
                        InfoRow("比对端点", "${current.comparisonAddress}:${current.comparisonPort} (${current.comparisonServer})")
                    }
                }
            }
            OutputPanel(state)
        }
    }
}

/** 网络唤醒:目标列表 + 已知设备 + 手动唤醒。 */
@Composable
fun WakeOnLanScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var targets by remember { mutableStateOf<List<WolDevice>>(emptyList()) }
    var candidates by remember { mutableStateOf<List<WolDevice>>(emptyList()) }
    var manualMac by remember { mutableStateOf("") }
    var saveTarget by remember { mutableStateOf<WolDevice?>(null) }

    fun loadTargets() = runTask(scope, state, silent = true) {
        targets = OpenWrtAdmin.parseWolDevices(AppGraph.session.exec(router, OpenWrtAdmin.buildWolDevicesSnapshotCommand()))
        "已加载 ${targets.size} 个唤醒目标。"
    }
    fun loadCandidates() = runTask(scope, state) {
        candidates = OpenWrtAdmin.parseWolCandidates(AppGraph.session.exec(router, OpenWrtAdmin.buildWolCandidatesSnapshotCommand()))
        "已发现 ${candidates.size} 台已知设备。"
    }
    LaunchedEffect(router.id) { loadTargets() }

    ScreenScaffold("网络唤醒") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutputPanel(state)
            SectionCard("唤醒目标") {
                if (targets.isEmpty()) Text("暂无保存的目标。")
                targets.forEach { device ->
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(device.hostname ?: device.mac)
                            Text(device.ipv4 ?: device.mac, style = MaterialTheme.typography.bodySmall)
                        }
                        ActionButton("唤醒", enabled = !state.loading) {
                            scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildWakeOnLanCommand(device.mac)) } }
                        }
                        TextButton(onClick = { saveTarget = device }) { Text("移除") }
                    }
                }
            }
            SectionCard("手动唤醒") {
                OutlinedTextField(manualMac, { manualMac = it }, label = { Text("MAC 地址") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                ActionButton("唤醒此 MAC", enabled = !state.loading && manualMac.isNotBlank()) {
                    scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildWakeOnLanCommand(manualMac)) } }
                }
            }
            SectionCard("已知设备") {
                ActionButton("扫描已知设备", enabled = !state.loading) { scope.launch { loadCandidates() } }
                candidates.forEach { device ->
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(device.hostname ?: device.mac)
                            Text(device.ipv4 ?: "—", style = MaterialTheme.typography.bodySmall)
                        }
                        ActionButton("唤醒") {
                            scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildWakeOnLanCommand(device.mac)) } }
                        }
                        TextButton(onClick = { saveTarget = device }) { Text("保存") }
                    }
                }
            }
        }
    }

    saveTarget?.let { device ->
        ConfirmDialog(
            title = if (targets.any { it.mac == device.mac }) "从目标中移除" else "保存为唤醒目标",
            text = device.hostname ?: device.mac,
            confirmLabel = "确定",
            onConfirm = {
                saveTarget = null
                scope.launch {
                    runTask(scope, state) {
                        val output = AppGraph.session.exec(router, OpenWrtAdmin.buildWolTargetSaveCommand(device))
                        if (targets.any { it.mac == device.mac }) {
                            // 已存在的目标:移除 = 删除对应 UCI 段
                            AppGraph.session.exec(
                                router,
                                "uci -q delete wol.openwrt_app_wol_${device.mac.replace(":", "_").lowercase()}; uci commit wol; /etc/init.d/wol reload >/dev/null 2>&1 || true",
                            )
                        }
                        loadTargets()
                    }
                }
            },
            onDismiss = { saveTarget = null },
        )
    }
}

/** 维护工具:配置备份/恢复 + 固件校验升级 + 设备信息。 */
@Composable
fun MaintenanceToolsScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var deviceInfo by remember { mutableStateOf<FirmwareDeviceInfo?>(null) }
    var remotePath by remember { mutableStateOf("") }
    var preserveConfig by remember { mutableStateOf(true) }
    var confirmUpgrade by remember { mutableStateOf(false) }

    fun loadInfo() = runTask(scope, state, silent = true) {
        deviceInfo = OpenWrtAdmin.parseFirmwareDeviceInfo(
            AppGraph.session.exec(router, OpenWrtAdmin.buildFirmwareDeviceInfoCommand()),
        )
        "已加载设备信息。"
    }
    LaunchedEffect(router.id) { loadInfo() }

    ScreenScaffold("维护工具") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            deviceInfo?.let { current ->
                SectionCard("设备信息") {
                    InfoRow("型号", current.model ?: "—")
                    InfoRow("架构", current.boardName ?: "—")
                    InfoRow("固件", current.description ?: "—")
                    InfoRow("目标平台", current.target ?: "—")
                }
            }
            SectionCard("配置备份 / 恢复") {
                ActionButton("生成配置备份(/tmp)", enabled = !state.loading) {
                    scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildBackupCommand()) } }
                }
                Text("备份文件:${OpenWrtAdmin.BACKUP_REMOTE_PATH}", style = MaterialTheme.typography.bodySmall)
                ActionButton("从备份恢复", enabled = !state.loading, danger = true) {
                    scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildRestoreCommand()) } }
                }
            }
            SectionCard("固件升级(sysupgrade)") {
                OutlinedTextField(
                    remotePath,
                    { remotePath = it },
                    label = { Text("固件路径(/tmp/manus-xxx.bin 或 .img)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Text("保留配置", Modifier.weight(1f))
                    androidx.compose.material3.Switch(checked = preserveConfig, onCheckedChange = { preserveConfig = it })
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionButton("路由器端校验", enabled = !state.loading && remotePath.isNotBlank()) {
                        scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildFirmwareVerifyCommand(remotePath)) } }
                    }
                    ActionButton("开始升级", enabled = !state.loading && remotePath.isNotBlank(), danger = true) {
                        confirmUpgrade = true
                    }
                }
            }
            OutputPanel(state)
        }
    }

    if (confirmUpgrade) {
        ConfirmDialog(
            title = "固件升级",
            text = "升级过程不可中断,且可能导致配置丢失。确定继续吗?",
            confirmLabel = "升级",
            onConfirm = {
                confirmUpgrade = false
                scope.launch {
                    runTask(scope, state) {
                        AppGraph.session.exec(router, OpenWrtAdmin.buildFirmwareUpgradeCommand(remotePath, preserveConfig))
                    }
                }
            },
            onDismiss = { confirmUpgrade = false },
        )
    }
}

/** 访客网络一键创建(二维码内容同时生成)。 */
@Composable
fun GuestNetworkScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var radios by remember { mutableStateOf<List<String>>(emptyList()) }
    var radio by remember { mutableStateOf("") }
    var ssid by remember { mutableStateOf("Guest") }
    var password by remember { mutableStateOf("") }
    var qrValue by remember { mutableStateOf<String?>(null) }

    fun loadRadios() = runTask(scope, state, silent = true) {
        val configs = OpenWrtAdmin.parseWifiConfigs(
            AppGraph.session.exec(router, OpenWrtAdmin.buildWifiSnapshotCommand()),
        )
        radios = configs.map { it.device }.distinct()
        if (radio.isEmpty()) radio = radios.firstOrNull() ?: "radio0"
        "已加载 ${radios.size} 个无线设备。"
    }
    LaunchedEffect(router.id) { loadRadios() }

    ScreenScaffold("访客网络") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionCard("创建访客网络") {
                Text("可选 radio:${radios.joinToString("、").ifEmpty { "未检测" }}", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(radio, { radio = it }, label = { Text("无线设备") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(ssid, { ssid = it }, label = { Text("访客 SSID") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(password, { password = it }, label = { Text("密码(8–63 位)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                ActionButton("创建访客网络", enabled = !state.loading) {
                    scope.launch {
                        runTask(scope, state) {
                            val command = OpenWrtAdmin.buildGuestNetworkCommand(radio, ssid, password)
                            qrValue = OpenWrtAdmin.buildWifiQrValue(ssid, password)
                            AppGraph.session.exec(router, command)
                        }
                    }
                }
            }
            qrValue?.let {
                SectionCard("访客 Wi-Fi 二维码内容") {
                    Text(it, style = MaterialTheme.typography.bodySmall)
                    Text("可使用任意二维码生成工具分享该内容。", style = MaterialTheme.typography.bodySmall)
                }
            }
            OutputPanel(state)
        }
    }
}
