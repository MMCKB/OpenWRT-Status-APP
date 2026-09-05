package com.app.openwrtstatusapp.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.BuildConfig
import com.app.openwrtstatusapp.core.model.RouterSettings
import kotlinx.coroutines.launch

private val intervalChoices = listOf(
    1 to "1 秒",
    5 to "5 秒",
    10 to "10 秒",
    30 to "30 秒",
    60 to "60 秒",
    0 to "关闭",
)

private val themeChoices = listOf(
    "system" to "跟随系统",
    "light" to "浅色",
    "dark" to "深色",
)

@Composable
fun SettingsScreen() {
    val scope = rememberCoroutineScope()
    val settings by AppGraph.repository.settingsFlow
        .collectAsStateWithLifecycle(initialValue = RouterSettings())

    fun update(transform: (RouterSettings) -> RouterSettings) {
        scope.launch { AppGraph.repository.saveSettings(transform(settings)) }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("设置", style = MaterialTheme.typography.titleLarge)

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("状态刷新间隔", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                intervalChoices.forEach { (seconds, label) ->
                    FilterChip(
                        selected = settings.refreshIntervalSeconds == seconds,
                        onClick = { update { it.copy(refreshIntervalSeconds = seconds) } },
                        label = { Text(label) },
                    )
                }
            }
            Text(
                "1 秒刷新同样只使用一次登录会话(会话自动复用)。",
                style = MaterialTheme.typography.bodySmall,
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("主题", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                themeChoices.forEach { (mode, label) ->
                    FilterChip(
                        selected = settings.themeMode == mode,
                        onClick = { update { it.copy(themeMode = mode) } },
                        label = { Text(label) },
                    )
                }
            }
        }

        Text(
            "Kotlin + Compose 重写版本 ${BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
