package com.app.openwrtstatusapp.ssh

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.schmizz.sshj.SSHClient
import net.schmizz.sshj.transport.verification.PromiscuousVerifier
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * sshj 封装:替代旧版基于 JSch 的原生桥。
 *
 * 说明:与旧版一致暂时信任任意主机密钥(PromiscuousVerifier),
 * 后续应改为按主机记录 known_hosts 指纹(TODO)。
 */
class SshManager {
    private val clients = ConcurrentHashMap<String, SSHClient>()

    suspend fun connect(key: String, host: String, port: Int, username: String, password: String) =
        withContext(Dispatchers.IO) {
            disconnect(key)
            val client = SSHClient()
            client.addHostKeyVerifier(PromiscuousVerifier())
            client.connectTimeout = CONNECT_TIMEOUT_MS
            client.connect(host, port)
            try {
                client.authPassword(username, password)
            } catch (error: Exception) {
                runCatching { client.disconnect() }
                throw error
            }
            clients[key] = client
        }

    suspend fun exec(key: String, command: String): String = withContext(Dispatchers.IO) {
        val client = connectedClient(key)
        val session = client.startSession()
        try {
            val commandHandle = session.exec(command)
            val stdout = commandHandle.inputStream.readBytes().decodeToString()
            commandHandle.join(COMMAND_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            val stderr = commandHandle.errorStream.readBytes().decodeToString()
            stdout + stderr
        } finally {
            runCatching { session.close() }
        }
    }

    suspend fun upload(key: String, localPath: String, remotePath: String) = withContext(Dispatchers.IO) {
        connectedClient(key).newSFTPClient().use { it.put(localPath, remotePath) }
    }

    suspend fun download(key: String, remotePath: String, localPath: String) = withContext(Dispatchers.IO) {
        connectedClient(key).newSFTPClient().use { it.get(remotePath, localPath) }
    }

    fun isConnected(key: String): Boolean =
        clients[key]?.isConnected == true

    fun disconnect(key: String) {
        clients.remove(key)?.let { client ->
            runCatching { client.disconnect() }.onFailure { Log.w(TAG, "disconnect failed", it) }
        }
    }

    private fun connectedClient(key: String): SSHClient {
        val client = clients[key]
        require(client != null && client.isConnected) { "SSH 未连接,请先连接路由器。" }
        return client
    }

    companion object {
        private const val TAG = "SshManager"
        private const val CONNECT_TIMEOUT_MS = 10_000
        private const val COMMAND_TIMEOUT_SECONDS = 30L
    }
}
