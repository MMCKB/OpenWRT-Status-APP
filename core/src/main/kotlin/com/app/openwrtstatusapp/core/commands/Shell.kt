package com.app.openwrtstatusapp.core.commands

/**
 * 平移自 lib/openwrt-luci-system.ts 的安全基础层:
 * 单引号 shell 引用、白名单校验与快照输出解析工具。
 */
object Shell {
    const val SAFE_SECTION = "^[A-Za-z0-9_@.\\-\\[\\]]{1,64}$"
    const val SAFE_SERVICE = "^[A-Za-z0-9_.-]{1,80}$"
    const val SAFE_VALUE = "^[A-Za-z0-9_./:@,+\\-\\[\\] ]{0,240}$"
    const val SAFE_CRON_FIELD = "^[0-9*/?,\\- ]{1,50}$"
    const val SAFE_KEY_NAME = "^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$"
    const val SAFE_LED_OPTION = "^[A-Za-z0-9_.:-]{1,128}$"

    fun sectionRegex() = Regex(SAFE_SECTION)
    fun serviceRegex() = Regex(SAFE_SERVICE)
    fun valueRegex() = Regex(SAFE_VALUE)
    fun cronFieldRegex() = Regex(SAFE_CRON_FIELD)
    fun keyNameRegex() = Regex(SAFE_KEY_NAME)
    fun ledOptionRegex() = Regex(SAFE_LED_OPTION)

    /** 单引号引用;内部单引号按 POSIX 规则折断为 '\''。 */
    fun quote(value: String): String = "'${value.replace("'", "'\\''")}'"

    fun uciSet(path: String, value: String): String = "uci set ${quote("$path=$value")}"

    fun uciDelete(path: String): String = "uci -q delete ${quote(path)}"

    fun assertSection(section: String) {
        if (!sectionRegex().matches(section)) throw IllegalArgumentException("配置段标识不合法。")
    }

    fun assertValue(value: String, label: String) {
        if (!valueRegex().matches(value)) throw IllegalArgumentException("${label}包含不支持的字符。")
    }

    fun assertPort(value: String, label: String) {
        if (!Regex("^[1-9]\\d{0,4}$").matches(value) || value.toInt() > 65535) {
            throw IllegalArgumentException("${label}必须为 1-65535。")
        }
    }

    fun enabled(value: String?): Boolean =
        listOf("1", "true", "yes", "on", "enabled").contains(value?.trim()?.lowercase())

    /** 解析 `PREFIX|section|key|value` 形式的快照输出,等价 TS 版 parseRecords。 */
    fun parseRecords(prefix: String, output: String): Map<String, MutableMap<String, String>> {
        val rows = linkedMapOf<String, MutableMap<String, String>>()
        val regex = Regex("^$prefix\\|([^|]+)\\|([^|]+)\\|(.*)$")
        for (line in output.split(Regex("\r?\n"))) {
            val match = regex.find(line) ?: continue
            val section = match.groupValues[1]
            if (!sectionRegex().matches(section)) continue
            rows.getOrPut(section) { mutableMapOf() }[match.groupValues[2]] = match.groupValues[3]
        }
        return rows
    }

    /** 解析 `PREFIX|key|value` 形式的快照输出,等价 TS 版 parseValueMap。 */
    fun parseValueMap(prefix: String, output: String): Map<String, String> {
        val values = linkedMapOf<String, String>()
        val regex = Regex("^$prefix\\|([^|]+)\\|(.*)$")
        for (line in output.split(Regex("\r?\n"))) {
            val match = regex.find(line) ?: continue
            values[match.groupValues[1]] = match.groupValues[2]
        }
        return values
    }
}
