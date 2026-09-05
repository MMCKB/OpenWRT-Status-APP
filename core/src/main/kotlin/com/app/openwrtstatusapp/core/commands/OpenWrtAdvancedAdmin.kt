package com.app.openwrtstatusapp.core.commands

import kotlinx.serialization.json.JsonPrimitive
import com.app.openwrtstatusapp.core.model.RouterProfile
import com.app.openwrtstatusapp.core.model.RouterStatus
import com.app.openwrtstatusapp.core.ubus.formatBytes
import com.app.openwrtstatusapp.core.ubus.formatLoad
import com.app.openwrtstatusapp.core.ubus.formatUptime
import com.app.openwrtstatusapp.core.ubus.memoryUsagePercent

enum class ProxyServiceId(val label: String, val initName: String, val processHint: String, val luciPath: String, val configPath: String, val logFiles: List<String>, val logPattern: String) {
    OPENCLASH("OpenClash", "openclash", "clash", "admin/services/openclash", "/etc/config/openclash",
        listOf("/tmp/openclash.log", "/tmp/openclash_start.log", "/tmp/openclash_debug.log", "/tmp/run/openclash.log", "/tmp/log/openclash.log"),
        "openclash|clash|mihomo"),
    ADGUARDHOME("AdGuard Home", "AdGuardHome", "AdGuardHome", "admin/services/adguardhome", "/etc/config/AdGuardHome",
        emptyList(), "AdGuardHome|adguard"),
    PASSWALL("PassWall", "passwall", "passwall", "admin/services/passwall", "/etc/config/passwall",
        listOf("/tmp/log/passwall.log"), "passwall"),
    PASSWALL2("PassWall2", "passwall2", "passwall2", "admin/services/passwall2", "/etc/config/passwall2",
        listOf("/tmp/log/passwall2.log"), "passwall2"),
    DDNS("DDNS", "ddns", "ddns", "admin/services/ddns", "/etc/config/ddns",
        listOf("/tmp/ddns.log", "/tmp/log/ddns.log"), "ddns"),
}

enum class RouterLogCategory(val baseCommand: String) {
    SYSTEM("logread"),
    KERNEL("dmesg"),
    DNS("logread | grep -Ei 'dnsmasq|AdGuardHome|adguard|unbound'"),
    DIAL("logread | grep -Ei 'ppp|wan|udhcpc|odhcp|dhcp'"),
    FIREWALL("logread | grep -Ei 'firewall|fw4|nft|miniupnpd'"),
}

typealias PortProtocol = String

data class ProxyServiceState(
    val id: ProxyServiceId,
    val label: String,
    val initName: String,
    val installed: Boolean,
    val running: Boolean,
)

data class PluginConfigSnapshot(
    val id: ProxyServiceId,
    val label: String,
    val configPath: String,
    val exists: Boolean,
    val content: String,
)

data class PluginSettingDefinition(
    val key: String,
    val label: String,
    val kind: String,
    val placeholder: String? = null,
)

data class PluginSettingsSection(
    val section: String,
    val type: String,
    val title: String,
    val values: Map<String, String>,
)

data class PluginSettingsSnapshot(
    val id: ProxyServiceId,
    val label: String,
    val exists: Boolean,
    val sections: List<PluginSettingsSection>,
)

data class DiskUsage(
    val mount: String,
    val totalKb: Double?,
    val usedKb: Double?,
    val availableKb: Double?,
    val usePercent: Double?,
)

data class PingHealth(
    val transmitted: Double?,
    val received: Double?,
    val lossPercent: Double?,
    val averageMs: Double?,
)

data class RouterHealthSnapshot(
    val disks: List<DiskUsage>,
    val temperaturesC: List<Double>,
    val ping: PingHealth?,
    val dnsReachable: Boolean?,
)

data class FirewallZone(
    val section: String,
    val name: String,
    val networks: List<String>,
    val input: String,
    val output: String,
    val forward: String,
)

data class PortForwardRule(
    val section: String,
    val name: String,
    val sourceZone: String,
    val destinationZone: String,
    val destinationIp: String,
    val sourcePort: String,
    val destinationPort: String,
    val protocol: String,
    val enabled: Boolean,
)

data class FirewallForwarding(
    val section: String,
    val sourceZone: String,
    val destinationZone: String,
    val enabled: Boolean,
)

data class FirewallTrafficRule(
    val section: String,
    val name: String,
    val sourceZone: String,
    val destinationZone: String,
    val protocol: String,
    val sourceIp: String,
    val destinationIp: String,
    val sourcePort: String,
    val destinationPort: String,
    val target: String,
    val enabled: Boolean,
)

data class UpnpState(val installed: Boolean, val running: Boolean, val enabled: Boolean)

data class FirewallSnapshot(
    val zones: List<FirewallZone>,
    val forwardings: List<FirewallForwarding>,
    val trafficRules: List<FirewallTrafficRule>,
    val portForwards: List<PortForwardRule>,
    val upnp: UpnpState,
)

data class PortForwardDraft(
    val name: String,
    val sourceZone: String,
    val destinationZone: String,
    val destinationIp: String,
    val sourcePort: String,
    val destinationPort: String,
    val protocol: String,
)

data class FirewallTrafficRuleDraft(
    val name: String,
    val sourceZone: String,
    val destinationZone: String,
    val protocol: String,
    val sourceIp: String,
    val destinationIp: String,
    val sourcePort: String,
    val destinationPort: String,
    val target: String,
)

