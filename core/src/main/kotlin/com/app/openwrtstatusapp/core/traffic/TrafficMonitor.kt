package com.app.openwrtstatusapp.core.traffic

import com.app.openwrtstatusapp.core.commands.OpenWrtAdmin
import com.app.openwrtstatusapp.core.model.InterfaceStatus

enum class TrafficSource { WAN, INTERFACES, UNREPORTED }

data class TrafficSnapshot(
    val timestamp: Long,
    val rxBytes: Double,
    val txBytes: Double,
    val source: TrafficSource,
)

data class TrafficInterfaceSnapshot(
    val id: String,
    val label: String,
    val device: String,
    val timestamp: Long,
    val rxBytes: Double,
    val txBytes: Double,
    val source: TrafficSource,
)

data class TrafficRate(
    val rxBytesPerSecond: Double,
    val txBytesPerSecond: Double,
    val sampleSeconds: Double,
)

/** 平移自 lib/traffic-monitor.ts。 */
object TrafficMonitor {
    private val WAN_NAME = Regex("(^|[-_.])(wan|wwan|uplink|internet)([-_.]|$)|^wan[a-z0-9_-]*$|^pppoe", RegexOption.IGNORE_CASE)

    fun trafficInterfaceId(item: InterfaceStatus): String = "${item.name}:${item.device}"

    private fun isWanName(value: String): Boolean = WAN_NAME.containsMatchIn(value)

    fun getTrafficInterfaceCandidates(interfaces: List<InterfaceStatus>): List<InterfaceStatus> =
        interfaces.filter { it.rxBytes != null || it.txBytes != null }

    fun getDefaultTrafficInterfaceId(interfaces: List<InterfaceStatus>): String? {
        val active = getTrafficInterfaceCandidates(interfaces).filter { it.up }
        val wan = active.filter { isWanName(it.name) || isWanName(it.device) }
        return when {
            wan.isNotEmpty() -> trafficInterfaceId(wan[0])
            active.isNotEmpty() -> trafficInterfaceId(active[0])
            else -> null
        }
    }

    fun selectTrafficInterfaces(
        interfaces: List<InterfaceStatus>,
        selectedInterfaceIds: List<String> = emptyList(),
    ): Pair<List<InterfaceStatus>, TrafficSource> {
        val active = getTrafficInterfaceCandidates(interfaces).filter { it.up }
        if (active.isEmpty()) return emptyList<InterfaceStatus>() to TrafficSource.UNREPORTED
        if (selectedInterfaceIds.isNotEmpty()) {
            val selected = selectedInterfaceIds.toSet()
            return active.filter { trafficInterfaceId(it) in selected } to TrafficSource.INTERFACES
        }
        val defaultId = getDefaultTrafficInterfaceId(interfaces)
        val item = active.find { trafficInterfaceId(it) == defaultId } ?: active[0]
        val isWan = isWanName(item.name) || isWanName(item.device)
        return listOf(item) to if (isWan) TrafficSource.WAN else TrafficSource.INTERFACES
    }

    fun makeTrafficInterfaceSnapshots(
        interfaces: List<InterfaceStatus>,
        timestamp: Long = System.currentTimeMillis(),
        selectedInterfaceIds: List<String> = emptyList(),
    ): List<TrafficInterfaceSnapshot> {
        val (items, source) = selectTrafficInterfaces(interfaces, selectedInterfaceIds)
        return items.map { item ->
            TrafficInterfaceSnapshot(
                id = trafficInterfaceId(item),
                label = item.name.ifEmpty { item.device },
                device = item.device,
                timestamp = timestamp,
                rxBytes = item.rxBytes ?: 0.0,
                txBytes = item.txBytes ?: 0.0,
                source = source,
            )
        }
    }

