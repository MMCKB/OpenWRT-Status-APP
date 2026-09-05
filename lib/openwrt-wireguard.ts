/**
 * WireGuard 管理的命令构建与解析,与其它 openwrt-* 模块保持同一受控风格:
 * 用户输入先经白名单校验,再拼入单引号引用的 shell 命令。
 */

export interface WireGuardPeerStatus {
  interfaceName: string;
  publicKey: string;
  presharedKeySet: boolean;
  endpoint: string | null;
  allowedIps: string[];
  latestHandshakeSeconds: number | null;
  rxBytes: number | null;
  txBytes: number | null;
  keepaliveSeconds: number | null;
  description: string | null;
  uciSection: string | null;
}

export interface WireGuardInterfaceStatus {
  name: string;
  uciSection: string | null;
  publicKey: string | null;
  listenPort: number | null;
  addresses: string;
  peers: WireGuardPeerStatus[];
}

export interface WireGuardSnapshot {
  available: boolean;
  interfaces: WireGuardInterfaceStatus[];
}

export interface WireGuardPeerDraft {
  description: string;
  publicKey: string;
  allowedIps: string;
  endpointHost?: string;
  endpointPort?: string;
  persistentKeepalive?: string;
  presharedKey?: string;
}

const TAB = "\t";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function requireSection(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(normalized) && !/^@[A-Za-z0-9_-]+\[\d+\]$/.test(normalized)) {
    throw new Error(`${label}格式无效。`);
  }
  return normalized;
}

function requireBase64Key(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(normalized)) {
    throw new Error(`${label}应为 WireGuard 的 44 位 Base64 公钥/私钥。`);
  }
  return normalized;
}

function requireAllowedIps(value: string): string {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!items.length) throw new Error("允许的 IP 段不能为空,例如 10.0.0.2/32。");
  for (const item of items) {
    if (
      !/^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(item) &&
      !/^[0-9A-Fa-f:]+\/\d{1,3}$/.test(item)
    ) {
      throw new Error("允许的 IP 段应为 CIDR 格式,例如 10.0.0.2/32。");
    }
  }
  return items.join(",");
}

function requireEndpointHost(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9.-]+$/.test(normalized)) {
    throw new Error("端点仅支持域名或 IPv4/IPv6 地址。");
  }
  return normalized;
}

function requireEndpointPort(value: string): string {
  const normalized = value.trim();
  if (!/^\d{1,5}$/.test(normalized) || Number(normalized) < 1 || Number(normalized) > 65535) {
    throw new Error("端点端口应为 1–65535。");
  }
  return normalized;
}

function requireKeepalive(value: string): string {
  const normalized = value.trim();
  if (!/^\d{1,5}$/.test(normalized)) {
    throw new Error("持续 Keepalive 应为 0–65535 的秒数。");
  }
  return normalized;
}

export function buildWireGuardSnapshotCommand(): string {
  return [
    "if ! command -v wg >/dev/null 2>&1; then echo '__WG_MISSING__'; exit 0; fi",
    "wg show all dump 2>/dev/null",
    "printf '__WG_UCI__\\n'",
    "uci -q show network 2>/dev/null | grep -E '^network\\.[^=]+=(interface|wireguard_)' 2>/dev/null || true",
    "uci -q show network 2>/dev/null | grep -E '^network\\.[^.]+\\.proto=.wireguard.' 2>/dev/null || true",
  ].join("; ");
}

