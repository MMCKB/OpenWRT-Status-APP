package com.app.openwrtstatusapp.core.commands

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import com.app.openwrtstatusapp.core.model.InterfaceStatus

/** 平移自 lib/openwrt-admin.ts 的全部命令构建器与解析器。 */
object OpenWrtAdmin {
    val MANAGED_OPENWRT_SERVICES = setOf("dnsmasq", "firewall", "network", "uhttpd", "dropbear")
    const val BACKUP_REMOTE_PATH = "/tmp/openwrt-status-app-backup.tar.gz"

    private val macRegex = Regex("([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})")
    private val fullMacRegex = Regex("^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
    private val ipv4Regex = Regex("^(?:\\d{1,3}\\.){3}\\d{1,3}$")

    fun quoteShell(value: String): String =
        "'" + value.replace("'", "'\\''") + "'"

    fun cleanQuoted(value: String): String =
        value.trim().replace(Regex("^['\"]|['\"]$"), "")

    fun requireMac(mac: String): String {
        val normalized = mac.trim().uppercase()
        if (!fullMacRegex.matches(normalized)) throw IllegalArgumentException("MAC 地址格式无效。")
        return normalized
    }

    fun requireIpv4(value: String, label: String = "IPv4 地址"): String {
        val normalized = value.trim()
        val parts = normalized.split(".")
        if (parts.size != 4 || parts.any { !Regex("^\\d{1,3}$").matches(it) || it.toInt() > 255 }) {
            throw IllegalArgumentException("${label}格式无效。")
        }
        return normalized
    }

    fun requireIdentifier(value: String, label: String): String {
        val normalized = value.trim()
        if (!Regex("^[A-Za-z0-9_.:-]+$").matches(normalized)) {
            throw IllegalArgumentException("${label}格式无效。")
        }
        return normalized
    }

    fun requireUciSection(value: String, label: String): String {
        val normalized = value.trim()
        if (Regex("^[A-Za-z0-9_-]+$").matches(normalized) ||
            Regex("^@host\\[\\d+\\]$").matches(normalized)
        ) {
            return normalized
        }
        throw IllegalArgumentException("${label}格式无效。")
    }

    private fun safeCounter(value: String?): Double? {
        if (value.isNullOrEmpty() || !Regex("^\\d+$").matches(value)) return null
        val parsed = value.toDouble()
        return if (parsed <= 9007199254740991.0) parsed else null
    }

    private fun normalizeLeaseHostname(value: String?): String? {
        val normalized = value?.trim()
        return if (normalized.isNullOrEmpty() || normalized == "*") null else normalized
    }

    /** 解析 `pkg.section[.prop]=value` 行;inSection 由标记行控制。 */
    fun parseUciSections(
        prefix: String,
        output: String,
        startMarker: String,
        endMarkers: Set<String> = emptySet(),
    ): Map<String, UciSectionValues> {
        val sections = linkedMapOf<String, UciSectionValues>()
        var inside = false
        val regex = Regex("^$prefix\\.((?:@)?[A-Za-z0-9_-]+(?:\\[\\d+\\])?)(?:\\.([A-Za-z0-9_]+))?=(.*)$")
        for (rawLine in output.split(Regex("\r?\n"))) {
            val line = rawLine.trim()
            if (line == startMarker) {
                inside = true
                continue
            }
            if (line in endMarkers) {
                inside = false
                continue
            }
            if (!inside) continue
            val match = regex.find(line) ?: continue
            val section = match.groupValues[1]
            val property = match.groupValues[2]
            val rawValue = match.groupValues[3]
            val current = sections.getOrPut(section) { UciSectionValues("", linkedMapOf()) }
            if (property.isEmpty()) {
                current.type = cleanQuoted(rawValue)
            } else {
                current.values.getOrPut(property) { mutableListOf() }.add(cleanQuoted(rawValue))
            }
        }
        return sections
    }

    class UciSectionValues(val typeIn: String, val values: LinkedHashMap<String, MutableList<String>>) {
        var type: String = typeIn
        fun first(property: String): String? = values[property]?.firstOrNull()
    }

    // ---------- 在线客户端 ----------

    fun parseConnectedClients(output: String): List<ConnectedClient> {
        val byMac = linkedMapOf<String, ConnectedClient>()
        var inLeases = false
        for (line in output.split(Regex("\r?\n"))) {
            if (line.trim() == "__LEASES__") {
                inLeases = true
                continue
            }
            if (line.trim() == "__NEIGH__") {
                inLeases = false
                continue
            }
            val macMatch = macRegex.find(line) ?: continue
            val mac = macMatch.value.uppercase()
            val tokens = line.trim().split(Regex("\\s+"))
            val ipv4 = tokens.find { ipv4Regex.matches(it) }
            val previous = byMac[mac]
            if (inLeases) {
                val hostname = tokens.find { value ->
                    value.uppercase() != mac && value != ipv4 && !Regex("^\\d+$").matches(value) &&
                        value != "*" && !Regex("^(lladdr|REACHABLE|STALE|DELAY|PROBE|FAILED)$", RegexOption.IGNORE_CASE).matches(value)
                }
                byMac[mac] = ConnectedClient(
                    mac = mac,
                    hostname = hostname?.takeIf { it != "*" },
                    ipv4 = ipv4,
                    expiresAt = tokens.firstOrNull()?.takeIf { Regex("^\\d+$").matches(it) },
                    online = previous?.online ?: false,
                )
            } else {
                byMac[mac] = ConnectedClient(
                    mac = mac,
                    hostname = previous?.hostname,
                    ipv4 = ipv4 ?: previous?.ipv4,
                    expiresAt = previous?.expiresAt,
                    online = !Regex("FAILED|INCOMPLETE", RegexOption.IGNORE_CASE).containsMatchIn(line),
                )
            }
        }
        return byMac.values.sortedWith(
            compareByDescending<ConnectedClient> { it.online }.thenBy { it.hostname ?: it.mac },
        )
    }

    // ---------- DHCP 租约 ----------

    private fun parseDynamicDhcpLeases(output: String): List<DhcpLease> {
        val leases = linkedMapOf<String, DhcpLease>()
        var inLeases = false
        for (rawLine in output.split(Regex("\r?\n"))) {
            val line = rawLine.trim()
            if (line == "__DHCP_LEASES__") {
                inLeases = true
                continue
            }
            if (line == "__DHCP_STATIC__") {
                inLeases = false
                continue
            }
            if (!inLeases) continue
            val tokens = line.split(Regex("\\s+"))
            val macIndex = tokens.indexOfFirst { fullMacRegex.matches(it) }
            if (macIndex < 0) continue
            val mac = requireMac(tokens[macIndex])
            val ipv4 = tokens.find { ipv4Regex.matches(it) }
            val ipv4Index = ipv4?.let { tokens.indexOf(it) } ?: -1
            leases[mac] = DhcpLease(
                source = "dynamic",
                section = null,
                mac = mac,
                hostname = normalizeLeaseHostname(if (ipv4Index >= 0) tokens.getOrNull(ipv4Index + 1) else null),
                ipv4 = ipv4,
                expiresAt = tokens.firstOrNull()?.takeIf { Regex("^\\d+$").matches(it) },
                leasetime = null,
            )
        }
        return leases.values.sortedBy { it.hostname ?: it.mac }
    }

    fun parseDhcpLeaseSnapshot(output: String): DhcpLeaseSnapshot {
        val dynamic = parseDynamicDhcpLeases(output)
        val staticLeases = mutableListOf<DhcpLease>()
        for ((section, values) in parseUciSections("dhcp", output, "__DHCP_STATIC__")) {
            if (values.type != "host") continue
            val mac = values.first("mac") ?: continue
            if (!fullMacRegex.matches(mac)) continue
            staticLeases += DhcpLease(
                source = "static",
                section = section,
                mac = requireMac(mac),
                hostname = normalizeLeaseHostname(values.first("name")),
                ipv4 = values.first("ip"),
                expiresAt = null,
                leasetime = values.first("leasetime"),
            )
        }
        return DhcpLeaseSnapshot(dynamic, staticLeases.sortedBy { it.hostname ?: it.mac })
    }

    fun buildDhcpLeaseSnapshotCommand(): String =
        "printf '__DHCP_LEASES__\\n'; cat /tmp/dhcp.leases 2>/dev/null; printf '__DHCP_STATIC__\\n'; uci show dhcp 2>/dev/null"

    private fun safeLeaseHostname(value: String): String {
        val normalized = value.trim()
        if (normalized.isEmpty() || normalized.length > 63 || Regex("[\r\n]").containsMatchIn(normalized)) {
            throw IllegalArgumentException("设备名称应为 1–63 个字符，且不能包含换行。")
        }
        return normalized
    }

    private fun safeLeaseTime(value: String?): String? {
        val normalized = value?.trim()
        if (normalized.isNullOrEmpty()) return null
        if (!Regex("^\\d+(?:[smhdw])?$", RegexOption.IGNORE_CASE).matches(normalized)) {
            throw IllegalArgumentException("租约期限仅支持数字或数字加 s/m/h/d/w 单位。")
        }
        return normalized
    }

    fun buildDhcpStaticLeaseSaveCommand(draft: DhcpStaticLeaseDraft): String {
        val mac = requireMac(draft.mac)
        val hostname = safeLeaseHostname(draft.hostname)
        val ipv4 = requireIpv4(draft.ipv4, "固定 IPv4 地址")
        val leasetime = safeLeaseTime(draft.leasetime)
        val section = draft.section?.let { requireUciSection(it, "静态租约段") }
            ?: "openwrt_app_lease_" + mac.replace(":", "_").lowercase()
        val isExistingAnonymousSection = section.startsWith("@host[")
        val initializeSection =
            if (isExistingAnonymousSection) "" else "uci -q delete dhcp.$section; uci set dhcp.$section='host'; "
        val leaseTimeCommand =
            if (leasetime != null) "; uci set dhcp.$section.leasetime=${quoteShell(leasetime)}"
            else "; uci -q delete dhcp.$section.leasetime"
        return "${initializeSection}uci set dhcp.$section.name=${quoteShell(hostname)}; " +
            "uci set dhcp.$section.mac=${quoteShell(mac)}; uci set dhcp.$section.ip=${quoteShell(ipv4)}" +
            "$leaseTimeCommand; uci commit dhcp; /etc/init.d/dnsmasq reload"
    }

    fun buildDhcpStaticLeaseDeleteCommand(section: String): String {
        val safeSection = requireUciSection(section, "静态租约段")
        return "uci -q delete dhcp.$safeSection; uci commit dhcp; /etc/init.d/dnsmasq reload"
    }

    fun buildClientSnapshotCommand(): String =
        "printf '__LEASES__\\n'; ubus call dhcp ipv4leases 2>/dev/null | jsonfilter -e '@.device[*]' 2>/dev/null; " +
            "cat /tmp/dhcp.leases 2>/dev/null; printf '__NEIGH__\\n'; ip neigh show 2>/dev/null; " +
            "printf '__BLOCKED__\\n'; uci -q show firewall | grep -E '^firewall\\.openwrt_app_block_.*\\.src_mac=' 2>/dev/null"

    // ---------- 设备拉黑 ----------

    fun buildBlockClientCommand(mac: String): String {
        val normalized = requireMac(mac)
        val section = "openwrt_app_block_" + normalized.replace(":", "_").lowercase()
        return "uci -q delete firewall.$section; uci set firewall.$section=rule; " +
            "uci set firewall.$section.name=${quoteShell("OpenWrt App block $normalized")}; " +
            "uci set firewall.$section.src='lan'; uci set firewall.$section.dest='*'; " +
            "uci add_list firewall.$section.src_mac=${quoteShell(normalized)}; " +
            "uci set firewall.$section.target='REJECT'; uci commit firewall; /etc/init.d/firewall reload"
    }

    fun buildUnblockClientCommand(mac: String): String {
        val normalized = requireMac(mac)
        val section = "openwrt_app_block_" + normalized.replace(":", "_").lowercase()
        return "uci -q delete firewall.$section; uci commit firewall; /etc/init.d/firewall reload"
    }

    fun parseBlockedClientMacs(output: String): Set<String> {
        val markerIndex = output.indexOf("__BLOCKED__")
        if (markerIndex < 0) return emptySet()
        return macRegex.findAll(output.substring(markerIndex)).map { it.value.uppercase() }.toSet()
    }

    // ---------- 网络唤醒 ----------

    fun buildWakeOnLanCommand(mac: String): String {
        val normalized = requireMac(mac)
        return "WOL_IFACE=\"\$(ubus call network.interface.lan status 2>/dev/null | jsonfilter -e '@.l3_device' 2>/dev/null || true)\"; " +
            "if [ -z \"\$WOL_IFACE\" ]; then WOL_IFACE=\"\$(ip -o link show up 2>/dev/null | awk -F': ' '\$2 !~ /^(lo|ifb|imq)/ {sub(/@.*/, \"\", \$2); print \$2; exit}')\"; fi; " +
            "case \"\$WOL_IFACE\" in ''|*[!A-Za-z0-9_.:-]*) echo '__WOL_INTERFACE_UNAVAILABLE__ 未找到可用的 LAN 网卡。'; exit 1;; esac; " +
            "if command -v etherwake >/dev/null 2>&1; then etherwake -i \"\$WOL_IFACE\" -b $normalized; " +
            "elif command -v wol >/dev/null 2>&1; then wol -i \"\$WOL_IFACE\" $normalized; " +
            "elif command -v wakeonlan >/dev/null 2>&1; then wakeonlan $normalized; " +
            "else echo '__WOL_UNAVAILABLE__ 未检测到网络唤醒工具。请在路由器安装 etherwake、wol 或 wakeonlan 后重试。'; exit 127; fi"
    }

    fun buildWolDevicesSnapshotCommand(): String =
        "printf '__WOL_CONFIG__\\n'; uci -q show wol 2>/dev/null; printf '__WOL_DHCP__\\n'; cat /tmp/dhcp.leases 2>/dev/null; printf '__WOL_STATIC__\\n'; uci -q show dhcp 2>/dev/null"

    fun buildWolCandidatesSnapshotCommand(): String =
        "printf '__LEASES__\\n'; cat /tmp/dhcp.leases 2>/dev/null; printf '__NEIGH__\\n'; ip neigh show 2>/dev/null; " +
            "printf '__DHCP_LEASES__\\n'; cat /tmp/dhcp.leases 2>/dev/null; printf '__DHCP_STATIC__\\n'; uci -q show dhcp 2>/dev/null"

    fun parseWolCandidates(output: String): List<WolDevice> {
        val candidates = linkedMapOf<String, WolDevice>()
        for (client in parseConnectedClients(output)) {
            candidates[client.mac] = WolDevice(client.mac, client.hostname, client.ipv4)
        }
        val snapshot = parseDhcpLeaseSnapshot(output)
        for (lease in snapshot.dynamic + snapshot.static) {
            val previous = candidates[lease.mac]
            candidates[lease.mac] = WolDevice(
                mac = lease.mac,
                hostname = previous?.hostname ?: lease.hostname,
                ipv4 = previous?.ipv4 ?: lease.ipv4,
            )
        }
        return candidates.values.sortedBy { it.hostname ?: it.mac }
    }

    fun buildWolTargetSaveCommand(device: WolDevice): String {
        val mac = requireMac(device.mac)
        val section = "openwrt_app_wol_" + mac.replace(":", "_").lowercase()
        val name = (device.hostname ?: "").trim()
            .replace(Regex("[\r\n]"), " ").take(63)
            .ifEmpty { "OpenWrt App $mac" }
        val ipv4 = device.ipv4?.let { requireIpv4(it) }
        val ipv4Command =
            if (ipv4 != null) "; uci set wol.$section.ip=${quoteShell(ipv4)}"
            else "; uci -q delete wol.$section.ip"
        return "uci -q delete wol.$section; uci set wol.$section='wol'; " +
            "uci set wol.$section.name=${quoteShell(name)}; uci set wol.$section.mac=${quoteShell(mac)}" +
            "$ipv4Command; uci commit wol; /etc/init.d/wol reload >/dev/null 2>&1 || true; printf '__WOL_SAVED__\\n'"
    }

    fun parseWolDevices(output: String): List<WolDevice> {
        val sections = parseUciSections("wol", output, "__WOL_CONFIG__", setOf("__WOL_DHCP__"))
        val leases = parseDhcpLeaseSnapshot(
            output.replace("__WOL_DHCP__", "__DHCP_LEASES__").replace("__WOL_STATIC__", "__DHCP_STATIC__"),
        )
        val leaseByMac = (leases.static + leases.dynamic).associateBy { it.mac }
        val targets = linkedMapOf<String, WolDevice>()
        for ((section, values) in sections) {
            val mac = listOf("mac", "macaddr", "address").mapNotNull { values.first(it) }.firstOrNull() ?: continue
            if (!fullMacRegex.matches(mac)) continue
            val normalizedMac = requireMac(mac)
            val lease = leaseByMac[normalizedMac]
            val configuredName = listOf("name", "hostname", "host", "description")
                .mapNotNull { values.first(it) }.firstOrNull { normalizeLeaseHostname(it) != null }
            val configuredIpv4 = listOf("ip", "ipaddr")
                .mapNotNull { values.first(it) }.firstOrNull { ipv4Regex.matches(it) }
            targets[normalizedMac] = WolDevice(
                mac = normalizedMac,
                hostname = normalizeLeaseHostname(configuredName)
                    ?: lease?.hostname
                    ?: section.takeUnless { it.startsWith("@") },
                ipv4 = configuredIpv4 ?: lease?.ipv4,
            )
        }
        return targets.values.sortedBy { it.hostname ?: it.mac }
    }

    // ---------- 无线管理 ----------

    fun parseWifiConfigs(output: String): List<WifiConfigEntry> {
        val entries = linkedMapOf<String, MutableMap<String, String>>()
        val regex = Regex("^wireless\\.([A-Za-z0-9_]+)\\.(device|ssid|disabled|encryption|key|hidden|isolate|network)=(.+)$")
        for (line in output.split(Regex("\r?\n"))) {
            val match = regex.find(line) ?: continue
            val (section, key, raw) = match.destructured
            val entry = entries.getOrPut(section) { mutableMapOf("section" to section) }
            when (key) {
                "device" -> entry["device"] = cleanQuoted(raw)
                "ssid" -> entry["ssid"] = cleanQuoted(raw)
                "disabled" -> entry["disabled"] = cleanQuoted(raw).let { if (it == "1") "1" else "0" }
                "encryption" -> entry["encryption"] = cleanQuoted(raw)
                "key" -> entry["key"] = cleanQuoted(raw)
                "hidden" -> entry["hidden"] = if (cleanQuoted(raw) == "1") "1" else "0"
                "isolate" -> entry["isolate"] = if (cleanQuoted(raw) == "1") "1" else "0"
                "network" -> entry["network"] = cleanQuoted(raw).replace(Regex("^'|'$"), "")
            }
        }
        return entries.values.mapNotNull { entry ->
            val section = entry["section"] ?: return@mapNotNull null
            val device = entry["device"] ?: return@mapNotNull null
            val ssid = entry["ssid"] ?: return@mapNotNull null
            WifiConfigEntry(
                section = section,
                device = device,
                ssid = ssid,
                disabled = entry["disabled"] == "1",
                encryption = entry["encryption"] ?: "none",
                key = entry["key"] ?: "",
                hidden = entry["hidden"] == "1",
                isolate = entry["isolate"] == "1",
                network = entry["network"] ?: "",
            )
        }
    }

    fun parseWifiNetworkBindings(output: String): List<String> {
        val bindings = linkedSetOf<String>()
        val regex = Regex("^__WIFI_NETWORK__\\|([A-Za-z0-9_.-]{1,32})$")
        for (line in output.split(Regex("\r?\n"))) {
            regex.find(line)?.let { bindings.add(it.groupValues[1]) }
        }
        return bindings.sorted()
    }

    fun buildWifiSnapshotCommand(): String =
        "uci -q show network 2>/dev/null | sed -n 's/^network\\.\\([A-Za-z0-9_][A-Za-z0-9_.-]*\\)=interface\$/__WIFI_NETWORK__|\\1/p'; uci show wireless 2>/dev/null"

    fun buildWifiClientSnapshotCommand(): String =
        "iw dev 2>/dev/null | awk '\$1==\"Interface\"{print \$2}' | while read -r iface; do " +
            "echo \"__WIFI_IFACE__|\$iface\"; iw dev \"\$iface\" station dump 2>/dev/null; done"

    fun parseWifiClients(output: String): List<WifiClient> {
        val clients = mutableListOf<WifiClient>()
        var interfaceName: String? = null
        var pending: WifiClient? = null
        val markerRegex = Regex("^__WIFI_IFACE__\\|(.+)$")
        val stationRegex = Regex("^Station\\s+([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})\\b")
        val signalRegex = Regex("^\\s*signal:\\s*(-?\\d+)\\s*dBm", RegexOption.IGNORE_CASE)
        for (line in output.split(Regex("\r?\n"))) {
            markerRegex.find(line)?.let {
                interfaceName = it.groupValues[1].trim().ifEmpty { null }
                return@let
            }
            stationRegex.find(line)?.let {
                pending = WifiClient(it.groupValues[1].uppercase(), interfaceName, null).also { client ->
                    clients.add(client)
                }
                return@let
            }
            signalRegex.find(line)?.let {
                // 与 TS 的可变对象语义一致:更新列表中最后一个 Station 条目的信号。
                val index = clients.indexOfLast { client -> client === pending }
                if (index >= 0) {
                    clients[index] = clients[index].copy(signalDbm = it.groupValues[1].toInt())
                    pending = clients[index]
                }
            }
        }
        return clients
    }

    private fun signalQuality(signalDbm: Int?): Pair<SignalQuality, String> = when {
        signalDbm == null -> SignalQuality.UNKNOWN to "未报告信号"
        signalDbm <= -75 -> SignalQuality.WEAK to "弱信号"
        signalDbm <= -67 -> SignalQuality.FAIR to "需关注"
        else -> SignalQuality.GOOD to "良好"
    }

    fun buildWeakSignalSnapshotCommand(): String =
        "${buildWifiClientSnapshotCommand()}; ${buildClientSnapshotCommand()}"

    fun parseWeakSignalClients(output: String): List<WeakSignalClient> {
        val clientByMac = parseConnectedClients(output).associateBy { it.mac }
        val weight = mapOf(SignalQuality.WEAK to 0, SignalQuality.FAIR to 1, SignalQuality.UNKNOWN to 2, SignalQuality.GOOD to 3)
        return parseWifiClients(output).map { client ->
            val connected = clientByMac[client.mac]
            val (quality, label) = signalQuality(client.signalDbm)
            WeakSignalClient(
                mac = client.mac,
                interfaceName = client.interfaceName,
                signalDbm = client.signalDbm,
                hostname = connected?.hostname,
                ipv4 = connected?.ipv4,
                online = connected?.online ?: true,
                quality = quality,
                qualityLabel = label,
            )
        }.sortedWith(
            compareBy<WeakSignalClient> { weight[it.quality]!! }
                .thenBy { it.signalDbm ?: 1 }
                .thenBy { it.hostname ?: it.mac },
        )
    }

    fun buildWirelessOptimizationSnapshotCommand(): String =
        "RADIOS=\$({ uci -q show wireless | sed -n \"s/^wireless\\.\\([A-Za-z0-9_-]*\\)='wifi-device'\$/\\1/p\"; " +
            "uci -q show wireless | sed -n \"s/^wireless\\.[A-Za-z0-9_-]*\\.device='\\([A-Za-z0-9_-]*\\)'\$/\\1/p\"; } | sort -u); " +
            "for radio in \$RADIOS; do channel=\$(uci -q get wireless.\$radio.channel 2>/dev/null || true); " +
            "printf 'RADIO|%s|%s\\n' \"\$radio\" \"\$channel\"; done; " +
            "ubus call iwinfo devices 2>/dev/null | jsonfilter -e '@.devices[*]' 2>/dev/null | while read -r device; do " +
            "scan=\$(ubus call iwinfo scan \"{\\\"device\\\":\\\"\$device\\\"}\" 2>/dev/null | jsonfilter -e '@.results' 2>/dev/null); " +
            "[ -n \"\$scan\" ] && printf 'SCAN|%s|%s\\n' \"\$device\" \"\$scan\"; done"

    private fun readScanNetworks(radio: String, raw: String): List<WirelessScanNetwork> {
        val decoded = try {
            Json.parseToJsonElement(raw)
        } catch (error: Exception) {
            return emptyList()
        }
        val records: List<kotlinx.serialization.json.JsonElement> = when {
            decoded is JsonArray -> decoded
            decoded is JsonObject && decoded["results"] is JsonArray -> decoded["results"] as JsonArray
            else -> return emptyList()
        }
        return records.mapNotNull { item ->
            val record = item as? JsonObject ?: return@mapNotNull null
            val channel = (record["channel"] as? JsonPrimitive)?.doubleOrNull?.toInt() ?: return@mapNotNull null
            if (channel < 1 || channel > 233) return@mapNotNull null
            val signal = ((record["signal"] ?: record["signal_dbm"]) as? JsonPrimitive)?.doubleOrNull
            WirelessScanNetwork(
                radio = radio,
                ssid = (record["ssid"] as? JsonPrimitive)?.takeIf { it.isString && it.content.isNotBlank() }?.content,
                bssid = (record["bssid"] as? JsonPrimitive)?.takeIf { it.isString && it.content.isNotBlank() }
                    ?.content?.uppercase(),
                channel = channel,
                signalDbm = signal?.toInt(),
            )
        }
    }

    fun parseWirelessOptimizationSnapshot(output: String): WirelessOptimizationSnapshot {
        val radios = linkedMapOf<String, WirelessRadio>()
        val scans = mutableListOf<Pair<String, String>>()
        val radioRegex = Regex("^RADIO\\|([A-Za-z0-9_-]+)\\|([^|]*)$")
        val scanRegex = Regex("^SCAN\\|([A-Za-z0-9_-]+)\\|(.+)$")
        for (rawLine in output.split(Regex("\r?\n"))) {
            val line = rawLine.trim()
            radioRegex.find(line)?.let {
                val channel = it.groupValues[2].toDoubleOrNull()
                radios[it.groupValues[1]] = WirelessRadio(
                    name = it.groupValues[1],
                    currentChannel = channel?.takeIf { ch -> ch >= 1 && ch <= 233 }?.toInt(),
                )
                return@let
            }
            scanRegex.find(line)?.let { scans.add(it.groupValues[1] to it.groupValues[2]) }
        }
        val networks = mutableListOf<WirelessScanNetwork>()
        val phyRegex = Regex("(?:^|[^a-z0-9])phy(\\d+)(?:[^a-z0-9]|$)", RegexOption.IGNORE_CASE)
        val radioNumberRegex = Regex("^radio(\\d+)$", RegexOption.IGNORE_CASE)
        for ((device, raw) in scans) {
            val phyNumber = phyRegex.find(device)?.groupValues?.get(1)
                ?: radioNumberRegex.find(device)?.groupValues?.get(1)
            val mappedRadio = when {
                radios.containsKey(device) -> device
                phyNumber != null && radios.containsKey("radio$phyNumber") -> "radio$phyNumber"
                radios.size == 1 -> radios.keys.first()
                else -> device
            }
            networks.addAll(readScanNetworks(mappedRadio, raw))
        }
        return WirelessOptimizationSnapshot(radios.values.sortedBy { it.name }, networks)
    }

    private fun signalWeight(signalDbm: Int?): Double =
        (if (signalDbm == null) 32.0 else (100 + signalDbm).toDouble()).coerceIn(8.0, 80.0)

    private fun congestionScore(channel: Int, networks: List<WirelessScanNetwork>, is24GHz: Boolean): Double =
        networks.fold(0.0) { score, network ->
            val distance = Math.abs(channel - network.channel)
            val overlap = if (is24GHz) {
                (1.0 - distance / 5.0).coerceAtLeast(0.0)
            } else if (distance == 0) 1.0 else 0.0
            score + signalWeight(network.signalDbm) * overlap
        }

    fun recommendWirelessChannel(
        radio: WirelessRadio,
        networks: List<WirelessScanNetwork>,
    ): WirelessChannelRecommendation {
        val currentChannel = radio.currentChannel
        val radioNetworks = networks.filter { it.radio == radio.name }
        if (currentChannel == null) {
            return WirelessChannelRecommendation(
                radio.name, null, null, null, null,
                "路由器未报告当前信道，无法给出可安全应用的建议。",
            )
        }
        if (radioNetworks.isEmpty()) {
            return WirelessChannelRecommendation(
                radio.name, currentChannel, currentChannel, 0.0, 0.0,
                "未读取到邻近网络；保留当前信道，避免在没有扫描依据时修改无线配置。",
            )
        }
        val is24GHz = currentChannel <= 14 || radioNetworks.any { it.channel <= 14 }
        val candidates = if (is24GHz) {
            listOf(1, 6, 11)
        } else {
            (setOf(currentChannel) + radioNetworks.map { it.channel }).sorted()
        }
        val suggested = candidates
            .map { channel -> channel to congestionScore(channel, radioNetworks, is24GHz) }
            .sortedWith(
                compareBy<Pair<Int, Double>> { it.second }.thenBy { Math.abs(it.first - currentChannel) },
            ).first()
        val currentScore = congestionScore(currentChannel, radioNetworks, is24GHz)
        val reason = if (suggested.first == currentChannel) {
            "当前信道 $currentChannel 在本次扫描的 ${radioNetworks.size} 个邻近网络中已是较低拥挤度选项。"
        } else {
            "基于本次扫描的 ${radioNetworks.size} 个邻近网络，信道 ${suggested.first} 的加权拥挤度低于当前信道 $currentChannel。"
        }
        return WirelessChannelRecommendation(
            radio.name, currentChannel, suggested.first, currentScore, suggested.second, reason,
        )
    }

    fun buildWirelessChannelApplyCommand(radio: String, channel: Int): String {
        val safeRadio = requireIdentifier(radio, "无线设备")
        if (channel < 1 || channel > 233) throw IllegalArgumentException("无线信道应为 1–233 的整数。")
        return "uci set wireless.$safeRadio.channel='$channel'; uci commit wireless; wifi reload"
    }

    private fun escapeWifiQr(value: String): String =
        value.replace(Regex("([\\\\;,:\"])"), "\\\\$1")

    fun buildWifiQrValue(ssid: String, password: String): String {
        val safeSsid = ssid.trim()
        val safePassword = password.trim()
        if (safeSsid.isEmpty() || safePassword.isEmpty()) {
            throw IllegalArgumentException("请填写访客网络名称和密码。")
        }
        return "WIFI:T:WPA;S:${escapeWifiQr(safeSsid)};P:${escapeWifiQr(safePassword)};;"
    }

    fun buildGuestNetworkCommand(radio: String, ssid: String, password: String): String {
        val safeRadio = requireIdentifier(radio, "无线设备")
        val safeSsid = ssid.trim()
        val safePassword = password.trim()
        if (safeSsid.isEmpty() || safeSsid.length > 32) {
            throw IllegalArgumentException("访客网络名称必须为 1–32 个字符。")
        }
        if (safePassword.length < 8 || safePassword.length > 63) {
            throw IllegalArgumentException("访客网络密码必须为 8–63 个字符。")
        }
        return "uci -q delete wireless.openwrt_app_guest; uci set wireless.openwrt_app_guest='wifi-iface'; " +
            "uci set wireless.openwrt_app_guest.device=${quoteShell(safeRadio)}; " +
            "uci set wireless.openwrt_app_guest.mode='ap'; uci set wireless.openwrt_app_guest.ssid=${quoteShell(safeSsid)}; " +
            "uci set wireless.openwrt_app_guest.encryption='sae-mixed'; uci set wireless.openwrt_app_guest.key=${quoteShell(safePassword)}; " +
            "uci set wireless.openwrt_app_guest.network='guest'; uci -q delete network.guest; uci set network.guest='interface'; " +
            "uci set network.guest.proto='static'; uci set network.guest.ipaddr='192.168.75.1'; " +
            "uci set network.guest.netmask='255.255.255.0'; uci -q delete dhcp.guest; uci set dhcp.guest='dhcp'; " +
            "uci set dhcp.guest.interface='guest'; uci set dhcp.guest.start='100'; uci set dhcp.guest.limit='150'; " +
            "uci set dhcp.guest.leasetime='12h'; uci -q delete firewall.guest; uci set firewall.guest='zone'; " +
            "uci set firewall.guest.name='guest'; uci set firewall.guest.input='REJECT'; " +
            "uci set firewall.guest.output='ACCEPT'; uci set firewall.guest.forward='REJECT'; " +
            "uci add_list firewall.guest.network='guest'; uci -q delete firewall.openwrt_app_guest_to_wan; " +
            "uci set firewall.openwrt_app_guest_to_wan='forwarding'; uci set firewall.openwrt_app_guest_to_wan.src='guest'; " +
            "uci set firewall.openwrt_app_guest_to_wan.dest='wan'; uci commit wireless; uci commit network; uci commit dhcp; " +
            "uci commit firewall; /etc/init.d/network reload; /etc/init.d/dnsmasq restart; /etc/init.d/firewall reload; wifi reload"
    }

    fun buildWifiToggleCommand(section: String, enabled: Boolean): String {
        val safeSection = requireIdentifier(section, "无线配置段")
        return "uci set wireless.$safeSection.disabled='${if (enabled) "0" else "1"}'; uci commit wireless; wifi reload"
    }

    fun buildWifiSsidCommand(section: String, ssid: String): String {
        val safeSection = requireIdentifier(section, "无线配置段")
        val nextSsid = ssid.trim()
        if (nextSsid.isEmpty() || nextSsid.length > 32) throw IllegalArgumentException("SSID 必须为 1–32 个字符。")
        return "uci set wireless.$safeSection.ssid=${quoteShell(nextSsid)}; uci commit wireless; wifi reload"
    }

    private fun safeWifiEncryption(value: String): String {
        val normalized = value.trim().lowercase()
        val supported = setOf("none", "psk", "psk2", "psk-mixed", "sae", "sae-mixed", "owe", "wep-open", "wep-shared")
        if (normalized !in supported) {
            throw IllegalArgumentException("加密方式仅支持 none、psk2、sae、sae-mixed、psk-mixed、owe 或 WEP。")
        }
        return normalized
    }

    private fun safeWifiNetwork(value: String): String {
        val normalized = value.trim()
        if (normalized.isEmpty()) return ""
        val items = normalized.split(Regex("\\s+"))
        if (items.size > 8 || items.any { !Regex("^[A-Za-z0-9_.-]{1,32}$").matches(it) }) {
            throw IllegalArgumentException("绑定网络仅支持以空格分隔的合法接口名称。")
        }
        return items.joinToString(" ")
    }

    fun buildWifiSettingsSaveCommand(
        section: String,
        ssid: String,
        encryption: String,
        key: String,
        hidden: Boolean,
        isolate: Boolean,
        network: String,
    ): String {
        val safeSection = requireIdentifier(section, "无线配置段")
        val safeSsid = ssid.trim()
        if (safeSsid.isEmpty() || safeSsid.length > 32 || Regex("[\r\n]").containsMatchIn(safeSsid)) {
            throw IllegalArgumentException("SSID 必须为 1–32 个字符，且不能包含换行。")
        }
        val safeEncryption = safeWifiEncryption(encryption)
        val safeKey = key.trim()
        if (safeEncryption != "none" && safeEncryption != "owe" &&
            (safeKey.length < 8 || safeKey.length > 63) &&
            !Regex("^[0-9A-Fa-f]{64}$").matches(safeKey)
        ) {
            throw IllegalArgumentException("WPA 密码应为 8–63 位，或 64 位十六进制密钥。")
        }
        if (Regex("[\r\n]").containsMatchIn(safeKey)) throw IllegalArgumentException("无线密码不能包含换行。")
        val safeNetwork = safeWifiNetwork(network)
        val keyCommand =
            if (safeEncryption == "none" || safeEncryption == "owe") "uci -q delete wireless.$safeSection.key"
            else "uci set wireless.$safeSection.key=${quoteShell(safeKey)}"
        val networkCommand =
            if (safeNetwork.isNotEmpty()) "uci set wireless.$safeSection.network=${quoteShell(safeNetwork)}"
            else "uci -q delete wireless.$safeSection.network"
        return "cp /etc/config/wireless /etc/config/wireless.app-backup.\$(date +%s) 2>/dev/null || true; " +
            "uci set wireless.$safeSection.ssid=${quoteShell(safeSsid)}; " +
            "uci set wireless.$safeSection.encryption=${quoteShell(safeEncryption)}; $keyCommand; " +
            "uci set wireless.$safeSection.hidden='${if (hidden) "1" else "0"}'; " +
            "uci set wireless.$safeSection.isolate='${if (isolate) "1" else "0"}'; $networkCommand; " +
            "uci commit wireless; wifi reload"
    }

    fun buildWifiDeleteCommand(section: String): String {
        val safeSection = requireIdentifier(section, "无线配置段")
        val guestCleanup =
            if (safeSection == "openwrt_app_guest") {
                "; uci -q delete network.guest; uci -q delete dhcp.guest; uci -q delete firewall.guest; " +
                    "uci -q delete firewall.openwrt_app_guest_to_wan; uci commit network; uci commit dhcp; " +
                    "uci commit firewall; /etc/init.d/network reload; /etc/init.d/dnsmasq restart; /etc/init.d/firewall reload"
            } else ""
        return "uci -q delete wireless.$safeSection; uci commit wireless$guestCleanup; wifi reload"
    }

    // ---------- 诊断 ----------

    fun isWanInterface(item: InterfaceStatus): Boolean =
        Regex("^(wan|wan\\d+|wan[a-z0-9_-]+)$", RegexOption.IGNORE_CASE).matches(item.name) && item.up

    fun buildWanDiagnosticCommand(
        interfaceName: String,
        kind: WanDiagnosticKind,
        target: String,
        port: Int = 443,
    ): String {
        val wan = requireIdentifier(interfaceName, "WAN 接口")
        val hostname = target.trim()
        if (!Regex("^[A-Za-z0-9.-]+$").matches(hostname)) {
            throw IllegalArgumentException("诊断目标仅支持域名或 IPv4 地址。")
        }
        if (port < 1 || port > 65535) throw IllegalArgumentException("端口范围应为 1–65535。")
        return when (kind) {
            WanDiagnosticKind.PING -> "ping -I $wan -c 4 -W 2 $hostname"
            WanDiagnosticKind.DNS -> "nslookup $hostname"
            WanDiagnosticKind.TRACE -> "traceroute -n -i $wan -w 2 -q 1 $hostname 2>&1 || tracepath -n $hostname 2>&1"
            WanDiagnosticKind.PORT -> "nc -z -w 4 $hostname $port 2>&1 || busybox nc -z -w 4 $hostname $port 2>&1"
        }
    }

    private fun requireDnsAddress(value: String): String {
        val address = value.trim()
        if (!Regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}$").matches(address) &&
            !Regex("^[0-9a-fA-F:]+$").matches(address)
        ) {
            throw IllegalArgumentException("DNS 服务器仅支持 IPv4 或 IPv6 地址。")
        }
        return address
    }

