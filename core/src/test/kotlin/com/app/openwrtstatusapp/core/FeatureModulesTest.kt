package com.app.openwrtstatusapp.core

import com.app.openwrtstatusapp.core.commands.FileManagerUtils
import com.app.openwrtstatusapp.core.commands.FileSortMode
import com.app.openwrtstatusapp.core.commands.OpenWrtAdvancedAdmin
import com.app.openwrtstatusapp.core.commands.PortForwardDraft
import com.app.openwrtstatusapp.core.commands.ProxyServiceId
import com.app.openwrtstatusapp.core.commands.RemoteEntryKind
import com.app.openwrtstatusapp.core.commands.RemoteFileEntry
import com.app.openwrtstatusapp.core.commands.RouterFileCommands
import com.app.openwrtstatusapp.core.commands.RouterLogCategory
import com.app.openwrtstatusapp.core.commands.RouterPackageCommands
import com.app.openwrtstatusapp.core.commands.ServiceAction
import com.app.openwrtstatusapp.core.github.GithubReleaseClient
import com.app.openwrtstatusapp.core.model.InterfaceStatus
import com.app.openwrtstatusapp.core.traffic.TrafficHistory
import com.app.openwrtstatusapp.core.traffic.TrafficMonitor
import com.app.openwrtstatusapp.core.traffic.TrafficSnapshot
import com.app.openwrtstatusapp.core.traffic.TrafficSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class OpenWrtAdvancedAdminTest {
    @Test
    fun `解析防火墙快照`() {
        val snapshot = OpenWrtAdvancedAdmin.parseFirewallSnapshot(
            "__FIREWALL__\nfirewall.lan='zone'\nfirewall.lan.name='lan'\nfirewall.lan.network='lan'\n" +
                "firewall.@redirect[0]='redirect'\nfirewall.@redirect[0].name='web'\n" +
                "firewall.@redirect[0].src='wan'\nfirewall.@redirect[0].dest='lan'\n" +
                "firewall.@redirect[0].dest_ip='192.168.1.10'\nfirewall.@redirect[0].src_dport='8080'\n" +
                "firewall.@redirect[0].dest_port='80'\nfirewall.@redirect[0].proto='tcp'\n" +
                "firewall.@redirect[0].enabled='1'\n" +
                "__UPNP__\nUPNP|installed|running|1",
        )
        assertEquals("lan", snapshot.zones[0].name)
        assertEquals("web", snapshot.portForwards[0].name)
        assertEquals("192.168.1.10", snapshot.portForwards[0].destinationIp)
        assertEquals(true, snapshot.upnp.installed)
        assertEquals(true, snapshot.upnp.running)
        assertEquals(true, snapshot.upnp.enabled)
    }

    @Test
    fun `端口转发创建命令包含 DNAT 与重载`() {
        val command = OpenWrtAdvancedAdmin.buildPortForwardCreateCommand(
            PortForwardDraft("web", "wan", "lan", "192.168.1.10", "8080", "80", "tcp"),
        )
        assertTrue(command.contains("='redirect'"))
        assertTrue(command.contains("target='DNAT'"))
        assertTrue(command.contains("/etc/init.d/firewall reload"))
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdvancedAdmin.buildPortForwardCreateCommand(
                PortForwardDraft("web", "wan", "lan", "999.1.1.1", "8080", "80", "tcp"),
            )
        }
    }

    @Test
    fun `解析健康快照`() {
        val health = OpenWrtAdvancedAdmin.parseHealthSnapshot(
            "__DISKS__\nDISK|/overlay|256000|64000|192000|25%\n__TEMPERATURES__\nTEMP|52000\n" +
                "__PING__\n3 packets transmitted, 3 received, 0% packet loss\nrtt min/avg/max/mdev = 1/2.0/3/0.5 ms\n" +
                "__DNS__\nServer: 127.0.0.1\nName: openwrt.org\nAddress: 140.82.121.4",
        )
        assertEquals("/overlay", health.disks[0].mount)
        assertEquals(52.0, health.temperaturesC[0], 0.01)
        assertEquals(0.0, health.ping?.lossPercent!!, 0.01)
        assertEquals(2.0, health.ping?.averageMs!!, 0.01)
        assertEquals(true, health.dnsReachable)
    }

    @Test
    fun `插件设置快照解析与保存命令`() {
        val snapshot = OpenWrtAdvancedAdmin.parsePluginSettingsSnapshot(
            ProxyServiceId.OPENCLASH,
            "__PLUGIN_SETTINGS__|openclash|present\nSECTION|openclash|openclash\nVALUE|openclash|enabled|1\nVALUE|openclash|log_level|info\n",
        )
        assertEquals(true, snapshot.exists)
        assertEquals("openclash", snapshot.sections[0].section)
        assertEquals("1", snapshot.sections[0].values["enabled"])
        val command = OpenWrtAdvancedAdmin.buildPluginSettingsApplyCommand(
            ProxyServiceId.OPENCLASH, "openclash", mapOf("enabled" to "1", "log_level" to ""),
        )
        assertTrue(command.contains("uci commit 'openclash'"))
        assertTrue(command.contains("uci -q delete 'openclash.openclash.log_level'"))
        assertTrue(command.contains("restart"))
    }

    @Test
    fun `插件配置读取与 base64 保存`() {
        val snapshot = OpenWrtAdvancedAdmin.parsePluginConfigSnapshot(
            ProxyServiceId.DDNS,
            "__PLUGIN_CONFIG__|ddns|present\ndefault enable 1\n",
        )
        assertEquals(true, snapshot.exists)
        assertEquals("default enable 1", snapshot.content)
        val apply = OpenWrtAdvancedAdmin.buildPluginConfigApplyCommand(ProxyServiceId.DDNS, "hello config")
        assertTrue(apply.contains("base64 -d"))
        assertTrue(apply.contains("restart"))
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdvancedAdmin.buildPluginConfigApplyCommand(ProxyServiceId.DDNS, "  ")
        }
    }

    @Test
    fun `代理服务状态解析与 LuCI 入口`() {
        val states = OpenWrtAdvancedAdmin.parseProxyServiceStates(
            "PROXY|openclash|installed|running|openclash\nPROXY|ddns|missing|stopped|ddns",
        )
        assertEquals(5, states.size)
        assertEquals(true, states.first { it.id == ProxyServiceId.OPENCLASH }.running)
        assertEquals(false, states.first { it.id == ProxyServiceId.DDNS }.installed)
        assertEquals(
            "http://192.168.1.1/cgi-bin/luci/admin/services/openclash",
            OpenWrtAdvancedAdmin.buildProxyServiceConfigUrl("http://192.168.1.1/ubus", ProxyServiceId.OPENCLASH),
        )
    }

    @Test
    fun `路由器日志命令带过滤与上限`() {
        val command = OpenWrtAdvancedAdmin.buildRouterLogCommand(RouterLogCategory.SYSTEM, 300, "dhcp")
        assertTrue(command.contains("tail -n 300"))
        assertTrue(command.contains("grep -F -- 'dhcp'"))
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdvancedAdmin.buildRouterLogCommand(RouterLogCategory.SYSTEM, 300, "a\nb")
        }
        assertTrue(
            OpenWrtAdvancedAdmin.buildProxyServiceActionCommand(ProxyServiceId.OPENCLASH, ServiceAction.RESTART)
                .contains("/etc/init.d/openclash restart"),
        )
    }
}

