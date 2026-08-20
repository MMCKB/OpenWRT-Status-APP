package com.app.openwrtstatusapp.ui

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.app.openwrtstatusapp.data.AppStore
import com.app.openwrtstatusapp.data.MigrationImportResult
import com.app.openwrtstatusapp.data.R2MigrationImporter
import com.app.openwrtstatusapp.data.RouterOperations
import com.app.openwrtstatusapp.domain.RemoteFileEntry
import com.app.openwrtstatusapp.domain.RouterProfile
import com.app.openwrtstatusapp.domain.RouterSettings
import com.app.openwrtstatusapp.domain.RouterStatus
import com.app.openwrtstatusapp.domain.formatBytes
import com.app.openwrtstatusapp.domain.formatUptime
import com.app.openwrtstatusapp.network.NatDetector
import com.app.openwrtstatusapp.network.OpenWrtUbusClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

private val OpenWrtBlue = Color(0xFF0A7EA4)
private val OpenWrtNavy = Color(0xFF071B2B)
private val OpenWrtDark = Color(0xFF101820)
private val OpenWrtSurface = Color(0xFFF4F8FA)
private val OpenWrtMint = Color(0xFF00A98F)

@Composable
fun OpenWrtTheme(mode: String = "system", content: @Composable () -> Unit) {
    val systemDark = androidx.compose.foundation.isSystemInDarkTheme()
    val dark = when (mode) { "dark" -> true; "light" -> false; else -> systemDark }
    MaterialTheme(
        colorScheme = if (dark) androidx.compose.material3.darkColorScheme(
            primary = Color(0xFF59D4E6), secondary = OpenWrtMint, background = OpenWrtDark,
            surface = Color(0xFF16232D), surfaceVariant = Color(0xFF20323E), onSurface = Color(0xFFE8F3F5),
        ) else androidx.compose.material3.lightColorScheme(
            primary = OpenWrtBlue, secondary = OpenWrtMint, background = Color(0xFFF7FAFC),
            surface = Color.White, surfaceVariant = OpenWrtSurface, onSurface = Color(0xFF14212B),
        ),
        shapes = androidx.compose.material3.Shapes(
            extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
            small = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
            medium = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
            large = androidx.compose.foundation.shape.RoundedCornerShape(28.dp),
        ),
        content = content,
    )
}

class RouterViewModel(app: Application) : AndroidViewModel(app) {
    private val store = AppStore(app)
    private val client = OpenWrtUbusClient()
    private val router = RouterOperations()
    private val migration = R2MigrationImporter(app, store)
    private var cachedProfiles = emptyList<RouterProfile>()
    private var cachedSettings = RouterSettings()
    val profiles = store.profiles
    val settings = store.settings
    private val _status = MutableStateFlow<RouterStatus?>(null)
    val status = _status.asStateFlow()
    private val _output = MutableStateFlow<String?>(null)
    val output = _output.asStateFlow()
    private val _files = MutableStateFlow<List<RemoteFileEntry>>(emptyList())
    val files = _files.asStateFlow()
    private val _fileText = MutableStateFlow("")
    val fileText = _fileText.asStateFlow()
    private val _configSnapshot = MutableStateFlow("")
    val configSnapshot = _configSnapshot.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy = _busy.asStateFlow()

    init {
        viewModelScope.launch { profiles.collect { cachedProfiles = it } }
        viewModelScope.launch { settings.collect { cachedSettings = it } }
        viewModelScope.launch {
            when (val result = migration.importIfAvailable()) {
                is MigrationImportResult.Imported -> _output.value = "已安全恢复 R2 的 ${result.profiles} 台路由器与本地设置。"
                is MigrationImportResult.Invalid -> _output.value = "旧版升级数据未恢复：${result.reason}"
                else -> Unit
            }
        }
    }

    fun saveProfile(profile: RouterProfile, password: String) = viewModelScope.launch {
        if (cachedProfiles.any { it.id != profile.id && it.name.equals(profile.name, true) }) {
            _output.value = "路由器名称已存在，请使用不同名称。"; return@launch
        }
        store.saveProfiles(cachedProfiles.filterNot { it.id == profile.id } + profile)
        store.savePassword(profile.id, password)
        store.savePassword(profile.id, password, ssh = true)
        store.saveSettings(cachedSettings.copy(selectedRouterId = profile.id))
    }

    fun selectProfile(id: String) = viewModelScope.launch { store.saveSettings(cachedSettings.copy(selectedRouterId = id)) }
    fun removeProfile(profile: RouterProfile) = viewModelScope.launch {
        router.disconnect(profile)
        store.saveProfiles(cachedProfiles.filterNot { it.id == profile.id })
        val next = cachedProfiles.firstOrNull { it.id != profile.id }?.id
        store.saveSettings(cachedSettings.copy(selectedRouterId = next))
    }