    fun buildDnsLatencyCommand(
        interfaceName: String,
        dnsServer: String,
        family: DnsFamily,
        hostname: String = "openwrt.org",
    ): String {
        val wan = requireIdentifier(interfaceName, "WAN 接口")
        val server = requireDnsAddress(dnsServer)
        val query = hostname.trim()
        if (!Regex("^[A-Za-z0-9.-]+$").matches(query)) throw IllegalArgumentException("查询域名格式无效。")
        val familyFlag = if (family == DnsFamily.IPV6) "-6" else "-4"
        val label = if (family == DnsFamily.IPV6) "IPv6" else "IPv4"
        return "echo 'OPENWRT_DNS|$label|$server|$query'; " +
            "start=\$(date +%s%3N 2>/dev/null || date +%s000); " +
            "nslookup $familyFlag $query $server >/tmp/openwrt-app-dns.\$\$ 2>&1; code=\$?; " +
            "end=\$(date +%s%3N 2>/dev/null || date +%s000); cat /tmp/openwrt-app-dns.\$\$; rm -f /tmp/openwrt-app-dns.\$\$; " +
            "echo \"OPENWRT_DNS_RESULT|exit=\$code|elapsed_ms=\$((end-start))|wan=$wan\""
    }

    fun buildWanReconnectCommand(interfaceName: String): String {
        val wan = requireIdentifier(interfaceName, "WAN 接口")
        return "ifdown $wan; sleep 2; ifup $wan; ifstatus $wan"
    }

