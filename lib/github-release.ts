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
  const isRepositoryRelease = segments.length === 3;
  const isTaggedRelease = segments.length === 5 && segments[3] === "tag" && /^[A-Za-z0-9_.-]+$/.test(segments[4]);
  if ((!isRepositoryRelease && !isTaggedRelease) || segments[2] !== "releases" || !/^[A-Za-z0-9_.-]+$/.test(segments[0]) || !/^[A-Za-z0-9_.-]+$/.test(segments[1])) {
    throw releaseUrlError();
  }
  return { owner: segments[0], repository: segments[1], tagName: isTaggedRelease ? segments[4] : null };
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

function parseGithubRelease(owner: string, repository: string, payload: unknown): GithubRelease | null {
  if (!payload || typeof payload !== "object") return null;
  const item = payload as Record<string, unknown>;
  const tagName = stringValue(item.tag_name);
  const htmlUrl = safeDownloadUrl(item.html_url);
  if (!tagName || !htmlUrl) return null;
  const assets = Array.isArray(item.assets) ? item.assets.flatMap((asset) => {
    if (!asset || typeof asset !== "object") return [];
    const entry = asset as Record<string, unknown>;
    const id = Number(entry.id);
    const name = stringValue(entry.name);
    const downloadUrl = safeDownloadUrl(entry.browser_download_url);
    const size = Number(entry.size);
    if (!Number.isInteger(id) || !name || !downloadUrl || !Number.isFinite(size) || size < 0) return [];
    return [{ id, name, size, downloadUrl, contentType: stringValue(entry.content_type), firmwareCandidate: isFirmwareCandidate(name) }];
  }) : [];
  return { owner, repository, tagName, name: stringValue(item.name), publishedAt: stringValue(item.published_at), body: stringValue(item.body), htmlUrl, assets };
}

function githubApiUrl(owner: string, repository: string, path: string) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}${path}`;
}

const githubHeaders = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

/**
 * Enumerates every public Release page exposed by the GitHub API.  GitHub
 * returns a maximum of 100 entries per page, so keep requesting pages until
 * a short page is reached instead of silently hiding older firmware tags.
 */
export async function fetchGithubReleases(sourceUrl: string): Promise<GithubRelease[]> {
  const { owner, repository } = parseGithubReleaseUrl(sourceUrl);
  const releases: GithubRelease[] = [];
  const seenTags = new Set<string>();
  let page = 1;

  while (true) {
    const response = await fetch(githubApiUrl(owner, repository, `/releases?per_page=100&page=${page}`), { headers: githubHeaders });
    if (response.status === 404) throw new Error("未找到公开的 Release。请确认链接正确且仓库公开。");
    if (!response.ok) throw new Error(`GitHub 标签查询失败（HTTP ${response.status}）。`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("GitHub Release 返回的数据格式不正确。");

    for (const entry of payload) {
      const release = parseGithubRelease(owner, repository, entry);
      if (release && !seenTags.has(release.tagName)) {
        seenTags.add(release.tagName);
        releases.push(release);
      }
    }

    if (payload.length < 100) break;
    page += 1;
  }

  if (!releases.length) throw new Error("未找到公开的 Release 标签。请确认仓库已发布 Release。");
  return releases;
}

export async function fetchLatestGithubRelease(sourceUrl: string): Promise<GithubRelease> {
  const { owner, repository, tagName: requestedTag } = parseGithubReleaseUrl(sourceUrl);
  const releasePath = requestedTag
    ? `/releases/tags/${encodeURIComponent(requestedTag)}`
    : "/releases/latest";
  const response = await fetch(githubApiUrl(owner, repository, releasePath), { headers: githubHeaders });
  if (response.status === 404) throw new Error(requestedTag ? `未找到公开的 Release 标签“${requestedTag}”。请确认链接、标签名称和仓库可见性。` : "未找到公开的最新 Release。请确认链接正确、仓库公开且已发布非预发行版本。");
  if (!response.ok) throw new Error(`GitHub 版本查询失败（HTTP ${response.status}）。`);
  const release = parseGithubRelease(owner, repository, await response.json());
  if (!release) throw new Error("GitHub Release 返回的数据不完整。");
  return release;
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
