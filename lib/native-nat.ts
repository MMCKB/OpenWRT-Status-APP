import { NativeModules, Platform } from "react-native";

export interface PhoneNatResult {
  publicAddress: string;
  publicPort: number;
  primaryServer: string;
  comparisonAddress?: string;
  comparisonPort?: number;
  comparisonServer?: string;
  mappingBehavior:
    | "single-server"
    | "multiple-public-addresses"
    | "endpoint-dependent-mapping"
    | "endpoint-independent-mapping";
  typeLabel: string;
}

interface OpenWrtNatBridge {
  detect(): Promise<PhoneNatResult>;
}

function bridge() {
  if (Platform.OS !== "android") {
    throw new Error("手机本地 NAT 检测目前仅支持 Android APK。");
  }
  const module = NativeModules.OpenWrtNat as OpenWrtNatBridge | undefined;
  if (!module) {
    throw new Error(
      "NAT 原生组件未加载。请安装包含最新版本的 Android APK 后使用。",
    );
  }
  return module;
}

/** 通过手机当前默认网络执行 UDP/STUN 检测，不连接路由器，也不使用 SSH。 */
export function detectPhoneNat() {
  return bridge().detect();
}
