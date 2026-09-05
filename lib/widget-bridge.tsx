import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { fetchRouterStatus } from "./openwrt-client";
import { formatBytes, memoryUsagePercent } from "./openwrt-client";
import { makeTrafficSnapshot, calculateTrafficRate, formatTrafficRate } from "./traffic-monitor";
import { loadPassword, loadProfiles, loadSettings } from "./router-storage";
import { OpenWrtStatusWidget } from "../widgets/openwrt-status-widget";
import type { RouterProfile, RouterStatus } from "../shared/router-types";

export const WIDGET_NAME = "OpenWrtStatusWidget";

const LAST_SAMPLE_KEY = "openwrt.widget-last-sample";
const CACHED_VIEW_KEY = "openwrt.widget-cached-view";

export interface OpenWrtWidgetView {
  kind: "ok" | "offline" | "no-router";
  routerName: string;
  hostname: string;
  online: boolean;
  rxRate: string | null;
  txRate: string | null;
  memoryPercent: number | null;
  updatedAt: string;
}

/** 读取状态并计算与上次采样的速率,组装 widget 视图数据。 */
export async function buildOpenWrtWidgetView(): Promise<OpenWrtWidgetView> {
  const profiles = await loadProfiles();
  const settings = await loadSettings();
  const profile = profiles.find((item) => item.id === settings.selectedRouterId);
  if (!profile) {
    return {
      kind: "no-router", routerName: "OpenWrt 状态", hostname: "", online: false,
      rxRate: null, txRate: null, memoryPercent: null, updatedAt: "",
    };
  }
  const password = await loadPassword(profile.id);
  if (!password) {
    return offlineView(profile, "未保存密码");
  }
  try {
    const status = await fetchRouterStatus(profile.id, profile.baseUrl, profile.username, password);
    const view = await assembleView(profile, status);
    await AsyncStorage.setItem(CACHED_VIEW_KEY, JSON.stringify(view));
    return view;
  } catch {
    return offlineView(profile, "连接失败");
  }
}

async function offlineView(profile: RouterProfile, reason: string): Promise<OpenWrtWidgetView> {
  const cached = await AsyncStorage.getItem(CACHED_VIEW_KEY);
  const previous = cached ? (JSON.parse(cached) as OpenWrtWidgetView) : null;
  return {
    kind: "offline",
    routerName: profile.name,
    hostname: reason,
    online: false,
    rxRate: previous?.online ? previous.rxRate : null,
    txRate: previous?.online ? previous.txRate : null,
    memoryPercent: null,
    updatedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
  };
}

async function assembleView(profile: RouterProfile, status: RouterStatus): Promise<OpenWrtWidgetView> {
  const snapshot = makeTrafficSnapshot(status.interfaces, Date.now());
  const raw = await AsyncStorage.getItem(LAST_SAMPLE_KEY);
  const previous = raw ? (JSON.parse(raw) as { timestamp: number; rx: number; tx: number }) : null;
  await AsyncStorage.setItem(
    LAST_SAMPLE_KEY,
    JSON.stringify({ timestamp: snapshot.timestamp, rx: snapshot.rxBytes, tx: snapshot.txBytes }),
  );
  const rate = calculateTrafficRate(
    previous ? { timestamp: previous.timestamp, rxBytes: previous.rx, txBytes: previous.tx, source: "wan" } : null,
    { timestamp: snapshot.timestamp, rxBytes: snapshot.rxBytes, txBytes: snapshot.txBytes, source: snapshot.source },
  );
  return {
    kind: "ok",
    routerName: profile.name,
    hostname: status.system?.hostname ?? "",
    online: status.online,
    rxRate: rate ? formatTrafficRate(rate.rxBytesPerSecond) : null,
    txRate: rate ? formatTrafficRate(rate.txBytesPerSecond) : null,
    memoryPercent: memoryUsagePercent(status.system),
    updatedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
  };
}

export { formatBytes };

/** 应用前台刷新成功后同步刷新桌面小组件(Android only)。 */
export async function refreshOpenWrtWidgetFromApp(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const { requestWidgetUpdate } = await import("react-native-android-widget");
    const view = await buildOpenWrtWidgetView();
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: () => <OpenWrtStatusWidget view={view} />,
    });
  } catch {
    // 桌面上没有添加小组件时静默忽略。
  }
}
