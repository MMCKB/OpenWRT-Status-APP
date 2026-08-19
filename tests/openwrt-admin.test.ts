import { describe, expect, it } from "vitest";

import {
  BACKUP_REMOTE_PATH,
  buildBlockClientCommand,
  buildBackupCommand,
  buildDhcpStaticLeaseDeleteCommand,
  buildDhcpStaticLeaseSaveCommand,
  buildDockerContainerCommand,
  buildDockerContainerLogsCommand,
  buildPerformanceBenchmarkCommand,
  buildRestoreCommand,
  buildServiceCommand,
  buildWanDiagnosticCommand,
  buildWakeOnLanCommand,
  buildWirelessChannelApplyCommand,
  buildWifiDeleteCommand,
  buildUnblockClientCommand,
  parseDhcpLeaseSnapshot,
  parseDockerSnapshot,
  parseFirmwareDeviceInfo,
  parsePerformanceBenchmark,
  parseBlockedClientMacs,
  parseConnectedClients,
  parseServiceStates,
  parseWirelessOptimizationSnapshot,
  parseWeakSignalClients,
  parseWifiConfigs,
  recommendWirelessChannel,
} from "../lib/openwrt-admin";

describe("OpenWrt 管理命令与解析", () => {
  it("合并 DHCP 租约与邻居表为客户端列表", () => {
    const clients = parseConnectedClients(
      "__LEASES__\n12345 aa:bb:cc:dd:ee:ff 192.168.1.10 phone *\n__NEIGH__\n192.168.1.10 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE",
    );
    expect(clients).toEqual([
      {
        mac: "AA:BB:CC:DD:EE:FF",
        hostname: "phone",
        ipv4: "192.168.1.10",
        expiresAt: "12345",
        online: true,
      },
    ]);
  });

  it("解析 DHCP 动态租约与 UCI 静态租约，并只生成受控写入命令", () => {
    const snapshot = parseDhcpLeaseSnapshot(
      "__DHCP_LEASES__\n12345 aa:bb:cc:dd:ee:ff 192.168.1.10 phone *\n__DHCP_STATIC__\ndhcp.openwrt_app_lease='host'\ndhcp.openwrt_app_lease.name='phone'\ndhcp.openwrt_app_lease.mac='AA:BB:CC:DD:EE:FF'\ndhcp.openwrt_app_lease.ip='192.168.1.20'\ndhcp.openwrt_app_lease.leasetime='12h'",
    );
    expect(snapshot.dynamic[0]).toMatchObject({
      mac: "AA:BB:CC:DD:EE:FF",
      ipv4: "192.168.1.10",
      hostname: "phone",
    });
    expect(snapshot.static[0]).toMatchObject({
      section: "openwrt_app_lease",
      mac: "AA:BB:CC:DD:EE:FF",
      ipv4: "192.168.1.20",
      leasetime: "12h",
    });
    expect(
      buildDhcpStaticLeaseSaveCommand({
        hostname: "NAS",
        mac: "aa:bb:cc:dd:ee:ff",
        ipv4: "192.168.1.20",
        leasetime: "12h",
      }),
    ).toContain("uci commit dhcp; /etc/init.d/dnsmasq reload");
    expect(
      buildDhcpStaticLeaseSaveCommand({
        section: "@host[0]",
        hostname: "NAS",
        mac: "aa:bb:cc:dd:ee:ff",
        ipv4: "192.168.1.20",
      }),
    ).not.toContain("uci -q delete dhcp.@host[0];");
    expect(buildDhcpStaticLeaseDeleteCommand("openwrt_app_lease")).toContain(
      "uci -q delete dhcp.openwrt_app_lease",
    );
    expect(() =>
      buildDhcpStaticLeaseSaveCommand({
        hostname: "NAS",
        mac: "bad",
        ipv4: "192.168.1.20",
      }),
    ).toThrow("MAC 地址格式无效");
    expect(() => buildDhcpStaticLeaseDeleteCommand("lease; reboot")).toThrow(
      "静态租约段格式无效",
    );
  });

  it("从扫描结果生成保守信道建议，并拒绝不安全的无线写入参数", () => {
    const snapshot = parseWirelessOptimizationSnapshot(
      'RADIO|radio0|1\nSCAN|wlan0|[{"ssid":"busy","bssid":"aa:bb:cc:dd:ee:ff","channel":1,"signal":-32},{"ssid":"quiet","bssid":"11:22:33:44:55:66","channel":11,"signal":-85}]',
    );
    const recommendation = recommendWirelessChannel(
      snapshot.radios[0],
      snapshot.networks,
    );
    expect(recommendation.suggestedChannel).toBe(6);
    expect(buildWirelessChannelApplyCommand("radio0", 6)).toBe(
      "uci set wireless.radio0.channel='6'; uci commit wireless; wifi reload",
    );
    expect(() => buildWirelessChannelApplyCommand("radio0; reboot", 6)).toThrow(
      "无线设备格式无效",
    );
  });

  it("合并无线 station 信号与 DHCP 客户端，并按弱信号优先排序", () => {
    const clients = parseWeakSignalClients(
      "__WIFI_IFACE__|wlan0\nStation aa:bb:cc:dd:ee:ff (on wlan0)\n\tsignal: -79 dBm\nStation 11:22:33:44:55:66 (on wlan0)\n\tsignal: -52 dBm\n__LEASES__\n12345 aa:bb:cc:dd:ee:ff 192.168.1.20 weak-phone *\n12345 11:22:33:44:55:66 192.168.1.30 tv *\n__NEIGH__\n192.168.1.20 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE\n192.168.1.30 dev br-lan lladdr 11:22:33:44:55:66 REACHABLE",
    );
    expect(clients[0]).toMatchObject({
      mac: "AA:BB:CC:DD:EE:FF",
      hostname: "weak-phone",
      quality: "weak",
      qualityLabel: "弱信号",
    });
    expect(clients[1]).toMatchObject({
      mac: "11:22:33:44:55:66",
      quality: "good",
    });
  });

  it("解析 Docker 容器状态资源并阻止不安全的容器命令", () => {
    const snapshot = parseDockerSnapshot(
      "__DOCKER_AVAILABLE__\nCONTAINER|a1b2c3|adguard|adguard/home:latest|Up 2 hours|0.0.0.0:3000->3000/tcp\nCONTAINER|d4e5f6|old|alpine|Exited (0) 1 hour ago|\n__DOCKER_STATS__\nSTAT|a1b2c3|0.54%|32MiB / 128MiB",
    );
    expect(snapshot).toMatchObject({ available: true });
    expect(snapshot.containers[0]).toMatchObject({
      id: "a1b2c3",
      running: true,
      cpuPercent: "0.54%",
      memoryUsage: "32MiB / 128MiB",
    });
    expect(buildDockerContainerCommand("a1b2c3", "restart")).toBe(
      "docker restart a1b2c3",
    );
    expect(buildDockerContainerLogsCommand("a1b2c3")).toContain(
      "docker logs --tail 200 a1b2c3",
    );
    expect(() => buildDockerContainerCommand("a1; reboot", "start")).toThrow(
      "Docker 容器格式无效",
    );
  });

  it("解析性能基准数据和路由器本机固件信息", () => {
    const benchmark = parsePerformanceBenchmark(
      "TARGET|1.1.1.1\n__BENCHMARK_PING__\n8 packets transmitted, 7 packets received, 12.5% packet loss\nrtt min/avg/max/mdev = 10.000/20.500/31.000/2.000 ms\n__BENCHMARK_DNS__\nName: openwrt.org\nAddress: 1.2.3.4\n__BENCHMARK_SYSTEM__\nLOAD|0.25\nMEM|128000|64000",
    );
    expect(benchmark).toMatchObject({
      target: "1.1.1.1",
      packetsSent: 8,
      packetsReceived: 7,
      packetLossPercent: 12.5,
      latencyAvgMs: 20.5,
      dnsReachable: true,
      loadAverage: 0.25,
      memoryAvailableKb: 64000,
    });
    expect(buildPerformanceBenchmarkCommand("1.1.1.1")).toContain(
      "ping -c 8 -W 2 1.1.1.1",
    );
    expect(buildPerformanceBenchmarkCommand("openwrt.org")).toContain(
      "ping -c 8 -W 2 openwrt.org",
    );
    expect(() => buildPerformanceBenchmarkCommand("1.1.1.1; reboot")).toThrow(
      "测速目标格式无效",
    );
    expect(
      parseFirmwareDeviceInfo(
        '{"model":"Example Router","board_name":"example,router","release":{"distribution":"OpenWrt","version":"25.12.0","revision":"r123","target":"ath79/generic"}}',
      ),
    ).toMatchObject({
      model: "Example Router",
      version: "25.12.0",
      target: "ath79/generic",
    });
  });

  it("仅为有效 MAC 生成防火墙拉黑命令", () => {
    expect(buildBlockClientCommand("AA:bb:CC:dd:EE:ff")).toContain(
      "openwrt_app_block_aa_bb_cc_dd_ee_ff",
    );
    expect(buildBlockClientCommand("AA:bb:CC:dd:EE:ff")).toContain(
      "uci commit firewall",
    );
    expect(buildUnblockClientCommand("AA:bb:CC:dd:EE:ff")).toContain(
      "uci -q delete firewall.openwrt_app_block_aa_bb_cc_dd_ee_ff",
    );
    expect(
      parseBlockedClientMacs("before\n__BLOCKED__\nAA:bb:CC:dd:EE:ff\n"),
    ).toEqual(new Set(["AA:BB:CC:DD:EE:FF"]));
    expect(() => buildBlockClientCommand("not-a-mac")).toThrow(
      "MAC 地址格式无效",
    );
  });

  it("仅为有效 MAC 生成网络唤醒命令，并在缺少工具时给出明确提示", () => {
    const command = buildWakeOnLanCommand("AA:bb:CC:dd:EE:ff");
    expect(command).toContain("ubus call network.interface.lan status");
    expect(command).toContain('etherwake -i "$WOL_IFACE" -b AA:BB:CC:DD:EE:FF');
    expect(command).toContain("wakeonlan AA:BB:CC:DD:EE:FF");
    expect(command).toContain("__WOL_UNAVAILABLE__ 未检测到网络唤醒工具");
    expect(() => buildWakeOnLanCommand("AA:BB; reboot")).toThrow(
      "MAC 地址格式无效",
    );
  });

  it("删除指定无线段并在访客网络时清理关联配置", () => {
    expect(buildWifiDeleteCommand("home")).toBe(
      "uci -q delete wireless.home; uci commit wireless; wifi reload",
    );
    expect(buildWifiDeleteCommand("openwrt_app_guest")).toContain(
      "uci -q delete firewall.openwrt_app_guest_to_wan",
    );
    expect(() => buildWifiDeleteCommand("home; reboot")).toThrow(
      "无线配置段格式无效",
    );
  });

  it("解析无线 UCI 配置和服务快照", () => {
    expect(
      parseWifiConfigs(
        "wireless.home.device='radio0'\nwireless.home.ssid='Home WiFi'\nwireless.home.disabled='0'",
      ),
    ).toEqual([
      {
        section: "home",
        device: "radio0",
        ssid: "Home WiFi",
        disabled: false,
        encryption: "none",
        key: "",
        hidden: false,
        isolate: false,
        network: "",
      },
    ]);
    expect(
      parseServiceStates("OPENWRT|dnsmasq|running\nDOCKER|adguard|Up 2 hours"),
    ).toEqual([
      {
        name: "dnsmasq",
        running: true,
        managedBy: "openwrt",
        detail: "running",
      },
      {
        name: "adguard",
        running: true,
        managedBy: "docker",
        detail: "Up 2 hours",
      },
    ]);
  });

  it("拒绝不安全的诊断目标", () => {
    expect(buildWanDiagnosticCommand("wan2", "ping", "1.1.1.1")).toContain(
      "ping -I wan2",
    );
    expect(() =>
      buildWanDiagnosticCommand("wan; reboot", "ping", "1.1.1.1"),
    ).toThrow("WAN 接口格式无效");
  });

  it("仅允许受控服务命令和固定备份路径", () => {
    expect(buildServiceCommand("dnsmasq", "restart", "openwrt")).toBe(
      "/etc/init.d/dnsmasq restart",
    );
    expect(buildServiceCommand("adguard", "stop", "docker")).toBe(
      "docker stop adguard",
    );
    expect(() =>
      buildServiceCommand("evil; reboot", "start", "docker"),
    ).toThrow("服务名称格式无效");
    expect(() => buildServiceCommand("cron", "start", "openwrt")).toThrow(
      "不支持控制此系统服务",
    );
    expect(buildBackupCommand()).toContain(BACKUP_REMOTE_PATH);
    expect(buildRestoreCommand()).toBe(`sysupgrade -r ${BACKUP_REMOTE_PATH}`);
  });
});
