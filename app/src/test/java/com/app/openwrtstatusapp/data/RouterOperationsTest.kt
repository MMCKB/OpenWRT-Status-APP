package com.app.openwrtstatusapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class RouterOperationsTest {
    @Test
    fun `shell quotes single quotes safely`() {
        assertEquals("'a'\\''b'", RouterOperations.shell("a'b"))
    }

    @Test
    fun `safe identifier accepts an APK package name`() {
        assertEquals("luci-app-openclash", RouterOperations.safeIdentifier("luci-app-openclash"))
    }

    @Test
    fun `safe identifier rejects shell syntax`() {
        assertThrows(IllegalArgumentException::class.java) {
            RouterOperations.safeIdentifier("apk; reboot")
        }
    }
}