/** 平移自 lib/openwrt-advanced-admin.ts。 */
object OpenWrtAdvancedAdmin {
    private val quote = Shell::quote
    private val proxyServices = ProxyServiceId.entries

    fun getPluginSettingDefinitions(id: ProxyServiceId): List<PluginSettingDefinition> = when (id) {
        ProxyServiceId.OPENCLASH -> listOf(
            PluginSettingDefinition("enabled", "启用服务", "switch"),
            PluginSettingDefinition("config", "配置订阅或配置文件", "text", "例如 config.yaml"),
            PluginSettingDefinition("en_mode", "运行模式", "text", "redir-host / fake-ip"),
            PluginSettingDefinition("dns_mode", "DNS 模式", "text", "redir-host / fake-ip"),
            PluginSettingDefinition("log_level", "日志等级", "text", "info"),
        )
        ProxyServiceId.ADGUARDHOME -> listOf(
            PluginSettingDefinition("enabled", "启用服务", "switch"),
            PluginSettingDefinition("port", "管理端口", "number", "3000"),
            PluginSettingDefinition("redirect", "DNS 重定向模式", "text", "none"),
        )
        ProxyServiceId.PASSWALL, ProxyServiceId.PASSWALL2 -> listOf(
            PluginSettingDefinition("enabled", "启用服务", "switch"),
            PluginSettingDefinition("tcp_proxy_mode", "TCP 代理模式", "text", "global / gfwlist"),
            PluginSettingDefinition("udp_proxy_mode", "UDP 代理模式", "text", "disable / global"),
            PluginSettingDefinition("dns_shunt", "DNS 分流", "switch"),
        )
        ProxyServiceId.DDNS -> listOf(
            PluginSettingDefinition("enabled", "启用此 DDNS 服务", "switch"),
            PluginSettingDefinition("service_name", "服务商", "text", "cloudflare.com-v4"),
            PluginSettingDefinition("domain", "域名", "text", "example.com"),
            PluginSettingDefinition("username", "用户名或 API 标识", "text"),
            PluginSettingDefinition("password", "密码或 API Token", "password"),
            PluginSettingDefinition("interface", "检测接口", "text", "wan"),
            PluginSettingDefinition("ip_source", "IP 获取方式", "text", "network / web"),
            PluginSettingDefinition("ip_url", "公网 IP 查询地址", "text"),
            PluginSettingDefinition("lookup_host", "解析检查主机", "text"),
            PluginSettingDefinition("check_interval", "检查间隔（分钟）", "number", "10"),
            PluginSettingDefinition("force_interval", "强制更新间隔（小时）", "number", "72"),
        )
    }

    private fun requireIdentifier(value: String, label: String): String {
        val normalized = value.trim()
        if (!Regex("^[A-Za-z0-9_.-]+$").matches(normalized)) {
            throw IllegalArgumentException("${label}格式无效。")
        }
        return normalized
    }

    private fun requireFirewallSection(value: String): String {
        val normalized = value.trim()
        if (Regex("^[A-Za-z0-9_-]+$").matches(normalized) ||
            Regex("^@(redirect|forwarding|rule)\\[\\d+\\]$").matches(normalized)
        ) {
            return normalized
        }
        throw IllegalArgumentException("端口转发规则格式无效。")
    }

    private fun requireIpv4(value: String): String {
        val normalized = value.trim()
        val parts = normalized.split(".")
        if (parts.size != 4 || parts.any { !Regex("^\\d{1,3}$").matches(it) || it.toInt() > 255 }) {
            throw IllegalArgumentException("内网目标必须是有效 IPv4 地址。")
        }
        return normalized
    }

    private fun requirePortSpec(value: String, label: String): String {
        val normalized = value.trim()
        val match = Regex("^(\\d{1,5})(?:-(\\d{1,5}))?$").find(normalized)
            ?: throw IllegalArgumentException("${label}仅支持单个端口或连续端口范围。")
        val start = match.groupValues[1].toInt()
        // TS 的 match[2] 未参与时为 undefined,取 match[1];Kotlin 中是空串。
        val end = match.groupValues[2].ifEmpty { match.groupValues[1] }.toInt()
        if (start < 1 || end > 65535 || start > end) {
            throw IllegalArgumentException("${label}范围应为 1–65535。")
        }
        return normalized
    }

    private fun safeNumber(value: String?): Double? {
        if (value.isNullOrEmpty() || !Regex("^\\d+(?:\\.\\d+)?$").matches(value)) return null
        return value.toDoubleOrNull()?.takeIf { it.isFinite() }
    }

    private fun requireUciSection(value: String): String {
        val normalized = value.trim()
        if (!Regex("^[A-Za-z0-9_-]+$").matches(normalized) &&
            !Regex("^@[A-Za-z0-9_-]+\\[\\d+\\]$").matches(normalized)
        ) {
            throw IllegalArgumentException("配置段名称格式无效。")
        }
        return normalized
    }

    private fun requireUciOption(value: String): String {
        val normalized = value.trim()
        if (!Regex("^[A-Za-z0-9_]+$").matches(normalized)) {
            throw IllegalArgumentException("配置选项名称格式无效。")
        }
        return normalized
    }

    private fun pluginUciPackage(id: ProxyServiceId): String =
        id.configPath.split("/").last()

