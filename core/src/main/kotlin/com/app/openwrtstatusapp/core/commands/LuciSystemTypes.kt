package com.app.openwrtstatusapp.core.commands

data class StartupService(val name: String, val enabled: Boolean)

data class LedSetting(
    val section: String,
    val name: String,
    val sysfs: String,
    val trigger: String,
    val delayOn: String,
    val delayOff: String,
    val netdevDevice: String,
    val netdevMode: String,
)

data class LedCapabilities(
    val devices: List<String>,
    val triggers: List<String>,
    val networkDevices: List<String>,
)

data class MountPoint(
    val section: String,
    val target: String,
    val device: String,
    val fstype: String,
    val enabled: Boolean,
    val enabledFsck: Boolean,
)

data class MountedFileSystem(val target: String, val device: String, val fstype: String)

data class SwapPartition(val device: String)

data class DropbearInstance(
    val section: String = "",
    val port: String,
    /** 空格分隔的监听接口列表,对应 LuCI 的 Interface 选项。 */
    val listenInterface: String,
    val passwordAuth: Boolean,
    val rootPasswordAuth: Boolean,
    val gatewayPorts: Boolean,
    val enabled: Boolean,
)

data class SshAccessSettings(
    val installed: Boolean,
    val port: String,
    val passwordAuth: Boolean,
    val rootPasswordAuth: Boolean,
    val instances: List<DropbearInstance>,
)

data class SshAuthorizedKey(val value: String, val type: String, val comment: String)

data class ApkRepositoryKey(val name: String, val bytes: Long)

data class UhttpdSettings(
    val installed: Boolean,
    val section: String,
    val httpPorts: String,
    val httpsPorts: String,
    val redirectHttps: Boolean,
)

data class LuciTheme(val name: String, val active: Boolean)

data class NetworkInterfaceSettings(
    val section: String,
    val proto: String,
    val device: String,
    val ipaddr: String,
    val netmask: String,
    val gateway: String,
    val dns: String,
    val auto: Boolean,
    val forceLink: Boolean,
    val defaultRoute: Boolean,
    val useCustomDns: Boolean,
    val dnsMetric: String,
    val metric: String,
    val mptcp: String,
    val ip4Table: String,
    val ip6Table: String,
    val delegate: Boolean,
    val ip6Assign: String,
    val ip6Class: String,
    val ip6Hint: String,
    val ip6IfaceId: String,
    val ip6Weight: String,
    val firewallZone: String,
)

data class FirewallZoneRef(val section: String, val name: String)

data class NetworkInterfaceOptions(
    val protocols: List<String>,
    val devices: List<String>,
    val firewallZones: List<FirewallZoneRef>,
)

data class NetworkInterfaceStatus(
    val section: String,
    val proto: String,
    val device: String,
    val ipv4: List<String>,
    val ipv6: List<String>,
    val mac: String,
    val up: Boolean,
    val uptimeSeconds: Long?,
)

data class NetworkDeviceSettings(
    val section: String,
    val name: String,
    val type: String,
    val macaddr: String,
    val mtu: String,
    val ipv6: Boolean,
)

data class NetworkGlobalSettings(
    val section: String,
    val ulaPrefix: String,
    val packetSteering: Boolean,
)

enum class ScheduledAction(val command: String, val tag: String) {
    REBOOT("/sbin/reboot", "reboot"),
    WAN_RECONNECT("ifdown wan; sleep 3; ifup wan", "wan-reconnect"),
    DDNS_REFRESH("/etc/init.d/ddns restart", "ddns-refresh"),
}
