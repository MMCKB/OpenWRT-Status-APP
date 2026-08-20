package com.app.openwrtstatusapp.data

import com.app.openwrtstatusapp.domain.RouterProfile
import org.json.JSONArray
import org.json.JSONObject

/** Versioned, platform-neutral representation of the R2 migration-v1 JSON payload. */
internal data class R2MigrationPayload(
    val profiles: List<RouterProfile>,
    val settingsJson: String,
    val routers: List<R2RouterData>,
)

internal data class R2RouterData(
    val routerId: String,
    val luciPassword: String?,
    val sshPassword: String?,
    val firmwareReleaseUrl: String?,
    val trafficHistory: String?,
)

internal object R2MigrationPayloadParser {
    fun parse(raw: String): R2MigrationPayload? = runCatching {
        val payload = JSONObject(raw)
        if (payload.optInt("schemaVersion") != 1) return null
        val profiles = parseProfiles(payload.optString("profilesJson"))
        val routers = payload.optJSONArray("routers") ?: JSONArray()
        R2MigrationPayload(
            profiles = profiles,
            settingsJson = payload.optString("settingsJson", ""),
            routers = buildList {
                for (index in 0 until routers.length()) {
                    val item = routers.optJSONObject(index) ?: continue
                    val id = item.optString("routerId")
                    if (id.isBlank()) continue
                    add(R2RouterData(
                        routerId = id,
                        luciPassword = item.optNullableString("luciPassword"),
                        sshPassword = item.optNullableString("sshPassword"),
                        firmwareReleaseUrl = item.optNullableString("firmwareReleaseUrl"),
                        trafficHistory = item.optNullableString("trafficHistory"),
                    ))
                }
            },
        )
    }.getOrNull()

    private fun parseProfiles(raw: String): List<RouterProfile> = runCatching {
        val array = JSONArray(raw)
        buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("id")
                val name = item.optString("name")
                val baseUrl = item.optString("baseUrl", item.optString("url"))
                if (id.isBlank() || name.isBlank() || baseUrl.isBlank()) continue
                add(RouterProfile(
                    id = id,
                    name = name,
                    baseUrl = baseUrl,
                    username = item.optString("username", "root"),
                    sshUsername = item.optString("sshUsername", item.optString("username", "root")),
                    sshPort = item.optInt("sshPort", 22),
                    createdAt = item.optLong("createdAt", System.currentTimeMillis()),
                    lastConnectedAt = item.optLong("lastConnectedAt").takeIf { item.has("lastConnectedAt") },
                ))
            }
        }
    }.getOrDefault(emptyList())

    private fun JSONObject.optNullableString(key: String): String? =
        if (has(key) && !isNull(key)) optString(key).takeIf { it.isNotBlank() } else null
}