    // ---------- 服务与 Docker ----------

    fun buildServiceSnapshotCommand(): String {
        val serviceChecks = MANAGED_OPENWRT_SERVICES.sorted().joinToString("; ") { service ->
            "if pgrep -x $service >/dev/null 2>&1; then echo 'OPENWRT|$service|running'; else echo 'OPENWRT|$service|stopped'; fi"
        }
        return "$serviceChecks; if command -v docker >/dev/null 2>&1; then docker ps -a --format 'DOCKER|{{.Names}}|{{.Status}}'; fi"
    }

    fun parseServiceStates(output: String): List<ServiceState> =
        output.split(Regex("\r?\n")).mapNotNull { line ->
            val parts = line.trim().split("|")
            val kind = parts.getOrNull(0)
            val name = parts.getOrNull(1)
            val detail = parts.getOrNull(2)
            if (name.isNullOrEmpty() || (kind != "OPENWRT" && kind != "DOCKER")) return@mapNotNull null
            ServiceState(
                name = name,
                running = if (kind == "OPENWRT") detail == "running" else Regex("^Up\\b", RegexOption.IGNORE_CASE).containsMatchIn(detail ?: ""),
                managedBy = if (kind == "OPENWRT") ManagedBy.OPENWRT else ManagedBy.DOCKER,
                detail = detail,
            )
        }

