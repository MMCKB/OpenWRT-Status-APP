package com.app.openwrtstatusapp.ui.hubs

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.openwrtstatusapp.ui.dashboard.DashboardViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import com.app.openwrtstatusapp.core.traffic.TrafficMonitor

private data class HubEntry(val route: String, val title: String, val description: String)

private val toolEntries = listOf(
    HubEntry("diagnostics", "网络诊断", "Ping / DNS / 路由追踪 / 端口连通性"),
    HubEntry("quickActions", "快捷操作", "重启、WAN 重连、硬件信息"),
    HubEntry("natDetection", "NAT 检测", "手机网络 STUN 类型检测"),
    HubEntry("wol", "网络唤醒", "Wake-on-LAN 目标管理与唤醒"),
    HubEntry("diskSpeed", "硬盘测速", "路由器存储读写速度"),
    HubEntry("benchmark", "性能基准", "CPU / 内存 / 存储概览"),
    HubEntry("files", "文件管理", "浏览、编辑、上传下载路由器文件"),
    HubEntry("bulk", "批量操作", "多路由器诊断与配置备份"),
)

private val serviceEntries = listOf(
    HubEntry("servicesHealth", "服务健康", "核心服务状态与磁盘 / 温度 / 连通性"),
    HubEntry("proxyServices", "代理与插件", "OpenClash / AdGuardHome / PassWall / DDNS"),
    HubEntry("docker", "Docker", "容器状态与启停重启"),
    HubEntry("logs", "日志中心", "系统 / 内核 / DNS / 拨号 / 防火墙"),
    HubEntry("packages", "软件包管理", "OpenWrt 25.12 APK 包与软件源"),
    HubEntry("systemAdmin", "系统管理", "启动项 / LED / 挂载 / SSH / 主题 / 网络"),
    HubEntry("firewall", "防火墙", "区域 / 端口转发 / 通信规则 / UPnP"),
    HubEntry("dhcpLeases", "DHCP 租约", "动态与静态租约管理"),
    HubEntry("clients", "连接设备", "在线设备与拉黑管理"),
    HubEntry("wirelessManager", "无线管理", "SSID / 加密 / 访客网络"),
    HubEntry("wirelessOptimizer", "信道优化", "扫描邻近网络并推荐信道"),
    HubEntry("weakSignal", "弱信号设备", "无线客户端信号质量分析"),
    HubEntry("maintenance", "维护工具", "配置备份恢复与固件升级"),
    HubEntry("firmwareRelease", "固件更新检查", "GitHub Release 版本比对"),
    HubEntry("guestNetwork", "访客网络", "一键创建访客 SSID"),
)

@Composable
fun ToolsHubScreen(onOpen: (String) -> Unit) {
    HubList("工具", toolEntries, onOpen)
}

@Composable
fun ServicesHubScreen(onOpen: (String) -> Unit) {
    HubList("服务", serviceEntries, onOpen)
}

@Composable
private fun HubList(title: String, entries: List<HubEntry>, onOpen: (String) -> Unit) {
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text(title, style = MaterialTheme.typography.titleLarge) }
        item { Spacer(Modifier.height(4.dp)) }
        items(entries.size) { index ->
            val entry = entries[index]
            Card(onClick = { onOpen(entry.route) }, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(entry.title, style = MaterialTheme.typography.titleMedium)
                    Text(entry.description, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

/** 简洁的速率折线图(上下行)。 */
@Composable
fun TrafficRateChart(history: List<com.app.openwrtstatusapp.core.traffic.TrafficRate>) {
    val rxColor = MaterialTheme.colorScheme.primary
    val txColor = MaterialTheme.colorScheme.tertiary
    Text("实时速率(最近 ${history.size} 个采样)", style = MaterialTheme.typography.titleSmall)
    Spacer(Modifier.height(4.dp))
    if (history.size < 2) {
        Text("等待采样…", style = MaterialTheme.typography.bodySmall)
        return
    }
    val maxRate = history.maxOf { maxOf(it.rxBytesPerSecond, it.txBytesPerSecond) }.coerceAtLeast(1.0)
    Canvas(
        Modifier.fillMaxWidth().height(120.dp),
    ) {
        fun buildPath(selector: (com.app.openwrtstatusapp.core.traffic.TrafficRate) -> Double): Path {
            val path = Path()
            history.forEachIndexed { index, rate ->
                val x = size.width * index / (history.size - 1).coerceAtLeast(1)
                val y = size.height * (1f - (selector(rate) / maxRate).toFloat().coerceIn(0f, 1f))
                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            return path
        }
        drawPath(buildPath { it.rxBytesPerSecond }, rxColor, style = Stroke(width = 4f))
        drawPath(buildPath { it.txBytesPerSecond }, txColor, style = Stroke(width = 4f))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("● 下行", color = rxColor, style = MaterialTheme.typography.labelSmall)
        Text("● 上行", color = txColor, style = MaterialTheme.typography.labelSmall)
        Text("峰值 ${TrafficMonitor.formatTrafficRate(maxRate)}", style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
fun rememberDashboardHistory(viewModel: DashboardViewModel): List<com.app.openwrtstatusapp.core.traffic.TrafficRate> {
    val state by viewModel.state.collectAsStateWithLifecycle()
    return state.rateHistory
}