    fun makeTrafficSnapshot(
        interfaces: List<InterfaceStatus>,
        timestamp: Long = System.currentTimeMillis(),
        selectedInterfaceIds: List<String> = emptyList(),
    ): TrafficSnapshot {
        val (items, source) = selectTrafficInterfaces(interfaces, selectedInterfaceIds)
        return TrafficSnapshot(
            timestamp = timestamp,
            rxBytes = items.sumOf { it.rxBytes ?: 0.0 },
            txBytes = items.sumOf { it.txBytes ?: 0.0 },
            source = source,
        )
    }

    fun calculateTrafficRate(previous: TrafficSnapshot?, current: TrafficSnapshot): TrafficRate? {
        if (previous == null || previous.source == TrafficSource.UNREPORTED || current.source == TrafficSource.UNREPORTED) {
            return null
        }
        val elapsedMilliseconds = current.timestamp - previous.timestamp
        if (elapsedMilliseconds <= 0) return null
        val seconds = elapsedMilliseconds / 1000.0
        return TrafficRate(
            rxBytesPerSecond = (current.rxBytes - previous.rxBytes).coerceAtLeast(0.0) / seconds,
            txBytesPerSecond = (current.txBytes - previous.txBytes).coerceAtLeast(0.0) / seconds,
            sampleSeconds = seconds,
        )
    }

    fun appendTrafficRate(history: List<TrafficRate>, next: TrafficRate?, limit: Int = 24): List<TrafficRate> {
        if (next == null) return history
        return (history + next).takeLast(maxOf(1, limit))
    }

    fun formatTrafficRate(bytesPerSecond: Double?): String {
        if (bytesPerSecond == null) return "等待采样"
        if (bytesPerSecond < 1024) return "${Math.round(bytesPerSecond)} B/s"
        if (bytesPerSecond < 1024.0 * 1024) {
            return String.format(java.util.Locale.ROOT, "%.1f KB/s", bytesPerSecond / 1024)
        }
        return String.format(java.util.Locale.ROOT, "%.1f MB/s", bytesPerSecond / 1024 / 1024)
    }
}

data class TrafficHistoryPoint(
    val sampledAt: String,
    val interfaces: Map<String, Pair<Double, Double>>,
)

data class TrafficUsageSummary(val rxBytes: Double, val txBytes: Double, val samples: Int)

/** 平移自 lib/traffic-history.ts 的纯逻辑部分(存储由 app 层 DataStore 承担)。 */
object TrafficHistory {
    const val MAX_POINTS = 1_500

    fun recordPoint(
        existing: List<TrafficHistoryPoint>,
        interfaces: List<InterfaceStatus>,
        sampledAt: String,
    ): List<TrafficHistoryPoint> {
        val pointInterfaces = interfaces
            .filter { OpenWrtAdmin.isWanInterface(it) }
            .filter { it.rxBytes != null && it.txBytes != null }
            .associate { it.name to Pair(it.rxBytes!!, it.txBytes!!) }
        if (pointInterfaces.isEmpty()) return existing
        return (existing + TrafficHistoryPoint(sampledAt, pointInterfaces)).takeLast(MAX_POINTS)
    }

    fun summarizeTrafficUsage(
        points: List<TrafficHistoryPoint>,
        interfaceName: String,
        from: Long,
        to: Long,
    ): TrafficUsageSummary {
        val filtered = points.filter { point ->
            val time = runCatching { java.time.Instant.parse(point.sampledAt).toEpochMilli() }.getOrDefault(0L)
            time in from..to && point.interfaces.containsKey(interfaceName)
        }
        var rxBytes = 0.0
        var txBytes = 0.0
        for (index in 1 until filtered.size) {
            val previous = filtered[index - 1].interfaces[interfaceName]!!
            val current = filtered[index].interfaces[interfaceName]!!
            if (current.first >= previous.first) rxBytes += current.first - previous.first
            if (current.second >= previous.second) txBytes += current.second - previous.second
        }
        return TrafficUsageSummary(rxBytes, txBytes, filtered.size)
    }
}