export function parseWireGuardSnapshot(output: string): WireGuardSnapshot {
  if (output.includes("__WG_MISSING__")) {
    return { available: false, interfaces: [] };
  }
  const uciSource = output.includes("__WG_UCI__")
    ? output.split("__WG_UCI__")[1] ?? ""
    : "";
  const uciValues = parseUciWireguard(uciSource);

  const interfaces = new Map<string, WireGuardInterfaceStatus>();
  const peers: WireGuardPeerStatus[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    if (rawLine.includes("__WG_UCI__") || !rawLine.trim()) continue;
    const fields = rawLine.split(TAB);
    if (fields.length < 5) continue;
    const interfaceName = fields[0];
    if (!/^[A-Za-z0-9_.-]+$/.test(interfaceName)) continue;
    if (fields.length === 5) {
      interfaces.set(interfaceName, {
        name: uciValues.interfaces.get(interfaceName)?.description || interfaceName,
        uciSection: uciValues.interfaces.get(interfaceName)?.section ?? null,
        publicKey: fields[2] === "(none)" ? null : fields[2],
        listenPort: /^\d+$/.test(fields[3]) ? Number(fields[3]) : null,
        addresses: uciValues.interfaces.get(interfaceName)?.addresses ?? "",
        peers: [],
      });
    } else if (fields.length >= 8) {
      peers.push({
        interfaceName,
        publicKey: fields[1],
        presharedKeySet: fields[2] !== "(none)",
        endpoint: fields[3] === "(none)" ? null : fields[3],
        allowedIps: fields[4] === "(none)" ? [] : fields[4].split(",").map((item) => item.trim()),
        latestHandshakeSeconds: /^\d+$/.test(fields[5]) ? Number(fields[5]) : null,
        rxBytes: /^\d+$/.test(fields[6]) ? Number(fields[6]) : null,
        txBytes: /^\d+$/.test(fields[7]) ? Number(fields[7]) : null,
        keepaliveSeconds: /^\d+$/.test(fields[8] ?? "") ? Number(fields[8]) : null,
        description: null,
        uciSection: null,
      });
    }
  }

  // 把 UCI 描述与配置段名合并进运行状态。
  for (const peer of peers) {
    const uciPeer = uciValues.peers.get(peer.publicKey);
    if (uciPeer) {
      peer.description = uciPeer.description;
      peer.uciSection = uciPeer.section;
    }
    interfaces.get(peer.interfaceName)?.peers.push(peer);
  }

  const result = [...interfaces.values()];
  for (const [section, info] of uciValues.interfaces.entries()) {
    // UCI 已配置但尚未运行的接口(如未启动)也要展示。
    if (!result.some((item) => item.name === info.description || item.uciSection === section)) {
      result.push({
        name: info.description || section,
        uciSection: section,
        publicKey: null,
        listenPort: null,
        addresses: info.addresses,
        peers: [],
      });
    }
  }
  return { available: true, interfaces: result };
}

interface UciInterfaceInfo {
  section: string;
  description: string;
  addresses: string;
}

interface UciPeerInfo {
  section: string;
  description: string;
}

function parseUciWireguard(source: string): {
  interfaces: Map<string, UciInterfaceInfo>;
  peers: Map<string, UciPeerInfo>;
} {
  const interfaces = new Map<string, UciInterfaceInfo>();
  const peers = new Map<string, UciPeerInfo>();
  const sectionTypes = new Map<string, string>();
  const options = new Map<string, Map<string, string>>();

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^network\.([A-Za-z0-9_@[\]]+?)(?:\.([A-Za-z0-9_]+))?=(.*)$/);
    if (!match) continue;
    const section = match[1];
    const property = match[2];
    const value = (match[3] ?? "").replace(/^'|'$/g, "");
    if (!property) {
      sectionTypes.set(section, value);
      options.set(section, new Map());
    } else {
      if (!options.has(section)) options.set(section, new Map());
      options.get(section)!.set(property, value);
    }
  }

  for (const [section, type] of sectionTypes.entries()) {
    const values = options.get(section) ?? new Map<string, string>();
    if (type === "interface" && values.get("proto") === "wireguard") {
      const wireguardName = section;
      interfaces.set(wireguardName, {
        section,
        description: values.get("description") ?? section,
        addresses: values.get("addresses") ?? "",
      });
    }
    const peerMatch = type.match(/^wireguard_([A-Za-z0-9_]+)$/);
    if (peerMatch) {
      const publicKey = values.get("public_key") ?? "";
      if (publicKey) {
        peers.set(publicKey, {
          section,
          description: values.get("description") ?? "",
        });
      }
    }
  }
  return { interfaces, peers };
}

export function buildWireGuardToggleCommand(section: string, enabled: boolean): string {
  const safeSection = requireSection(section, "WireGuard 接口");
  if (enabled) {
    return `uci -q set network.${safeSection}.auto='1'; uci commit network; ifup ${safeSection} >/dev/null 2>&1 || true; echo 'WireGuard 接口已启动。'`;
  }
  return `uci -q set network.${safeSection}.auto='0'; uci commit network; ifdown ${safeSection} >/dev/null 2>&1 || true; echo 'WireGuard 接口已停止。'`;
}

