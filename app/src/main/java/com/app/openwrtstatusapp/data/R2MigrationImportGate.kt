package com.app.openwrtstatusapp.data

/**
 * Pure migration state machine shared by the Android-backed importer and JVM tests.
 * An R2 export is complete before K1 begins importing. If K1 is interrupted after it writes
 * `importing`, the encrypted source is intentionally retried on the following launch.
 */
internal object R2MigrationImportGate {
    fun isAlreadyImported(k1Imported: Boolean): Boolean = k1Imported

    fun hasImportableSnapshot(exportCompleted: Boolean, sourceState: String?): Boolean =
        exportCompleted && sourceState in setOf("completed", "importing")

    fun stateBeforeCopy(): String = "importing"

    fun stateAfterCopy(): String = "imported"

    fun stateAfterCopyFailure(): String = "completed"
}
