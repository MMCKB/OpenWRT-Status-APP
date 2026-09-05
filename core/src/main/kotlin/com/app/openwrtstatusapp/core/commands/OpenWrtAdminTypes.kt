package com.app.openwrtstatusapp.core.commands

data class ConnectedClient(
    val mac: String,
    val hostname: String?,
    val ipv4: String?,
    val expiresAt: String?,
    val online: Boolean,
)

/** LuCI 网络唤醒页保存到 /etc/config/wol 的持久化目标。 */
data class WolDevice(val mac: String, val hostname: String?, val ipv4: String?)

data class DhcpLease(
    val source: String,
    val section: String?,
    val mac: String,
    val hostname: String?,
    val ipv4: String?,
    val expiresAt: String?,
    val leasetime: String?,
)

data class DhcpLeaseSnapshot(val dynamic: List<DhcpLease>, val static: List<DhcpLease>)

data class DhcpStaticLeaseDraft(
    val section: String? = null,
    val hostname: String,
    val mac: String,
    val ipv4: String,
    val leasetime: String? = null,
)

data class WifiConfigEntry(
    val section: String,
    val device: String,
    val ssid: String,
    val disabled: Boolean,
    val encryption: String,
    val key: String,
    val hidden: Boolean,
    val isolate: Boolean,
    val network: String,
)

data class WifiEncryptionOption(val value: String, val label: String)

val WIFI_ENCRYPTION_OPTIONS = listOf(
    WifiEncryptionOption("psk", "WPA-PSK"),
    WifiEncryptionOption("psk2", "WPA2-PSK"),
    WifiEncryptionOption("psk-mixed", "WPA/WPA2 混合"),
    WifiEncryptionOption("sae", "WPA3-SAE"),
    WifiEncryptionOption("sae-mixed", "WPA2/WPA3 混合"),
    WifiEncryptionOption("owe", "OWE 增强开放"),
    WifiEncryptionOption("none", "不加密"),
)

data class WifiClient(
    val mac: String,
    val interfaceName: String?,
    val signalDbm: Int?,
)

data class WirelessRadio(val name: String, val currentChannel: Int?)

data class WirelessScanNetwork(
    val radio: String,
    val ssid: String?,
    val bssid: String?,
    val channel: Int,
    val signalDbm: Int?,
)

data class WirelessOptimizationSnapshot(
    val radios: List<WirelessRadio>,
    val networks: List<WirelessScanNetwork>,
)

data class WirelessChannelRecommendation(
    val radio: String,
    val currentChannel: Int?,
    val suggestedChannel: Int?,
    val currentScore: Double?,
    val suggestedScore: Double?,
    val reason: String,
)

enum class SignalQuality { WEAK, FAIR, GOOD, UNKNOWN }

data class WeakSignalClient(
    val mac: String,
    val interfaceName: String?,
    val signalDbm: Int?,
    val hostname: String?,
    val ipv4: String?,
    val online: Boolean,
    val quality: SignalQuality,
    val qualityLabel: String,
)

data class DockerContainer(
    val id: String,
    val name: String,
    val image: String,
    val status: String,
    val running: Boolean,
    val ports: String?,
    val cpuPercent: String?,
    val memoryUsage: String?,
)

data class DockerSnapshot(val available: Boolean, val containers: List<DockerContainer>)

data class PerformanceBenchmark(
    val cpuModel: String?,
    val cpuCores: Double?,
    val loadAverage: Double?,
    val memoryTotalKb: Double?,
    val memoryAvailableKb: Double?,
    val storageTotalKb: Double?,
    val storageUsedKb: Double?,
    val storageAvailableKb: Double?,
)

data class DiskSpeedResult(
    val writeSpeedMBps: Double?,
    val readSpeedMBps: Double?,
    val directory: String,
    val fileSizeMB: Int,
    val writeDurationMs: Double?,
    val readDurationMs: Double?,
)

data class RouterHardwareDetails(
    val cpuModel: String?,
    val cpuCores: Double?,
    val kernelVersion: String?,
    val wifiTemperaturesC: List<Double>,
    val sensorTemperaturesC: List<Double>,
)

data class FirmwareDeviceInfo(
    val model: String?,
    val boardName: String?,
    val distribution: String?,
    val version: String?,
    val revision: String?,
    val target: String?,
    val description: String?,
)

enum class ManagedBy { OPENWRT, DOCKER }

data class ServiceState(
    val name: String,
    val running: Boolean,
    val managedBy: ManagedBy,
    val detail: String? = null,
)

enum class WanDiagnosticKind { PING, DNS, TRACE, PORT }

enum class DnsFamily { IPV4, IPV6 }

enum class ServiceAction { START, STOP, RESTART }
