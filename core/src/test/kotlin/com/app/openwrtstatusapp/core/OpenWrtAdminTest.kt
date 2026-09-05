package com.app.openwrtstatusapp.core

import com.app.openwrtstatusapp.core.commands.DhcpStaticLeaseDraft
import com.app.openwrtstatusapp.core.commands.DnsFamily
import com.app.openwrtstatusapp.core.commands.ManagedBy
import com.app.openwrtstatusapp.core.commands.OpenWrtAdmin
import com.app.openwrtstatusapp.core.commands.ServiceAction
import com.app.openwrtstatusapp.core.commands.SignalQuality
import com.app.openwrtstatusapp.core.commands.WanDiagnosticKind
import com.app.openwrtstatusapp.core.commands.WIFI_ENCRYPTION_OPTIONS
import com.app.openwrtstatusapp.core.commands.WolDevice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** 平移自 tests/openwrt-admin.test.ts。 */
class OpenWrtAdminTest {
    @Test
    fun `合并 DHCP 租约与邻居表为客户端列表`() {
        val clients = OpenWrtAdmin.parseConnectedClients(
            "__LEASES__\n12345 aa:bb:cc:dd:ee:ff 192.168.1.10 phone *\n" +
                "__NEIGH__\n192.168.1.10 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE",
        )
        assertEquals(1, clients.size)
        assertEquals("AA:BB:CC:DD:EE:FF", clients[0].mac)
        assertEquals("phone", clients[0].hostname)
        assertEquals("192.168.1.10", clients[0].ipv4)
        assertEquals("12345", clients[0].expiresAt)
        assertEquals(true, clients[0].online)
    }

    @Test
    fun `解析 DHCP 动态租约与 UCI 静态租约并生成受控写入命令`() {
        val snapshot = OpenWrtAdmin.parseDhcpLeaseSnapshot(
            "__DHCP_LEASES__\n12345 aa:bb:cc:dd:ee:ff 192.168.1.10 phone *\n__DHCP_STATIC__\n" +
                "dhcp.openwrt_app_lease='host'\ndhcp.openwrt_app_lease.name='phone'\n" +
                "dhcp.openwrt_app_lease.mac='AA:BB:CC:DD:EE:FF'\ndhcp.openwrt_app_lease.ip='192.168.1.20'\n" +
                "dhcp.openwrt_app_lease.leasetime='12h'",
        )
        assertEquals("AA:BB:CC:DD:EE:FF", snapshot.dynamic[0].mac)
        assertEquals("192.168.1.10", snapshot.dynamic[0].ipv4)
        assertEquals("phone", snapshot.dynamic[0].hostname)
        assertEquals("openwrt_app_lease", snapshot.static[0].section)
        assertEquals("192.168.1.20", snapshot.static[0].ipv4)
        assertEquals("12h", snapshot.static[0].leasetime)
        assertTrue(
            OpenWrtAdmin.buildDhcpStaticLeaseSaveCommand(
                DhcpStaticLeaseDraft(hostname = "NAS", mac = "aa:bb:cc:dd:ee:ff", ipv4 = "192.168.1.20", leasetime = "12h"),
            ).contains("uci commit dhcp; /etc/init.d/dnsmasq reload"),
        )
        assertFalse(
            OpenWrtAdmin.buildDhcpStaticLeaseSaveCommand(
                DhcpStaticLeaseDraft(section = "@host[0]", hostname = "NAS", mac = "aa:bb:cc:dd:ee:ff", ipv4 = "192.168.1.20"),
            ).contains("uci -q delete dhcp.@host[0];"),
        )
        assertTrue(
            OpenWrtAdmin.buildDhcpStaticLeaseDeleteCommand("openwrt_app_lease")
                .contains("uci -q delete dhcp.openwrt_app_lease"),
        )
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildDhcpStaticLeaseSaveCommand(
                DhcpStaticLeaseDraft(hostname = "NAS", mac = "bad", ipv4 = "192.168.1.20"),
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildDhcpStaticLeaseDeleteCommand("lease; reboot")
        }
    }

