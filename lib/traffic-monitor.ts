import type { InterfaceStatus } from "@/shared/router-types";

export interface TrafficSnapshot {
  timestamp: number;
  rxBytes: number;
  txBytes: number;
  source: "wan" | "interfaces" | "unreported";
}

export interface TrafficRate {
  rxBytesPerSecond: number;
  txBytesPerSecond: number;
  sampleSeconds: number;
}

const WAN_NAME = /(^|[-_.])(wan|wwan|uplink|internet)([-_.]|$)|^pppoe/i;

/** Prefers upstream interfaces so LAN-side traffic is not counted twice in the dashboard total. */
export function selectTrafficInterfaces(interfaces: InterfaceStatus[]) {
  const active = interfaces.filter((item) => item.up && (item.rxBytes !== null || item.txBytes !== null));
  const wan = active.filter((item) => WAN_NAME.test(item.name) || WAN_NAME.test(item.device));
  return wan.length ? { items: wan, source: "wan" as const } : active.length ? { items: active, source: "interfaces" as const } : { items: [], source: "unreported" as const };
}

export function makeTrafficSnapshot(interfaces: InterfaceStatus[], timestamp = Date.now()): TrafficSnapshot {
  const selection = selectTrafficInterfaces(interfaces);
  return {
    timestamp,
    rxBytes: selection.items.reduce((total, item) => total + (item.rxBytes ?? 0), 0),
    txBytes: selection.items.reduce((total, item) => total + (item.txBytes ?? 0), 0),
    source: selection.source,
  };
}

export function calculateTrafficRate(previous: TrafficSnapshot | null, current: TrafficSnapshot): TrafficRate | null {
  if (!previous || previous.source === "unreported" || current.source === "unreported") return null;
  const elapsedMilliseconds = current.timestamp - previous.timestamp;
  if (elapsedMilliseconds <= 0) return null;
  const seconds = elapsedMilliseconds / 1000;
  return {
    rxBytesPerSecond: Math.max(0, current.rxBytes - previous.rxBytes) / seconds,
    txBytesPerSecond: Math.max(0, current.txBytes - previous.txBytes) / seconds,
    sampleSeconds: seconds,
  };
}

export function appendTrafficRate(history: TrafficRate[], next: TrafficRate | null, limit = 24) {
  if (!next) return history;
  return [...history, next].slice(-Math.max(1, limit));
}

export function formatTrafficRate(bytesPerSecond: number | null) {
  if (bytesPerSecond === null) return "等待采样";
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
  if (bytesPerSecond < 1024 ** 2) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / 1024 ** 2).toFixed(1)} MB/s`;
}
