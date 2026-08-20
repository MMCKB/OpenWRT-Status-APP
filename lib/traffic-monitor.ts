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

export function trafficInterfaceId(item: Pick<InterfaceStatus, "name" | "device">) {
  return `${item.name}:${item.device}`;
}

/** Lists every reported network interface so the user may explicitly include LAN or extra WANs. */
export function getTrafficInterfaceCandidates(interfaces: InterfaceStatus[]) {
  return interfaces.filter((item) => item.rxBytes !== null || item.txBytes !== null);
}

export function getDefaultTrafficInterfaceId(interfaces: InterfaceStatus[]) {
  const active = getTrafficInterfaceCandidates(interfaces).filter((item) => item.up);
  const wan = active.filter((item) => WAN_NAME.test(item.name) || WAN_NAME.test(item.device));
  return wan[0] ? trafficInterfaceId(wan[0]) : active[0] ? trafficInterfaceId(active[0]) : null;
}

/** Prefers one upstream interface by default, while retaining explicit LAN/WAN selection support. */
export function selectTrafficInterfaces(interfaces: InterfaceStatus[], selectedInterfaceIds: string[] = []) {
  const active = getTrafficInterfaceCandidates(interfaces).filter((item) => item.up);
  if (!active.length) return { items: [], source: "unreported" as const };
  if (selectedInterfaceIds.length) {
    const selected = new Set(selectedInterfaceIds);
    return { items: active.filter((item) => selected.has(trafficInterfaceId(item))), source: "interfaces" as const };
  }
  const defaultId = getDefaultTrafficInterfaceId(interfaces);
  const item = active.find((candidate) => trafficInterfaceId(candidate) === defaultId) ?? active[0];
  const isWan = WAN_NAME.test(item.name) || WAN_NAME.test(item.device);
  return { items: [item], source: isWan ? "wan" as const : "interfaces" as const };
}

/** Builds independent snapshots so multi-WAN routers retain one history per uplink. */
export function makeTrafficInterfaceSnapshots(interfaces: InterfaceStatus[], timestamp = Date.now(), selectedInterfaceIds: string[] = []): TrafficInterfaceSnapshot[] {
  const selection = selectTrafficInterfaces(interfaces, selectedInterfaceIds);
  return selection.items.map((item) => ({
    id: trafficInterfaceId(item),
    label: item.name || item.device,
    device: item.device,
    timestamp,
    rxBytes: item.rxBytes ?? 0,
    txBytes: item.txBytes ?? 0,
    source: selection.source,
  }));
}

/** Retained for aggregate consumers and backwards-compatible data tests. */
export function makeTrafficSnapshot(interfaces: InterfaceStatus[], timestamp = Date.now(), selectedInterfaceIds: string[] = []): TrafficSnapshot {
  const selection = selectTrafficInterfaces(interfaces, selectedInterfaceIds);
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