export function buildWireGuardPeerAddCommand(
  interfaceSection: string,
  draft: WireGuardPeerDraft,
): string {
  const safeIface = requireSection(interfaceSection, "WireGuard 接口");
  const publicKey = requireBase64Key(draft.publicKey, "客户端公钥");
  const allowedIps = requireAllowedIps(draft.allowedIps);
  const description = draft.description.trim();
  if (description && (description.length > 48 || /[\r\n]/.test(description))) {
    throw new Error("备注应为 1–48 个字符,且不能包含换行。");
  }
  const endpointHost = draft.endpointHost?.trim()
    ? requireEndpointHost(draft.endpointHost)
    : "";
  const endpointPort = draft.endpointPort?.trim()
    ? requireEndpointPort(draft.endpointPort)
    : "";
  const keepalive = draft.persistentKeepalive?.trim()
    ? requireKeepalive(draft.persistentKeepalive)
    : "";
  const presharedKey = draft.presharedKey?.trim()
    ? requireBase64Key(draft.presharedKey, "预共享密钥")
    : "";

  const writes = [
    description ? `uci set network.$section.description=${shellQuote(description)}` : "",
    `uci set network.$section.public_key=${shellQuote(publicKey)}`,
    `uci set network.$section.allowed_ips=${shellQuote(allowedIps)}`,
    endpointHost ? `uci set network.$section.endpoint_host=${shellQuote(endpointHost)}` : "",
    endpointPort ? `uci set network.$section.endpoint_port=${shellQuote(endpointPort)}` : "",
    keepalive ? `uci set network.$section.persistent_keepalive='${keepalive}'` : "",
    presharedKey ? `uci set network.$section.preshared_key=${shellQuote(presharedKey)}` : "",
  ].filter(Boolean);

  return [
    `uci -q get network.${safeIface} >/dev/null || { echo 'WireGuard 接口配置不存在。'; exit 2; }`,
    `section=$(uci add network wireguard_${safeIface})`,
    writes.join("; "),
    "uci commit network",
    `ifup ${safeIface} >/dev/null 2>&1 || true`,
    "echo 'WireGuard Peer 已添加。'",
  ].join("; ");
}

export function buildWireGuardPeerDeleteCommand(
  interfaceSection: string,
  peerSection: string,
): string {
  const safeIface = requireSection(interfaceSection, "WireGuard 接口");
  const safePeer = requireSection(peerSection, "Peer 配置段");
  return [
    `uci -q delete network.${safePeer}`,
    "uci commit network",
    `ifup ${safeIface} >/dev/null 2>&1 || true`,
    "echo 'WireGuard Peer 已删除。'",
  ].join("; ");
}

export function buildWireGuardKeypairCommand(): string {
  return "command -v wg >/dev/null 2>&1 || { echo '路由器未安装 wg 工具。'; exit 2; }; umask 077; priv=$(wg genkey); pub=$(printf '%s' \"$priv\" | wg pubkey); printf 'WGKEY|%s|%s\\n' \"$pub\" \"$priv\"";
}

export function parseWireGuardKeypair(output: string): { publicKey: string; privateKey: string } | null {
  const match = output.match(/^WGKEY\|([A-Za-z0-9+/=]{44})\|([A-Za-z0-9+/=]{44})$/m);
  return match ? { publicKey: match[1], privateKey: match[2] } : null;
}

export interface WireGuardClientConfig {
  /** 客户端私钥(通常在路由器上用 wg genkey 生成)。 */
  clientPrivateKey: string;
  /** 客户端在隧道内的地址,例如 10.0.0.2/32。 */
  clientAddress: string;
  /** 服务端公钥。 */
  serverPublicKey: string;
  /** 服务端端点,例如 vpn.example.com:51820。 */
  endpoint: string;
  /** 客户端允许的 IP 段,例如 0.0.0.0/0,::/0。 */
  allowedIps?: string;
  dns?: string;
  persistentKeepalive?: number;
}

/** 生成可直接导入官方客户端的 [Interface]/[Peer] 配置文本。 */
export function buildWireGuardClientConfig(config: WireGuardClientConfig): string {
  const privateKey = requireBase64Key(config.clientPrivateKey, "客户端私钥");
  const serverPublicKey = requireBase64Key(config.serverPublicKey, "服务端公钥");
  const address = requireAllowedIps(config.clientAddress);
  const endpoint = config.endpoint.trim();
  if (!/^[A-Za-z0-9.-]+:\d{1,5}$/.test(endpoint) && !/^\[[0-9A-Fa-f:]+\]:\d{1,5}$/.test(endpoint)) {
    throw new Error("端点格式应为 host:port,例如 vpn.example.com:51820。");
  }
  const allowedIps = config.allowedIps?.trim() || "0.0.0.0/0, ::/0";
  const dns = config.dns?.trim();
  const keepalive = config.persistentKeepalive ?? 25;

  return [
    "[Interface]",
    `PrivateKey = ${privateKey}`,
    `Address = ${address}`,
    dns ? `DNS = ${dns}` : "",
    "",
    "[Peer]",
    `PublicKey = ${serverPublicKey}`,
    `AllowedIPs = ${allowedIps}`,
    `Endpoint = ${endpoint}`,
    `PersistentKeepalive = ${keepalive}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function formatHandshakeAge(seconds: number | null): string {
  if (seconds === null) return "未报告";
  if (seconds <= 0) return "从未握手";
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}
