package com.app.openwrtstatusapp.core.ubus

import com.app.openwrtstatusapp.core.model.InterfaceStatus
import com.app.openwrtstatusapp.core.model.OpenWrtConnectionException
import com.app.openwrtstatusapp.core.model.RouterStatus
import com.app.openwrtstatusapp.core.model.SystemStatus
import com.app.openwrtstatusapp.core.model.WirelessStatus
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.Locale

/**
 * openwrt-client.ts 中数据映射逻辑的平移。
 * 所有 asRecord/asString/asNumber 语义与 TS 版一一对应,行为由移植的单测保证。
 */
object StatusParsers {
    private val j = Jsons

    fun normalizeRouterEndpoint(value: String): String {
        val input = value.trim().trimEnd('/').ifEmpty {
            throw OpenWrtConnectionException("请输入路由器地址。")
        }
        val withProtocol =
            if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(input)) input
            else "http://$input"
        // 与 TS 的 URL 行为对齐:保留原始 authority(支持 IPv6 字面量与端口),丢弃 query/hash。
        val match = Regex("^(https?)://([^/?#]+)([^#]*)", RegexOption.IGNORE_CASE).find(withProtocol)
            ?: throw OpenWrtConnectionException("路由器地址格式不正确。")
        val scheme = match.groupValues[1].lowercase(Locale.ROOT)
        val authority = match.groupValues[2]
        var path = match.groupValues[3].substringBefore('?')
        if (path.isEmpty() || path == "/") {
            path = "/ubus"
        } else if (!path.endsWith("/ubus")) {
            path = path.trimEnd('/') + "/ubus"
        }
        return "$scheme://$authority$path"
    }

    fun mapDeviceCounters(payload: JsonElement?): Map<String, Pair<Double?, Double?>> {
        val root = j.asRecord(payload)
        val devices = j.asRecord(root.prop("devices") ?: root.prop("device") ?: payload)
        return devices.entries.associate { (name, rawDevice) ->
            val device = j.asRecord(rawDevice)
            val statistics = j.asRecord(device.prop("statistics") ?: device.prop("stats"))
            name to Pair(
                j.asCounter(statistics.prop("rx_bytes") ?: device.prop("rx_bytes") ?: device.prop("rxBytes")),
                j.asCounter(statistics.prop("tx_bytes") ?: device.prop("tx_bytes") ?: device.prop("txBytes")),
            )
        }
    }

    fun mapInterfaces(payload: JsonElement?, deviceCountersPayload: JsonElement? = null): List<InterfaceStatus> {
        val root = j.asRecord(payload)
        val candidates = root.prop("interface") ?: root.prop("interfaces") ?: payload
        val list = candidates as? JsonArray ?: return emptyList()
        val deviceCounters = mapDeviceCounters(deviceCountersPayload)
        return list.mapIndexed { index, entry ->
            val item = j.asRecord(entry)
            val rawName = item.prop("interface") ?: item.prop("name")
            val device = j.asRecord(item.prop("l3_device")).prop("name")
                ?: item.prop("l3_device")
                ?: item.prop("device")
            val deviceName = j.asString(device, "未报告")
            val statistics = j.asRecord(item.prop("statistics") ?: item.prop("stats"))
            val counters = deviceCounters[deviceName]
            InterfaceStatus(
                name = j.asString(rawName, "接口 ${index + 1}"),
                device = deviceName,
                up = item.prop("up") == JsonPrimitive(true),
                ipv4 = j.asStringArray(item.prop("ipv4-address") ?: item.prop("ipv4")),
                ipv6 = j.asStringArray(item.prop("ipv6-address") ?: item.prop("ipv6")),
                uptimeSeconds = j.asNumber(item.prop("uptime"))?.toLong(),
                rxBytes = j.asCounter(statistics.prop("rx_bytes") ?: item.prop("rx_bytes") ?: item.prop("rxBytes"))
                    ?: counters?.first,
                txBytes = j.asCounter(statistics.prop("tx_bytes") ?: item.prop("tx_bytes") ?: item.prop("txBytes"))
                    ?: counters?.second,
            )
        }
    }

    fun mapWireless(payload: JsonElement?): List<WirelessStatus> {
        val root = j.asRecord(payload)
        val candidates = listOf(
            root.prop("radios"),
            root.prop("wireless"),
            root.prop("radio"),
            payload,
        )
        val radios = candidates.firstOrNull { candidate ->
            when (candidate) {
                is JsonArray -> candidate.isNotEmpty()
                is JsonObject -> candidate.keys.isNotEmpty()
                else -> false
            }
        } ?: payload
        val radioEntries: List<Pair<String, JsonElement>> = when (radios) {
            is JsonArray -> radios.mapIndexed { index, value -> "radio$index" to value }
            is JsonObject -> radios.entries.map { it.key to it.value }
            else -> return emptyList()
        }
        return radioEntries.flatMap { (radioName, radioValue) ->
            val radio = j.asRecord(radioValue)
            val rawInterfaces = radio.prop("interfaces") ?: radio.prop("interface")
            val interfaces: List<JsonElement> = when (rawInterfaces) {
                is JsonArray -> rawInterfaces
                is JsonObject -> rawInterfaces.values.toList()
                else -> emptyList()
            }
            val entries = interfaces.ifEmpty { listOf(radio) }
            val radioConfig = j.asRecord(radio.prop("config"))
            entries.mapIndexed { index, entryValue ->
                val item = j.asRecord(entryValue)
                val config = j.asRecord(item.prop("config"))
                val assoclist = j.asRecord(item.prop("assoclist"))
                val stations = (item.prop("stations") as? JsonArray)
                    ?: (item.prop("clients") as? JsonArray)
                    ?: JsonArray(emptyList())
                val disabled = j.asBoolean(
                    j.firstDefined(
                        item.prop("disabled"), config.prop("disabled"),
                        radio.prop("disabled"), radioConfig.prop("disabled"),
                    ),
                )
                val reportedState = j.firstDefined(
                    item.prop("up"), item.prop("state"), item.prop("status"), item.prop("enabled"),
                    radio.prop("up"), radio.prop("state"), radio.prop("status"), radio.prop("enabled"),
                )
                val hasWirelessConfig = listOf(
                    config.prop("ssid"), item.prop("ssid"),
                    radioConfig.prop("ssid"), radioConfig.prop("mode"),
                ).any { it != null }
                WirelessStatus(
                    name = j.asString(
                        item.prop("ifname") ?: item.prop("name"),
                        "$radioName · ${index + 1}",
                    ),
                    ssid = j.asString(
                        config.prop("ssid") ?: item.prop("ssid") ?: radioConfig.prop("ssid"),
                        "未广播 SSID",
                    ),
                    up = !disabled && (if (reportedState != null) j.asBoolean(reportedState) else hasWirelessConfig),
                    channel = j.asDisplayValue(
                        item.prop("channel") ?: radio.prop("channel") ?: radioConfig.prop("channel"),
                        "自动",
                    ),
                    clients = (stations.size.takeIf { it > 0 } ?: assoclist.keys.size.takeIf { it > 0 }),
                )
            }
        }
    }

    /**
     * 部分 OpenWrt 设备只提供 UCI 无线配置而不返回 network.wireless status。
     * 以只读配置作为状态页回退,避免主页与 SSH 无线管理页不一致。
     */
    fun mapWirelessUciFallback(payload: JsonElement?): List<WirelessStatus> {
        val root = j.asRecord(payload)
        val values = j.asRecord(root.prop("values") ?: payload)
        return values.entries.flatMap { (sectionName, value) ->
            val section = j.asRecord(value)
            val sectionType = j.asString(section.prop(".type") ?: section.prop("type"))
            val ssid = j.asString(section.prop("ssid"))
            // 与 TS 版一致:缺少 ssid 的 wifi-iface 保留(显示为 "—")。
            if (sectionType != "wifi-iface" || ssid.isEmpty()) return@flatMap emptyList()
            listOf(
                WirelessStatus(
                    name = j.asString(
                        section.prop("ifname") ?: section.prop("device") ?: section.prop(".name"),
                        sectionName,
                    ),
                    ssid = ssid,
                    up = j.asString(section.prop("disabled")) != "1",
                    channel = j.asDisplayValue(section.prop("channel"), "配置"),
                    clients = null,
                ),
            )
        }
    }

    fun buildRouterStatus(
        routerId: String,
        boardPayload: JsonElement?,
        infoPayload: JsonElement?,
        interfacesPayload: JsonElement?,
        wirelessPayload: JsonElement?,
        warnings: List<String> = emptyList(),
        deviceCountersPayload: JsonElement? = null,
    ): RouterStatus {
        val board = j.asRecord(boardPayload)
        val info = j.asRecord(infoPayload)
        val memory = j.asRecord(info.prop("memory"))
        val total = j.asNumber(memory.prop("total"))
        val availableParts = listOf(memory.prop("free"), memory.prop("buffered"), memory.prop("cached"))
            .mapNotNull { j.asNumber(it) }
        val system = SystemStatus(
            hostname = j.asString(board.prop("hostname")),
            model = j.asString(board.prop("model") ?: board.prop("system")),
            firmware = j.asString(
                j.asRecord(board.prop("release")).prop("description") ?: board.prop("release"),
            ),
            uptimeSeconds = j.asNumber(info.prop("uptime"))?.toLong(),
            load = j.normalizeLoad(info.prop("load")),
            memoryTotal = total,
            memoryAvailable = total?.let { availableParts.sum() },
        )
        return RouterStatus(
            routerId = routerId,
            online = true,
            fetchedAt = java.time.Instant.now().toString(),
            system = system,
            interfaces = mapInterfaces(interfacesPayload, deviceCountersPayload),
            wireless = mapWireless(wirelessPayload),
            warnings = warnings,
        )
    }
}

