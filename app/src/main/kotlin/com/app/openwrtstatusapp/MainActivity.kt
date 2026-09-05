package com.app.openwrtstatusapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Router
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.app.openwrtstatusapp.core.model.RouterSettings
import com.app.openwrtstatusapp.ui.dashboard.DashboardScreen
import com.app.openwrtstatusapp.ui.routers.RouterFormScreen
import com.app.openwrtstatusapp.ui.routers.RoutersScreen
import com.app.openwrtstatusapp.ui.settings.SettingsScreen
import com.app.openwrtstatusapp.ui.ssh.SshScreen
import com.app.openwrtstatusapp.ui.theme.AppTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppGraph.init(this)
        enableEdgeToEdge()
        setContent {
            val settings by AppGraph.repository.settingsFlow
                .collectAsStateWithLifecycle(initialValue = RouterSettings())
            val darkTheme = when (settings.themeMode) {
                "light" -> false
                "dark" -> true
                else -> isSystemInDarkTheme()
            }
            AppTheme(darkTheme = darkTheme) {
                OpenWrtApp()
            }
        }
    }
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    Tab("dashboard", "状态", Icons.Filled.Dashboard),
    Tab("toolsHub", "工具", Icons.Filled.Build),
    Tab("servicesHub", "服务", Icons.Filled.Apps),
    Tab("routers", "路由器", Icons.Filled.Router),
    Tab("settings", "设置", Icons.Filled.Settings),
)

@Composable
fun OpenWrtApp() {
    val nav = rememberNavController()
    Scaffold(
        bottomBar = {
            NavigationBar {
                val currentRoute = nav.currentBackStackEntryAsRoute()
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = currentRoute == tab.route,
                        onClick = {
                            nav.navigate(tab.route) {
                                popUpTo(nav.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = "dashboard",
            modifier = Modifier.padding(padding),
        ) {
            composable("dashboard") {
                DashboardScreen(onGoRouters = { nav.navigate("routers") })
            }
            composable("toolsHub") {
                com.app.openwrtstatusapp.ui.hubs.ToolsHubScreen { route -> nav.navigate(route) }
            }
            composable("servicesHub") {
                com.app.openwrtstatusapp.ui.hubs.ServicesHubScreen { route -> nav.navigate(route) }
            }
            composable("routers") {
                RoutersScreen(
                    onEdit = { profileId -> nav.navigate("routerForm?profileId=$profileId") },
                )
            }
            composable("routerForm?profileId={profileId}") { entry ->
                RouterFormScreen(
                    profileId = entry.arguments?.getString("profileId"),
                    onDone = { nav.popBackStack() },
                )
            }
            composable("ssh") { SshScreen() }
            composable("settings") { SettingsScreen() }

            // 工具
            composable("diagnostics") { com.app.openwrtstatusapp.ui.tools.DiagnosticsScreen() }
            composable("quickActions") { com.app.openwrtstatusapp.ui.tools.QuickActionsScreen() }
            composable("natDetection") { com.app.openwrtstatusapp.ui.tools.NatDetectionScreen() }
            composable("wol") { com.app.openwrtstatusapp.ui.tools.WakeOnLanScreen() }
            composable("diskSpeed") { com.app.openwrtstatusapp.ui.tools.DiskSpeedScreen() }
            composable("benchmark") { com.app.openwrtstatusapp.ui.tools.PerformanceBenchmarkScreen() }
            composable("files") { com.app.openwrtstatusapp.ui.files.FilesScreen() }
            composable("bulk") { com.app.openwrtstatusapp.ui.network.BulkOperationsScreen() }

            // 服务
            composable("servicesHealth") { com.app.openwrtstatusapp.ui.services.ServicesHealthScreen() }
            composable("proxyServices") { com.app.openwrtstatusapp.ui.services.ProxyServicesScreen() }
            composable("docker") { com.app.openwrtstatusapp.ui.services.DockerScreen() }
            composable("logs") { com.app.openwrtstatusapp.ui.services.LogsScreen() }
            composable("packages") { com.app.openwrtstatusapp.ui.packages.PackagesScreen() }
            composable("systemAdmin") { com.app.openwrtstatusapp.ui.system.SystemAdminScreen() }
            composable("firewall") { com.app.openwrtstatusapp.ui.network.FirewallScreen() }
            composable("dhcpLeases") { com.app.openwrtstatusapp.ui.network.DhcpLeasesScreen() }
            composable("clients") { com.app.openwrtstatusapp.ui.network.ClientsScreen() }
            composable("wirelessManager") { com.app.openwrtstatusapp.ui.network.WirelessManagerScreen() }
            composable("wirelessOptimizer") { com.app.openwrtstatusapp.ui.network.WirelessOptimizerScreen() }
            composable("weakSignal") { com.app.openwrtstatusapp.ui.network.WeakSignalScreen() }
            composable("maintenance") { com.app.openwrtstatusapp.ui.tools.MaintenanceToolsScreen() }
            composable("firmwareRelease") { com.app.openwrtstatusapp.ui.firmware.FirmwareReleaseScreen() }
            composable("guestNetwork") { com.app.openwrtstatusapp.ui.tools.GuestNetworkScreen() }
        }
    }
}

private fun androidx.navigation.NavController.currentBackStackEntryAsRoute(): String =
    currentDestination?.route ?: ""