    fun buildServiceCommand(name: String, action: ServiceAction, managedBy: ManagedBy): String {
        val safeName = requireIdentifier(name, "服务名称")
        if (managedBy == ManagedBy.DOCKER) {
            return "docker ${action.name.lowercase()} $safeName"
        }
        if (safeName !in MANAGED_OPENWRT_SERVICES) {
            throw IllegalArgumentException("不支持控制此系统服务。")
        }
        return "/etc/init.d/$safeName ${action.name.lowercase()}"
    }

    fun buildDockerSnapshotCommand(): String =
        "if ! command -v docker >/dev/null 2>&1; then echo '__DOCKER_UNAVAILABLE__'; else echo '__DOCKER_AVAILABLE__'; " +
            "docker ps -a --format 'CONTAINER|{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' 2>&1; " +
            "echo '__DOCKER_STATS__'; docker stats --no-stream --format 'STAT|{{.ID}}|{{.CPUPerc}}|{{.MemUsage}}' 2>/dev/null; fi"

    fun parseDockerSnapshot(output: String): DockerSnapshot {
        if (!output.contains("__DOCKER_AVAILABLE__")) return DockerSnapshot(false, emptyList())
        val containers = linkedMapOf<String, DockerContainer>()
        for (rawLine in output.split(Regex("\r?\n"))) {
            val line = rawLine.trim()
            val parts = line.split("|")
            if (parts[0] == "CONTAINER" && parts.size >= 6) {
                val id = parts[1]
                val name = parts[2]
                val image = parts[3]
                val status = parts[4]
                val ports = parts.drop(5).joinToString("|").trim().ifEmpty { null }
                if (!Regex("^[A-Za-z0-9]+$").matches(id) || name.isEmpty() || image.isEmpty()) continue
                containers[id] = DockerContainer(
                    id = id, name = name, image = image, status = status,
                    running = Regex("^Up\\b", RegexOption.IGNORE_CASE).containsMatchIn(status),
                    ports = ports, cpuPercent = null, memoryUsage = null,
                )
            }
            if (parts[0] == "STAT" && parts.size >= 4) {
                val id = parts[1]
                val cpuPercent = parts[2].trim().ifEmpty { null }
                val memoryUsage = parts.drop(3).joinToString("|").trim().ifEmpty { null }
                containers[id]?.let { current ->
                    containers[id] = current.copy(cpuPercent = cpuPercent, memoryUsage = memoryUsage)
                }
            }
        }
        return DockerSnapshot(
            available = true,
            containers = containers.values.sortedWith(
                compareByDescending<DockerContainer> { it.running }.thenBy { it.name },
            ),
        )
    }

