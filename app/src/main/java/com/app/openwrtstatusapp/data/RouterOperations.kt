package com.app.openwrtstatusapp.data

import android.content.ContentResolver
import android.net.Uri
import com.app.openwrtstatusapp.domain.RemoteFileEntry
import com.app.openwrtstatusapp.domain.RouterProfile
import com.app.openwrtstatusapp.ssh.SshSessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URI

/** Pure Kotlin façade for every router-side interaction used by the Compose UI. */
class RouterOperations(private val ssh: SshSessionManager = SshSessionManager()) {
    private fun host(profile: RouterProfile): String = runCatching {
        val value = profile.baseUrl.trim().let { if (it.contains("://")) it else "http://$it" }
        URI(value).host ?: value.substringBefore('/').substringBefore(':')
    }.getOrElse { profile.baseUrl.trim().substringBefore('/').substringBefore(':') }

    suspend fun connect(profile: RouterProfile, password: String) {
        ssh.connect(profile.id, host(profile), profile.sshPort, profile.sshUsername, password)
    }

    suspend fun run(profile: RouterProfile, password: String, command: String): String = withContext(Dispatchers.IO) {
        if (!ssh.connected(profile.id)) connect(profile, password)
        ssh.execute(profile.id, command)
    }

    fun disconnect(profile: RouterProfile) = ssh.disconnect(profile.id)
    fun isConnected(profile: RouterProfile) = ssh.connected(profile.id)

    suspend fun listFiles(profile: RouterProfile, password: String, path: String): List<RemoteFileEntry> {
        val safePath = shell(path.ifBlank { "/" })
        val output = run(profile, password, "find $safePath -mindepth 1 -maxdepth 1 -printf '%y|%s|%TY-%Tm-%Td %TH:%TM|%f\\n' 2>/dev/null || ls -la $safePath")
        return output.lineSequence().mapNotNull { line ->
            val parts = line.split('|')
            if (parts.size >= 4) {
                val name = parts[3].trim().takeIf { it.isNotBlank() } ?: return@mapNotNull null
                RemoteFileEntry(name, path.trimEnd('/') + "/" + name, if (parts[0] == "d") "directory" else "file", parts[1].toLongOrNull(), parts[2])
            } else null
        }.toList()
    }

    suspend fun readText(profile: RouterProfile, password: String, path: String): String = run(profile, password, "cat -- ${shell(path)}")
    suspend fun writeText(profile: RouterProfile, password: String, path: String, text: String): String {
        if (!ssh.connected(profile.id)) connect(profile, password)
        ssh.writeText(profile.id, text, path)
        return "已保存 ${path}"
    }

    suspend fun upload(profile: RouterProfile, password: String, resolver: ContentResolver, source: Uri, destination: String): String {
        if (!ssh.connected(profile.id)) connect(profile, password)
        ssh.upload(profile.id, resolver, source, destination)
        return "已上传至 $destination"
    }

    suspend fun download(profile: RouterProfile, password: String, resolver: ContentResolver, source: String, destination: Uri): String {
        if (!ssh.connected(profile.id)) connect(profile, password)
        ssh.download(profile.id, resolver, source, destination)
        return "已下载 ${source}"
    }

    suspend fun renameFile(profile: RouterProfile, password: String, source: String, destination: String): String =
        run(profile, password, "mv -- ${shell(source)} ${shell(destination)}")

    suspend fun copyFile(profile: RouterProfile, password: String, source: String, destination: String): String =
        run(profile, password, "cp -a -- ${shell(source)} ${shell(destination)}")

    suspend fun deleteFile(profile: RouterProfile, password: String, path: String): String =
        run(profile, password, "rm -rf -- ${shell(path)}")

    suspend fun changePermissions(profile: RouterProfile, password: String, path: String, mode: String): String {
        require(mode.matches(Regex("[0-7]{3,4}"))) { "权限应为三位或四位八进制数字。" }
        return run(profile, password, "chmod $mode -- ${shell(path)}")
    }

    suspend fun wake(profile: RouterProfile, password: String, mac: String, device: String = ""): String {
        require(mac.matches(Regex("(?i)[0-9a-f]{2}(:[0-9a-f]{2}){5}"))) { "MAC 地址格式不正确。" }
        val interfaceArg = device.trim().takeIf { it.matches(Regex("[A-Za-z0-9_.:@+-]+")) }?.let { " -i $it" }.orEmpty()
        return run(profile, password, "etherwake$interfaceArg ${shell(mac)} 2>&1 || wol$interfaceArg ${shell(mac)} 2>&1")
    }

