package com.app.openwrtstatusapp.network

import com.app.openwrtstatusapp.domain.NatResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.nio.ByteBuffer
import java.security.SecureRandom

object NatDetector {
    suspend fun detect(): NatResult = withContext(Dispatchers.IO) {
        val first = query("stun.l.google.com")
        val second = runCatching { query("stun1.l.google.com") }.getOrNull()
        val mapping = when { second == null -> "单服务器映射"; first.first == second.first && first.second == second.second -> "端点独立映射"; first.first == second.first -> "端点相关映射"; else -> "多个公网地址" }
        NatResult(first.first, first.second, mapping, "手机本地 UDP/STUN 检测；结果不依赖路由器 SSH。")
    }
    private fun query(host: String): Pair<String, Int> {
        val address = InetAddress.getAllByName(host).firstOrNull { it is Inet4Address } ?: error("未找到 IPv4 STUN 服务地址。")
        val transaction = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val request = ByteBuffer.allocate(20).putShort(0x0001).putShort(0).putInt(0x2112A442).put(transaction).array()
        DatagramSocket().use { socket -> socket.soTimeout = 5000; socket.send(DatagramPacket(request, request.size, address, 19302)); val response = ByteArray(1024); val packet = DatagramPacket(response, response.size); socket.receive(packet); return parse(response.copyOf(packet.length), transaction) }
    }
    internal fun parse(bytes: ByteArray, transaction: ByteArray): Pair<String, Int> { val data = ByteBuffer.wrap(bytes); require(data.short.toInt() == 0x0101) { "STUN 未返回绑定结果。" }; data.short; require(data.int == 0x2112A442) { "STUN 魔数不匹配。" }; val tx = ByteArray(12); data.get(tx); require(tx.contentEquals(transaction)) { "STUN 事务不匹配。" }; while (data.remaining() >= 4) { val type = data.short.toInt() and 0xffff; val size = data.short.toInt() and 0xffff; if (size > data.remaining()) break; val value = ByteArray(size); data.get(value); repeat((4 - size % 4) % 4) { if (data.hasRemaining()) data.get() }; if (type == 0x0020 || type == 0x0001) { val xor = type == 0x0020; val family = value[1].toInt(); require(family == 1) { "当前仅支持 STUN IPv4 映射。" }; val rawPort = ((value[2].toInt() and 0xff) shl 8) or (value[3].toInt() and 0xff); val port = if (xor) rawPort xor 0x2112 else rawPort; val key = byteArrayOf(0x21.toByte(), 0x12.toByte(), 0xA4.toByte(), 0x42.toByte()); val ip = ByteArray(4) { index -> if (xor) (value[index + 4].toInt() xor key[index].toInt()).toByte() else value[index + 4] }; return InetAddress.getByAddress(ip).hostAddress to port } }; error("STUN 响应没有公网映射地址。") }
}
