package com.app.openwrtstatusapp.ui.services

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.core.commands.DiskUsage
import com.app.openwrtstatusapp.core.commands.ManagedBy
import com.app.openwrtstatusapp.core.commands.OpenWrtAdmin
import com.app.openwrtstatusapp.core.commands.OpenWrtAdvancedAdmin
import com.app.openwrtstatusapp.core.commands.PluginSettingDefinition
import com.app.openwrtstatusapp.core.commands.PluginSettingsSnapshot
import com.app.openwrtstatusapp.core.commands.ProxyServiceId
import com.app.openwrtstatusapp.core.commands.ProxyServiceState
import com.app.openwrtstatusapp.core.commands.RouterHealthSnapshot
import com.app.openwrtstatusapp.core.commands.RouterLogCategory
import com.app.openwrtstatusapp.core.commands.ServiceAction
import com.app.openwrtstatusapp.core.commands.ServiceState
import com.app.openwrtstatusapp.core.ubus.formatBytes
import com.app.openwrtstatusapp.core.ubus.formatUptime
import com.app.openwrtstatusapp.ui.common.ActionButton
import com.app.openwrtstatusapp.ui.common.InfoRow
import com.app.openwrtstatusapp.ui.common.OutputPanel
import com.app.openwrtstatusapp.ui.common.ScreenScaffold
import com.app.openwrtstatusapp.ui.common.SectionCard
import com.app.openwrtstatusapp.ui.common.TaskState
import com.app.openwrtstatusapp.ui.common.rememberTaskState
import com.app.openwrtstatusapp.ui.common.runTask
import com.app.openwrtstatusapp.ui.common.selectedRouterOrNull
import kotlinx.coroutines.launch

/** 服务健康总览(OpenWrt 核心服务 + Docker 容器)。 */
@Composable
fun ServicesHealthScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var services by remember { mutableStateOf<List<ServiceState>>(emptyList()) }
    var health by remember { mutableStateOf<RouterHealthSnapshot?>(null) }
    var report by remember { mutableStateOf<String?>(null) }

    fun load() = runTask(scope, state, silent = true) {
        services = OpenWrtAdmin.parseServiceStates(
            AppGraph.session.exec(router, OpenWrtAdmin.buildServiceSnapshotCommand()),
        )
        health = OpenWrtAdvancedAdmin.parseHealthSnapshot(
            AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildHealthSnapshotCommand()),
        )
        report = null
        "已加载服务与健康数据。"
    }
    LaunchedEffect(router.id) { load() }

    ScreenScaffold("服务健康") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutputPanel(state)
            health?.let { current ->
                SectionCard("健康状态") {
                    if (current.disks.isNotEmpty()) {
                        current.disks.forEach { disk ->
                            InfoRow("存储 ${disk.mount}", "${disk.usePercent ?: "—"}% 已用(可用 ${disk.availableKb?.let { formatBytes(it * 1024) } ?: "—"})")
                        }
                    }
                    if (current.temperaturesC.isNotEmpty()) {
                        InfoRow("温度", current.temperaturesC.joinToString("、") { "$it °C" })
                    }
                    InfoRow("公网连通(1.1.1.1)", current.ping?.let { "${it.lossPercent ?: "—"}% 丢包 / 平均 ${it.averageMs ?: "—"} ms" } ?: "未报告")
                    InfoRow("本地 DNS", current.dnsReachable?.let { if (it) "正常" else "失败" } ?: "未报告")
                }
            }
            SectionCard("OpenWrt 服务") {
                services.filter { it.managedBy == ManagedBy.OPENWRT }.forEach { service ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(service.name)
                            Text(if (service.running) "运行中" else "已停止", style = MaterialTheme.typography.bodySmall)
                        }
                        TextButton(onClick = {
                            scope.launch {
                                runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildServiceCommand(service.name, ServiceAction.RESTART, ManagedBy.OPENWRT)); load() }
                            }
                        }) { Text("重启") }
                    }
                }
            }
            SectionCard("Docker 容器") {
                services.filter { it.managedBy == ManagedBy.DOCKER }.forEach { service ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(service.name)
                            Text(service.detail ?: "", style = MaterialTheme.typography.bodySmall)
                        }
                        TextButton(onClick = {
                            scope.launch {
                                runTask(scope, state) {
                                    AppGraph.session.exec(
                                        router,
                                        OpenWrtAdmin.buildServiceCommand(
                                            service.name,
                                            if (service.running) ServiceAction.STOP else ServiceAction.START,
                                            ManagedBy.DOCKER,
                                        ),
                                    ); load()
                                }
                            }
                        }) { Text(if (service.running) "停止" else "启动") }
                    }
                }
            }
            ActionButton("生成健康报告", enabled = !state.loading) {
                scope.launch {
                    runTask(scope, state) {
                        val proxyStates = OpenWrtAdvancedAdmin.parseProxyServiceStates(
                            AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildProxyServiceSnapshotCommand()),
                        )
                        OpenWrtAdvancedAdmin.buildRouterHealthReportMarkdown(router, null, health, proxyStates)
                            .also { report = it }
                    }
                }
            }
            report?.let { SectionCard("健康报告(Markdown)") { Text(it, style = MaterialTheme.typography.bodySmall) } }
        }
    }
}

