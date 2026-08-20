import type { InterfaceStatus } from "../shared/router-types";

export interface ConnectedClient {
  mac: string;
  hostname: string | null;
  ipv4: string | null;
  expiresAt: string | null;
  online: boolean;
}

/** LuCI 网络唤醒页保存到 /etc/config/wol 的持久化目标。 */
export interface WolDevice {
  mac: string;
  hostname: string | null;
  ipv4: string | null;
}

export interface DhcpLease {
  source: "dynamic" | "static";
  section: string | null;
  mac: string;
  hostname: string | null;
  ipv4: string | null;
  expiresAt: string | null;
  leasetime: string | null;
}

export interface DhcpLeaseSnapshot {
  dynamic: DhcpLease[];
  static: DhcpLease[];
}

export interface DhcpStaticLeaseDraft {
  section?: string;
  hostname: string;
  mac: string;
  ipv4: string;
  leasetime?: string;
}

export interface WifiConfigEntry {
  section: string;
  device: string;
  ssid: string;
  disabled: boolean;
  encryption: string;
  key: string;
  hidden: boolean;
  isolate: boolean;
  network: string;
}

/** 与 LuCI 常用名称一致的受控无线加密方式。 */
export const WIFI_ENCRYPTION_OPTIONS = [
  { value: "psk", label: "WPA-PSK" },
  { value: "psk2", label: "WPA2-PSK" },
  { value: "psk-mixed", label: "WPA/WPA2 混合" },
  { value: "sae", label: "WPA3-SAE" },
  { value: "sae-mixed", label: "WPA2/WPA3 混合" },
  { value: "owe", label: "OWE 增强开放" },
  { value: "none", label: "不加密" },
] as const;

export interface WifiClient {
  mac: string;
  interfaceName: string | null;
  signalDbm: number | null;
}

export interface WirelessRadio {
  name: string;
  currentChannel: number | null;
}

export interface WirelessScanNetwork {
  radio: string;
  ssid: string | null;
  bssid: string | null;
  channel: number;
  signalDbm: number | null;
}

export interface WirelessOptimizationSnapshot {
  radios: WirelessRadio[];
  networks: WirelessScanNetwork[];
}

export interface WirelessChannelRecommendation {
  radio: string;
  currentChannel: number | null;
  suggestedChannel: number | null;
  currentScore: number | null;
  suggestedScore: number | null;
  reason: string;
}

export interface WeakSignalClient extends WifiClient {
  hostname: string | null;
  ipv4: string | null;
  online: boolean;
  quality: "weak" | "fair" | "good" | "unknown";
  qualityLabel: string;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  running: boolean;
  ports: string | null;
  cpuPercent: string | null;
  memoryUsage: string | null;
}

export interface DockerSnapshot {
  available: boolean;
  containers: DockerContainer[];
}

export interface PerformanceBenchmark {
  cpuModel: string | null;
  cpuCores: number | null;
  loadAverage: number | null;
  memoryTotalKb: number | null;
  memoryAvailableKb: number | null;
  storageTotalKb: number | null;
  storageUsedKb: number | null;
  storageAvailableKb: number | null;
}

export interface RouterHardwareDetails {
  cpuModel: string | null;
  cpuCores: number | null;
  kernelVersion: string | null;
  wifiTemperaturesC: number[];
}

export interface FirmwareDeviceInfo {
  model: string | null;
  boardName: string | null;
  distribution: string | null;
  version: string | null;
  revision: string | null;
  target: string | null;
  description: string | null;
}

export interface ServiceState {
  name: string;
  running: boolean;
  managedBy: "openwrt" | "docker";
  detail?: string;
}

export const MANAGED_OPENWRT_SERVICES = [
  "dnsmasq",
  "firewall",
  "network",
  "uhttpd",
  "dropbear",
] as const;

function cleanQuoted(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function requireMac(mac: string) {
  const normalized = mac.trim().toUpperCase();
  if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalized))
    throw new Error("MAC 地址格式无效。");
  return normalized;
}

function requireIpv4(value: string, label = "IPv4 地址") {
  const normalized = value.trim();
  const parts = normalized.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  ) {
    throw new Error(`${label}格式无效。`);
  }
  return normalized;
}

function requireIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.:-]+$/.test(normalized))
    throw new Error(`${label}格式无效。`);
  return normalized;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function requireUciSection(value: string, label: string) {
  const normalized = value.trim();
  if (/^[A-Za-z0-9_-]+$/.test(normalized) || /^@host\[\d+\]$/.test(normalized))
    return normalized;
  throw new Error(`${label}格式无效。`);
}

