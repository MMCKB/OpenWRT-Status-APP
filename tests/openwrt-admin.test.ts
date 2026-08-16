import { describe, expect, it } from "vitest";

import {
  BACKUP_REMOTE_PATH,
  buildBlockClientCommand,
  buildBackupCommand,
  buildRestoreCommand,
  buildServiceCommand,
  buildWanDiagnosticCommand,
  parseConnectedClients,
  parseServiceStates,
  parseWifiConfigs,
} from "../lib/openwrt-admin";

describe("OpenWrt 管理命令与解析", () => {
  it("合并 DHCP 租约与邻居表为客户端列表", () => {
    const clients = parseConnectedClients("__LEASES__\n12345 aa:bb:cc:dd:ee:ff 192.168.1.10 phone *\n__NEIGH__\n192.168.1.10 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE");
    expect(clients).toEqual([{ mac: "AA:BB:CC:DD:EE:FF", hostname: "phone", ipv4: "192.168.1.10", expiresAt: "12345", online: true }]);
  });

  it("仅为有效 MAC 生成防火墙拉黑命令", () => {
    expect(buildBlockClientCommand("AA:bb:CC:dd:EE:ff")).toContain("openwrt_app_block_aa_bb_cc_dd_ee_ff");
    expect(() => buildBlockClientCommand("not-a-mac")).toThrow("MAC 地址格式无效");
  });

  it("解析无线 UCI 配置和服务快照", () => {
    expect(parseWifiConfigs("wireless.home.device='radio0'\nwireless.home.ssid='Home WiFi'\nwireless.home.disabled='0'")).toEqual([{ section: "home", device: "radio0", ssid: "Home WiFi", disabled: false }]);
    expect(parseServiceStates("OPENWRT|dnsmasq|running\nDOCKER|adguard|Up 2 hours")).toEqual([{ name: "dnsmasq", running: true, managedBy: "openwrt", detail: "running" }, { name: "adguard", running: true, managedBy: "docker", detail: "Up 2 hours" }]);
  });

  it("拒绝不安全的诊断目标", () => {
    expect(buildWanDiagnosticCommand("wan2", "ping", "1.1.1.1")).toContain("ping -I wan2");
    expect(() => buildWanDiagnosticCommand("wan; reboot", "ping", "1.1.1.1")).toThrow("WAN 接口格式无效");
  });

  it("仅允许受控服务命令和固定备份路径", () => {
    expect(buildServiceCommand("dnsmasq", "restart", "openwrt")).toBe("/etc/init.d/dnsmasq restart");
    expect(buildServiceCommand("adguard", "stop", "docker")).toBe("docker stop adguard");
    expect(() => buildServiceCommand("evil; reboot", "start", "docker")).toThrow("服务名称格式无效");
    expect(() => buildServiceCommand("cron", "start", "openwrt")).toThrow("不支持控制此系统服务");
    expect(buildBackupCommand()).toContain(BACKUP_REMOTE_PATH);
    expect(buildRestoreCommand()).toBe(`sysupgrade -r ${BACKUP_REMOTE_PATH}`);
  });
});
