package com.app.openwrtstatusapp.core.ubus

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

/** 等价于 JS 的 `value ?? fallback`:JSON null 视为缺失。 */
fun JsonElement?.orNull(): JsonElement? = takeUnless { it is JsonNull }

/** 取对象属性,JSON null 视为缺失;等价 TS 的 `obj[key] ?? undefined`。 */
fun JsonObject.prop(name: String): JsonElement? = this[name].orNull()

/** ubus/LuCI 返回的动态 JSON 解析工具,对应 TS 版 openwrt-client.ts 的 asRecord/asString 系列函数。 */
object Jsons {
    val json = Json { ignoreUnknownKeys = true }

    fun asRecord(value: JsonElement?): JsonObject =
        value as? JsonObject ?: JsonObject(emptyMap())

    fun asString(value: JsonElement?, fallback: String = "—"): String {
        val primitive = value as? JsonPrimitive ?: return fallback
        // 与 TS 版一致:仅接受字符串类型,且原样返回(不裁剪)。
        if (!primitive.isString) return fallback
        return if (primitive.content.trim().isNotEmpty()) primitive.content else fallback
    }

    fun asDisplayValue(value: JsonElement?, fallback: String = "—"): String {
        val primitive = value as? JsonPrimitive ?: return fallback
        if (primitive.content.trim().isNotEmpty()) return primitive.content
        return if (primitive.isString) fallback else primitive.doubleOrNull?.toString() ?: fallback
    }

    fun asNumber(value: JsonElement?): Double? {
        val primitive = value as? JsonPrimitive ?: return null
        if (primitive.isString) return null
        return primitive.doubleOrNull?.takeIf { it.isFinite() }
    }

    fun asCounter(value: JsonElement?): Double? {
        val primitive = value as? JsonPrimitive ?: return null
        val content = primitive.content.trim()
        if (content.isEmpty()) return null
        val parsed = content.toDoubleOrNull() ?: return null
        return parsed.takeIf { it.isFinite() && it >= 0 }
    }

    fun asBoolean(value: JsonElement?): Boolean {
        val primitive = value as? JsonPrimitive ?: return false
        if (!primitive.isString) return primitive.booleanOrNull == true || primitive.intOrNull == 1
        return primitive.content.trim().lowercase() in setOf(
            "1", "true", "yes", "on", "up", "active", "enabled", "running",
        )
    }

    fun firstDefined(vararg values: JsonElement?): JsonElement? =
        values.firstOrNull { it != null }

    fun asStringArray(value: JsonElement?): List<String> {
        val array = value as? JsonArray ?: return emptyList()
        return array.mapNotNull { entry ->
            when {
                entry is JsonPrimitive && entry.isString && entry.content.isNotEmpty() -> entry.content
                entry is JsonObject -> (entry.prop("address") as? JsonPrimitive)
                    ?.takeIf { it.isString && it.content.isNotEmpty() }?.content
                else -> null
            }
        }
    }

    fun normalizeLoad(value: JsonElement?): Triple<Double, Double, Double>? {
        val array = value as? JsonArray ?: return null
        if (array.size < 3) return null
        val samples = array.take(3).map { asNumber(it) }
        if (samples.any { it == null }) return null
        return Triple(
            samples[0]!!.let { if (it > 100) it / 65535 else it },
            samples[1]!!.let { if (it > 100) it / 65535 else it },
            samples[2]!!.let { if (it > 100) it / 65535 else it },
        )
    }
}
