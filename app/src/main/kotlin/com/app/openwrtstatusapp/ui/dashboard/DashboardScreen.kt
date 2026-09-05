package com.app.openwrtstatusapp.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.core.model.InterfaceStatus
import com.app.openwrtstatusapp.core.model.RouterProfile
import com.app.openwrtstatusapp.core.model.RouterStatus
import com.app.openwrtstatusapp.core.model.WirelessStatus
import com.app.openwrtstatusapp.core.ubus.formatBytes
import com.app.openwrtstatusapp.core.ubus.formatLoad
import com.app.openwrtstatusapp.core.ubus.formatUptime
import com.app.openwrtstatusapp.core.ubus.memoryUsagePercent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

class DashboardViewModel : ViewModel() {
    data class UiState(
        val selectedRouter: RouterProfile? = null,
        val status: RouterStatus? = null,
        val error: String? = null,
        val refreshing: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state
    private var inFlight = false

    init {
        viewModelScope.launch {
            while (true) {
                val settings = AppGraph.repository.settingsFlow.first()
                val profiles = AppGraph.repository.profilesFlow.first()
                val selected = profiles.find { it.id == settings.selectedRouterId }
                _state.update { it.copy(selectedRouter = selected) }
                if (selected != null && settings.refreshIntervalSeconds > 0) {
                    refresh(selected)
                    delay(settings.refreshIntervalSeconds.coerceAtMost(3600) * 1000L)
                } else {
                    delay(2_000)
                }
            }
        }
    }

    fun refreshNow() {
        _state.value.selectedRouter?.let { selected ->
            viewModelScope.launch { refresh(selected) }
        }
    }

    private suspend fun refresh(profile: RouterProfile) {
        if (inFlight) return
        inFlight = true
        _state.update { it.copy(refreshing = true) }
        try {
            val password = AppGraph.repository.loadPassword(profile.id)
                ?: throw Exception("未找到已保存的路由器密码,请重新编辑该路由器。")
            val status = AppGraph.ubusClient.fetchRouterStatus(
                profile.id, profile.baseUrl, profile.username, password,
            )
            _state.update { it.copy(status = status, error = null) }
        } catch (error: Exception) {
            _state.update { it.copy(error = error.message ?: "未知错误") }
        } finally {
            inFlight = false
            _state.update { it.copy(refreshing = false) }
        }
    }
}

@Composable
fun DashboardScreen(
    onGoRouters: () -> Unit,
    viewModel: DashboardViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val selected = state.selectedRouter

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = selected?.name ?: "状态",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.weight(1f),
            )
            if (state.refreshing) {
                CircularProgressIndicator(Modifier.height(20.dp))
            }
        }
        Spacer(Modifier.height(12.dp))

        val status = state.status
        val error = state.error
        when {
            selected == null -> EmptyState(onGoRouters)
            error != null && status == null -> ErrorState(error, onGoRouters)
            status != null -> StatusContent(status)
        }
    }
}

@Composable
private fun EmptyState(onGoRouters: () -> Unit) {
    Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("尚未选择路由器")
        Spacer(Modifier.height(12.dp))
        Button(onClick = onGoRouters) { Text("去添加或选择路由器") }
    }
}

@Composable
private fun ErrorState(message: String, retry: () -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
        Text(message, color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(12.dp))
        Button(onClick = retry) { Text("重试") }
    }
}

@Composable
private fun StatusContent(status: RouterStatus) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("系统", style = MaterialTheme.typography.titleMedium)
                    InfoRow("主机名", status.system?.hostname ?: "—")
                    InfoRow("型号", status.system?.model ?: "—")
                    InfoRow("固件", status.system?.firmware ?: "—")
                    InfoRow("运行时间", formatUptime(status.system?.uptimeSeconds))
                    InfoRow("负载", formatLoad(status.system?.load))
                    InfoRow("内存", memoryUsagePercent(status.system)?.let { "$it %" } ?: "—")
                }
            }
        }
        status.warnings.forEach { warning ->
            item {
                Card(Modifier.fillMaxWidth()) {
                    Text(
                        warning,
                        Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("接口", style = MaterialTheme.typography.titleMedium)
                    if (status.interfaces.isEmpty()) Text("未报告")
                    status.interfaces.forEach { iface ->
                        Column(Modifier.padding(vertical = 4.dp)) {
                            Text("${iface.name}(${iface.device})", fontWeight = FontWeight.Medium)
                            Text(
                                listOfNotNull(
                                    if (iface.up) "已连接" else "断开",
                                    iface.ipv4.firstOrNull(),
                                    iface.ipv6.firstOrNull(),
                                    "↓ ${formatBytes(iface.rxBytes)}",
                                    "↑ ${formatBytes(iface.txBytes)}",
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("无线", style = MaterialTheme.typography.titleMedium)
                    if (status.wireless.isEmpty()) Text("未报告")
                    status.wireless.forEach { wifi ->
                        Column(Modifier.padding(vertical = 4.dp)) {
                            Text(wifi.ssid, fontWeight = FontWeight.Medium)
                            Text(
                                listOfNotNull(
                                    if (wifi.up) "开启" else "关闭",
                                    "信道 ${wifi.channel}",
                                    wifi.clients?.let { "$it 个客户端" },
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, Modifier.weight(0.4f), style = MaterialTheme.typography.bodyMedium)
        Text(value, Modifier.weight(0.6f), style = MaterialTheme.typography.bodyMedium)
    }
}
