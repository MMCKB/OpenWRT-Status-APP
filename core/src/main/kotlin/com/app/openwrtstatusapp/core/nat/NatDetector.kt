package com.app.openwrtstatusapp.core.nat

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.security.SecureRandom

enum class NatMappingBehavior {
    SINGLE_SERVER,
    MULTIPLE_PUBLIC_ADDRESSES,
    ENDPOINT_DEPENDENT_MAPPING,
    ENDPOINT_INDEPENDENT_MAPPING,
}

data class PhoneNatResult(
    val publicAddress: String,
    val publicPort: Int,
    val primaryServer: String,
    val comparisonAddress: String? = null,
    val comparisonPort: Int? = null,
    val comparisonServer: String? = null,
    val mappingBehavior: NatMappingBehavior,
    val typeLabel: String,
)

/**
 * 平移自原生 OpenWrtNatModule.java:通过手机当前默认网络发出 STUN Binding 请求,
 * 不连接路由器、不使用 SSH。
 */
object NatDetector {
    private const val STUN_PORT = 19302
    private const val MAGIC_COOKIE = 0x2112A442
    private const val BINDING_REQUEST = 0x0001
    private const val BINDING_SUCCESS = 0x0101
    private const val MAPPED_ADDRESS = 0x0001
    private const val XOR_MAPPED_ADDRESS = 0x0020
    private const val TIMEOUT_MS = 4500

    private val random = SecureRandom()

    suspend fun detect(): PhoneNatResult = withContext(Dispatchers.IO) {
        DatagramSocket().use { socket ->
            socket.soTimeout = TIMEOUT_MS
            val primary = query(socket, "stun.l.google.com")
            val secondary = try {
                query(socket, "stun1.l.google.com")
            } catch (error: Exception) {
                null
            }
            val (behavior, typeLabel) = when {
                secondary == null -> NatMappingBehavior.SINGLE_SERVER to "已取得公网映射（无法完成第二端点比对）"
                primary.address != secondary.address -> NatMappingBehavior.MULTIPLE_PUBLIC_ADDRESSES to "多公网地址或网络策略变化"
                primary.port != secondary.port -> NatMappingBehavior.ENDPOINT_DEPENDENT_MAPPING to "对称 NAT（端点相关映射）"
                else -> NatMappingBehavior.ENDPOINT_INDEPENDENT_MAPPING to "端点无关映射（锥型或受限锥型 NAT）"
            }
            PhoneNatResult(
                publicAddress = primary.address,
                publicPort = primary.port,
                primaryServer = primary.server,
                comparisonAddress = secondary?.address,
                comparisonPort = secondary?.port,
                comparisonServer = secondary?.server,
                mappingBehavior = behavior,
                typeLabel = typeLabel,
            )
        }
    }

    private class StunMapping(val address: String, val port: Int, val server: String)

    private fun query(socket: DatagramSocket, host: String): StunMapping {
        val address = InetAddress.getAllByName(host).firstOrNull { it is Inet4Address }
            ?: throw java.io.IOException("STUN 服务未返回 IPv4 地址。")
        val transactionId = ByteArray(12).also { random.nextBytes(it) }
        val request = ByteArray(20)
        writeUnsignedShort(request, 0, BINDING_REQUEST)
        writeUnsignedShort(request, 2, 0)
        writeInt(request, 4, MAGIC_COOKIE)
        System.arraycopy(transactionId, 0, request, 8, transactionId.size)
        socket.send(DatagramPacket(request, request.size, address, STUN_PORT))

        val deadline = System.currentTimeMillis() + TIMEOUT_MS
        while (System.currentTimeMillis() < deadline) {
            val response = ByteArray(576)
            val packet = DatagramPacket(response, response.size)
            socket.receive(packet)
            parseResponse(packet.data, packet.length, transactionId, host)?.let { return it }
        }
        throw java.io.IOException("STUN 响应不匹配。")
    }

    private fun parseResponse(data: ByteArray, length: Int, transactionId: ByteArray, server: String): StunMapping? {
        if (length < 20 || readUnsignedShort(data, 0) != BINDING_SUCCESS || readInt(data, 4) != MAGIC_COOKIE) {
            return null
        }
        if (!data.copyOfRange(8, 20).contentEquals(transactionId)) return null
        val messageLength = readUnsignedShort(data, 2)
        val end = minOf(length, 20 + messageLength)
        var offset = 20
        while (offset + 4 <= end) {
            val attributeType = readUnsignedShort(data, offset)
            val attributeLength = readUnsignedShort(data, offset + 2)
            val valueOffset = offset + 4
            if (valueOffset + attributeLength > end) break
            if (attributeType == XOR_MAPPED_ADDRESS || attributeType == MAPPED_ADDRESS) {
                parseMappedAddress(data, valueOffset, attributeLength, attributeType == XOR_MAPPED_ADDRESS, server)
                    ?.let { return it }
            }
            offset = valueOffset + ((attributeLength + 3) and 3.inv())
        }
        throw java.io.IOException("STUN 响应未包含 IPv4 公网映射。")
    }

    private fun parseMappedAddress(data: ByteArray, offset: Int, length: Int, xor: Boolean, server: String): StunMapping? {
        if (length < 8 || data[offset + 1].toInt() != 0x01) return null
        var port = readUnsignedShort(data, offset + 2)
        if (xor) port = port xor (MAGIC_COOKIE ushr 16)
        val address = data.copyOfRange(offset + 4, offset + 8)
        if (xor) {
            address[0] = (address[0].toInt() xor 0x21).toByte()
            address[1] = (address[1].toInt() xor 0x12).toByte()
            address[2] = (address[2].toInt() xor 0xA4).toByte()
            address[3] = (address[3].toInt() xor 0x42).toByte()
        }
        return StunMapping(
            "${address[0].toInt() and 0xff}.${address[1].toInt() and 0xff}." +
                "${address[2].toInt() and 0xff}.${address[3].toInt() and 0xff}",
            port,
            server,
        )
    }

    private fun readUnsignedShort(data: ByteArray, offset: Int): Int =
        ((data[offset].toInt() and 0xff) shl 8) or (data[offset + 1].toInt() and 0xff)

    private fun readInt(data: ByteArray, offset: Int): Int =
        ((data[offset].toInt() and 0xff) shl 24) or ((data[offset + 1].toInt() and 0xff) shl 16) or
            ((data[offset + 2].toInt() and 0xff) shl 8) or (data[offset + 3].toInt() and 0xff)

    private fun writeUnsignedShort(data: ByteArray, offset: Int, value: Int) {
        data[offset] = ((value ushr 8) and 0xff).toByte()
        data[offset + 1] = (value and 0xff).toByte()
    }

    private fun writeInt(data: ByteArray, offset: Int, value: Int) {
        data[offset] = ((value ushr 24) and 0xff).toByte()
        data[offset + 1] = ((value ushr 16) and 0xff).toByte()
        data[offset + 2] = ((value ushr 8) and 0xff).toByte()
        data[offset + 3] = (value and 0xff).toByte()
    }
}
