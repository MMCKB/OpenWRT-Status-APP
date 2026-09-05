import { describe, expect, it } from "vitest";

import {
  defaultAdGuardBaseUrl,
  formatAdGuardCount,
  normalizeAdGuardBaseUrl,
} from "../lib/adguard-api";
import {
  defaultClashBaseUrl,
  normalizeClashBaseUrl,
  selectClashGroups,
} from "../lib/clash-api";

describe("Clash API 工具", () => {
  it("归一化 API 地址", () => {
    expect(normalizeClashBaseUrl("192.168.1.1:9090")).toBe("http://192.168.1.1:9090");
    expect(normalizeClashBaseUrl("http://192.168.1.1:9090/")).toBe("http://192.168.1.1:9090");
    expect(() => normalizeClashBaseUrl("")).toThrow();
  });

  it("从路由器地址推导默认 API 地址", () => {
    expect(defaultClashBaseUrl("http://192.168.1.1/ubus")).toBe("http://192.168.1.1:9090");
  });

  it("过滤出可切换的代理组", () => {
    const groups = selectClashGroups({
      DIRECT: { name: "DIRECT", type: "Direct", all: [] },
      "🚀 节点选择": { name: "🚀 节点选择", type: "Selector", now: "A", all: ["A", "B"] },
      "自动选择": { name: "自动选择", type: "URLTest", now: "A", all: ["A", "B"] },
      REJECT: { name: "REJECT", type: "Reject", all: [] },
    });
    expect(groups.map((group) => group.name)).toEqual(["🚀 节点选择", "自动选择"]);
  });
});

describe("AdGuard Home 工具", () => {
  it("归一化地址并补 /control 前缀", () => {
    expect(normalizeAdGuardBaseUrl("192.168.1.1:3000")).toBe("http://192.168.1.1:3000/control");
    expect(normalizeAdGuardBaseUrl("http://192.168.1.1:3000/control/")).toBe(
      "http://192.168.1.1:3000/control",
    );
  });

  it("推导默认地址", () => {
    expect(defaultAdGuardBaseUrl("192.168.1.1")).toBe("http://192.168.1.1:3000/control");
  });

  it("格式化计数", () => {
    expect(formatAdGuardCount(950)).toBe("950");
    expect(formatAdGuardCount(12300)).toBe("12.3K");
    expect(formatAdGuardCount(2_500_000)).toBe("2.5M");
  });
});
