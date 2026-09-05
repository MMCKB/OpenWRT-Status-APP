package com.openwrtstatus.ssh;

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
