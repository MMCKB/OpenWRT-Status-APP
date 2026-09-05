package com.app.openwrtstatusapp.ui.system

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import com.app.openwrtstatusapp.core.commands.LuciSystemCommands
import com.app.openwrtstatusapp.core.commands.LuciSystemParsers
import com.app.openwrtstatusapp.core.commands.MountPoint
import com.app.openwrtstatusapp.core.commands.NetworkDeviceSettings
import com.app.openwrtstatusapp.core.commands.NetworkGlobalSettings
import com.app.openwrtstatusapp.core.commands.NetworkInterfaceSettings
import com.app.openwrtstatusapp.core.commands.ScheduledAction
import com.app.openwrtstatusapp.core.commands.ServiceAction
import com.app.openwrtstatusapp.core.ubus.formatBytes
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

private enum class AdminSection(val label: String) {
    STARTUP("启动项"), LED("LED"), MOUNT("挂载点"), SSH("SSH 管理"), APK_KEYS("APK 公钥"),
    UHTTPD("HTTPS"), THEME("LuCI 主题"), NETWORK("网络接口"), SCHEDULE("计划任务"), PASSWORD("root 密码"),
}

/** 平移自 app/system-admin.tsx:LuCI 系统管理全量功能。 */
@Composable
fun SystemAdminScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var section by remember { mutableStateOf(AdminSection.STARTUP) }

    LaunchedEffect(router.id) { }

    ScreenScaffold("系统管理") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            LazyColumn {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AdminSection.entries.take(5).forEach { item ->
                            FilterChip(selected = section == item, onClick = { section = item }, label = { Text(item.label) })
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AdminSection.entries.drop(5).forEach { item ->
                            FilterChip(selected = section == item, onClick = { section = item }, label = { Text(item.label) })
                        }
                    }
                }
            }
            OutputPanel(state)
            when (section) {
                AdminSection.STARTUP -> StartupSection(router, state)
                AdminSection.LED -> LedSection(router, state)
                AdminSection.MOUNT -> MountSection(router, state)
                AdminSection.SSH -> SshSection(router, state)
                AdminSection.APK_KEYS -> ApkKeysSection(router, state)
                AdminSection.UHTTPD -> UhttpdSection(router, state)
                AdminSection.THEME -> ThemeSection(router, state)
                AdminSection.NETWORK -> NetworkSection(router, state)
                AdminSection.SCHEDULE -> ScheduleSection(router, state)
                AdminSection.PASSWORD -> PasswordSection(router, state)
            }
        }
    }
}

@Composable
private fun StartupSection(router: com.app.openwrtstatusapp.core.model.RouterProfile, state: TaskState) {
    val scope = rememberCoroutineScope()
    var services by remember { mutableStateOf<List<com.app.openwrtstatusapp.core.commands.StartupService>>(emptyList()) }

    fun load() = runTask(scope, state, silent = true) {
        services = LuciSystemParsers.parseStartupServices(
            AppGraph.session.exec(router, LuciSystemCommands.buildStartupSnapshotCommand()),
        )
        "已加载 ${services.size} 个服务。"
    }
    LaunchedEffect(router.id) { load() }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(services, key = { it.name }) { service ->
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(service.name)
                        Text(if (service.enabled) "开机启动" else "未启用", style = MaterialTheme.typography.bodySmall)
                    }
                    Switch(checked = service.enabled, onCheckedChange = { enabled ->
                        scope.launch {
                            runTask(scope, state) {
                                AppGraph.session.exec(router, LuciSystemCommands.buildStartupActionCommand(service.name, enabled)); load()
                            }
                        }
                    })
                }
            }
        }
    }
}

