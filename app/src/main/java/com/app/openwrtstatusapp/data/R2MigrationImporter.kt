package com.app.openwrtstatusapp.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.MessageDigest

/**
 * Imports the encrypted migration-v1 payload written by the last R2 (Expo) build.
 * The application id, signing key, encrypted preference name and key aliases are retained, so an
 * Android in-place update can decrypt this store while an uninstall cannot. Import is idempotent:
 * it only finalises the source snapshot after every record has been persisted in K1 stores.
 */
class R2MigrationImporter(private val context: Context, private val appStore: AppStore) {
    suspend fun importIfAvailable(): MigrationImportResult = withContext(Dispatchers.IO) {
        val source = EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
        if (R2MigrationImportGate.isAlreadyImported(source.getBoolean(KEY_IMPORTED, false))) {
            return@withContext MigrationImportResult.AlreadyImported
        }
        val sourceState = source.getString(KEY_STATE, "empty")
        if (!R2MigrationImportGate.hasImportableSnapshot(source.getBoolean(KEY_COMPLETED, false), sourceState)) {
            return@withContext MigrationImportResult.NotAvailable
        }
        val raw = source.getString(KEY_PAYLOAD, null) ?: return@withContext MigrationImportResult.Invalid("迁移仓缺少快照")
        if (raw.length > MAX_PAYLOAD_BYTES || sha256(raw) != source.getString(KEY_DIGEST, "")) {
            return@withContext MigrationImportResult.Invalid("迁移仓校验失败")
        }
        val payload = R2MigrationPayloadParser.parse(raw)
            ?: return@withContext MigrationImportResult.Invalid("迁移仓格式无效或版本不受支持")
        source.edit().putString(KEY_STATE, R2MigrationImportGate.stateBeforeCopy()).commit()
        runCatching {
            appStore.saveProfiles(payload.profiles)
            if (payload.settingsJson.isNotBlank()) appStore.importLegacySettings(payload.settingsJson)
            for (item in payload.routers) {
                item.luciPassword?.let { appStore.savePassword(item.routerId, it) }
                item.sshPassword?.let { appStore.savePassword(item.routerId, it, ssh = true) }
                item.firmwareReleaseUrl?.let { appStore.saveFirmwareUrl(item.routerId, it) }
                item.trafficHistory?.let { appStore.saveLegacyTrafficHistory(item.routerId, it) }
            }
        }.onFailure {
            source.edit().putString(KEY_STATE, R2MigrationImportGate.stateAfterCopyFailure()).commit()
            return@withContext MigrationImportResult.Invalid("恢复失败：${it.message ?: "未知错误"}")
        }
        source.edit().putBoolean(KEY_IMPORTED, true)
            .putString(KEY_STATE, R2MigrationImportGate.stateAfterCopy())
            .commit()
        MigrationImportResult.Imported(payload.profiles.size)
    }

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    companion object {
        private const val PREFS_NAME = "migration-v1"
        private const val KEY_STATE = "state"
        private const val KEY_PAYLOAD = "payload-json"
        private const val KEY_DIGEST = "payload-sha256"
        private const val KEY_COMPLETED = "completed"
        private const val KEY_IMPORTED = "k1-imported-v1"
        private const val MAX_PAYLOAD_BYTES = 12 * 1024 * 1024
    }
}

sealed interface MigrationImportResult {
    data object NotAvailable : MigrationImportResult
    data object AlreadyImported : MigrationImportResult
    data class Imported(val profiles: Int) : MigrationImportResult
    data class Invalid(val reason: String) : MigrationImportResult
}