    // ---------- 插件设置 ----------

    fun buildPluginSettingsSnapshotCommand(id: ProxyServiceId): String {
        val service = id
        val pkg = pluginUciPackage(id)
        val prefix = "__PLUGIN_SETTINGS__|${id.name.lowercase()}"
        val scan = listOf(
            "uci -q show ${quote(pkg)} 2>/dev/null | while IFS= read -r line; do",
            "  case \"\$line\" in",
            "    $pkg.*.*=*) section=\$(printf '%s' \"\$line\" | cut -d. -f2); option=\$(printf '%s' \"\$line\" | cut -d. -f3 | cut -d= -f1); value=\$(printf '%s' \"\$line\" | cut -d= -f2-); printf 'VALUE|%s|%s|%s\\n' \"\$section\" \"\$option\" \"\$value\" ;;",
            "    $pkg.*=*) section=\$(printf '%s' \"\$line\" | cut -d. -f2 | cut -d= -f1); type=\$(printf '%s' \"\$line\" | cut -d= -f2-); printf 'SECTION|%s|%s\\n' \"\$section\" \"\$type\" ;;",
            "  esac",
            "done",
        ).joinToString("\n")
        return "[ -x /etc/init.d/${service.initName} ] || { printf '$prefix|missing\\n'; exit 0; }; " +
            "if [ ! -r ${quote(service.configPath)} ]; then printf '$prefix|missing\\n'; exit 0; fi; " +
            "printf '$prefix|present\\n'; $scan"
    }

    private fun idFromRaw(raw: String): ProxyServiceId =
        ProxyServiceId.entries.first { it.name.lowercase() == raw }

    fun parsePluginSettingsSnapshot(id: ProxyServiceId, output: String): PluginSettingsSnapshot {
        val service = id
        val marker = "__PLUGIN_SETTINGS__|${id.name.lowercase()}|"
        val normalized = output.replace("\r\n", "\n")
        val markerIndex = normalized.indexOf(marker)
        if (markerIndex < 0) throw IllegalArgumentException("服务设置返回格式无效。")
        val lines = normalized.substring(markerIndex).split("\n")
        val markerLineIndex = lines.indexOfFirst { line ->
            listOf("present", "missing").contains(line.trim().substring(marker.length))
        }
        if (markerLineIndex < 0) throw IllegalArgumentException("服务设置返回格式无效。")
        val markerLine = lines[markerLineIndex].trim()
        val exists = markerLine == "${marker}present"
        if (!exists && markerLine != "${marker}missing") {
            throw IllegalArgumentException("服务设置返回格式无效。")
        }
        val sections = linkedMapOf<String, PluginSettingsSection>()
        for (line in lines.drop(markerLineIndex + 1)) {
            Regex("^SECTION\\|(@?[A-Za-z0-9_-]+(?:\\[\\d+\\])?)\\|([A-Za-z0-9_-]+)$").find(line)?.let {
                val (section, type) = it.destructured
                sections[section] = PluginSettingsSection(section, type, section, linkedMapOf())
                return@let
            }
            Regex("^VALUE\\|(@?[A-Za-z0-9_-]+(?:\\[\\d+\\])?)\\|([A-Za-z0-9_]+)\\|(.*)$").find(line)?.let {
                val (section, key, value) = it.destructured
                val current = sections[section] ?: return@let
                val values = current.values.toMutableMap()
                values[key] = OpenWrtAdmin.cleanQuoted(value)
                sections[section] = current.copy(values = values)
            }
        }
        return PluginSettingsSnapshot(id, service.label, exists, sections.values.toList())
    }

    fun buildPluginSettingsApplyCommand(
        id: ProxyServiceId,
        section: String,
        values: Map<String, String>,
    ): String {
        val service = id
        val pkg = pluginUciPackage(id)
        val safeSection = requireUciSection(section)
        val assignments = values.map { (key, rawValue) ->
            val safeKey = requireUciOption(key)
            val value = rawValue.trim()
            if (value.length > 4096 || value.contains("\u0000") || Regex("[\r\n]").containsMatchIn(value)) {
                throw IllegalArgumentException("$key 的值格式无效。")
            }
            if (value.isNotEmpty()) {
                "uci set ${quote("$pkg.$safeSection.$safeKey=$value")}"
            } else {
                "uci -q delete ${quote("$pkg.$safeSection.$safeKey")}"
            }
        }
        if (assignments.isEmpty()) throw IllegalArgumentException("没有可保存的设置项。")
        val backupPath = "${service.configPath}.openwrt-status.bak"
        return "[ -x /etc/init.d/${service.initName} ] || { echo '${service.label} 未安装。'; exit 2; }; " +
            "if [ -f ${quote(service.configPath)} ]; then cp ${quote(service.configPath)} ${quote(backupPath)} || { echo '配置备份失败。'; exit 1; }; fi; " +
            "${assignments.joinToString("; ")}; uci commit ${quote(pkg)} && /etc/init.d/${service.initName} restart"
    }

    // ---------- 代理服务 ----------

