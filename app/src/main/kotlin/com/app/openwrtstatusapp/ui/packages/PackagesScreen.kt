package com.app.openwrtstatusapp.ui.packages

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
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
import com.app.openwrtstatusapp.core.commands.RouterPackageCommands
import com.app.openwrtstatusapp.core.commands.ServiceAction
import com.app.openwrtstatusapp.ui.common.ActionButton
import com.app.openwrtstatusapp.ui.common.ConfirmDialog
import com.app.openwrtstatusapp.ui.common.InfoRow
import com.app.openwrtstatusapp.ui.common.OutputPanel
import com.app.openwrtstatusapp.ui.common.ScreenScaffold
import com.app.openwrtstatusapp.ui.common.SectionCard
import com.app.openwrtstatusapp.ui.common.TaskState
import com.app.openwrtstatusapp.ui.common.rememberTaskState
import com.app.openwrtstatusapp.ui.common.runTask
import com.app.openwrtstatusapp.ui.common.selectedRouterOrNull
import kotlinx.coroutines.launch

/** OpenWrt 25.12 APK 软件包管理。 */
@Composable
fun PackagesScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var tab by remember { mutableStateOf(0) }
    var installed by remember { mutableStateOf<List<RouterPackageCommands.ApkPackage>>(emptyList()) }
    var upgradable by remember { mutableStateOf<List<RouterPackageCommands.ApkPackage>>(emptyList()) }
    var available by remember { mutableStateOf<List<RouterPackageCommands.ApkPackage>>(emptyList()) }
    var repositories by remember { mutableStateOf<List<RouterPackageCommands.ApkRepository>>(emptyList()) }
    var search by remember { mutableStateOf("") }
    var confirmTarget by remember { mutableStateOf<Pair<String, String>?>(null) }
    var repoEdits by remember { mutableStateOf<Map<Int, Boolean>>(emptyMap()) }

    val tabs = listOf("已安装", "可升级", "搜索安装", "软件源")

    fun loadInstalled() = runTask(scope, state, silent = true) {
        installed = RouterPackageCommands.parseInstalledPackages(
            AppGraph.session.exec(router, RouterPackageCommands.buildApkListInstalledCommand()),
        )
        "已安装 ${installed.size} 个软件包。"
    }

    fun loadUpgradable() = runTask(scope, state, silent = true) {
        AppGraph.session.exec(router, RouterPackageCommands.buildApkUpdateCommand())
        upgradable = RouterPackageCommands.parseUpgradablePackages(
            AppGraph.session.exec(router, RouterPackageCommands.buildApkListUpgradableCommand()),
        )
        "可升级 ${upgradable.size} 个软件包。"
    }

    fun loadRepositories() = runTask(scope, state, silent = true) {
        repositories = RouterPackageCommands.parseApkRepositories(
            AppGraph.session.exec(router, RouterPackageCommands.buildApkRepositoriesSnapshotCommand()),
        )
        repoEdits = emptyMap()
        "已加载 ${repositories.size} 个软件源。"
    }

    LaunchedEffect(router.id) { loadInstalled() }

    ScreenScaffold("软件包管理") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                tabs.forEachIndexed { index, label ->
                    FilterChip(
                        selected = tab == index,
                        onClick = {
                            tab = index
                            when (index) {
                                0 -> scope.launch { loadInstalled() }
                                1 -> scope.launch { loadUpgradable() }
                                3 -> scope.launch { loadRepositories() }
                            }
                        },
                        label = { Text(label) },
                    )
                }
            }
            OutputPanel(state)
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                when (tab) {
                    0 -> {
                        item {
                            OutlinedTextField(
                                search, { search = it },
                                label = { Text("过滤已安装软件包") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )
                        }
                        items(
                            installed.filter { it.name.contains(search.trim(), ignoreCase = true) },
                            key = { it.name },
                        ) { pkg ->
                            SectionCard(pkg.name) {
                                InfoRow("版本", pkg.version)
                                ActionButton("卸载", danger = true, enabled = !state.loading) {
                                    confirmTarget = "remove" to pkg.name
                                }
                            }
                        }
                    }
                    1 -> {
                        item {
                            ActionButton("升级全部", enabled = !state.loading) {
                                confirmTarget = "upgradeAll" to ""
                            }
                        }
                        items(upgradable, key = { it.name }) { pkg ->
                            SectionCard(pkg.name) {
                                InfoRow("版本", pkg.description)
                                ActionButton("升级此包", enabled = !state.loading) {
                                    confirmTarget = "upgrade" to pkg.name
                                }
                            }
                        }
                    }
                    2 -> {
                        item {
                            OutlinedTextField(
                                search, { search = it },
                                label = { Text("搜索仓库软件包") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                trailingIcon = {
                                    TextButton(onClick = {
                                        scope.launch {
                                            runTask(scope, state) {
                                                val output = AppGraph.session.exec(
                                                    router,
                                                    RouterPackageCommands.buildApkSearchCommand(search.trim()),
                                                )
                                                available = RouterPackageCommands.parseAvailablePackages(
                                                    output,
                                                    installed.map { it.name }.toSet(),
                                                )
                                                "匹配 ${available.size} 个软件包。"
                                            }
                                        }
                                    }) { Text("搜索") }
                                },
                            )
                        }
                        items(available, key = { it.name }) { pkg ->
                            SectionCard(pkg.name) {
                                InfoRow("版本", pkg.version)
                                Text(pkg.description, style = MaterialTheme.typography.bodySmall)
                                if (pkg.installed) {
                                    Text("已安装", color = MaterialTheme.colorScheme.primary)
                                } else {
                                    ActionButton("安装", enabled = !state.loading) {
                                        confirmTarget = "install" to pkg.name
                                    }
                                }
                            }
                        }
                    }
                    else -> {
                        item {
                            Text("启用/停用后点击保存;仅管理 customfeeds.list 与 distfeed。", style = MaterialTheme.typography.bodySmall)
                        }
                        items(repositories.size) { index ->
                            val repo = repositories[index]
                            val enabled = repoEdits[index] ?: repo.enabled
                            SectionCard(repo.url.substringAfterLast('/')) {
                                InfoRow("地址", repo.url)
                                InfoRow("来源", repo.source?.substringAfterLast('/') ?: "—")
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("启用", Modifier.weight(1f))
                                    androidx.compose.material3.Switch(
                                        checked = enabled,
                                        onCheckedChange = { check -> repoEdits = repoEdits + (index to check) },
                                    )
                                }
                            }
                        }
                        item {
                            ActionButton("保存软件源并刷新索引", enabled = !state.loading && repositories.isNotEmpty()) {
                                scope.launch {
                                    runTask(scope, state) {
                                        val next = repositories.mapIndexed { index, repo ->
                                            repo.copy(enabled = repoEdits[index] ?: repo.enabled)
                                        }
                                        AppGraph.session.exec(
                                            router,
                                            RouterPackageCommands.buildApkSaveRepositoriesCommand(next),
                                        )
                                        loadRepositories()
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    confirmTarget?.let { (action, name) ->
        val (title, text, command) = when (action) {
            "remove" -> Triple("卸载软件包", "确定卸载 $name 吗?", RouterPackageCommands.buildApkRemoveCommand(name))
            "install" -> Triple("安装软件包", "确定安装 $name 吗?", RouterPackageCommands.buildApkInstallCommand(name))
            "upgrade" -> Triple("升级软件包", "确定升级 $name 吗?", RouterPackageCommands.buildApkUpgradePackageCommand(name))
            else -> Triple("升级全部", "确定升级全部可升级软件包吗?", RouterPackageCommands.buildApkUpgradeCommand())
        }
        ConfirmDialog(
            title = title, text = text, confirmLabel = "确定",
            onConfirm = {
                confirmTarget = null
                scope.launch {
                    runTask(scope, state) {
                        AppGraph.session.exec(router, command)
                        when (action) {
                            "remove" -> loadInstalled()
                            "install" -> {}
                            "upgrade" -> loadUpgradable()
                            else -> loadUpgradable()
                        }
                    }
                }
            },
            onDismiss = { confirmTarget = null },
        )
    }
}
