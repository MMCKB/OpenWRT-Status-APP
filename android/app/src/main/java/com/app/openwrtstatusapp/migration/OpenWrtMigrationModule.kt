package com.app.openwrtstatusapp.migration

import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.security.MessageDigest
import java.time.Instant
import java.util.concurrent.Executors

/**
 * R2 only bridge. JavaScript sends a single migration snapshot and this module stores it in
 * Android Keystore-backed EncryptedSharedPreferences. It never exposes plaintext back to JS.
 */
class OpenWrtMigrationModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String = "OpenWrtMigrationBridge"

    @ReactMethod
    fun writeMigrationSnapshot(payloadJson: String, promise: Promise) {
        executor.execute {
            try {
                require(payloadJson.length <= MAX_PAYLOAD_BYTES) { "迁移快照超过安全大小限制。" }
                val payload = JSONObject(payloadJson)
                require(payload.optInt("schemaVersion", 0) == SCHEMA_VERSION) {
                    "不支持的迁移快照版本。"
                }
                require(payload.has("profilesJson") && payload.has("settingsJson")) {
                    "迁移快照缺少必要的路由器数据。"
                }

                val digest = sha256(payloadJson)
                val preferences = encryptedPreferences()
                val alreadyComplete = preferences.getBoolean(KEY_COMPLETED, false)
                if (alreadyComplete && preferences.getString(KEY_DIGEST, null) == digest) {
                    promise.resolve(statusJson(preferences, "reused"))
                    return@execute
                }

                // Mark the transaction as started first. K1 can safely resume or discard an
                // interrupted transaction rather than importing a partial payload.
                preferences.edit()
                    .putString(KEY_STATE, "started")
                    .putInt(KEY_SCHEMA, SCHEMA_VERSION)
                    .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                    .putBoolean(KEY_COMPLETED, false)
                    .commit()

                preferences.edit()
                    .putString(KEY_PAYLOAD, payloadJson)
                    .putString(KEY_DIGEST, digest)
                    .putInt(KEY_RECORD_COUNT, payload.optInt("recordCount", 0))
                    .putString(KEY_STATE, "verified")
                    .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                    .commit()

                preferences.edit()
                    .putString(KEY_STATE, "completed")
                    .putBoolean(KEY_COMPLETED, true)
                    .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                    .commit()

                promise.resolve(statusJson(preferences, "written"))
            } catch (error: Exception) {
                promise.reject("MIGRATION_SNAPSHOT_FAILED", error.message, error)
            }
        }
    }

    @ReactMethod
    fun getMigrationStatus(promise: Promise) {
        executor.execute {
            try {
                promise.resolve(statusJson(encryptedPreferences(), "status"))
            } catch (error: Exception) {
                promise.reject("MIGRATION_STATUS_FAILED", error.message, error)
            }
        }
    }

    private fun encryptedPreferences() = EncryptedSharedPreferences.create(
        reactApplicationContext,
        PREFS_NAME,
        MasterKey.Builder(reactApplicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    private fun statusJson(preferences: android.content.SharedPreferences, operation: String): String =
        JSONObject()
            .put("operation", operation)
            .put("state", preferences.getString(KEY_STATE, "empty"))
            .put("completed", preferences.getBoolean(KEY_COMPLETED, false))
            .put("schemaVersion", preferences.getInt(KEY_SCHEMA, 0))
            .put("recordCount", preferences.getInt(KEY_RECORD_COUNT, 0))
            .put("updatedAt", preferences.getLong(KEY_UPDATED_AT, 0))
            .put("writtenAt", Instant.ofEpochMilli(preferences.getLong(KEY_UPDATED_AT, 0)).toString())
            .toString()

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    companion object {
        private const val PREFS_NAME = "migration-v1"
        private const val SCHEMA_VERSION = 1
        private const val MAX_PAYLOAD_BYTES = 12 * 1024 * 1024
        private const val KEY_STATE = "state"
        private const val KEY_SCHEMA = "schema-version"
        private const val KEY_PAYLOAD = "payload-json"
        private const val KEY_DIGEST = "payload-sha256"
        private const val KEY_RECORD_COUNT = "record-count"
        private const val KEY_UPDATED_AT = "updated-at"
        private const val KEY_COMPLETED = "completed"
    }
}