function safeCounter(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeLeaseHostname(value: string | null | undefined) {
  const normalized = value?.trim();
  return !normalized || normalized === "*" ? null : normalized;
}

export function parseConnectedClients(output: string): ConnectedClient[] {
  const byMac = new Map<string, ConnectedClient>();
  const lines = output.split(/\r?\n/);
  let inLeases = false;

  for (const line of lines) {
    if (line.trim() === "__LEASES__") {
      inLeases = true;
      continue;
    }
    if (line.trim() === "__NEIGH__") {
      inLeases = false;
      continue;
    }
    const match = line.match(/([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/);
    if (!match) continue;
    const mac = match[1].toUpperCase();
    const tokens = line.trim().split(/\s+/);
    const ipv4 =
      tokens.find((value) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) ?? null;
    const previous = byMac.get(mac);
    if (inLeases) {
      const hostname =
        tokens.find(
          (value) =>
            value.toUpperCase() !== mac &&
            value !== ipv4 &&
            !/^\d+$/.test(value) &&
            value !== "*" &&
            !/^(?:lladdr|REACHABLE|STALE|DELAY|PROBE|FAILED)$/i.test(value),
        ) ?? null;
      byMac.set(mac, {
        mac,
        hostname: hostname === "*" ? null : hostname,
        ipv4,
        expiresAt: tokens[0] && /^\d+$/.test(tokens[0]) ? tokens[0] : null,
        online: previous?.online ?? false,
      });
    } else {
      byMac.set(mac, {
        mac,
        hostname: previous?.hostname ?? null,
        ipv4: ipv4 ?? previous?.ipv4 ?? null,
        expiresAt: previous?.expiresAt ?? null,
        online: !/FAILED|INCOMPLETE/i.test(line),
      });
    }
  }
  return [...byMac.values()].sort(
    (a, b) =>
      Number(b.online) - Number(a.online) ||
      (a.hostname ?? a.mac).localeCompare(b.hostname ?? b.mac),
  );
}

function parseDynamicDhcpLeases(output: string): DhcpLease[] {
  const leases = new Map<string, DhcpLease>();
  let inLeases = false;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "__DHCP_LEASES__") {
      inLeases = true;
      continue;
    }
    if (line === "__DHCP_STATIC__") {
      inLeases = false;
      continue;
    }
    if (!inLeases) continue;
    const tokens = line.split(/\s+/);
    const macIndex = tokens.findIndex((value) =>
      /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(value),
    );
    if (macIndex < 0) continue;
    const mac = requireMac(tokens[macIndex]);
    const ipv4 =
      tokens.find((value) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) ?? null;
    const ipv4Index = ipv4 ? tokens.indexOf(ipv4) : -1;
    leases.set(mac, {
      source: "dynamic",
      section: null,
      mac,
      hostname: normalizeLeaseHostname(
        ipv4Index >= 0 ? tokens[ipv4Index + 1] : null,
      ),
      ipv4,
      expiresAt: /^\d+$/.test(tokens[0] ?? "") ? tokens[0] : null,
      leasetime: null,
    });
  }
  return [...leases.values()].sort((a, b) =>
    (a.hostname ?? a.mac).localeCompare(b.hostname ?? b.mac),
  );
}

type UciValues = { type: string; values: Map<string, string[]> };

function parseDhcpUciSections(output: string) {
  const sections = new Map<string, UciValues>();
  let inStatic = false;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "__DHCP_STATIC__") {
      inStatic = true;
      continue;
    }
    if (!inStatic) continue;
    const match = line.match(
      /^dhcp\.((?:@)?[A-Za-z0-9_-]+(?:\[\d+\])?)(?:\.([A-Za-z0-9_]+))?=(.*)$/,
    );
    if (!match) continue;
    const [, section, property, rawValue] = match;
    const current = sections.get(section) ?? {
      type: "",
      values: new Map<string, string[]>(),
    };
    if (!property) current.type = cleanQuoted(rawValue);
    else
      current.values.set(property, [
        ...(current.values.get(property) ?? []),
        cleanQuoted(rawValue),
      ]);
    sections.set(section, current);
  }
  return sections;
}

export function parseDhcpLeaseSnapshot(output: string): DhcpLeaseSnapshot {
  const dynamic = parseDynamicDhcpLeases(output);
  const staticLeases: DhcpLease[] = [];
  for (const [section, values] of parseDhcpUciSections(output)) {
    if (values.type !== "host") continue;
    const mac = values.values.get("mac")?.[0];
    if (!mac || !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac)) continue;
    staticLeases.push({
      source: "static",
      section,
      mac: requireMac(mac),
      hostname: normalizeLeaseHostname(values.values.get("name")?.[0]),
      ipv4: values.values.get("ip")?.[0] ?? null,
      expiresAt: null,
      leasetime: values.values.get("leasetime")?.[0] ?? null,
    });
  }
  return {
    dynamic,
    static: staticLeases.sort((a, b) =>
      (a.hostname ?? a.mac).localeCompare(b.hostname ?? b.mac),
    ),
  };
}

export function buildDhcpLeaseSnapshotCommand() {
  return "printf '__DHCP_LEASES__\\n'; cat /tmp/dhcp.leases 2>/dev/null; printf '__DHCP_STATIC__\\n'; uci show dhcp 2>/dev/null";
}

function safeLeaseHostname(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 63 || /[\r\n]/.test(normalized))
    throw new Error("设备名称应为 1–63 个字符，且不能包含换行。");
  return normalized;
}

function safeLeaseTime(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (!/^\d+(?:[smhdw])?$/i.test(normalized))
    throw new Error("租约期限仅支持数字或数字加 s/m/h/d/w 单位。");
  return normalized;
}

export function buildDhcpStaticLeaseSaveCommand(draft: DhcpStaticLeaseDraft) {
  const mac = requireMac(draft.mac);
  const hostname = safeLeaseHostname(draft.hostname);
  const ipv4 = requireIpv4(draft.ipv4, "固定 IPv4 地址");
  const leasetime = safeLeaseTime(draft.leasetime);
  const section = draft.section
    ? requireUciSection(draft.section, "静态租约段")
    : `openwrt_app_lease_${mac.replace(/:/g, "_").toLowerCase()}`;
  const isExistingAnonymousSection = section.startsWith("@host[");
  const initializeSection = isExistingAnonymousSection
    ? ""
    : `uci -q delete dhcp.${section}; uci set dhcp.${section}='host'; `;
  const leaseTimeCommand = leasetime
    ? `; uci set dhcp.${section}.leasetime=${shellQuote(leasetime)}`
    : `; uci -q delete dhcp.${section}.leasetime`;
  return `${initializeSection}uci set dhcp.${section}.name=${shellQuote(hostname)}; uci set dhcp.${section}.mac=${shellQuote(mac)}; uci set dhcp.${section}.ip=${shellQuote(ipv4)}${leaseTimeCommand}; uci commit dhcp; /etc/init.d/dnsmasq reload`;
}

export function buildDhcpStaticLeaseDeleteCommand(section: string) {
  const safeSection = requireUciSection(section, "静态租约段");
  return `uci -q delete dhcp.${safeSection}; uci commit dhcp; /etc/init.d/dnsmasq reload`;
}

export function buildClientSnapshotCommand() {
  return "printf '__LEASES__\\n'; ubus call dhcp ipv4leases 2>/dev/null | jsonfilter -e '@.device[*]' 2>/dev/null; cat /tmp/dhcp.leases 2>/dev/null; printf '__NEIGH__\\n'; ip neigh show 2>/dev/null; printf '__BLOCKED__\\n'; uci -q show firewall | grep -E '^firewall\\.openwrt_app_block_.*\\.src_mac=' 2>/dev/null";
}

