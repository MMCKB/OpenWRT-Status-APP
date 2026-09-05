package com.app.openwrtstatusapp.core.commands

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/** 平移自 lib/openwrt-luci-system.ts 的快照解析函数。 */
object LuciSystemParsers {
    private val shell = Shell

    fun parseStartupServices(output: String): List<StartupService> {
        val found = linkedMapOf<String, StartupService>()
        val regex = Regex("^STARTUP\\|([^|]+)\\|(enabled|disabled)$")
        for (line in output.split(Regex("\r?\n"))) {
            val match = regex.find(line) ?: continue
            if (shell.serviceRegex().matches(match.groupValues[1])) {
                found[match.groupValues[1]] =
                    StartupService(match.groupValues[1], match.groupValues[2] == "enabled")
            }
        }
        return found.values.sortedBy { it.name }
    }

    fun parseLedSettings(output: String): List<LedSetting> =
        shell.parseRecords("LED", output).map { (section, value) ->
            val trigger = value["trigger"] ?: "none"
            LedSetting(
                section = section,
                name = value["name"] ?: section,
                sysfs = value["sysfs"] ?: "",
                trigger = trigger,
                delayOn = if (trigger == "timer") value["delayon"] ?: "1000" else "",
                delayOff = if (trigger == "timer") value["delayoff"] ?: "1000" else "",
                netdevDevice = if (trigger == "netdev") value["dev"] ?: "" else "",
                netdevMode = if (trigger == "netdev") value["mode"] ?: "link" else "",
            )
        }

    fun parseLedCapabilities(output: String): LedCapabilities {
        val devices = sortedSetOf<String>()
        val triggers = sortedSetOf<String>()
        val networkDevices = sortedSetOf<String>()
        val knownTriggers = setOf("default-on", "heartbeat", "netdev", "none", "timer")
        val regex = Regex("^LEDCAP\\|(device|trigger|netdev)\\|([^|]+)$")
        for (line in output.split(Regex("\r?\n"))) {
            val match = regex.find(line) ?: continue
            val value = match.groupValues[2]
            if (!shell.ledOptionRegex().matches(value)) continue
            when (match.groupValues[1]) {
                "device" -> devices.add(value)
                "netdev" -> networkDevices.add(value)
                else -> if (value in knownTriggers) triggers.add(value)
            }
        }
        return LedCapabilities(devices.toList(), triggers.toList(), networkDevices.toList())
    }

    fun parseMountPoints(output: String): List<MountPoint> =
        shell.parseRecords("MOUNT", output).map { (section, value) ->
            MountPoint(
                section = section,
                target = value["target"] ?: "",
                device = (value["device"] ?: value["uuid"] ?: "").ifEmpty { value["uuid"] ?: "" },
                fstype = value["fstype"] ?: "auto",
                enabled = value["enabled"] != "0",
                enabledFsck = value["enabled_fsck"] == "1",
            )
        }

    fun parseMountedFileSystems(output: String): List<MountedFileSystem> {
        val regex = Regex("^MOUNTED\\|([^|]+)\\|([^|]+)\\|([^|]+)$")
        return output.split(Regex("\r?\n")).mapNotNull { line ->
            regex.find(line)?.let {
                MountedFileSystem(it.groupValues[1], it.groupValues[2], it.groupValues[3])
            }
        }
    }

    fun parseSwapPartitions(output: String): List<SwapPartition> {
        val regex = Regex("^SWAP\\|([^|]+)$")
        return output.split(Regex("\r?\n")).mapNotNull { line ->
            regex.find(line)?.let { SwapPartition(it.groupValues[1]) }
        }
    }

    fun parseSshAccessSettings(output: String): SshAccessSettings {
        val values = shell.parseValueMap("SSH", output)
        val instances = shell.parseRecords("SSHINSTANCE", output).map { (section, value) ->
            DropbearInstance(
                section = section,
                port = (value["Port"] ?: value["port"] ?: "22").ifEmpty { "22" },
                listenInterface = value["Interface"] ?: value["interface"] ?: "",
                passwordAuth = shell.enabled(value["PasswordAuth"] ?: value["password"]),
                rootPasswordAuth = shell.enabled(value["RootPasswordAuth"] ?: value["rootpassword"]),
                gatewayPorts = shell.enabled(value["GatewayPorts"] ?: value["gatewayports"]),
                enabled = value["enable"] != "0",
            )
        }
        val primary = instances.firstOrNull()
        return SshAccessSettings(
            installed = values["installed"] == "yes",
            port = primary?.port?.takeIf { it.isNotEmpty() } ?: values["port"] ?: "22",
            passwordAuth = primary?.passwordAuth ?: shell.enabled(values["password"]),
            rootPasswordAuth = primary?.rootPasswordAuth ?: shell.enabled(values["rootpassword"]),
            instances = instances,
        )
    }

