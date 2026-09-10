import { NativeModules, Platform } from "react-native";

type OpenWrtPredictiveBackNativeModule = {
  setPredictiveMode(enabled: boolean): void;
  setAtRoot(root: boolean): void;
};

const nativeModule: OpenWrtPredictiveBackNativeModule | null =
  Platform.OS === "android"
    ? ((
        NativeModules as Record<
          string,
          OpenWrtPredictiveBackNativeModule | undefined
        >
      ).OpenWrtPredictiveBack ?? null)
    : null;

/**
 * 开启/关闭预测模式。开启时原生侧停用 ReactActivity 的常启用返回回调，
 * 并注册非根屏转发器，让系统在根屏接管返回并播放预测动画（Android 13+）。
 */
export function setPredictiveMode(enabled: boolean) {
  nativeModule?.setPredictiveMode(enabled);
}

/** 导航变化时同步根屏状态：根屏禁用转发器交给系统，二级屏启用转发器弹栈。 */
export function setPredictiveBackAtRoot(root: boolean) {
  nativeModule?.setAtRoot(root);
}
