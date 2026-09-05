package com.app.openwrtstatusapp

import android.content.Context
import com.app.openwrtstatusapp.core.ubus.UbusClient
import com.app.openwrtstatusapp.data.RouterRepository
import com.app.openwrtstatusapp.ssh.SshManager

/** 极简依赖图:单进程单例,无需引入 DI 框架。 */
object AppGraph {
    lateinit var repository: RouterRepository
        private set

    val ubusClient = UbusClient()
    val sshManager = SshManager()

    fun init(context: Context) {
        if (!::repository.isInitialized) {
            repository = RouterRepository(context.applicationContext)
        }
    }
}
