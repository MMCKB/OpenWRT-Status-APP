package com.app.openwrtstatusapp.ui.firmware

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
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
import com.app.openwrtstatusapp.AppGraph
import com.app.openwrtstatusapp.core.commands.FirmwareDeviceInfo
import com.app.openwrtstatusapp.core.commands.OpenWrtAdmin
import com.app.openwrtstatusapp.core.commands.ServiceAction
import com.app.openwrtstatusapp.core.github.GithubRelease
import com.app.openwrtstatusapp.core.github.GithubReleaseClient
import com.app.openwrtstatusapp.core.ubus.formatBytes
import com.app.openwrtstatusapp.ui.common.ActionButton
import com.app.openwrtstatusapp.ui.common.InfoRow
import com.app.openwrtstatusapp.ui.common.OutputPanel
import com.app.openwrtstatusapp.ui.common.ScreenScaffold
import com.app.openwrtstatusapp.ui.common.SectionCard
import com.app.openwrtstatusapp.ui.common.TaskState
import com.app.openwrtstatusapp.ui.common.rememberTaskState
import com.app.openwrtstatusapp.ui.common.runTask
import com.app.openwrtstatusapp.ui.common.selectedRouterOrNull
import kotlinx.coroutines.launch

/**
 * GitHub Release 固件检查:输入仓库 Releases 链接,自动比对当前固件版本
 * 并列出固件候选资产。
 */
@Composable
fun FirmwareReleaseScreen() {
    val router = selectedRouterOrNull() ?: return com.app.openwrtstatusapp.ui.network.NoRouterHint()
    val scope = rememberCoroutineScope()
    val state = rememberTaskState()
    var releaseUrl by remember { mutableStateOf("") }
    var deviceInfo by remember { mutableStateOf<FirmwareDeviceInfo?>(null) }
    var releases by remember { mutableStateOf<List<GithubRelease>>(emptyList()) }
    var comparison by remember { mutableStateOf<Int?>(null) }

    LaunchedEffect(router.id) {
        runTask(scope, state, silent = true) {
            deviceInfo = OpenWrtAdmin.parseFirmwareDeviceInfo(
                AppGraph.session.exec(router, OpenWrtAdmin.buildFirmwareDeviceInfoCommand()),
            )
            "已加载设备信息。"
        }
    }

    fun check() = runTask(scope, state) {
        val fetched = GithubReleaseClient.fetchGithubReleases(releaseUrl)
        releases = fetched
        val latest = fetched.first()
        comparison = GithubReleaseClient.compareReleaseVersion(deviceInfo?.version, latest.tagName)
        "获取到 ${fetched.size} 个 Release,最新为 ${latest.tagName}。"
    }

    ScreenScaffold("固件更新检查") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionCard("当前设备") {
                InfoRow("型号", deviceInfo?.model ?: "—")
                InfoRow("架构", deviceInfo?.boardName ?: "—")
                InfoRow("当前版本", deviceInfo?.version ?: "—")
                InfoRow("目标平台", deviceInfo?.target ?: "—")
            }
            SectionCard("GitHub Release 链接") {
                OutlinedTextField(
                    releaseUrl,
                    { releaseUrl = it },
                    label = { Text("https://github.com/owner/repo/releases") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                ActionButton("检查更新", enabled = !state.loading && releaseUrl.isNotBlank()) {
                    scope.launch { check() }
                }
                comparison?.let {
                    Text(
                        when {
                            it > 0 -> "发现新版本!"
                            it == 0 -> "已是最新版本。"
                            else -> "当前版本比最新 Release 更新。"
                        },
                        color = if (it > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
            OutputPanel(state)
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(releases, key = { it.tagName }) { release ->
                    SectionCard(release.tagName) {
                        InfoRow("发布时间", release.publishedAt?.take(10) ?: "—")
                        val firmwareAssets = release.assets.filter { it.firmwareCandidate }
                        InfoRow("固件资产", "${firmwareAssets.size} 个")
                        firmwareAssets.take(5).forEach { asset ->
                            Row {
                                Column(Modifier.weight(1f)) {
                                    Text(asset.name, style = MaterialTheme.typography.bodySmall)
                                    Text(formatBytes(asset.size.toDouble()), style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                        if (firmwareAssets.isEmpty()) {
                            Text("此 Release 未包含固件候选文件。", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}
