import { describe, expect, it } from "vitest";

import { summarizeTrafficUsage, type TrafficHistoryPoint } from "../lib/traffic-history";

describe("按 WAN 的本地流量统计", () => {
  it("分别汇总每个 WAN 的正向字节增量，并跳过计数器重置", () => {
    const points: TrafficHistoryPoint[] = [
      { sampledAt: "2026-08-17T00:00:00.000Z", interfaces: { wan: { rxBytes: 100, txBytes: 50 }, wan2: { rxBytes: 300, txBytes: 100 } } },
      { sampledAt: "2026-08-17T01:00:00.000Z", interfaces: { wan: { rxBytes: 220, txBytes: 90 }, wan2: { rxBytes: 380, txBytes: 140 } } },
      { sampledAt: "2026-08-17T02:00:00.000Z", interfaces: { wan: { rxBytes: 20, txBytes: 10 }, wan2: { rxBytes: 430, txBytes: 170 } } },
    ];
    expect(summarizeTrafficUsage(points, "wan", new Date("2026-08-17T00:00:00.000Z"), new Date("2026-08-17T03:00:00.000Z"))).toEqual({ rxBytes: 120, txBytes: 40, samples: 3 });
    expect(summarizeTrafficUsage(points, "wan2", new Date("2026-08-17T00:00:00.000Z"), new Date("2026-08-17T03:00:00.000Z"))).toEqual({ rxBytes: 130, txBytes: 70, samples: 3 });
  });
});
