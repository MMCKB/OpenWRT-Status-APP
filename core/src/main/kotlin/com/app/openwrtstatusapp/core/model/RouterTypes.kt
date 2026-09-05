package com.app.openwrtstatusapp.core.model

import kotlinx.serialization.Serializable

@Serializable
data class RouterProfile(
    val id: String,
    val name: String,
    val baseUrl: String,
    val username: String,
    val sshUsername: String? = null,
    val sshPort: Int? = null,
    val createdAt: String,
    val lastConnectedAt: String? = null,
)

@Serializable
data class RouterSettings(
    val selectedRouterId: String? = null,
    val refreshIntervalSeconds: Int = 60,
    /** 空 表示自动选择主 WAN;否则使用显式接口 ID 列表。 */
    val trafficInterfaceIds: List<String> = emptyList(),
    /** full 包含速率曲线;compact 只保留简洁吞吐值。 */
    val statusTrafficView: String = "full",
    /** 手动执行诊断命令结果的展示位置。 */
    val diagnosticOutputDisplay: String = "both",
    /** Kotlin 版新增:"system" | "light" | "dark"。 */
    val themeMode: String = "system",
)

data class SystemStatus(
    val hostname: String,
    val model: String,
    val firmware: String,
    val uptimeSeconds: Long?,
    val load: Triple<Double, Double, Double>?,
    val memoryTotal: Double?,
    val memoryAvailable: Double?,
)

data class InterfaceStatus(
    val name: String,
    val device: String,
    val up: Boolean,
    val ipv4: List<String>,
    val ipv6: List<String>,
    val uptimeSeconds: Long?,
    /** OpenWrt 接口统计,来自 ubus network.interface.dump。 */
    val rxBytes: Double?,
    val txBytes: Double?,
)

data class WirelessStatus(
    val name: String,
    val ssid: String,
    val up: Boolean,
    val channel: String,
    val clients: Int?,
)

data class RouterStatus(
    val routerId: String,
    val online: Boolean,
    val fetchedAt: String,
    val system: SystemStatus?,
    val interfaces: List<InterfaceStatus>,
    val wireless: List<WirelessStatus>,
    val warnings: List<String>,
    val error: String? = null,
)

data class TrafficSnapshot(
    val interfaces: List<InterfaceStatus>,
    val fetchedAt: String,
)

/** 与 TS 版 openwrt-client 的 OpenWrtConnectionError 对应。 */
class OpenWrtConnectionException(message: String) : Exception(message)
