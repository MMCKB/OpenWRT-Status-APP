import {
  formatBytes,
  formatLoad,
  formatUptime,
  memoryUsagePercent,
} from "@/lib/openwrt-client";
import type { RouterProfile, RouterStatus } from "@/shared/router-types";

export type ProxyServiceId =
  | "openclash"
  | "adguardhome"
  | "passwall"
  | "passwall2"
  | "ddns";
export type ManagedAction = "start" | "stop" | "restart";
export type RouterLogCategory =
  | "system"
  | "kernel"
  | "dns"
  | "dial"
  | "firewall";
export type PortProtocol = "tcp" | "udp" | "tcp udp";

export interface ProxyServiceState {
  id: ProxyServiceId;
  label: string;
  initName: string;
  installed: boolean;
  running: boolean;
}

export interface PluginConfigSnapshot {
  id: ProxyServiceId;
  label: string;
  configPath: string;
  exists: boolean;
  content: string;
}

export interface PluginSettingDefinition {
  key: string;
  label: string;
  kind: "text" | "password" | "switch" | "number";
  placeholder?: string;
}

export interface PluginSettingsSection {
  section: string;
  type: string;
  title: string;
  values: Record<string, string>;
}

export interface PluginSettingsSnapshot {
  id: ProxyServiceId;
  label: string;
  exists: boolean;
  sections: PluginSettingsSection[];
}

export interface DiskUsage {
  mount: string;
  totalKb: number | null;
  usedKb: number | null;
  availableKb: number | null;
  usePercent: number | null;
}

export interface PingHealth {
  transmitted: number | null;
  received: number | null;
  lossPercent: number | null;
  averageMs: number | null;
}

export interface RouterHealthSnapshot {
  disks: DiskUsage[];
  temperaturesC: number[];
  ping: PingHealth | null;
  dnsReachable: boolean | null;
}

export interface FirewallZone {
  section: string;
  name: string;
  networks: string[];
  input: string;
  output: string;
  forward: string;
}

export interface PortForwardRule {
  section: string;
  name: string;
  sourceZone: string;
  destinationZone: string;
  destinationIp: string;
  sourcePort: string;
  destinationPort: string;
  protocol: string;
  enabled: boolean;
}

export interface FirewallForwarding {
  section: string;
  sourceZone: string;
  destinationZone: string;
  enabled: boolean;
}

export interface FirewallTrafficRule {
  section: string;
  name: string;
  sourceZone: string;
  destinationZone: string;
  protocol: string;
  sourceIp: string;
  destinationIp: string;
  sourcePort: string;
  destinationPort: string;
  target: "ACCEPT" | "REJECT" | "DROP";
  enabled: boolean;
}

export interface UpnpState {
  installed: boolean;
  running: boolean;
  enabled: boolean;
}

export interface FirewallSnapshot {
  zones: FirewallZone[];
  forwardings: FirewallForwarding[];
  trafficRules: FirewallTrafficRule[];
  portForwards: PortForwardRule[];
  upnp: UpnpState;
}

export interface PortForwardDraft {
  name: string;
  sourceZone: string;
  destinationZone: string;
  destinationIp: string;
  sourcePort: string;
  destinationPort: string;
  protocol: PortProtocol;
}

export interface FirewallTrafficRuleDraft {
  name: string;
  sourceZone: string;
  destinationZone: string;
  protocol: PortProtocol;
  sourceIp: string;
  destinationIp: string;
  sourcePort: string;
  destinationPort: string;
  target: "ACCEPT" | "REJECT" | "DROP";
}

const PROXY_SERVICES = [
  {
    id: "openclash",
    label: "OpenClash",
    initName: "openclash",
    processHint: "clash",
    logFile: null,
    logPattern: "openclash|clash|mihomo",
    luciPath: "admin/services/openclash",
    configPath: "/etc/config/openclash",
  },
  {
    id: "adguardhome",
    label: "AdGuard Home",
    initName: "AdGuardHome",
    processHint: "AdGuardHome",
    logFile: null,
    logPattern: "AdGuardHome|adguard",
    luciPath: "admin/services/adguardhome",
    configPath: "/etc/config/AdGuardHome",
  },
  {
    id: "passwall",
    label: "PassWall",
    initName: "passwall",
    processHint: "passwall",
    logFile: "/tmp/log/passwall.log",
    logPattern: "passwall",
    luciPath: "admin/services/passwall",
    configPath: "/etc/config/passwall",
  },
  {
    id: "passwall2",
    label: "PassWall2",
    initName: "passwall2",
    processHint: "passwall2",
    logFile: "/tmp/log/passwall2.log",
    logPattern: "passwall2",
    luciPath: "admin/services/passwall2",
    configPath: "/etc/config/passwall2",
  },
  {
    id: "ddns",
    label: "DDNS",
    initName: "ddns",
    processHint: "ddns",
    logFile: null,
    logPattern: "ddns",
    luciPath: "admin/services/ddns",
    configPath: "/etc/config/ddns",
  },
] as const;