    @Test
    fun `从扫描结果生成保守信道建议并拒绝不安全参数`() {
        val snapshot = OpenWrtAdmin.parseWirelessOptimizationSnapshot(
            "RADIO|radio0|1\nSCAN|wlan0|" +
                """[{"ssid":"busy","bssid":"aa:bb:cc:dd:ee:ff","channel":1,"signal":-32},{"ssid":"quiet","bssid":"11:22:33:44:55:66","channel":11,"signal":-85}]""",
        )
        val recommendation = OpenWrtAdmin.recommendWirelessChannel(snapshot.radios[0], snapshot.networks)
        assertEquals(6, recommendation.suggestedChannel)
        assertEquals(
            "uci set wireless.radio0.channel='6'; uci commit wireless; wifi reload",
            OpenWrtAdmin.buildWirelessChannelApplyCommand("radio0", 6),
        )
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildWirelessChannelApplyCommand("radio0; reboot", 6)
        }
    }

    @Test
    fun `合并无线信号与客户端并按弱信号优先排序`() {
        val clients = OpenWrtAdmin.parseWeakSignalClients(
            "__WIFI_IFACE__|wlan0\nStation aa:bb:cc:dd:ee:ff (on wlan0)\n\tsignal: -79 dBm\n" +
                "Station 11:22:33:44:55:66 (on wlan0)\n\tsignal: -52 dBm\n" +
                "__LEASES__\n12345 aa:bb:cc:dd:ee:ff 192.168.1.20 weak-phone *\n" +
                "12345 11:22:33:44:55:66 192.168.1.30 tv *\n" +
                "__NEIGH__\n192.168.1.20 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE\n" +
                "192.168.1.30 dev br-lan lladdr 11:22:33:44:55:66 REACHABLE",
        )
        assertEquals(SignalQuality.WEAK, clients[0].quality)
        assertEquals("弱信号", clients[0].qualityLabel)
        assertEquals("weak-phone", clients[0].hostname)
        assertEquals(SignalQuality.GOOD, clients[1].quality)
    }

    @Test
    fun `解析 Docker 容器状态并阻止不安全命令`() {
        val snapshot = OpenWrtAdmin.parseDockerSnapshot(
            "__DOCKER_AVAILABLE__\nCONTAINER|a1b2c3|adguard|adguard/home:latest|Up 2 hours|0.0.0.0:3000->3000/tcp\n" +
                "CONTAINER|d4e5f6|old|alpine|Exited (0) 1 hour ago|\n__DOCKER_STATS__\nSTAT|a1b2c3|0.54%|32MiB / 128MiB",
        )
        assertEquals(true, snapshot.available)
        assertEquals("a1b2c3", snapshot.containers[0].id)
        assertEquals(true, snapshot.containers[0].running)
        assertEquals("0.54%", snapshot.containers[0].cpuPercent)
        assertEquals("32MiB / 128MiB", snapshot.containers[0].memoryUsage)
        assertEquals("docker restart a1b2c3", OpenWrtAdmin.buildDockerContainerCommand("a1b2c3", ServiceAction.RESTART))
        assertTrue(OpenWrtAdmin.buildDockerContainerLogsCommand("a1b2c3").contains("docker logs --tail 200 a1b2c3"))
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildDockerContainerCommand("a1; reboot", ServiceAction.START)
        }
    }

    @Test
    fun `解析性能基准和固件信息`() {
        val benchmark = OpenWrtAdmin.parsePerformanceBenchmark(
            "__BENCHMARK_SYSTEM__\nCPU|Qualcomm IPQ8074|4\nLOAD|0.25\nMEM|128000|64000\nSTORAGE|256000|64000|192000",
        )
        assertEquals("Qualcomm IPQ8074", benchmark.cpuModel)
        assertEquals(4.0, benchmark.cpuCores!!, 0.0)
        assertEquals(0.25, benchmark.loadAverage!!, 0.0)
        assertEquals(64000.0, benchmark.memoryAvailableKb!!, 0.0)
        assertTrue(OpenWrtAdmin.buildPerformanceBenchmarkCommand().contains("/proc/cpuinfo"))
        assertTrue(OpenWrtAdmin.buildPerformanceBenchmarkCommand().contains("df -k /overlay"))
        assertFalse(OpenWrtAdmin.buildPerformanceBenchmarkCommand().contains("ping -c"))
        val firmware = OpenWrtAdmin.parseFirmwareDeviceInfo(
            """{"model":"Example Router","board_name":"example,router","release":{"distribution":"OpenWrt","version":"25.12.0","revision":"r123","target":"ath79/generic"}}""",
        )
        assertEquals("Example Router", firmware.model)
        assertEquals("25.12.0", firmware.version)
        assertEquals("ath79/generic", firmware.target)
    }

    @Test
    fun `固件先校验再升级`() {
        val verification = OpenWrtAdmin.buildFirmwareVerifyCommand("/tmp/manus-router-update.bin")
        assertTrue(verification.contains("sysupgrade -T '/tmp/manus-router-update.bin'"))
        assertTrue(verification.contains("__FIRMWARE_VALID__"))
        assertEquals(
            "sysupgrade '/tmp/manus-router-update.bin'",
            OpenWrtAdmin.buildFirmwareUpgradeCommand("/tmp/manus-router-update.bin", true),
        )
        assertEquals(
            "sysupgrade -n '/tmp/manus-router-update.img'",
            OpenWrtAdmin.buildFirmwareUpgradeCommand("/tmp/manus-router-update.img", false),
        )
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildFirmwareVerifyCommand("/tmp/manus-update; reboot.bin")
        }
    }

    @Test
    fun `网络唤醒候选项与目标保存`() {
        assertTrue(OpenWrtAdmin.buildWolCandidatesSnapshotCommand().contains("ip neigh show"))
        val candidates = OpenWrtAdmin.parseWolCandidates(
            "__LEASES__\n12345 aa:bb:cc:dd:ee:ff 192.168.1.20 NAS *\n" +
                "__NEIGH__\n192.168.1.20 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE",
        )
        assertEquals(WolDevice("AA:BB:CC:DD:EE:FF", "NAS", "192.168.1.20"), candidates[0])
        assertTrue(
            OpenWrtAdmin.buildWolTargetSaveCommand(WolDevice("aa:bb:cc:dd:ee:ff", "NAS", "192.168.1.20"))
                .contains("uci commit wol"),
        )
    }

    @Test
    fun `区分无线与通用热区温度`() {
        val details = OpenWrtAdmin.parseRouterHardwareDetails(
            "__DETAIL_CPU__\nCPU|Example CPU|2\n__DETAIL_KERNEL__\n6.6.0\n" +
                "__DETAIL_WIFI_TEMPERATURES__\nWIFI_TEMP|52000\n" +
                "__DETAIL_SENSOR_TEMPERATURES__\nSENSOR_TEMP|43000\nSENSOR_TEMP|47",
        )
        assertEquals(listOf(52.0), details.wifiTemperaturesC)
        assertEquals(listOf(43.0, 47.0), details.sensorTemperaturesC)
    }

    @Test
    fun `硬盘测速命令与结果解析`() {
        val command = OpenWrtAdmin.buildDiskSpeedCommand("/mnt/data", 128)
        assertTrue(command.contains("test_file=\"\$dir/.openwrt-status-speed-test-\$\$.bin\""))
        assertTrue(command.contains("dd if=/dev/zero"))
        assertTrue(command.contains("rm -f \"\$test_file\""))
        val result = OpenWrtAdmin.parseDiskSpeedResult("DISK_SPEED_RESULT|/mnt/data|128|1600|800")
        assertEquals("/mnt/data", result.directory)
        assertEquals(128, result.fileSizeMB)
        assertEquals(80.0, result.writeSpeedMBps!!, 0.0)
        assertEquals(160.0, result.readSpeedMBps!!, 0.0)
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildDiskSpeedCommand("/mnt/data/../tmp", 128)
        }
    }

    @Test
    fun `防火墙拉黑命令与已拉黑解析`() {
        assertTrue(OpenWrtAdmin.buildBlockClientCommand("AA:bb:CC:dd:EE:ff").contains("openwrt_app_block_aa_bb_cc_dd_ee_ff"))
        assertTrue(OpenWrtAdmin.buildBlockClientCommand("AA:bb:CC:dd:EE:ff").contains("uci commit firewall"))
        assertTrue(
            OpenWrtAdmin.buildUnblockClientCommand("AA:bb:CC:dd:EE:ff")
                .contains("uci -q delete firewall.openwrt_app_block_aa_bb_cc_dd_ee_ff"),
        )
        assertEquals(
            setOf("AA:BB:CC:DD:EE:FF"),
            OpenWrtAdmin.parseBlockedClientMacs("before\n__BLOCKED__\nAA:bb:CC:dd:EE:ff\n"),
        )
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildBlockClientCommand("not-a-mac")
        }
    }

    @Test
    fun `网络唤醒命令安全检查`() {
        val command = OpenWrtAdmin.buildWakeOnLanCommand("AA:bb:CC:dd:EE:ff")
        assertTrue(command.contains("ubus call network.interface.lan status"))
        assertTrue(command.contains("etherwake -i \"\$WOL_IFACE\" -b AA:BB:CC:DD:EE:FF"))
        assertTrue(command.contains("wakeonlan AA:BB:CC:DD:EE:FF"))
        assertTrue(command.contains("__WOL_UNAVAILABLE__ 未检测到网络唤醒工具"))
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildWakeOnLanCommand("AA:BB; reboot")
        }
    }

    @Test
    fun `仅列出 LuCI 已保存的唤醒目标`() {
        val targets = OpenWrtAdmin.parseWolDevices(
            "__WOL_CONFIG__\nwol.nas='host'\nwol.nas.name='家庭 NAS'\nwol.nas.mac='aa:bb:cc:dd:ee:ff'\n" +
                "wol.desktop='host'\nwol.desktop.mac='11:22:33:44:55:66'\n" +
                "__WOL_DHCP__\n12345 aa:bb:cc:dd:ee:ff 192.168.1.20 ignored-name *\n" +
                "12345 77:88:99:aa:bb:cc 192.168.1.30 online-only *\n" +
                "__WOL_STATIC__\ndhcp.desktop='host'\ndhcp.desktop.name='书房电脑'\n" +
                "dhcp.desktop.mac='11:22:33:44:55:66'\ndhcp.desktop.ip='192.168.1.40'",
        )
        assertEquals(
            listOf(
                WolDevice("11:22:33:44:55:66", "书房电脑", "192.168.1.40"),
                WolDevice("AA:BB:CC:DD:EE:FF", "家庭 NAS", "192.168.1.20"),
            ),
            targets,
        )
        assertTrue(OpenWrtAdmin.buildWolDevicesSnapshotCommand().contains("uci -q show wol"))
        assertFalse(OpenWrtAdmin.buildWolDevicesSnapshotCommand().contains("ip neigh"))
    }

    @Test
    fun `删除无线段并在访客网络时清理关联配置`() {
        assertEquals(
            "uci -q delete wireless.home; uci commit wireless; wifi reload",
            OpenWrtAdmin.buildWifiDeleteCommand("home"),
        )
        assertTrue(
            OpenWrtAdmin.buildWifiDeleteCommand("openwrt_app_guest")
                .contains("uci -q delete firewall.openwrt_app_guest_to_wan"),
        )
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildWifiDeleteCommand("home; reboot")
        }
    }

    @Test
    fun `解析无线配置和服务快照`() {
        val configs = OpenWrtAdmin.parseWifiConfigs(
            "wireless.home.device='radio0'\nwireless.home.ssid='Home WiFi'\nwireless.home.disabled='0'",
        )
        assertEquals(1, configs.size)
        assertEquals("radio0", configs[0].device)
        assertEquals("Home WiFi", configs[0].ssid)
        assertEquals(false, configs[0].disabled)
        assertEquals("none", configs[0].encryption)
        assertEquals(listOf("docker", "lan"), OpenWrtAdmin.parseWifiNetworkBindings(
            "__WIFI_NETWORK__|lan\n__WIFI_NETWORK__|docker\n__WIFI_NETWORK__|lan",
        ))
        assertTrue(OpenWrtAdmin.buildWifiSnapshotCommand().contains("__WIFI_NETWORK__"))
        assertEquals("WPA2-PSK", WIFI_ENCRYPTION_OPTIONS.first { it.value == "psk2" }.label)
        assertTrue(
            OpenWrtAdmin.buildWifiSettingsSaveCommand(
                section = "home", ssid = "Home WiFi", encryption = "sae-mixed",
                key = "correct-horse-battery-staple", hidden = false, isolate = false, network = "lan docker",
            ).contains("uci set wireless.home.network='lan docker'"),
        )
        assertEquals(
            listOf(
                com.app.openwrtstatusapp.core.commands.ServiceState("dnsmasq", true, ManagedBy.OPENWRT, "running"),
                com.app.openwrtstatusapp.core.commands.ServiceState("adguard", true, ManagedBy.DOCKER, "Up 2 hours"),
            ),
            OpenWrtAdmin.parseServiceStates("OPENWRT|dnsmasq|running\nDOCKER|adguard|Up 2 hours"),
        )
    }

    @Test
    fun `拒绝不安全的诊断目标`() {
        assertTrue(OpenWrtAdmin.buildWanDiagnosticCommand("wan2", WanDiagnosticKind.PING, "1.1.1.1").contains("ping -I wan2"))
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildWanDiagnosticCommand("wan; reboot", WanDiagnosticKind.PING, "1.1.1.1")
        }
    }

    @Test
    fun `DNS 延迟测试支持双栈`() {
        assertTrue(
            OpenWrtAdmin.buildDnsLatencyCommand("wan", "1.1.1.1", DnsFamily.IPV4, "openwrt.org")
                .contains("nslookup -4 openwrt.org 1.1.1.1"),
        )
        assertTrue(
            OpenWrtAdmin.buildDnsLatencyCommand("wan6", "2606:4700:4700::1111", DnsFamily.IPV6)
                .contains("nslookup -6 openwrt.org 2606:4700:4700::1111"),
        )
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildDnsLatencyCommand("wan", "dns; reboot", DnsFamily.IPV4)
        }
    }

    @Test
    fun `仅允许受控服务命令和固定备份路径`() {
        assertEquals("/etc/init.d/dnsmasq restart", OpenWrtAdmin.buildServiceCommand("dnsmasq", ServiceAction.RESTART, ManagedBy.OPENWRT))
        assertEquals("docker stop adguard", OpenWrtAdmin.buildServiceCommand("adguard", ServiceAction.STOP, ManagedBy.DOCKER))
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildServiceCommand("evil; reboot", ServiceAction.START, ManagedBy.DOCKER)
        }
        assertThrows(IllegalArgumentException::class.java) {
            OpenWrtAdmin.buildServiceCommand("cron", ServiceAction.START, ManagedBy.OPENWRT)
        }
        assertTrue(OpenWrtAdmin.buildBackupCommand().contains(OpenWrtAdmin.BACKUP_REMOTE_PATH))
        assertEquals("sysupgrade -r ${OpenWrtAdmin.BACKUP_REMOTE_PATH}", OpenWrtAdmin.buildRestoreCommand())
    }
}
