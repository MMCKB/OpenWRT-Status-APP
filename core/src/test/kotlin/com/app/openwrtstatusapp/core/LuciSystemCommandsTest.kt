package com.app.openwrtstatusapp.core

import com.app.openwrtstatusapp.core.commands.DropbearInstance
import com.app.openwrtstatusapp.core.commands.LuciSystemCommands
import com.app.openwrtstatusapp.core.commands.LuciSystemParsers
import com.app.openwrtstatusapp.core.commands.MountPoint
import com.app.openwrtstatusapp.core.commands.NetworkDeviceSettings
import com.app.openwrtstatusapp.core.commands.NetworkGlobalSettings
import com.app.openwrtstatusapp.core.commands.NetworkInterfaceSettings
import com.app.openwrtstatusapp.core.commands.ScheduledAction
import com.app.openwrtstatusapp.core.commands.SshAccessSettings
import com.app.openwrtstatusapp.core.commands.UhttpdSettings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** 平移自 tests/openwrt-luci-system.test.ts。 */
class LuciSystemCommandsTest {
    @Test
    fun `解析启动项 LED 挂载和接口快照`() {
        assertEquals(
            listOf(
                com.app.openwrtstatusapp.core.commands.StartupService("ddns", false),
                com.app.openwrtstatusapp.core.commands.StartupService("network", true),
            ),
            LuciSystemParsers.parseStartupServices("STARTUP|network|enabled\nSTARTUP|ddns|disabled"),
        )
        assertEquals(
            listOf(
                com.app.openwrtstatusapp.core.commands.LedSetting(
                    section = "wan", name = "WAN", sysfs = "green:wan", trigger = "netdev",
                    delayOn = "", delayOff = "", netdevDevice = "", netdevMode = "link",
                ),
            ),
            LuciSystemParsers.parseLedSettings("LED|wan|name|WAN\nLED|wan|sysfs|green:wan\nLED|wan|trigger|netdev"),
        )
        assertEquals(
            listOf(
                MountPoint(
                    section = "usb", target = "/mnt/usb", device = "/dev/sda1",
                    fstype = "ext4", enabled = true, enabledFsck = true,
                ),
            ),
            LuciSystemParsers.parseMountPoints(
                "MOUNT|usb|target|/mnt/usb\nMOUNT|usb|device|/dev/sda1\nMOUNT|usb|fstype|ext4\n" +
                    "MOUNT|usb|enabled|1\nMOUNT|usb|enabled_fsck|1",
            ),
        )
        assertEquals(
            listOf(
                NetworkInterfaceSettings(
                    section = "lan", proto = "static", device = "br-lan",
                    ipaddr = "192.168.1.1", netmask = "255.255.255.0", gateway = "", dns = "",
                    auto = true, forceLink = false, defaultRoute = true, useCustomDns = false,
                    dnsMetric = "", metric = "", mptcp = "off", ip4Table = "", ip6Table = "",
                    delegate = true, ip6Assign = "", ip6Class = "", ip6Hint = "", ip6IfaceId = "",
                    ip6Weight = "", firewallZone = "",
                ),
            ),
            LuciSystemParsers.parseNetworkInterfaceSettings(
                "IFACE|lan|proto|static\nIFACE|lan|device|br-lan\nIFACE|lan|ipaddr|192.168.1.1\n" +
                    "IFACE|lan|netmask|255.255.255.0\nIFACE|lan|auto|1",
            ),
        )
        val ssh = LuciSystemParsers.parseSshAccessSettings(
            "SSH|installed|yes\nSSH|port|2222\nSSH|password|on\nSSH|rootpassword|off",
        )
        assertEquals(true, ssh.installed)
        assertEquals("2222", ssh.port)
        assertEquals(true, ssh.passwordAuth)
        assertEquals(false, ssh.rootPasswordAuth)
        assertEquals(0, ssh.instances.size)
    }

