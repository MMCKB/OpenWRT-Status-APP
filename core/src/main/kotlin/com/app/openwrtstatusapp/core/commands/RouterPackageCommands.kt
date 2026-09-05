package com.app.openwrtstatusapp.core.commands

/** 平移自 lib/router-package-commands.ts(OpenWrt 25.12 apk 包管理)。 */
object RouterPackageCommands {
    const val APK_CUSTOM_FEEDS_SOURCE = "/etc/apk/repositories.d/customfeeds.list"
    const val APK_DIST_FEEDS_SOURCE = "/etc/apk/repositories.d/distfeed"
    const val APK_DIST_FEEDS_FALLBACK_SOURCE = "/etc/apk/repositories.d/distfeeds.list"

    data class ApkPackage(
        val name: String,
        val version: String,
        val description: String,
        val installed: Boolean,
        val status: String? = null,
        val architecture: String? = null,
    )

    data class ApkRepository(
        val line: Int,
        val url: String,
        val enabled: Boolean,
        val source: String? = null,
        val deleted: Boolean? = null,
    )

    private fun quotePackageName(name: String): String {
        val sanitized = name.trim().replace(Regex("[^a-zA-Z0-9+._:@/-]"), "")
        if (sanitized.isEmpty()) throw IllegalArgumentException("软件包名称无效。")
        return "\"$sanitized\""
    }

    private fun quoteShell(value: String): String =
        "'" + value.replace("'", "'\\''") + "'"

    private fun normalizeRepositoryUrl(value: String): String {
        val url = value.trim()
        if (!Regex("^https?://[^\\s]+$", RegexOption.IGNORE_CASE).matches(url) ||
            Regex("['\"`$\\\\;|<>(){}\\[\\]!]").containsMatchIn(url)
        ) {
            throw IllegalArgumentException("仓库地址必须是以 http:// 或 https:// 开头的完整 URL。")
        }
        return url
    }

    fun buildApkUpdateCommand(): String = "apk update"

    fun buildApkListInstalledCommand(): String = "apk info -v"

    fun buildApkListUpgradableCommand(): String = "apk list -u"

    fun buildApkUpgradeCommand(): String = "apk upgrade"

    fun buildApkUpgradePackageCommand(name: String): String = "apk upgrade ${quotePackageName(name)}"

    fun buildApkSearchCommand(keyword: String): String {
        val sanitized = keyword.trim().replace(Regex("['\"\\\\$`]"), "")
        return "apk search -v \"*$sanitized*\" || apk search \"*$sanitized*\""
    }

    fun buildApkListAvailableCommand(): String = "apk search -v \"*\" || apk search \"*\""

    fun buildApkInstallCommand(packageName: String): String = "apk add ${quotePackageName(packageName)}"

    fun buildApkRemoveCommand(packageName: String): String = "apk del ${quotePackageName(packageName)}"

    fun buildApkRepositoriesSnapshotCommand(): String =
        "if ! command -v apk >/dev/null 2>&1; then echo 'ERROR|apk_missing'; exit 2; fi; found=0; " +
            "for file in $APK_CUSTOM_FEEDS_SOURCE $APK_DIST_FEEDS_SOURCE $APK_DIST_FEEDS_FALLBACK_SOURCE; do " +
            "[ -f \"\$file\" ] || continue; found=1; " +
            "awk -v source=\"\$file\" '{ raw=\$0; sub(/\\r\$/, \"\", raw); if (raw ~ /^[[:space:]]*\$/) next; enabled=1; " +
            "if (raw ~ /^[[:space:]]*#/) { enabled=0; sub(/^[[:space:]]*#[[:space:]]*/, \"\", raw); } " +
            "if (raw != \"\") printf \"REPO|%s|%d|%d|%s\\n\", source, NR, enabled, raw; }' \"\$file\"; done; " +
            "[ \"\$found\" -eq 1 ] || { echo 'ERROR|repositories_missing'; exit 2; }"

    private fun normalizeRepositorySource(source: String?): String {
        val resolved = when {
            source == APK_DIST_FEEDS_FALLBACK_SOURCE -> APK_DIST_FEEDS_SOURCE
            source.isNullOrEmpty() -> APK_CUSTOM_FEEDS_SOURCE
            else -> source
        }
        if (resolved != APK_CUSTOM_FEEDS_SOURCE && resolved != APK_DIST_FEEDS_SOURCE) {
            throw IllegalArgumentException("APK 仓库配置文件路径无效。")
        }
        return resolved
    }

