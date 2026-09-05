package com.app.openwrtstatusapp.ui.network

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.material3.Card
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.core.commands.DhcpStaticLeaseDraft
import com.app.openwrtstatusapp.core.commands.FirewallTrafficRuleDraft
import com.app.openwrtstatusapp.core.commands.FirewallSnapshot
import com.app.openwrtstatusapp.core.commands.OpenWrtAdmin
import com.app.openwrtstatusapp.core.commands.OpenWrtAdvancedAdmin
import com.app.openwrtstatusapp.core.commands.PortForwardDraft
import com.app.openwrtstatusapp.core.commands.WifiConfigEntry
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

/** 防火墙区域 / 端口转发 / 通信规则 / UPnP。 */
@Composable
fun FirewallScreen() {
    val router = selectedRouterOrNull() ?: return NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var snapshot by remember { mutableStateOf<FirewallSnapshot?>(null) }
    var sectionTab by remember { mutableStateOf(0) }
    var deleteTarget by remember { mutableStateOf<Pair<String, String>?>(null) }

    val tabs = listOf("区域", "端口转发", "通信规则", "UPnP")

    fun load() = runTask(scope, state, silent = true) {
        val output = AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildFirewallSnapshotCommand())
        val parsed = OpenWrtAdvancedAdmin.parseFirewallSnapshot(output)
        snapshot = parsed
        "已加载 ${parsed.zones.size} 个区域、${parsed.portForwards.size} 条端口转发。"
    }

    androidx.compose.runtime.LaunchedEffect(router.id) { load() }

    ScreenScaffold("防火墙") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                tabs.forEachIndexed { index, label ->
                    FilterChip(selected = sectionTab == index, onClick = { sectionTab = index }, label = { Text(label) })
                }
            }
            OutputPanel(state)
            val current = snapshot ?: return@Column
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                when (sectionTab) {
                    0 -> items(current.zones, key = { it.section }) { zone ->
                        SectionCard(zone.name) {
                            InfoRow("网络", zone.networks.joinToString(" ").ifEmpty { "未设置" })
                            InfoRow("入站 / 出站 / 转发", "${zone.input} / ${zone.output} / ${zone.forward}")
                        }
                    }
                    1 -> items(current.portForwards, key = { it.section }) { rule ->
                        SectionCard(rule.name) {
                            InfoRow("转发", "${rule.sourceZone}:${rule.sourcePort} → ${rule.destinationIp}:${rule.destinationPort}(${rule.protocol})")
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("启用", Modifier.weight(1f))
                                Switch(
                                    checked = rule.enabled,
                                    onCheckedChange = { enabled ->
                                        scope.launch {
                                            runTask(scope, state) {
                                                AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildPortForwardToggleCommand(rule.section, enabled))
                                                load(); "已${if (enabled) "启用" else "停用"}。"
                                            }
                                        }
                                    },
                                )
                                TextButton(onClick = { deleteTarget = rule.section to rule.name }) { Text("删除", color = MaterialTheme.colorScheme.error) }
                            }
                        }
                    }
                    2 -> items(current.trafficRules, key = { it.section }) { rule ->
                        SectionCard(rule.name) {
                            InfoRow("动作", rule.target)
                            InfoRow("来源", "${rule.sourceZone} ${rule.sourceIp} ${rule.sourcePort}".trim())
                            InfoRow("目标", "${rule.destinationZone} ${rule.destinationIp} ${rule.destinationPort}".trim())
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("启用", Modifier.weight(1f))
                                Switch(checked = rule.enabled, onCheckedChange = { enabled ->
                                    scope.launch {
                                        runTask(scope, state) {
                                            AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildFirewallRuleToggleCommand(rule.section, enabled))
                                            load(); "已${if (enabled) "启用" else "停用"}。"
                                        }
                                    }
                                })
                                TextButton(onClick = { deleteTarget = rule.section to rule.name }) { Text("删除", color = MaterialTheme.colorScheme.error) }
                            }
                        }
                    }
                    else -> item {
                        SectionCard("UPnP(_miniupnpd)") {
                        InfoRow("状态", listOf(
                            if (current.upnp.installed) "已安装" else "未安装",
                            if (current.upnp.running) "运行中" else "已停止",
                            if (current.upnp.enabled) "已启用" else "已停用",
                        ).joinToString(" · "))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ActionButton("启用", enabled = current.upnp.installed) {
                                scope.launch {
                                    runTask(scope, state) {
                                        AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildUpnpActionCommand(com.app.openwrtstatusapp.core.commands.ServiceAction.START)); load()
                                    }
                                }
                            }
                            ActionButton("停止", enabled = current.upnp.installed, danger = true) {
                                scope.launch {
                                    runTask(scope, state) {
                                        AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildUpnpActionCommand(com.app.openwrtstatusapp.core.commands.ServiceAction.STOP)); load()
                                    }
                                }
                            }
                        }
                        }
                    }
                }
            }
        }
    }

    deleteTarget?.let { (section, name) ->
        ConfirmDialog(
            title = "删除规则",
            text = "确定删除“$name”吗?",
            confirmLabel = "删除",
            onConfirm = {
                deleteTarget = null
                scope.launch {
                    runTask(scope, state) {
                        AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildPortForwardDeleteCommand(section)); load()
                    }
                }
            },
            onDismiss = { deleteTarget = null },
        )
    }
}