export function buildBlockClientCommand(mac: string) {
  const normalized = requireMac(mac);
  const section = `openwrt_app_block_${normalized.replace(/:/g, "_").toLowerCase()}`;
  return `uci -q delete firewall.${section}; uci set firewall.${section}=rule; uci set firewall.${section}.name=${shellQuote(`OpenWrt App block ${normalized}`)}; uci set firewall.${section}.src='lan'; uci set firewall.${section}.dest='*'; uci add_list firewall.${section}.src_mac=${shellQuote(normalized)}; uci set firewall.${section}.target='REJECT'; uci commit firewall; /etc/init.d/firewall reload`;
}

export function buildUnblockClientCommand(mac: string) {
  const normalized = requireMac(mac);
  const section = `openwrt_app_block_${normalized.replace(/:/g, "_").toLowerCase()}`;
  return `uci -q delete firewall.${section}; uci commit firewall; /etc/init.d/firewall reload`;
}

export function buildWakeOnLanCommand(mac: string) {
  const normalized = requireMac(mac);
  return `WOL_IFACE="$(ubus call network.interface.lan status 2>/dev/null | jsonfilter -e '@.l3_device' 2>/dev/null || true)"; if [ -z "$WOL_IFACE" ]; then WOL_IFACE="$(ip -o link show up 2>/dev/null | awk -F': ' '$2 !~ /^(lo|ifb|imq)/ {sub(/@.*/, "", $2); print $2; exit}')"; fi; case "$WOL_IFACE" in ''|*[!A-Za-z0-9_.:-]*) echo '__WOL_INTERFACE_UNAVAILABLE__ 未找到可用的 LAN 网卡。'; exit 1;; esac; if command -v etherwake >/dev/null 2>&1; then etherwake -i "$WOL_IFACE" -b ${normalized}; elif command -v wol >/dev/null 2>&1; then wol -i "$WOL_IFACE" ${normalized}; elif command -v wakeonlan >/dev/null 2>&1; then wakeonlan ${normalized}; else echo '__WOL_UNAVAILABLE__ 未检测到网络唤醒工具。请在路由器安装 etherwake、wol 或 wakeonlan 后重试。'; exit 127; fi`;
}

/**
 * 以 LuCI 持久化的 wol 配置作为唯一目标来源；DHCP 信息只用于补齐主机名和 IPv4，
 * 不会把未配置到 wol 的在线设备带入唤醒列表。
 */
export function buildWolDevicesSnapshotCommand() {
  return "printf '__WOL_CONFIG__\\n'; uci -q show wol 2>/dev/null; printf '__WOL_DHCP__\\n'; cat /tmp/dhcp.leases 2>/dev/null; printf '__WOL_STATIC__\\n'; uci -q show dhcp 2>/dev/null";
}

export function parseWolDevices(output: string): WolDevice[] {
  const sections = new Map<string, UciValues>();
  let inWolConfig = false;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "__WOL_CONFIG__") {
      inWolConfig = true;
      continue;
    }
    if (line === "__WOL_DHCP__") {
      inWolConfig = false;
      continue;
    }
    if (!inWolConfig) continue;
    const match = line.match(
      /^wol\.((?:@)?[A-Za-z0-9_-]+(?:\[\d+\])?)(?:\.([A-Za-z0-9_]+))?=(.*)$/,
    );
    if (!match) continue;
    const [, section, property, rawValue] = match;
    const current = sections.get(section) ?? {
      type: "",
      values: new Map<string, string[]>(),
    };
    if (!property) current.type = cleanQuoted(rawValue);
    else
      current.values.set(property, [
        ...(current.values.get(property) ?? []),
        cleanQuoted(rawValue),
      ]);
    sections.set(section, current);
  }

  const leases = parseDhcpLeaseSnapshot(
    output
      .replace("__WOL_DHCP__", "__DHCP_LEASES__")
      .replace("__WOL_STATIC__", "__DHCP_STATIC__"),
  );
  const leaseByMac = new Map(
    [...leases.static, ...leases.dynamic].map((lease) => [lease.mac, lease]),
  );
  const targets = new Map<string, WolDevice>();
  for (const [section, values] of sections) {
    const mac = ["mac", "macaddr", "address"]
      .map((key) => values.values.get(key)?.[0])
      .find((value): value is string => Boolean(value));
    if (!mac || !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac)) continue;
    const normalizedMac = requireMac(mac);
    const lease = leaseByMac.get(normalizedMac);
    const configuredName = ["name", "hostname", "host", "description"]
      .map((key) => values.values.get(key)?.[0])
      .find((value): value is string => Boolean(normalizeLeaseHostname(value)));
    const configuredIpv4 = ["ip", "ipaddr"]
      .map((key) => values.values.get(key)?.[0])
      .find((value): value is string =>
        Boolean(value && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)),
      );
    targets.set(normalizedMac, {
      mac: normalizedMac,
      hostname:
        normalizeLeaseHostname(configuredName) ??
        lease?.hostname ??
        (section.startsWith("@") ? null : section),
      ipv4: configuredIpv4 ?? lease?.ipv4 ?? null,
    });
  }
  return [...targets.values()].sort((a, b) =>
    (a.hostname ?? a.mac).localeCompare(b.hostname ?? b.mac),
  );
}

export function parseWifiConfigs(output: string): WifiConfigEntry[] {
  const entries = new Map<string, Partial<WifiConfigEntry>>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(
      /^wireless\.([A-Za-z0-9_]+)\.(device|ssid|disabled|encryption|key|hidden|isolate|network)=(.+)$/,
    );
    if (!match) continue;
    const [, section, key, raw] = match;
    const entry = entries.get(section) ?? { section };
    if (key === "device") entry.device = cleanQuoted(raw);
    if (key === "ssid") entry.ssid = cleanQuoted(raw);
    if (key === "disabled") entry.disabled = cleanQuoted(raw) === "1";
    if (key === "encryption") entry.encryption = cleanQuoted(raw);
    if (key === "key") entry.key = cleanQuoted(raw);
    if (key === "hidden") entry.hidden = cleanQuoted(raw) === "1";
    if (key === "isolate") entry.isolate = cleanQuoted(raw) === "1";
    if (key === "network")
      entry.network = cleanQuoted(raw).replace(/^'|'$/g, "");
    entries.set(section, entry);
  }
  return [...entries.values()]
    .filter((entry): entry is WifiConfigEntry =>
      Boolean(entry.section && entry.device && entry.ssid),
    )
    .map((entry) => ({
      ...entry,
      disabled: entry.disabled ?? false,
      encryption: entry.encryption ?? "none",
      key: entry.key ?? "",
      hidden: entry.hidden ?? false,
      isolate: entry.isolate ?? false,
      network: entry.network ?? "",
    }));
}

