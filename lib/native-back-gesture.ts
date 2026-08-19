import { NativeModules, Platform } from "react-native";

interface OpenWrtBackGestureBridge {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

function bridge() {
  return NativeModules.OpenWrtBackGesture as OpenWrtBackGestureBridge | undefined;
}

export async function getPredictiveBackEnabled() {
  if (Platform.OS !== "android") return false;
  return (await bridge()?.isEnabled()) ?? false;
}

export async function setPredictiveBackEnabled(enabled: boolean) {
  if (Platform.OS !== "android") return;
  const module = bridge();
  if (!module) throw new Error("预测性返回组件未加载。请安装最新 Android APK 后使用。");
  await module.setEnabled(enabled);
}