@Composable
fun NoRouterHint() {
    ScreenScaffold("提示") { Text("请先在“路由器”页添加并选择一台路由器。") }
}

/** DHCP 租约与静态租约管理。 */
@Composable
fun DhcpLeasesScreen() {
    val router = selectedRouterOrNull() ?: return NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var snapshot by remember { mutableStateOf<com.app.openwrtstatusapp.core.commands.DhcpLeaseSnapshot?>(null) }
    var hostname by remember { mutableStateOf("") }
    var mac by remember { mutableStateOf("") }
    var ipv4 by remember { mutableStateOf("") }
    var leasetime by remember { mutableStateOf("") }
    var deleteSection by remember { mutableStateOf<String?>(null) }

    fun load() = runTask(scope, state, silent = true) {
        val output = AppGraph.session.exec(router, OpenWrtAdmin.buildDhcpLeaseSnapshotCommand())
        snapshot = OpenWrtAdmin.parseDhcpLeaseSnapshot(output)
        "已加载。"
    }

    androidx.compose.runtime.LaunchedEffect(router.id) { load() }

    ScreenScaffold("DHCP 租约") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutputPanel(state)
            snapshot?.let { current ->
                SectionCard("静态租约") {
                    if (current.static.isEmpty()) Text("暂无静态租约。")
                    current.static.forEach { lease ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(lease.hostname ?: lease.mac)
                                Text("${lease.mac} · ${lease.ipv4 ?: "—"}", style = MaterialTheme.typography.bodySmall)
                            }
                            TextButton(onClick = { deleteSection = lease.section }) { Text("删除", color = MaterialTheme.colorScheme.error) }
                        }
                    }
                }
                SectionCard("动态租约") {
                    if (current.dynamic.isEmpty()) Text("暂无动态租约。")
                    current.dynamic.forEach { lease ->
                        InfoRow(lease.hostname ?: lease.mac, "${lease.ipv4 ?: "—"} · 过期 ${lease.expiresAt ?: "—"}")
                    }
                }
                SectionCard("添加静态租约") {
                    OutlinedTextField(hostname, { hostname = it }, label = { Text("设备名称") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    OutlinedTextField(mac, { mac = it }, label = { Text("MAC 地址") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    OutlinedTextField(ipv4, { ipv4 = it }, label = { Text("固定 IPv4") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    OutlinedTextField(leasetime, { leasetime = it }, label = { Text("租约期限(可选,如 12h)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    ActionButton("保存静态租约", enabled = !state.loading) {
                        scope.launch {
                            runTask(scope, state) {
                                AppGraph.session.exec(
                                    router,
                                    OpenWrtAdmin.buildDhcpStaticLeaseSaveCommand(
                                        DhcpStaticLeaseDraft(hostname = hostname, mac = mac, ipv4 = ipv4, leasetime = leasetime.ifBlank { null }),
                                    ),
                                )
                                load()
                            }
                        }
                    }
                }
            }
        }
    }

    deleteSection?.let { section ->
        ConfirmDialog(
            title = "删除静态租约", text = "确定删除该静态租约吗?", confirmLabel = "删除",
            onConfirm = {
                deleteSection = null
                scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildDhcpStaticLeaseDeleteCommand(section)); load() } }
            },
            onDismiss = { deleteSection = null },
        )
    }
}

/** 在线客户端与设备拉黑。 */
@Composable
fun ClientsScreen() {
    val router = selectedRouterOrNull() ?: return NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var clients by remember { mutableStateOf<List<com.app.openwrtstatusapp.core.commands.ConnectedClient>>(emptyList()) }
    var blocked by remember { mutableStateOf<Set<String>>(emptySet()) }

    fun load() = runTask(scope, state, silent = true) {
        val output = AppGraph.session.exec(router, OpenWrtAdmin.buildClientSnapshotCommand())
        clients = OpenWrtAdmin.parseConnectedClients(output)
        blocked = OpenWrtAdmin.parseBlockedClientMacs(output)
        "已加载 ${clients.size} 台设备。"
    }

    androidx.compose.runtime.LaunchedEffect(router.id) { load() }

    ScreenScaffold("连接设备") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutputPanel(state)
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(clients, key = { it.mac }) { client ->
                    val isBlocked = client.mac in blocked
                    SectionCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(client.hostname ?: client.mac)
                                Text(
                                    listOfNotNull(client.ipv4, if (client.online) "在线" else "离线", if (isBlocked) "已拉黑" else null)
                                        .joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (isBlocked) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                                )
                            }
                            if (isBlocked) {
                                TextButton(onClick = {
                                    scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildUnblockClientCommand(client.mac)); load() } }
                                }) { Text("取消拉黑") }
                            } else {
                                TextButton(onClick = {
                                    scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildBlockClientCommand(client.mac)); load() } }
                                }) { Text("拉黑", color = MaterialTheme.colorScheme.error) }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** 无线网络管理:SSID/加密/显隐/隔离/绑定网络/启停/删除 + 访客网络。 */
