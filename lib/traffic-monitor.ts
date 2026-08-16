import type { InterfaceStatus } from "@/shared/router-types";

export interface TrafficSnapshot {
  timestamp: number;
  rxBytes: number;
  txBytes: number;
  source: "wan" | "interfaces" | "unreported";
}

export interface TrafficInterfaceSnapshot extends TrafficSnapshot {
  id: string;
  label: string;
  device: string;
}

export interface TrafficRate {
  rxBytesPerSecond: number;
  txBytesPerSecond: number;
  sampleSeconds: number;
}

const WAN_NAME = /(^|[-_.])(wan|wwan|uplink|internet)([-_.]|$)|^wan[a-z0-9_-]*$|^pppoe/i;

/** Prefers upstream interfaces so LAN-side traffic is not counted twice in dashboard figures. */
export function selectTrafficInterfaces(interfaces: InterfaceStatus[]) {
  const active = interfaces.filter((item) => item.up && (item.rxBytes !== null || item.txBytes !== null));
  const wan = active.filter((item) => WAN_NAME.test(item.name) || WAN_NAME.test(item.device));
  return wan.length
    ? { items: wan, source: "wan" as const }
    : active.length
      ? { items: active, source: "interfaces" as const }
      : { items: [], source: "unreported" as const };
}

/** Builds independent snapshots so multi-WAN routers retain one history per uplink. */
export function makeTrafficInterfaceSnapshots(interfaces: InterfaceStatus[], timestamp = Date.now()): TrafficInterfaceSnapshot[] {
  const selection = selectTrafficInterfaces(interfaces);
  return selection.items.map((item) => ({
    id: `${item.name}:${item.device}`,
    label: item.name || item.device,
    device: item.device,
    timestamp,
    rxBytes: item.rxBytes ?? 0,
    txBytes: item.txBytes ?? 0,
    source: selection.source,
  }));
}

/** Retained for aggregate consumers and backwards-compatible data tests. */
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
