import { describe, expect, it } from "vitest";

import { buildRouterStatus, formatBytes, formatUptime, memoryUsagePercent, normalizeRouterEndpoint } from "../lib/openwrt-client";
import { getSshTarget, makeSshUri } from "../lib/ssh-client";

describe("OpenWrt 数据转换", () => {
  it("规范化没有 /ubus 的管理地址", () => {
    expect(normalizeRouterEndpoint("192.168.1.1")).toBe("http://192.168.1.1/ubus");
    expect(normalizeRouterEndpoint("https://router.local/ubus/")).toBe("https://router.local/ubus");
  });

  it("从 ubus 返回中生成真实字段对应的状态对象", () => {
    const status = buildRouterStatus(
      "router-1",
      { hostname: "gateway", model: "GL.iNet MT3000", release: { description: "OpenWrt 24.10" } },
      { uptime: 90061, load: [6553, 13107, 19660], memory: { total: 268435456, free: 120000000, buffered: 20000000, cached: 30000000 } },
      { interface: [{ interface: "wan", l3_device: "eth0", up: true, "ipv4-address": [{ address: "203.0.113.8" }], "ipv6-address": [{ address: "2001:db8::8" }], uptime: 3600 }] },
      { radio0: { up: true, channel: 36, interfaces: [{ ifname: "wlan0", up: true, config: { ssid: "Home" }, assoclist: { stationA: {} } }] } },
    );
    expect(status.online).toBe(true);
    expect(status.system?.hostname).toBe("gateway");
    expect(status.system?.load).toEqual([0.09999237048905166, 0.2, 0.29999237048905164]);
    expect(status.interfaces[0]).toMatchObject({ name: "wan", device: "eth0", ipv4: ["203.0.113.8"], up: true });
    expect(status.interfaces[0]?.ipv6).toEqual(["2001:db8::8"]);
    expect(status.wireless[0]).toMatchObject({ ssid: "Home", clients: 1, up: true });
  });

  it("兼容嵌套 wireless 对象、对象型接口和数值信道", () => {
    const status = buildRouterStatus(
      "router-2",
      { hostname: "gateway", model: "Router", release: { description: "OpenWrt" } },
      { uptime: 1, load: [0, 0, 0], memory: { total: 1, free: 1 } },
      { interface: [] },
      { wireless: { radio0: { channel: 149, up: true, interfaces: { primary: { ifname: "phy0-ap0", ssid: "Guest", stations: [{}, {}] } } } } },
    );
    expect(status.wireless).toEqual([{ name: "phy0-ap0", ssid: "Guest", up: true, channel: "149", clients: 2 }]);
  });

  it("格式化仪表盘中的数字", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatUptime(90061)).toBe("1 天 1 小时");
    expect(memoryUsagePercent({ hostname: "a", model: "b", firmware: "c", uptimeSeconds: 1, load: null, memoryTotal: 100, memoryAvailable: 40 })).toBe(60);
  });

  it("从路由器资料生成不含密码的 SSH 交接地址", () => {
    const profile = { id: "router-1", name: "主路由", baseUrl: "http://192.168.1.1/ubus", username: "root", sshPort: 22022, createdAt: "2026-08-15" };
    expect(getSshTarget(profile)).toBe("root@192.168.1.1:22022");
    expect(makeSshUri(profile)).toBe("ssh://root@192.168.1.1:22022");
    expect(makeSshUri({ ...profile, baseUrl: "http://[fd00::1]/ubus", sshPort: 22 })).toBe("ssh://root@[fd00::1]:22");
  });
});