@Composable
private fun LedSection(router: com.app.openwrtstatusapp.core.model.RouterProfile, state: TaskState) {
    val scope = rememberCoroutineScope()
    var leds by remember { mutableStateOf<List<com.app.openwrtstatusapp.core.commands.LedSetting>>(emptyList()) }
    var capabilities by remember { mutableStateOf<com.app.openwrtstatusapp.core.commands.LedCapabilities?>(null) }
    var deleteSection by remember { mutableStateOf<String?>(null) }
    var showAdd by remember { mutableStateOf(false) }

    fun load() = runTask(scope, state, silent = true) {
        leds = LuciSystemParsers.parseLedSettings(AppGraph.session.exec(router, LuciSystemCommands.buildLedSnapshotCommand()))
        capabilities = LuciSystemParsers.parseLedCapabilities(
            AppGraph.session.exec(router, LuciSystemCommands.buildLedCapabilitiesSnapshotCommand()),
        )
        "已加载 ${leds.size} 个 LED。"
    }
    LaunchedEffect(router.id) { load() }

    if (showAdd) {
        LedAddDialog(capabilities) { settings ->
            showAdd = false
            if (settings != null) {
                scope.launch { runTask(scope, state) { AppGraph.session.exec(router, LuciSystemCommands.buildAddLedCommand(settings)); load() } }
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ActionButton("新增 LED") { showAdd = true }
        leds.forEach { led ->
            SectionCard("${led.name}(${led.section})") {
                InfoRow("设备 / 触发器", "${led.sysfs.ifEmpty { "—" }} · ${led.trigger}")
                if (led.trigger == "timer") InfoRow("亮/灭(毫秒)", "${led.delayOn} / ${led.delayOff}")
                if (led.trigger == "netdev") InfoRow("网络设备", "${led.netdevDevice} · ${led.netdevMode}")
                TextButton(onClick = { deleteSection = led.section }) { Text("删除", color = MaterialTheme.colorScheme.error) }
            }
        }
    }

    deleteSection?.let { target ->
        com.app.openwrtstatusapp.ui.common.ConfirmDialog(
            title = "删除 LED", text = "确定删除该 LED 配置吗?", confirmLabel = "删除",
            onConfirm = {
                deleteSection = null
                scope.launch { runTask(scope, state) { AppGraph.session.exec(router, LuciSystemCommands.buildDeleteLedCommand(target)); load() } }
            },
            onDismiss = { deleteSection = null },
        )
    }
}

@Composable
private fun LedAddDialog(
    capabilities: com.app.openwrtstatusapp.core.commands.LedCapabilities?,
    onDone: (com.app.openwrtstatusapp.core.commands.LedSetting? ) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var sysfs by remember { mutableStateOf(capabilities?.devices?.firstOrNull() ?: "") }
    var trigger by remember { mutableStateOf("default-on") }
    var delayOn by remember { mutableStateOf("1000") }
    var delayOff by remember { mutableStateOf("1000") }
    var netdevDevice by remember { mutableStateOf("") }
    var netdevMode by remember { mutableStateOf("link") }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { onDone(null) },
        title = { Text("新增 LED") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("名称") }, singleLine = true)
                OutlinedTextField(sysfs, { sysfs = it }, label = { Text("LED 设备(/sys/class/leds 下名称)") }, singleLine = true)
                OutlinedTextField(trigger, { trigger = it }, label = { Text("触发器(default-on/timer/netdev/heartbeat/none)") }, singleLine = true)
                if (trigger == "timer") {
                    OutlinedTextField(delayOn, { delayOn = it }, label = { Text("开启时间(毫秒)") }, singleLine = true)
                    OutlinedTextField(delayOff, { delayOff = it }, label = { Text("关闭时间(毫秒)") }, singleLine = true)
                }
                if (trigger == "netdev") {
                    OutlinedTextField(netdevDevice, { netdevDevice = it }, label = { Text("网络设备") }, singleLine = true)
                    OutlinedTextField(netdevMode, { netdevMode = it }, label = { Text("模式(link/tx/rx 组合)") }, singleLine = true)
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                try {
                    onDone(
                        com.app.openwrtstatusapp.core.commands.LedSetting(
                            section = "", name = name, sysfs = sysfs, trigger = trigger,
                            delayOn = if (trigger == "timer") delayOn else "",
                            delayOff = if (trigger == "timer") delayOff else "",
                            netdevDevice = if (trigger == "netdev") netdevDevice else "",
                            netdevMode = if (trigger == "netdev") netdevMode else "",
                        ),
                    )
                } catch (caught: Exception) {
                    error = caught.message
                }
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = { onDone(null) }) { Text("取消") } },
    )
}

