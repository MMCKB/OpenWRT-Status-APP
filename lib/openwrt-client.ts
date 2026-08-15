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

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function mapInterfaces(payload: unknown): InterfaceStatus[] {
  const root = asRecord(payload);
  const candidates = root.interface ?? root.interfaces ?? payload;
  if (!Array.isArray(candidates)) return [];
  return candidates.map((entry, index) => {
    const item = asRecord(entry);
    const rawName = item.interface ?? item.name;
    const device = asRecord(item.l3_device).name ?? item.l3_device ?? item.device;
    return {
      name: asString(rawName, `接口 ${index + 1}`),
      device: asString(device, "未报告"),
      up: item.up === true,
      ipv4: asStringArray(item["ipv4-address"] ?? item.ipv4),
      uptimeSeconds: asNumber(item.uptime),
    };
  });
}

function mapWireless(payload: unknown): WirelessStatus[] {
  const radios = asRecord(payload);
  return Object.entries(radios).flatMap(([radioName, radioValue]) => {
    const radio = asRecord(radioValue);
    const interfaces = Array.isArray(radio.interfaces) ? radio.interfaces : [];
    return interfaces.map((entry, index) => {
      const item = asRecord(entry);
      const config = asRecord(item.config);
      const assoclist = asRecord(item.assoclist);
      return {
        name: asString(item.ifname ?? item.name, `${radioName} · ${index + 1}`),
        ssid: asString(config.ssid, "未广播 SSID"),
        up: item.up === true || radio.up === true,
        channel: asString(item.channel ?? radio.channel, "自动"),
        clients: Object.keys(assoclist).length || null,
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
    interfaces: mapInterfaces(interfacesPayload),
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
  ]);
  const warnings: string[] = [];
  const [interfaces, wireless] = optional.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    warnings.push(index === 0 ? "网络接口状态暂不可用。" : "无线状态暂不可用。");
    return {};
  });
  return buildRouterStatus(routerId, required[0], required[1], interfaces, wireless, warnings);
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