class RouterPackageCommandsTest {
    @Test
    fun `解析已安装与可升级软件包`() {
        val installed = RouterPackageCommands.parseInstalledPackages(
            "busybox-1.36.1\nkernel-6.6.0\nfetch https://example.com\nOK: 100 packages",
        )
        assertEquals(2, installed.size)
        assertEquals("busybox", installed[0].name)
        assertEquals("1.36.1", installed[0].version)
        val upgradable = RouterPackageCommands.parseUpgradablePackages(
            "busybox-1.36.2 [upgradable from: 1.36.1]\nok packages:",
        )
        assertEquals(1, upgradable.size)
        assertEquals("busybox", upgradable[0].name)
        assertEquals("可从 1.36.1 更新", upgradable[0].description)
    }

    @Test
    fun `解析可用软件包并标记已安装`() {
        val available = RouterPackageCommands.parseAvailablePackages(
            "nginx-1.25.0 - high performance web server\nluci-base-25.120.1 - LuCI base runtime",
            setOf("luci-base"),
        )
        assertEquals(2, available.size)
        assertEquals(false, available[0].installed)
        assertEquals("installed", available[1].status)
        assertEquals("high performance web server", available[0].description)
    }

    @Test
    fun `仓库列表解析与受控保存`() {
        val repos = RouterPackageCommands.parseApkRepositories(
            "REPO|/etc/apk/repositories.d/customfeeds.list|1|1|https://dl.example.com/releases\n" +
                "REPO|/etc/apk/repositories.d/distfeed|2|0|https://dl.example.com/dist\n",
        )
        assertEquals(2, repos.size)
        assertEquals(true, repos[0].enabled)
        assertEquals(false, repos[1].enabled)
        assertEquals("customfeeds.list", repos[0].source?.substringAfterLast('/'))
        val save = RouterPackageCommands.buildApkSaveRepositoriesCommand(repos)
        assertTrue(save.contains("apk update"))
        assertTrue(save.contains("customfeeds.list"))
        assertThrows(IllegalArgumentException::class.java) {
            RouterPackageCommands.buildApkSaveRepositoriesCommand(
                listOf(RouterPackageCommands.ApkRepository(1, "ftp://bad", true)),
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            RouterPackageCommands.buildApkSaveRepositoriesCommand(
                listOf(RouterPackageCommands.ApkRepository(1, "https://a", false)),
            )
        }
    }

    @Test
    fun `包操作命令转义`() {
        assertEquals("apk add \"nginx\"", RouterPackageCommands.buildApkInstallCommand("nginx"))
        assertEquals("apk del \"nginx\"", RouterPackageCommands.buildApkRemoveCommand("nginx"))
        // 与 TS 一致:非法字符被清洗而非抛错。
        assertEquals("apk add \"nginxreboot\"", RouterPackageCommands.buildApkInstallCommand("nginx; reboot"))
        assertTrue(RouterPackageCommands.buildApkSearchCommand("luci").contains("apk search -v \"*luci*\""))
    }
}

class RouterFileCommandsTest {
    @Test
    fun `路径规范化与拼接`() {
        assertEquals("/", RouterFileCommands.normalizeRemotePath("/"))
        assertEquals("/etc/config", RouterFileCommands.normalizeRemotePath("/etc/config/"))
        assertEquals("/etc/config", RouterFileCommands.normalizeRemotePath("/etc/./config"))
        assertEquals("/etc", RouterFileCommands.normalizeRemotePath("/etc/config/.."))
        assertThrows(IllegalArgumentException::class.java) {
            RouterFileCommands.normalizeRemotePath("etc/config")
        }
        assertEquals("/etc/new.conf", RouterFileCommands.joinRemotePath("/etc", "new.conf"))
        assertThrows(IllegalArgumentException::class.java) {
            RouterFileCommands.joinRemotePath("/etc", "a/b")
        }
        assertEquals("/etc", RouterFileCommands.parentRemotePath("/etc/config"))
        assertEquals("/", RouterFileCommands.parentRemotePath("/etc"))
    }