const PLUGIN_SETTING_DEFINITIONS: Record<
  ProxyServiceId,
  readonly PluginSettingDefinition[]
> = {
  openclash: [
    { key: "enabled", label: "启用服务", kind: "switch" },
    {
      key: "config",
      label: "配置订阅或配置文件",
      kind: "text",
      placeholder: "例如 config.yaml",
    },
    {
      key: "en_mode",
      label: "运行模式",
      kind: "text",
      placeholder: "redir-host / fake-ip",
    },
    {
      key: "dns_mode",
      label: "DNS 模式",
      kind: "text",
      placeholder: "redir-host / fake-ip",
    },
    { key: "log_level", label: "日志等级", kind: "text", placeholder: "info" },
  ],
  adguardhome: [
    { key: "enabled", label: "启用服务", kind: "switch" },
    { key: "port", label: "管理端口", kind: "number", placeholder: "3000" },
    {
      key: "redirect",
      label: "DNS 重定向模式",
      kind: "text",
      placeholder: "none",
    },
  ],
  passwall: [
    { key: "enabled", label: "启用服务", kind: "switch" },
    {
      key: "tcp_proxy_mode",
      label: "TCP 代理模式",
      kind: "text",
      placeholder: "global / gfwlist",
    },
    {
      key: "udp_proxy_mode",
      label: "UDP 代理模式",
      kind: "text",
      placeholder: "disable / global",
    },
    { key: "dns_shunt", label: "DNS 分流", kind: "switch" },
  ],
  passwall2: [
    { key: "enabled", label: "启用服务", kind: "switch" },
    {
      key: "tcp_proxy_mode",
      label: "TCP 代理模式",
      kind: "text",
      placeholder: "global / gfwlist",
    },
    {
      key: "udp_proxy_mode",
      label: "UDP 代理模式",
      kind: "text",
      placeholder: "disable / global",
    },
    { key: "dns_shunt", label: "DNS 分流", kind: "switch" },
  ],
  ddns: [
    { key: "enabled", label: "启用此 DDNS 服务", kind: "switch" },
    {
      key: "service_name",
      label: "服务商",
      kind: "text",
      placeholder: "cloudflare.com-v4",
    },
    { key: "domain", label: "域名", kind: "text", placeholder: "example.com" },
    { key: "username", label: "用户名或 API 标识", kind: "text" },
    { key: "password", label: "密码或 API Token", kind: "password" },
    { key: "interface", label: "检测接口", kind: "text", placeholder: "wan" },
    {
      key: "ip_source",
      label: "IP 获取方式",
      kind: "text",
      placeholder: "network / web",
    },
    { key: "ip_url", label: "公网 IP 查询地址", kind: "text" },
    { key: "lookup_host", label: "解析检查主机", kind: "text" },
    {
      key: "check_interval",
      label: "检查间隔（分钟）",
      kind: "number",
      placeholder: "10",
    },
    {
      key: "force_interval",
      label: "强制更新间隔（小时）",
      kind: "number",
      placeholder: "72",
    },
  ],
};

const LOG_BASE_COMMANDS: Record<RouterLogCategory, string> = {
  system: "logread",
  kernel: "dmesg",
  dns: "logread | grep -Ei 'dnsmasq|AdGuardHome|adguard|unbound'",
  dial: "logread | grep -Ei 'ppp|wan|udhcpc|odhcp|dhcp'",
  firewall: "logread | grep -Ei 'firewall|fw4|nft|miniupnpd'",
};

function cleanQuoted(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `"'"'`)}'`;
}

function requireIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized))
    throw new Error(`${label}格式无效。`);
  return normalized;
}

function requireFirewallSection(value: string) {
  const normalized = value.trim();
  if (
    /^[A-Za-z0-9_-]+$/.test(normalized) ||
    /^@(redirect|forwarding|rule)\[\d+\]$/.test(normalized)
  )
    return normalized;
  throw new Error("端口转发规则格式无效。");
}

function requireIpv4(value: string) {
  const normalized = value.trim();
  const parts = normalized.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  ) {
    throw new Error("内网目标必须是有效 IPv4 地址。");
  }
  return normalized;
}

function requirePortSpec(value: string, label: string) {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{1,5})(?:-(\d{1,5}))?$/);
  if (!match) throw new Error(`${label}仅支持单个端口或连续端口范围。`);
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (start < 1 || end > 65535 || start > end)
    throw new Error(`${label}范围应为 1–65535。`);
  return normalized;
}

