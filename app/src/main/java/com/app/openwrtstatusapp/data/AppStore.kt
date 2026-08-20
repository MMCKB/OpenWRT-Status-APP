package com.app.openwrtstatusapp.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.app.openwrtstatusapp.domain.RouterProfile
import com.app.openwrtstatusapp.domain.RouterSettings
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.json.JSONArray
import org.json.JSONObject

private val Context.appDataStore by preferencesDataStore("openwrt_status")

class AppStore(private val context: Context) {
    private val profilesKey = stringPreferencesKey("router_profiles_v2")
    private val settingsKey = stringPreferencesKey("router_settings_v2")
    private fun trafficHistoryKey(profileId: String) = stringPreferencesKey("traffic_history_v1:$profileId")
    private val secure = EncryptedSharedPreferences.create(
        context, "openwrt_secure_v2",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    val profiles: Flow<List<RouterProfile>> = context.appDataStore.data.map { pref -> decodeProfiles(pref[profilesKey]) }
    val settings: Flow<RouterSettings> = context.appDataStore.data.map { pref -> decodeSettings(pref[settingsKey]) }

    suspend fun saveProfiles(items: List<RouterProfile>) {
        context.appDataStore.edit { prefs ->
            val value = JSONArray().apply { items.forEach { put(it.toJson()) } }.toString()
            prefs[profilesKey] = value
        }
    }

    suspend fun saveSettings(settings: RouterSettings) {
        context.appDataStore.edit { prefs ->
            prefs[settingsKey] = settings.toJson().toString()
        }
    }

    /** Imports the former R2 settings payload, retaining defaults when older fields are absent. */
    suspend fun importLegacySettings(raw: String) {
        val parsed = decodeSettings(raw)
        saveSettings(parsed)
    }

    suspend fun saveLegacyTrafficHistory(profileId: String, raw: String) {
        context.appDataStore.edit { it[trafficHistoryKey(profileId)] = raw }
    }

    fun password(profileId: String, ssh: Boolean = false): String? = secure.getString("${if (ssh) "ssh" else "luci"}:$profileId", null)
    fun savePassword(profileId: String, password: String, ssh: Boolean = false) = secure.edit().putString("${if (ssh) "ssh" else "luci"}:$profileId", password).apply()
    fun removePassword(profileId: String, ssh: Boolean = false) = secure.edit().remove("${if (ssh) "ssh" else "luci"}:$profileId").apply()
    fun firmwareUrl(profileId: String): String? = secure.getString("firmware:$profileId", null)
    fun saveFirmwareUrl(profileId: String, value: String) = secure.edit().putString("firmware:$profileId", value).apply()
}

private fun RouterProfile.toJson() = JSONObject().apply {
    put("id", id); put("name", name); put("baseUrl", baseUrl); put("username", username); put("sshUsername", sshUsername); put("sshPort", sshPort); put("createdAt", createdAt); put("lastConnectedAt", lastConnectedAt)
}
private fun RouterSettings.toJson() = JSONObject().apply {
    put("selectedRouterId", selectedRouterId); put("refreshIntervalSeconds", refreshIntervalSeconds); put("trafficInterfaceIds", JSONArray(trafficInterfaceIds.toList())); put("compactTraffic", compactTraffic); put("diagnosticOutputDisplay", diagnosticOutputDisplay); put("darkMode", darkMode)
}
private fun decodeProfiles(raw: String?): List<RouterProfile> = runCatching {
    val list = JSONArray(raw ?: "[]")
    List(list.length()) { i -> list.getJSONObject(i).let { obj -> RouterProfile(obj.getString("id"), obj.getString("name"), obj.getString("baseUrl"), obj.optString("username", "root"), obj.optString("sshUsername", "root"), obj.optInt("sshPort", 22), obj.optLong("createdAt", System.currentTimeMillis()), obj.optLong("lastConnectedAt").takeIf { obj.has("lastConnectedAt") }) } }
}.getOrDefault(emptyList())
private fun decodeSettings(raw: String?): RouterSettings = runCatching {
    val obj = JSONObject(raw ?: "{}")
    RouterSettings(obj.optString("selectedRouterId").takeIf { obj.has("selectedRouterId") }, obj.optInt("refreshIntervalSeconds", 5), (0 until obj.optJSONArray("trafficInterfaceIds")?.length().orZero()).map { obj.optJSONArray("trafficInterfaceIds")!!.optString(it) }.toSet(), obj.optBoolean("compactTraffic", false), obj.optString("diagnosticOutputDisplay", "both"), obj.optString("darkMode", "system"))
}.getOrDefault(RouterSettings())
private fun Int?.orZero() = this ?: 0