/** 从无线快照标记中提取可绑定的命名网络接口。 */
export function parseWifiNetworkBindings(output: string): string[] {
  const bindings = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^__WIFI_NETWORK__\|([A-Za-z0-9_.-]{1,32})$/);
    if (match) bindings.add(match[1]);
  }
  return [...bindings].sort((left, right) => left.localeCompare(right));
}

export function buildWifiToggleCommand(section: string, enabled: boolean) {
  const safeSection = requireIdentifier(section, "无线配置段");
  return `uci set wireless.${safeSection}.disabled='${enabled ? "0" : "1"}'; uci commit wireless; wifi reload`;
}

export function buildWifiSsidCommand(section: string, ssid: string) {
  const safeSection = requireIdentifier(section, "无线配置段");
  const nextSsid = ssid.trim();
  if (!nextSsid || nextSsid.length > 32)
    throw new Error("SSID 必须为 1–32 个字符。");
  return `uci set wireless.${safeSection}.ssid=${shellQuote(nextSsid)}; uci commit wireless; wifi reload`;
}

function safeWifiEncryption(value: string) {
  const normalized = value.trim().toLowerCase();
  const supported = new Set([
    "none",
    "psk",
    "psk2",
    "psk-mixed",
    "sae",
    "sae-mixed",
    "owe",
    "wep-open",
    "wep-shared",
  ]);
  if (!supported.has(normalized))
    throw new Error(
      "加密方式仅支持 none、psk2、sae、sae-mixed、psk-mixed、owe 或 WEP。",
    );
  return normalized;
}

function safeWifiNetwork(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  const items = normalized.split(/\s+/);
  if (
    items.length > 8 ||
    items.some((item) => !/^[A-Za-z0-9_.-]{1,32}$/.test(item))
  )
    throw new Error("绑定网络仅支持以空格分隔的合法接口名称。");
  return items.join(" ");
}

export function buildWifiSettingsSaveCommand(
  draft: Pick<
    WifiConfigEntry,
    "section" | "ssid" | "encryption" | "key" | "hidden" | "isolate" | "network"
  >,
) {
  const section = requireIdentifier(draft.section, "无线配置段");
  const ssid = draft.ssid.trim();
  if (!ssid || ssid.length > 32 || /[\r\n]/.test(ssid))
    throw new Error("SSID 必须为 1–32 个字符，且不能包含换行。");
  const encryption = safeWifiEncryption(draft.encryption);
  const key = draft.key.trim();
  if (
    encryption !== "none" &&
    encryption !== "owe" &&
    (key.length < 8 || key.length > 63) &&
    !/^[0-9A-Fa-f]{64}$/.test(key)
  )
    throw new Error("WPA 密码应为 8–63 位，或 64 位十六进制密钥。");
  if (/[\r\n]/.test(key)) throw new Error("无线密码不能包含换行。");
  const network = safeWifiNetwork(draft.network);
  const keyCommand =
    encryption === "none" || encryption === "owe"
      ? `uci -q delete wireless.${section}.key`
      : `uci set wireless.${section}.key=${shellQuote(key)}`;
  const networkCommand = network
    ? `uci set wireless.${section}.network=${shellQuote(network)}`
    : `uci -q delete wireless.${section}.network`;
  return `cp /etc/config/wireless /etc/config/wireless.app-backup.$(date +%s) 2>/dev/null || true; uci set wireless.${section}.ssid=${shellQuote(ssid)}; uci set wireless.${section}.encryption=${shellQuote(encryption)}; ${keyCommand}; uci set wireless.${section}.hidden='${draft.hidden ? "1" : "0"}'; uci set wireless.${section}.isolate='${draft.isolate ? "1" : "0"}'; ${networkCommand}; uci commit wireless; wifi reload`;
}

export function buildWifiDeleteCommand(section: string) {
  const safeSection = requireIdentifier(section, "无线配置段");
  const guestCleanup =
    safeSection === "openwrt_app_guest"
      ? "; uci -q delete network.guest; uci -q delete dhcp.guest; uci -q delete firewall.guest; uci -q delete firewall.openwrt_app_guest_to_wan; uci commit network; uci commit dhcp; uci commit firewall; /etc/init.d/network reload; /etc/init.d/dnsmasq restart; /etc/init.d/firewall reload"
      : "";
  return `uci -q delete wireless.${safeSection}; uci commit wireless${guestCleanup}; wifi reload`;
}

