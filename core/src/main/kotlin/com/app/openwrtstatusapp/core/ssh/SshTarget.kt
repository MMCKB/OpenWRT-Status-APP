package com.app.openwrtstatusapp.core.ssh

import com.app.openwrtstatusapp.core.model.RouterProfile

/** 平移自 lib/ssh-client.ts:从 LuCI 管理地址推导 SSH 目标。 */
object SshTarget {
    fun getEndpointHost(baseUrl: String): String {
        val withProtocol =
            if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(baseUrl)) baseUrl
            else "http://$baseUrl"
        val authority = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://([^/?#]+)").find(withProtocol)
            ?.groupValues?.get(1)
            ?: throw IllegalArgumentException("无法从 LuCI 管理地址识别 SSH 主机。")
        var host = authority.substringAfterLast("@")
        if (host.startsWith("[")) {
            val end = host.indexOf(']')
            if (end > 0) return host.substring(0, end + 1)
            throw IllegalArgumentException("无法从 LuCI 管理地址识别 SSH 主机。")
        }
        val colon = host.lastIndexOf(':')
        if (colon > 0) {
            val port = host.substring(colon + 1)
            if (port.isEmpty() || port.any { !it.isDigit() }) {
                throw IllegalArgumentException("无法从 LuCI 管理地址识别 SSH 主机。")
            }
            host = host.substring(0, colon)
        }
        if (host.isEmpty() || host.contains(':')) {
            throw IllegalArgumentException("无法从 LuCI 管理地址识别 SSH 主机。")
        }
        return host
    }

    fun getSshTarget(profile: RouterProfile): String {
        val port = profile.sshPort ?: 22
        return "${profile.username}@${getEndpointHost(profile.baseUrl)}:$port"
    }

    fun makeSshUri(profile: RouterProfile): String {
        val port = profile.sshPort ?: 22
        return "ssh://${percentEncode(profile.username)}@${getEndpointHost(profile.baseUrl)}:$port"
    }

    private fun percentEncode(value: String): String = buildString {
        for (byte in value.toByteArray(Charsets.UTF_8)) {
            val char = byte.toInt().toChar()
            if (char in 'A'..'Z' || char in 'a'..'z' || char in '0'..'9' || char in "-_.~") {
                append(char)
            } else {
                append('%')
                append(byte.toInt().and(0xFF).toString(16).padStart(2, '0').uppercase())
            }
        }
    }
}
