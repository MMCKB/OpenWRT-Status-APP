package com.app.openwrtstatusapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
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
    Tab("routers", "路由器", Icons.Filled.Router),
    Tab("ssh", "SSH", Icons.Filled.Terminal),
    Tab("settings", "设置", Icons.Filled.Settings),
)

@Composable
fun OpenWrtApp() {
    val nav = rememberNavController()
    // 设置页的主题选项(扩展字段 themeMode):"system" | "light" | "dark"
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
            composable("dashboard") { DashboardScreen(onGoRouters = { nav.navigate("routers") }) }
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
        }
    }
}

private fun androidx.navigation.NavController.currentBackStackEntryAsRoute(): String =
    currentDestination?.route ?: ""
