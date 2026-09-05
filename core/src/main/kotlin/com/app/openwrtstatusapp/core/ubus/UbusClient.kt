package com.app.openwrtstatusapp.core.ubus

import com.app.openwrtstatusapp.core.model.OpenWrtConnectionException
import com.app.openwrtstatusapp.core.model.RouterStatus
import com.app.openwrtstatusapp.core.model.TrafficSnapshot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.util.concurrent.ConcurrentHashMap
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * ubus over HTTP(JSON-RPC)客户端。
 *
 * 相比 TS 版的关键改进:缓存 LuCI 会话令牌并在过期前复用,
 * 失效时自动重新登录重试一次——避免每次刷新都新建会话。
 */
class UbusClient(
    private val http: OkHttpClient = OkHttpClient(),
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private data class CachedSession(val token: String, val expiresAtMs: Long)

    private val jsonMediaType = "application/json".toMediaType()
    private val sessionMutex = Mutex()
    private val sessions = ConcurrentHashMap<String, CachedSession>()

    suspend fun fetchRouterStatus(
        routerId: String,
        rawEndpoint: String,
        username: String,
        password: String,
    ): RouterStatus {
        val endpoint = StatusParsers.normalizeRouterEndpoint(rawEndpoint)
        val board = runCatching {
            authenticatedCall(endpoint, username, password, "system", "board")
        }.getOrElse {
            throw it as? OpenWrtConnectionException ?: OpenWrtConnectionException("路由器拒绝了请求;请检查 LuCI 用户名和密码。")
        }
        val info = authenticatedCall(endpoint, username, password, "system", "info")

        val optional = coroutineScope {
            listOf(
                async { settled { authenticatedCall(endpoint, username, password, "network.interface", "dump") } },
                async { settled { authenticatedCall(endpoint, username, password, "network.wireless", "status") } },
                async { settled { authenticatedCall(endpoint, username, password, "network.device", "status") } },
                async {
                    settled {
                        authenticatedCall(
                            endpoint, username, password, "uci", "get",
                            buildJsonObject { put("config", "wireless") },
                        )
                    }
                },
            ).map { it.await() }
        }

        val warnings = mutableListOf<String>()
        val interfaces = optional[0].getOrNull()
        if (optional[0].isFailure) warnings.add("网络接口状态暂不可用。")
        val wireless = optional[1].getOrNull()
        if (optional[1].isFailure) warnings.add("无线状态暂不可用。")
        val deviceCounters = optional[2].getOrNull()

        val status = StatusParsers.buildRouterStatus(
            routerId, board, info, interfaces, wireless, warnings, deviceCounters,
        )
        if (status.wireless.isEmpty() && optional[3].isSuccess) {
            val fallbackWireless = StatusParsers.mapWirelessUciFallback(optional[3].getOrNull())
            if (fallbackWireless.isNotEmpty()) {
                status.copy(
                    wireless = fallbackWireless,
                    warnings = status.warnings.filterNot { it == "无线状态暂不可用。" },
                ).let { return it }
            }
        }
        return status
    }

    /** 状态页流量图所需的接口计数。 */
    suspend fun fetchRouterTraffic(
        rawEndpoint: String,
        username: String,
        password: String,
    ): TrafficSnapshot {
        val endpoint = StatusParsers.normalizeRouterEndpoint(rawEndpoint)
        val interfaces = coroutineScope {
            val dump = async { authenticatedCall(endpoint, username, password, "network.interface", "dump") }
            val devices = async {
                runCatching {
                    authenticatedCall(endpoint, username, password, "network.device", "status")
                }.getOrDefault(JsonObject(emptyMap()))
            }
            StatusParsers.mapInterfaces(dump.await(), devices.await())
        }
        return TrafficSnapshot(interfaces, java.time.Instant.now().toString())
    }

    private suspend fun settled(block: suspend () -> JsonElement): Result<JsonElement> =
        runCatching { block() }

    private suspend fun authenticatedCall(
        endpoint: String,
        username: String,
        password: String,
        obj: String,
        method: String,
        params: JsonObject = JsonObject(emptyMap()),
    ): JsonElement {
        val cached = sessions[sessionKey(endpoint, username)]
        if (cached != null && clock() < cached.expiresAtMs) {
            val result = runCatching { ubusCall(endpoint, cached.token, obj, method, params) }
            val call = result.getOrNull()
            if (call != null) return call
            // 会话可能已失效:丢弃后重新登录重试一次。
            invalidate(endpoint, username)
        }
        val token = loginWithRetry(endpoint, username, password)
        return ubusCall(endpoint, token, obj, method, params)
    }

    private suspend fun loginWithRetry(
        endpoint: String,
        username: String,
        password: String,
    ): String = sessionMutex.withLock {
        val cached = sessions[sessionKey(endpoint, username)]
        if (cached != null && clock() < cached.expiresAtMs) return cached.token
        val session = login(endpoint, username, password)
        sessions[sessionKey(endpoint, username)] = session
        session.token
    }

    private fun invalidate(endpoint: String, username: String) {
        sessions.remove(sessionKey(endpoint, username))
    }

    private fun sessionKey(endpoint: String, username: String) = "$endpoint|$username"

    private suspend fun login(endpoint: String, username: String, password: String): CachedSession =
        withContext(Dispatchers.IO) {
            val payload = buildJsonObject {
                put("username", username)
                put("password", password)
            }
            val data = ubusCall(endpoint, EMPTY_TOKEN, "session", "login", payload)
            val token = (data as? JsonObject)?.prop("ubus_rpc_session")
                ?.let { it as? JsonPrimitive }?.takeIf { it.isString }?.content
            if (token.isNullOrEmpty()) {
                throw OpenWrtConnectionException("未能创建 LuCI 会话;请检查账户权限。")
            }
            val timeoutSeconds = (data as? JsonObject)?.prop("timeout")
                ?.let { it as? JsonPrimitive }?.doubleOrNull ?: DEFAULT_SESSION_TIMEOUT_SECONDS
            val expiresAtMs = clock() +
                ((timeoutSeconds.coerceAtLeast(MIN_SESSION_TIMEOUT_SECONDS) - EXPIRY_MARGIN_SECONDS) * 1000).toLong()
            CachedSession(token, expiresAtMs)
        }

    private suspend fun ubusCall(
        endpoint: String,
        token: String,
        obj: String,
        method: String,
        params: JsonObject,
    ): JsonElement = withContext(Dispatchers.IO) {
        val body = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", clock().toInt())
            put("method", "call")
            put(
                "params",
                JsonArray(
                    listOf(
                        JsonPrimitive(token),
                        JsonPrimitive(obj),
                        JsonPrimitive(method),
                        params,
                    ),
                ),
            )
        }
        val response = try {
            http.newCall(
                Request.Builder()
                    .url(endpoint)
                    .post(body.toString().toRequestBody(jsonMediaType))
                    .build(),
            ).execute()
        } catch (error: Exception) {
            throw OpenWrtConnectionException("无法访问路由器。请确认手机已连接到对应局域网且地址可用。")
        }
        response.use {
            if (!it.isSuccessful) {
                throw OpenWrtConnectionException("路由器返回 HTTP ${it.code}。")
            }
            val root = try {
                Jsons.json.parseToJsonElement(it.body?.string() ?: "").jsonObject
            } catch (error: Exception) {
                throw OpenWrtConnectionException("路由器返回了无法识别的响应。")
            }
            val result = root["result"] as? JsonArray
            val code = (result?.firstOrNull() as? JsonPrimitive)?.intOrNull
            if (result == null || code != 0) {
                throw OpenWrtConnectionException("路由器拒绝了请求;请检查 LuCI 用户名和密码。")
            }
            result.getOrNull(1) ?: JsonObject(emptyMap())
        }
    }

    companion object {
        private const val EMPTY_TOKEN = "00000000000000000000000000000000"
        private const val DEFAULT_SESSION_TIMEOUT_SECONDS = 300.0
        private const val MIN_SESSION_TIMEOUT_SECONDS = 60.0
        private const val EXPIRY_MARGIN_SECONDS = 30.0
    }
}
