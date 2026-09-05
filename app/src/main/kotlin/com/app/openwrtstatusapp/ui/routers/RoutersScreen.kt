package com.app.openwrtstatusapp.ui.routers

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.core.model.RouterProfile
import kotlinx.coroutines.launch

@Composable
fun RoutersScreen(onEdit: (String) -> Unit) {
    val profiles by AppGraph.repository.profilesFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val settings by AppGraph.repository.settingsFlow.collectAsStateWithLifecycle(initialValue = null)
    val scope = rememberCoroutineScope()
    var deleteTarget by remember { mutableStateOf<RouterProfile?>(null) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { onEdit("") }) {
                Icon(Icons.Filled.Add, contentDescription = "添加路由器")
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            Text("路由器", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(12.dp))
            if (profiles.isEmpty()) {
                Text("点击右下角 + 添加你的第一台 OpenWrt 路由器。")
            }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(profiles, key = { it.id }) { profile ->
                    val selected = settings?.selectedRouterId == profile.id
                    Card(Modifier.fillMaxWidth()) {
                        Row(
                            Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(
                                Modifier.weight(1f).padding(8.dp),
                                verticalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    if (selected) {
                                        Icon(
                                            Icons.Filled.Star,
                                            contentDescription = "当前路由器",
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.height(16.dp),
                                        )
                                        Spacer(Modifier.height(0.dp))
                                    }
                                    Text(
                                        profile.name,
                                        style = MaterialTheme.typography.titleMedium,
                                    )
                                }
                                Text(
                                    "${profile.username}@${profile.baseUrl}",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            if (!selected) {
                                TextButton(onClick = {
                                    scope.launch {
                                        AppGraph.repository.saveSettings(
                                            (settings ?: com.app.openwrtstatusapp.core.model.RouterSettings())
                                                .copy(selectedRouterId = profile.id),
                                        )
                                    }
                                }) { Text("设为当前") }
                            }
                            IconButton(onClick = { onEdit(profile.id) }) {
                                Icon(Icons.Filled.Edit, contentDescription = "编辑")
                            }
                            IconButton(onClick = { deleteTarget = profile }) {
                                Icon(Icons.Filled.Delete, contentDescription = "删除")
                            }
                        }
                    }
                }
            }
        }
    }

    deleteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("删除路由器") },
            text = { Text("确定删除“${target.name}”吗?已保存的密码会一并清除。") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch { AppGraph.repository.deleteProfile(target.id) }
                    deleteTarget = null
                }) { Text("删除", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) { Text("取消") }
            },
        )
    }
}