    fun buildProxyServiceSnapshotCommand(): String = proxyServices.joinToString("; ") { service ->
        "if [ -x /etc/init.d/${service.initName} ]; then " +
            "if /etc/init.d/${service.initName} status >/dev/null 2>&1 || pgrep -f ${quote(service.processHint)} >/dev/null 2>&1; " +
            "then echo 'PROXY|${service.name.lowercase()}|installed|running|${service.initName}'; " +
            "else echo 'PROXY|${service.name.lowercase()}|installed|stopped|${service.initName}'; fi; " +
            "else echo 'PROXY|${service.name.lowercase()}|missing|stopped|${service.initName}'; fi"
    }

    fun parseProxyServiceStates(output: String): List<ProxyServiceState> {
        val states = proxyServices.associateWith { service ->
            ProxyServiceState(service, service.label, service.initName, installed = false, running = false)
        }.toMutableMap()
        val regex = Regex(
            "^PROXY\\|(openclash|adguardhome|passwall|passwall2|ddns)\\|(installed|missing)\\|(running|stopped)\\|([A-Za-z0-9_.-]+)$",
        )
        for (line in output.split(Regex("\r?\n"))) {
            regex.find(line.trim())?.let {
                val id = idFromRaw(it.groupValues[1])
                val current = states[id] ?: return@let
                states[id] = current.copy(
                    initName = it.groupValues[4],
                    installed = it.groupValues[2] == "installed",
                    running = it.groupValues[3] == "running",
                )
            }
        }
        return proxyServices.mapNotNull { states[it] }
    }

    fun buildProxyServiceActionCommand(id: ProxyServiceId, action: ServiceAction): String {
        val service = id
        return "[ -x /etc/init.d/${service.initName} ] || { echo '${service.label} 未安装。'; exit 2; }; " +
            "/etc/init.d/${service.initName} ${action.name.lowercase()}"
    }

    private fun safeLogLimit(limit: Int, fallback: Int = 100): Int =
        (if (limit >= 0 && limit < Int.MAX_VALUE) limit else fallback).coerceIn(20, 400)

    fun buildPluginLogCommand(id: ProxyServiceId, limit: Int = 100): String {
        val service = id
        val safeLimit = safeLogLimit(limit)
        val systemLog = "(logread) 2>&1 | grep -Ei ${quote(service.logPattern)} | tail -n $safeLimit"
        val fileLogs = service.logFiles.joinToString("; ") { path ->
            "if [ -r ${quote(path)} ]; then printf '%s\\n' ${quote("--- $path ---")}; tail -n $safeLimit ${quote(path)}; __found=1; fi"
        }
        return "__service_log=\$({ __found=0; $fileLogs; if [ \"\$__found\" -eq 0 ]; then $systemLog; fi; } 2>&1); " +
            "if [ -n \"\$__service_log\" ]; then printf '%s\\n' \"\$__service_log\"; " +
            "else printf '${service.label} 暂未找到可读取的日志。请先启动服务、执行一次更新或稍后重试。\\n'; fi"
    }

    fun buildPluginConfigSnapshotCommand(id: ProxyServiceId): String {
        val service = id
        return "if [ -r ${quote(service.configPath)} ]; then " +
            "printf '__PLUGIN_CONFIG__|${service.name.lowercase()}|present\\n'; sed -n '1,2000p' ${quote(service.configPath)}; " +
            "else printf '__PLUGIN_CONFIG__|${service.name.lowercase()}|missing\\n'; fi"
    }

    fun parsePluginConfigSnapshot(id: ProxyServiceId, output: String): PluginConfigSnapshot {
        val service = id
        val normalized = output.replace("\r\n", "\n")
        val marker = "__PLUGIN_CONFIG__|${service.name.lowercase()}|"
        val start = normalized.indexOf(marker)
        if (start < 0) throw IllegalArgumentException("服务配置返回格式无效。")
        val headerEnd = normalized.indexOf("\n", start)
        val header = normalized.substring(start, if (headerEnd < 0) normalized.length else headerEnd).trim()
        val exists = header == "${marker}present"
        if (!exists && header != "${marker}missing") {
            throw IllegalArgumentException("服务配置返回格式无效。")
        }
        return PluginConfigSnapshot(
            id = service,
            label = service.label,
            configPath = service.configPath,
            exists = exists,
            content = if (exists && headerEnd >= 0) normalized.substring(headerEnd + 1).trimEnd() else "",
        )
    }

    fun buildPluginConfigApplyCommand(id: ProxyServiceId, content: String): String {
        val service = id
        if (content.isBlank()) throw IllegalArgumentException("配置内容不能为空。")
        if (content.contains("\u0000")) throw IllegalArgumentException("配置内容不能包含空字符。")
        if (content.length > 256_000) throw IllegalArgumentException("配置内容过大，请通过文件管理处理。")
        val encoded = java.util.Base64.getEncoder().encodeToString(content.toByteArray(Charsets.UTF_8))
        val backupPath = "${service.configPath}.openwrt-status.bak"
        return "[ -x /etc/init.d/${service.initName} ] || { echo '${service.label} 未安装。'; exit 2; }; umask 077; " +
            "temp=\$(mktemp /tmp/openwrt-status-${service.name.lowercase()}-config.XXXXXX) || { echo '无法创建临时配置文件。'; exit 1; }; " +
            "printf %s ${quote(encoded)} | base64 -d > \"\$temp\" || { rm -f \"\$temp\"; echo '配置解码失败。'; exit 1; }; " +
            "if [ -e ${quote(service.configPath)} ]; then cp ${quote(service.configPath)} ${quote(backupPath)} || { rm -f \"\$temp\"; echo '无法备份原配置。'; exit 1; }; fi; " +
            "mv \"\$temp\" ${quote(service.configPath)} && /etc/init.d/${service.initName} restart"
    }

