import { describe, expect, it } from "vitest";

import {
  BACKUP_REMOTE_PATH,
  buildBlockClientCommand,
  buildBackupCommand,
  buildDhcpStaticLeaseDeleteCommand,
  buildDhcpStaticLeaseSaveCommand,
  buildDiskSpeedCommand,
  buildDnsLatencyCommand,
  buildDockerContainerCommand,
  buildDockerContainerLogsCommand,
  buildFirmwareUpgradeCommand,
  buildFirmwareVerifyCommand,
  buildPerformanceBenchmarkCommand,
  buildRestoreCommand,
  buildServiceCommand,
  buildWanDiagnosticCommand,
  buildWakeOnLanCommand,
  buildWolCandidatesSnapshotCommand,
  buildWolDevicesSnapshotCommand,
  buildWolTargetSaveCommand,
  buildWirelessChannelApplyCommand,
  buildWifiDeleteCommand,
  buildWifiSettingsSaveCommand,
  buildWifiSnapshotCommand,
  buildUnblockClientCommand,
  parseDhcpLeaseSnapshot,
  parseDiskSpeedResult,
  parseDockerSnapshot,
  parseFirmwareDeviceInfo,
  parsePerformanceBenchmark,
  parseBlockedClientMacs,
  parseConnectedClients,
  parseRouterHardwareDetails,
  parseWolCandidates,
  parseWolDevices,
  parseServiceStates,
  parseWirelessOptimizationSnapshot,
  parseWeakSignalClients,
  parseWifiConfigs,
  parseWifiNetworkBindings,
  recommendWirelessChannel,
  WIFI_ENCRYPTION_OPTIONS,
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
      "__BENCHMARK_SYSTEM__\nCPU|Qualcomm IPQ8074|4\nLOAD|0.25\nMEM|128000|64000\nSTORAGE|256000|64000|192000",
    );
    expect(benchmark).toMatchObject({
      cpuModel: "Qualcomm IPQ8074",
      cpuCores: 4,
      loadAverage: 0.25,
      memoryAvailableKb: 64000,
      storageUsedKb: 64000,
    });
    expect(buildPerformanceBenchmarkCommand()).toContain("/proc/cpuinfo");
    expect(buildPerformanceBenchmarkCommand()).toContain("df -k /overlay");
    expect(buildPerformanceBenchmarkCommand()).not.toContain("ping -c");
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

  it("先在路由器端校验 BIN、IMG 固件，再按用户选择保留或清除配置升级", () => {
    const verification = buildFirmwareVerifyCommand("/tmp/manus-router-update.bin");
    expect(verification).toContain("sysupgrade -T '/tmp/manus-router-update.bin'");
    expect(verification).toContain("__FIRMWARE_VALID__");
    expect(buildFirmwareUpgradeCommand("/tmp/manus-router-update.bin", true)).toBe(
      "sysupgrade '/tmp/manus-router-update.bin'",
    );
    expect(buildFirmwareUpgradeCommand("/tmp/manus-router-update.img", false)).toBe(
      "sysupgrade -n '/tmp/manus-router-update.img'",
    );
    expect(() => buildFirmwareVerifyCommand("/tmp/manus-update; reboot.bin")).toThrow(
      "固件临时路径无效",
    );
  });

  it("从已知客户端生成网络唤醒候选项，并安全保存为 LuCI 目标", () => {
    expect(buildWolCandidatesSnapshotCommand()).toContain("ip neigh show");
    expect(
      parseWolCandidates(
        "__LEASES__\n12345 aa:bb:cc:dd:ee:ff 192.168.1.20 NAS *\n__NEIGH__\n192.168.1.20 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE",
      ),
    ).toContainEqual({
      mac: "AA:BB:CC:DD:EE:FF",
      hostname: "NAS",
      ipv4: "192.168.1.20",
    });
    expect(
      buildWolTargetSaveCommand({
        mac: "aa:bb:cc:dd:ee:ff",
        hostname: "NAS",
        ipv4: "192.168.1.20",
      }),
    ).toContain("uci commit wol");
  });

  it("区分无线芯片与通用热区温度，兼容毫摄氏度输出", () => {
    expect(
      parseRouterHardwareDetails(
        "__DETAIL_CPU__\nCPU|Example CPU|2\n__DETAIL_KERNEL__\n6.6.0\n__DETAIL_WIFI_TEMPERATURES__\nWIFI_TEMP|52000\n__DETAIL_SENSOR_TEMPERATURES__\nSENSOR_TEMP|43000\nSENSOR_TEMP|47",
      ),
    ).toMatchObject({
      wifiTemperaturesC: [52],
      sensorTemperaturesC: [43, 47],
    });
  });

  it("生成受控目录的硬盘读写测速命令，并解析测速结果", () => {
    const command = buildDiskSpeedCommand("/mnt/data", 128);
    expect(command).toContain('test_file="$dir/.openwrt-status-speed-test-$$.bin"');
    expect(command).toContain("dd if=/dev/zero");
    expect(command).toContain("rm -f \"$test_file\"");
    expect(
      parseDiskSpeedResult("DISK_SPEED_RESULT|/mnt/data|128|1600|800"),
    ).toEqual({
      directory: "/mnt/data",
      fileSizeMB: 128,
      writeDurationMs: 1600,
      readDurationMs: 800,
      writeSpeedMBps: 80,
      readSpeedMBps: 160,
    });
    expect(() => buildDiskSpeedCommand("/mnt/data/../tmp", 128)).toThrow(
      "测速目录必须为不包含上级路径的绝对路径。",
    );
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

  it("仅列出 LuCI 已保存的网络唤醒目标，并只以 DHCP 信息补齐名称和 IPv4", () => {
    const targets = parseWolDevices(
      "__WOL_CONFIG__\nwol.nas='host'\nwol.nas.name='家庭 NAS'\nwol.nas.mac='aa:bb:cc:dd:ee:ff'\nwol.desktop='host'\nwol.desktop.mac='11:22:33:44:55:66'\n__WOL_DHCP__\n12345 aa:bb:cc:dd:ee:ff 192.168.1.20 ignored-name *\n12345 77:88:99:aa:bb:cc 192.168.1.30 online-only *\n__WOL_STATIC__\ndhcp.desktop='host'\ndhcp.desktop.name='书房电脑'\ndhcp.desktop.mac='11:22:33:44:55:66'\ndhcp.desktop.ip='192.168.1.40'",
    );
    expect(targets).toEqual([
      {
        mac: "11:22:33:44:55:66",
        hostname: "书房电脑",
        ipv4: "192.168.1.40",
      },
      {
        mac: "AA:BB:CC:DD:EE:FF",
        hostname: "家庭 NAS",
        ipv4: "192.168.1.20",
      },
    ]);
    expect(buildWolDevicesSnapshotCommand()).toContain("uci -q show wol");
    expect(buildWolDevicesSnapshotCommand()).not.toContain("ip neigh");
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
      parseWifiNetworkBindings(
        "__WIFI_NETWORK__|lan\n__WIFI_NETWORK__|docker\n__WIFI_NETWORK__|lan",
      ),
    ).toEqual(["docker", "lan"]);
    expect(buildWifiSnapshotCommand()).toContain("__WIFI_NETWORK__");
    expect(WIFI_ENCRYPTION_OPTIONS).toContainEqual({
      value: "psk2",
      label: "WPA2-PSK",
    });
    expect(
      buildWifiSettingsSaveCommand({
        section: "home",
        ssid: "Home WiFi",
        encryption: "sae-mixed",
        key: "correct-horse-battery-staple",
        hidden: false,
        isolate: false,
        network: "lan docker",
      }),
    ).toContain("uci set wireless.home.network='lan docker'");
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

  it("支持经指定 WAN 发起 IPv4/IPv6 DNS 延迟测试", () => {
    expect(
      buildDnsLatencyCommand("wan", "1.1.1.1", "ipv4", "openwrt.org"),
    ).toContain("nslookup -4 openwrt.org 1.1.1.1");
    expect(
      buildDnsLatencyCommand("wan6", "2606:4700:4700::1111", "ipv6"),
    ).toContain("nslookup -6 openwrt.org 2606:4700:4700::1111");
    expect(() => buildDnsLatencyCommand("wan", "dns; reboot", "ipv4")).toThrow(
      "DNS 服务器仅支持 IPv4 或 IPv6 地址",
    );
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