function safeNumber(value: string | undefined) {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function serviceDefinition(id: ProxyServiceId) {
  const service = PROXY_SERVICES.find((item) => item.id === id);
  if (!service) throw new Error("不支持的服务。");
  return service;
}

export function getProxyServiceDefinition(id: ProxyServiceId) {
  const service = serviceDefinition(id);
  return {
    id: service.id,
    label: service.label,
    initName: service.initName,
    configPath: service.configPath,
  };
}

export function getPluginSettingDefinitions(id: ProxyServiceId) {
  return PLUGIN_SETTING_DEFINITIONS[id];
}

function requireUciSection(value: string) {
  const normalized = value.trim();
  if (
    !/^[A-Za-z0-9_-]+$/.test(normalized) &&
    !/^@[A-Za-z0-9_-]+\[\d+\]$/.test(normalized)
  ) {
    throw new Error("配置段名称格式无效。");
  }
  return normalized;
}

function requireUciOption(value: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_]+$/.test(normalized)) {
    throw new Error("配置选项名称格式无效。");
  }
  return normalized;
}

function pluginUciPackage(id: ProxyServiceId) {
  return serviceDefinition(id).configPath.split("/").pop()!;
}

/** 读取服务实际存在的全部 UCI 段与选项，供应用内完整配置编辑使用。 */
export function buildPluginSettingsSnapshotCommand(id: ProxyServiceId) {
  const service = serviceDefinition(id);
  const pkg = pluginUciPackage(id);
  const prefix = `__PLUGIN_SETTINGS__|${id}`;
  const scan = [
    `uci -q show ${shellQuote(pkg)} 2>/dev/null | while IFS= read -r line; do`,
    '  case "$line" in',
    `    ${pkg}.*.*=*) section=$(printf '%s' "$line" | cut -d. -f2); option=$(printf '%s' "$line" | cut -d. -f3 | cut -d= -f1); value=$(printf '%s' "$line" | cut -d= -f2-); printf 'VALUE|%s|%s|%s\\n' "$section" "$option" "$value" ;;`,
    `    ${pkg}.*=*) section=$(printf '%s' "$line" | cut -d. -f2 | cut -d= -f1); type=$(printf '%s' "$line" | cut -d= -f2-); printf 'SECTION|%s|%s\\n' "$section" "$type" ;;`,
    "  esac",
    "done",
  ].join("\n");
  return `[ -x /etc/init.d/${service.initName} ] || { printf '${prefix}|missing\\n'; exit 0; }; if [ ! -r ${shellQuote(service.configPath)} ]; then printf '${prefix}|missing\\n'; exit 0; fi; printf '${prefix}|present\\n'; ${scan}`;
}

export function parsePluginSettingsSnapshot(
  id: ProxyServiceId,
  output: string,
): PluginSettingsSnapshot {
  const service = serviceDefinition(id);
  const marker = `__PLUGIN_SETTINGS__|${id}|`;
  const normalized = output.replace(/\r\n/g, "\n");
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) throw new Error("服务设置返回格式无效。");
  const lines = normalized.slice(markerIndex).split("\n");
  const markerLineIndex = lines.findIndex((line) =>
    ["present", "missing"].includes(line.trim().slice(marker.length)),
  );
  if (markerLineIndex < 0) throw new Error("服务设置返回格式无效。");
  const markerLine = lines[markerLineIndex].trim();
  const exists = markerLine === `${marker}present`;
  if (!exists && markerLine !== `${marker}missing`)
    throw new Error("服务设置返回格式无效。");
  const sections = new Map<string, PluginSettingsSection>();
  for (const line of lines.slice(markerLineIndex + 1)) {
    const sectionMatch = line.match(
      /^SECTION\|(@?[A-Za-z0-9_-]+(?:\[\d+\])?)\|([A-Za-z0-9_-]+)$/,
    );
    if (sectionMatch) {
      const [, section, type] = sectionMatch;
      sections.set(section, { section, type, title: section, values: {} });
      continue;
    }
    const valueMatch = line.match(
      /^VALUE\|(@?[A-Za-z0-9_-]+(?:\[\d+\])?)\|([A-Za-z0-9_]+)\|(.*)$/,
    );
    if (!valueMatch) continue;
    const [, section, key, value] = valueMatch;
    const current = sections.get(section);
    if (current) current.values[key] = cleanQuoted(value);
  }
  return { id, label: service.label, exists, sections: [...sections.values()] };
}

/** 保存完整 UCI 段的已读取选项；段名、选项名与值均经过严格校验。 */
export function buildPluginSettingsApplyCommand(
  id: ProxyServiceId,
  section: string,
  values: Record<string, string>,
) {
  const service = serviceDefinition(id);
  const pkg = pluginUciPackage(id);
  const safeSection = requireUciSection(section);
  const assignments = Object.entries(values).map(([key, rawValue]) => {
    const safeKey = requireUciOption(key);
    const value = rawValue.trim();
    if (value.length > 4096 || value.includes("\0") || /[\r\n]/.test(value))
      throw new Error(`${key} 的值格式无效。`);
    return value
      ? `uci set ${shellQuote(`${pkg}.${safeSection}.${safeKey}=${value}`)}`
      : `uci -q delete ${shellQuote(`${pkg}.${safeSection}.${safeKey}`)}`;
  });
  if (!assignments.length) throw new Error("没有可保存的设置项。");
  const backupPath = `${service.configPath}.openwrt-status.bak`;
  return `[ -x /etc/init.d/${service.initName} ] || { echo '${service.label} 未安装。'; exit 2; }; if [ -f ${shellQuote(service.configPath)} ]; then cp ${shellQuote(service.configPath)} ${shellQuote(backupPath)} || { echo '配置备份失败。'; exit 1; }; fi; ${assignments.join("; ")}; uci commit ${shellQuote(pkg)} && /etc/init.d/${service.initName} restart`;
}