fun formatBytes(value: Double?): String {
    if (value == null || !value.isFinite()) return "未报告"
    val units = listOf("B", "KB", "MB", "GB", "TB")
    var amount = value
    var index = 0
    while (amount >= 1024 && index < units.size - 1) {
        amount /= 1024
        index += 1
    }
    val text = if (amount >= 10 || index == 0) "%.0f".format(Locale.ROOT, amount)
    else "%.1f".format(Locale.ROOT, amount)
    return "$text ${units[index]}"
}

fun formatUptime(seconds: Long?): String {
    if (seconds == null || seconds < 0) return "未报告"
    val days = seconds / 86400
    val hours = seconds % 86400 / 3600
    val minutes = seconds % 3600 / 60
    return when {
        days > 0 -> "$days 天 $hours 小时"
        hours > 0 -> "$hours 小时 $minutes 分钟"
        else -> "$minutes 分钟"
    }
}

fun formatLoad(load: Triple<Double, Double, Double>?): String =
    load?.let { "%.2f · %.2f · %.2f".format(Locale.ROOT, it.first, it.second, it.third) } ?: "未报告"

fun memoryUsagePercent(system: SystemStatus?): Int? {
    val total = system?.memoryTotal ?: return null
    val available = system.memoryAvailable ?: return null
    return Math.max(0, Math.min(100, Math.round((total - available) / total * 100).toInt()))
}
