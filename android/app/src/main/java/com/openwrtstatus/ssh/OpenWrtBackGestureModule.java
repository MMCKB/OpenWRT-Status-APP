package com.openwrtstatus.ssh;

import android.app.Activity;
import android.content.Context;
import com.app.openwrtstatusapp.MainActivity;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/** Exposes the Android 13+ predictive-back preference to the React Native settings screen. */
public class OpenWrtBackGestureModule extends ReactContextBaseJavaModule {
  public OpenWrtBackGestureModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "OpenWrtBackGesture";
  }

  @ReactMethod
  public void isEnabled(Promise promise) {
    boolean enabled = getReactApplicationContext()
        .getSharedPreferences("openwrt-status", Context.MODE_PRIVATE)
        .getBoolean("predictive-back-enabled", true);
    promise.resolve(enabled);
  }

  @ReactMethod
  public void setEnabled(boolean enabled, Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity instanceof MainActivity) {
      ((MainActivity) activity).setPredictiveBackEnabled(enabled);
    } else {
      getReactApplicationContext()
          .getSharedPreferences("openwrt-status", Context.MODE_PRIVATE)
          .edit()
          .putBoolean("predictive-back-enabled", enabled)
          .apply();
    }
    promise.resolve(null);
  }
}