export function buildProxyServiceSnapshotCommand() {
  return PROXY_SERVICES.map(
    (service) =>
      `if [ -x /etc/init.d/${service.initName} ]; then if /etc/init.d/${service.initName} status >/dev/null 2>&1 || pgrep -f ${shellQuote(service.processHint)} >/dev/null 2>&1; then echo 'PROXY|${service.id}|installed|running|${service.initName}'; else echo 'PROXY|${service.id}|installed|stopped|${service.initName}'; fi; else echo 'PROXY|${service.id}|missing|stopped|${service.initName}'; fi`,
  ).join("; ");
}

export function parseProxyServiceStates(output: string): ProxyServiceState[] {
  const states = new Map<ProxyServiceId, ProxyServiceState>(
    PROXY_SERVICES.map((service) => [
      service.id,
      {
        id: service.id,
        label: service.label,
        initName: service.initName,
        installed: false,
        running: false,
      },
    ]),
  );
  for (const line of output.split(/\r?\n/)) {
    const match = line
      .trim()
      .match(
        /^PROXY\|(openclash|adguardhome|passwall|passwall2|ddns)\|(installed|missing)\|(running|stopped)\|([A-Za-z0-9_.-]+)$/,
      );
    if (!match) continue;
    const [, rawId, availability, state, initName] = match;
    const id = rawId as ProxyServiceId;
    const current = states.get(id);
    if (!current) continue;
    states.set(id, {
      ...current,
      initName,
      installed: availability === "installed",
      running: state === "running",
    });
  }
  return PROXY_SERVICES.map((service) => states.get(service.id)!).filter(
    Boolean,
  );
}

export function buildProxyServiceActionCommand(
  id: ProxyServiceId,
  action: ManagedAction,
) {
  const service = serviceDefinition(id);
  return `[ -x /etc/init.d/${service.initName} ] || { echo '${service.label} 未安装。'; exit 2; }; /etc/init.d/${service.initName} ${action}`;
}

function safeLogLimit(limit: number, fallback = 100) {
  const normalized = Number.isFinite(limit) ? Math.floor(limit) : fallback;
  return Math.min(400, Math.max(20, normalized));
}

/** 仅按内置服务定义读取日志，服务 ID 不接受任意 Shell 字符串。 */
export function buildPluginLogCommand(id: ProxyServiceId, limit = 100) {
  const service = serviceDefinition(id);
  const safeLimit = safeLogLimit(limit);
  const systemLog = `(logread) 2>&1 | grep -Ei ${shellQuote(service.logPattern)} | tail -n ${safeLimit}`;
  if (!service.logFile) return systemLog;
  return `if [ -r ${shellQuote(service.logFile)} ]; then tail -n ${safeLimit} ${shellQuote(service.logFile)}; else ${systemLog}; fi`;
}

/** 仅读取内置服务明确允许的 UCI 配置文件，并用固定标记封装返回内容。 */
export function buildPluginConfigSnapshotCommand(id: ProxyServiceId) {
  const service = serviceDefinition(id);
  return `if [ -r ${shellQuote(service.configPath)} ]; then printf '__PLUGIN_CONFIG__|${service.id}|present\\n'; sed -n '1,2000p' ${shellQuote(service.configPath)}; else printf '__PLUGIN_CONFIG__|${service.id}|missing\\n'; fi`;
}

export function parsePluginConfigSnapshot(
  id: ProxyServiceId,
  output: string,
): PluginConfigSnapshot {
  const service = serviceDefinition(id);
  const normalized = output.replace(/\r\n/g, "\n");
  const marker = `__PLUGIN_CONFIG__|${service.id}|`;
  const start = normalized.indexOf(marker);
  if (start < 0) throw new Error("服务配置返回格式无效。");
  const headerEnd = normalized.indexOf("\n", start);
  const header = normalized
    .slice(start, headerEnd < 0 ? undefined : headerEnd)
    .trim();
  const exists = header === `${marker}present`;
  if (!exists && header !== `${marker}missing`) {
    throw new Error("服务配置返回格式无效。");
  }
  return {
    id: service.id,
    label: service.label,
    configPath: service.configPath,
    exists,
    content:
      exists && headerEnd >= 0 ? normalized.slice(headerEnd + 1).trimEnd() : "",
  };
}

function utf8Base64(value: string) {
  return btoa(
    encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    ),
  );
}