    private fun password(profile: RouterProfile) = store.password(profile.id, ssh = true) ?: store.password(profile.id).orEmpty()
    private inline fun work(crossinline block: suspend () -> String) = viewModelScope.launch {
        _busy.value = true
        _output.value = runCatching { block() }.getOrElse { "操作失败：${it.message ?: "未知错误"}" }
        _busy.value = false
    }
    fun refresh(profile: RouterProfile) = viewModelScope.launch { _busy.value = true; _status.value = client.fetchStatus(profile, password(profile)); _busy.value = false }
    fun connect(profile: RouterProfile) = work { router.connect(profile, password(profile)); "已连接 SSH：${profile.name}" }
    fun disconnect(profile: RouterProfile) { router.disconnect(profile); _output.value = "已断开 SSH。" }
    fun run(profile: RouterProfile, command: String) = work { router.run(profile, password(profile), command) }
    fun nat() = work { NatDetector.detect().let { "公网地址：${it.publicAddress}:${it.publicPort}\nNAT 映射：${it.mapping}\n${it.detail}" } }
    fun packages(profile: RouterProfile, action: String, name: String = "") = work { router.packages(profile, password(profile), action, name) }
    fun openFiles(profile: RouterProfile, path: String) = viewModelScope.launch {
        _busy.value = true
        runCatching { router.listFiles(profile, password(profile), path) }.onSuccess { _files.value = it }.onFailure { _output.value = "读取目录失败：${it.message}" }
        _busy.value = false
    }
    fun readFile(profile: RouterProfile, path: String) = viewModelScope.launch {
        _busy.value = true
        runCatching { router.readText(profile, password(profile), path) }
            .onSuccess { _fileText.value = it }
            .onFailure { _output.value = "读取文件失败：${it.message ?: "未知错误"}" }
        _busy.value = false
    }
    fun writeFile(profile: RouterProfile, path: String, text: String) = work { router.writeText(profile, password(profile), path, text); "已写入 $path" }
    fun copyFile(profile: RouterProfile, source: String, destination: String) = work { router.copyFile(profile, password(profile), source, destination); "已复制到 $destination" }
    fun moveFile(profile: RouterProfile, source: String, destination: String) = work { router.renameFile(profile, password(profile), source, destination); "已移动到 $destination" }
    fun deleteFile(profile: RouterProfile, path: String) = work { router.deleteFile(profile, password(profile), path); "已删除 $path" }
    fun chmod(profile: RouterProfile, path: String, mode: String) = work { router.changePermissions(profile, password(profile), path, mode); "已修改 $path 权限为 $mode" }
    fun loadConfig(profile: RouterProfile, config: String) = viewModelScope.launch {
        _busy.value = true
        _configSnapshot.value = runCatching { router.uciSnapshot(profile, password(profile), config) }
            .getOrElse { "读取配置失败：${it.message ?: "未知错误"}" }
        _busy.value = false
    }
    fun saveConfig(profile: RouterProfile, config: String, assignments: List<String>) = work {
        router.uciBatch(profile, password(profile), config, assignments)
        "配置已提交并重载 $config。"
    }
    fun clearOutput() { _output.value = null }
    fun saveSettings(value: RouterSettings) = viewModelScope.launch { store.saveSettings(value) }
}

private data class Feature(
    val title: String,
    val subtitle: String,
    val command: String,
    val secondaryAction: Pair<String, String>? = null,
    val config: String? = null,
)

