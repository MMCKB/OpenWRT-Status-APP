import * as FileSystem from "expo-file-system/legacy";

import type { GithubReleaseAsset } from "@/lib/github-release";

const DOWNLOAD_HOSTS = new Set(["github.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com"]);

function safeDownloadUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && DOWNLOAD_HOSTS.has(parsed.hostname.toLowerCase()) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function safeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120) || "firmware.bin";
}

export async function downloadGithubReleaseAsset(asset: GithubReleaseAsset) {
  if (!asset.firmwareCandidate) throw new Error("仅允许下载固件候选资产。请选择 sysupgrade、.bin、.img 或 .itb 镜像。");
  const url = safeDownloadUrl(asset.downloadUrl);
  if (!url) throw new Error("固件下载地址不受支持。");
  if (!FileSystem.cacheDirectory) throw new Error("本机缓存目录不可用。");
  const localUri = `${FileSystem.cacheDirectory}openwrt-github-${Date.now()}-${safeFileName(asset.name)}`;
  const result = await FileSystem.downloadAsync(url, localUri);
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    throw new Error(`固件下载失败（HTTP ${result.status}）。`);
  }
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists || !info.size) throw new Error("下载的固件文件为空，已拒绝继续上传。");
  return { uri: localUri, size: info.size };
}