/** 使用 base64 传递正文，避免把用户配置直接拼接到 Shell；保存后只重启当前服务。 */
export function buildPluginConfigApplyCommand(
  id: ProxyServiceId,
  content: string,
) {
  const service = serviceDefinition(id);
  if (!content.trim()) throw new Error("配置内容不能为空。");
  if (content.includes("\0")) throw new Error("配置内容不能包含空字符。");
  if (content.length > 256_000) {
    throw new Error("配置内容过大，请通过文件管理处理。");
  }
  const encoded = utf8Base64(content);
  const backupPath = `${service.configPath}.openwrt-status.bak`;
  return `[ -x /etc/init.d/${service.initName} ] || { echo '${service.label} 未安装。'; exit 2; }; umask 077; temp=$(mktemp /tmp/openwrt-status-${service.id}-config.XXXXXX) || { echo '无法创建临时配置文件。'; exit 1; }; printf %s ${shellQuote(encoded)} | base64 -d > "$temp" || { rm -f "$temp"; echo '配置解码失败。'; exit 1; }; if [ -e ${shellQuote(service.configPath)} ]; then cp ${shellQuote(service.configPath)} ${shellQuote(backupPath)} || { rm -f "$temp"; echo '无法备份原配置。'; exit 1; }; fi; mv "$temp" ${shellQuote(service.configPath)} && /etc/init.d/${service.initName} restart`;
}

/**
 * 返回路由器 LuCI 服务页。该入口不会传递应用保存的密码，首次打开时可能需要在 LuCI 中重新认证。
 */
export function buildProxyServiceConfigUrl(
  baseUrl: string,
  id: ProxyServiceId,
) {
  const service = serviceDefinition(id);
  const input = baseUrl.trim();
  if (!input || /[\r\n]/.test(input)) throw new Error("路由器地址格式不正确。");
  const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("路由器地址格式不正确。");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("路由器地址必须使用 HTTP 或 HTTPS。");
  return new URL(`/cgi-bin/luci/${service.luciPath}`, parsed.origin).toString();
}

export function buildHealthSnapshotCommand() {
  return "printf '__DISKS__\\n'; df -k 2>/dev/null | awk 'NR>1 && ($6==\"/overlay\" || $6==\"/\") { printf \"DISK|%s|%s|%s|%s|%s\\n\", $6,$2,$3,$4,$5 }'; printf '__TEMPERATURES__\\n'; for path in /sys/class/thermal/thermal_zone*/temp /sys/class/hwmon/hwmon*/temp*_input; do [ -r \"$path\" ] && printf 'TEMP|%s\\n' \"$(cat \"$path\" 2>/dev/null)\"; done; printf '__PING__\\n'; ping -c 3 -W 2 1.1.1.1 2>&1; printf '__DNS__\\n'; nslookup openwrt.org 127.0.0.1 2>&1";
}

export function parseHealthSnapshot(output: string): RouterHealthSnapshot {
  const disks: DiskUsage[] = [];
  const temperaturesC: number[] = [];
  let pingOutput = "";
  let dnsOutput = "";
  let section = "";
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "__DISKS__") {
      section = "disks";
      continue;
    }
    if (line === "__TEMPERATURES__") {
      section = "temperatures";
      continue;
    }
    if (line === "__PING__") {
      section = "ping";
      continue;
    }
    if (line === "__DNS__") {
      section = "dns";
      continue;
    }
    if (!line) continue;
    if (section === "disks") {
      const match = line.match(/^DISK\|([^|]+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)%$/);
      if (match)
        disks.push({
          mount: match[1],
          totalKb: safeNumber(match[2]),
          usedKb: safeNumber(match[3]),
          availableKb: safeNumber(match[4]),
          usePercent: safeNumber(match[5]),
        });
    } else if (section === "temperatures") {
      const match = line.match(/^TEMP\|(-?\d+(?:\.\d+)?)$/);
      if (match) {
        const raw = Number(match[1]);
        const celsius = Math.abs(raw) > 200 ? raw / 1000 : raw;
        if (Number.isFinite(celsius) && celsius > -50 && celsius < 150)
          temperaturesC.push(Math.round(celsius * 10) / 10);
      }
    } else if (section === "ping") {
      pingOutput += `${line}\n`;
    } else if (section === "dns") {
      dnsOutput += `${line}\n`;
    }
  }
  const packet = pingOutput.match(
    /(\d+)\s+packets? transmitted,\s*(\d+)\s+(?:packets? )?received.*?(\d+(?:\.\d+)?)%\s*packet loss/i,
  );
  const average = pingOutput.match(
    /=\s*[\d.]+\/([\d.]+)\/[\d.]+(?:\/[\d.]+)?\s*ms/i,
  );
  const ping = packet
    ? {
        transmitted: safeNumber(packet[1]),
        received: safeNumber(packet[2]),
        lossPercent: safeNumber(packet[3]),
        averageMs: average ? safeNumber(average[1]) : null,
      }
    : null;
  const dnsReachable = !dnsOutput
    ? null
    : !/(connection refused|server can't find|not found|failed|timed out|no servers could be reached)/i.test(
        dnsOutput,
      ) && /(?:address|name):/i.test(dnsOutput);
  return {
    disks,
    temperaturesC: [...new Set(temperaturesC)],
    ping,
    dnsReachable,
  };
}

