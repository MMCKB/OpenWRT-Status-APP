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
      { interface: [{ interface: "wan", l3_device: "eth0", up: true, "ipv4-address": [{ address: "203.0.113.8" }], "ipv6-address": [{ address: "2001:db8::8" }], uptime: 3600, statistics: { rx_bytes: 1024, tx_bytes: 2048 } }] },
      { radio0: { up: true, channel: 36, interfaces: [{ ifname: "wlan0", up: true, config: { ssid: "Home" }, assoclist: { stationA: {} } }] } },
    );
    expect(status.online).toBe(true);
    expect(status.system?.hostname).toBe("gateway");
    expect(status.system?.load).toEqual([0.09999237048905166, 0.2, 0.29999237048905164]);
    expect(status.interfaces[0]).toMatchObject({ name: "wan", device: "eth0", ipv4: ["203.0.113.8"], up: true });
    expect(status.interfaces[0]?.ipv6).toEqual(["2001:db8::8"]);
    expect(status.interfaces[0]).toMatchObject({ rxBytes: 1024, txBytes: 2048 });
    expect(status.wireless[0]).toMatchObject({ ssid: "Home", clients: 1, up: true });
  });

  it("当网络接口返回中缺少统计时，合并 network.device 的字节计数", () => {
    const status = buildRouterStatus(
      "router-device-stats",
      {},
      { memory: { total: 1 } },
      { interface: [{ interface: "wan", l3_device: "eth0", up: true }] },
      {},
      [],
      { eth0: { statistics: { rx_bytes: "4096", tx_bytes: 8192 } } },
    );
    expect(status.interfaces[0]).toMatchObject({ device: "eth0", rxBytes: 4096, txBytes: 8192 });
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

  it("将无线字符串状态与已启用配置识别为在线", () => {
    const status = buildRouterStatus(
      "router-3",
      { hostname: "gateway", model: "Router", release: { description: "OpenWrt" } },
      { uptime: 1, load: [0, 0, 0], memory: { total: 1, free: 1 } },
      { interface: [] },
      {
        radio0: {
          disabled: "0",
          channel: 6,
          interfaces: {
            primary: { ifname: "wlan0", state: "up", config: { ssid: "Home" } },
          },
        },
        radio1: {
          disabled: false,
          config: { ssid: "Guest", mode: "ap" },
        },
      },
    );
    expect(status.wireless).toHaveLength(2);
    expect(status.wireless[0]).toMatchObject({ name: "wlan0", ssid: "Home", up: true, channel: "6" });
    expect(status.wireless[1]).toMatchObject({ ssid: "Guest", up: true });
  });

  it("将明确禁用的无线接口标记为未启用", () => {
    const status = buildRouterStatus(
      "router-4",
      {},
      { memory: { total: 1 } },
      { interface: [] },
      { radio0: { disabled: true, config: { ssid: "Disabled" } } },
    );
    expect(status.wireless[0]).toMatchObject({ ssid: "Disabled", up: false });
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