export function parseBlockedClientMacs(output: string) {
  const markerIndex = output.indexOf("__BLOCKED__");
  if (markerIndex < 0) return new Set<string>();
  const matches =
    output
      .slice(markerIndex)
      .match(/([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/g) ?? [];
  return new Set(matches.map((mac) => mac.toUpperCase()));
}

export function buildWifiSnapshotCommand() {
  return `uci -q show network 2>/dev/null | sed -n 's/^network\\.\\([A-Za-z0-9_][A-Za-z0-9_.-]*\\)=interface$/__WIFI_NETWORK__|\\1/p'; uci show wireless 2>/dev/null`;
}

export function buildWifiClientSnapshotCommand() {
  return 'iw dev 2>/dev/null | awk \'$1=="Interface"{print $2}\' | while read -r iface; do echo "__WIFI_IFACE__|$iface"; iw dev "$iface" station dump 2>/dev/null; done';
}

export function parseWifiClients(output: string): WifiClient[] {
  const clients: WifiClient[] = [];
  let interfaceName: string | null = null;
  let pending: WifiClient | null = null;
  for (const line of output.split(/\r?\n/)) {
    const marker = line.match(/^__WIFI_IFACE__\|(.+)$/);
    if (marker) {
      interfaceName = marker[1].trim() || null;
      continue;
    }
    const station = line.match(
      /^Station\s+([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})\b/,
    );
    if (station) {
      pending = {
        mac: station[1].toUpperCase(),
        interfaceName,
        signalDbm: null,
      };
      clients.push(pending);
      continue;
    }
    const signal = line.match(/^\s*signal:\s*(-?\d+)\s*dBm/i);
    if (signal && pending) pending.signalDbm = Number(signal[1]);
  }
  return clients;
}

function signalQuality(
  signalDbm: number | null,
): Pick<WeakSignalClient, "quality" | "qualityLabel"> {
  if (signalDbm === null)
    return { quality: "unknown", qualityLabel: "未报告信号" };
  if (signalDbm <= -75) return { quality: "weak", qualityLabel: "弱信号" };
  if (signalDbm <= -67) return { quality: "fair", qualityLabel: "需关注" };
  return { quality: "good", qualityLabel: "良好" };
}

export function buildWeakSignalSnapshotCommand() {
  return `${buildWifiClientSnapshotCommand()}; ${buildClientSnapshotCommand()}`;
}

export function parseWeakSignalClients(output: string): WeakSignalClient[] {
  const clientByMac = new Map(
    parseConnectedClients(output).map((client) => [client.mac, client]),
  );
  const weight = { weak: 0, fair: 1, unknown: 2, good: 3 } as const;
  return parseWifiClients(output)
    .map((client) => {
      const connected = clientByMac.get(client.mac);
      return {
        ...client,
        hostname: connected?.hostname ?? null,
        ipv4: connected?.ipv4 ?? null,
        online: connected?.online ?? true,
        ...signalQuality(client.signalDbm),
      };
    })
    .sort(
      (a, b) =>
        weight[a.quality] - weight[b.quality] ||
        (a.signalDbm ?? 1) - (b.signalDbm ?? 1) ||
        (a.hostname ?? a.mac).localeCompare(b.hostname ?? b.mac),
    );
}

export function buildWirelessOptimizationSnapshotCommand() {
  return 'RADIOS=$({ uci -q show wireless | sed -n "s/^wireless\\.\\([A-Za-z0-9_-]*\\)=\'wifi-device\'$/\\1/p"; uci -q show wireless | sed -n "s/^wireless\\.[A-Za-z0-9_-]*\\.device=\'\\([A-Za-z0-9_-]*\\)\'$/\\1/p"; } | sort -u); for radio in $RADIOS; do channel=$(uci -q get wireless.$radio.channel 2>/dev/null || true); printf \'RADIO|%s|%s\\n\' "$radio" "$channel"; done; ubus call iwinfo devices 2>/dev/null | jsonfilter -e \'@.devices[*]\' 2>/dev/null | while read -r device; do scan=$(ubus call iwinfo scan "{\\"device\\":\\"$device\\"}" 2>/dev/null | jsonfilter -e \'@.results\' 2>/dev/null); [ -n "$scan" ] && printf \'SCAN|%s|%s\\n\' "$device" "$scan"; done';
}

function readScanNetworks(radio: string, raw: string): WirelessScanNetwork[] {
  try {
    const decoded = JSON.parse(raw) as unknown;
    const records = Array.isArray(decoded)
      ? decoded
      : decoded &&
          typeof decoded === "object" &&
          Array.isArray((decoded as { results?: unknown }).results)
        ? (decoded as { results: unknown[] }).results
        : [];
    return records.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const channel = Number(record.channel);
      if (!Number.isInteger(channel) || channel < 1 || channel > 233) return [];
      const signal = Number(record.signal ?? record.signal_dbm);
      return [
        {
          radio,
          ssid:
            typeof record.ssid === "string" && record.ssid.trim()
              ? record.ssid.trim()
              : null,
          bssid:
            typeof record.bssid === "string" && record.bssid.trim()
              ? record.bssid.trim().toUpperCase()
              : null,
          channel,
          signalDbm: Number.isFinite(signal) ? signal : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function parseWirelessOptimizationSnapshot(
  output: string,
): WirelessOptimizationSnapshot {
  const radios = new Map<string, WirelessRadio>();
  const networks: WirelessScanNetwork[] = [];
  const scans: Array<{ device: string; raw: string }> = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const radio = line.match(/^RADIO\|([A-Za-z0-9_-]+)\|([^|]*)$/);
    if (radio) {
      const channel = Number(radio[2]);
      radios.set(radio[1], {
        name: radio[1],
        currentChannel:
          Number.isInteger(channel) && channel >= 1 && channel <= 233
            ? channel
            : null,
      });
      continue;
    }
    const scan = line.match(/^SCAN\|([A-Za-z0-9_-]+)\|(.+)$/);
    if (scan) scans.push({ device: scan[1], raw: scan[2] });
  }
  for (const scan of scans) {
    const phyNumber =
      scan.device.match(/(?:^|[^a-z0-9])phy(\d+)(?:[^a-z0-9]|$)/i)?.[1] ??
      scan.device.match(/^radio(\d+)$/i)?.[1];
    const mappedRadio = radios.has(scan.device)
      ? scan.device
      : phyNumber && radios.has(`radio${phyNumber}`)
        ? `radio${phyNumber}`
        : radios.size === 1
          ? [...radios.keys()][0]
          : scan.device;
    networks.push(...readScanNetworks(mappedRadio, scan.raw));
  }
  return {
    radios: [...radios.values()].sort((a, b) => a.name.localeCompare(b.name)),
    networks,
  };
}

function signalWeight(signalDbm: number | null) {
  return Math.max(8, Math.min(80, signalDbm === null ? 32 : 100 + signalDbm));
}

function congestionScore(
  channel: number,
  networks: WirelessScanNetwork[],
  is24GHz: boolean,
) {
  return networks.reduce((score, network) => {
    const distance = Math.abs(channel - network.channel);
    const overlap = is24GHz
      ? Math.max(0, 1 - distance / 5)
      : distance === 0
        ? 1
        : 0;
    return score + signalWeight(network.signalDbm) * overlap;
  }, 0);
}

export function recommendWirelessChannel(
  radio: WirelessRadio,
  networks: WirelessScanNetwork[],
): WirelessChannelRecommendation {
  const currentChannel = radio.currentChannel;
  const radioNetworks = networks.filter(
    (network) => network.radio === radio.name,
  );
  if (currentChannel === null)
    return {
      radio: radio.name,
      currentChannel,
      suggestedChannel: null,
      currentScore: null,
      suggestedScore: null,
      reason: "路由器未报告当前信道，无法给出可安全应用的建议。",
    };
  if (!radioNetworks.length)
    return {
      radio: radio.name,
      currentChannel,
      suggestedChannel: currentChannel,
      currentScore: 0,
      suggestedScore: 0,
      reason:
        "未读取到邻近网络；保留当前信道，避免在没有扫描依据时修改无线配置。",
    };
  const is24GHz =
    currentChannel <= 14 ||
    radioNetworks.some((network) => network.channel <= 14);
  const candidates = is24GHz
    ? [1, 6, 11]
    : [
        ...new Set([
          currentChannel,
          ...radioNetworks.map((network) => network.channel),
        ]),
      ].sort((a, b) => a - b);
  const scored = candidates
    .map((channel) => ({
      channel,
      score: congestionScore(channel, radioNetworks, is24GHz),
    }))
    .sort(
      (a, b) =>
        a.score - b.score ||
        Math.abs(a.channel - currentChannel) -
          Math.abs(b.channel - currentChannel),
    );
  const suggested = scored[0];
  const currentScore = congestionScore(currentChannel, radioNetworks, is24GHz);
  const reason =
    suggested.channel === currentChannel
      ? `当前信道 ${currentChannel} 在本次扫描的 ${radioNetworks.length} 个邻近网络中已是较低拥挤度选项。`
      : `基于本次扫描的 ${radioNetworks.length} 个邻近网络，信道 ${suggested.channel} 的加权拥挤度低于当前信道 ${currentChannel}。`;
  return {
    radio: radio.name,
    currentChannel,
    suggestedChannel: suggested.channel,
    currentScore,
    suggestedScore: suggested.score,
    reason,
  };
}

export function buildWirelessChannelApplyCommand(
  radio: string,
  channel: number,
) {
  const safeRadio = requireIdentifier(radio, "无线设备");
  if (!Number.isInteger(channel) || channel < 1 || channel > 233)
    throw new Error("无线信道应为 1–233 的整数。");
  return `uci set wireless.${safeRadio}.channel='${channel}'; uci commit wireless; wifi reload`;
}

function escapeWifiQr(value: string) {
  return value.replace(/([\\;,:\"])/g, "\\$1");
}

export function buildWifiQrValue(ssid: string, password: string) {
  const safeSsid = ssid.trim();
  const safePassword = password.trim();
  if (!safeSsid || !safePassword) throw new Error("请填写访客网络名称和密码。");
  return `WIFI:T:WPA;S:${escapeWifiQr(safeSsid)};P:${escapeWifiQr(safePassword)};;`;
}

export function buildGuestNetworkCommand(
  radio: string,
  ssid: string,
  password: string,
) {
  const safeRadio = requireIdentifier(radio, "无线设备");
  const safeSsid = ssid.trim();
  const safePassword = password.trim();
  if (!safeSsid || safeSsid.length > 32)
    throw new Error("访客网络名称必须为 1–32 个字符。");
  if (safePassword.length < 8 || safePassword.length > 63)
    throw new Error("访客网络密码必须为 8–63 个字符。");
  return `uci -q delete wireless.openwrt_app_guest; uci set wireless.openwrt_app_guest='wifi-iface'; uci set wireless.openwrt_app_guest.device=${shellQuote(safeRadio)}; uci set wireless.openwrt_app_guest.mode='ap'; uci set wireless.openwrt_app_guest.ssid=${shellQuote(safeSsid)}; uci set wireless.openwrt_app_guest.encryption='sae-mixed'; uci set wireless.openwrt_app_guest.key=${shellQuote(safePassword)}; uci set wireless.openwrt_app_guest.network='guest'; uci -q delete network.guest; uci set network.guest='interface'; uci set network.guest.proto='static'; uci set network.guest.ipaddr='192.168.75.1'; uci set network.guest.netmask='255.255.255.0'; uci -q delete dhcp.guest; uci set dhcp.guest='dhcp'; uci set dhcp.guest.interface='guest'; uci set dhcp.guest.start='100'; uci set dhcp.guest.limit='150'; uci set dhcp.guest.leasetime='12h'; uci -q delete firewall.guest; uci set firewall.guest='zone'; uci set firewall.guest.name='guest'; uci set firewall.guest.input='REJECT'; uci set firewall.guest.output='ACCEPT'; uci set firewall.guest.forward='REJECT'; uci add_list firewall.guest.network='guest'; uci -q delete firewall.openwrt_app_guest_to_wan; uci set firewall.openwrt_app_guest_to_wan='forwarding'; uci set firewall.openwrt_app_guest_to_wan.src='guest'; uci set firewall.openwrt_app_guest_to_wan.dest='wan'; uci commit wireless; uci commit network; uci commit dhcp; uci commit firewall; /etc/init.d/network reload; /etc/init.d/dnsmasq restart; /etc/init.d/firewall reload; wifi reload`;
}

export function isWanInterface(interfaceStatus: InterfaceStatus) {
  return (
    /^(wan|wan\d+|wan[a-z0-9_-]+)$/i.test(interfaceStatus.name) &&
    interfaceStatus.up
  );
}

export function buildWanDiagnosticCommand(
  interfaceName: string,
  kind: "ping" | "dns" | "trace" | "port",
  target: string,
  port = 443,
) {
  const wan = requireIdentifier(interfaceName, "WAN 接口");
  const hostname = target.trim();
  if (!/^[A-Za-z0-9.-]+$/.test(hostname))
    throw new Error("诊断目标仅支持域名或 IPv4 地址。");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("端口范围应为 1–65535。");
  if (kind === "ping") return `ping -I ${wan} -c 4 -W 2 ${hostname}`;
  if (kind === "dns") return `nslookup ${hostname}`;
  if (kind === "trace")
    return `traceroute -n -i ${wan} -w 2 -q 1 ${hostname} 2>&1 || tracepath -n ${hostname} 2>&1`;
  return `nc -z -w 4 ${hostname} ${port} 2>&1 || busybox nc -z -w 4 ${hostname} ${port} 2>&1`;
}

function requireDnsAddress(value: string) {
  const address = value.trim();
  if (
    !/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(address) &&
    !/^[0-9a-fA-F:]+$/.test(address)
  ) {
    throw new Error("DNS 服务器仅支持 IPv4 或 IPv6 地址。");
  }
  return address;
}

export function buildDnsLatencyCommand(
  interfaceName: string,
  dnsServer: string,
  family: "ipv4" | "ipv6",
  hostname = "openwrt.org",
) {
  const wan = requireIdentifier(interfaceName, "WAN 接口");
  const server = requireDnsAddress(dnsServer);
  const query = hostname.trim();
  if (!/^[A-Za-z0-9.-]+$/.test(query)) {
    throw new Error("查询域名格式无效。");
  }
  const familyFlag = family === "ipv6" ? "-6" : "-4";
  const label = family === "ipv6" ? "IPv6" : "IPv4";
  return `echo 'OPENWRT_DNS|${label}|${server}|${query}'; start=$(date +%s%3N 2>/dev/null || date +%s000); nslookup ${familyFlag} ${query} ${server} >/tmp/openwrt-app-dns.$$ 2>&1; code=$?; end=$(date +%s%3N 2>/dev/null || date +%s000); cat /tmp/openwrt-app-dns.$$; rm -f /tmp/openwrt-app-dns.$$; echo "OPENWRT_DNS_RESULT|exit=$code|elapsed_ms=$((end-start))|wan=${wan}"`;
}

export function buildWanReconnectCommand(interfaceName: string) {
  const wan = requireIdentifier(interfaceName, "WAN 接口");
  return `ifdown ${wan}; sleep 2; ifup ${wan}; ifstatus ${wan}`;
}

export function buildServiceSnapshotCommand() {
  const serviceChecks = MANAGED_OPENWRT_SERVICES.map(
    (service) =>
      `if pgrep -x ${service} >/dev/null 2>&1; then echo 'OPENWRT|${service}|running'; else echo 'OPENWRT|${service}|stopped'; fi`,
  ).join("; ");
  return `${serviceChecks}; if command -v docker >/dev/null 2>&1; then docker ps -a --format 'DOCKER|{{.Names}}|{{.Status}}'; fi`;
}

export function parseServiceStates(output: string): ServiceState[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const [kind, name, detail] = line.trim().split("|");
    if (!name || (kind !== "OPENWRT" && kind !== "DOCKER")) return [];
    return [
      {
        name,
        running:
          kind === "OPENWRT"
            ? detail === "running"
            : /^Up\b/i.test(detail ?? ""),
        managedBy: kind === "OPENWRT" ? "openwrt" : "docker",
        detail,
      },
    ];
  });
}

export function buildServiceCommand(
  name: string,
  action: "start" | "stop" | "restart",
  managedBy: ServiceState["managedBy"],
) {
  const safeName = requireIdentifier(name, "服务名称");
  if (managedBy === "docker")
    return `docker ${action === "restart" ? "restart" : action} ${safeName}`;
  if (
    !MANAGED_OPENWRT_SERVICES.includes(
      safeName as (typeof MANAGED_OPENWRT_SERVICES)[number],
    )
  )
    throw new Error("不支持控制此系统服务。");
  return `/etc/init.d/${safeName} ${action}`;
}

export function buildDockerSnapshotCommand() {
  return "if ! command -v docker >/dev/null 2>&1; then echo '__DOCKER_UNAVAILABLE__'; else echo '__DOCKER_AVAILABLE__'; docker ps -a --format 'CONTAINER|{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' 2>&1; echo '__DOCKER_STATS__'; docker stats --no-stream --format 'STAT|{{.ID}}|{{.CPUPerc}}|{{.MemUsage}}' 2>/dev/null; fi";
}

export function parseDockerSnapshot(output: string): DockerSnapshot {
  const available = output.includes("__DOCKER_AVAILABLE__");
  if (!available) return { available: false, containers: [] };
  const containers = new Map<string, DockerContainer>();
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const parts = line.split("|");
    if (parts[0] === "CONTAINER" && parts.length >= 6) {
      const [, id, name, image, status, ...portParts] = parts;
      if (!/^[A-Za-z0-9]+$/.test(id) || !name || !image) continue;
      containers.set(id, {
        id,
        name,
        image,
        status,
        running: /^Up\b/i.test(status),
        ports: portParts.join("|").trim() || null,
        cpuPercent: null,
        memoryUsage: null,
      });
    }
    if (parts[0] === "STAT" && parts.length >= 4) {
      const [, id, cpuPercent, ...memoryParts] = parts;
      const current = containers.get(id);
      if (current)
        containers.set(id, {
          ...current,
          cpuPercent: cpuPercent.trim() || null,
          memoryUsage: memoryParts.join("|").trim() || null,
        });
    }
  }
  return {
    available: true,
    containers: [...containers.values()].sort(
      (a, b) =>
        Number(b.running) - Number(a.running) || a.name.localeCompare(b.name),
    ),
  };
}

export function buildDockerContainerCommand(
  id: string,
  action: "start" | "stop" | "restart",
) {
  const safeId = requireIdentifier(id, "Docker 容器");
  return `docker ${action} ${safeId}`;
}

export function buildDockerContainerLogsCommand(id: string) {
  const safeId = requireIdentifier(id, "Docker 容器");
  return `docker logs --tail 200 ${safeId} 2>&1`;
}

export function buildPerformanceBenchmarkCommand() {
  return `printf '__BENCHMARK_SYSTEM__\\n'; awk -F: '/^(model name|system type|machine|Processor)[[:space:]]*:/{gsub(/^[[:space:]]+/, "", $2); printf "CPU|%s|", $2; found=1; exit} END{if(!found) printf "CPU|未知 CPU|"}' /proc/cpuinfo; awk '/^processor[[:space:]]*:/ {count++} END{if(count<1) count=1; printf "%s\\n", count}' /proc/cpuinfo; awk '{printf "LOAD|%s\\n", $1}' /proc/loadavg; awk '/^MemTotal:/{total=$2}/^MemAvailable:/{available=$2}END{printf "MEM|%s|%s\\n", total, available}' /proc/meminfo; df -k /overlay 2>/dev/null | awk 'NR==2{printf "STORAGE|%s|%s|%s\\n", $2, $3, $4; found=1} END{if(!found) print "STORAGE|||"}'`;
}

function nullableNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePerformanceBenchmark(
  output: string,
): PerformanceBenchmark {
  let cpuModel: string | null = null;
  let cpuCores: number | null = null;
  let loadAverage: number | null = null;
  let memoryTotalKb: number | null = null;
  let memoryAvailableKb: number | null = null;
  let storageTotalKb: number | null = null;
  let storageUsedKb: number | null = null;
  let storageAvailableKb: number | null = null;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const cpuMatch = line.match(/^CPU\|(.+)\|(\d+)$/);
    if (cpuMatch) {
      cpuModel = cpuMatch[1] || null;
      cpuCores = nullableNumber(cpuMatch[2]);
      continue;
    }
    const loadMatch = line.match(/^LOAD\|(.+)$/);
    if (loadMatch) {
      loadAverage = nullableNumber(loadMatch[1]);
      continue;
    }
    const memoryMatch = line.match(/^MEM\|(\d*)\|(\d*)$/);
    if (memoryMatch) {
      memoryTotalKb = nullableNumber(memoryMatch[1]);
      memoryAvailableKb = nullableNumber(memoryMatch[2]);
      continue;
    }
    const storageMatch = line.match(/^STORAGE\|(\d*)\|(\d*)\|(\d*)$/);
    if (storageMatch) {
      storageTotalKb = nullableNumber(storageMatch[1]);
      storageUsedKb = nullableNumber(storageMatch[2]);
      storageAvailableKb = nullableNumber(storageMatch[3]);
    }
  }
  return {
    cpuModel,
    cpuCores,
    loadAverage,
    memoryTotalKb,
    memoryAvailableKb,
    storageTotalKb,
    storageUsedKb,
    storageAvailableKb,
  };
}

/** 读取路由器内核与硬件信息；Wi‑Fi 温度仅在驱动公开对应 sysfs 节点时返回。 */
export function buildRouterHardwareDetailsCommand() {
  return `printf '__DETAIL_CPU__\\n'; awk -F: '/^(model name|system type|machine|Processor)[[:space:]]*:/{gsub(/^[[:space:]]+/, "", $2); printf "CPU|%s|", $2; found=1; exit} END{if(!found) printf "CPU|未知 CPU|"}' /proc/cpuinfo; awk '/^processor[[:space:]]*:/ {count++} END{if(count<1) count=1; printf "%s\\n", count}' /proc/cpuinfo; printf '__DETAIL_KERNEL__\\n'; uname -r 2>/dev/null; printf '__DETAIL_WIFI_TEMPERATURES__\\n'; for path in /sys/class/ieee80211/phy*/device/hwmon/hwmon*/temp*_input /sys/class/ieee80211/phy*/device/temp*_input /sys/class/ieee80211/phy*/device/temperature /sys/class/ieee80211/phy*/temperature; do [ -r "$path" ] && printf 'WIFI_TEMP|%s\\n' "$(cat "$path" 2>/dev/null)"; done`;
}

export function parseRouterHardwareDetails(
  output: string,
): RouterHardwareDetails {
  let cpuModel: string | null = null;
  let cpuCores: number | null = null;
  let kernelVersion: string | null = null;
  const wifiTemperaturesC: number[] = [];
  let section = "";
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "__DETAIL_CPU__") {
      section = "cpu";
      continue;
    }
    if (line === "__DETAIL_KERNEL__") {
      section = "kernel";
      continue;
    }
    if (line === "__DETAIL_WIFI_TEMPERATURES__") {
      section = "wifi";
      continue;
    }
    if (!line) continue;
    if (section === "cpu") {
      const match = line.match(/^CPU\|(.+)\|(\d+)$/);
      if (match) {
        cpuModel = match[1].trim() || null;
        cpuCores = nullableNumber(match[2]);
      }
    } else if (section === "kernel") {
      kernelVersion = line || null;
    } else if (section === "wifi") {
      const match = line.match(/^WIFI_TEMP\|(-?\d+(?:\.\d+)?)$/);
      if (!match) continue;
      const raw = Number(match[1]);
      const celsius = Math.abs(raw) > 200 ? raw / 1000 : raw;
      if (Number.isFinite(celsius) && celsius > -50 && celsius < 150) {
        wifiTemperaturesC.push(celsius);
      }
    }
  }
  return { cpuModel, cpuCores, kernelVersion, wifiTemperaturesC };
}

export function buildFirmwareDeviceInfoCommand() {
  return "ubus call system board 2>/dev/null";
}

export function parseFirmwareDeviceInfo(output: string): FirmwareDeviceInfo {
  try {
    const start = output.indexOf("{");
    if (start < 0) throw new Error("missing JSON");
    const board = JSON.parse(output.slice(start)) as {
      model?: unknown;
      board_name?: unknown;
      release?: Record<string, unknown>;
    };
    const release = board.release ?? {};
    const stringValue = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;
    return {
      model: stringValue(board.model),
      boardName: stringValue(board.board_name),
      distribution: stringValue(release.distribution),
      version: stringValue(release.version),
      revision: stringValue(release.revision),
      target: stringValue(release.target),
      description: stringValue(release.description),
    };
  } catch {
    return {
      model: null,
      boardName: null,
      distribution: null,
      version: null,
      revision: null,
      target: null,
      description: null,
    };
  }
}

export const BACKUP_REMOTE_PATH = "/tmp/openwrt-status-app-backup.tar.gz";

export function buildBackupCommand() {
  return `rm -f ${BACKUP_REMOTE_PATH}; sysupgrade -b ${BACKUP_REMOTE_PATH}; ls -lh ${BACKUP_REMOTE_PATH}`;
}

export function buildRestoreCommand() {
  return `sysupgrade -r ${BACKUP_REMOTE_PATH}`;
}
