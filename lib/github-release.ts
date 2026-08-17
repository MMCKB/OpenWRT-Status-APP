export interface GithubReleaseAsset {
  id: number;
  name: string;
  size: number;
  downloadUrl: string;
  contentType: string | null;
  firmwareCandidate: boolean;
}

export interface GithubRelease {
  owner: string;
  repository: string;
  tagName: string;
  name: string | null;
  publishedAt: string | null;
  body: string | null;
  htmlUrl: string;
  assets: GithubReleaseAsset[];
}

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const DOWNLOAD_HOSTS = new Set(["github.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com"]);

function releaseUrlError() {
  return new Error("请填写 GitHub 仓库的 Release 链接，例如 https://github.com/owner/repository/releases");
}

export function parseGithubReleaseUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw releaseUrlError();
  }
  if (parsed.protocol !== "https:" || !GITHUB_HOSTS.has(parsed.hostname.toLowerCase())) throw releaseUrlError();
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 3 || segments[2] !== "releases" || !/^[A-Za-z0-9_.-]+$/.test(segments[0]) || !/^[A-Za-z0-9_.-]+$/.test(segments[1])) {
    throw releaseUrlError();
  }
  return { owner: segments[0], repository: segments[1] };
}

function isFirmwareCandidate(name: string) {
  return /(?:sysupgrade|factory|firmware|openwrt).*(?:\.bin|\.img|\.itb|\.squashfs|\.gz|\.zip)$/i.test(name)
    || /(?:\.bin|\.img|\.itb|\.squashfs)$/i.test(name);
}

function safeDownloadUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && DOWNLOAD_HOSTS.has(parsed.hostname.toLowerCase()) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function fetchLatestGithubRelease(sourceUrl: string): Promise<GithubRelease> {
  const { owner, repository } = parseGithubReleaseUrl(sourceUrl);
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (response.status === 404) throw new Error("未找到公开的最新 Release。请确认链接正确、仓库公开且已发布非预发行版本。");
  if (!response.ok) throw new Error(`GitHub 版本查询失败（HTTP ${response.status}）。`);
  const payload = await response.json() as Record<string, unknown>;
  const tagName = stringValue(payload.tag_name);
  const htmlUrl = safeDownloadUrl(payload.html_url);
  if (!tagName || !htmlUrl) throw new Error("GitHub Release 返回的数据不完整。");
  const assets = Array.isArray(payload.assets) ? payload.assets.flatMap((asset) => {
    if (!asset || typeof asset !== "object") return [];
    const item = asset as Record<string, unknown>;
    const id = Number(item.id);
    const name = stringValue(item.name);
    const downloadUrl = safeDownloadUrl(item.browser_download_url);
    const size = Number(item.size);
    if (!Number.isInteger(id) || !name || !downloadUrl || !Number.isFinite(size) || size < 0) return [];
    return [{ id, name, size, downloadUrl, contentType: stringValue(item.content_type), firmwareCandidate: isFirmwareCandidate(name) }];
  }) : [];
  return { owner, repository, tagName, name: stringValue(payload.name), publishedAt: stringValue(payload.published_at), body: stringValue(payload.body), htmlUrl, assets };
}

function versionNumbers(value: string) {
  return value.toLowerCase().replace(/^v/, "").match(/\d+/g)?.map(Number) ?? [];
}

export function compareReleaseVersion(current: string | null | undefined, latestTag: string) {
  if (!current?.trim() || !latestTag.trim()) return null;
  const left = versionNumbers(current);
  const right = versionNumbers(latestTag);
  if (!left.length || !right.length) return null;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (right[index] ?? 0) - (left[index] ?? 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}