@Composable
fun WirelessManagerScreen() {
    val router = selectedRouterOrNull() ?: return NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var configs by remember { mutableStateOf<List<WifiConfigEntry>>(emptyList()) }
    var editing by remember { mutableStateOf<WifiConfigEntry?>(null) }

    fun load() = runTask(scope, state, silent = true) {
        val output = AppGraph.session.exec(router, OpenWrtAdmin.buildWifiSnapshotCommand())
        configs = OpenWrtAdmin.parseWifiConfigs(output)
        "已加载 ${configs.size} 个无线配置。"
    }

    androidx.compose.runtime.LaunchedEffect(router.id) { load() }

    editing?.let { entry ->
        WifiEditDialog(entry, state) { edited ->
            editing = null
            if (edited != null) {
                scope.launch {
                    runTask(scope, state) {
                        AppGraph.session.exec(router, OpenWrtAdmin.buildWifiSettingsSaveCommand(
                            section = edited.section, ssid = edited.ssid, encryption = edited.encryption,
                            key = edited.key, hidden = edited.hidden, isolate = edited.isolate, network = edited.network,
                        ))
                        load()
                    }
                }
            }
        }
    }

    ScreenScaffold("无线管理") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutputPanel(state)
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(configs, key = { it.section }) { entry ->
                    SectionCard("${entry.ssid}(${entry.section})") {
                        InfoRow("设备 / 加密", "${entry.device} · ${entry.encryption}")
                        InfoRow("状态", if (entry.disabled) "已关闭" else "已开启")
                        InfoRow("隐藏 / 隔离", "${if (entry.hidden) "是" else "否"} / ${if (entry.isolate) "是" else "否"}")
                        if (entry.network.isNotEmpty()) InfoRow("绑定网络", entry.network)
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = { editing = entry }) { Text("编辑") }
                            TextButton(onClick = {
                                scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildWifiToggleCommand(entry.section, entry.disabled)); load() } }
                            }) { Text(if (entry.disabled) "开启" else "关闭") }
                            TextButton(onClick = {
                                scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildWifiDeleteCommand(entry.section)); load() } }
                            }) { Text("删除", color = MaterialTheme.colorScheme.error) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WifiEditDialog(
    entry: WifiConfigEntry,
    state: TaskState,
    onDone: (WifiConfigEntry?) -> Unit,
) {
    var ssid by remember { mutableStateOf(entry.ssid) }
    var key by remember { mutableStateOf(entry.key) }
    var encryption by remember { mutableStateOf(entry.encryption) }
    var hidden by remember { mutableStateOf(entry.hidden) }
    var isolate by remember { mutableStateOf(entry.isolate) }
    var network by remember { mutableStateOf(entry.network) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { onDone(null) },
        title = { Text("编辑 ${entry.section}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(ssid, { ssid = it }, label = { Text("SSID") }, singleLine = true)
                OutlinedTextField(key, { key = it }, label = { Text("密码") }, singleLine = true)
                OutlinedTextField(encryption, { encryption = it }, label = { Text("加密(psk2/sae/sae-mixed/none…)") }, singleLine = true)
                OutlinedTextField(network, { network = it }, label = { Text("绑定网络(空格分隔)") }, singleLine = true)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("隐藏网络", Modifier.weight(1f))
                    Switch(checked = hidden, onCheckedChange = { hidden = it })
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("客户端隔离", Modifier.weight(1f))
                    Switch(checked = isolate, onCheckedChange = { isolate = it })
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                try {
                    onDone(entry.copy(ssid = ssid, key = key, encryption = encryption, hidden = hidden, isolate = isolate, network = network))
                } catch (caught: Exception) {
                    error = caught.message
                }
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = { onDone(null) }) { Text("取消") } },
    )
}

/** 无线信道优化:扫描邻近网络并给出保守建议。 */
@Composable
fun WirelessOptimizerScreen() {
    val router = selectedRouterOrNull() ?: return NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var snapshot by remember { mutableStateOf<com.app.openwrtstatusapp.core.commands.WirelessOptimizationSnapshot?>(null) }
    var recommendations by remember { mutableStateOf<List<com.app.openwrtstatusapp.core.commands.WirelessChannelRecommendation>>(emptyList()) }

    ScreenScaffold("无线信道优化") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ActionButton("扫描并分析", enabled = !state.loading) {
                scope.launch {
                    runTask(scope, state) {
                        val output = AppGraph.session.exec(router, OpenWrtAdmin.buildWirelessOptimizationSnapshotCommand())
                        val parsed = OpenWrtAdmin.parseWirelessOptimizationSnapshot(output)
                        snapshot = parsed
                        recommendations = parsed.radios.map { OpenWrtAdmin.recommendWirelessChannel(it, parsed.networks) }
                        "扫描完成:${parsed.radios.size} 个 radio,${parsed.networks.size} 个邻近网络。"
                    }
                }
            }
            OutputPanel(state)
            recommendations.forEach { recommendation ->
                SectionCard(recommendation.radio) {
                    InfoRow("当前信道", recommendation.currentChannel?.toString() ?: "未报告")
                    InfoRow("建议信道", recommendation.suggestedChannel?.toString() ?: "—")
                    InfoRow("拥挤度", "当前 ${recommendation.currentScore ?: "—"} → 建议 ${recommendation.suggestedScore ?: "—"}")
                    Text(recommendation.reason, style = MaterialTheme.typography.bodySmall)
                    if (recommendation.suggestedChannel != null &&
                        recommendation.currentChannel != null &&
                        recommendation.suggestedChannel != recommendation.currentChannel
                    ) {
                        ActionButton("应用信道 ${recommendation.suggestedChannel}") {
                            scope.launch {
                                runTask(scope, state) {
                                    AppGraph.session.exec(
                                        router,
                                        OpenWrtAdmin.buildWirelessChannelApplyCommand(recommendation.radio, recommendation.suggestedChannel!!),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** 弱信号设备分析。 */
@Composable
fun WeakSignalScreen() {
    val router = selectedRouterOrNull() ?: return NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var clients by remember { mutableStateOf<List<com.app.openwrtstatusapp.core.commands.WeakSignalClient>>(emptyList()) }

    ScreenScaffold("弱信号设备") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ActionButton("刷新分析", enabled = !state.loading) {
                scope.launch {
                    runTask(scope, state) {
                        val output = AppGraph.session.exec(router, OpenWrtAdmin.buildWeakSignalSnapshotCommand())
                        clients = OpenWrtAdmin.parseWeakSignalClients(output)
                        "已分析 ${clients.size} 个无线客户端。"
                    }
                }
            }
            OutputPanel(state)
            clients.forEach { client ->
                SectionCard(client.hostname ?: client.mac) {
                    InfoRow("信号", client.signalDbm?.let { "$it dBm" } ?: "未报告")
                    InfoRow("质量", client.qualityLabel)
                    InfoRow("地址", listOfNotNull(client.ipv4, client.interfaceName).joinToString(" · ").ifEmpty { "—" })
                }
            }
        }
    }
}

/** 批量操作:多路由器诊断与配置备份。 */
@Composable
fun BulkOperationsScreen() {
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    val profiles by AppGraph.repository.profilesFlow.collectAsStateWithLifecycle(initialValue = emptyList<com.app.openwrtstatusapp.core.model.RouterProfile>())
    var results by remember { mutableStateOf<Map<String, String>>(emptyMap()) }

    ScreenScaffold("批量操作") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ActionButton("批量诊断(所有路由器)", enabled = !state.loading) {
                scope.launch {
                    runTask(scope, state) {
                        val output = StringBuilder()
                        profiles.forEach { profile ->
                            output.appendLine("===== ${profile.name} =====")
                            try {
                                val diagnostic = OpenWrtAdvancedAdmin.buildBatchRouterDiagnosticCommand()
                                output.appendLine(AppGraph.session.exec(profile, diagnostic))
                            } catch (caught: Exception) {
                                output.appendLine("失败:${caught.message}")
                            }
                        }
                        results = mapOf("diagnostic" to output.toString())
                        output.toString()
                    }
                }
            }
            ActionButton("批量配置备份(所有路由器)", enabled = !state.loading) {
                scope.launch {
                    runTask(scope, state) {
                        val output = StringBuilder()
                        profiles.forEach { profile ->
                            output.appendLine("===== ${profile.name} =====")
                            try {
                                val batchId = "batch-${profile.id.takeLast(8)}"
                                val (remotePath, command) = OpenWrtAdvancedAdmin.buildBatchConfigBackupCommand(batchId)
                                val result = AppGraph.session.exec(profile, command)
                                output.appendLine(result.ifBlank { "已生成:$remotePath" })
                            } catch (caught: Exception) {
                                output.appendLine("失败:${caught.message}")
                            }
                        }
                        results = mapOf("backup" to output.toString())
                        output.toString()
                    }
                }
            }
            OutputPanel(state)
            Spacer(Modifier.height(4.dp))
            Text("说明:配置备份生成于各路由器的 /tmp 目录,可通过文件管理器下载保存。", style = MaterialTheme.typography.bodySmall)
        }
    }
}
