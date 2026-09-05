package com.app.openwrtstatusapp.ui.routers

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.core.model.OpenWrtConnectionException
import com.app.openwrtstatusapp.core.model.RouterProfile
import com.app.openwrtstatusapp.core.ubus.StatusParsers
import java.util.UUID
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@Composable
fun RouterFormScreen(profileId: String?, onDone: () -> Unit) {
    val profiles by AppGraph.repository.profilesFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val existing = profiles.find { it.id == profileId }

    // key 随 existing 变化,保证资料异步加载完成后字段初值重建。
    key(existing?.id ?: profileId ?: "new") {
        RouterFormContent(existing, onDone)
    }
}

@Composable
private fun RouterFormContent(existing: RouterProfile?, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var baseUrl by remember { mutableStateOf(existing?.baseUrl ?: "") }
    var username by remember { mutableStateOf(existing?.username ?: "root") }
    var password by remember { mutableStateOf("") }
    var sshPassword by remember { mutableStateOf("") }
    var sshPort by remember { mutableStateOf(existing?.sshPort?.toString() ?: "") }
    var error by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            if (existing == null) "添加路由器" else "编辑路由器",
            style = MaterialTheme.typography.titleLarge,
        )
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("名称") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = baseUrl,
            onValueChange = { baseUrl = it },
            label = { Text("管理地址(如 192.168.1.1)") },
            supportingText = { Text("LuCI/ubus 地址,默认补全 http:// 与 /ubus") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("用户名") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text(if (existing == null) "密码" else "密码(留空保持不变)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = sshPassword,
            onValueChange = { sshPassword = it },
            label = { Text("SSH 密码(留空与 LuCI 密码一致)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = sshPort,
            onValueChange = { sshPort = it.filter { char -> char.isDigit() } },
            label = { Text("SSH 端口(可选,默认 22)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            onClick = {
                scope.launch {
                    try {
                        // 校验地址格式(与状态页一致)。
                        StatusParsers.normalizeRouterEndpoint(baseUrl)
                        require(username.isNotBlank()) { "请输入用户名。" }
                        val storedPassword = AppGraph.repository.loadPassword(existing?.id ?: "")
                        val effectivePassword =
                            if (password.isNotEmpty()) password else storedPassword
                        require(existing != null || !effectivePassword.isNullOrEmpty()) {
                            "请输入密码。"
                        }
                        val profile = RouterProfile(
                            id = existing?.id ?: UUID.randomUUID().toString(),
                            name = name.ifBlank { "路由器" },
                            baseUrl = baseUrl.trim(),
                            username = username.trim(),
                            sshPort = sshPort.toIntOrNull()?.takeIf { it in 1..65535 },
                            createdAt = existing?.createdAt ?: java.time.Instant.now().toString(),
                        )
                        AppGraph.repository.upsertProfile(profile)
                        if (password.isNotEmpty()) {
                            AppGraph.repository.savePassword(profile.id, password)
                        }
                        val effectiveSsh = sshPassword.ifEmpty { password.ifEmpty { null } }
                        if (effectiveSsh != null) {
                            AppGraph.repository.saveSshPassword(profile.id, effectiveSsh)
                        }
                        val settings = AppGraph.repository.settingsFlow.first()
                        if (settings.selectedRouterId == null) {
                            AppGraph.repository.saveSettings(
                                settings.copy(selectedRouterId = profile.id),
                            )
                        }
                        onDone()
                    } catch (caught: IllegalArgumentException) {
                        error = caught.message ?: "输入不合法。"
                    } catch (caught: OpenWrtConnectionException) {
                        error = caught.message ?: "地址不合法。"
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("保存") }
    }
}
