import { describe, expect, it } from "vitest";

import {
  buildBatchConfigBackupCommand,
  buildBatchRouterDiagnosticCommand,
  buildFirewallForwardingToggleCommand,
  buildFirewallRuleCreateCommand,
  buildFirewallRuleDeleteCommand,
  buildFirewallRuleToggleCommand,
  buildFirewallRuleUpdateCommand,
  buildPluginConfigApplyCommand,
  buildPluginConfigSnapshotCommand,
  buildPluginLogCommand,
  buildPluginSettingsApplyCommand,
  buildPluginSettingsSnapshotCommand,
  buildPortForwardCreateCommand,
  buildPortForwardDeleteCommand,
  buildPortForwardToggleCommand,
  buildPortForwardUpdateCommand,
  buildProxyServiceActionCommand,
  buildProxyServiceConfigUrl,
  buildProxyServiceSnapshotCommand,
  buildRouterLogCommand,
  parsePluginConfigSnapshot,
  parsePluginSettingsSnapshot,
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
    expect(buildPluginLogCommand("openclash", 80)).toContain(
      "OpenClash 暂未找到可读取的日志",
    );
    expect(buildPluginLogCommand("openclash", 80)).toContain(
      'if [ -n "$__service_log" ]',
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

  it("解析并受控保存服务完整 UCI 设置", () => {
    const snapshotCommand = buildPluginSettingsSnapshotCommand("ddns");
    expect(snapshotCommand).toContain("uci -q show 'ddns'");
    expect(snapshotCommand).toContain("while IFS= read -r line; do");
    expect(snapshotCommand).toContain('case "$line" in');
    expect(
      parsePluginSettingsSnapshot(
        "ddns",
        "__PLUGIN_SETTINGS__|ddns|present\nSECTION|cloudflare|service\nVALUE|cloudflare|enabled|'1'\nVALUE|cloudflare|domain|'example.com'\nVALUE|cloudflare|password|'token-value'\nVALUE|cloudflare|use_https|'1'\nSECTION|@global[0]|global\nVALUE|@global[0]|check_interval|'10'\n",
      ),
    ).toMatchObject({
      exists: true,
      sections: [
        {
          section: "cloudflare",
          type: "service",
          values: {
            enabled: "1",
            domain: "example.com",
            password: "token-value",
            use_https: "1",
          },
        },
        {
          section: "@global[0]",
          type: "global",
          values: { check_interval: "10" },
        },
      ],
    });
    expect(
      parsePluginSettingsSnapshot(
        "openclash",
        "BusyBox v1.36.1 (2026-08-19)\nroot@OpenWrt:~# __PLUGIN_SETTINGS__|openclash|present\nSECTION|config|openclash\nVALUE|config|enable|'1'\nVALUE|config|config_path|'/etc/openclash/config/config.yaml'\nSECTION|@dnsmasq[0]|dnsmasq\nVALUE|@dnsmasq[0]|enable|'1'\nroot@OpenWrt:~# ",
      ),
    ).toMatchObject({
      exists: true,
      sections: [
        {
          section: "config",
          type: "openclash",
          values: {
            enable: "1",
            config_path: "/etc/openclash/config/config.yaml",
          },
        },
        {
          section: "@dnsmasq[0]",
          type: "dnsmasq",
          values: { enable: "1" },
        },
      ],
    });
    const command = buildPluginSettingsApplyCommand("ddns", "cloudflare", {
      enabled: "1",
      domain: "example.com",
      arbitrary_actual_option: "should-be-written",
    });
    expect(command).toContain(
      "cp '/etc/config/ddns' '/etc/config/ddns.openwrt-status.bak'",
    );
    expect(command).toContain("uci set 'ddns.cloudflare.enabled=1'");
    expect(command).toContain("uci set 'ddns.cloudflare.domain=example.com'");
    expect(command).toContain(
      "ddns.cloudflare.arbitrary_actual_option=should-be-written",
    );
    expect(command).toContain("/etc/init.d/ddns restart");
    expect(() =>
      buildPluginSettingsApplyCommand("ddns", "cloudflare; reboot", {
        enabled: "1",
      }),
    ).toThrow("配置段名称格式无效");
    expect(() =>
      buildPluginSettingsApplyCommand("ddns", "cloudflare", {
        domain: "bad\nreboot",
      }),
    ).toThrow("domain 的值格式无效");
    expect(() =>
      buildPluginSettingsApplyCommand("ddns", "cloudflare", {
        "invalid-key": "value",
      }),
    ).toThrow("配置选项名称格式无效");
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

  it("仅更新已存在的防火墙通信规则和端口转发段", () => {
    const ruleUpdate = buildFirewallRuleUpdateCommand("@rule[0]", {
      name: "Allow DNS",
      sourceZone: "wan",
      destinationZone: "",
      protocol: "udp",
      sourceIp: "",
      destinationIp: "192.168.1.2",
      sourcePort: "",
      destinationPort: "53",
      target: "ACCEPT",
    });
    expect(ruleUpdate).toContain("uci get firewall.@rule[0]");
    expect(ruleUpdate).toContain("firewall.@rule[0].dest_port='53'");
    expect(ruleUpdate).not.toContain("firewall.@rule[0]='rule'");
    const forwardUpdate = buildPortForwardUpdateCommand("@redirect[0]", {
      name: "NAS HTTPS",
      sourceZone: "wan",
      destinationZone: "lan",
      destinationIp: "192.168.1.20",
      sourcePort: "443",
      destinationPort: "8443",
      protocol: "tcp",
    });
    expect(forwardUpdate).toContain("uci get firewall.@redirect[0]");
    expect(forwardUpdate).toContain("firewall.@redirect[0].dest_port='8443'");
    expect(forwardUpdate).not.toContain("enabled='1'");
    expect(() =>
      buildFirewallRuleUpdateCommand("@rule[0]; reboot", {
        name: "Allow DNS",
        sourceZone: "wan",
        destinationZone: "",
        protocol: "udp",
        sourceIp: "",
        destinationIp: "",
        sourcePort: "",
        destinationPort: "53",
        target: "ACCEPT",
      }),
    ).toThrow("端口转发规则格式无效");
  });

  it("解析并受控管理区域转发与通信规则", () => {
    const snapshot = parseFirewallSnapshot(
      "__FIREWALL__\nfirewall.@forwarding[0]=forwarding\nfirewall.@forwarding[0].src='lan'\nfirewall.@forwarding[0].dest='wan'\nfirewall.@forwarding[0].enabled='1'\nfirewall.@rule[0]=rule\nfirewall.@rule[0].name='Allow DNS'\nfirewall.@rule[0].src='wan'\nfirewall.@rule[0].proto='udp'\nfirewall.@rule[0].dest_port='53'\nfirewall.@rule[0].target='ACCEPT'\nfirewall.@rule[0].enabled='1'\n__UPNP__\nUPNP|missing|stopped|0",
    );
    expect(snapshot.forwardings).toEqual([
      {
        section: "@forwarding[0]",
        sourceZone: "lan",
        destinationZone: "wan",
        enabled: true,
      },
    ]);
    expect(snapshot.trafficRules[0]).toMatchObject({
      section: "@rule[0]",
      name: "Allow DNS",
      destinationPort: "53",
      target: "ACCEPT",
    });
    expect(
      buildFirewallForwardingToggleCommand("@forwarding[0]", false),
    ).toContain("firewall.@forwarding[0].enabled='0'");
    expect(buildFirewallRuleToggleCommand("@rule[0]", false)).toContain(
      "firewall.@rule[0].enabled='0'",
    );
    expect(buildFirewallRuleDeleteCommand("@rule[0]")).toContain(
      "uci -q delete firewall.@rule[0]",
    );
    const command = buildFirewallRuleCreateCommand({
      name: "Allow DNS",
      sourceZone: "wan",
      destinationZone: "",
      protocol: "udp",
      sourceIp: "",
      destinationIp: "192.168.1.2",
      sourcePort: "",
      destinationPort: "53",
      target: "ACCEPT",
    });
    expect(command).toContain("target='ACCEPT'");
    expect(command).toContain("dest_ip='192.168.1.2'");
    expect(command).toContain("dest_port='53'");
    expect(() =>
      buildFirewallRuleCreateCommand({
        name: "bad",
        sourceZone: "wan; reboot",
        destinationZone: "",
        protocol: "tcp",
        sourceIp: "",
        destinationIp: "",
        sourcePort: "",
        destinationPort: "80",
        target: "ACCEPT",
      }),
    ).toThrow("来源区域格式无效");
  });
});
