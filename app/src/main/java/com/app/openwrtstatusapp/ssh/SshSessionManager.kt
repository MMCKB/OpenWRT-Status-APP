package com.app.openwrtstatusapp.ssh

import android.content.ContentResolver
import android.net.Uri
import com.jcraft.jsch.ChannelExec
import com.jcraft.jsch.ChannelSftp
import com.jcraft.jsch.JSch
import com.jcraft.jsch.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Properties
import java.util.concurrent.ConcurrentHashMap

class SshSessionManager {
    private val sessions = ConcurrentHashMap<String, Session>()
    suspend fun connect(id: String, host: String, port: Int, username: String, password: String) = withContext(Dispatchers.IO) {
        if (password.isBlank()) error("SSH 密码为空。请在路由器资料中填写 SSH 密码。")
        disconnect(id)
        val session = JSch().getSession(username, host, port).apply { setPassword(password); setConfig(Properties().apply { put("StrictHostKeyChecking", "no"); put("PreferredAuthentications", "keyboard-interactive,password") }); connect(15_000) }
        sessions[id] = session
    }
    fun connected(id: String) = sessions[id]?.isConnected == true
    fun disconnect(id: String) { sessions.remove(id)?.takeIf { it.isConnected }?.disconnect() }
    suspend fun execute(id: String, command: String): String = withContext(Dispatchers.IO) {
        val session = sessions[id]?.takeIf { it.isConnected } ?: error("SSH 会话未连接。")
        val channel = session.openChannel("exec") as ChannelExec
        try { channel.setCommand(command); val output = channel.inputStream; val errors = channel.errStream; channel.connect(15_000); val all = ByteArrayOutputStream(); val buffer = ByteArray(4096)
            while (!channel.isClosed) { while (output.available() > 0) output.read(buffer).takeIf { it > 0 }?.let { all.write(buffer, 0, it) }; while (errors.available() > 0) errors.read(buffer).takeIf { it > 0 }?.let { all.write(buffer, 0, it) }; Thread.sleep(35) }
            while (output.available() > 0) output.read(buffer).takeIf { it > 0 }?.let { all.write(buffer, 0, it) }
            all.toString(Charsets.UTF_8.name()).ifBlank { "命令以退出码 ${channel.exitStatus} 结束。" }
        } finally { channel.disconnect() }
    }
    suspend fun upload(id: String, resolver: ContentResolver, local: Uri, remote: String) = withContext(Dispatchers.IO) { sftp(id) { put(resolver.openInputStream(local) ?: error("无法读取所选文件。"), remote) } }
    suspend fun download(id: String, resolver: ContentResolver, remote: String, local: Uri) = withContext(Dispatchers.IO) { sftp(id) { get(remote, resolver.openOutputStream(local, "w") ?: error("无法创建下载文件。")) } }
    suspend fun writeText(id: String, text: String, remote: String) = withContext(Dispatchers.IO) { sftp(id) { put(ByteArrayInputStream(text.toByteArray()), remote) } }
    private fun sftp(id: String, block: ChannelSftp.() -> Unit) { val session = sessions[id]?.takeIf { it.isConnected } ?: error("SSH 会话未连接。"); val sftp = session.openChannel("sftp") as ChannelSftp; try { sftp.connect(15_000); sftp.block() } finally { sftp.disconnect() } }
    fun closeAll() = sessions.keys.forEach(::disconnect)
}