export function buildRouterLogCommand(
  category: RouterLogCategory,
  limit = 160,
  filter = "",
) {
  const safeLimit = safeLogLimit(limit, 160);
  const query = filter.trim();
  if (query.length > 80 || /[\r\n]/.test(query))
    throw new Error("日志筛选词最多 80 个字符，且不能包含换行。");
  const base = LOG_BASE_COMMANDS[category];
  const filterCommand = query ? ` | grep -F -- ${shellQuote(query)}` : "";
  return `(${base}) 2>&1${filterCommand} | tail -n ${safeLimit}`;
}

export function parseRouterLogLines(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

export function buildFirewallSnapshotCommand() {
  return "printf '__FIREWALL__\\n'; uci show firewall 2>/dev/null; printf '__UPNP__\\n'; if [ -x /etc/init.d/miniupnpd ]; then if /etc/init.d/miniupnpd status >/dev/null 2>&1 || pgrep -x miniupnpd >/dev/null 2>&1; then running=running; else running=stopped; fi; enabled=$(uci -q get miniupnpd.config.enabled 2>/dev/null || echo 0); echo \"UPNP|installed|$running|$enabled\"; else echo 'UPNP|missing|stopped|0'; fi";
}

type UciSection = { type: string; values: Map<string, string[]> };

function readFirewallSections(output: string) {
  const sections = new Map<string, UciSection>();
  let firewallSection = false;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "__FIREWALL__") {
      firewallSection = true;
      continue;
    }
    if (line === "__UPNP__") {
      firewallSection = false;
      continue;
    }
    if (!firewallSection) continue;
    const match = line.match(
      /^firewall\.((?:@)?[A-Za-z0-9_-]+(?:\[\d+\])?)(?:\.([A-Za-z0-9_]+))?=(.*)$/,
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

function firstValue(
  section: UciSection,
  property: string,
  fallback = "未设置",
) {
  return section.values.get(property)?.[0] || fallback;
}

export function parseFirewallSnapshot(output: string): FirewallSnapshot {
  const sections = readFirewallSections(output);
  const zones: FirewallZone[] = [];
  const forwardings: FirewallForwarding[] = [];
  const trafficRules: FirewallTrafficRule[] = [];
  const portForwards: PortForwardRule[] = [];
  for (const [section, value] of sections) {
    if (value.type === "zone") {
      zones.push({
        section,
        name: firstValue(value, "name", section),
        networks: value.values.get("network") ?? [],
        input: firstValue(value, "input"),
        output: firstValue(value, "output"),
        forward: firstValue(value, "forward"),
      });
    }
    if (value.type === "redirect") {
      portForwards.push({
        section,
        name: firstValue(value, "name", section),
        sourceZone: firstValue(value, "src"),
        destinationZone: firstValue(value, "dest"),
        destinationIp: firstValue(value, "dest_ip"),
        sourcePort: firstValue(value, "src_dport"),
        destinationPort: firstValue(value, "dest_port"),
        protocol: firstValue(value, "proto", "tcp udp"),
        enabled: firstValue(value, "enabled", "1") !== "0",
      });
    }
    if (value.type === "forwarding") {
      forwardings.push({
        section,
        sourceZone: firstValue(value, "src"),
        destinationZone: firstValue(value, "dest"),
        enabled: firstValue(value, "enabled", "1") !== "0",
      });
    }
    if (value.type === "rule") {
      const target = firstValue(value, "target", "ACCEPT").toUpperCase();
      if (!["ACCEPT", "REJECT", "DROP"].includes(target)) continue;
      trafficRules.push({
        section,
        name: firstValue(value, "name", section),
        sourceZone: firstValue(value, "src", "任意"),
        destinationZone: firstValue(value, "dest", "任意"),
        protocol: firstValue(value, "proto", "任意"),
        sourceIp: firstValue(value, "src_ip", ""),
        destinationIp: firstValue(value, "dest_ip", ""),
        sourcePort: firstValue(value, "src_port", ""),
        destinationPort: firstValue(value, "dest_port", ""),
        target: target as FirewallTrafficRule["target"],
        enabled: firstValue(value, "enabled", "1") !== "0",
      });
    }
  }
  const upnpMatch = output.match(
    /^UPNP\|(installed|missing)\|(running|stopped)\|([^\r\n|]+)$/m,
  );
  return {
    zones: zones.sort((a, b) => a.name.localeCompare(b.name)),
    forwardings: forwardings.sort((a, b) =>
      `${a.sourceZone}:${a.destinationZone}`.localeCompare(
        `${b.sourceZone}:${b.destinationZone}`,
      ),
    ),
    trafficRules: trafficRules.sort((a, b) => a.name.localeCompare(b.name)),
    portForwards: portForwards.sort((a, b) => a.name.localeCompare(b.name)),
    upnp: {
      installed: upnpMatch?.[1] === "installed",
      running: upnpMatch?.[2] === "running",
      enabled: upnpMatch?.[3] === "1",
    },
  };
}

export function buildFirewallForwardingToggleCommand(
  section: string,
  enabled: boolean,
) {
  const safeSection = requireFirewallSection(section);
  return `uci set firewall.${safeSection}.enabled='${enabled ? "1" : "0"}'; uci commit firewall; /etc/init.d/firewall reload`;
}

export function buildFirewallRuleToggleCommand(
  section: string,
  enabled: boolean,
) {
  const safeSection = requireFirewallSection(section);
  return `uci set firewall.${safeSection}.enabled='${enabled ? "1" : "0"}'; uci commit firewall; /etc/init.d/firewall reload`;
}

export function buildFirewallRuleDeleteCommand(section: string) {
  const safeSection = requireFirewallSection(section);
  return `uci -q delete firewall.${safeSection}; uci commit firewall; /etc/init.d/firewall reload`;
}

export function buildFirewallRuleCreateCommand(
  draft: FirewallTrafficRuleDraft,
) {
  const name = draft.name.trim();
  if (!name || name.length > 48 || /[\r\n]/.test(name))
    throw new Error("规则名称应为 1–48 个字符，且不能包含换行。");
  const sourceZone = draft.sourceZone.trim()
    ? requireIdentifier(draft.sourceZone, "来源区域")
    : "";
  const destinationZone = draft.destinationZone.trim()
    ? requireIdentifier(draft.destinationZone, "目标区域")
    : "";
  if (!["tcp", "udp", "tcp udp"].includes(draft.protocol))
    throw new Error("通信协议无效。");
  if (!["ACCEPT", "REJECT", "DROP"].includes(draft.target))
    throw new Error("通信规则目标无效。");
  const optionalPort = (value: string, label: string) =>
    value.trim() ? requirePortSpec(value, label) : "";
  const sourcePort = optionalPort(draft.sourcePort, "来源端口");
  const destinationPort = optionalPort(draft.destinationPort, "目标端口");
  const optionalIp = (value: string, label: string) => {
    const normalized = value.trim();
    if (!normalized) return "";
    if (!/^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/.test(normalized))
      throw new Error(`${label}必须为 IPv4 或 CIDR。`);
    const [ip, mask] = normalized.split("/");
    requireIpv4(ip);
    if (mask !== undefined && (Number(mask) < 0 || Number(mask) > 32))
      throw new Error(`${label}CIDR 范围应为 0–32。`);
    return normalized;
  };
  const sourceIp = optionalIp(draft.sourceIp, "来源地址");
  const destinationIp = optionalIp(draft.destinationIp, "目标地址");
  const section = `openwrt_app_rule_${Date.now().toString(36)}`;
  const values = [
    `uci set firewall.${section}='rule'`,
    `uci set firewall.${section}.name=${shellQuote(name)}`,
    `uci set firewall.${section}.proto=${shellQuote(draft.protocol)}`,
    `uci set firewall.${section}.target=${shellQuote(draft.target)}`,
    `uci set firewall.${section}.enabled='1'`,
    sourceZone
      ? `uci set firewall.${section}.src=${shellQuote(sourceZone)}`
      : `uci -q delete firewall.${section}.src`,
    destinationZone
      ? `uci set firewall.${section}.dest=${shellQuote(destinationZone)}`
      : `uci -q delete firewall.${section}.dest`,
    sourceIp
      ? `uci set firewall.${section}.src_ip=${shellQuote(sourceIp)}`
      : `uci -q delete firewall.${section}.src_ip`,
    destinationIp
      ? `uci set firewall.${section}.dest_ip=${shellQuote(destinationIp)}`
      : `uci -q delete firewall.${section}.dest_ip`,
    sourcePort
      ? `uci set firewall.${section}.src_port=${shellQuote(sourcePort)}`
      : `uci -q delete firewall.${section}.src_port`,
    destinationPort
      ? `uci set firewall.${section}.dest_port=${shellQuote(destinationPort)}`
      : `uci -q delete firewall.${section}.dest_port`,
    "uci commit firewall",
    "/etc/init.d/firewall reload",
  ];
  return values.join("; ");
}

export function buildPortForwardToggleCommand(
  section: string,
  enabled: boolean,
) {
  const safeSection = requireFirewallSection(section);
  return `uci set firewall.${safeSection}.enabled='${enabled ? "1" : "0"}'; uci commit firewall; /etc/init.d/firewall reload`;
}

export function buildPortForwardDeleteCommand(section: string) {
  const safeSection = requireFirewallSection(section);
  return `uci -q delete firewall.${safeSection}; uci commit firewall; /etc/init.d/firewall reload`;
}

export function buildPortForwardCreateCommand(draft: PortForwardDraft) {
  const name = draft.name.trim();
  if (!name || name.length > 48 || /[\r\n]/.test(name))
    throw new Error("规则名称应为 1–48 个字符，且不能包含换行。");
  const sourceZone = requireIdentifier(draft.sourceZone, "来源区域");
  const destinationZone = requireIdentifier(draft.destinationZone, "目标区域");
  const destinationIp = requireIpv4(draft.destinationIp);
  const sourcePort = requirePortSpec(draft.sourcePort, "外部端口");
  const destinationPort = requirePortSpec(draft.destinationPort, "内部端口");
  if (!["tcp", "udp", "tcp udp"].includes(draft.protocol))
    throw new Error("端口协议无效。");
  const section = `openwrt_app_pf_${Date.now().toString(36)}`;
  return `uci set firewall.${section}='redirect'; uci set firewall.${section}.name=${shellQuote(name)}; uci set firewall.${section}.src=${shellQuote(sourceZone)}; uci set firewall.${section}.dest=${shellQuote(destinationZone)}; uci set firewall.${section}.proto=${shellQuote(draft.protocol)}; uci set firewall.${section}.src_dport=${shellQuote(sourcePort)}; uci set firewall.${section}.dest_ip=${shellQuote(destinationIp)}; uci set firewall.${section}.dest_port=${shellQuote(destinationPort)}; uci set firewall.${section}.target='DNAT'; uci set firewall.${section}.enabled='1'; uci commit firewall; /etc/init.d/firewall reload`;
}

export function buildUpnpActionCommand(action: ManagedAction) {
  return `[ -x /etc/init.d/miniupnpd ] || { echo 'UPnP 服务未安装。'; exit 2; }; /etc/init.d/miniupnpd ${action}`;
}

export function buildBatchRouterDiagnosticCommand() {
  return "printf '__PING__\\n'; ping -c 2 -W 2 1.1.1.1 2>&1; printf '__DNS__\\n'; nslookup openwrt.org 127.0.0.1 2>&1; printf '__UPTIME__\\n'; uptime 2>&1";
}

export function buildBatchConfigBackupCommand(batchId: string) {
  const safeId = requireIdentifier(batchId, "备份批次");
  const remotePath = `/tmp/openwrt-app-${safeId}.tar.gz`;
  return {
    remotePath,
    command: `rm -f ${shellQuote(remotePath)}; sysupgrade -b ${shellQuote(remotePath)}; test -s ${shellQuote(remotePath)} && echo 'BACKUP_READY'`,
  };
}

function markdownValue(value: string | null | undefined) {
  return value && value.trim() ? value.replace(/[|\r\n]/g, " ") : "未报告";
}

export function buildRouterHealthReportMarkdown(
  profile: RouterProfile,
  status: RouterStatus | null,
  health: RouterHealthSnapshot | null,
  services: ProxyServiceState[] = [],
) {
  const system = status?.system ?? null;
  const memoryPercent = memoryUsagePercent(system);
  const disks = health?.disks.length
    ? health.disks
        .map(
          (disk) =>
            `${disk.mount}: ${disk.usePercent ?? "—"}%（可用 ${disk.availableKb === null ? "—" : formatBytes(disk.availableKb * 1024)}）`,
        )
        .join("；")
    : "未报告";
  const temperature = health?.temperaturesC.length
    ? health.temperaturesC.map((value) => `${value} °C`).join("、")
    : "未报告";
  const ping = health?.ping
    ? `${health.ping.lossPercent ?? "—"}% 丢包，平均 ${health.ping.averageMs ?? "—"} ms`
    : "未报告";
  const servicesText = services.length
    ? services
        .map(
          (service) =>
            `${service.label}：${service.installed ? (service.running ? "运行中" : "已停止") : "未安装"}`,
        )
        .join("；")
    : "未检测";
  return `# ${markdownValue(profile.name)} 健康报告\n\n生成时间：${new Date().toLocaleString("zh-CN")}\n\n## 系统\n\n| 指标 | 状态 |\n|---|---|\n| 路由器 | ${markdownValue(system?.hostname)} |\n| 型号 | ${markdownValue(system?.model)} |\n| 固件 | ${markdownValue(system?.firmware)} |\n| 运行时间 | ${formatUptime(system?.uptimeSeconds ?? null)} |\n| 系统负载 | ${formatLoad(system?.load ?? null)} |\n| 内存使用 | ${memoryPercent === null ? "未报告" : `${memoryPercent}%`} |\n| 存储 | ${disks} |\n| 温度 | ${temperature} |\n\n## 网络\n\n| 指标 | 状态 |\n|---|---|\n| 公网连通性（1.1.1.1） | ${ping} |\n| 本地 DNS 解析 | ${health?.dnsReachable === null || health?.dnsReachable === undefined ? "未报告" : health.dnsReachable ? "正常" : "失败"} |\n| 在线接口 | ${status?.interfaces.filter((item) => item.up).length ?? 0}/${status?.interfaces.length ?? 0} |\n\n## 服务\n\n${servicesText}\n`;
}
