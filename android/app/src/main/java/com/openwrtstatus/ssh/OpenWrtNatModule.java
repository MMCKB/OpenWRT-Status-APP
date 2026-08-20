package com.openwrtstatus.ssh;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class OpenWrtNatModule extends ReactContextBaseJavaModule {
  private static final int STUN_PORT = 19302;
  private static final int MAGIC_COOKIE = 0x2112A442;
  private static final int BINDING_REQUEST = 0x0001;
  private static final int BINDING_SUCCESS = 0x0101;
  private static final int MAPPED_ADDRESS = 0x0001;
  private static final int XOR_MAPPED_ADDRESS = 0x0020;
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private final SecureRandom random = new SecureRandom();

  public OpenWrtNatModule(ReactApplicationContext context) { super(context); }
  @Override public String getName() { return "OpenWrtNat"; }

  @ReactMethod
  public void detect(Promise promise) {
    executor.execute(() -> {
      DatagramSocket socket = null;
      try {
        socket = new DatagramSocket();
        socket.setSoTimeout(4500);
        StunMapping primary = query(socket, "stun.l.google.com");
        StunMapping secondary = null;
        try { secondary = query(socket, "stun1.l.google.com"); } catch (Exception ignored) { }
        String behavior;
        String typeLabel;
        if (secondary == null) { behavior = "single-server"; typeLabel = "已取得公网映射（无法完成第二端点比对）"; }
        else if (!primary.address.equals(secondary.address)) { behavior = "multiple-public-addresses"; typeLabel = "多公网地址或网络策略变化"; }
        else if (primary.port != secondary.port) { behavior = "endpoint-dependent-mapping"; typeLabel = "对称 NAT（端点相关映射）"; }
        else { behavior = "endpoint-independent-mapping"; typeLabel = "端点无关映射（锥型或受限锥型 NAT）"; }
        WritableMap result = Arguments.createMap();
        result.putString("publicAddress", primary.address);
        result.putInt("publicPort", primary.port);
        result.putString("primaryServer", primary.server);
        result.putString("mappingBehavior", behavior);
        result.putString("typeLabel", typeLabel);
        if (secondary != null) {
          result.putString("comparisonAddress", secondary.address);
          result.putInt("comparisonPort", secondary.port);
          result.putString("comparisonServer", secondary.server);
        }
        promise.resolve(result);
      } catch (Exception error) {
        String detail = error.getMessage() == null ? "未收到 STUN 服务器响应。" : error.getMessage();
        promise.reject("NAT_DETECT_FAILED", "手机网络 NAT 检测失败：" + detail, error);
      } finally { if (socket != null) socket.close(); }
    });
  }

  private StunMapping query(DatagramSocket socket, String host) throws Exception {
    InetAddress address = null;
    for (InetAddress candidate : InetAddress.getAllByName(host)) if (candidate instanceof Inet4Address) { address = candidate; break; }
    if (address == null) throw new IOException("STUN 服务未返回 IPv4 地址。");
    byte[] transactionId = new byte[12];
    random.nextBytes(transactionId);
    byte[] request = new byte[20];
    writeUnsignedShort(request, 0, BINDING_REQUEST);
    writeUnsignedShort(request, 2, 0);
    writeInt(request, 4, MAGIC_COOKIE);
    System.arraycopy(transactionId, 0, request, 8, transactionId.length);
    socket.send(new DatagramPacket(request, request.length, address, STUN_PORT));
    long deadline = System.currentTimeMillis() + 4500;
    while (System.currentTimeMillis() < deadline) {
      byte[] response = new byte[576];
      DatagramPacket packet = new DatagramPacket(response, response.length);
      socket.receive(packet);
      StunMapping mapping = parseResponse(packet.getData(), packet.getLength(), transactionId, host);
      if (mapping != null) return mapping;
    }
    throw new IOException("STUN 响应不匹配。");
  }

  private StunMapping parseResponse(byte[] data, int length, byte[] transactionId, String server) throws IOException {
    if (length < 20 || readUnsignedShort(data, 0) != BINDING_SUCCESS || readInt(data, 4) != MAGIC_COOKIE) return null;
    if (!Arrays.equals(Arrays.copyOfRange(data, 8, 20), transactionId)) return null;
    int end = Math.min(length, 20 + readUnsignedShort(data, 2));
    for (int offset = 20; offset + 4 <= end;) {
      int type = readUnsignedShort(data, offset);
      int attributeLength = readUnsignedShort(data, offset + 2);
      int valueOffset = offset + 4;
      if (valueOffset + attributeLength > end) break;
      if (type == XOR_MAPPED_ADDRESS || type == MAPPED_ADDRESS) {
        StunMapping mapping = parseMappedAddress(data, valueOffset, attributeLength, type == XOR_MAPPED_ADDRESS, server);
        if (mapping != null) return mapping;
      }
      offset = valueOffset + ((attributeLength + 3) & ~3);
    }
    throw new IOException("STUN 响应未包含 IPv4 公网映射。");
  }

  private StunMapping parseMappedAddress(byte[] data, int offset, int length, boolean xor, String server) {
    if (length < 8 || data[offset + 1] != 0x01) return null;
    int port = readUnsignedShort(data, offset + 2);
    if (xor) port ^= (MAGIC_COOKIE >>> 16);
    byte[] address = Arrays.copyOfRange(data, offset + 4, offset + 8);
    if (xor) { address[0] ^= (byte) 0x21; address[1] ^= (byte) 0x12; address[2] ^= (byte) 0xA4; address[3] ^= (byte) 0x42; }
    return new StunMapping((address[0] & 0xff) + "." + (address[1] & 0xff) + "." + (address[2] & 0xff) + "." + (address[3] & 0xff), port, server);
  }

  private static int readUnsignedShort(byte[] data, int offset) { return ((data[offset] & 0xff) << 8) | (data[offset + 1] & 0xff); }
  private static int readInt(byte[] data, int offset) { return ((data[offset] & 0xff) << 24) | ((data[offset + 1] & 0xff) << 16) | ((data[offset + 2] & 0xff) << 8) | (data[offset + 3] & 0xff); }
  private static void writeUnsignedShort(byte[] data, int offset, int value) { data[offset] = (byte) ((value >>> 8) & 0xff); data[offset + 1] = (byte) (value & 0xff); }
  private static void writeInt(byte[] data, int offset, int value) { data[offset] = (byte) ((value >>> 24) & 0xff); data[offset + 1] = (byte) ((value >>> 16) & 0xff); data[offset + 2] = (byte) ((value >>> 8) & 0xff); data[offset + 3] = (byte) (value & 0xff); }
  @Override public void invalidate() { executor.shutdownNow(); super.invalidate(); }

  private static final class StunMapping {
    final String address; final int port; final String server;
    StunMapping(String address, int port, String server) { this.address = address; this.port = port; this.server = server; }
  }
}