private val networkFeatures = listOf(
    Feature("接口", "IPv4、IPv6、链路、MAC 与运行时间", "ubus call network.interface dump", "重载网络" to "/etc/init.d/network reload", "network"),
    Feature("无线网络", "SSID、加密、密码、网络绑定与无线状态", "uci show wireless; ubus call network.wireless status", "重载 Wi‑Fi" to "wifi reload", "wireless"),
    Feature("已连接设备", "DHCP 租约与 ARP 邻居", "cat /tmp/dhcp.leases 2>/dev/null; ip neigh", "刷新 ARP" to "ip neigh flush nud stale 2>/dev/null; ip neigh"),
    Feature("DHCP 与静态租约", "查看与编辑 DHCP UCI 配置", "uci show dhcp", "重载 DHCP" to "/etc/init.d/dnsmasq reload", "dhcp"),
    Feature("防火墙与端口转发", "区域、转发、通信规则和 NAT", "uci show firewall; nft list ruleset 2>/dev/null || iptables-save", "重载防火墙" to "/etc/init.d/firewall reload", "firewall"),
    Feature("网络唤醒", "读取 LuCI 已配置的全部唤醒目标", "uci show wol; cat /tmp/dhcp.leases 2>/dev/null", "检查唤醒工具" to "command -v etherwake || command -v wol", "wol"),
    Feature("无线优化助手", "信道、信号、关联客户端与射频能力", "iwinfo 2>/dev/null; ubus call network.wireless status"),
    Feature("弱信号设备", "定位 RSSI 偏低的无线客户端", "iw dev 2>/dev/null; iwinfo 2>/dev/null"),
)
private val serviceFeatures = listOf("OpenClash", "PassWall", "PassWall2", "AdGuard Home", "DDNS", "Docker 容器", "计划任务", "启动项")
private val toolFeatures = listOf(
    Feature("DNS 测速", "IPv4 / IPv6 DNS 查询延迟", "for dns in 223.5.5.5 1.1.1.1 2606:4700:4700::1111; do echo ==== \$dns; nslookup openwrt.org \$dns 2>&1; done"),
    Feature("性能基准", "CPU、内存和存储采样", "cat /proc/cpuinfo; echo; free; echo; df -h"),
    Feature("LuCI 主题", "发现并切换已安装 LuCI 主题", "ls /www/luci-static/resources/themes 2>/dev/null; uci show luci 2>/dev/null", config = "luci"),
    Feature("系统管理", "LED、挂载点、SSH、启动项与计划任务", "uci show system; uci show fstab; uci show dropbear; crontab -l 2>/dev/null", "生成挂载配置" to "block detect 2>/dev/null", "system"),
    Feature("固件版本检查", "读取当前固件与可更新信息", "ubus call system board; cat /etc/openwrt_release 2>/dev/null"),
    Feature("固件升级", "上传 sysupgrade 镜像前请核对机型与备份", "ubus call system board; df -h /tmp", "生成配置备份" to "sysupgrade -b /tmp/openwrt-backup.tar.gz && ls -lh /tmp/openwrt-backup.tar.gz"),
    Feature("日志中心", "系统、内核和服务运行日志", "logread | tail -n 300; echo; dmesg | tail -n 100"),
    Feature("批量操作", "针对已保存路由器执行相同 SSH 命令", "echo '请在 SSH 终端输入需要批量执行的命令。'"),
    Feature("应用设置", "主题、刷新频率、流量展示与诊断输出", "echo '应用设置保存在 Android 本地 DataStore 中。'"),
    Feature("关于", "版本、开源仓库和兼容性信息", "echo 'OpenWrt 状态 · 纯 Kotlin / Jetpack Compose 客户端'"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OpenWrtRoot(vm: RouterViewModel = viewModel()) {
    val settings by vm.settings.collectAsStateWithLifecycle(RouterSettings())
    OpenWrtTheme(settings.darkMode) { OpenWrtApp(vm) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OpenWrtApp(vm: RouterViewModel = viewModel()) {
    val profiles by vm.profiles.collectAsStateWithLifecycle(emptyList())
    val settings by vm.settings.collectAsStateWithLifecycle(RouterSettings())
    val status by vm.status.collectAsStateWithLifecycle()
    val output by vm.output.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf("状态") }
    var detail by rememberSaveable { mutableStateOf<Feature?>(null) }
    var showRouterEditor by remember { mutableStateOf(false) }
    var showTerminal by remember { mutableStateOf(false) }
    var showPackages by remember { mutableStateOf(false) }
    var showFiles by remember { mutableStateOf(false) }
    var showRouters by remember { mutableStateOf(false) }
    var editingRouter by remember { mutableStateOf<RouterProfile?>(null) }
    var configTarget by rememberSaveable { mutableStateOf<String?>(null) }
    val selected = profiles.firstOrNull { it.id == settings.selectedRouterId } ?: profiles.firstOrNull()
    val snackbars = remember { SnackbarHostState() }

    LaunchedEffect(output) { output?.takeIf { it.startsWith("操作失败") }?.let { snackbars.showSnackbar(it) } }
    val navItems = listOf(
        NavItem("状态", Icons.Default.Home), NavItem("网络", Icons.Default.NetworkCheck),
        NavItem("DHCP", Icons.Default.Storage), NavItem("服务", Icons.Default.Settings),
        NavItem("终端", Icons.Default.Terminal), NavItem("工具", Icons.Default.Build), NavItem("设置", Icons.Default.Dns),
    )
    Scaffold(
        topBar = { CenterAlignedTopAppBar(title = { Text(detail?.title ?: tab) }, navigationIcon = { if (detail != null) IconButton({ detail = null }) { Icon(Icons.Default.Close, "返回") } }, actions = { IconButton({ showRouters = true }) { Icon(Icons.Default.Settings, "路由器列表") }; IconButton({ showRouterEditor = true }) { Icon(Icons.Default.Add, "添加路由器") } }) },
        bottomBar = { if (detail == null) NavigationBar { Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) { navItems.forEach { item -> NavigationBarItem(modifier = Modifier.width(78.dp), selected = tab == item.label, onClick = { tab = item.label }, icon = { Icon(item.icon, item.label) }, label = { Text(item.label) }) } } } },
        snackbarHost = { SnackbarHost(snackbars) },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            if (selected == null) EmptyState { showRouterEditor = true }
            else if (detail != null) FeaturePage(selected, detail!!, busy, output, vm::run, onEditConfig = { configTarget = it })
            else when (tab) {
                "状态" -> Dashboard(selected, status, busy, vm::refresh, vm::connect, vm::disconnect, showTerminal = { showTerminal = true }, showFiles = { showFiles = true }, showPackages = { showPackages = true })
                "网络" -> FeatureList("网络与无线", networkFeatures) { detail = it }
                "DHCP" -> FeatureList("DHCP 与静态租约", networkFeatures.filter { it.title == "DHCP 与静态租约" }) { detail = it }
                "服务" -> ServiceList(selected, serviceFeatures, busy, output, vm::run, onEditConfig = { configTarget = it })
                "终端" -> TerminalPage(selected, busy, output, vm::run)
                "工具" -> ToolsPage(busy, output, vm::nat, toolFeatures, onFeature = { detail = it }, terminal = { showTerminal = true }, files = { showFiles = true }, packages = { showPackages = true })
                else -> SettingsPage(settings, vm::saveSettings)
            }
        }
    }
    if (showRouterEditor) RouterEditor(existing = editingRouter, onDismiss = { showRouterEditor = false; editingRouter = null }, onSave = { profile, password -> vm.saveProfile(profile, password); showRouterEditor = false; editingRouter = null })
    if (showRouters) RouterListDialog(
        profiles = profiles,
        selectedId = selected?.id,
        onSelect = { vm.selectProfile(it); showRouters = false },
        onEdit = { editingRouter = it; showRouterEditor = true; showRouters = false },
        onRemove = vm::removeProfile,
        onDismiss = { showRouters = false },
    )
    if (showTerminal && selected != null) TerminalDialog(selected, busy, vm::run, onDismiss = { showTerminal = false })
    if (showPackages && selected != null) PackageDialog(selected, busy, vm::packages, onDismiss = { showPackages = false })
    if (showFiles && selected != null) FileDialog(selected, vm, busy, onDismiss = { showFiles = false })
    if (configTarget != null && selected != null) ConfigEditorDialog(
        profile = selected,
        config = configTarget!!,
        busy = busy,
        snapshot = vm.configSnapshot.collectAsStateWithLifecycle().value,
        onLoad = vm::loadConfig,
        onSave = vm::saveConfig,
        onDismiss = { configTarget = null },
    )
}

private data class NavItem(val label: String, val icon: ImageVector)

@Composable private fun EmptyState(add: () -> Unit) = Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { Text("尚未添加路由器", style = MaterialTheme.typography.titleLarge); Spacer(Modifier.height(8.dp)); Text("添加 OpenWrt 的 LuCI 地址和 SSH 登录资料，即可查看状态与管理配置。", color = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.height(18.dp)); Button(add) { Text("添加路由器") } }

@Composable private fun Dashboard(profile: RouterProfile, status: RouterStatus?, busy: Boolean, refresh: (RouterProfile) -> Unit, connect: (RouterProfile) -> Unit, disconnect: (RouterProfile) -> Unit, showTerminal: () -> Unit, showFiles: () -> Unit, showPackages: () -> Unit) = LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    item { Card(colors = CardDefaults.cardColors(containerColor = OpenWrtNavy, contentColor = Color.White)) { Column(Modifier.padding(20.dp)) { Row(verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text("OPENWRT DASHBOARD", style = MaterialTheme.typography.labelMedium, color = Color(0xFF8FD7E2)); Text(profile.name, style = MaterialTheme.typography.headlineSmall); Text(profile.baseUrl, color = Color(0xFFB7CAD1), style = MaterialTheme.typography.bodySmall) }; FilledTonalButton({ refresh(profile) }, enabled = !busy) { Icon(Icons.Default.Refresh, null); Spacer(Modifier.width(5.dp)); Text(if (busy) "刷新中" else "刷新") } }; Spacer(Modifier.height(18.dp)); val system = status?.system; Text(system?.model ?: "正在等待状态数据", style = MaterialTheme.typography.titleMedium); Text("${system?.firmware ?: "—"} · ${formatUptime(system?.uptimeSeconds)}", color = Color(0xFFB7CAD1)); status?.error?.let { Text(it, color = Color(0xFFFFB4AB), style = MaterialTheme.typography.bodySmall) } } } }
    item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) { MetricTile("CPU 温度", status?.system?.cpuTemperature ?: "—", Modifier.weight(1f)); MetricTile("WiFi 温度", status?.system?.wifiTemperature ?: "—", Modifier.weight(1f)) } }
    item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) { MetricTile("内存", status?.system?.memoryAvailable?.let { formatBytes(it) } ?: "—", Modifier.weight(1f)); MetricTile("负载", status?.system?.load?.firstOrNull()?.let { "%.2f".format(it) } ?: "—", Modifier.weight(1f)) } }
    item { Text("快捷操作", style = MaterialTheme.typography.titleMedium) }
    item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { FilledTonalButton({ connect(profile) }, Modifier.weight(1f), enabled = !busy) { Text("连接 SSH") }; FilledTonalButton({ disconnect(profile) }, Modifier.weight(1f)) { Text("断开 SSH") } } }
    item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedButton(showTerminal, Modifier.weight(1f)) { Text("SSH 终端") }; OutlinedButton(showFiles, Modifier.weight(1f)) { Text("文件管理") }; OutlinedButton(showPackages, Modifier.weight(1f)) { Text("软件包") } } }
    item { Text("接口", style = MaterialTheme.typography.titleMedium) }
    items(status?.interfaces?.size ?: 0) { index -> val item = status!!.interfaces[index]; Card { Column(Modifier.padding(16.dp)) { Text(item.name, style = MaterialTheme.typography.titleMedium); Text("${item.device} · ${if (item.up) "已连接" else "未连接"}"); Text("IPv4：${item.ipv4.joinToString().ifBlank { "未分配" }}"); Text("IPv6：${item.ipv6.joinToString().ifBlank { "未分配" }}") } } }
}

