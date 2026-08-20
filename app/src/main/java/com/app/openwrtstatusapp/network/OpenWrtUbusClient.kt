package com.app.openwrtstatusapp.network

import com.app.openwrtstatusapp.domain.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class OpenWrtConnectionException(message: String) : Exception(message)

class OpenWrtUbusClient {
    suspend fun fetchStatus(profile: RouterProfile, password: String): RouterStatus = withContext(Dispatchers.IO) {
        try {
            val endpoint = normalizeEndpoint(profile.baseUrl)
            val token = login(endpoint, profile.username, password)
            val board = call(endpoint, token, "system", "board")
            val info = call(endpoint, token, "system", "info")
            val interfaces = safeCall { call(endpoint, token, "network.interface", "dump") }
            val radios = safeCall { call(endpoint, token, "network.wireless", "status") }
            val devices = safeCall { call(endpoint, token, "network.device", "status") }
            mapStatus(profile.id, board, info, interfaces, radios, devices)
        } catch (e: Exception) { RouterStatus(profile.id, error = e.message ?: "无法访问路由器") }
    }

    fun normalizeEndpoint(value: String): String {
        val input = value.trim().trimEnd('/')
        if (input.isBlank()) throw OpenWrtConnectionException("请输入路由器地址。")
        val source = if (input.startsWith("http://") || input.startsWith("https://")) input else "http://$input"
        return try { URL(source).let { url -> "${url.protocol}://${url.authority}${url.path.trimEnd('/').let { if (it.isBlank()) "" else it }}/ubus".replace("/ubus/ubus", "/ubus") } } catch (_: Exception) { throw OpenWrtConnectionException("路由器地址格式不正确。") }
    }

    private fun login(endpoint: String, username: String, password: String) = call(endpoint, "00000000000000000000000000000000", "session", "login", JSONObject().put("username", username).put("password", password)).optString("ubus_rpc_session").also { if (it.isBlank()) throw OpenWrtConnectionException("未能创建 LuCI 会话；请检查账户权限。") }
    private fun call(endpoint: String, token: String, objectName: String, method: String, arguments: JSONObject = JSONObject()): JSONObject {
        val body = JSONObject().put("jsonrpc", "2.0").put("id", System.currentTimeMillis()).put("method", "call").put("params", JSONArray().put(token).put(objectName).put(method).put(arguments))
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply { requestMethod = "POST"; connectTimeout = 12000; readTimeout = 16000; doOutput = true; setRequestProperty("Content-Type", "application/json") }
        conn.outputStream.bufferedWriter().use { it.write(body.toString()) }
        if (conn.responseCode !in 200..299) throw OpenWrtConnectionException("路由器返回 HTTP ${conn.responseCode}。")
        val response = conn.inputStream.bufferedReader().use { it.readText() }
        val result = JSONObject(response).optJSONArray("result") ?: throw OpenWrtConnectionException("路由器返回了无法识别的响应。")
        if (result.optInt(0, -1) != 0) throw OpenWrtConnectionException("路由器拒绝了请求；请检查 LuCI 用户名和密码。")
        return result.optJSONObject(1) ?: JSONObject()
    }
    private inline fun safeCall(block: () -> JSONObject): JSONObject = runCatching(block).getOrDefault(JSONObject())
    private fun mapStatus(id: String, board: JSONObject, info: JSONObject, rawInterfaces: JSONObject, rawRadios: JSONObject, rawDevices: JSONObject): RouterStatus {
        val release = board.optJSONObject("release")
        val memory = info.optJSONObject("memory")
        val available = (memory?.optLong("free", 0) ?: 0) + (memory?.optLong("buffered", 0) ?: 0) + (memory?.optLong("cached", 0) ?: 0)
        val load = info.optJSONArray("load")?.let { values -> List(values.length()) { index -> values.optDouble(index) / if (values.optDouble(index) > 100) 65535.0 else 1.0 } } ?: emptyList()
        val status = SystemStatus(board.optString("hostname", "—"), board.optString("model", board.optString("system", "—")), release?.optString("description", "—") ?: "—", info.optLong("uptime").takeIf { info.has("uptime") }, load, memory?.optLong("total")?.takeIf { memory.has("total") }, available)
        val interfaces: List<InterfaceStatus> = rawInterfaces.optJSONArray("interface")?.let { list ->
            buildList { for (index in 0 until list.length()) { val row = list.optJSONObject(index) ?: continue; val stats = row.optJSONObject("statistics"); add(InterfaceStatus(row.optString("interface", "接口 ${index + 1}"), row.optString("l3_device", row.optString("device", "未报告")), row.optBoolean("up"), addresses(row.optJSONArray("ipv4-address")), addresses(row.optJSONArray("ipv6-address")), row.optLong("uptime").takeIf { row.has("uptime") }, stats?.optLong("rx_bytes")?.takeIf { stats.has("rx_bytes") }, stats?.optLong("tx_bytes")?.takeIf { stats.has("tx_bytes") })) } }
        } ?: emptyList()
        val wirelessRoot = rawRadios.optJSONObject("radios") ?: rawRadios.optJSONObject("wireless") ?: rawRadios
        val wireless = wirelessRoot.keys().asSequence().flatMap { radioName -> val radio = wirelessRoot.optJSONObject(radioName) ?: return@flatMap emptySequence(); val items = radio.optJSONArray("interfaces") ?: JSONArray().put(radio); (0 until items.length()).asSequence().map { index -> val row = items.optJSONObject(index) ?: JSONObject(); val config = row.optJSONObject("config") ?: radio.optJSONObject("config") ?: JSONObject(); WirelessStatus(row.optString("ifname", row.optString("name", radioName)), config.optString("ssid", row.optString("ssid", "未广播 SSID")), !config.optString("disabled").equals("1"), row.optString("channel", radio.optString("channel", "自动")), row.optJSONArray("stations")?.length()) } }.toList()
        return RouterStatus(id, true, system = status, interfaces = interfaces, wireless = wireless)
    }
    private fun addresses(items: JSONArray?): List<String> = if (items == null) emptyList() else (0 until items.length()).mapNotNull { index -> items.optJSONObject(index)?.optString("address")?.takeIf { it.isNotBlank() } ?: items.optString(index).takeIf { it.isNotBlank() } }
}
