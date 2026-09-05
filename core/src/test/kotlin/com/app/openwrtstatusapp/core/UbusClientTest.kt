package com.app.openwrtstatusapp.core

import com.app.openwrtstatusapp.core.ubus.UbusClient
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** ubus 客户端流程测试:登录、会话复用与失效重试(新能力)。 */
class UbusClientTest {
    private lateinit var server: MockWebServer
    private lateinit var client: UbusClient

    /** 状态统计:login 次数与其它调用次数。 */
    private var loginCount = 0
    private var callCount = 0

    /** 设置后在第 N 次 board 调用时返回未授权,模拟缓存会话失效。 */
    private var rejectBoardAtCallCount = Int.MAX_VALUE

    private val boardJson = """{"hostname":"gateway","model":"GL.iNet MT3000","release":{"description":"OpenWrt 24.10"}}"""
    private val infoJson = """{"uptime":90061,"load":[6553,13107,19660],"memory":{"total":268435456,"free":120000000,"buffered":20000000,"cached":30000000}}"""
    private val ifaceJson = """{"interface":[{"interface":"wan","l3_device":"eth0","up":true,"ipv4-address":[{"address":"203.0.113.8"}],"statistics":{"rx_bytes":1024,"tx_bytes":2048}}]}"""
    private val wirelessJson = """{"radio0":{"up":true,"channel":36,"interfaces":[{"ifname":"wlan0","up":true,"config":{"ssid":"Home"},"assoclist":{"stationA":{}}}]}}"""

    private val dispatcher = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            val body = request.body.readUtf8()
            val root = Json.parseToJsonElement(body) as JsonObject
            val params = root["params"] as JsonArray
            val obj = (params[1] as JsonPrimitive).content
            val method = (params[2] as JsonPrimitive).content
            val payload = when {
                obj == "session" && method == "login" -> {
                    loginCount += 1
                    """{"ubus_rpc_session":"sess-$loginCount","timeout":300}"""
                }
                obj == "system" && method == "board" -> {
                    callCount += 1
                    if (callCount == rejectBoardAtCallCount) {
                        return ok("""{"jsonrpc":"2.0","id":1,"result":[6,{}]}""")
                    }
                    boardJson
                }
                obj == "system" && method == "info" -> {
                    callCount += 1
                    infoJson
                }
                obj == "network.interface" -> {
                    callCount += 1
                    ifaceJson
                }
                obj == "network.wireless" -> {
                    callCount += 1
                    wirelessJson
                }
                obj == "network.device" -> {
                    callCount += 1
                    "{}"
                }
                else -> {
                    callCount += 1
                    "{}"
                }
            }
            return ok("""{"jsonrpc":"2.0","id":1,"result":[0,$payload]}""")
        }

        private fun ok(payload: String): MockResponse =
            MockResponse()
                .addHeader("Content-Type", "application/json")
                .setBody(payload)
    }

    @Before
    fun setUp() {
        server = MockWebServer()
        server.dispatcher = dispatcher
        server.start()
        client = UbusClient()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun endpoint() = server.url("/ubus").toString()

    @Test
    fun `拉取完整状态并解析`() = runBlocking {
        val status = client.fetchRouterStatus("router-1", endpoint(), "root", "password")
        assertEquals("gateway", status.system?.hostname)
        assertEquals("GL.iNet MT3000", status.system?.model)
        assertEquals("wan", status.interfaces[0].name)
        assertEquals(1024.0, status.interfaces[0].rxBytes!!, 0.0)
        assertEquals("Home", status.wireless[0].ssid)
        assertEquals(1, status.wireless[0].clients)
        assertEquals(0, status.warnings.size)
        assertEquals(1, loginCount)
        assertTrue(callCount >= 4)
    }

    @Test
    fun `连续刷新复用会话而不是每次重新登录`() = runBlocking {
        client.fetchRouterStatus("router-1", endpoint(), "root", "password")
        val loginsAfterFirst = loginCount
        client.fetchRouterStatus("router-1", endpoint(), "root", "password")
        client.fetchRouterStatus("router-1", endpoint(), "root", "password")
        assertEquals("会话应只登录一次", 1, loginsAfterFirst)
        assertEquals("后续刷新不应再次登录", 1, loginCount)
    }

    @Test
    fun `缓存会话失效时自动重新登录重试`() = runBlocking {
        client.fetchRouterStatus("router-1", endpoint(), "root", "password")
        assertEquals(1, loginCount)
        // 第一次 fetch 发出 6 次调用(board/info + 4 个可选调用),下一次 board 调用是第 7 次。
        rejectBoardAtCallCount = 7
        val status = client.fetchRouterStatus("router-1", endpoint(), "root", "password")
        assertEquals("gateway", status.system?.hostname)
        assertEquals("缓存会话被拒后应重新登录一次", 2, loginCount)
    }
}