@Composable private fun MetricTile(label: String, value: String, modifier: Modifier = Modifier) = Card(modifier) { Column(Modifier.padding(14.dp)) { Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium); Spacer(Modifier.height(5.dp)); Text(value, style = MaterialTheme.typography.titleLarge) } }
@Composable private fun Info(label: String, value: String) = Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) { Text(label, Modifier.weight(.36f), color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, Modifier.weight(.64f)) }
@Composable private fun FeatureList(title: String, entries: List<Feature>, onClick: (Feature) -> Unit) = LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { item { Text(title, style = MaterialTheme.typography.titleLarge) }; items(entries.size) { index -> val item = entries[index]; Card(onClick = { onClick(item) }) { Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(item.title, style = MaterialTheme.typography.titleMedium); Text(item.subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant) }; Icon(Icons.Default.ChevronRight, null) } } } }
@Composable private fun FeaturePage(profile: RouterProfile, feature: Feature, busy: Boolean, output: String?, run: (RouterProfile, String) -> Unit, onEditConfig: (String) -> Unit) = LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Text(feature.subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant) }; item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Button({ run(profile, feature.command) }, enabled = !busy) { Icon(Icons.Default.PlayArrow, null); Spacer(Modifier.width(6.dp)); Text(if (busy) "执行中" else "读取") }; feature.secondaryAction?.let { (label, command) -> OutlinedButton({ run(profile, command) }, enabled = !busy) { Text(label) } } } }; feature.config?.let { config -> item { FilledTonalButton({ onEditConfig(config) }, enabled = !busy) { Text("编辑 ${feature.title} 配置") } } }; item { Text("读取与修改均经由 SSH 执行。编辑器仅接受 UCI assignment（例如 wireless.@wifi-iface[0].ssid='Home'），保存时自动提交并重载对应服务。", color = MaterialTheme.colorScheme.onSurfaceVariant) }; item { OutputPanel(output) } }
@Composable
private fun ServiceList(
    profile: RouterProfile,
    services: List<String>,
    busy: Boolean,
    output: String?,
    run: (RouterProfile, String) -> Unit,
    onEditConfig: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { Text("服务管理", style = MaterialTheme.typography.titleLarge) }
        items(services.size) { index ->
            val service = services[index]
            val id = service.lowercase().replace(" ", "")
            Card {
                Column(Modifier.padding(16.dp)) {
                    Text(service, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilledTonalButton(
                            onClick = { run(profile, "/etc/init.d/$id status 2>&1; uci show $id 2>/dev/null") },
                            enabled = !busy,
                        ) { Text("状态/设置") }
                        FilledTonalButton(
                            onClick = { run(profile, "/etc/init.d/$id restart 2>&1") },
                            enabled = !busy,
                        ) { Text("重启") }
                    }
                    OutlinedButton(
                        onClick = { run(profile, "logread -e '$service' 2>/dev/null || tail -n 200 /tmp/${id}.log 2>/dev/null") },
                        enabled = !busy,
                    ) { Text("查看日志") }
                    if (id in setOf("openclash", "passwall", "passwall2", "ddns", "adguardhome")) {
                        TextButton(onClick = { onEditConfig(id) }, enabled = !busy) { Text("编辑应用配置") }
                    }
                }
            }
        }
        item { OutputPanel(output) }
    }
}
@Composable private fun ToolsPage(busy: Boolean, output: String?, nat: () -> Unit, entries: List<Feature>, onFeature: (Feature) -> Unit, terminal: () -> Unit, files: () -> Unit, packages: () -> Unit) = LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { item { Text("工具", style = MaterialTheme.typography.titleLarge) }; item { Card(onClick = nat) { Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Public, null); Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { Text("手机 NAT 检测", style = MaterialTheme.typography.titleMedium); Text("不依赖路由器 SSH，使用手机网络 STUN 检测", color = MaterialTheme.colorScheme.onSurfaceVariant) }; Icon(Icons.Default.PlayArrow, null) } } }; item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedButton(terminal, Modifier.weight(1f)) { Text("SSH 终端") }; OutlinedButton(files, Modifier.weight(1f)) { Text("文件管理") }; OutlinedButton(packages, Modifier.weight(1f)) { Text("软件包") } } }; items(entries.size) { index -> val item = entries[index]; Card(onClick = { onFeature(item) }) { Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(item.title, style = MaterialTheme.typography.titleMedium); Text(item.subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant) }; Icon(Icons.Default.ChevronRight, null) } } }; item { OutputPanel(output) } }

