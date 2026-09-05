package com.app.openwrtstatusapp.core

import com.app.openwrtstatusapp.core.model.RouterProfile
import com.app.openwrtstatusapp.core.model.SystemStatus
import com.app.openwrtstatusapp.core.ssh.SshTarget
import com.app.openwrtstatusapp.core.ubus.StatusParsers
import com.app.openwrtstatusapp.core.ubus.formatBytes
import com.app.openwrtstatusapp.core.ubus.formatUptime
import com.app.openwrtstatusapp.core.ubus.memoryUsagePercent
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/** 平移自 tests/openwrt-client.test.ts。 */
class StatusParsersTest {
    private fun json(source: String) = Json.parseToJsonElement(source)

    @Test
    fun `规范化没有 ubus 的管理地址`() {
        assertEquals("http://192.168.1.1/ubus", StatusParsers.normalizeRouterEndpoint("192.168.1.1"))
        assertEquals(
            "https://router.local/ubus",
            StatusParsers.normalizeRouterEndpoint("https://router.local/ubus/"),
        )
    }

    @Test
    fun `从 ubus 返回中生成真实字段对应的状态对象`() {
        val status = StatusParsers.buildRouterStatus(
            "router-1",
            json("""{"hostname":"gateway","model":"GL.iNet MT3000","release":{"description":"OpenWrt 24.10"}}"""),
            json("""{"uptime":90061,"load":[6553,13107,19660],"memory":{"total":268435456,"free":120000000,"buffered":20000000,"cached":30000000}}"""),
            json("""{"interface":[{"interface":"wan","l3_device":"eth0","up":true,"ipv4-address":[{"address":"203.0.113.8"}],"ipv6-address":[{"address":"2001:db8::8"}],"uptime":3600,"statistics":{"rx_bytes":1024,"tx_bytes":2048}}]}"""),
            json("""{"radio0":{"up":true,"channel":36,"interfaces":[{"ifname":"wlan0","up":true,"config":{"ssid":"Home"},"assoclist":{"stationA":{}}}]}}"""),
        )
        assertEquals(true, status.online)
        assertEquals("gateway", status.system?.hostname)
        assertEquals(0.09999237048905166, status.system?.load?.first!!, 0.0)
        assertEquals(0.2, status.system?.load?.second!!, 0.0)
        assertEquals(0.29999237048905164, status.system?.load?.third!!, 0.0)
        val wan = status.interfaces[0]
        assertEquals("wan", wan.name)
        assertEquals("eth0", wan.device)
        assertEquals(listOf("203.0.113.8"), wan.ipv4)
        assertEquals(true, wan.up)
        assertEquals(listOf("2001:db8::8"), wan.ipv6)
        assertEquals(1024.0, wan.rxBytes!!, 0.0)
        assertEquals(2048.0, wan.txBytes!!, 0.0)
        val wireless = status.wireless[0]
        assertEquals("Home", wireless.ssid)
        assertEquals(1, wireless.clients)
        assertEquals(true, wireless.up)
    }

    @Test
    fun `当网络接口返回中缺少统计时合并 network device 的字节计数`() {
        val status = StatusParsers.buildRouterStatus(
            "router-device-stats",
            json("{}"),
            json("""{"memory":{"total":1}}"""),
            json("""{"interface":[{"interface":"wan","l3_device":"eth0","up":true}]}"""),
            json("{}"),
            emptyList(),
            json("""{"eth0":{"statistics":{"rx_bytes":"4096","tx_bytes":8192}}}"""),
        )
        assertEquals("eth0", status.interfaces[0].device)
        assertEquals(4096.0, status.interfaces[0].rxBytes!!, 0.0)
        assertEquals(8192.0, status.interfaces[0].txBytes!!, 0.0)
    }

    @Test
    fun `兼容嵌套 wireless 对象对象型接口和数值信道`() {
        val status = StatusParsers.buildRouterStatus(
            "router-2",
            json("""{"hostname":"gateway","model":"Router","release":{"description":"OpenWrt"}}"""),
            json("""{"uptime":1,"load":[0,0,0],"memory":{"total":1,"free":1}}"""),
            json("""{"interface":[]}"""),
            json("""{"wireless":{"radio0":{"channel":149,"up":true,"interfaces":{"primary":{"ifname":"phy0-ap0","ssid":"Guest","stations":[{},{}]}}}}}"""),
        )
        assertEquals(
            listOf(
                com.app.openwrtstatusapp.core.model.WirelessStatus(
                    name = "phy0-ap0", ssid = "Guest", up = true, channel = "149", clients = 2,
                ),
            ),
            status.wireless,
        )
    }

    @Test
    fun `将无线字符串状态与已启用配置识别为在线`() {
        val status = StatusParsers.buildRouterStatus(
            "router-3",
            json("""{"hostname":"gateway","model":"Router","release":{"description":"OpenWrt"}}"""),
            json("""{"uptime":1,"load":[0,0,0],"memory":{"total":1,"free":1}}"""),
            json("""{"interface":[]}"""),
            json("""{"radio0":{"disabled":"0","channel":6,"interfaces":{"primary":{"ifname":"wlan0","state":"up","config":{"ssid":"Home"}}}},"radio1":{"disabled":false,"config":{"ssid":"Guest","mode":"ap"}}}"""),
        )
        assertEquals(2, status.wireless.size)
        assertEquals("wlan0", status.wireless[0].name)
        assertEquals("Home", status.wireless[0].ssid)
        assertEquals(true, status.wireless[0].up)
        assertEquals("6", status.wireless[0].channel)
        assertEquals("Guest", status.wireless[1].ssid)
        assertEquals(true, status.wireless[1].up)
    }

    @Test
    fun `将明确禁用的无线接口标记为未启用`() {
        val status = StatusParsers.buildRouterStatus(
            "router-4",
            json("{}"),
            json("""{"memory":{"total":1}}"""),
            json("""{"interface":[]}"""),
            json("""{"radio0":{"disabled":true,"config":{"ssid":"Disabled"}}}"""),
        )
        assertEquals("Disabled", status.wireless[0].ssid)
        assertEquals(false, status.wireless[0].up)
    }

    @Test
    fun `格式化仪表盘中的数字`() {
        assertEquals("1.0 MB", formatBytes(1048576.0))
        assertEquals("1 天 1 小时", formatUptime(90061))
        assertEquals(
            60,
            memoryUsagePercent(
                SystemStatus(
                    hostname = "a", model = "b", firmware = "c", uptimeSeconds = 1,
                    load = null, memoryTotal = 100.0, memoryAvailable = 40.0,
                ),
            ),
        )
    }

    @Test
    fun `从路由器资料生成不含密码的 SSH 交接地址`() {
        val profile = RouterProfile(
            id = "router-1", name = "主路由", baseUrl = "http://192.168.1.1/ubus",
            username = "root", sshPort = 22022, createdAt = "2026-08-15",
        )
        assertEquals("root@192.168.1.1:22022", SshTarget.getSshTarget(profile))
        assertEquals("ssh://root@192.168.1.1:22022", SshTarget.makeSshUri(profile))
        assertEquals(
            "ssh://root@[fd00::1]:22",
            SshTarget.makeSshUri(profile.copy(baseUrl = "http://[fd00::1]/ubus", sshPort = 22)),
        )
    }
}