    fun buildDockerContainerCommand(id: String, action: ServiceAction): String {
        val safeId = requireIdentifier(id, "Docker 容器")
        return "docker ${action.name.lowercase()} $safeId"
    }

    fun buildDockerContainerLogsCommand(id: String): String {
        val safeId = requireIdentifier(id, "Docker 容器")
        return "docker logs --tail 200 $safeId 2>&1"
    }

    // ---------- 性能基准与硬盘测速 ----------

    fun buildPerformanceBenchmarkCommand(): String =
        "printf '__BENCHMARK_SYSTEM__\\n'; " +
            "awk -F: '/^(model name|system type|machine|Processor)[[:space:]]*:/{gsub(/^[[:space:]]+/, \"\", \$2); printf \"CPU|%s|\", \$2; found=1; exit} END{if(!found) printf \"CPU|未知 CPU|\"}' /proc/cpuinfo; " +
            "awk '/^processor[[:space:]]*:/ {count++} END{if(count<1) count=1; printf \"%s\\n\", count}' /proc/cpuinfo; " +
            "awk '{printf \"LOAD|%s\\n\", \$1}' /proc/loadavg; " +
            "awk '/^MemTotal:/{total=\$2}/^MemAvailable:/{available=\$2}END{printf \"MEM|%s|%s\\n\", total, available}' /proc/meminfo; " +
            "df -k /overlay 2>/dev/null | awk 'NR==2{printf \"STORAGE|%s|%s|%s\\n\", \$2, \$3, \$4; found=1} END{if(!found) print \"STORAGE|||\"}'"

