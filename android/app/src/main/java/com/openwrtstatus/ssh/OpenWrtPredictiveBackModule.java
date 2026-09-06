package com.openwrtstatus.ssh;

import android.app.Activity;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.lang.reflect.Field;

/**
 * Android 13+ 预测性返回手势支持。targetSdk>=36 时 ReactActivity 注册了一个
 * 常启用的 OnBackPressedCallback，它的存在让系统认为返回事件始终由应用接管，
 * 因此永不播放系统预测返回动画。
 *
 * 开启预测模式：反射停用 RN 的常启用回调，并注册一个转发器——非根屏把返回
 * 事件送回 JS（由 expo-router 弹栈），根屏保持转发器禁用，让系统接管并播放
 * 预测动画。关闭预测模式：恢复 RN 回调，返回行为与旧版完全一致。
 */
public class OpenWrtPredictiveBackModule extends ReactContextBaseJavaModule {
  private volatile boolean predictiveMode = false;
  private volatile boolean atRoot = true;
  private OnBackPressedCallback forwarder;
  private Activity forwarderActivity;

  public OpenWrtPredictiveBackModule(ReactApplicationContext context) {
    super(context);
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
    if (!(activity instanceof ComponentActivity)) return;
    ComponentActivity componentActivity = (ComponentActivity) activity;
    setReactActivityCallbackEnabled(activity, !predictiveMode);
    if (!predictiveMode) {
      if (forwarder != null) {
        forwarder.remove();
        forwarder = null;
        forwarderActivity = null;
      }
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
                activity.finish();
                return;
              }
              getReactApplicationContext()
                  .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                  .emit("hardwareBackPress", null);
            }
          };
      forwarderActivity = activity;
      componentActivity.getOnBackPressedDispatcher().addCallback(componentActivity, forwarder);
    }
    forwarder.setEnabled(!atRoot);
  }

  /** 反射定位 ReactActivity 的常启用返回回调；RN 更名该字段时静默降级为旧行为。 */
  private void setReactActivityCallbackEnabled(Activity activity, boolean enabled) {
    try {
      Class<?> clazz = activity.getClass();
      while (clazz != null && !"com.facebook.react.ReactActivity".equals(clazz.getName())) {
        clazz = clazz.getSuperclass();
      }
      if (clazz == null) return;
      Field field = clazz.getDeclaredField("mBackPressedCallback");
      field.setAccessible(true);
      Object callback = field.get(activity);
      if (callback instanceof OnBackPressedCallback) {
        ((OnBackPressedCallback) callback).setEnabled(enabled);
      }
    } catch (Throwable ignored) {
      // 保持既有返回行为，不中断预测模式的其余部分。
    }
  }
}