    fun buildApkSaveRepositoriesCommand(repositories: List<ApkRepository>): String {
        val normalized = repositories.map {
            ApkRepository(
                line = it.line,
                url = normalizeRepositoryUrl(it.url),
                enabled = it.enabled,
                source = normalizeRepositorySource(it.source),
                deleted = it.deleted == true,
            )
        }
        val active = normalized.filterNot { it.deleted == true }
        if (active.isEmpty()) throw IllegalArgumentException("至少保留一个软件包仓库。")
        if (active.none { it.enabled }) throw IllegalArgumentException("至少启用一个软件包仓库。")
        if (active.map { it.url }.toSet().size != active.size) {
            throw IllegalArgumentException("软件包仓库地址不能重复。")
        }
        val sources = normalized.map { it.source!! }.toSet()
        val writes = sources.map { source ->
            val entries = normalized.filter { it.source == source && it.deleted != true }
            val quotedSource = quoteShell(source)
            if (entries.isEmpty()) {
                "rm -f $quotedSource"
            } else {
                val writeLines = entries
                    .map { repository -> "${if (repository.enabled) "" else "# "}${repository.url}" }
                    .joinToString(" ") { quoteShell(it) }
                "target=$quotedSource; mkdir -p \"\$(dirname \"\$target\")\"; " +
                    "temp=\$(mktemp /tmp/openwrt-status-apk-repositories.XXXXXX) || exit 1; " +
                    "printf '%s\\n' $writeLines > \"\$temp\" || { rm -f \"\$temp\"; exit 1; }; " +
                    "cp \"\$target\" \"\$target.openwrt-status.bak\" 2>/dev/null || true; mv \"\$temp\" \"\$target\""
            }
        }
        return "if ! command -v apk >/dev/null 2>&1; then echo 'apk 未安装。'; exit 2; fi; umask 077; " +
            "${writes.joinToString("; ")} && apk update"
    }

    private fun isApkNoiseLine(trimmed: String): Boolean =
        trimmed.isEmpty() || trimmed.startsWith("fetch ") || trimmed.startsWith("OK:") ||
            trimmed.startsWith("packages:")

    fun parseInstalledPackages(output: String): List<ApkPackage> {
        val packages = mutableListOf<ApkPackage>()
        for (line in output.split(Regex("\r?\n"))) {
            val trimmed = line.trim()
            if (isApkNoiseLine(trimmed)) continue
            val match = Regex("^(.+)-([0-9].*)$").find(trimmed)
            packages.add(
                if (match != null) {
                    ApkPackage(match.groupValues[1], match.groupValues[2], "已安装的系统软件包 (apk)", true, "installed")
                } else {
                    ApkPackage(trimmed, "unknown", "已安装的系统软件包 (apk)", true, "installed")
                },
            )
        }
        return packages
    }

    fun parseUpgradablePackages(output: String): List<ApkPackage> {
        val packages = mutableListOf<ApkPackage>()
        val regex = Regex("^(.+)-([0-9].*?)(?:\\s+\\[upgradable from:\\s+([^\\]]+)\\])?$")
        for (line in output.split(Regex("\r?\n"))) {
            val trimmed = line.trim()
            if (isApkNoiseLine(trimmed)) continue
            val match = regex.find(trimmed) ?: continue
            val (name, version, previousVersion) = match.destructured
            packages.add(
                ApkPackage(
                    name = name,
                    version = version,
                    description = if (previousVersion.isNotEmpty()) "可从 $previousVersion 更新" else "有可用更新",
                    installed = true,
                    status = "upgradable",
                ),
            )
        }
        return packages
    }

    fun parseAvailablePackages(output: String, installedNames: Set<String>): List<ApkPackage> {
        val packages = mutableListOf<ApkPackage>()
        for (line in output.split(Regex("\r?\n"))) {
            val trimmed = line.trim()
            if (isApkNoiseLine(trimmed)) continue
            val sepIdx = trimmed.indexOf(" - ")
            val nameVersion = if (sepIdx > 0) trimmed.substring(0, sepIdx).trim() else trimmed
            val description =
                if (sepIdx > 0) trimmed.substring(sepIdx + 3).trim() else "软件仓库中的可用包 (apk)"
            val match = Regex("^(.+)-([0-9][a-zA-Z0-9._.-]*)$").find(nameVersion)
            val name = match?.groupValues?.get(1) ?: nameVersion
            val version = match?.groupValues?.get(2) ?: "unknown"
            if (name.isEmpty() || packages.any { it.name == name }) continue
            val installed = name in installedNames
            packages.add(
                ApkPackage(name, version, description, installed, if (installed) "installed" else "available"),
            )
        }
        return packages
    }

    fun parseApkRepositories(output: String): List<ApkRepository> {
        val repositories = mutableListOf<ApkRepository>()
        for (rawLine in output.split(Regex("\r?\n"))) {
            val line = rawLine.trim()
            if (!line.startsWith("REPO|")) continue
            val values = line.split("|")
            val modernFormat = values.size >= 5
            val source = if (modernFormat) values[1] else null
            val lineValue = if (modernFormat) values[2] else values[1]
            val enabledValue = if (modernFormat) values[3] else values[2]
            val url = (if (modernFormat) values.drop(4) else values.drop(3)).joinToString("|")
            val number = lineValue.toIntOrNull()
            if (number == null || url.isBlank()) continue
            repositories.add(
                ApkRepository(
                    line = number,
                    enabled = enabledValue == "1",
                    url = url.trim(),
                    source = source,
                ),
            )
        }
        return repositories
    }
}