    @Test
    fun `为高风险配置生成受控重载命令且不额外创建配置副本`() {
        assertTrue(
            LuciSystemCommands.buildSaveMountCommand(
                MountPoint("usb", "/mnt/usb", "ABCD-1234", "ext4", enabled = false, enabledFsck = false),
            ).contains("uci set 'fstab.usb.enabled=0'"),
        )
        assertTrue(
            LuciSystemCommands.buildSaveSshAccessCommand(
                SshAccessSettings(false, "2222", true, false, emptyList()),
            ).contains("/etc/init.d/dropbear restart"),
        )
        assertTrue(
            LuciSystemCommands.buildSaveSshInstanceCommand(
                DropbearInstance(
                    section = "main", port = "2222", listenInterface = "lan wan",
                    passwordAuth = false, rootPasswordAuth = false, gatewayPorts = true, enabled = true,
                ),
            ).contains("dropbear.main.GatewayPorts=on"),
        )
        assertTrue(
            LuciSystemCommands.buildAddSshInstanceCommand(
                DropbearInstance(
                    section = "", port = "2223", listenInterface = "lan",
                    passwordAuth = true, rootPasswordAuth = true, gatewayPorts = false, enabled = true,
                ),
            ).contains("uci add dropbear dropbear"),
        )
        assertTrue(
            LuciSystemCommands.buildSaveNetworkInterfaceCommand(networkInterface()).contains(
                "/etc/init.d/network reload",
            ),
        )
        assertTrue(
            LuciSystemCommands.buildScheduledActionCommand("0", "4", "1-5", ScheduledAction.DDNS_REFRESH)
                .contains("/etc/init.d/ddns restart"),
        )
        assertFalse(LuciSystemCommands.buildLedSnapshotCommand().contains("\u0000"))
    }

    @Test
    fun `拒绝危险的系统配置输入`() {
        assertThrowsService("服务名称不合法") {
            LuciSystemCommands.buildStartupActionCommand("ddns; reboot", true)
        }
        assertThrowsService("SSH 端口") {
            LuciSystemCommands.buildSaveSshAccessCommand(
                SshAccessSettings(true, "0", true, true, emptyList()),
            )
        }
        assertThrowsService("配置段标识") {
            LuciSystemCommands.buildSaveNetworkInterfaceCommand(
                networkInterface().copy(section = "lan; reboot"),
            )
        }
        assertThrowsService("计划时间") {
            LuciSystemCommands.buildScheduledActionCommand("0; reboot", "4", "*", ScheduledAction.REBOOT)
        }
        assertThrowsService("路由器密码") {
            LuciSystemCommands.buildChangeRouterPasswordCommand("bad\npassword")
        }
        assertThrowsService("SSH 公钥格式") {
            LuciSystemCommands.buildAddSshAuthorizedKeyCommand("ssh-ed25519 invalid; reboot")
        }
        assertThrowsService("APK 公钥文件名") {
            LuciSystemCommands.buildAddApkRepositoryKeyCommand("bad/key", "key")
        }
        assertThrowsService("HTTP(S)") {
            LuciSystemCommands.buildFetchApkRepositoryKeyCommand("vendor", "ftp://example.com/key.pub")
        }
        assertThrowsService("SSH 端口") {
            LuciSystemCommands.buildAddSshInstanceCommand(
                DropbearInstance(
                    section = "", port = "0", listenInterface = "lan",
                    passwordAuth = true, rootPasswordAuth = true, gatewayPorts = false, enabled = true,
                ),
            )
        }
        assertThrowsService("MAC 地址") {
            LuciSystemCommands.buildSaveNetworkDeviceCommand(
                NetworkDeviceSettings("@device[0]", "br-lan", "bridge", "not-a-mac", "1500", true),
            )
        }
    }

    private fun assertThrowsService(messagePart: String, block: () -> Unit) {
        val error = assertThrows(IllegalArgumentException::class.java, block)
        assertTrue("期望包含“$messagePart”,实际:${error.message}", error.message!!.contains(messagePart))
    }

    private fun networkInterface() = NetworkInterfaceSettings(
        section = "lan", proto = "static", device = "br-lan",
        ipaddr = "192.168.1.1", netmask = "255.255.255.0", gateway = "",
        dns = "1.1.1.1", auto = true, forceLink = false, defaultRoute = true,
        useCustomDns = true, dnsMetric = "", metric = "", mptcp = "off",
        ip4Table = "", ip6Table = "", delegate = true, ip6Assign = "", ip6Class = "",
        ip6Hint = "", ip6IfaceId = "", ip6Weight = "", firewallZone = "lan",
    )