    @Test
    fun `目录列表解析按目录优先排序`() {
        val entries = RouterFileCommands.parseDirectoryEntries(
            "config\td\t644\t4096\t2026-01-01 10:00\nhostname\tf\t644\t128\t2026-01-02 09:00\nlink\tl\t777\t9\t2026-01-03 08:00",
            "/etc",
        )
        assertEquals(3, entries.size)
        assertEquals(RemoteEntryKind.DIRECTORY, entries[0].kind)
        assertEquals("config", entries[0].name)
        assertEquals("/etc/config", entries[0].path)
        assertEquals(128L, entries[1].size)
        assertEquals("644", entries[1].mode)
        assertTrue(RouterFileCommands.buildListDirectoryCommand("/etc").contains("__MANUS_NOT_DIRECTORY__"))
    }

    @Test
    fun `文本读写与权限命令`() {
        val (content, tooLarge) = RouterFileCommands.parseReadableText("__MANUS_FILE_TOO_LARGE__:90000")
        assertNull(content)
        assertEquals(90000L, tooLarge)
        val (okContent, okLarge) = RouterFileCommands.parseReadableText("hello")
        assertEquals("hello", okContent)
        assertNull(okLarge)
        assertTrue(RouterFileCommands.buildWriteTextCommand("/etc/a", "aGk=", "/tmp/.t1").contains("base64 -d"))
        assertEquals("chmod 644 '/etc/a.conf'", RouterFileCommands.buildChmodCommand("/etc/a.conf", "644"))
        assertThrows(IllegalArgumentException::class.java) {
            RouterFileCommands.buildChmodCommand("/etc/a.conf", "999")
        }
        assertTrue(RouterFileCommands.buildDeleteCommand("/etc/a").startsWith("rm -rf '/etc/a'"))
        assertEquals("1.5 MB", RouterFileCommands.formatRemoteSize(1024 * 1536))
        assertEquals("大小未知", RouterFileCommands.formatRemoteSize(null))
    }

    @Test
    fun `文件过滤与排序`() {
        val entries = listOf(
            RemoteFileEntry("b.txt", "/b.txt", RemoteEntryKind.FILE, "644", 20L, "2026-01-02"),
            RemoteFileEntry("A.txt", "/A.txt", RemoteEntryKind.FILE, "644", 100L, "2026-01-03"),
            RemoteFileEntry("dir", "/dir", RemoteEntryKind.DIRECTORY, "755", null, null),
        )
        val filtered = FileManagerUtils.filterFileEntries(entries, " a.")
        assertEquals(1, filtered.size)
        val bySize = FileManagerUtils.sortFileEntries(entries, FileSortMode.SIZE)
        assertEquals("dir", bySize[0].name)
        assertEquals("A.txt", bySize[1].name)
        val byModified = FileManagerUtils.sortFileEntries(entries, FileSortMode.MODIFIED)
        assertEquals("A.txt", byModified[1].name)
    }
}

class TrafficMonitorTest {
    private fun iface(name: String, device: String, up: Boolean = true, rx: Double? = 10.0, tx: Double? = 20.0) =
        InterfaceStatus(name, device, up, emptyList(), emptyList(), null, rx, tx)

