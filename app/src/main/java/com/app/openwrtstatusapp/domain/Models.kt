package com.app.openwrtstatusapp.domain

data class RouterProfile(
    val id: String,
    val name: String,
    val baseUrl: String,
    val username: String,
    val sshUsername: String = "root",
    val sshPort: Int = 22,
    val createdAt: Long = System.currentTimeMillis(),
    val lastConnectedAt: Long? = null,
)

data class RouterSettings(
    val selectedRouterId: String? = null,
    val refreshIntervalSeconds: Int = 5,
    val trafficInterfaceIds: Set<String> = emptySet(),
    val compactTraffic: Boolean = false,
    val diagnosticOutputDisplay: String = "both",
    val darkMode: String = "system",
)

data class SystemStatus(
    val hostname: String = "—",
    val model: String = "—",
    val firmware: String = "—",
    val uptimeSeconds: Long? = null,
    val load: List<Double> = emptyList(),
    val memoryTotal: Long? = null,
    val memoryAvailable: Long? = null,
    val kernel: String = "—",
    val cpuModel: String = "—",
    val cpuTemperature: String = "—",
    val wifiTemperature: String = "—",
)

data class InterfaceStatus(
    val name: String,
    val device: String = "—",
    val up: Boolean = false,
    val ipv4: List<String> = emptyList(),
    val ipv6: List<String> = emptyList(),
    val uptimeSeconds: Long? = null,
    val rxBytes: Long? = null,
    val txBytes: Long? = null,
)

data class WirelessStatus(
    val name: String,
    val ssid: String = "未广播 SSID",
    val up: Boolean = false,
    val channel: String = "自动",
    val clients: Int? = null,
)

data class RouterStatus(
    val routerId: String,
    val online: Boolean = false,
    val fetchedAt: Long = System.currentTimeMillis(),
    val system: SystemStatus? = null,
    val interfaces: List<InterfaceStatus> = emptyList(),
    val wireless: List<WirelessStatus> = emptyList(),
    val warnings: List<String> = emptyList(),
    val error: String? = null,
)

data class RemoteFileEntry(val name: String, val path: String, val kind: String, val size: Long? = null, val modified: String? = null)
data class ServiceState(val id: String, val title: String, val installed: Boolean, val running: Boolean, val enabled: Boolean)
data class PackageInfo(val name: String, val version: String = "", val description: String = "", val installed: Boolean = false, val upgradable: Boolean = false)
data class WakeTarget(val name: String, val mac: String, val host: String = "", val interfaceName: String = "")
data class NatResult(val publicAddress: String, val publicPort: Int, val mapping: String, val detail: String)

fun formatBytes(value: Long?): String {
    if (value == null || value < 0) return "未报告"
    val units = listOf("B", "KB", "MB", "GB", "TB")
    var amount = value.toDouble(); var index = 0
    while (amount >= 1024 && index < units.lastIndex) { amount /= 1024; index++ }
    return if (amount >= 10 || index == 0) "%.0f %s".format(amount, units[index]) else "%.1f %s".format(amount, units[index])
}

fun formatUptime(seconds: Long?): String {
    if (seconds == null || seconds < 0) return "未报告"
    val days = seconds / 86400; val hours = seconds % 86400 / 3600; val minutes = seconds % 3600 / 60
    return when { days > 0 -> "${days} 天 ${hours} 小时"; hours > 0 -> "${hours} 小时 ${minutes} 分钟"; else -> "${minutes} 分钟" }
}