    @Test
    fun `兼容 LuCI 生成的匿名 UCI 配置段`() {
        assertEquals(
            listOf(
                com.app.openwrtstatusapp.core.commands.LedSetting(
                    section = "@led[0]", name = "wan", sysfs = "green:wan", trigger = "netdev",
                    delayOn = "", delayOff = "", netdevDevice = "", netdevMode = "link",
                ),
            ),
            LuciSystemParsers.parseLedSettings(
                "LED|@led[0]|name|wan\nLED|@led[0]|sysfs|green:wan\nLED|@led[0]|trigger|netdev",
            ),
        )
        val mount = LuciSystemParsers.parseMountPoints(
            "MOUNT|@mount[0]|section|@mount[0]\nMOUNT|@mount[0]|target|/mnt/usb\n" +
                "MOUNT|@mount[0]|uuid|ABCD-1234\nMOUNT|@mount[0]|fstype|ext4\n" +
                "MOUNT|@mount[0]|enabled|1\nMOUNT|@mount[0]|enabled_fsck|0",
        )
        assertEquals("@mount[0]", mount[0].section)
        assertEquals("/mnt/usb", mount[0].target)
        assertEquals("ABCD-1234", mount[0].device)
        assertTrue(
            LuciSystemCommands.buildSaveLedCommand(
                com.app.openwrtstatusapp.core.commands.LedSetting(
                    section = "@led[0]", name = "wan", sysfs = "green:wan", trigger = "netdev",
                    delayOn = "1000", delayOff = "1000", netdevDevice = "eth0", netdevMode = "link",
                ),
            ).contains("'system.@led[0].trigger=netdev'"),
        )
        assertTrue(
            LuciSystemCommands.buildSaveMountCommand(
                MountPoint("@mount[0]", "/mnt/usb", "ABCD-1234", "ext4", enabled = false, enabledFsck = false),
            ).contains("'fstab.@mount[0].enabled=0'"),
        )
    }

    @Test
    fun `解析并安全保存管理权配置`() {
        assertEquals(
            listOf(
                com.app.openwrtstatusapp.core.commands.SshAuthorizedKey(
                    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleMaterial laptop",
                    "ssh-ed25519", "laptop",
                ),
            ),
            LuciSystemParsers.parseSshAuthorizedKeys(
                "SSHKEY|ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleMaterial laptop\nSSHKEY|# comment",
            ),
        )
        assertEquals(
            listOf(com.app.openwrtstatusapp.core.commands.ApkRepositoryKey("vendor.pub", 456)),
            LuciSystemParsers.parseApkRepositoryKeys("APKKEY|vendor.pub|456"),
        )
        val uhttpd = LuciSystemParsers.parseUhttpdSettings(
            "UHTTPD|installed|yes\nUHTTPD|main|section|main\nUHTTPD|main|listen_http|0.0.0.0:80\n" +
                "UHTTPD|main|listen_https|0.0.0.0:443\nUHTTPD|main|redirect_https|1",
        )
        assertEquals(UhttpdSettings(true, "main", "0.0.0.0:80", "0.0.0.0:443", true), uhttpd)
        assertTrue(LuciSystemCommands.buildChangeRouterPasswordCommand("safe-password").contains("chpasswd"))
        assertTrue(
            LuciSystemCommands.buildAddSshAuthorizedKeyCommand(
                "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleMaterial laptop",
            ).contains("authorized_keys"),
        )
        assertTrue(
            LuciSystemCommands.buildAddApkRepositoryKeyCommand("vendor", "public-key")
                .contains("/etc/apk/keys/vendor.pub"),
        )
        assertTrue(
            LuciSystemCommands.buildFetchApkRepositoryKeyCommand("vendor", "https://example.com/keys/vendor.pub")
                .contains("uclient-fetch"),
        )
        assertTrue(
            LuciSystemCommands.buildSaveUhttpdCommand(UhttpdSettings(true, "main", "", "", true))
                .contains("/etc/init.d/uhttpd reload"),
        )
        assertFalse(
            LuciSystemCommands.buildSaveUhttpdCommand(UhttpdSettings(true, "main", "", "", true))
                .contains("listen_http"),
        )
    }