    private fun nullableNumber(value: String?): Double? {
        if (value.isNullOrEmpty()) return null
        return value.toDoubleOrNull()?.takeIf { it.isFinite() }
    }

    fun parsePerformanceBenchmark(output: String): PerformanceBenchmark {
        var cpuModel: String? = null
        var cpuCores: Double? = null
        var loadAverage: Double? = null
        var memoryTotalKb: Double? = null
        var memoryAvailableKb: Double? = null
        var storageTotalKb: Double? = null
        var storageUsedKb: Double? = null
        var storageAvailableKb: Double? = null
        for (rawLine in output.split(Regex("\r?\n"))) {
            val line = rawLine.trim()
            Regex("^CPU\\|(.+)\\|(\\d+)$").find(line)?.let {
                cpuModel = it.groupValues[1].ifEmpty { null }
                cpuCores = nullableNumber(it.groupValues[2])
                return@let
            }
            Regex("^LOAD\\|(.+)$").find(line)?.let {
                loadAverage = nullableNumber(it.groupValues[1])
                return@let
            }
            Regex("^MEM\\|(\\d*)\\|(\\d*)$").find(line)?.let {
                memoryTotalKb = nullableNumber(it.groupValues[1])
                memoryAvailableKb = nullableNumber(it.groupValues[2])
                return@let
            }
            Regex("^STORAGE\\|(\\d*)\\|(\\d*)\\|(\\d*)$").find(line)?.let {
                storageTotalKb = nullableNumber(it.groupValues[1])
                storageUsedKb = nullableNumber(it.groupValues[2])
                storageAvailableKb = nullableNumber(it.groupValues[3])
            }
        }
        return PerformanceBenchmark(
            cpuModel, cpuCores, loadAverage, memoryTotalKb, memoryAvailableKb,
            storageTotalKb, storageUsedKb, storageAvailableKb,
        )
    }

