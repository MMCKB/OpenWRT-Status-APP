package com.openwrtstatus.ssh;

import android.app.Activity;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.io.File;
import java.io.FileWriter;
import java.lang.reflect.Field;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Android 13+ 预测性返回手势支持。targetSdk>=36 时 ReactActivity 注册了一个
 * 常启用的 OnBackPressedCallback，它的存在让系统认为返回事件始终由应用接管，
 * 因此永不播放系统预测返回动画。
 *
 * 开启预测模式：反射停用 RN 的常启用回调，并注册一个转发器——非根屏把返回
 * 事件送回 JS（由 expo-router 弹栈），根屏保持转发器禁用，让系统接管并播放
 * 预测动画。关闭预测模式：恢复 RN 回调，返回行为与旧版完全一致。
 *
 * 所有关键动作写入应用外部存储 backgesture.log，供 adb 诊断（ColorOS 屏蔽
 * 应用日志，文件是唯一可靠通道）。
 */
public class OpenWrtPredictiveBackModule extends ReactContextBaseJavaModule {
  private volatile boolean predictiveMode = false;
  private volatile boolean atRoot = true;
  private OnBackPressedCallback forwarder;
  private Activity forwarderActivity;

  public OpenWrtPredictiveBackModule(ReactApplicationContext context) {
    super(context);
    logState("module-created");
  }

  @Override
  public String getName() {
    return "OpenWrtPredictiveBack";
  }

  @ReactMethod
  public void setPredictiveMode(boolean enabled) {
    predictiveMode = enabled;
    UiThreadUtil.runOnUiThread(this::refresh);
  }

  @ReactMethod
  public void setAtRoot(boolean root) {
    atRoot = root;
    UiThreadUtil.runOnUiThread(this::refresh);
  }

  private void refresh() {
    Activity activity = getCurrentActivity();
    if (!(activity instanceof ComponentActivity)) {
      logState("refresh activity=null-or-not-component");
      return;
    }
    ComponentActivity componentActivity = (ComponentActivity) activity;
    String rnResult = setReactActivityCallbackEnabled(activity, !predictiveMode);
    if (!predictiveMode) {
      if (forwarder != null) {
        forwarder.remove();
        forwarder = null;
        forwarderActivity = null;
      }
      logState("refresh mode=off " + rnResult);
      return;
    }
    if (forwarder != null && forwarderActivity != activity) {
      // Activity 重建后旧回调已随旧 dispatcher 失效，重新绑定。
      forwarder.remove();
      forwarder = null;
    }
    if (forwarder == null) {
      forwarder =
          new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
              if (atRoot) {
                logState("back finish-at-root");
                activity.finish();
                return;
              }
              logState("back forwarded-to-js");
              getReactApplicationContext()
                  .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                  .emit("hardwareBackPress", null);
            }
          };
      forwarderActivity = activity;
      componentActivity.getOnBackPressedDispatcher().addCallback(componentActivity, forwarder);
    }
    forwarder.setEnabled(!atRoot);
    logState("refresh mode=on atRoot=" + atRoot + " " + rnResult
        + " forwarder-registered");
  }

  /** 反射定位 ReactActivity 的常启用返回回调；结果回传给文件日志。 */
  private String setReactActivityCallbackEnabled(Activity activity, boolean enabled) {
    try {
      Class<?> clazz = activity.getClass();
      while (clazz != null && !"com.facebook.react.ReactActivity".equals(clazz.getName())) {
        clazz = clazz.getSuperclass();
      }
      if (clazz == null) return "rn-class-not-found";
      Field field = clazz.getDeclaredField("mBackPressedCallback");
      field.setAccessible(true);
      Object callback = field.get(activity);
      if (callback instanceof OnBackPressedCallback) {
        ((OnBackPressedCallback) callback).setEnabled(enabled);
        return enabled ? "rn-callback-enabled" : "rn-callback-disabled";
      }
      return "rn-callback-null";
    } catch (Throwable t) {
      return "rn-reflection-failed:" + t.getClass().getSimpleName();
    }
  }

  /** 关键状态写入外部存储；ColorOS 屏蔽应用日志，文件是 adb 可读的唯一通道。 */
  private void logState(String detail) {
    try {
      File dir = getReactApplicationContext().getExternalFilesDir(null);
      if (dir == null) return;
      File file = new File(dir, "backgesture.log");
      if (file.exists() && file.length() > 128 * 1024) file.delete();
      FileWriter writer = new FileWriter(file, true);
      writer.write(new SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US).format(new Date())
          + " " + detail + "\n");
      writer.close();
    } catch (Throwable ignored) {
    }
  }
}
