import type {
  InterfaceStatus,
  RouterStatus,
  SystemStatus,
  WirelessStatus,
} from "../shared/router-types";

type UnknownRecord = Record<string, unknown>;

export class OpenWrtConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenWrtConnectionError";
  }
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asDisplayValue(value: unknown, fallback = "—") {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asCounter(value: unknown): number | null {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : asNumber(value);
  return parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isDefined(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function asBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on", "up", "active", "enabled", "running"].includes(value.trim().toLowerCase());
}

function firstDefined(...values: unknown[]) {
  return values.find(isDefined);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : asRecord(item).address))
    .filter((item): item is string => typeof item === "string" && item.length > 0);
}

function normalizeLoad(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const samples = value.slice(0, 3).map(asNumber);
  if (samples.some((sample) => sample === null)) return null;
  return samples.map((sample) => {
    const numericSample = sample ?? 0;
    return numericSample > 100 ? numericSample / 65535 : numericSample;
  }) as [number, number, number];
}

export function normalizeRouterEndpoint(value: string) {
  const input = value.trim().replace(/\/+$/, "");
  if (!input) throw new OpenWrtConnectionError("请输入路由器地址。");
  const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new OpenWrtConnectionError("路由器地址格式不正确。");
  }
  if (parsed.pathname === "/" || !parsed.pathname) {
    parsed.pathname = "/ubus";
  } else if (!parsed.pathname.endsWith("/ubus")) {
    parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/ubus`;
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

async function ubusCall<T>(
  endpoint: string,
  token: string,
  object: string,
  method: string,
  params: UnknownRecord,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "call",
        params: [token, object, method, params],
      }),
    });
  } catch {
    throw new OpenWrtConnectionError("无法访问路由器。请确认手机已连接到对应局域网且地址可用。");
  }

  if (!response.ok) {
    throw new OpenWrtConnectionError(`路由器返回 HTTP ${response.status}。`);
  }

  let body: UnknownRecord;
  try {
    body = asRecord(await response.json());
  } catch {
    throw new OpenWrtConnectionError("路由器返回了无法识别的响应。");
  }
  const result = body.result;
  if (!Array.isArray(result) || result[0] !== 0) {
    throw new OpenWrtConnectionError("路由器拒绝了请求；请检查 LuCI 用户名和密码。");
  }
  return (result[1] ?? {}) as T;
}

async function login(endpoint: string, username: string, password: string) {
  const data = await ubusCall<UnknownRecord>(endpoint, "00000000000000000000000000000000", "session", "login", {
    username,
    password,
  });
  const token = data.ubus_rpc_session;
  if (typeof token !== "string" || token.length === 0) {
    throw new OpenWrtConnectionError("未能创建 LuCI 会话；请检查账户权限。");
  }
  return token;
}

function mapDeviceCounters(payload: unknown) {
  const root = asRecord(payload);
  const devices = asRecord(root.devices ?? root.device ?? payload);
  return new Map(Object.entries(devices).map(([name, rawDevice]) => {
    const device = asRecord(rawDevice);
    const statistics = asRecord(device.statistics ?? device.stats);
    return [name, {
      rxBytes: asCounter(statistics.rx_bytes ?? device.rx_bytes ?? device.rxBytes),
      txBytes: asCounter(statistics.tx_bytes ?? device.tx_bytes ?? device.txBytes),
    }] as const;
  }));
}

function mapInterfaces(payload: unknown, deviceCountersPayload: unknown = {}): InterfaceStatus[] {
  const root = asRecord(payload);
  const candidates = root.interface ?? root.interfaces ?? payload;
  if (!Array.isArray(candidates)) return [];
  const deviceCounters = mapDeviceCounters(deviceCountersPayload);
  return candidates.map((entry, index) => {
    const item = asRecord(entry);
    const rawName = item.interface ?? item.name;
    const device = asRecord(item.l3_device).name ?? item.l3_device ?? item.device;
    const deviceName = asString(device, "未报告");
    const statistics = asRecord(item.statistics ?? item.stats);
    const counters = deviceCounters.get(deviceName);
    return {
      name: asString(rawName, `接口 ${index + 1}`),
      device: deviceName,
      up: item.up === true,
      ipv4: asStringArray(item["ipv4-address"] ?? item.ipv4),
      ipv6: asStringArray(item["ipv6-address"] ?? item.ipv6),
      uptimeSeconds: asNumber(item.uptime),
      rxBytes: asCounter(statistics.rx_bytes ?? item.rx_bytes ?? item.rxBytes) ?? counters?.rxBytes ?? null,
      txBytes: asCounter(statistics.tx_bytes ?? item.tx_bytes ?? item.txBytes) ?? counters?.txBytes ?? null,
    };
  });
}

function mapWireless(payload: unknown): WirelessStatus[] {
  const root = asRecord(payload);
  const candidates = [root.radios, root.wireless, root.radio, payload];
  const radios = candidates.find((candidate) => {
    if (Array.isArray(candidate)) return candidate.length > 0;
    return Object.keys(asRecord(candidate)).length > 0;
  }) ?? payload;
  const radioEntries = Array.isArray(radios)
    ? radios.map((value, index) => [`radio${index}`, value] as const)
    : Object.entries(asRecord(radios));

  return radioEntries.flatMap(([radioName, radioValue]) => {
    const radio = asRecord(radioValue);
    const rawInterfaces = radio.interfaces ?? radio.interface;
    const interfaces = Array.isArray(rawInterfaces)
      ? rawInterfaces
      : Object.values(asRecord(rawInterfaces));
    const entries = interfaces.length ? interfaces : [radio];
    const radioConfig = asRecord(radio.config);
    return entries.map((entry, index) => {
      const item = asRecord(entry);
      const config = asRecord(item.config);
      const assoclist = asRecord(item.assoclist);
      const stations = Array.isArray(item.stations) ? item.stations : Array.isArray(item.clients) ? item.clients : [];
      const disabled = asBoolean(firstDefined(item.disabled, config.disabled, radio.disabled, radioConfig.disabled));
      const reportedState = firstDefined(
        item.up,
        item.state,
        item.status,
        item.enabled,
        radio.up,
        radio.state,
        radio.status,
        radio.enabled,
      );
      const hasWirelessConfig = Boolean(config.ssid ?? item.ssid ?? radioConfig.ssid ?? radioConfig.mode);
      return {
        name: asString(item.ifname ?? item.name, `${radioName} · ${index + 1}`),
        ssid: asString(config.ssid ?? item.ssid ?? radioConfig.ssid, "未广播 SSID"),
        up: !disabled && (isDefined(reportedState) ? asBoolean(reportedState) : hasWirelessConfig),
        channel: asDisplayValue(item.channel ?? radio.channel ?? radioConfig.channel, "自动"),
        clients: stations.length || Object.keys(assoclist).length || null,
      };
    });
  });
}

export function buildRouterStatus(
  routerId: string,
  boardPayload: unknown,
  infoPayload: unknown,
  interfacesPayload: unknown,
  wirelessPayload: unknown,
  warnings: string[] = [],
  deviceCountersPayload: unknown = {},
): RouterStatus {
  const board = asRecord(boardPayload);
  const info = asRecord(infoPayload);
  const memory = asRecord(info.memory);
  const total = asNumber(memory.total);
  const availableParts = [memory.free, memory.buffered, memory.cached]
    .map(asNumber)
    .filter((item): item is number => item !== null);
  const system: SystemStatus = {
    hostname: asString(board.hostname),
    model: asString(board.model ?? board.system),
    firmware: asString(asRecord(board.release).description ?? board.release),
    uptimeSeconds: asNumber(info.uptime),
    load: normalizeLoad(info.load),
    memoryTotal: total,
    memoryAvailable: total === null ? null : availableParts.reduce((sum, item) => sum + item, 0),
  };
  return {
    routerId,
    online: true,
    fetchedAt: new Date().toISOString(),
    system,
    interfaces: mapInterfaces(interfacesPayload, deviceCountersPayload),
    wireless: mapWireless(wirelessPayload),
    warnings,
  };
}

export async function fetchRouterStatus(
  routerId: string,
  rawEndpoint: string,
  username: string,
  password: string,
): Promise<RouterStatus> {
  const endpoint = normalizeRouterEndpoint(rawEndpoint);
  const token = await login(endpoint, username, password);
  const required = await Promise.all([
    ubusCall(endpoint, token, "system", "board", {}),
    ubusCall(endpoint, token, "system", "info", {}),
  ]);
  const optional = await Promise.allSettled([
    ubusCall(endpoint, token, "network.interface", "dump", {}),
    ubusCall(endpoint, token, "network.wireless", "status", {}),
    ubusCall(endpoint, token, "network.device", "status", {}),
  ]);
  const warnings: string[] = [];
  const interfaces = optional[0].status === "fulfilled" ? optional[0].value : {};
  if (optional[0].status === "rejected") warnings.push("网络接口状态暂不可用。");
  const wireless = optional[1].status === "fulfilled" ? optional[1].value : {};
  if (optional[1].status === "rejected") warnings.push("无线状态暂不可用。");
  const deviceCounters = optional[2].status === "fulfilled" ? optional[2].value : {};
  return buildRouterStatus(routerId, required[0], required[1], interfaces, wireless, warnings, deviceCounters);
}

/** Fetches only the interface counters needed by the status-page traffic chart. */
export async function fetchRouterTraffic(
  rawEndpoint: string,
  username: string,
  password: string,
): Promise<{ interfaces: InterfaceStatus[]; fetchedAt: string }> {
  const endpoint = normalizeRouterEndpoint(rawEndpoint);
  const token = await login(endpoint, username, password);
  const [interfaces, devices] = await Promise.all([
    ubusCall(endpoint, token, "network.interface", "dump", {}),
    ubusCall(endpoint, token, "network.device", "status", {}).catch(() => ({})),
  ]);
  return { interfaces: mapInterfaces(interfaces, devices), fetchedAt: new Date().toISOString() };
}

export function formatBytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "未报告";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

export function formatUptime(seconds: number | null) {
  if (seconds === null || seconds < 0) return "未报告";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

export function formatLoad(load: [number, number, number] | null) {
  return load ? load.map((item) => item.toFixed(2)).join(" · ") : "未报告";
}

export function memoryUsagePercent(system: SystemStatus | null) {
  if (!system?.memoryTotal || system.memoryAvailable === null) return null;
  return Math.max(0, Math.min(100, Math.round(((system.memoryTotal - system.memoryAvailable) / system.memoryTotal) * 100)));
}