/** 代理插件(OpenClash / AdGuardHome / PassWall / DDNS)管理。 */
@Composable
fun ProxyServicesScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var states by remember { mutableStateOf<List<ProxyServiceState>>(emptyList()) }
    var configTarget by remember { mutableStateOf<ProxyServiceId?>(null) }

    fun load() = runTask(scope, state, silent = true) {
        states = OpenWrtAdvancedAdmin.parseProxyServiceStates(
            AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildProxyServiceSnapshotCommand()),
        )
        "已加载插件状态。"
    }
    LaunchedEffect(router.id) { load() }

    configTarget?.let { target ->
        PluginConfigDialog(target, state) { configDone ->
            configTarget = null
            if (configDone) scope.launch { load() }
        }
    }

    ScreenScaffold("代理与插件") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutputPanel(state)
            states.forEach { service ->
                SectionCard(service.label) {
                    InfoRow("状态", when {
                        !service.installed -> "未安装"
                        service.running -> "运行中"
                        else -> "已停止"
                    })
                    if (service.installed) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = {
                                scope.launch {
                                    runTask(scope, state) {
                                        AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildProxyServiceActionCommand(service.id, ServiceAction.RESTART)); load()
                                    }
                                }
                            }) { Text("重启") }
                            TextButton(onClick = {
                                scope.launch {
                                    runTask(scope, state) {
                                        AppGraph.session.exec(
                                            router,
                                            OpenWrtAdvancedAdmin.buildProxyServiceActionCommand(
                                                service.id,
                                                if (service.running) ServiceAction.STOP else ServiceAction.START,
                                            ),
                                        ); load()
                                    }
                                }
                            }) { Text(if (service.running) "停止" else "启动") }
                            TextButton(onClick = { configTarget = service.id }) { Text("设置") }
                            TextButton(onClick = {
                                scope.launch { runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildPluginLogCommand(service.id)) } }
                            }) { Text("日志") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PluginConfigDialog(target: ProxyServiceId, state: TaskState, onDone: (Boolean) -> Unit) {
    val router = selectedRouterOrNull() ?: return
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf(0) }
    var settingsSnapshot by remember { mutableStateOf<PluginSettingsSnapshot?>(null) }
    var rawConfig by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(false) }

    fun loadSettings() = runTask(scope, state, silent = true) {
        settingsSnapshot = OpenWrtAdvancedAdmin.parsePluginSettingsSnapshot(
            target,
            AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildPluginSettingsSnapshotCommand(target)),
        )
        "已加载 UCI 设置。"
    }
    fun loadRawConfig() = runTask(scope, state, silent = true) {
        rawConfig = OpenWrtAdvancedAdmin.parsePluginConfigSnapshot(
            target,
            AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildPluginConfigSnapshotCommand(target)),
        ).content
        "已加载原始配置。"
    }

    LaunchedEffect(target) {
        loaded = false
        loadSettings()
        loadRawConfig()
        loaded = true
    }

    androidx.compose.ui.window.Dialog(onDismissRequest = { onDone(false) }) {
        SectionCard("${target.label} 设置") {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = mode == 0, onClick = { mode = 0 }, label = { Text("UCI 设置") })
                    FilterChip(selected = mode == 1, onClick = { mode = 1 }, label = { Text("原始配置") })
                }
                if (mode == 0) {
                    settingsSnapshot?.let { snapshot ->
                        if (!snapshot.exists) {
                            Text("服务或配置文件不存在。", color = MaterialTheme.colorScheme.error)
                        }
                        LazyColumn(modifier = Modifier.fillMaxWidth().weight(1f, fill = false)) {
                            items(snapshot.sections, key = { it.section }) { section ->
                                SectionCard("${section.section}(${section.type})") {
                                    section.values.forEach { (key, value) ->
                                        Text("$key = $value", style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                        }
                    }
                    Text("在原始配置模式下保存可全量写入;UCI 设置请直接修改原始配置文件。", style = MaterialTheme.typography.bodySmall)
                } else {
                    OutlinedTextField(
                        rawConfig,
                        { rawConfig = it },
                        label = { Text("配置内容") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                OutputPanel(state)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { onDone(false) }) { Text("关闭") }
                    if (mode == 1 && loaded) {
                        TextButton(onClick = {
                            scope.launch {
                                runTask(scope, state) {
                                    AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildPluginConfigApplyCommand(target, rawConfig))
                                }
                                onDone(true)
                            }
                        }) { Text("保存并重启服务") }
                    }
                }
            }
        }
    }
}

