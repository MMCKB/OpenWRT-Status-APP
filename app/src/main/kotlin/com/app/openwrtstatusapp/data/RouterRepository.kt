package com.app.openwrtstatusapp.data

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.app.openwrtstatusapp.core.model.RouterProfile
import com.app.openwrtstatusapp.core.model.RouterSettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val Context.dataStore by preferencesDataStore(name = "openwrt")

/** 平移自 lib/router-storage.ts:资料存 DataStore,密码存 Keystore 加密偏好。 */
class RouterRepository(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true }
    private val profilesKey = stringPreferencesKey("openwrt.router-profiles.v1")
    private val settingsKey = stringPreferencesKey("openwrt.router-settings.v1")

    private val securePrefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "openwrt_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    val profilesFlow: Flow<List<RouterProfile>> = context.dataStore.data.map { prefs ->
        prefs[profilesKey]?.let { raw ->
            runCatching { json.decodeFromString<List<RouterProfile>>(raw) }.getOrNull()
        } ?: emptyList()
    }

    val settingsFlow: Flow<RouterSettings> = context.dataStore.data.map { prefs ->
        prefs[settingsKey]?.let { raw ->
            runCatching { decodeSettings(raw) }.getOrNull()
        } ?: RouterSettings()
    }

    suspend fun saveProfiles(profiles: List<RouterProfile>) {
        context.dataStore.edit { it[profilesKey] = json.encodeToString(profiles) }
    }

    suspend fun upsertProfile(profile: RouterProfile) {
        val current = profilesFlow.first()
        saveProfiles(current.filterNot { it.id == profile.id } + profile)
    }

    suspend fun deleteProfile(profileId: String) {
        saveProfiles(profilesFlow.first().filterNot { it.id == profileId })
        removePassword(profileId)
        removeSshPassword(profileId)
        val settings = settingsFlow.first()
        if (settings.selectedRouterId == profileId) {
            saveSettings(settings.copy(selectedRouterId = null))
        }
    }

    suspend fun saveSettings(settings: RouterSettings) {
        context.dataStore.edit { it[settingsKey] = json.encodeToString(settings) }
    }

    private fun decodeSettings(raw: String): RouterSettings {
        val decoded = json.decodeFromString<RouterSettings>(raw)
        return decoded.copy(
            refreshIntervalSeconds = decoded.refreshIntervalSeconds.coerceAtLeast(0),
            trafficInterfaceIds = decoded.trafficInterfaceIds.filter { it.isNotEmpty() },
            statusTrafficView = if (decoded.statusTrafficView == "compact") "compact" else "full",
            diagnosticOutputDisplay =
            if (decoded.diagnosticOutputDisplay == "page" || decoded.diagnosticOutputDisplay == "dialog") {
                decoded.diagnosticOutputDisplay
            } else {
                "both"
            },
        )
    }

    // ---------- 密码(Keystore 加密) ----------

    fun savePassword(routerId: String, password: String) =
        securePrefs.edit().putString("openwrt.router-password.$routerId", password).apply()

    fun loadPassword(routerId: String): String? =
        securePrefs.getString("openwrt.router-password.$routerId", null)

    fun removePassword(routerId: String) =
        securePrefs.edit().remove("openwrt.router-password.$routerId").apply()

    fun saveSshPassword(routerId: String, password: String) =
        securePrefs.edit().putString("openwrt.router-ssh-password.$routerId", password).apply()

    fun loadSshPassword(routerId: String): String? =
        securePrefs.getString("openwrt.router-ssh-password.$routerId", null)

    fun removeSshPassword(routerId: String) =
        securePrefs.edit().remove("openwrt.router-ssh-password.$routerId").apply()

    suspend fun ensureSecurePrefsReady() = withContext(Dispatchers.IO) { securePrefs.toString() }
}
