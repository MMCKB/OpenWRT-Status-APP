import { describe, expect, it } from "vitest";

import {
  buildBatchConfigBackupCommand,
  buildBatchRouterDiagnosticCommand,
  buildPluginConfigApplyCommand,
  buildPluginConfigSnapshotCommand,
  buildPluginLogCommand,
  buildPortForwardCreateCommand,
  buildPortForwardDeleteCommand,
  buildPortForwardToggleCommand,
  buildProxyServiceActionCommand,
  buildProxyServiceConfigUrl,
  buildProxyServiceSnapshotCommand,
  buildRouterLogCommand,
  parsePluginConfigSnapshot,
  parseFirewallSnapshot,
  parseHealthSnapshot,
  parseProxyServiceStates,
} from "../lib/openwrt-advanced-admin";

describe("高级 OpenWrt 服务与网络管理", () => {
  it("检测全部兼容网络服务状态，并限制服务名称", () => {
    const states = parseProxyServiceStates(
      "PROXY|openclash|installed|running|openclash\nPROXY|adguardhome|missing|stopped|AdGuardHome\nPROXY|passwall|installed|stopped|passwall\nPROXY|passwall2|installed|running|passwall2\nPROXY|ddns|installed|running|ddns",
    );
    expect(states).toEqual([
      {
        id: "openclash",
        label: "OpenClash",
        initName: "openclash",
        installed: true,
        running: true,
      },
      {
        id: "adguardhome",
        label: "AdGuard Home",
        initName: "AdGuardHome",
        installed: false,
        running: false,
      },
      {
        id: "passwall",
        label: "PassWall",
        initName: "passwall",
        installed: true,
        running: false,
      },
      {
        id: "passwall2",
        label: "PassWall2",
        initName: "passwall2",
        installed: true,
        running: true,
      },
      {
        id: "ddns",
        label: "DDNS",
        initName: "ddns",
        installed: true,
        running: true,
      },
    ]);
    expect(buildProxyServiceActionCommand("openclash", "restart")).toContain(
      "/etc/init.d/openclash restart",
    );
    expect(buildProxyServiceActionCommand("passwall", "start")).toContain(
      "/etc/init.d/passwall start",
    );
    expect(buildProxyServiceActionCommand("passwall2", "restart")).toContain(
      "/etc/init.d/passwall2 restart",
    );
    expect(buildProxyServiceActionCommand("ddns", "stop")).toContain(
      "/etc/init.d/ddns stop",
    );
    const snapshotCommand = buildProxyServiceSnapshotCommand();
    expect(snapshotCommand).toContain("/etc/init.d/passwall");
    expect(snapshotCommand).toContain("/etc/init.d/passwall2");
    expect(snapshotCommand).toContain("/etc/init.d/ddns");
  });

  it("解析健康采样中的存储、温度、连通性和 DNS 结果", () => {
    const health = parseHealthSnapshot(
      "__DISKS__\nDISK|/overlay|100000|40000|60000|40%\n__TEMPERATURES__\nTEMP|62500\nTEMP|48\n__PING__\n2 packets transmitted, 2 packets received, 0% packet loss\nround-trip min/avg/max = 10.0/12.5/15.0 ms\n__DNS__\nName: openwrt.org\nAddress: 139.59.209.225",
    );
    expect(health.disks[0]).toMatchObject({
      mount: "/overlay",
      usePercent: 40,
      availableKb: 60000,
    });
    expect(health.temperaturesC).toEqual([62.5, 48]);
    expect(health.ping).toMatchObject({ lossPercent: 0, averageMs: 12.5 });
    expect(health.dnsReachable).toBe(true);
  });

  it("拒绝日志关键词换行，并固定诊断和备份命令的可控路径", () => {
    expect(buildRouterLogCommand("firewall", 999, "DROP")).toContain(
      "tail -n 400",
    );
    expect(() => buildRouterLogCommand("system", 50, "x\nreboot")).toThrow(
      "不能包含换行",
    );
    expect(buildBatchRouterDiagnosticCommand()).toContain("ping -c 2");
    const backup = buildBatchConfigBackupCommand("batch_123");
    expect(backup.remotePath).toBe("/tmp/openwrt-app-batch_123.tar.gz");
    expect(backup.command).toContain("sysupgrade -b");
    expect(() => buildBatchConfigBackupCommand("batch; reboot")).toThrow(
      "备份批次格式无效",
    );
  });

  it("为兼容服务生成受限日志命令和 LuCI 配置入口", () => {
    expect(buildPluginLogCommand("passwall", 100)).toContain(
      "tail -n 100 '/tmp/log/passwall.log'",
    );
    expect(buildPluginLogCommand("passwall2", 100)).toContain(
      "tail -n 100 '/tmp/log/passwall2.log'",
    );
    expect(buildPluginLogCommand("ddns", 100)).toContain("grep -Ei 'ddns'");
    expect(buildPluginLogCommand("openclash", Number.NaN)).toContain(
      "tail -n 100",
    );
    expect(() => buildPluginLogCommand("ddns\nreboot" as never)).toThrow(
      "不支持的服务",
    );
    expect(
      buildProxyServiceConfigUrl("http://192.168.1.1/ubus", "passwall2"),
    ).toBe("http://192.168.1.1/cgi-bin/luci/admin/services/passwall2");
    expect(() =>
      buildProxyServiceConfigUrl("http://192.168.1.1\nreboot", "ddns"),
    ).toThrow("路由器地址格式不正确");
  });

  it("仅为内置服务读取并安全保存应用内配置", () => {
    expect(buildPluginConfigSnapshotCommand("passwall2")).toContain(
      "'/etc/config/passwall2'",
    );
    expect(
      parsePluginConfigSnapshot(
        "ddns",
        "__PLUGIN_CONFIG__|ddns|present\nconfig service 'cloudflare'\n\toption enabled '1'\n",
      ),
    ).toMatchObject({
      exists: true,
      configPath: "/etc/config/ddns",
      content: "config service 'cloudflare'\n\toption enabled '1'",
    });
    expect(
      parsePluginConfigSnapshot(
        "openclash",
        "__PLUGIN_CONFIG__|openclash|missing\n",
      ),
    ).toMatchObject({ exists: false, content: "" });
    const command = buildPluginConfigApplyCommand(
      "passwall",
      "config global 'global'\n\toption enabled '1'\n",
    );
    expect(command).toContain("base64 -d");
    expect(command).toContain(
      "mktemp /tmp/openwrt-status-passwall-config.XXXXXX",
    );
    expect(command).toContain('rm -f "$temp"');
    expect(command).toContain("'/etc/config/passwall'");
    expect(command).toContain("'/etc/config/passwall.openwrt-status.bak'");
    expect(command).toContain("/etc/init.d/passwall restart");
    expect(() => buildPluginConfigApplyCommand("ddns", "\n")).toThrow(
      "配置内容不能为空",
    );
    expect(() =>
      buildPluginConfigSnapshotCommand("ddns; reboot" as never),
    ).toThrow("不支持的服务");
  });

  it("解析匿名 UCI 区段，并仅允许安全格式的端口转发操作", () => {
    const snapshot = parseFirewallSnapshot(
      "__FIREWALL__\nfirewall.@zone[0]=zone\nfirewall.@zone[0].name='lan'\nfirewall.@zone[0].network='lan'\nfirewall.@zone[0].input='ACCEPT'\nfirewall.@zone[0].output='ACCEPT'\nfirewall.@zone[0].forward='REJECT'\nfirewall.@redirect[0]=redirect\nfirewall.@redirect[0].name='NAS'\nfirewall.@redirect[0].src='wan'\nfirewall.@redirect[0].dest='lan'\nfirewall.@redirect[0].dest_ip='192.168.1.20'\nfirewall.@redirect[0].src_dport='443'\nfirewall.@redirect[0].dest_port='443'\nfirewall.@redirect[0].proto='tcp'\nfirewall.@redirect[0].enabled='1'\n__UPNP__\nUPNP|installed|running|1",
    );
    expect(snapshot.zones).toEqual([
      {
        section: "@zone[0]",
        name: "lan",
        networks: ["lan"],
        input: "ACCEPT",
        output: "ACCEPT",
        forward: "REJECT",
      },
    ]);
    expect(snapshot.portForwards[0]).toMatchObject({
      section: "@redirect[0]",
      name: "NAS",
      destinationIp: "192.168.1.20",
      enabled: true,
    });
    expect(buildPortForwardToggleCommand("@redirect[0]", false)).toContain(
      "firewall.@redirect[0].enabled='0'",
    );
    expect(buildPortForwardDeleteCommand("@redirect[0]")).toContain(
      "uci -q delete firewall.@redirect[0]",
    );
    expect(() => buildPortForwardDeleteCommand("@redirect[0]; reboot")).toThrow(
      "端口转发规则格式无效",
    );
  });

  it("仅使用验证过的 IPv4、端口、区域及协议创建端口转发", () => {
    const command = buildPortForwardCreateCommand({
      name: "NAS HTTPS",
      sourceZone: "wan",
      destinationZone: "lan",
      destinationIp: "192.168.1.20",
      sourcePort: "443",
      destinationPort: "8443",
      protocol: "tcp",
    });
    expect(command).toContain("dest_ip='192.168.1.20'");
    expect(command).toContain("src_dport='443'");
    expect(() =>
      buildPortForwardCreateCommand({
        name: "bad",
        sourceZone: "wan; reboot",
        destinationZone: "lan",
        destinationIp: "192.168.1.20",
        sourcePort: "443",
        destinationPort: "443",
        protocol: "tcp",
      }),
    ).toThrow("来源区域格式无效");
  });
});