    private fun requireDiskSpeedDirectory(value: String): String {
        val directory = value.trim().trimEnd('/').ifEmpty { "/" }
        if (!directory.startsWith("/") || Regex("[\r\n\u0000]").containsMatchIn(directory) ||
            directory.split("/").any { it == ".." }
        ) {
            throw IllegalArgumentException("测速目录必须为不包含上级路径的绝对路径。")
        }
        return directory
    }

    private fun requireDiskSpeedSize(value: Int): Int {
        if (value < 1 || value > 2048) throw IllegalArgumentException("测速文件大小应为 1–2048 MB 的整数。")
        return value
    }

    fun buildDiskSpeedCommand(directory: String, fileSizeMB: Int): String {
        val safeDirectory = requireDiskSpeedDirectory(directory)
        val safeSize = requireDiskSpeedSize(fileSizeMB)
        return "dir=${quoteShell(safeDirectory)}; [ -d \"\$dir\" ] && [ -w \"\$dir\" ] || { echo 'DISK_SPEED_ERROR|测速目录不存在或不可写'; exit 2; }; " +
            "test_file=\"\$dir/.openwrt-status-speed-test-\$\$.bin\"; " +
            "cleanup() { rm -f \"\$test_file\"; }; trap cleanup EXIT HUP INT TERM; " +
            "now_ms() { awk '{printf \"%d\", \$1 * 1000}' /proc/uptime; }; " +
            "write_start=\$(now_ms); dd if=/dev/zero of=\"\$test_file\" bs=1M count=$safeSize conv=fsync 2>&1; write_code=\$?; write_end=\$(now_ms); " +
            "[ \"\$write_code\" -eq 0 ] || { echo 'DISK_SPEED_ERROR|写入测试失败'; exit \"\$write_code\"; }; " +
            "read_start=\$(now_ms); dd if=\"\$test_file\" of=/dev/null bs=1M 2>&1; read_code=\$?; read_end=\$(now_ms); " +
            "[ \"\$read_code\" -eq 0 ] || { echo 'DISK_SPEED_ERROR|读取测试失败'; exit \"\$read_code\"; }; " +
            "echo \"DISK_SPEED_RESULT|\$dir|$safeSize|\$((write_end-write_start))|\$((read_end-read_start))\""
    }