    @Test
    fun `默认选择 WAN 接口`() {
        val (items, source) = TrafficMonitor.selectTrafficInterfaces(
            listOf(iface("lan", "br-lan"), iface("wan", "eth0")),
        )
        assertEquals(TrafficSource.WAN, source)
        assertEquals("wan:eth0", TrafficMonitor.trafficInterfaceId(items[0]))
    }

    @Test
    fun `速率计算与历史裁剪`() {
        val previous = TrafficSnapshot(1000, 100.0, 200.0, TrafficSource.WAN)
        val current = TrafficSnapshot(4000, 400.0, 500.0, TrafficSource.WAN)
        val rate = TrafficMonitor.calculateTrafficRate(previous, current)
        assertEquals(100.0, rate!!.rxBytesPerSecond, 0.01)
        assertEquals(100.0, rate.txBytesPerSecond, 0.01)
        assertNull(TrafficMonitor.calculateTrafficRate(null, current))
        assertNull(TrafficMonitor.calculateTrafficRate(current, current))
        var history = emptyList<com.app.openwrtstatusapp.core.traffic.TrafficRate>()
        history = TrafficMonitor.appendTrafficRate(history, rate, 3)
        history = TrafficMonitor.appendTrafficRate(history, rate, 3)
        history = TrafficMonitor.appendTrafficRate(history, rate, 3)
        history = TrafficMonitor.appendTrafficRate(history, rate, 3)
        assertEquals(3, history.size)
        assertEquals("100.0 KB/s", TrafficMonitor.formatTrafficRate(1024.0 * 100))
        assertEquals("等待采样", TrafficMonitor.formatTrafficRate(null))
    }

    @Test
    fun `WAN 流量历史记录与用量汇总`() {
        val base = System.currentTimeMillis().let { it - it % 1000 }
        val points = listOf(
            com.app.openwrtstatusapp.core.traffic.TrafficHistoryPoint(
                java.time.Instant.ofEpochMilli(base).toString(),
                mapOf("wan" to Pair(100.0, 200.0)),
            ),
            com.app.openwrtstatusapp.core.traffic.TrafficHistoryPoint(
                java.time.Instant.ofEpochMilli(base + 1000).toString(),
                mapOf("wan" to Pair(300.0, 250.0)),
            ),
        )
        val usage = TrafficHistory.summarizeTrafficUsage(points, "wan", base, base + 2000)
        assertEquals(200.0, usage.rxBytes, 0.01)
        assertEquals(50.0, usage.txBytes, 0.01)
        assertEquals(2, usage.samples)
        assertEquals(0, TrafficHistory.recordPoint(emptyList(), listOf(iface("lan", "br-lan")), "x").size)
        val recorded = TrafficHistory.recordPoint(emptyList(), listOf(iface("wan", "eth0", rx = 5.0, tx = 6.0)), "t")
        assertEquals(1, recorded.size)
        assertEquals("wan" to Pair(5.0, 6.0), recorded[0].interfaces.entries.first().toPair())
    }
}

class GithubReleaseTest {
    @Test
    fun `解析合法与非法 Release 链接`() {
        val (owner, repo, tag) = GithubReleaseClient.parseGithubReleaseUrl(
            "https://github.com/openwrt/openwrt/releases",
        )
        assertEquals("openwrt", owner)
        assertEquals("openwrt", repo)
        assertNull(tag)
        val (owner2, repo2, tag2) = GithubReleaseClient.parseGithubReleaseUrl(
            "https://github.com/openwrt/openwrt/releases/tag/v24.10.0",
        )
        assertEquals("v24.10.0", tag2)
        assertEquals("openwrt", owner2)
        assertEquals("openwrt", repo2)
        assertThrows(IllegalArgumentException::class.java) {
            GithubReleaseClient.parseGithubReleaseUrl("http://github.com/a/b/releases")
        }
        assertThrows(IllegalArgumentException::class.java) {
            GithubReleaseClient.parseGithubReleaseUrl("https://gitlab.com/a/b/releases")
        }
    }

    @Test
    fun `版本比较`() {
        assertEquals(1, GithubReleaseClient.compareReleaseVersion("24.10.0", "v24.10.1"))
        assertEquals(-1, GithubReleaseClient.compareReleaseVersion("25.12", "24.10.1"))
        assertEquals(0, GithubReleaseClient.compareReleaseVersion("v1.2.3", "1.2.3"))
        assertNull(GithubReleaseClient.compareReleaseVersion("", "1.0"))
    }
}