@Composable private fun TerminalPage(profile: RouterProfile, busy: Boolean, output: String?, run: (RouterProfile, String) -> Unit) { var command by rememberSaveable { mutableStateOf("ubus call system board") }; LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Text("SSH 终端", style = MaterialTheme.typography.titleLarge); Text("在 ${profile.name} 上执行命令。仅运行可信命令。", color = MaterialTheme.colorScheme.onSurfaceVariant) }; item { OutlinedTextField(command, { command = it }, Modifier.fillMaxWidth(), label = { Text("命令") }, minLines = 5, textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)) }; item { Button({ run(profile, command) }, enabled = command.isNotBlank() && !busy) { Icon(Icons.Default.PlayArrow, null); Spacer(Modifier.width(6.dp)); Text(if (busy) "执行中" else "执行") } }; item { OutputPanel(output) } } }

@Composable private fun SettingsPage(settings: RouterSettings, save: (RouterSettings) -> Unit) = LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Text("设置", style = MaterialTheme.typography.titleLarge) }; item { Card { Column(Modifier.padding(16.dp)) { Text("外观", style = MaterialTheme.typography.titleMedium); Text("更改后立即应用，无需重启。", color = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.height(10.dp)); Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("system" to "跟随系统", "light" to "浅色", "dark" to "深色").forEach { (mode, label) -> FilterChip(selected = settings.darkMode == mode, onClick = { save(settings.copy(darkMode = mode)) }, label = { Text(label) }) } } } } }; item { Card { Column(Modifier.padding(16.dp)) { Text("状态刷新", style = MaterialTheme.typography.titleMedium); Text("当前间隔：${settings.refreshIntervalSeconds} 秒", color = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.height(8.dp)); Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf(1, 3, 5, 10).forEach { seconds -> FilterChip(selected = settings.refreshIntervalSeconds == seconds, onClick = { save(settings.copy(refreshIntervalSeconds = seconds)) }, label = { Text("${seconds}s") }) } } } } }; item { Card { Column(Modifier.padding(16.dp)) { Text("关于", style = MaterialTheme.typography.titleMedium); Text("OpenWrt 路由器状态\nKotlin + Jetpack Compose\n支持 LuCI HTTP、SSH/SFTP 与本地 STUN NAT 检测", color = MaterialTheme.colorScheme.onSurfaceVariant) } } } }

