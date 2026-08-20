package com.app.openwrtstatusapp.network

import org.junit.Assert.assertEquals
import org.junit.Test
import java.nio.ByteBuffer

class NatDetectorTest {
    @Test
    fun `parses XOR mapped IPv4 address from STUN binding response`() {
        val transaction = ByteArray(12) { it.toByte() }
        val magic = 0x2112A442
        val port = 54321
        val address = byteArrayOf(203.toByte(), 0, 113, 12)
        val key = byteArrayOf(0x21, 0x12, 0xA4.toByte(), 0x42)
        val value = ByteBuffer.allocate(8)
            .put(0)
            .put(1)
            .putShort((port xor 0x2112).toShort())
            .put(ByteArray(4) { address[it].toInt().xor(key[it].toInt()).toByte() })
            .array()
        val response = ByteBuffer.allocate(32)
            .putShort(0x0101)
            .putShort(12)
            .putInt(magic)
            .put(transaction)
            .putShort(0x0020)
            .putShort(8)
            .put(value)
            .array()

        assertEquals("203.0.113.12" to port, NatDetector.parse(response, transaction))
    }
}