/** Docker 容器管理。 */
@Composable
fun DockerScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var snapshot by remember { mutableStateOf<com.app.openwrtstatusapp.core.commands.DockerSnapshot?>(null) }
    var logsTarget by remember { mutableStateOf<String?>(null) }

    fun load() = runTask(scope, state, silent = true) {
        snapshot = OpenWrtAdmin.parseDockerSnapshot(
            AppGraph.session.exec(router, OpenWrtAdmin.buildDockerSnapshotCommand()),
        )
        "已加载。"
    }
    LaunchedEffect(router.id) { load() }

    logsTarget?.let { id ->
        runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildDockerContainerLogsCommand(id)) }
        logsTarget = null
    }

    ScreenScaffold("Docker") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutputPanel(state)
            snapshot?.let { current ->
                if (!current.available) {
                    SectionCard { Text("路由器未安装 Docker。", color = MaterialTheme.colorScheme.error) }
                }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(current.containers, key = { it.id }) { container ->
                        SectionCard("${container.name}(${container.id})") {
                            InfoRow("镜像", container.image)
                            InfoRow("状态", container.status)
                            container.ports?.let { InfoRow("端口", it) }
                            container.cpuPercent?.let { InfoRow("CPU / 内存", "$it · ${container.memoryUsage ?: "—"}") }
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                listOf(
                                    "启动" to ServiceAction.START,
                                    "停止" to ServiceAction.STOP,
                                    "重启" to ServiceAction.RESTART,
                                ).forEach { (label, action) ->
                                    TextButton(onClick = {
                                        scope.launch {
                                            runTask(scope, state) {
                                                AppGraph.session.exec(router, OpenWrtAdmin.buildDockerContainerCommand(container.id, action)); load()
                                            }
                                        }
                                    }) { Text(label) }
                                }
                                TextButton(onClick = {
                                    scope.launch {
                                        runTask(scope, state) { AppGraph.session.exec(router, OpenWrtAdmin.buildDockerContainerLogsCommand(container.id)) }
                                    }
                                }) { Text("日志") }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** 路由器日志中心。 */
@Composable
fun LogsScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var category by remember { mutableStateOf(RouterLogCategory.SYSTEM) }
    var filter by remember { mutableStateOf("") }
    var lines by remember { mutableStateOf<List<String>>(emptyList()) }

    fun load() = runTask(scope, state, silent = true) {
        lines = OpenWrtAdvancedAdmin.parseRouterLogLines(
            AppGraph.session.exec(router, OpenWrtAdvancedAdmin.buildRouterLogCommand(category, 160, filter)),
        )
        "已加载 ${lines.size} 行日志。"
    }
    LaunchedEffect(router.id) { load() }

    ScreenScaffold("日志中心") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    "系统" to RouterLogCategory.SYSTEM,
                    "内核" to RouterLogCategory.KERNEL,
                    "DNS" to RouterLogCategory.DNS,
                    "拨号" to RouterLogCategory.DIAL,
                    "防火墙" to RouterLogCategory.FIREWALL,
                ).forEach { (label, value) ->
                    FilterChip(selected = category == value, onClick = { category = value; scope.launch { load() } }, label = { Text(label) })
                }
            }
            OutlinedTextField(
                filter,
                { filter = it },
                label = { Text("筛选词(可选)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                trailingIcon = {
                    TextButton(onClick = { scope.launch { load() } }) { Text("查询") }
                },
            )
            OutputPanel(state)
            LazyColumn {
                items(lines) { line ->
                    Text(line, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
