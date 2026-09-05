package com.app.openwrtstatusapp.ui.ssh

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.core.ssh.SshTarget
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * 阶段 1 的 SSH 页:密码连接 + 单条命令执行与输出展示。
 * 真正的 PTY 终端(推荐 Termux terminal-view)在阶段 2 落地,见 PORTING.md。
 */
@Composable
fun SshScreen() {
    val scope = rememberCoroutineScope()
    val settings by AppGraph.repository.settingsFlow.collectAsStateWithLifecycle(initialValue = null)
    val profiles by AppGraph.repository.profilesFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val selected = profiles.find { it.id == settings?.selectedRouterId }

    var connected by remember { mutableStateOf(false) }
    var connecting by remember { mutableStateOf(false) }
    var command by remember { mutableStateOf("") }
    var output by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    fun sshKey(profileId: String) = "router-$profileId"

    Column(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("SSH 终端", style = MaterialTheme.typography.titleLarge)
        if (selected == null) {
            Text("先在“路由器”页选择一台路由器。")
            return@Column
        }
        Text(
            SshTarget.getSshTarget(
                selected.copy(username = selected.sshUsername ?: selected.username),
            ),
            style = MaterialTheme.typography.bodySmall,
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                enabled = !connecting && !connected,
                onClick = {
                    scope.launch {
                        connecting = true
                        error = null
                        try {
                            val password = AppGraph.repository.loadSshPassword(selected.id)
                                ?: AppGraph.repository.loadPassword(selected.id)
                                ?: throw Exception("未找到已保存的 SSH 密码,请重新编辑该路由器。")
                            AppGraph.sshManager.connect(
                                sshKey(selected.id),
                                SshTarget.getEndpointHost(selected.baseUrl),
                                selected.sshPort ?: 22,
                                selected.sshUsername ?: selected.username,
                                password,
                            )
                            connected = true
                            output = ""
                        } catch (caught: Exception) {
                            error = caught.message ?: "连接失败。"
                        } finally {
                            connecting = false
                        }
                    }
                },
            ) { Text(if (connecting) "连接中…" else "连接") }
            OutlinedButton(
                enabled = connected,
                onClick = {
                    AppGraph.sshManager.disconnect(sshKey(selected.id))
                    connected = false
                },
            ) { Text("断开") }
        }

        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        OutlinedTextField(
            value = command,
            onValueChange = { command = it },
            label = { Text("命令") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Button(
            enabled = connected && command.isNotBlank(),
            onClick = {
                scope.launch {
                    error = null
                    try {
                        val result = AppGraph.sshManager.exec(sshKey(selected.id), command)
                        output = result
                        command = ""
                    } catch (caught: Exception) {
                        error = caught.message ?: "执行失败。"
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("执行") }

        if (output.isNotEmpty()) {
            Card(Modifier.fillMaxWidth()) {
                Text(
                    output,
                    Modifier.fillMaxWidth().padding(12.dp).verticalScroll(rememberScrollState()),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "说明:当前为简化版执行界面,完整交互式终端将在后续版本提供。",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
