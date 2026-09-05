/**
 * AdGuard Home HTTP API 客户端(/control 前缀,Basic 认证)。
 */

export interface AdGuardCredentials {
  baseUrl: string;
  username: string;
  password: string;
}

export interface AdGuardStatus {
  running: boolean;
  protectionEnabled: boolean;
  version: string;
}

export interface AdGuardStats {
  numDnsQueries: number;
  numBlockedFiltering: number;
  numReplacedFiltering: number;
  avgProcessingTimeMs: number | null;
  topQueriedDomains: Array<[string, number]>;
  topBlockedDomains: Array<[string, number]>;
}

const DEFAULT_TIMEOUT_MS = 8000;

/** 归一化 AGH 地址:补协议、补 /control 前缀、去尾斜杠。 */
export function normalizeAdGuardBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("请填写 AdGuard Home 地址。");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("AdGuard Home 地址必须使用 HTTP 或 HTTPS。");
  }
  const base = parsed.origin;
  const path = parsed.pathname.replace(/\/+$/, "");
  return path.endsWith("/control") ? `${base}${path}` : `${base}${path}/control`;
}

/** 从路由器地址推导默认 AGH 地址(http://路由器IP:3000/control)。 */
export function defaultAdGuardBaseUrl(routerBaseUrl: string): string {
  try {
    const host = new URL(
      /^https?:\/\//i.test(routerBaseUrl) ? routerBaseUrl : `http://${routerBaseUrl}`,
    ).hostname;
    return `http://${host}:3000/control`;
  } catch {
    return "http://192.168.1.1:3000/control";
  }
}

function buildHeaders(credentials: AdGuardCredentials): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (credentials.username.trim() || credentials.password) {
    const raw = `${credentials.username}:${credentials.password}`;
    headers.Authorization = `Basic ${btoa(unescape(encodeURIComponent(raw)))}`;
  }
  return headers;
}

async function adguardFetch(
  credentials: AdGuardCredentials,
  path: string,
): Promise<unknown> {
  const baseUrl = normalizeAdGuardBaseUrl(credentials.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: buildHeaders(credentials),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error("AdGuard Home 鉴权失败,请检查用户名与密码。");
    }
    if (!response.ok) {
      throw new Error(`AdGuard Home API 返回 HTTP ${response.status}。`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AdGuard Home 请求超时,请确认地址与端口可达。");
    }
    if (error instanceof TypeError) {
      throw new Error("无法连接 AdGuard Home,请确认地址与端口设置。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAdGuardStatus(credentials: AdGuardCredentials): Promise<AdGuardStatus> {
  const payload = (await adguardFetch(credentials, "/status")) as {
    running?: boolean;
    protection_enabled?: boolean;
    version?: string;
  };
  return {
    running: payload?.running === true,
    protectionEnabled: payload?.protection_enabled === true,
    version: payload?.version ?? "",
  };
}

export async function fetchAdGuardStats(credentials: AdGuardCredentials): Promise<AdGuardStats> {
  const payload = (await adguardFetch(credentials, "/stats")) as {
    num_dns_queries?: number;
    num_blocked_filtering?: number;
    num_replaced_filtering?: number;
    avg_processing_time?: number;
    top_queried_domains?: Array<[string, number]>;
    top_blocked_domains?: Array<[string, number]>;
  };
  return {
    numDnsQueries: payload?.num_dns_queries ?? 0,
    numBlockedFiltering: payload?.num_blocked_filtering ?? 0,
    numReplacedFiltering: payload?.num_replaced_filtering ?? 0,
    avgProcessingTimeMs:
      typeof payload?.avg_processing_time === "number"
        ? Math.round(payload.avg_processing_time * 1000) / 10
        : null,
    topQueriedDomains: payload?.top_queried_domains ?? [],
    topBlockedDomains: payload?.top_blocked_domains ?? [],
  };
}

export function formatAdGuardCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}
