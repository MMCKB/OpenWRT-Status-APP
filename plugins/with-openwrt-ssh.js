const {
  withAppBuildGradle,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const JAVA_PACKAGE = "com.openwrtstatus.ssh";
const SOURCE_FILES = {
  "OpenWrtSshPackage.java": `package ${JAVA_PACKAGE};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class OpenWrtSshPackage implements ReactPackage {
  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    List<NativeModule> modules = new ArrayList<>();
    modules.add(new OpenWrtSshModule(reactContext));
    modules.add(new OpenWrtNatModule(reactContext));
    return modules;
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return Collections.emptyList();
  }
}
`,
  "OpenWrtSshModule.java": `package ${JAVA_PACKAGE};

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class OpenWrtSshModule extends ReactContextBaseJavaModule {
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();

  public OpenWrtSshModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "OpenWrtSsh";
  }

  @ReactMethod
  public void connect(String host, double port, String username, String password, String key, Promise promise) {
    executor.execute(() -> {
      try {
        disconnectInternal(key);
        JSch jsch = new JSch();
        Session session = jsch.getSession(username, host, (int) port);
        session.setPassword(password);
        Properties options = new Properties();
        options.put("StrictHostKeyChecking", "no");
        options.put("PreferredAuthentications", "password");
        session.setConfig(options);
        session.connect(15000);
        sessions.put(key, session);
        promise.resolve(null);
      } catch (Exception error) {
        promise.reject("SSH_CONNECT_FAILED", error.getMessage(), error);
      }
    });
  }

  @ReactMethod
  public void execute(String key, String command, Promise promise) {
    executor.execute(() -> {
      Session session = sessions.get(key);
      if (session == null || !session.isConnected()) {
        promise.reject("SSH_NOT_CONNECTED", "SSH 会话未连接。");
        return;
      }
      ChannelExec channel = null;
      try {
        channel = (ChannelExec) session.openChannel("exec");
        channel.setCommand(command);
        channel.setInputStream(null);
        InputStream stdout = channel.getInputStream();
        InputStream stderr = channel.getErrStream();
        channel.connect(15000);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        while (true) {
          while (stdout.available() > 0) {
            int read = stdout.read(buffer, 0, buffer.length);
            if (read < 0) break;
            output.write(buffer, 0, read);
          }
          while (stderr.available() > 0) {
            int read = stderr.read(buffer, 0, buffer.length);
            if (read < 0) break;
            output.write(buffer, 0, read);
          }
          if (channel.isClosed()) {
            while (stdout.available() > 0) {
              int read = stdout.read(buffer, 0, buffer.length);
              if (read < 0) break;
              output.write(buffer, 0, read);
            }
            while (stderr.available() > 0) {
              int read = stderr.read(buffer, 0, buffer.length);
              if (read < 0) break;
              output.write(buffer, 0, read);
            }
            break;
          }
          Thread.sleep(40);
        }
        String result = new String(output.toByteArray(), "UTF-8");
        if (channel.getExitStatus() != 0 && result.trim().isEmpty()) {
          result = "命令以退出码 " + channel.getExitStatus() + " 结束。";
        }
        promise.resolve(result);
      } catch (Exception error) {
        promise.reject("SSH_COMMAND_FAILED", error.getMessage(), error);
      } finally {
        if (channel != null) channel.disconnect();
      }
    });
  }

  @ReactMethod
  public void disconnect(String key) {
    executor.execute(() -> disconnectInternal(key));
  }

  @ReactMethod
  public void uploadFile(String key, String localUri, String remotePath, Promise promise) {
    executor.execute(() -> {
      Session session = sessions.get(key);
      if (session == null || !session.isConnected()) {
        promise.reject("SSH_NOT_CONNECTED", "SSH 会话未连接。");
        return;
      }
      ChannelSftp channel = null;
      InputStream input = null;
      try {
        Uri uri = Uri.parse(localUri);
        if ("file".equals(uri.getScheme())) {
          input = new FileInputStream(new File(uri.getPath()));
        } else {
          input = getReactApplicationContext().getContentResolver().openInputStream(uri);
        }
        if (input == null) throw new Exception("无法读取所选固件文件。");
        channel = (ChannelSftp) session.openChannel("sftp");
        channel.connect(15000);
        channel.put(input, remotePath);
        promise.resolve(null);
      } catch (Exception error) {
        promise.reject("SSH_UPLOAD_FAILED", error.getMessage(), error);
      } finally {
        try { if (input != null) input.close(); } catch (Exception ignored) { }
        if (channel != null) channel.disconnect();
      }
    });
  }

  @ReactMethod
  public void downloadFile(String key, String remotePath, String localUri, Promise promise) {
    executor.execute(() -> {
      Session session = sessions.get(key);
      if (session == null || !session.isConnected()) {
        promise.reject("SSH_NOT_CONNECTED", "SSH 会话未连接。");
        return;
      }
      ChannelSftp channel = null;
      OutputStream output = null;
      try {
        Uri uri = Uri.parse(localUri);
        if ("file".equals(uri.getScheme())) {
          output = new FileOutputStream(new File(uri.getPath()));
        } else {
          output = getReactApplicationContext().getContentResolver().openOutputStream(uri, "w");
        }
        if (output == null) throw new Exception("无法创建手机上的下载文件。");
        channel = (ChannelSftp) session.openChannel("sftp");
        channel.connect(15000);
        channel.get(remotePath, output);
        promise.resolve(null);
      } catch (Exception error) {
        promise.reject("SSH_DOWNLOAD_FAILED", error.getMessage(), error);
      } finally {
        try { if (output != null) output.close(); } catch (Exception ignored) { }
        if (channel != null) channel.disconnect();
      }
    });
  }

  @ReactMethod
  public void writeTextFile(String key, String content, String remotePath, Promise promise) {
    executor.execute(() -> {
      Session session = sessions.get(key);
      if (session == null || !session.isConnected()) {
        promise.reject("SSH_NOT_CONNECTED", "SSH 会话未连接。");
        return;
      }
      ChannelSftp channel = null;
      InputStream input = null;
      try {
        input = new ByteArrayInputStream(content.getBytes("UTF-8"));
        channel = (ChannelSftp) session.openChannel("sftp");
        channel.connect(15000);
        channel.put(input, remotePath);
        promise.resolve(null);
      } catch (Exception error) {
        promise.reject("SSH_TEXT_WRITE_FAILED", error.getMessage(), error);
      } finally {
        try { if (input != null) input.close(); } catch (Exception ignored) { }
        if (channel != null) channel.disconnect();
      }
    });
  }

  private void disconnectInternal(String key) {
    Session session = sessions.remove(key);
    if (session != null && session.isConnected()) session.disconnect();
  }

  @Override
  public void invalidate() {
    for (String key : sessions.keySet()) disconnectInternal(key);
    executor.shutdownNow();
    super.invalidate();
  }
}
`,
  "OpenWrtNatModule.java": `package ${JAVA_PACKAGE};

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
`,
};

function withOpenWrtSsh(config) {
  const appScheme = config.scheme || "openwrt-status";
  config = withAppBuildGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (!contents.includes('debuggableVariants = ["debug"]')) {
      contents = contents.replace(
        /react\s*\{/, 
        'react {\n    debuggableVariants = ["debug"]',
      );
    }
    if (!contents.includes("com.github.mwiede:jsch")) {
      contents = contents.replace(
        /dependencies\s*\{/,
        'dependencies {\n    implementation("com.github.mwiede:jsch:0.2.22")',
      );
    }
    if (!contents.includes("openwrt-status-release.keystore")) {
      contents = contents.replace(
        /(signingConfigs\s*\{)/,
        `$1
        release {
            // CI restores this persistent certificate from GitHub Actions Secrets.
            // Using the same identity allows in-place upgrades from earlier releases.
            storeFile file('openwrt-status-release.keystore')
            storePassword System.getenv('ANDROID_RELEASE_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_RELEASE_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_RELEASE_KEY_PASSWORD')
        }`,
      );
    }
    contents = contents.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      "$1signingConfig signingConfigs.release",
    );
    modConfig.modResults.contents = contents;
    return modConfig;
  });

  config = withMainApplication(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    const importLine = `import ${JAVA_PACKAGE}.OpenWrtSshPackage`;
    if (!contents.includes(importLine)) {
      contents = contents.replace(/package [^\n]+\n/, (match) => `${match}\n${importLine}\n`);
    }
    if (!contents.includes("OpenWrtSshPackage()")) {
      if (contents.includes("PackageList(this).packages.apply {")) {
        contents = contents.replace("PackageList(this).packages.apply {", "PackageList(this).packages.apply {\n              add(OpenWrtSshPackage())");
      } else if (contents.includes("new PackageList(this).getPackages()")) {
        contents = contents.replace("new PackageList(this).getPackages()", "new PackageList(this).getPackages();\n    packages.add(new OpenWrtSshPackage())");
      } else {
        throw new Error("无法找到 MainApplication 的 ReactPackage 注册位置。");
      }
    }
    modConfig.modResults.contents = contents;
    return modConfig;
  });

  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) throw new Error("无法找到 Android Application 配置。");
    const metadata = application["meta-data"] ?? [];
    if (!metadata.some((item) => item.$?.["android:name"] === "android.app.shortcuts")) {
      metadata.push({
        $: {
          "android:name": "android.app.shortcuts",
          "android:resource": "@xml/openwrt_status_shortcuts",
        },
      });
    }
    application["meta-data"] = metadata;
    return modConfig;
  });

  return withDangerousMod(config, ["android", async (modConfig) => {
    const destination = path.join(modConfig.modRequest.platformProjectRoot, "app", "src", "main", "java", ...JAVA_PACKAGE.split("."));
    fs.mkdirSync(destination, { recursive: true });
    Object.entries(SOURCE_FILES).forEach(([name, source]) => fs.writeFileSync(path.join(destination, name), source));
    const resourcesDirectory = path.join(modConfig.modRequest.platformProjectRoot, "app", "src", "main", "res");
    const xmlDirectory = path.join(resourcesDirectory, "xml");
    const valuesDirectory = path.join(resourcesDirectory, "values");
    fs.mkdirSync(xmlDirectory, { recursive: true });
    fs.mkdirSync(valuesDirectory, { recursive: true });
    fs.writeFileSync(path.join(valuesDirectory, "openwrt_strings.xml"), `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="openwrt_shortcut_quick_short">快捷操作</string>
  <string name="openwrt_shortcut_quick_long">OpenWrt 快捷操作</string>
  <string name="openwrt_shortcut_diagnostics_short">网络诊断</string>
  <string name="openwrt_shortcut_diagnostics_long">按 WAN 网络诊断</string>
</resources>
`);
    fs.writeFileSync(path.join(xmlDirectory, "openwrt_status_shortcuts.xml"), `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut android:shortcutId="openwrt_quick_actions" android:enabled="true" android:icon="@mipmap/ic_launcher" android:shortcutShortLabel="@string/openwrt_shortcut_quick_short" android:shortcutLongLabel="@string/openwrt_shortcut_quick_long">
    <intent android:action="android.intent.action.VIEW" android:data="${appScheme}:///quick-actions" />
  </shortcut>
  <shortcut android:shortcutId="openwrt_diagnostics" android:enabled="true" android:icon="@mipmap/ic_launcher" android:shortcutShortLabel="@string/openwrt_shortcut_diagnostics_short" android:shortcutLongLabel="@string/openwrt_shortcut_diagnostics_long">
    <intent android:action="android.intent.action.VIEW" android:data="${appScheme}:///diagnostics" />
  </shortcut>
</shortcuts>
`);
    return modConfig;
  }]);
}

module.exports = withOpenWrtSsh;