@Composable
private fun MountSection(router: com.app.openwrtstatusapp.core.model.RouterProfile, state: TaskState) {
    val scope = rememberCoroutineScope()
    var mounts by remember { mutableStateOf<List<MountPoint>>(emptyList()) }
    var mounted by remember { mutableStateOf<List<com.app.openwrtstatusapp.core.commands.MountedFileSystem>>(emptyList()) }

    fun load() = runTask(scope, state, silent = true) {
        val output = AppGraph.session.exec(router, LuciSystemCommands.buildMountSnapshotCommand())
        mounts = LuciSystemParsers.parseMountPoints(output)
        mounted = LuciSystemParsers.parseMountedFileSystems(output)
        "已加载 ${mounts.size} 个挂载配置。"
    }
    LaunchedEffect(router.id) { load() }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionButton("生成挂载配置", enabled = !state.loading) {
                scope.launch { runTask(scope, state) { AppGraph.session.exec(router, LuciSystemCommands.buildGenerateMountConfigCommand()); load() } }
            }
            ActionButton("挂载全部设备", enabled = !state.loading) {
                scope.launch { runTask(scope, state) { AppGraph.session.exec(router, LuciSystemCommands.buildAutoMountUnconfiguredCommand()); load() } }
            }
        }
        mounts.forEach { mount ->
            SectionCard("${mount.target}(${mount.section})") {
                InfoRow("设备 / 文件系统", "${mount.device.ifEmpty { "—" }} · ${mount.fstype}")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (mount.enabled) "已启用" else "已停用", Modifier.weight(1f))
                    Switch(checked = mount.enabled, onCheckedChange = { enabled ->
                        scope.launch { runTask(scope, state) { AppGraph.session.exec(router, LuciSystemCommands.buildMountActionCommand(mount.section, enabled)); load() } }
                    })
                    TextButton(onClick = {
                        scope.launch { runTask(scope, state) { AppGraph.session.exec(router, LuciSystemCommands.buildDeleteMountCommand(mount.section)); load() } }
                    }) { Text("删除", color = MaterialTheme.colorScheme.error) }
                }
            }
        }
        if (mounted.isNotEmpty()) {
            SectionCard("当前已挂载") {
                mounted.forEach { InfoRow(it.target, "${it.device} · ${it.fstype}") }
            }
        }
    }
}

@Composable
private fun SshSection(router: com.app.openwrtstatusapp.core.model.RouterProfile, state: TaskState) {
    val scope = rememberCoroutineScope()
    var access by remember { mutableStateOf<com.app.openwrtstatusapp.core.commands.SshAccessSettings?>(null) }
    var keys by remember { mutableStateOf<List<com.app.openwrtstatusapp.core.commands.SshAuthorizedKey>>(emptyList()) }
    var port by remember { mutableStateOf("") }
    var passwordAuth by remember { mutableStateOf(true) }
    var rootPasswordAuth by remember { mutableStateOf(true) }
    var newKey by remember { mutableStateOf("") }

    fun load() = runTask(scope, state, silent = true) {
        val accessOutput = AppGraph.session.exec(router, LuciSystemCommands.buildSshAccessSnapshotCommand())
        access = LuciSystemParsers.parseSshAccessSettings(accessOutput).also {
            port = it.port; passwordAuth = it.passwordAuth; rootPasswordAuth = it.rootPasswordAuth
        }
        keys = LuciSystemParsers.parseSshAuthorizedKeys(
            AppGraph.session.exec(router, LuciSystemCommands.buildSshAuthorizedKeysSnapshotCommand()),
        )
        "已加载 SSH 配置。"
    }
    LaunchedEffect(router.id) { load() }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        access?.let { current ->
            SectionCard("SSH 访问(Dropbear)") {
                if (!current.installed) {
                    Text("Dropbear 未安装。", color = MaterialTheme.colorScheme.error)
                } else {
                    OutlinedTextField(port, { port = it }, label = { Text("端口") }, singleLine = true)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("允许密码登录", Modifier.weight(1f))
                        Switch(checked = passwordAuth, onCheckedChange = { passwordAuth = it })
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("允许 root 密码登录", Modifier.weight(1f))
                        Switch(checked = rootPasswordAuth, onCheckedChange = { rootPasswordAuth = it })
                    }
                    ActionButton("保存访问设置", enabled = !state.loading) {
                        scope.launch {
                            runTask(scope, state) {
                                AppGraph.session.exec(
                                    router,
                                    LuciSystemCommands.buildSaveSshAccessCommand(
                                        com.app.openwrtstatusapp.core.commands.SshAccessSettings(true, port, passwordAuth, rootPasswordAuth, current.instances),
                                    ),
                                ); load()
                            }
                        }
                    }
                    current.instances.forEach { instance ->
                        InfoRow("实例 ${instance.section}", "端口 ${instance.port} · ${if (instance.enabled) "启用" else "停用"}")
                        Switch(
                            checked = instance.enabled,
                            onCheckedChange = { enabled ->
                                scope.launch {
                                    runTask(scope, state) {
                                        AppGraph.session.exec(router, LuciSystemCommands.buildSshInstanceActionCommand(instance.section, enabled)); load()
                                    }
                                }
                            },
                        )
                    }
                }
            }
        }
        SectionCard("SSH 公钥(${keys.size})") {
            keys.forEach { InfoRow(it.type, it.comment.ifEmpty { it.value.take(32) }) }
            OutlinedTextField(newKey, { newKey = it }, label = { Text("粘贴 OpenSSH 公钥") }, modifier = Modifier.fillMaxWidth())
            ActionButton("添加公钥", enabled = !state.loading && newKey.isNotBlank()) {
                scope.launch {
                    runTask(scope, state) {
                        AppGraph.session.exec(router, LuciSystemCommands.buildAddSshAuthorizedKeyCommand(newKey))
                        newKey = ""; load()
                    }
                }
            }
        }
    }
}

