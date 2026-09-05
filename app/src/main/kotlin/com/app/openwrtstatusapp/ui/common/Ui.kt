package com.app.openwrtstatusapp.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.core.model.RouterProfile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** 一次 SSH 任务的状态(加载中/输出/错误),供管理页复用。 */
class TaskState {
    var loading by mutableStateOf(false)
    var output by mutableStateOf<String?>(null)
    var error by mutableStateOf<String?>(null)
}

@Composable
fun rememberTaskState(): TaskState = androidx.compose.runtime.remember { TaskState() }

fun runTask(
    scope: CoroutineScope,
    state: TaskState,
    silent: Boolean = false,
    block: suspend () -> Any?,
) {
    if (state.loading) return
    scope.launch {
        state.loading = true
        if (!silent) state.error = null
        try {
            val result = block()
            if (!silent) state.output = (result as? String) ?: "完成。"
            if (!silent) state.error = null
        } catch (caught: Exception) {
            state.error = caught.message ?: "操作失败。"
        } finally {
            state.loading = false
        }
    }
}

/** 当前选中的路由器;没有则返回 null。 */
@Composable
fun selectedRouterOrNull(): RouterProfile? {
    val settings by AppGraph.repository.settingsFlow.collectAsStateWithLifecycle(initialValue = null)
    val profiles by AppGraph.repository.profilesFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    return profiles.find { it.id == settings?.selectedRouterId }
}

@Composable
fun ScreenScaffold(title: String, content: @Composable () -> Unit) {
    Column(Modifier.padding(16.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(12.dp))
        content()
    }
}

@Composable
fun SectionCard(title: String? = null, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            if (title != null) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
            }
            content()
        }
    }
}

@Composable
fun InfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, Modifier.weight(0.38f), style = MaterialTheme.typography.bodyMedium)
        Text(value, Modifier.weight(0.62f), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun ActionButton(label: String, enabled: Boolean = true, danger: Boolean = false, onClick: () -> Unit) {
    if (danger) {
        OutlinedButton(onClick = onClick, enabled = enabled) {
            Text(label, color = MaterialTheme.colorScheme.error)
        }
    } else {
        Button(onClick = onClick, enabled = enabled) { Text(label) }
    }
}

/** 展示命令输出或错误的通用面板。 */
@Composable
fun OutputPanel(state: TaskState, onDismiss: (() -> Unit)? = null) {
    state.error?.let { error ->
        Card(Modifier.fillMaxWidth()) {
            Text(error, Modifier.padding(12.dp), color = MaterialTheme.colorScheme.error)
        }
    }
    state.output?.let { output ->
        if (output.isNotBlank()) {
            Card(Modifier.fillMaxWidth()) {
                Text(
                    output.takeLast(20_000),
                    Modifier.fillMaxWidth().padding(12.dp).verticalScroll(rememberScrollState()),
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                )
            }
        }
    }
    if (state.loading) {
        Row(
            Modifier.fillMaxWidth().padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircularProgressIndicator(Modifier.height(18.dp))
            Text("执行中…", style = MaterialTheme.typography.bodySmall)
        }
    }
    if (onDismiss != null && (state.output != null || state.error != null)) {
        TextButton(onClick = onDismiss) { Text("清除结果") }
    }
}

@Composable
fun ConfirmDialog(
    title: String,
    text: String,
    confirmLabel: String = "确定",
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(confirmLabel, color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}