    fun parseDiskSpeedResult(output: String): DiskSpeedResult {
        val match = Regex("^DISK_SPEED_RESULT\\|([^|]+)\\|(\\d+)\\|(\\d+)\\|(\\d+)$", RegexOption.MULTILINE)
            .find(output) ?: return DiskSpeedResult(null, null, "", 0, null, null)
        val directory = match.groupValues[1]
        val fileSizeMB = match.groupValues[2].toInt()
        val writeDurationMs = match.groupValues[3].toDouble()
        val readDurationMs = match.groupValues[4].toDouble()
        fun speed(durationMs: Double): Double? =
            if (durationMs.isFinite() && durationMs > 0) {
                String.format(java.util.Locale.ROOT, "%.2f", fileSizeMB * 1000.0 / durationMs).toDouble()
            } else null
        return DiskSpeedResult(
            directory = directory,
            fileSizeMB = fileSizeMB,
            writeDurationMs = writeDurationMs.takeIf { it.isFinite() },
            readDurationMs = readDurationMs.takeIf { it.isFinite() },
            writeSpeedMBps = speed(writeDurationMs),
            readSpeedMBps = speed(readDurationMs),
        )
    }

    // ---------- 硬件详情与固件 ----------

    fun buildRouterHardwareDetailsCommand(): String =
        "printf '__DETAIL_CPU__\\n'; " +
            "awk -F: '/^(model name|system type|machine|Processor)[[:space:]]*:/{gsub(/^[[:space:]]+/, \"\", \$2); printf \"CPU|%s|\", \$2; found=1; exit} END{if(!found) printf \"CPU|未知 CPU|\"}' /proc/cpuinfo; " +
            "awk '/^processor[[:space:]]*:/ {count++} END{if(count<1) count=1; printf \"%s\\n\", count}' /proc/cpuinfo; " +
            "printf '__DETAIL_KERNEL__\\n'; uname -r 2>/dev/null; " +
            "printf '__DETAIL_WIFI_TEMPERATURES__\\n'; " +
            "for path in /sys/class/ieee80211/phy*/device/hwmon/hwmon*/temp*_input /sys/class/ieee80211/phy*/device/temp*_input /sys/class/ieee80211/phy*/device/temperature /sys/class/ieee80211/phy*/temperature; do [ -r \"\$path\" ] && printf 'WIFI_TEMP|%s\\n' \"\$(cat \"\$path\" 2>/dev/null)\"; done; " +
            "for hwmon in /sys/class/hwmon/hwmon*; do [ -r \"\$hwmon/name\" ] || continue; name=\$(tr '[:upper:]' '[:lower:]' < \"\$hwmon/name\" 2>/dev/null); " +
            "case \"\$name\" in *wifi*|*wlan*|*ath*|*mt76*|*mt79*|*radio*) for path in \"\$hwmon\"/temp*_input; do [ -r \"\$path\" ] && printf 'WIFI_TEMP|%s\\n' \"\$(cat \"\$path\" 2>/dev/null)\"; done;; esac; done; " +
            "printf '__DETAIL_SENSOR_TEMPERATURES__\\n'; " +
            "for path in /sys/class/thermal/thermal_zone*/temp /sys/devices/virtual/thermal/thermal_zone*/temp /sys/class/hwmon/hwmon*/temp*_input; do [ -r \"\$path\" ] && printf 'SENSOR_TEMP|%s\\n' \"\$(cat \"\$path\" 2>/dev/null)\"; done"

    fun parseRouterHardwareDetails(output: String): RouterHardwareDetails {
        var cpuModel: String? = null
        var cpuCores: Double? = null
        var kernelVersion: String? = null
        val wifiTemperaturesC = mutableListOf<Double>()
        val sensorTemperaturesC = mutableListOf<Double>()
        var section = ""
        for (rawLine in output.split(Regex("\r?\n"))) {
            val line = rawLine.trim()
            when (line) {
                "__DETAIL_CPU__" -> { section = "cpu"; continue }
                "__DETAIL_KERNEL__" -> { section = "kernel"; continue }
                "__DETAIL_WIFI_TEMPERATURES__" -> { section = "wifi"; continue }
                "__DETAIL_SENSOR_TEMPERATURES__" -> { section = "sensor"; continue }
            }
            if (line.isEmpty()) continue
            when (section) {
                "cpu" -> Regex("^CPU\\|(.+)\\|(\\d+)$").find(line)?.let {
                    cpuModel = it.groupValues[1].trim().ifEmpty { null }
                    cpuCores = nullableNumber(it.groupValues[2])
                }
                "kernel" -> kernelVersion = line.ifEmpty { null }
                "wifi", "sensor" -> Regex("^(?:WIFI|SENSOR)_TEMP\\|(-?\\d+(?:\\.\\d+)?)$").find(line)?.let {
                    val raw = it.groupValues[1].toDouble()
                    val celsius = if (Math.abs(raw) > 200) raw / 1000 else raw
                    if (celsius.isFinite() && celsius > -50 && celsius < 150) {
                        (if (section == "wifi") wifiTemperaturesC else sensorTemperaturesC).add(celsius)
                    }
                }
            }
        }
        return RouterHardwareDetails(cpuModel, cpuCores, kernelVersion, wifiTemperaturesC, sensorTemperaturesC)
    }

    fun buildFirmwareDeviceInfoCommand(): String = "ubus call system board 2>/dev/null"

    private fun requireFirmwareRemotePath(value: String): String {
        val path = value.trim()
        if (!Regex("^/tmp/manus-[A-Za-z0-9._-]+\\.(?:bin|img)$", RegexOption.IGNORE_CASE).matches(path)) {
            throw IllegalArgumentException("固件临时路径无效。")
        }
        return path
    }

    fun buildFirmwareVerifyCommand(remotePath: String): String {
        val safePath = requireFirmwareRemotePath(remotePath)
        return "if sysupgrade -T ${quoteShell(safePath)} >/tmp/openwrt-app-firmware-check.log 2>&1; " +
            "then printf '__FIRMWARE_VALID__\\n'; else printf '__FIRMWARE_INVALID__\\n'; fi; " +
            "cat /tmp/openwrt-app-firmware-check.log 2>/dev/null; rm -f /tmp/openwrt-app-firmware-check.log"
    }

    fun buildFirmwareUpgradeCommand(remotePath: String, preserveConfig: Boolean): String {
        val safePath = requireFirmwareRemotePath(remotePath)
        return "sysupgrade${if (preserveConfig) "" else " -n"} ${quoteShell(safePath)}"
    }

    fun parseFirmwareDeviceInfo(output: String): FirmwareDeviceInfo {
        return try {
            val start = output.indexOf('{')
            if (start < 0) return FirmwareDeviceInfo(null, null, null, null, null, null, null)
            val board = Json.parseToJsonElement(output.substring(start)) as? JsonObject
                ?: return FirmwareDeviceInfo(null, null, null, null, null, null, null)
            val release = board["release"] as? JsonObject ?: JsonObject(emptyMap())
            fun stringValue(name: String, source: JsonObject = board): String? =
                (source[name] as? JsonPrimitive)?.takeIf { it.isString && it.content.isNotBlank() }?.content
            FirmwareDeviceInfo(
                model = stringValue("model"),
                boardName = stringValue("board_name"),
                distribution = stringValue("distribution", release),
                version = stringValue("version", release),
                revision = stringValue("revision", release),
                target = stringValue("target", release),
                description = stringValue("description", release),
            )
        } catch (error: Exception) {
            FirmwareDeviceInfo(null, null, null, null, null, null, null)
        }
    }

    fun buildBackupCommand(): String =
        "rm -f $BACKUP_REMOTE_PATH; sysupgrade -b $BACKUP_REMOTE_PATH; ls -lh $BACKUP_REMOTE_PATH"

    fun buildRestoreCommand(): String = "sysupgrade -r $BACKUP_REMOTE_PATH"
}
