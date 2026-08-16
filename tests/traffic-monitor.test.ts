import { describe, expect, it } from "vitest";

import { appendTrafficRate, calculateTrafficRate, formatTrafficRate, makeTrafficInterfaceSnapshots, makeTrafficSnapshot, selectTrafficInterfaces } from "../lib/traffic-monitor";
import type { InterfaceStatus } from "../shared/router-types";

const interfaces: InterfaceStatus[] = [
  { name: "lan", device: "br-lan", up: true, ipv4: [], ipv6: [], uptimeSeconds: 1, rxBytes: 9000, txBytes: 8000 },
  { name: "wan", device: "eth0", up: true, ipv4: [], ipv6: [], uptimeSeconds: 1, rxBytes: 2000, txBytes: 1000 },
];

describe("实时流量采样", () => {
  it("优先使用 WAN 接口，避免把 LAN 流量重复计入互联网流量", () => {
    expect(selectTrafficInterfaces(interfaces)).toMatchObject({ source: "wan", items: [interfaces[1]] });
    expect(makeTrafficSnapshot(interfaces, 1000)).toMatchObject({ rxBytes: 2000, txBytes: 1000, source: "wan" });
  });

  it("为每个 WAN 保留单独的采样身份，避免多拨或多宽带流量被合并", () => {
    const multiWan: InterfaceStatus[] = [
      ...interfaces,
      { name: "wanb", device: "eth1", up: true, ipv4: [], ipv6: [], uptimeSeconds: 1, rxBytes: 9000, txBytes: 4000 },
    ];
    expect(makeTrafficInterfaceSnapshots(multiWan, 1000)).toEqual([
      expect.objectContaining({ id: "wan:eth0", label: "wan", device: "eth0", rxBytes: 2000, txBytes: 1000, source: "wan" }),
      expect.objectContaining({ id: "wanb:eth1", label: "wanb", device: "eth1", rxBytes: 9000, txBytes: 4000, source: "wan" }),
    ]);
  });

  it("按两次接口字节计数计算上下行速率", () => {
    const previous = { timestamp: 1000, rxBytes: 2000, txBytes: 1000, source: "wan" as const };
    const current = { timestamp: 6000, rxBytes: 12000, txBytes: 3500, source: "wan" as const };
    expect(calculateTrafficRate(previous, current)).toEqual({ rxBytesPerSecond: 2000, txBytesPerSecond: 500, sampleSeconds: 5 });
  });

  it("在计数器回绕或重启时不显示负速率，并限制历史样本数", () => {
    const previous = { timestamp: 1000, rxBytes: 12000, txBytes: 8000, source: "wan" as const };
    const current = { timestamp: 6000, rxBytes: 100, txBytes: 50, source: "wan" as const };
    expect(calculateTrafficRate(previous, current)).toMatchObject({ rxBytesPerSecond: 0, txBytesPerSecond: 0 });
    const rate = calculateTrafficRate(previous, current);
    expect(appendTrafficRate([], rate, 1)).toHaveLength(1);
    expect(formatTrafficRate(1536)).toBe("1.5 KB/s");
  });
});
