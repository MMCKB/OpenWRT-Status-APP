import AsyncStorage from "@react-native-async-storage/async-storage";

import { isWanInterface } from "./openwrt-admin";
import type { InterfaceStatus } from "../shared/router-types";

export interface TrafficHistoryPoint {
  sampledAt: string;
  interfaces: Record<string, { rxBytes: number; txBytes: number }>;
}

export interface TrafficUsageSummary {
  rxBytes: number;
  txBytes: number;
  samples: number;
}

const MAX_POINTS = 1_500;

function storageKey(routerId: string) {
  return `openwrt-status-app:traffic-history:${routerId}`;
}

export async function loadTrafficHistory(routerId: string): Promise<TrafficHistoryPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(routerId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((point): point is TrafficHistoryPoint => Boolean(point?.sampledAt && point?.interfaces)) : [];
  } catch {
    return [];
  }
}

export async function recordWanTrafficHistory(routerId: string, interfaces: InterfaceStatus[], sampledAt: string) {
  const pointInterfaces = Object.fromEntries(
    interfaces.filter(isWanInterface).flatMap((item) => item.rxBytes != null && item.txBytes != null ? [[item.name, { rxBytes: item.rxBytes, txBytes: item.txBytes }] as const] : []),
  );
  if (!Object.keys(pointInterfaces).length) return;
  const existing = await loadTrafficHistory(routerId);
  const next = [...existing, { sampledAt, interfaces: pointInterfaces }].slice(-MAX_POINTS);
  await AsyncStorage.setItem(storageKey(routerId), JSON.stringify(next));
}

export function summarizeTrafficUsage(points: TrafficHistoryPoint[], interfaceName: string, from: Date, to: Date): TrafficUsageSummary {
  const filtered = points.filter((point) => {
    const time = new Date(point.sampledAt).getTime();
    return time >= from.getTime() && time <= to.getTime() && Boolean(point.interfaces[interfaceName]);
  });
  let rxBytes = 0;
  let txBytes = 0;
  for (let index = 1; index < filtered.length; index += 1) {
    const previous = filtered[index - 1].interfaces[interfaceName];
    const current = filtered[index].interfaces[interfaceName];
    if (current.rxBytes >= previous.rxBytes) rxBytes += current.rxBytes - previous.rxBytes;
    if (current.txBytes >= previous.txBytes) txBytes += current.txBytes - previous.txBytes;
  }
  return { rxBytes, txBytes, samples: filtered.length };
}