    fun buildProxyServiceConfigUrl(baseUrl: String, id: ProxyServiceId): String {
        val service = id
        val input = baseUrl.trim()
        if (input.isEmpty() || Regex("[\r\n]").containsMatchIn(input)) {
            throw IllegalArgumentException("路由器地址格式不正确。")
        }
        val withProtocol =
            if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(input)) input else "http://$input"
        val match = Regex("^(https?)://([^/?#]+)", RegexOption.IGNORE_CASE).find(withProtocol)
            ?: throw IllegalArgumentException("路由器地址格式不正确。")
        return "${match.groupValues[1].lowercase()}://${match.groupValues[2]}/cgi-bin/luci/${service.luciPath}"
    }

    // ---------- 健康报告 ----------

    fun buildHealthSnapshotCommand(): String =
        "printf '__DISKS__\\n'; df -k 2>/dev/null | awk 'NR>1 && (\$6==\"/overlay\" || \$6==\"/\") { printf \"DISK|%s|%s|%s|%s|%s\\n\", \$6,\$2,\$3,\$4,\$5 }'; " +
            "printf '__TEMPERATURES__\\n'; for path in /sys/class/thermal/thermal_zone*/temp /sys/class/hwmon/hwmon*/temp*_input; do " +
            "[ -r \"\$path\" ] && printf 'TEMP|%s\\n' \"\$(cat \"\$path\" 2>/dev/null)\"; done; " +
            "printf '__PING__\\n'; ping -c 3 -W 2 1.1.1.1 2>&1; printf '__DNS__\\n'; nslookup openwrt.org 127.0.0.1 2>&1"

    fun parseHealthSnapshot(output: String): RouterHealthSnapshot {
        val disks = mutableListOf<DiskUsage>()
        val temperaturesC = mutableListOf<Double>()
        val pingOutput = StringBuilder()
        val dnsOutput = StringBuilder()
        var section = ""
        for (rawLine in output.split(Regex("\r?\n"))) {
            val line = rawLine.trim()
            when (line) {
                "__DISKS__" -> { section = "disks"; continue }
                "__TEMPERATURES__" -> { section = "temperatures"; continue }
                "__PING__" -> { section = "ping"; continue }
                "__DNS__" -> { section = "dns"; continue }
            }
            if (line.isEmpty()) continue
            when (section) {
                "disks" -> Regex("^DISK\\|([^|]+)\\|(\\d+)\\|(\\d+)\\|(\\d+)\\|(\\d+)%$").find(line)?.let {
                    disks.add(
                        DiskUsage(
                            mount = it.groupValues[1],
                            totalKb = safeNumber(it.groupValues[2]),
                            usedKb = safeNumber(it.groupValues[3]),
                            availableKb = safeNumber(it.groupValues[4]),
                            usePercent = safeNumber(it.groupValues[5]),
                        ),
                    )
                }
                "temperatures" -> Regex("^TEMP\\|(-?\\d+(?:\\.\\d+)?)$").find(line)?.let {
                    val raw = it.groupValues[1].toDouble()
                    val celsius = if (Math.abs(raw) > 200) raw / 1000 else raw
                    if (celsius.isFinite() && celsius > -50 && celsius < 150) {
                        temperaturesC.add(Math.round(celsius * 10) / 10.0)
                    }
                }
                "ping" -> pingOutput.append(line).append("\n")
                "dns" -> dnsOutput.append(line).append("\n")
            }
        }
        val packet = Regex(
            "(\\d+)\\s+packets? transmitted,\\s*(\\d+)\\s+(?:packets? )?received.*?(\\d+(?:\\.\\d+)?)%\\s*packet loss",
            RegexOption.IGNORE_CASE,
        ).find(pingOutput.toString())
        val average = Regex("=\\s*[\\d.]+\\/([\\d.]+)\\/[\\d.]+(?:\\/[\\d.]+)?\\s*ms", RegexOption.IGNORE_CASE)
            .find(pingOutput.toString())
        val ping = packet?.let {
            PingHealth(
                transmitted = safeNumber(it.groupValues[1]),
                received = safeNumber(it.groupValues[2]),
                lossPercent = safeNumber(it.groupValues[3]),
                averageMs = average?.let { avg -> safeNumber(avg.groupValues[1]) },
            )
        }
        val dnsText = dnsOutput.toString()
        val dnsReachable = if (dnsText.isEmpty()) {
            null
        } else {
            !Regex(
                "(connection refused|server can't find|not found|failed|timed out|no servers could be reached)",
                RegexOption.IGNORE_CASE,
            ).containsMatchIn(dnsText) &&
                Regex("(?:address|name):", RegexOption.IGNORE_CASE).containsMatchIn(dnsText)
        }
        return RouterHealthSnapshot(disks, temperaturesC.toSet().toList(), ping, dnsReachable)
    }

    fun buildRouterLogCommand(category: RouterLogCategory, limit: Int = 160, filter: String = ""): String {
        val safeLimit = safeLogLimit(limit, 160)
        val query = filter.trim()
        if (query.length > 80 || Regex("[\r\n]").containsMatchIn(query)) {
            throw IllegalArgumentException("日志筛选词最多 80 个字符，且不能包含换行。")
        }
        val filterCommand = if (query.isNotEmpty()) " | grep -F -- ${quote(query)}" else ""
        return "(${category.baseCommand}) 2>&1$filterCommand | tail -n $safeLimit"
    }

    fun parseRouterLogLines(output: String): List<String> =
        output.split(Regex("\r?\n")).map { it.trimEnd() }.filter { it.isNotEmpty() }

    // ---------- 防火墙 ----------

    fun buildFirewallSnapshotCommand(): String =
        "printf '__FIREWALL__\\n'; uci show firewall 2>/dev/null; printf '__UPNP__\\n'; " +
            "if [ -x /etc/init.d/miniupnpd ]; then if /etc/init.d/miniupnpd status >/dev/null 2>&1 || pgrep -x miniupnpd >/dev/null 2>&1; " +
            "then running=running; else running=stopped; fi; " +
            "enabled=\$(uci -q get miniupnpd.config.enabled 2>/dev/null || echo 0); " +
            "echo \"UPNP|installed|\$running|\$enabled\"; else echo 'UPNP|missing|stopped|0'; fi"

    private fun readFirewallSections(output: String) =
        OpenWrtAdmin.parseUciSections("firewall", output, "__FIREWALL__", setOf("__UPNP__"))

    private fun firstValue(section: OpenWrtAdmin.UciSectionValues, property: String, fallback: String = "未设置"): String =
        section.first(property)?.ifEmpty { null } ?: fallback

    fun parseFirewallSnapshot(output: String): FirewallSnapshot {
        val sections = readFirewallSections(output)
        val zones = mutableListOf<FirewallZone>()
        val forwardings = mutableListOf<FirewallForwarding>()
        val trafficRules = mutableListOf<FirewallTrafficRule>()
        val portForwards = mutableListOf<PortForwardRule>()
        for ((section, value) in sections) {
            when (value.type) {
                "zone" -> zones.add(
                    FirewallZone(
                        section = section,
                        name = firstValue(value, "name", section),
                        networks = value.values["network"] ?: emptyList(),
                        input = firstValue(value, "input"),
                        output = firstValue(value, "output"),
                        forward = firstValue(value, "forward"),
                    ),
                )
                "redirect" -> portForwards.add(
                    PortForwardRule(
                        section = section,
                        name = firstValue(value, "name", section),
                        sourceZone = firstValue(value, "src"),
                        destinationZone = firstValue(value, "dest"),
                        destinationIp = firstValue(value, "dest_ip"),
                        sourcePort = firstValue(value, "src_dport"),
                        destinationPort = firstValue(value, "dest_port"),
                        protocol = firstValue(value, "proto", "tcp udp"),
                        enabled = firstValue(value, "enabled", "1") != "0",
                    ),
                )
                "forwarding" -> forwardings.add(
                    FirewallForwarding(
                        section = section,
                        sourceZone = firstValue(value, "src"),
                        destinationZone = firstValue(value, "dest"),
                        enabled = firstValue(value, "enabled", "1") != "0",
                    ),
                )
                "rule" -> {
                    val target = firstValue(value, "target", "ACCEPT").uppercase()
                    if (target !in listOf("ACCEPT", "REJECT", "DROP")) continue
                    trafficRules.add(
                        FirewallTrafficRule(
                            section = section,
                            name = firstValue(value, "name", section),
                            sourceZone = firstValue(value, "src", "任意"),
                            destinationZone = firstValue(value, "dest", "任意"),
                            protocol = firstValue(value, "proto", "任意"),
                            sourceIp = firstValue(value, "src_ip", ""),
                            destinationIp = firstValue(value, "dest_ip", ""),
                            sourcePort = firstValue(value, "src_port", ""),
                            destinationPort = firstValue(value, "dest_port", ""),
                            target = target,
                            enabled = firstValue(value, "enabled", "1") != "0",
                        ),
                    )
                }
            }
        }
        val upnpMatch = Regex("^UPNP\\|(installed|missing)\\|(running|stopped)\\|([^\\r\\n|]+)$", RegexOption.MULTILINE)
            .find(output)
        return FirewallSnapshot(
            zones = zones.sortedBy { it.name },
            forwardings = forwardings.sortedBy { "${it.sourceZone}:${it.destinationZone}" },
            trafficRules = trafficRules.sortedBy { it.name },
            portForwards = portForwards.sortedBy { it.name },
            upnp = UpnpState(
                installed = upnpMatch?.groupValues?.get(1) == "installed",
                running = upnpMatch?.groupValues?.get(2) == "running",
                enabled = upnpMatch?.groupValues?.get(3) == "1",
            ),
        )
    }

    fun buildFirewallForwardingToggleCommand(section: String, enabled: Boolean): String {
        val safeSection = requireFirewallSection(section)
        return "uci set firewall.$safeSection.enabled='${if (enabled) "1" else "0"}'; uci commit firewall; /etc/init.d/firewall reload"
    }

    fun buildFirewallRuleToggleCommand(section: String, enabled: Boolean): String =
        buildFirewallForwardingToggleCommand(section, enabled)

    fun buildFirewallRuleDeleteCommand(section: String): String {
        val safeSection = requireFirewallSection(section)
        return "uci -q delete firewall.$safeSection; uci commit firewall; /etc/init.d/firewall reload"
    }

    private fun buildFirewallRuleWriteCommand(
        section: String,
        draft: FirewallTrafficRuleDraft,
        create: Boolean,
    ): String {
        val name = draft.name.trim()
        if (name.isEmpty() || name.length > 48 || Regex("[\r\n]").containsMatchIn(name)) {
            throw IllegalArgumentException("规则名称应为 1–48 个字符，且不能包含换行。")
        }
        val sourceZone = draft.sourceZone.trim().ifEmpty { null }?.let { requireIdentifier(it, "来源区域") } ?: ""
        val destinationZone = draft.destinationZone.trim().ifEmpty { null }?.let { requireIdentifier(it, "目标区域") } ?: ""
        if (draft.protocol !in listOf("tcp", "udp", "tcp udp")) throw IllegalArgumentException("通信协议无效。")
        if (draft.target !in listOf("ACCEPT", "REJECT", "DROP")) throw IllegalArgumentException("通信规则目标无效。")
        val sourcePort = draft.sourcePort.trim().ifEmpty { null }?.let { requirePortSpec(it, "来源端口") } ?: ""
        val destinationPort = draft.destinationPort.trim().ifEmpty { null }?.let { requirePortSpec(it, "目标端口") } ?: ""
        fun optionalIp(value: String, label: String): String {
            val normalized = value.trim()
            if (normalized.isEmpty()) return ""
            if (!Regex("^(?:\\d{1,3}\\.){3}\\d{1,3}(?:\\/\\d{1,2})?$").matches(normalized)) {
                throw IllegalArgumentException("${label}必须为 IPv4 或 CIDR。")
            }
            val (ip, mask) = normalized.split("/").let { it[0] to it.getOrNull(1) }
            requireIpv4(ip)
            if (mask != null && (mask.toInt() < 0 || mask.toInt() > 32)) {
                throw IllegalArgumentException("${label}CIDR 范围应为 0–32。")
            }
            return normalized
        }
        val sourceIp = optionalIp(draft.sourceIp, "来源地址")
        val destinationIp = optionalIp(draft.destinationIp, "目标地址")
        val values = mutableListOf(
            if (create) "uci set firewall.$section='rule'"
            else "uci get firewall.$section >/dev/null 2>&1 || { echo '未找到要编辑的通信规则。'; exit 2; }",
            "uci set firewall.$section.name=${quote(name)}",
            "uci set firewall.$section.proto=${quote(draft.protocol)}",
            "uci set firewall.$section.target=${quote(draft.target)}",
        )
        if (create) values.add("uci set firewall.$section.enabled='1'")
        values.addAll(
            listOf(
                if (sourceZone.isNotEmpty()) "uci set firewall.$section.src=${quote(sourceZone)}"
                else "uci -q delete firewall.$section.src",
                if (destinationZone.isNotEmpty()) "uci set firewall.$section.dest=${quote(destinationZone)}"
                else "uci -q delete firewall.$section.dest",
                if (sourceIp.isNotEmpty()) "uci set firewall.$section.src_ip=${quote(sourceIp)}"
                else "uci -q delete firewall.$section.src_ip",
                if (destinationIp.isNotEmpty()) "uci set firewall.$section.dest_ip=${quote(destinationIp)}"
                else "uci -q delete firewall.$section.dest_ip",
                if (sourcePort.isNotEmpty()) "uci set firewall.$section.src_port=${quote(sourcePort)}"
                else "uci -q delete firewall.$section.src_port",
                if (destinationPort.isNotEmpty()) "uci set firewall.$section.dest_port=${quote(destinationPort)}"
                else "uci -q delete firewall.$section.dest_port",
                "uci commit firewall",
                "/etc/init.d/firewall reload",
            ),
        )
        return values.joinToString("; ")
    }

    fun buildFirewallRuleCreateCommand(draft: FirewallTrafficRuleDraft): String =
        buildFirewallRuleWriteCommand("openwrt_app_rule_" + java.lang.Long.toString(System.currentTimeMillis(), 36), draft, true)

    fun buildFirewallRuleUpdateCommand(section: String, draft: FirewallTrafficRuleDraft): String =
        buildFirewallRuleWriteCommand(requireFirewallSection(section), draft, false)

    fun buildPortForwardToggleCommand(section: String, enabled: Boolean): String {
        val safeSection = requireFirewallSection(section)
        return "uci set firewall.$safeSection.enabled='${if (enabled) "1" else "0"}'; uci commit firewall; /etc/init.d/firewall reload"
    }

    fun buildPortForwardDeleteCommand(section: String): String {
        val safeSection = requireFirewallSection(section)
        return "uci -q delete firewall.$safeSection; uci commit firewall; /etc/init.d/firewall reload"
    }

    private fun buildPortForwardWriteCommand(
        section: String,
        draft: PortForwardDraft,
        create: Boolean,
    ): String {
        val name = draft.name.trim()
        if (name.isEmpty() || name.length > 48 || Regex("[\r\n]").containsMatchIn(name)) {
            throw IllegalArgumentException("规则名称应为 1–48 个字符，且不能包含换行。")
        }
        val sourceZone = requireIdentifier(draft.sourceZone, "来源区域")
        val destinationZone = requireIdentifier(draft.destinationZone, "目标区域")
        val destinationIp = requireIpv4(draft.destinationIp)
        val sourcePort = requirePortSpec(draft.sourcePort, "外部端口")
        val destinationPort = requirePortSpec(draft.destinationPort, "内部端口")
        if (draft.protocol !in listOf("tcp", "udp", "tcp udp")) throw IllegalArgumentException("端口协议无效。")
        return (if (create) "uci set firewall.$section='redirect'"
        else "uci get firewall.$section >/dev/null 2>&1 || { echo '未找到要编辑的端口转发规则。'; exit 2; }") +
            "; uci set firewall.$section.name=${quote(name)}; uci set firewall.$section.src=${quote(sourceZone)}; " +
            "uci set firewall.$section.dest=${quote(destinationZone)}; uci set firewall.$section.proto=${quote(draft.protocol)}; " +
            "uci set firewall.$section.src_dport=${quote(sourcePort)}; uci set firewall.$section.dest_ip=${quote(destinationIp)}; " +
            "uci set firewall.$section.dest_port=${quote(destinationPort)}; uci set firewall.$section.target='DNAT'; " +
            (if (create) "uci set firewall.$section.enabled='1'; " else "") +
            "uci commit firewall; /etc/init.d/firewall reload"
    }

    fun buildPortForwardCreateCommand(draft: PortForwardDraft): String =
        buildPortForwardWriteCommand("openwrt_app_pf_" + java.lang.Long.toString(System.currentTimeMillis(), 36), draft, true)

    fun buildPortForwardUpdateCommand(section: String, draft: PortForwardDraft): String =
        buildPortForwardWriteCommand(requireFirewallSection(section), draft, false)

    fun buildUpnpActionCommand(action: ServiceAction): String =
        "[ -x /etc/init.d/miniupnpd ] || { echo 'UPnP 服务未安装。'; exit 2; }; /etc/init.d/miniupnpd ${action.name.lowercase()}"

    // ---------- 批量操作 ----------

    fun buildBatchRouterDiagnosticCommand(): String =
        "printf '__PING__\\n'; ping -c 2 -W 2 1.1.1.1 2>&1; printf '__DNS__\\n'; nslookup openwrt.org 127.0.0.1 2>&1; printf '__UPTIME__\\n'; uptime 2>&1"

    fun buildBatchConfigBackupCommand(batchId: String): Pair<String, String> {
        val safeId = requireIdentifier(batchId, "备份批次")
        val remotePath = "/tmp/openwrt-app-$safeId.tar.gz"
        return remotePath to "rm -f ${quote(remotePath)}; sysupgrade -b ${quote(remotePath)}; " +
            "test -s ${quote(remotePath)} && echo 'BACKUP_READY'"
    }

    // ---------- 健康报告 Markdown ----------

    private fun markdownValue(value: String?): String =
        if (!value.isNullOrBlank()) value.replace(Regex("[|\r\n]"), " ") else "未报告"

    fun buildRouterHealthReportMarkdown(
        profile: RouterProfile,
        status: RouterStatus?,
        health: RouterHealthSnapshot?,
        services: List<ProxyServiceState> = emptyList(),
    ): String {
        val system = status?.system
        val memoryPercent = memoryUsagePercent(system)
        val disks = if (!health?.disks.isNullOrEmpty()) {
            health.disks.joinToString("；") { disk ->
                "${disk.mount}: ${disk.usePercent ?: "—"}%（可用 ${
                    if (disk.availableKb == null) "—" else formatBytes(disk.availableKb * 1024)
                }）"
            }
        } else "未报告"
        val temperature = if (!health?.temperaturesC.isNullOrEmpty()) {
            health.temperaturesC.joinToString("、") { "$it °C" }
        } else "未报告"
        val ping = health?.ping?.let {
            "${it.lossPercent ?: "—"}% 丢包，平均 ${it.averageMs ?: "—"} ms"
        } ?: "未报告"
        val servicesText = if (services.isNotEmpty()) {
            services.joinToString("；") { service ->
                "${service.label}：${if (service.installed) (if (service.running) "运行中" else "已停止") else "未安装"}"
            }
        } else "未检测"
        return "# ${markdownValue(profile.name)} 健康报告\n\n" +
            "生成时间：${java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy/M/d HH:mm:ss"))}\n\n" +
            "## 系统\n\n| 指标 | 状态 |\n|---|---|\n" +
            "| 路由器 | ${markdownValue(system?.hostname)} |\n" +
            "| 型号 | ${markdownValue(system?.model)} |\n" +
            "| 固件 | ${markdownValue(system?.firmware)} |\n" +
            "| 运行时间 | ${formatUptime(system?.uptimeSeconds)} |\n" +
            "| 系统负载 | ${formatLoad(system?.load)} |\n" +
            "| 内存使用 | ${memoryPercent ?: "未报告"}% |\n".replace("未报告%", "未报告") +
            "| 存储 | $disks |\n" +
            "| 温度 | $temperature |\n\n" +
            "## 网络\n\n| 指标 | 状态 |\n|---|---|\n" +
            "| 公网连通性（1.1.1.1） | $ping |\n" +
            "| 本地 DNS 解析 | ${health?.dnsReachable?.let { if (it) "正常" else "失败" } ?: "未报告"} |\n" +
            "| 在线接口 | ${status?.interfaces?.count { it.up } ?: 0}/${status?.interfaces?.size ?: 0} |\n\n" +
            "## 服务\n\n$servicesText\n"
    }
}
