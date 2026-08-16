import type { InterfaceStatus } from "../shared/router-types";

export interface ConnectedClient {
  mac: string;
  hostname: string | null;
  ipv4: string | null;
  expiresAt: string | null;
  online: boolean;
}

export interface WifiConfigEntry {
  section: string;
  device: string;
  ssid: string;
  disabled: boolean;
}

export interface WifiClient {
  mac: string;
  interfaceName: string | null;
  signalDbm: number | null;
}

export interface ServiceState {
  name: string;
  running: boolean;
  managedBy: "openwrt" | "docker";
  detail?: string;
}

export const MANAGED_OPENWRT_SERVICES = ["dnsmasq", "firewall", "network", "uhttpd", "dropbear"] as const;

function cleanQuoted(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function requireMac(mac: string) {
  const normalized = mac.trim().toUpperCase();
  if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalized)) throw new Error("MAC 地址格式无效。");
  return normalized;
}

function requireIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.:-]+$/.test(normalized)) throw new Error(`${label}格式无效。`);
  return normalized;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
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
    const ipv4 = tokens.find((value) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) ?? null;
    const previous = byMac.get(mac);
    if (inLeases) {
      const hostname = tokens.find((value) => value.toUpperCase() !== mac && value !== ipv4 && !/^\d+$/.test(value) && value !== "*" && !/^(?:lladdr|REACHABLE|STALE|DELAY|PROBE|FAILED)$/i.test(value)) ?? null;
      byMac.set(mac, { mac, hostname: hostname === "*" ? null : hostname, ipv4, expiresAt: tokens[0] && /^\d+$/.test(tokens[0]) ? tokens[0] : null, online: previous?.online ?? false });
    } else {
      byMac.set(mac, { mac, hostname: previous?.hostname ?? null, ipv4: ipv4 ?? previous?.ipv4 ?? null, expiresAt: previous?.expiresAt ?? null, online: !/FAILED|INCOMPLETE/i.test(line) });
    }
  }
  return [...byMac.values()].sort((a, b) => Number(b.online) - Number(a.online) || (a.hostname ?? a.mac).localeCompare(b.hostname ?? b.mac));
}

export function buildClientSnapshotCommand() {
  return "printf '__LEASES__\\n'; ubus call dhcp ipv4leases 2>/dev/null | jsonfilter -e '@.device[*]' 2>/dev/null; cat /tmp/dhcp.leases 2>/dev/null; printf '__NEIGH__\\n'; ip neigh show 2>/dev/null";
}

export function buildBlockClientCommand(mac: string) {
  const normalized = requireMac(mac);
  const section = `openwrt_app_block_${normalized.replace(/:/g, "_").toLowerCase()}`;
  return `uci -q delete firewall.${section}; uci set firewall.${section}=rule; uci set firewall.${section}.name=${shellQuote(`OpenWrt App block ${normalized}`)}; uci set firewall.${section}.src='lan'; uci add_list firewall.${section}.src_mac=${shellQuote(normalized)}; uci set firewall.${section}.target='REJECT'; uci commit firewall; /etc/init.d/firewall reload`;
}

export function buildUnblockClientCommand(mac: string) {
  const normalized = requireMac(mac);
  const section = `openwrt_app_block_${normalized.replace(/:/g, "_").toLowerCase()}`;
  return `uci -q delete firewall.${section}; uci commit firewall; /etc/init.d/firewall reload`;
}

export function parseWifiConfigs(output: string): WifiConfigEntry[] {
  const entries = new Map<string, Partial<WifiConfigEntry>>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^wireless\.([A-Za-z0-9_]+)\.(device|ssid|disabled)=(.+)$/);
    if (!match) continue;
    const [, section, key, raw] = match;
    const entry = entries.get(section) ?? { section };
    if (key === "device") entry.device = cleanQuoted(raw);
    if (key === "ssid") entry.ssid = cleanQuoted(raw);
    if (key === "disabled") entry.disabled = cleanQuoted(raw) === "1";
    entries.set(section, entry);
  }
  return [...entries.values()]
    .filter((entry): entry is WifiConfigEntry => Boolean(entry.section && entry.device && entry.ssid))
    .map((entry) => ({ ...entry, disabled: entry.disabled ?? false }));
}

export function buildWifiToggleCommand(section: string, enabled: boolean) {
  const safeSection = requireIdentifier(section, "无线配置段");
  return `uci set wireless.${safeSection}.disabled='${enabled ? "0" : "1"}'; uci commit wireless; wifi reload`;
}

export function buildWifiSsidCommand(section: string, ssid: string) {
  const safeSection = requireIdentifier(section, "无线配置段");
  const nextSsid = ssid.trim();
  if (!nextSsid || nextSsid.length > 32) throw new Error("SSID 必须为 1–32 个字符。");
  return `uci set wireless.${safeSection}.ssid=${shellQuote(nextSsid)}; uci commit wireless; wifi reload`;
}

export function buildWifiSnapshotCommand() {
  return "uci show wireless 2>/dev/null";
}

export function buildWifiClientSnapshotCommand() {
  return "iw dev 2>/dev/null | awk '$1==\"Interface\"{print $2}' | while read -r iface; do echo \"__WIFI_IFACE__|$iface\"; iw dev \"$iface\" station dump 2>/dev/null; done";
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
    const station = line.match(/^Station\s+([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})\b/);
    if (station) {
      pending = { mac: station[1].toUpperCase(), interfaceName, signalDbm: null };
      clients.push(pending);
      continue;
    }
    const signal = line.match(/^\s*signal:\s*(-?\d+)\s*dBm/i);
    if (signal && pending) pending.signalDbm = Number(signal[1]);
  }
  return clients;
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

