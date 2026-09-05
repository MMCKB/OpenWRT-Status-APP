import { describe, expect, it } from "vitest";

import {
  buildWireGuardClientConfig,
  buildWireGuardKeypairCommand,
  buildWireGuardPeerAddCommand,
  buildWireGuardPeerDeleteCommand,
  buildWireGuardSnapshotCommand,
  buildWireGuardToggleCommand,
  formatHandshakeAge,
  parseWireGuardKeypair,
  parseWireGuardSnapshot,
} from "../lib/openwrt-wireguard";

const VALID_KEY = "8Kx3vWqLbVhJdGZyTcPQ1nMoRfA2sEwK5uHjXlCeB0I=";

describe("WireGuard 命令与解析", () => {
  it("构建带标记的快照命令", () => {
    const command = buildWireGuardSnapshotCommand();
    expect(command).toContain("command -v wg");
    expect(command).toContain("wg show all dump");
    expect(command).toContain("__WG_UCI__");
  });

  it("解析 wg show dump 与 UCI 配置并合并描述", () => {
    const snapshot = parseWireGuardSnapshot(
      [
        "wg0\t" + VALID_KEY + "\tabcdef1234=/hidden-pub=\t51820\toff",
        "wg0\t" + VALID_KEY + "\t(none)\t1.2.3.4:51820\t10.0.0.2/32\t1700000000\t123456\t654321\t25",
        "__WG_UCI__",
        "network.wg0=interface",
        "network.wg0.proto='wireguard'",
        "network.wg0.addresses='10.0.0.1/24'",
        "network.wg0.description='主 WireGuard'",
        "network.@wireguard_wg0[0]=wireguard_wg0",
        "network.@wireguard_wg0[0].description='手机'",
        "network.@wireguard_wg0[0].public_key='" + VALID_KEY + "'",
      ].join("\n"),
    );
    expect(snapshot.available).toBe(true);
    expect(snapshot.interfaces).toHaveLength(1);
    const iface = snapshot.interfaces[0];
    expect(iface.name).toBe("主 WireGuard");
    expect(iface.addresses).toBe("10.0.0.1/24");
    expect(iface.listenPort).toBe(51820);
    expect(iface.peers[0].description).toBe("手机");
    expect(iface.peers[0].rxBytes).toBe(123456);
    expect(iface.peers[0].endpoint).toBe("1.2.3.4:51820");
  });

  it("识别未安装 wg 的路由器与未启动的 UCI 接口", () => {
    expect(parseWireGuardSnapshot("__WG_MISSING__").available).toBe(false);
    const snapshot = parseWireGuardSnapshot(
      "__WG_UCI__\nnetwork.wg1=interface\nnetwork.wg1.proto='wireguard'",
    );
    expect(snapshot.available).toBe(true);
    expect(snapshot.interfaces[0].uciSection).toBe("wg1");
    expect(snapshot.interfaces[0].peers).toHaveLength(0);
  });

  it("生成受控的启停与 Peer 管理命令", () => {
    expect(buildWireGuardToggleCommand("wg0", true)).toContain("ifup wg0");
    expect(buildWireGuardToggleCommand("wg0", false)).toContain("ifdown wg0");
    const add = buildWireGuardPeerAddCommand("wg0", {
      description: "客厅电视",
      publicKey: VALID_KEY,
      allowedIps: "10.0.0.3/32",
      endpointHost: "1.2.3.4",
      endpointPort: "51820",
      persistentKeepalive: "25",
    });
    expect(add).toContain("uci add network wireguard_wg0");
    expect(add).toContain("public_key");
    expect(add).toContain("uci commit network");
    expect(buildWireGuardPeerDeleteCommand("wg0", "@wireguard_wg0[0]")).toContain(
      "uci -q delete network.@wireguard_wg0[0]",
    );
  });

  it("拒绝危险的 Peer 输入", () => {
    expect(() =>
      buildWireGuardPeerAddCommand("wg0", {
        description: "x",
        publicKey: "not-a-key",
        allowedIps: "10.0.0.3/32",
      }),
    ).toThrow("客户端公钥");
    expect(() =>
      buildWireGuardPeerAddCommand("wg0", {
        description: "x",
        publicKey: VALID_KEY,
        allowedIps: "10.0.0.3/32; reboot",
      }),
    ).toThrow("CIDR");
    expect(() =>
      buildWireGuardPeerAddCommand("wg0; reboot", {
        description: "x",
        publicKey: VALID_KEY,
        allowedIps: "10.0.0.3/32",
      }),
    ).toThrow("WireGuard 接口格式无效");
    expect(() =>
      buildWireGuardPeerAddCommand("wg0", {
        description: "x",
        publicKey: VALID_KEY,
        allowedIps: "10.0.0.3/32",
        endpointPort: "99999",
      }),
    ).toThrow("端点端口");
  });

  it("在路由器上生成密钥对并解析", () => {
    const command = buildWireGuardKeypairCommand();
    expect(command).toContain("wg genkey");
    expect(command).toContain("wg pubkey");
    const keypair = parseWireGuardKeypair(
      `WGKEY|${VALID_KEY}|${VALID_KEY}\n`,
    );
    expect(keypair?.publicKey).toBe(VALID_KEY);
    expect(parseWireGuardKeypair("WGKEY|bad|bad")).toBeNull();
  });

  it("生成可直接导入的客户端配置", () => {
    const config = buildWireGuardClientConfig({
      clientPrivateKey: VALID_KEY,
      clientAddress: "10.0.0.3/32",
      serverPublicKey: VALID_KEY,
      endpoint: "vpn.example.com:51820",
      dns: "10.0.0.1",
    });
    expect(config).toContain("[Interface]");
    expect(config).toContain(`PrivateKey = ${VALID_KEY}`);
    expect(config).toContain("Address = 10.0.0.3/32");
    expect(config).toContain("Endpoint = vpn.example.com:51820");
    expect(config).toContain("PersistentKeepalive = 25");
    expect(() =>
      buildWireGuardClientConfig({
        clientPrivateKey: VALID_KEY,
        clientAddress: "10.0.0.3/32",
        serverPublicKey: VALID_KEY,
        endpoint: "vpn.example.com",
      }),
    ).toThrow("host:port");
  });

  it("格式化握手时间", () => {
    expect(formatHandshakeAge(null)).toBe("未报告");
    expect(formatHandshakeAge(0)).toBe("从未握手");
    expect(formatHandshakeAge(45)).toBe("45 秒前");
    expect(formatHandshakeAge(125)).toBe("2 分钟前");
    expect(formatHandshakeAge(7200)).toBe("2 小时前");
    expect(formatHandshakeAge(172800)).toBe("2 天前");
  });
});
