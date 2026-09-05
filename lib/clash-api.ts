/**
 * Clash RESTful API 客户端(OpenClash 内置 external-controller)。
 * 所有请求均为局域网 HTTP 调用,带超时与中文错误信息。
 */

export interface ClashCredentials {
  baseUrl: string;
  secret: string;
}

export interface ClashProxy {
  name: string;
  type: string;
  now?: string;
  all?: string[];
  udp?: boolean;
  history?: Array<{ time: string; delay: number }>;
}

export interface ClashProxyGroup extends ClashProxy {
  all: string[];
}

export interface ClashConnectionsSummary {
  downloadTotal: number;
  uploadTotal: number;
  activeCount: number;
}

const DEFAULT_TIMEOUT_MS = 8000;

/** 归一化 Clash API 地址:补协议、去尾部斜杠与 /v1. 前缀残留。 */
export function normalizeClashBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("请填写 Clash API 地址。");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Clash API 地址必须使用 HTTP 或 HTTPS。");
  }
  return parsed.origin;
}

/** 从路由器地址推导默认的 Clash API 地址(http://路由器IP:9090)。 */
export function defaultClashBaseUrl(routerBaseUrl: string): string {
  try {
    const host = new URL(
      /^https?:\/\//i.test(routerBaseUrl) ? routerBaseUrl : `http://${routerBaseUrl}`,
    ).hostname;
    return `http://${host}:9090`;
  } catch {
    return "http://192.168.1.1:9090";
  }
}

function buildHeaders(secret: string): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (secret.trim()) headers.Authorization = `Bearer ${secret.trim()}`;
  return headers;
}

async function clashFetch(
  credentials: ClashCredentials,
  path: string,
  init?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<unknown> {
  const baseUrl = normalizeClashBaseUrl(credentials.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        ...buildHeaders(credentials.secret),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error("Clash API 鉴权失败,请检查密钥。");
    }
    if (!response.ok) {
      throw new Error(`Clash API 返回 HTTP ${response.status}。`);
    }
    if (response.status === 204) return {};
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Clash API 请求超时,请确认地址与端口可达。");
    }
    if (error instanceof TypeError) {
      throw new Error("无法连接 Clash API,请确认地址、端口与防火墙设置。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchClashVersion(credentials: ClashCredentials): Promise<string> {
  const payload = (await clashFetch(credentials, "/version")) as { version?: string };
  return payload?.version ?? "未知";
}

export async function fetchClashProxies(
  credentials: ClashCredentials,
): Promise<Record<string, ClashProxy>> {
  const payload = (await clashFetch(credentials, "/proxies")) as {
    proxies?: Record<string, ClashProxy>;
  };
  return payload?.proxies ?? {};
}

/** 过滤出可切换节点的代理组(Selector/Fallback 等)。 */
export function selectClashGroups(proxies: Record<string, ClashProxy>): ClashProxyGroup[] {
  return Object.values(proxies)
    .filter((proxy): proxy is ClashProxyGroup => Array.isArray(proxy.all) && proxy.all.length > 0)
    .filter((proxy) => !/^(direct|reject|compatible|pass)$/i.test(proxy.type))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function fetchClashProxyDelay(
  credentials: ClashCredentials,
  proxyName: string,
  timeoutMs = 5000,
): Promise<number | null> {
  const payload = (await clashFetch(
    credentials,
    `/proxies/${encodeURIComponent(proxyName)}/delay?timeout=${timeoutMs}&url=${encodeURIComponent(
      "https://www.gstatic.com/generate_204",
    )}`,
    { timeoutMs: timeoutMs + 3000 },
  )) as { delay?: number };
  return typeof payload?.delay === "number" ? payload.delay : null;
}

export async function switchClashProxy(
  credentials: ClashCredentials,
  groupName: string,
  proxyName: string,
): Promise<void> {
  await clashFetch(credentials, `/proxies/${encodeURIComponent(groupName)}`, {
    method: "PUT",
    body: { name: proxyName },
  });
}

export async function fetchClashConnections(
  credentials: ClashCredentials,
): Promise<ClashConnectionsSummary> {
  const payload = (await clashFetch(credentials, "/connections", { timeoutMs: 4000 })) as {
    downloadTotal?: number;
    uploadTotal?: number;
    connections?: unknown[];
  };
  return {
    downloadTotal: payload?.downloadTotal ?? 0,
    uploadTotal: payload?.uploadTotal ?? 0,
    activeCount: Array.isArray(payload?.connections) ? payload.connections.length : 0,
  };
}
