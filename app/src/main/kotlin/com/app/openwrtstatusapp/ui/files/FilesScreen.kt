package com.app.openwrtstatusapp.ui.files

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.core.commands.FileManagerUtils
import com.app.openwrtstatusapp.core.commands.FileSortMode
import com.app.openwrtstatusapp.core.commands.RemoteEntryKind
import com.app.openwrtstatusapp.core.commands.RemoteFileEntry
import com.app.openwrtstatusapp.core.commands.RouterFileCommands
import com.app.openwrtstatusapp.core.ubus.formatBytes
import com.app.openwrtstatusapp.ui.common.ActionButton
import com.app.openwrtstatusapp.ui.common.ConfirmDialog
import com.app.openwrtstatusapp.ui.common.OutputPanel
import com.app.openwrtstatusapp.ui.common.ScreenScaffold
import com.app.openwrtstatusapp.ui.common.SectionCard
import com.app.openwrtstatusapp.ui.common.TaskState
import com.app.openwrtstatusapp.ui.common.rememberTaskState
import com.app.openwrtstatusapp.ui.common.runTask
import com.app.openwrtstatusapp.ui.common.selectedRouterOrNull
import kotlinx.coroutines.launch

/** 远程文件管理:浏览/编辑/重命名/复制/移动/删除/权限/上传下载。 */
@Composable
fun FilesScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var directory by remember { mutableStateOf("/") }
    var entries by remember { mutableStateOf<List<RemoteFileEntry>>(emptyList()) }
    var search by remember { mutableStateOf("") }
    var sortMode by remember { mutableStateOf(FileSortMode.NAME) }
    var readResult by remember { mutableStateOf<Pair<String, String>?>(null) }
    var editTarget by remember { mutableStateOf<Pair<String, String>?>(null) }
    var renameTarget by remember { mutableStateOf<RemoteFileEntry?>(null) }
    var chmodTarget by remember { mutableStateOf<RemoteFileEntry?>(null) }
    var newDirName by remember { mutableStateOf<String?>(null) }
    var deleteTarget by remember { mutableStateOf<RemoteFileEntry?>(null) }

    fun load() = runTask(scope, state, silent = true) {
        entries = RouterFileCommands.parseDirectoryEntries(
            AppGraph.session.exec(router, RouterFileCommands.buildListDirectoryCommand(directory)),
            directory,
        )
        "共 ${entries.size} 项。"
    }
    LaunchedEffect(router.id, directory) { load() }

    readResult?.let { (path, content) ->
        AlertDialog(
            onDismissRequest = { readResult = null },
            title = { Text(path.substringAfterLast('/')) },
            text = { Text(content.take(20_000), style = MaterialTheme.typography.bodySmall) },
            confirmButton = {
                TextButton(onClick = { editTarget = path to content; readResult = null }) { Text("编辑") }
            },
            dismissButton = { TextButton(onClick = { readResult = null }) { Text("关闭") } },
        )
    }

    editTarget?.let { (path, content) ->
        TextEditDialog(path, content) { newContent ->
            val target = editTarget
            editTarget = null
            if (target != null && newContent != null) {
                scope.launch {
                    runTask(scope, state) {
                        val base64 = android.util.Base64.encodeToString(
                            newContent.toByteArray(Charsets.UTF_8),
                            android.util.Base64.NO_WRAP,
                        )
                        val tempPath = RouterFileCommands.createTemporaryWritePath(target.first)
                        AppGraph.session.exec(
                            router,
                            RouterFileCommands.buildWriteTextCommand(target.first, base64, tempPath),
                        )
                        load()
                    }
                }
            }
        }
    }

    renameTarget?.let { entry ->
        NameDialog("重命名", entry.name) { newName ->
            renameTarget = null
            if (newName != null) {
                scope.launch {
                    runTask(scope, state) {
                        AppGraph.session.exec(router, RouterFileCommands.buildRenameCommand(entry.path, newName)); load()
                    }
                }
            }
        }
    }

    chmodTarget?.let { entry ->
        NameDialog("修改权限(八进制)", entry.mode ?: "644") { mode ->
            chmodTarget = null
            if (mode != null) {
                scope.launch {
                    runTask(scope, state) {
                        AppGraph.session.exec(router, RouterFileCommands.buildChmodCommand(entry.path, mode)); load()
                    }
                }
            }
        }
    }

    newDirName?.let { name ->
        NameDialog("新建目录", "") { result ->
            newDirName = null
            if (result != null) {
                scope.launch {
                    runTask(scope, state) {
                        AppGraph.session.exec(router, RouterFileCommands.buildCreateDirectoryCommand(RouterFileCommands.joinRemotePath(directory, result))); load()
                    }
                }
            }
        }
    }

    deleteTarget?.let { entry ->
        ConfirmDialog(
            title = "删除", text = "确定删除 ${entry.name} 吗?此操作不可恢复。", confirmLabel = "删除",
            onConfirm = {
                deleteTarget = null
                scope.launch {
                    runTask(scope, state) {
                        AppGraph.session.exec(router, RouterFileCommands.buildDeleteCommand(entry.path)); load()
                    }
                }
            },
            onDismiss = { deleteTarget = null },
        )
    }

    ScreenScaffold("文件管理") {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(directory, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                ActionButton("上级", enabled = !state.loading && directory != "/") {
                    directory = RouterFileCommands.parentRemotePath(directory)
                }
                ActionButton("新建目录") { newDirName = "" }
                Text("排序:", Modifier.padding(start = 8.dp))
                FileSortMode.entries.forEach { mode ->
                    TextButton(onClick = { sortMode = mode }) {
                        Text(
                            when (mode) {
                                FileSortMode.NAME -> "名称" to false
                                FileSortMode.SIZE -> "大小" to false
                                FileSortMode.MODIFIED -> "时间" to false
                            }.first,
                            color = if (sortMode == mode) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
            OutlinedTextField(
                search, { search = it },
                label = { Text("搜索当前目录") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutputPanel(state, onDismiss = null)
            LazyColumn {
                val visible = FileManagerUtils.sortFileEntries(
                    FileManagerUtils.filterFileEntries(entries, search),
                    sortMode,
                )
                items(visible, key = { it.path }) { entry ->
                    SectionCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    (if (entry.kind == RemoteEntryKind.DIRECTORY) "📁 " else "") + entry.name,
                                )
                                Text(
                                    listOfNotNull(
                                        RouterFileCommands.formatRemoteSize(entry.size),
                                        entry.mode?.let { "权限 $it" },
                                        entry.modifiedAt,
                                    ).joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            if (entry.kind == RemoteEntryKind.DIRECTORY) {
                                TextButton(onClick = { directory = entry.path }) { Text("进入") }
                            } else {
                                TextButton(onClick = {
                                    scope.launch {
                                        runTask(scope, state) {
                                            val (content, tooLarge) = RouterFileCommands.parseReadableText(
                                                AppGraph.session.exec(router, RouterFileCommands.buildReadTextCommand(entry.path)),
                                            )
                                            if (content != null) {
                                                readResult = entry.path to content
                                                "已读取文件。"
                                            } else {
                                                "文件过大($tooLarge 字节),请在路由器端查看。"
                                            }
                                        }
                                    }
                                }) { Text("查看") }
                            }
                            TextButton(onClick = { renameTarget = entry }) { Text("改名") }
                            TextButton(onClick = { chmodTarget = entry }) { Text("权限") }
                            TextButton(onClick = { deleteTarget = entry }) { Text("删除", color = MaterialTheme.colorScheme.error) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TextEditDialog(path: String, initial: String, onDone: (String?) -> Unit) {
    var content by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = { onDone(null) },
        title = { Text("编辑 ${path.substringAfterLast('/')}") },
        text = {
            OutlinedTextField(
                content, { content = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("内容(UTF-8 文本)") },
            )
        },
        confirmButton = { TextButton(onClick = { onDone(content) }) { Text("保存") } },
        dismissButton = { TextButton(onClick = { onDone(null) }) { Text("取消") } },
    )
}

@Composable
private fun NameDialog(title: String, initial: String, onDone: (String?) -> Unit) {
    var value by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = { onDone(null) },
        title = { Text(title) },
        text = {
            OutlinedTextField(value, { value = it }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        },
        confirmButton = { TextButton(onClick = { onDone(value) }) { Text("确定") } },
        dismissButton = { TextButton(onClick = { onDone(null) }) { Text("取消") } },
    )
}