@Composable
private fun ApkKeysSection(router: com.app.openwrtstatusapp.core.model.RouterProfile, state: TaskState) {
    val scope = rememberCoroutineScope()
    var keys by remember { mutableStateOf<List<com.app.openwrtstatusapp.core.commands.ApkRepositoryKey>>(emptyList()) }
    var keyName by remember { mutableStateOf("") }
    var keyContent by remember { mutableStateOf("") }
    var keyUrl by remember { mutableStateOf("") }

    fun load() = runTask(scope, state, silent = true) {
        keys = LuciSystemParsers.parseApkRepositoryKeys(
            AppGraph.session.exec(router, LuciSystemCommands.buildApkRepositoryKeysSnapshotCommand()),
        )
        "已加载 ${keys.size} 个公钥。"
    }
    LaunchedEffect(router.id) { load() }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        keys.forEach { key ->
            SectionCard(key.name) { InfoRow("大小", formatBytes(key.bytes.toDouble())) }
        }
        SectionCard("添加公钥") {
            OutlinedTextField(keyName, { keyName = it }, label = { Text("名称(如 vendor)") }, singleLine = true)
            OutlinedTextField(keyContent, { keyContent = it }, label = { Text("公钥内容(与 URL 二选一)") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(keyUrl, { keyUrl = it }, label = { Text("公钥 URL(https)") }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionButton("保存内容", enabled = !state.loading && keyName.isNotBlank() && keyContent.isNotBlank()) {
                    scope.launch {
                        runTask(scope, state) {
                            AppGraph.session.exec(router, LuciSystemCommands.buildAddApkRepositoryKeyCommand(keyName, keyContent))
                            keyContent = ""; load()
                        }
                    }
                }
                ActionButton("从 URL 导入", enabled = !state.loading && keyName.isNotBlank() && keyUrl.isNotBlank()) {
                    scope.launch {
                        runTask(scope, state) {
                            AppGraph.session.exec(router, LuciSystemCommands.buildFetchApkRepositoryKeyCommand(keyName, keyUrl))
                            keyUrl = ""; load()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun UhttpdSection(router: com.app.openwrtstatusapp.core.model.RouterProfile, state: TaskState) {
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf<com.app.openwrtstatusapp.core.commands.UhttpdSettings?>(null) }

    fun load() = runTask(scope, state, silent = true) {
        settings = LuciSystemParsers.parseUhttpdSettings(
            AppGraph.session.exec(router, LuciSystemCommands.buildUhttpdSnapshotCommand()),
        )
        "已加载。"
    }
    LaunchedEffect(router.id) { load() }

    settings?.let { current ->
        SectionCard("LuCI HTTPS 重定向") {
            if (!current.installed) {
                Text("uhttpd 未安装。", color = MaterialTheme.colorScheme.error)
            } else {
                InfoRow("HTTP / HTTPS 端口", "${current.httpPorts} / ${current.httpsPorts}")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("HTTP 自动跳转 HTTPS", Modifier.weight(1f))
                    Switch(
                        checked = current.redirectHttps,
                        onCheckedChange = { enabled ->
                            scope.launch {
                                runTask(scope, state) {
                                    AppGraph.session.exec(
                                        router,
                                        LuciSystemCommands.buildSaveUhttpdCommand(current.copy(redirectHttps = enabled)),
                                    ); load()
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ThemeSection(router: com.app.openwrtstatusapp.core.model.RouterProfile, state: TaskState) {
    val scope = rememberCoroutineScope()
    var themes by remember { mutableStateOf<List<com.app.openwrtstatusapp.core.commands.LuciTheme>>(emptyList()) }

    fun load() = runTask(scope, state, silent = true) {
        themes = LuciSystemParsers.parseLuciThemes(
            AppGraph.session.exec(router, LuciSystemCommands.buildLuciThemesSnapshotCommand()),
        )
        "已加载 ${themes.size} 个主题。"
    }
    LaunchedEffect(router.id) { load() }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        themes.forEach { theme ->
            SectionCard(theme.name) {
                if (theme.active) {
                    Text("当前主题", color = MaterialTheme.colorScheme.primary)
                } else {
                    TextButton(onClick = {
                        scope.launch { runTask(scope, state) { AppGraph.session.exec(router, LuciSystemCommands.buildSetLuciThemeCommand(theme.name)); load() } }
                    }) { Text("切换到此主题") }
                }
            }
        }
    }
}

@Composable
private fun NetworkSection(router: com.app.openwrtstatusapp.core.model.RouterProfile, state: TaskState) {
    val scope = rememberCoroutineScope()
    var interfaces by remember { mutableStateOf<List<NetworkInterfaceSettings>>(emptyList()) }
    var devices by remember { mutableStateOf<List<NetworkDeviceSettings>>(emptyList()) }
    var global by remember { mutableStateOf<NetworkGlobalSettings?>(null) }
    var editing by remember { mutableStateOf<NetworkInterfaceSettings?>(null) }
    var editingDevice by remember { mutableStateOf<NetworkDeviceSettings?>(null) }
    var deleteSection by remember { mutableStateOf<String?>(null) }

    fun load() = runTask(scope, state, silent = true) {
        val ifaceOutput = AppGraph.session.exec(router, LuciSystemCommands.buildNetworkInterfaceSnapshotCommand())
        interfaces = LuciSystemParsers.parseNetworkInterfaceSettings(ifaceOutput)
        devices = LuciSystemParsers.parseNetworkDeviceSettings(
            AppGraph.session.exec(router, LuciSystemCommands.buildNetworkDeviceSnapshotCommand()),
        )
        global = LuciSystemParsers.parseNetworkGlobalSettings(
            AppGraph.session.exec(router, LuciSystemCommands.buildNetworkGlobalSnapshotCommand()),
        )
        "已加载 ${interfaces.size} 个接口。"
    }
    LaunchedEffect(router.id) { load() }

    editing?.let { current ->
        InterfaceEditDialog(current) { edited ->
            editing = null
            if (edited != null) {
                scope.launch { runTask(scope, state) { AppGraph.session.exec(router, LuciSystemCommands.buildSaveNetworkInterfaceCommand(edited)); load() } }
            }
        }
    }
    editingDevice?.let { current ->
        DeviceEditDialog(current) { edited ->
            editingDevice = null
            if (edited != null) {
                scope.launch { runTask(scope, state) { AppGraph.session.exec(router, LuciSystemCommands.buildSaveNetworkDeviceCommand(edited)); load() } }
            }
        }
    }
    deleteSection?.let { target ->
        com.app.openwrtstatusapp.ui.common.ConfirmDialog(
            title = "删除接口", text = "确定删除接口 $target 吗?网络可能短暂中断。", confirmLabel = "删除",
            onConfirm = {
                deleteSection = null
                scope.launch { runTask(scope, state) { AppGraph.session.exec(router, LuciSystemCommands.buildNetworkInterfaceDeleteCommand(target)); load() } }
            },
            onDismiss = { deleteSection = null },
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        interfaces.forEach { iface ->
            SectionCard("${iface.section}(${iface.proto})") {
                InfoRow("设备 / 地址", "${iface.device.ifEmpty { "—" }} · ${iface.ipaddr.ifEmpty { "自动" }}")
                if (iface.gateway.isNotEmpty()) InfoRow("网关 / DNS", "${iface.gateway} · ${iface.dns.ifEmpty { "自动" }}")
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { editing = iface }) { Text("编辑") }
                    TextButton(onClick = {
                        scope.launch { runTask(scope, state) { AppGraph.session.exec(router, LuciSystemCommands.buildNetworkInterfaceRestartCommand(iface.section)) } }
                    }) { Text("重启") }
                    TextButton(onClick = { deleteSection = iface.section }) { Text("删除", color = MaterialTheme.colorScheme.error) }
                }
            }
        }
        devices.forEach { device ->
            SectionCard("设备 ${device.name}") {
                InfoRow("类型 / MTU", "${device.type.ifEmpty { "—" }} · ${device.mtu.ifEmpty { "—" }}")
                if (device.macaddr.isNotEmpty()) InfoRow("MAC", device.macaddr)
                TextButton(onClick = { editingDevice = device }) { Text("编辑") }
            }
        }
        global?.let { current ->
            SectionCard("全局(ULA / packet_steering)") {
                InfoRow("ULA 前缀", current.ulaPrefix.ifEmpty { "未设置" })
                InfoRow("Packet Steering", if (current.packetSteering) "开启" else "关闭")
                TextButton(onClick = {
                    scope.launch {
                        runTask(scope, state) {
                            AppGraph.session.exec(
                                router,
                                LuciSystemCommands.buildSaveNetworkGlobalCommand(current.copy(packetSteering = !current.packetSteering)),
                            ); load()
                        }
                    }
                }) { Text(if (current.packetSteering) "关闭 Steering" else "开启 Steering") }
            }
        }
    }
}

@Composable
private fun InterfaceEditDialog(current: NetworkInterfaceSettings, onDone: (NetworkInterfaceSettings?) -> Unit) {
    var proto by remember { mutableStateOf(current.proto) }
    var device by remember { mutableStateOf(current.device) }
    var ipaddr by remember { mutableStateOf(current.ipaddr) }
    var netmask by remember { mutableStateOf(current.netmask) }
    var gateway by remember { mutableStateOf(current.gateway) }
    var dns by remember { mutableStateOf(current.dns) }
    var auto by remember { mutableStateOf(current.auto) }
    var firewallZone by remember { mutableStateOf(current.firewallZone) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { onDone(null) },
        title = { Text("编辑接口 ${current.section}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(proto, { proto = it }, label = { Text("协议(static/dhcp/pppoe…)") }, singleLine = true)
                OutlinedTextField(device, { device = it }, label = { Text("物理设备") }, singleLine = true)
                OutlinedTextField(ipaddr, { ipaddr = it }, label = { Text("IPv4 地址") }, singleLine = true)
                OutlinedTextField(netmask, { netmask = it }, label = { Text("子网掩码") }, singleLine = true)
                OutlinedTextField(gateway, { gateway = it }, label = { Text("网关") }, singleLine = true)
                OutlinedTextField(dns, { dns = it }, label = { Text("DNS") }, singleLine = true)
                OutlinedTextField(firewallZone, { firewallZone = it }, label = { Text("防火墙区域") }, singleLine = true)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("开机自动启动", Modifier.weight(1f))
                    Switch(checked = auto, onCheckedChange = { auto = it })
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                try {
                    onDone(
                        current.copy(
                            proto = proto, device = device, ipaddr = ipaddr, netmask = netmask,
                            gateway = gateway, dns = dns, auto = auto,
                            useCustomDns = dns.isNotBlank(), firewallZone = firewallZone,
                        ),
                    )
                } catch (caught: Exception) {
                    error = caught.message
                }
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = { onDone(null) }) { Text("取消") } },
    )
}

@Composable
private fun DeviceEditDialog(current: NetworkDeviceSettings, onDone: (NetworkDeviceSettings?) -> Unit) {
    var name by remember { mutableStateOf(current.name) }
    var type by remember { mutableStateOf(current.type) }
    var macaddr by remember { mutableStateOf(current.macaddr) }
    var mtu by remember { mutableStateOf(current.mtu) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { onDone(null) },
        title = { Text("编辑设备 ${current.section}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("名称") }, singleLine = true)
                OutlinedTextField(type, { type = it }, label = { Text("类型(bridge…)") }, singleLine = true)
                OutlinedTextField(macaddr, { macaddr = it }, label = { Text("MAC(可选)") }, singleLine = true)
                OutlinedTextField(mtu, { mtu = it }, label = { Text("MTU(可选)") }, singleLine = true)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                try {
                    onDone(current.copy(name = name, type = type, macaddr = macaddr.trim(), mtu = mtu.trim()))
                } catch (caught: Exception) {
                    error = caught.message
                }
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = { onDone(null) }) { Text("取消") } },
    )
}

@Composable
private fun ScheduleSection(router: com.app.openwrtstatusapp.core.model.RouterProfile, state: TaskState) {
    val scope = rememberCoroutineScope()
    var crons by remember { mutableStateOf<List<String>>(emptyList()) }
    var minute by remember { mutableStateOf("0") }
    var hour by remember { mutableStateOf("4") }
    var weekdays by remember { mutableStateOf("1-5") }

    fun load() = runTask(scope, state, silent = true) {
        crons = LuciSystemParsers.parseCronEntries(
            AppGraph.session.exec(router, LuciSystemCommands.buildCronSnapshotCommand()),
        )
        "已加载 ${crons.size} 条计划任务。"
    }
    LaunchedEffect(router.id) { load() }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionCard("计划任务(${crons.size})") {
            if (crons.isEmpty()) Text("暂无计划任务。")
            crons.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
        SectionCard("定时执行") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(minute, { minute = it }, label = { Text("分钟") }, modifier = Modifier.weight(1f), singleLine = true)
                OutlinedTextField(hour, { hour = it }, label = { Text("小时") }, modifier = Modifier.weight(1f), singleLine = true)
                OutlinedTextField(weekdays, { weekdays = it }, label = { Text("星期") }, modifier = Modifier.weight(1f), singleLine = true)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionButton("定时重启", enabled = !state.loading) {
                    scope.launch {
                        runTask(scope, state) {
                            AppGraph.session.exec(router, LuciSystemCommands.buildScheduledActionCommand(minute, hour, weekdays, ScheduledAction.REBOOT)); load()
                        }
                    }
                }
                ActionButton("定时重连 WAN", enabled = !state.loading) {
                    scope.launch {
                        runTask(scope, state) {
                            AppGraph.session.exec(router, LuciSystemCommands.buildScheduledActionCommand(minute, hour, weekdays, ScheduledAction.WAN_RECONNECT)); load()
                        }
                    }
                }
                ActionButton("定时刷新 DDNS", enabled = !state.loading) {
                    scope.launch {
                        runTask(scope, state) {
                            AppGraph.session.exec(router, LuciSystemCommands.buildScheduledActionCommand(minute, hour, weekdays, ScheduledAction.DDNS_REFRESH)); load()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PasswordSection(router: com.app.openwrtstatusapp.core.model.RouterProfile, state: TaskState) {
    val scope = rememberCoroutineScope()
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }

    SectionCard("修改路由器 root 密码") {
        OutlinedTextField(password, { password = it }, label = { Text("新密码") }, singleLine = true)
        OutlinedTextField(confirm, { confirm = it }, label = { Text("确认新密码") }, singleLine = true)
        message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
        OutputPanel(state)
        ActionButton("修改密码", enabled = !state.loading && password.isNotEmpty()) {
            if (password != confirm) {
                message = "两次输入的密码不一致。"
                return@ActionButton
            }
            scope.launch {
                runTask(scope, state) {
                    AppGraph.session.exec(router, LuciSystemCommands.buildChangeRouterPasswordCommand(password)).also {
                        AppGraph.repository.savePassword(router.id, password)
                        AppGraph.repository.saveSshPassword(router.id, password)
                        password = ""; confirm = ""
                        message = "密码已修改,应用内保存的密码已同步更新。"
                    }
                }
            }
        }
    }
}