    suspend fun uciSnapshot(profile: RouterProfile, password: String, config: String): String {
        require(config.matches(Regex("[A-Za-z0-9_.-]+"))) { "配置名称不正确。" }
        return run(profile, password, "uci -q show ${safeIdentifier(config)}")
    }

    suspend fun uciSet(profile: RouterProfile, password: String, assignment: String, reload: String = ""): String {
        require(assignment.matches(Regex("""[A-Za-z0-9_@.\[\]=':/, -]+"""))) { "配置内容包含不允许的字符。" }
        return uciBatch(profile, password, assignment.substringBefore('.'), listOf(assignment), reload)
    }

    /**
     * Commits all assignments in a single SSH command. The assignments are restricted to
     * UCI's simple `config.section.option=value` grammar before being interpolated, and the
     * reload action is selected from a fixed allow-list rather than supplied as a shell string.
     */
    suspend fun uciBatch(
        profile: RouterProfile,
        password: String,
        config: String,
        assignments: List<String>,
        reload: String = config,
    ): String {
        require(config.matches(Regex("[A-Za-z0-9_.-]+"))) { "配置名称不正确。" }
        val valid = assignments.map(String::trim).filter { it.isNotBlank() }.onEach {
            require(it.matches(Regex("""[A-Za-z0-9_@.\[\]=':/, -]+"""))) { "配置内容包含不允许的字符。" }
        }
        require(valid.isNotEmpty()) { "没有可保存的配置项。" }
        val reloadCommand = when (reload) {
            "wireless" -> "wifi reload"
            "network" -> "/etc/init.d/network reload"
            "firewall" -> "/etc/init.d/firewall reload"
            "dhcp" -> "/etc/init.d/dnsmasq reload"
            "openclash", "ddns", "adguardhome", "passwall", "passwall2" -> "/etc/init.d/$reload restart 2>/dev/null || true"
            "luci", "uhttpd" -> "/etc/init.d/uhttpd reload"
            "system", "fstab", "dropbear" -> "/etc/init.d/$reload restart 2>/dev/null || true"
            else -> "true"
        }
        val commands = valid.joinToString("; ") { "uci set $it" }
        return run(profile, password, "$commands; uci commit ${safeIdentifier(config)}; $reloadCommand")
    }

    suspend fun systemAction(profile: RouterProfile, password: String, action: String): String = when (action) {
        "reboot" -> run(profile, password, "(sleep 2; reboot) >/dev/null 2>&1 & echo '已发送重启请求。'")
        "reload-network" -> run(profile, password, "/etc/init.d/network reload; wifi reload")
        "backup" -> run(profile, password, "sysupgrade -b /tmp/openwrt-backup.tar.gz && ls -lh /tmp/openwrt-backup.tar.gz")
        else -> error("不支持的维护操作")
    }

    suspend fun service(profile: RouterProfile, password: String, name: String, action: String): String =
        run(profile, password, "/etc/init.d/${safeIdentifier(name)} ${safeIdentifier(action)}")

    suspend fun reloadConfig(profile: RouterProfile, password: String): String = run(profile, password, "uci commit; /etc/init.d/network reload; wifi reload")
    suspend fun packages(profile: RouterProfile, password: String, action: String, name: String = ""): String = when (action) {
        "update" -> run(profile, password, "apk update 2>&1 || opkg update 2>&1")
        "list" -> run(profile, password, "apk list --installed 2>/dev/null || opkg list-installed 2>/dev/null")
        "upgrade" -> run(profile, password, "apk upgrade 2>&1 || opkg list-upgradable 2>&1")
        "install" -> run(profile, password, "apk add ${safeIdentifier(name)} 2>&1 || opkg install ${safeIdentifier(name)} 2>&1")
        "remove" -> run(profile, password, "apk del ${safeIdentifier(name)} 2>&1 || opkg remove ${safeIdentifier(name)} 2>&1")
        else -> error("不支持的软件包操作")
    }

    companion object {
        fun shell(value: String) = "'" + value.replace("'", "'\\''") + "'"
        fun safeIdentifier(value: String): String {
            require(value.matches(Regex("[A-Za-z0-9_.:@/+\\-]+"))) { "名称包含不允许的字符。" }
            return value
        }
    }
}
