import type { RouterProfile } from "../shared/router-types";

function getEndpointHost(baseUrl: string) {
  const withProtocol = /^https?:\/\//i.test(baseUrl) ? baseUrl : `http://${baseUrl}`;
  try {
    const hostname = new URL(withProtocol).hostname;
    if (!hostname) throw new Error("missing hostname");
    return hostname.startsWith("[") || hostname.endsWith("]")
      ? hostname
      : hostname.includes(":")
        ? `[${hostname}]`
        : hostname;
  } catch {
    throw new Error("无法从 LuCI 管理地址识别 SSH 主机。");
  }
}

export function getSshTarget(profile: RouterProfile) {
  const port = profile.sshPort ?? 22;
  return `${profile.username}@${getEndpointHost(profile.baseUrl)}:${port}`;
}

export function makeSshUri(profile: RouterProfile) {
  const port = profile.sshPort ?? 22;
  return `ssh://${encodeURIComponent(profile.username)}@${getEndpointHost(profile.baseUrl)}:${port}`;
}