@Composable private fun OutputPanel(output: String?) { if (!output.isNullOrBlank()) Card { Column(Modifier.padding(12.dp)) { Text("命令输出", style = MaterialTheme.typography.titleSmall); Spacer(Modifier.height(6.dp)); LazyColumn(Modifier.fillMaxWidth().height(240.dp)) { item { Text(output, style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)) } } } } }

@Composable private fun TerminalDialog(profile: RouterProfile, busy: Boolean, run: (RouterProfile, String) -> Unit, onDismiss: () -> Unit) { var command by remember { mutableStateOf("ubus call system board") }; AlertDialog(onDismissRequest = onDismiss, title = { Text("SSH 终端") }, text = { Column { Text("命令将在 ${profile.name} 上通过 SSH 执行。", color = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.height(8.dp)); OutlinedTextField(command, { command = it }, Modifier.fillMaxWidth(), label = { Text("命令") }, minLines = 4, textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)) } }, confirmButton = { Button({ run(profile, command) }, enabled = command.isNotBlank() && !busy) { Text("执行") } }, dismissButton = { TextButton(onDismiss) { Text("关闭") } }) }
@Composable private fun PackageDialog(profile: RouterProfile, busy: Boolean, packages: (RouterProfile, String, String) -> Unit, onDismiss: () -> Unit) { var packageName by remember { mutableStateOf("") }; AlertDialog(onDismissRequest = onDismiss, title = { Text("软件包管理") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { Text("兼容 OpenWrt APK 与 OPKG。请仅安装来自可信仓库的软件包。", color = MaterialTheme.colorScheme.onSurfaceVariant); OutlinedTextField(packageName, { packageName = it }, Modifier.fillMaxWidth(), label = { Text("包名") }); Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FilledTonalButton({ packages(profile, "update", "") }, enabled = !busy) { Text("更新源") }; FilledTonalButton({ packages(profile, "list", "") }, enabled = !busy) { Text("已安装") } }; Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Button({ packages(profile, "install", packageName) }, enabled = packageName.isNotBlank() && !busy) { Text("安装") }; OutlinedButton({ packages(profile, "remove", packageName) }, enabled = packageName.isNotBlank() && !busy) { Text("卸载") } } } }, confirmButton = { TextButton(onDismiss) { Text("关闭") } }) }
@Composable private fun FileDialog(profile: RouterProfile, vm: RouterViewModel, busy: Boolean, onDismiss: () -> Unit) {
    val files by vm.files.collectAsStateWithLifecycle()
    val fileText by vm.fileText.collectAsStateWithLifecycle()
    var path by remember { mutableStateOf("/") }
    var selectedFile by remember { mutableStateOf<RemoteFileEntry?>(null) }
    var editorPath by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("文件管理") },
        text = {
            LazyColumn(Modifier.height(360.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                item { Row { OutlinedTextField(path, { path = it }, Modifier.weight(1f), label = { Text("远程目录") }); IconButton({ vm.openFiles(profile, path) }, enabled = !busy) { Icon(Icons.Default.Refresh, "刷新") } } }
                item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FilledTonalButton({ vm.openFiles(profile, path) }, enabled = !busy) { Icon(Icons.Default.Folder, null); Spacer(Modifier.width(4.dp)); Text("读取目录") }; OutlinedButton({ vm.run(profile, "pwd; df -h") }, enabled = !busy) { Text("存储") } } }
                items(files.size) { index ->
                    val entry = files[index]
                    Card(onClick = { if (entry.kind == "directory") { path = entry.path; vm.openFiles(profile, entry.path) } else { vm.readFile(profile, entry.path); editorPath = entry.path } }) {
                        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Icon(if (entry.kind == "directory") Icons.Default.Folder else Icons.Default.Build, null); Spacer(Modifier.width(8.dp)); Column(Modifier.weight(1f)) { Text(entry.name); Text(entry.modified ?: "", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall) }; if (entry.kind != "directory") TextButton({ selectedFile = entry }) { Text("操作") } }
                    }
                }
            }
        },
        confirmButton = { TextButton(onDismiss) { Text("关闭") } },
    )
    selectedFile?.let { FileActionsDialog(profile, it.path, busy, vm, onDismiss = { selectedFile = null }) }
    editorPath?.let { RemoteTextEditor(profile, it, fileText, busy, vm, onDismiss = { editorPath = null }) }
}

