package com.app.openwrtstatusapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class R2MigrationImportGateTest {
    @Test
    fun `completed R2 snapshot starts K1 import and completes once`() {
        assertTrue(R2MigrationImportGate.hasImportableSnapshot(true, "completed"))
        assertEquals("importing", R2MigrationImportGate.stateBeforeCopy())
        assertEquals("imported", R2MigrationImportGate.stateAfterCopy())
        assertTrue(R2MigrationImportGate.isAlreadyImported(true))
    }

    @Test
    fun `interrupted K1 copy is retried from its encrypted snapshot`() {
        assertTrue(R2MigrationImportGate.hasImportableSnapshot(true, "importing"))
        assertEquals("completed", R2MigrationImportGate.stateAfterCopyFailure())
        assertTrue(R2MigrationImportGate.hasImportableSnapshot(true, R2MigrationImportGate.stateAfterCopyFailure()))
    }

    @Test
    fun `unsealed or unknown stores never import`() {
        assertFalse(R2MigrationImportGate.hasImportableSnapshot(false, "completed"))
        assertFalse(R2MigrationImportGate.hasImportableSnapshot(true, "empty"))
        assertFalse(R2MigrationImportGate.isAlreadyImported(false))
    }
}