    @Test
    fun `解析 LuCI Dropbear 多实例及其监听接口和权限`() {
        val ssh = LuciSystemParsers.parseSshAccessSettings(
            "SSH|installed|yes\nSSHINSTANCE|main|section|main\nSSHINSTANCE|main|Port|22\n" +
                "SSHINSTANCE|main|Interface|lan wan\nSSHINSTANCE|main|PasswordAuth|on\n" +
                "SSHINSTANCE|main|RootPasswordAuth|off\nSSHINSTANCE|main|GatewayPorts|on\n" +
                "SSHINSTANCE|main|enable|1\nSSHINSTANCE|guest|section|guest\n" +
                "SSHINSTANCE|guest|Port|2222\nSSHINSTANCE|guest|enable|0",
        )
        assertEquals(true, ssh.installed)
        assertEquals("22", ssh.port)
        assertEquals(true, ssh.passwordAuth)
        assertEquals(false, ssh.rootPasswordAuth)
        assertEquals(2, ssh.instances.size)
        val main = ssh.instances[0]
        assertEquals("main", main.section)
        assertEquals("22", main.port)
        assertEquals("lan wan", main.listenInterface)
        assertEquals(true, main.passwordAuth)
        assertEquals(false, main.rootPasswordAuth)
        assertEquals(true, main.gatewayPorts)
        assertEquals(true, main.enabled)
        val guest = ssh.instances[1]
        assertEquals("guest", guest.section)
        assertEquals("2222", guest.port)
        assertEquals(false, guest.enabled)
    }

    @Test
    fun `解析接口运行状态并提供接口设备和全局网络的受控操作`() {
        assertEquals(
            listOf(
                com.app.openwrtstatusapp.core.commands.NetworkInterfaceStatus(
                    section = "wan", proto = "dhcp", device = "eth0.2",
                    ipv4 = listOf("203.0.113.2"), ipv6 = listOf("2001:db8::2"),
                    mac = "00:11:22:33:44:55", up = true, uptimeSeconds = 3661,
                ),
            ),
            LuciSystemParsers.parseNetworkInterfaceStatus(
                """{"interface":[{"interface":"wan","proto":"dhcp","l3_device":"eth0.2","up":true,"uptime":3661,""" +
                    """"ipv4-address":[{"address":"203.0.113.2"}],"ipv6-address":[{"address":"2001:db8::2"}]}]}""" +
                    "\nIFMAC|eth0.2|00:11:22:33:44:55",
            ),
        )
        assertTrue(
            LuciSystemCommands.buildNetworkInterfaceRestartCommand("wan").contains("ifdown 'wan'"),
        )
        assertTrue(
            LuciSystemCommands.buildNetworkInterfaceDeleteCommand("wan").contains("uci -q delete 'network.wan'"),
        )
        val device = LuciSystemParsers.parseNetworkDeviceSettings(
            "DEVICE|@device[0]|section|@device[0]\nDEVICE|@device[0]|name|br-lan\n" +
                "DEVICE|@device[0]|type|bridge\nDEVICE|@device[0]|mtu|1500\nDEVICE|@device[0]|ipv6|1",
        )
        assertEquals("@device[0]", device[0].section)
        assertEquals("br-lan", device[0].name)
        assertEquals("bridge", device[0].type)
        assertEquals("1500", device[0].mtu)
        assertEquals(true, device[0].ipv6)
        assertEquals(
            NetworkGlobalSettings("globals", "fd00:1234::/48", true),
            LuciSystemParsers.parseNetworkGlobalSettings(
                "GLOBAL|globals|section|globals\nGLOBAL|globals|ula_prefix|fd00:1234::/48\n" +
                    "GLOBAL|globals|packet_steering|1",
            ),
        )
        assertTrue(
            LuciSystemCommands.buildSaveNetworkDeviceCommand(
                NetworkDeviceSettings("@device[0]", "br-lan", "bridge", "00:11:22:33:44:55", "1500", true),
            ).contains("/etc/init.d/network reload"),
        )
        assertTrue(
            LuciSystemCommands.buildSaveNetworkGlobalCommand(
                NetworkGlobalSettings("globals", "fd00:1234::/48", true),
            ).contains("packet_steering=1"),
        )
    }
}
