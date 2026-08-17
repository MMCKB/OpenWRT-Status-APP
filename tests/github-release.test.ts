import { afterEach, describe, expect, it, vi } from "vitest";

import { compareReleaseVersion, fetchLatestGithubRelease, parseGithubReleaseUrl } from "../lib/github-release";

afterEach(() => vi.unstubAllGlobals());

describe("GitHub Release 固件源", () => {
  it("只接受标准 HTTPS GitHub Release 链接", () => {
    expect(parseGithubReleaseUrl("https://github.com/openwrt/openwrt/releases")).toEqual({ owner: "openwrt", repository: "openwrt", tagName: null });
    expect(parseGithubReleaseUrl("https://github.com/openwrt/openwrt/releases/tag/v25.12.0")).toEqual({ owner: "openwrt", repository: "openwrt", tagName: "v25.12.0" });
    expect(() => parseGithubReleaseUrl("http://github.com/openwrt/openwrt/releases")).toThrow("GitHub 仓库的 Release 链接");
    expect(() => parseGithubReleaseUrl("https://example.com/openwrt/openwrt/releases")).toThrow("GitHub 仓库的 Release 链接");
  });

  it("按数字版本保守比较当前固件与 GitHub tag", () => {
    expect(compareReleaseVersion("25.12.0", "v25.12.1")).toBe(1);
    expect(compareReleaseVersion("25.12.1", "v25.12.0")).toBe(-1);
    expect(compareReleaseVersion("25.12.1", "25.12.1")).toBe(0);
    expect(compareReleaseVersion(null, "v25.12.1")).toBeNull();
  });

  it("仅保留 GitHub 可信 HTTPS 下载地址，并标记可选固件资产", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "v25.12.2",
        html_url: "https://github.com/openwrt/openwrt/releases/tag/v25.12.2",
        assets: [
          { id: 1, name: "openwrt-sysupgrade.bin", size: 1234, browser_download_url: "https://github.com/openwrt/openwrt/releases/download/v25.12.2/openwrt-sysupgrade.bin", content_type: "application/octet-stream" },
          { id: 2, name: "notes.txt", size: 99, browser_download_url: "https://example.invalid/notes.txt", content_type: "text/plain" },
          { id: 3, name: "checksums.txt", size: 99, browser_download_url: "http://github.com/openwrt/openwrt/releases/download/v25.12.2/checksums.txt", content_type: "text/plain" },
        ],
      }),
    }));

    const release = await fetchLatestGithubRelease("https://github.com/openwrt/openwrt/releases");
    expect(release.tagName).toBe("v25.12.2");
    expect(release.assets).toEqual([expect.objectContaining({ id: 1, firmwareCandidate: true, name: "openwrt-sysupgrade.bin" })]);
  });

  it("指定标签链接会查询对应 Release，而不是回退为仓库最新发布", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: "JDCloud", html_url: "https://github.com/MMCKB/OpenWRT/releases/tag/JDCloud", assets: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const release = await fetchLatestGithubRelease("https://github.com/MMCKB/OpenWRT/releases/tag/JDCloud");

    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/MMCKB/OpenWRT/releases/tags/JDCloud", expect.any(Object));
    expect(release.tagName).toBe("JDCloud");
  });
});