export function buildGuestNetworkCommand(radio: string, ssid: string, password: string) {
  const safeRadio = requireIdentifier(radio, "无线设备");
  const safeSsid = ssid.trim();
  const safePassword = password.trim();
  if (!safeSsid || safeSsid.length > 32) throw new Error("访客网络名称必须为 1–32 个字符。");
  if (safePassword.length < 8 || safePassword.length > 63) throw new Error("访客网络密码必须为 8–63 个字符。");
  return `uci -q delete wireless.openwrt_app_guest; uci set wireless.openwrt_app_guest='wifi-iface'; uci set wireless.openwrt_app_guest.device=${shellQuote(safeRadio)}; uci set wireless.openwrt_app_guest.mode='ap'; uci set wireless.openwrt_app_guest.ssid=${shellQuote(safeSsid)}; uci set wireless.openwrt_app_guest.encryption='sae-mixed'; uci set wireless.openwrt_app_guest.key=${shellQuote(safePassword)}; uci set wireless.openwrt_app_guest.network='guest'; uci -q delete network.guest; uci set network.guest='interface'; uci set network.guest.proto='static'; uci set network.guest.ipaddr='192.168.75.1'; uci set network.guest.netmask='255.255.255.0'; uci -q delete dhcp.guest; uci set dhcp.guest='dhcp'; uci set dhcp.guest.interface='guest'; uci set dhcp.guest.start='100'; uci set dhcp.guest.limit='150'; uci set dhcp.guest.leasetime='12h'; uci -q delete firewall.guest; uci set firewall.guest='zone'; uci set firewall.guest.name='guest'; uci set firewall.guest.input='REJECT'; uci set firewall.guest.output='ACCEPT'; uci set firewall.guest.forward='REJECT'; uci add_list firewall.guest.network='guest'; uci -q delete firewall.openwrt_app_guest_to_wan; uci set firewall.openwrt_app_guest_to_wan='forwarding'; uci set firewall.openwrt_app_guest_to_wan.src='guest'; uci set firewall.openwrt_app_guest_to_wan.dest='wan'; uci commit wireless; uci commit network; uci commit dhcp; uci commit firewall; /etc/init.d/network reload; /etc/init.d/dnsmasq restart; /etc/init.d/firewall reload; wifi reload`;
}

export function isWanInterface(interfaceStatus: InterfaceStatus) {
  return /^(wan|wan\d+|wan[a-z0-9_-]+)$/i.test(interfaceStatus.name) && interfaceStatus.up;
}

export function buildWanDiagnosticCommand(interfaceName: string, kind: "ping" | "dns" | "trace" | "port", target: string, port = 443) {
  const wan = requireIdentifier(interfaceName, "WAN 接口");
  const hostname = target.trim();
  if (!/^[A-Za-z0-9.-]+$/.test(hostname)) throw new Error("诊断目标仅支持域名或 IPv4 地址。");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("端口范围应为 1–65535。");
  if (kind === "ping") return `ping -I ${wan} -c 4 -W 2 ${hostname}`;
  if (kind === "dns") return `nslookup ${hostname}`;
  if (kind === "trace") return `traceroute -n -i ${wan} -w 2 -q 1 ${hostname} 2>&1 || tracepath -n ${hostname} 2>&1`;
  return `nc -z -w 4 ${hostname} ${port} 2>&1 || busybox nc -z -w 4 ${hostname} ${port} 2>&1`;
}

export function buildWanReconnectCommand(interfaceName: string) {
  const wan = requireIdentifier(interfaceName, "WAN 接口");
  return `ifdown ${wan}; sleep 2; ifup ${wan}; ifstatus ${wan}`;
}

export function buildServiceSnapshotCommand() {
  const serviceChecks = MANAGED_OPENWRT_SERVICES.map((service) => `if pgrep -x ${service} >/dev/null 2>&1; then echo 'OPENWRT|${service}|running'; else echo 'OPENWRT|${service}|stopped'; fi`).join("; ");
  return `${serviceChecks}; if command -v docker >/dev/null 2>&1; then docker ps -a --format 'DOCKER|{{.Names}}|{{.Status}}'; fi`;
}

export function parseServiceStates(output: string): ServiceState[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const [kind, name, detail] = line.trim().split("|");
    if (!name || (kind !== "OPENWRT" && kind !== "DOCKER")) return [];
    return [{ name, running: kind === "OPENWRT" ? detail === "running" : /^Up\b/i.test(detail ?? ""), managedBy: kind === "OPENWRT" ? "openwrt" : "docker", detail }];
  });
}

export function buildServiceCommand(name: string, action: "start" | "stop" | "restart", managedBy: ServiceState["managedBy"]) {
  const safeName = requireIdentifier(name, "服务名称");
  if (managedBy === "docker") return `docker ${action === "restart" ? "restart" : action} ${safeName}`;
  if (!MANAGED_OPENWRT_SERVICES.includes(safeName as (typeof MANAGED_OPENWRT_SERVICES)[number])) throw new Error("不支持控制此系统服务。");
  return `/etc/init.d/${safeName} ${action}`;
}

export const BACKUP_REMOTE_PATH = "/tmp/openwrt-status-app-backup.tar.gz";

export function buildBackupCommand() {
  return `rm -f ${BACKUP_REMOTE_PATH}; sysupgrade -b ${BACKUP_REMOTE_PATH}; ls -lh ${BACKUP_REMOTE_PATH}`;
}

export function buildRestoreCommand() {
  return `sysupgrade -r ${BACKUP_REMOTE_PATH}`;
}