    fun parseSshAuthorizedKeys(output: String): List<SshAuthorizedKey> {
        val typeRegex = Regex("^[A-Za-z0-9@._+-]{2,100}$")
        val materialRegex = Regex("^[A-Za-z0-9+/=]{16,20000}$")
        return output.split(Regex("\r?\n")).mapNotNull { line ->
            if (!line.startsWith("SSHKEY|")) return@mapNotNull null
            val value = line.substring(7).trim()
            val parts = value.split(Regex("\\s+"))
            val type = parts.getOrElse(0) { "" }
            val material = parts.getOrElse(1) { "" }
            val comment = parts.drop(2).joinToString(" ")
            if (!typeRegex.matches(type) || !materialRegex.matches(material)) return@mapNotNull null
            SshAuthorizedKey(value, type, comment)
        }
    }

    fun parseApkRepositoryKeys(output: String): List<ApkRepositoryKey> {
        val regex = Regex("^APKKEY\\|([^|]+)\\|(\\d+)$")
        return output.split(Regex("\r?\n")).mapNotNull { line ->
            val match = regex.find(line) ?: return@mapNotNull null
            if (!shell.keyNameRegex().matches(match.groupValues[1])) return@mapNotNull null
            ApkRepositoryKey(match.groupValues[1], match.groupValues[2].toLong())
        }
    }

    fun parseUhttpdSettings(output: String): UhttpdSettings {
        val values = shell.parseValueMap("UHTTPD", output)
        val first = shell.parseRecords("UHTTPD", output).entries.firstOrNull()
        val section = first?.key ?: "@uhttpd[0]"
        val settings: Map<String, String> = first?.value ?: emptyMap()
        return UhttpdSettings(
            installed = values["installed"] == "yes",
            section = section,
            httpPorts = settings["listen_http"] ?: "0.0.0.0:80",
            httpsPorts = settings["listen_https"] ?: "0.0.0.0:443",
            redirectHttps = shell.enabled(settings["redirect_https"]),
        )
    }

    fun parseLuciThemes(output: String): List<LuciTheme> {
        val themes = linkedMapOf<String, LuciTheme>()
        val regex = Regex("^THEME\\|([A-Za-z0-9_-]{1,64})\\|(active|inactive)$")
        for (line in output.split(Regex("\r?\n"))) {
            val match = regex.find(line) ?: continue
            themes[match.groupValues[1]] =
                LuciTheme(match.groupValues[1], match.groupValues[2] == "active")
        }
        return themes.values.sortedWith(
            compareByDescending<LuciTheme> { it.active }.thenBy { it.name },
        )
    }

    fun parseNetworkInterfaceSettings(output: String): List<NetworkInterfaceSettings> =
        shell.parseRecords("IFACE", output).map { (section, value) ->
            NetworkInterfaceSettings(
                section = section,
                proto = value["proto"] ?: "none",
                device = (value["device"] ?: value["ifname"] ?: "").ifEmpty { value["ifname"] ?: "" },
                ipaddr = value["ipaddr"] ?: "",
                netmask = value["netmask"] ?: "",
                gateway = value["gateway"] ?: "",
                dns = value["dns"] ?: "",
                auto = value["auto"] != "0",
                forceLink = shell.enabled(value["force_link"]),
                defaultRoute = value["defaultroute"] != "0",
                useCustomDns = value["peerdns"] == "0",
                dnsMetric = value["dns_metric"] ?: "",
                metric = value["metric"] ?: "",
                mptcp = value["mptcp"] ?: "off",
                ip4Table = value["ip4table"] ?: "",
                ip6Table = value["ip6table"] ?: "",
                delegate = value["delegate"] != "0",
                ip6Assign = value["ip6assign"] ?: "",
                ip6Class = value["ip6class"] ?: "",
                ip6Hint = value["ip6hint"] ?: "",
                ip6IfaceId = value["ip6ifaceid"] ?: "",
                ip6Weight = value["ip6weight"] ?: "",
                firewallZone = "",
            )
        }

