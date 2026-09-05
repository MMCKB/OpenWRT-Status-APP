package com.app.openwrtstatusapp.data

import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.core.model.RouterProfile
import com.app.openwrtstatusapp.core.ssh.SshTarget
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 路由器 SSH 会话执行器:按需连接、失败自动重连一次。
 * 所有管理页面经由此处下发 core 模块构建的受控命令。
 */
class RouterSession(private val repository: RouterRepository) {

    private fun keyOf(profile: RouterProfile) = "router-${profile.id}"

    private suspend fun passwordOf(profile: RouterProfile): String =
        repository.loadSshPassword(profile.id)
            ?: repository.loadPassword(profile.id)
            ?: throw IllegalStateException("未找到已保存的 SSH 密码,请重新编辑该路由器。")

    private suspend fun connect(profile: RouterProfile) = withContext(Dispatchers.IO) {
        AppGraph.sshManager.connect(
            keyOf(profile),
            SshTarget.getEndpointHost(profile.baseUrl),
            profile.sshPort ?: 22,
            profile.sshUsername ?: profile.username,
            passwordOf(profile),
        )
    }

    suspend fun exec(profile: RouterProfile, command: String): String = withContext(Dispatchers.IO) {
        val key = keyOf(profile)
        if (!AppGraph.sshManager.isConnected(key)) {
            connect(profile)
        }
        try {
            AppGraph.sshManager.exec(key, command)
        } catch (error: Exception) {
            // 连接可能已被路由器断开,重连一次再试。
            connect(profile)
            AppGraph.sshManager.exec(key, command)
        }
    }

    fun disconnect(profile: RouterProfile) {
        AppGraph.sshManager.disconnect(keyOf(profile))
    }
}
