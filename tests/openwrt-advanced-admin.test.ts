import { describe, expect, it } from "vitest";

import {
  buildBatchConfigBackupCommand,
  buildBatchRouterDiagnosticCommand,
  buildPortForwardCreateCommand,
  buildPortForwardDeleteCommand,
  buildPortForwardToggleCommand,
  buildProxyServiceActionCommand,
  buildRouterLogCommand,
  parseFirewallSnapshot,
  parseHealthSnapshot,
  parseProxyServiceStates,
} from "../lib/openwrt-advanced-admin";

describe("高级 OpenWrt 服务与网络管理", () => {
  it("检测 OpenClash 与 AdGuard Home 服务状态，并限制服务名称", () => {
    const states = parseProxyServiceStates("PROXY|openclash|installed|running|openclash\nPROXY|adguardhome|missing|stopped|AdGuardHome");
    expect(states).toEqual([
      { id: "openclash", label: "OpenClash", initName: "openclash", installed: true, running: true },
      { id: "adguardhome", label: "AdGuard Home", initName: "AdGuardHome", installed: false, running: false },
    ]);
    expect(buildProxyServiceActionCommand("openclash", "restart")).toContain("/etc/init.d/openclash restart");
  });

  it("解析健康采样中的存储、温度、连通性和 DNS 结果", () => {
    const health = parseHealthSnapshot("__DISKS__\nDISK|/overlay|100000|40000|60000|40%\n__TEMPERATURES__\nTEMP|62500\nTEMP|48\n__PING__\n2 packets transmitted, 2 packets received, 0% packet loss\nround-trip min/avg/max = 10.0/12.5/15.0 ms\n__DNS__\nName: openwrt.org\nAddress: 139.59.209.225");
    expect(health.disks[0]).toMatchObject({ mount: "/overlay", usePercent: 40, availableKb: 60000 });
    expect(health.temperaturesC).toEqual([62.5, 48]);
    expect(health.ping).toMatchObject({ lossPercent: 0, averageMs: 12.5 });
    expect(health.dnsReachable).toBe(true);
  });

  it("拒绝日志关键词换行，并固定诊断和备份命令的可控路径", () => {
    expect(buildRouterLogCommand("firewall", 999, "DROP")).toContain("tail -n 400");
    expect(() => buildRouterLogCommand("system", 50, "x\nreboot")).toThrow("不能包含换行");
    expect(buildBatchRouterDiagnosticCommand()).toContain("ping -c 2");
    const backup = buildBatchConfigBackupCommand("batch_123");
    expect(backup.remotePath).toBe("/tmp/openwrt-app-batch_123.tar.gz");
    expect(backup.command).toContain("sysupgrade -b");
    expect(() => buildBatchConfigBackupCommand("batch; reboot")).toThrow("备份批次格式无效");
  });

  it("解析匿名 UCI 区段，并仅允许安全格式的端口转发操作", () => {
    const snapshot = parseFirewallSnapshot("__FIREWALL__\nfirewall.@zone[0]=zone\nfirewall.@zone[0].name='lan'\nfirewall.@zone[0].network='lan'\nfirewall.@zone[0].input='ACCEPT'\nfirewall.@zone[0].output='ACCEPT'\nfirewall.@zone[0].forward='REJECT'\nfirewall.@redirect[0]=redirect\nfirewall.@redirect[0].name='NAS'\nfirewall.@redirect[0].src='wan'\nfirewall.@redirect[0].dest='lan'\nfirewall.@redirect[0].dest_ip='192.168.1.20'\nfirewall.@redirect[0].src_dport='443'\nfirewall.@redirect[0].dest_port='443'\nfirewall.@redirect[0].proto='tcp'\nfirewall.@redirect[0].enabled='1'\n__UPNP__\nUPNP|installed|running|1");
    expect(snapshot.zones).toEqual([{ section: "@zone[0]", name: "lan", networks: ["lan"], input: "ACCEPT", output: "ACCEPT", forward: "REJECT" }]);
    expect(snapshot.portForwards[0]).toMatchObject({ section: "@redirect[0]", name: "NAS", destinationIp: "192.168.1.20", enabled: true });
    expect(buildPortForwardToggleCommand("@redirect[0]", false)).toContain("firewall.@redirect[0].enabled='0'");
    expect(buildPortForwardDeleteCommand("@redirect[0]")).toContain("uci -q delete firewall.@redirect[0]");
    expect(() => buildPortForwardDeleteCommand("@redirect[0]; reboot")).toThrow("端口转发规则格式无效");
  });

  it("仅使用验证过的 IPv4、端口、区域及协议创建端口转发", () => {
    const command = buildPortForwardCreateCommand({ name: "NAS HTTPS", sourceZone: "wan", destinationZone: "lan", destinationIp: "192.168.1.20", sourcePort: "443", destinationPort: "8443", protocol: "tcp" });
    expect(command).toContain("dest_ip='192.168.1.20'");
    expect(command).toContain("src_dport='443'");
    expect(() => buildPortForwardCreateCommand({ name: "bad", sourceZone: "wan; reboot", destinationZone: "lan", destinationIp: "192.168.1.20", sourcePort: "443", destinationPort: "443", protocol: "tcp" })).toThrow("来源区域格式无效");
  });
});