@Composable private fun FileActionsDialog(profile: RouterProfile, source: String, busy: Boolean, vm: RouterViewModel, onDismiss: () -> Unit) {
    var target by remember(source) { mutableStateOf(source) }
    var mode by remember { mutableStateOf("644") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("文件操作") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(source, style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(target, { target = it }, label = { Text("目标路径") })
                OutlinedTextField(mode, { mode = it }, label = { Text("权限（八进制）") })
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton(
                        onClick = { vm.copyFile(profile, source, target); onDismiss() },
                        enabled = target.isNotBlank() && target != source && !busy,
                    ) { Text("复制") }
                    FilledTonalButton(
                        onClick = { vm.moveFile(profile, source, target); onDismiss() },
                        enabled = target.isNotBlank() && target != source && !busy,
                    ) { Text("移动") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { vm.chmod(profile, source, mode); onDismiss() }, enabled = !busy) { Text("权限") }
                    OutlinedButton(onClick = { vm.deleteFile(profile, source); onDismiss() }, enabled = !busy) { Text("删除") }
                }
            }
        },
        confirmButton = { TextButton(onDismiss) { Text("关闭") } },
    )
}

@Composable private fun RemoteTextEditor(profile: RouterProfile, path: String, loaded: String, busy: Boolean, vm: RouterViewModel, onDismiss: () -> Unit) {
    var draft by remember(path, loaded) { mutableStateOf(loaded) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("编辑文件") }, text = { OutlinedTextField(draft, { draft = it }, Modifier.fillMaxWidth().height(360.dp), label = { Text(path) }, textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace), minLines = 12, enabled = !busy) }, confirmButton = { Button({ vm.writeFile(profile, path, draft); onDismiss() }, enabled = !busy && draft != loaded) { Text("保存") } }, dismissButton = { TextButton(onDismiss) { Text("关闭") } })
}
@Composable
private fun ConfigEditorDialog(
    profile: RouterProfile,
    config: String,
    busy: Boolean,
    snapshot: String,
    onLoad: (RouterProfile, String) -> Unit,
    onSave: (RouterProfile, String, List<String>) -> Unit,
    onDismiss: () -> Unit,
) {
    var draft by remember(config) { mutableStateOf("") }
    var loaded by remember(config) { mutableStateOf(false) }
    LaunchedEffect(config) { onLoad(profile, config) }
    LaunchedEffect(snapshot) {
        if (snapshot.isNotBlank() && !snapshot.startsWith("读取配置失败")) {
            draft = snapshot
            loaded = true
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("编辑 $config 配置") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("每行填写一条 UCI assignment。未修改时关闭不会写入；保存会提交并重载服务。", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(value = draft, onValueChange = { draft = it }, modifier = Modifier.fillMaxWidth().height(330.dp), label = { Text(if (loaded) "UCI 配置快照" else "正在读取配置") }, textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace), minLines = 10, enabled = !busy)
            }
        },
        confirmButton = {
            Button(onClick = {
                onSave(profile, config, draft.lineSequence().map(String::trim).filter { it.isNotBlank() && "=" in it }.toList())
                onDismiss()
            }, enabled = !busy && draft.isNotBlank() && draft != snapshot) { Text("保存") }
        },
        dismissButton = { TextButton(onDismiss) { Text("关闭") } },
    )
}
@Composable private fun RouterEditor(existing: RouterProfile?, onDismiss: () -> Unit, onSave: (RouterProfile, String) -> Unit) { var name by remember(existing) { mutableStateOf(existing?.name.orEmpty()) }; var address by remember(existing) { mutableStateOf(existing?.baseUrl.orEmpty()) }; var user by remember(existing) { mutableStateOf(existing?.sshUsername ?: "root") }; var password by remember { mutableStateOf("") }; AlertDialog(onDismissRequest = onDismiss, title = { Text(if (existing == null) "添加路由器" else "编辑路由器") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedTextField(name, { name = it }, label = { Text("名称") }); OutlinedTextField(address, { address = it }, label = { Text("LuCI 地址") }); OutlinedTextField(user, { user = it }, label = { Text("LuCI / SSH 用户名") }); OutlinedTextField(password, { password = it }, label = { Text(if (existing == null) "LuCI / SSH 密码" else "新密码（留空不修改）") }) } }, confirmButton = { Button({ onSave(RouterProfile(existing?.id ?: UUID.randomUUID().toString(), name.ifBlank { "OpenWrt" }, address, user, user), password) }, enabled = address.isNotBlank()) { Text("保存") } }, dismissButton = { TextButton(onDismiss) { Text("关闭") } }) }

@Composable private fun RouterListDialog(profiles: List<RouterProfile>, selectedId: String?, onSelect: (String) -> Unit, onEdit: (RouterProfile) -> Unit, onRemove: (RouterProfile) -> Unit, onDismiss: () -> Unit) = AlertDialog(onDismissRequest = onDismiss, title = { Text("路由器") }, text = { LazyColumn(Modifier.height(280.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { items(profiles.size) { index -> val profile = profiles[index]; Card(onClick = { onSelect(profile.id) }) { Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(profile.name); Text(profile.baseUrl, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }; if (profile.id == selectedId) Text("当前", color = MaterialTheme.colorScheme.primary); TextButton({ onEdit(profile) }) { Text("编辑") }; TextButton({ onRemove(profile) }) { Text("删除") } } } } } }, confirmButton = { TextButton(onDismiss) { Text("关闭") } })