    fun parseNetworkInterfaceOptions(output: String): NetworkInterfaceOptions {
        val protocols = sortedSetOf("dhcp", "static", "pppoe", "none", "unmanaged")
        val devices = sortedSetOf<String>()
        val zones = linkedMapOf<String, String>()
        val optionRegex = Regex("^IFOPTION\\|(protocol|device)\\|([^|]+)$")
        val zoneRegex = Regex("^IFZONE\\|([^|]+)\\|([^|]+)$")
        for (line in output.split(Regex("\r?\n"))) {
            optionRegex.find(line)?.let { option ->
                val value = option.groupValues[2]
                if (shell.ledOptionRegex().matches(value)) {
                    if (option.groupValues[1] == "protocol") protocols.add(value) else devices.add(value)
                }
                return@let
            }
            zoneRegex.find(line)?.let { zone ->
                val section = zone.groupValues[1]
                val name = zone.groupValues[2]
                if (shell.sectionRegex().matches(section) && shell.valueRegex().matches(name)) {
                    zones[section] = name
                }
            }
        }
        return NetworkInterfaceOptions(
            protocols = protocols.toList(),
            devices = devices.toList(),
            firewallZones = zones.entries.map { FirewallZoneRef(it.key, it.value) }
                .sortedBy { it.name },
        )
    }

    fun parseNetworkInterfaceStatus(output: String): List<NetworkInterfaceStatus> {
        val marker = Regex("\r?\nIFMAC\\|").find(output)?.range?.first ?: -1
        val jsonSource = if (marker >= 0) output.substring(0, marker) else output
        val start = jsonSource.indexOf('{')
        val end = jsonSource.lastIndexOf('}')
        if (start < 0 || end < start) return emptyList()
        val parsed = try {
            Json.parseToJsonElement(jsonSource.substring(start, end + 1))
        } catch (error: Exception) {
            return emptyList()
        } as? JsonObject ?: return emptyList()
        val interfaces = parsed["interface"] as? JsonArray ?: return emptyList()
        val macByDevice = mutableMapOf<String, String>()
        val macRegex = Regex("^IFMAC\\|([^|]+)\\|([0-9A-Fa-f:]{17})$")
        for (line in output.split(Regex("\r?\n"))) {
            macRegex.find(line)?.let {
                macByDevice[it.groupValues[1]] = it.groupValues[2]
            }
        }
        return interfaces.mapNotNull { entry ->
            val value = entry as? JsonObject ?: return@mapNotNull null
            val section = (value["interface"] as? JsonPrimitive)
                ?.takeIf { it.isString && shell.sectionRegex().matches(it.content) }?.content
                ?: return@mapNotNull null
            val device = (value["l3_device"] as? JsonPrimitive)?.takeIf { it.isString }?.content
                ?: (value["device"] as? JsonPrimitive)?.takeIf { it.isString }?.content
                ?: ""
            NetworkInterfaceStatus(
                section = section,
                proto = (value["proto"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "unknown",
                device = device,
                ipv4 = parseAddressList(value["ipv4-address"]),
                ipv6 = parseAddressList(value["ipv6-address"]),
                mac = if (device.isNotEmpty()) macByDevice[device] ?: "" else "",
                up = value["up"] == JsonPrimitive(true),
                uptimeSeconds = (value["uptime"] as? JsonPrimitive)
                    ?.takeIf { !it.isString && it.doubleOrNull?.isFinite() == true }?.doubleOrNull?.toLong(),
            )
        }
    }

    private fun parseAddressList(value: kotlinx.serialization.json.JsonElement?): List<String> {
        val array = value as? JsonArray ?: return emptyList()
        return array.mapNotNull { entry ->
            ((entry as? JsonObject)?.get("address") as? JsonPrimitive)
                ?.takeIf { it.isString && it.content.isNotEmpty() }?.content
        }
    }

    fun parseNetworkDeviceSettings(output: String): List<NetworkDeviceSettings> =
        shell.parseRecords("DEVICE", output).map { (section, value) ->
            NetworkDeviceSettings(
                section = section,
                name = value["name"] ?: section,
                type = value["type"] ?: "",
                macaddr = value["macaddr"] ?: "",
                mtu = value["mtu"] ?: "",
                ipv6 = value["ipv6"] != "0",
            )
        }

    fun parseNetworkGlobalSettings(output: String): NetworkGlobalSettings {
        val entry = shell.parseRecords("GLOBAL", output).entries.firstOrNull()
        val section = entry?.key ?: "globals"
        val value: Map<String, String> = entry?.value ?: emptyMap()
        return NetworkGlobalSettings(
            section = section,
            ulaPrefix = value["ula_prefix"] ?: "",
            packetSteering = shell.enabled(value["packet_steering"]),
        )
    }

    fun parseCronEntries(output: String): List<String> =
        output.split(Regex("\r?\n"))
            .filter { it.startsWith("CRON|") }
            .map { it.substring(5) }
}
