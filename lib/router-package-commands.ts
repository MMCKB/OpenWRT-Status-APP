export interface ApkPackage {
  name: string;
  version: string;
  description: string;
  installed: boolean;
  status?: string;
  architecture?: string;
}

export interface ApkRepository {
  line: number;
  url: string;
  enabled: boolean;
  source?: string;
  deleted?: boolean;
}

/** OpenWrt 25.12 APK feed files managed by the application. */
export const APK_CUSTOM_FEEDS_SOURCE =
  "/etc/apk/repositories.d/customfeeds.list";
export const APK_DIST_FEEDS_SOURCE = "/etc/apk/repositories.d/distfeed";

function quotePackageName(name: string): string {
  const sanitized = name.trim().replace(/[^a-zA-Z0-9+._:@/-]/g, "");
  if (!sanitized) throw new Error("软件包名称无效。");
  return `"${sanitized}"`;
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function normalizeRepositoryUrl(value: string): string {
  const url = value.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(url) || /['"`$\\;|<>(){}\[\]!]/.test(url)) {
    throw new Error("仓库地址必须是以 http:// 或 https:// 开头的完整 URL。");
  }
  return url;
}

/** 构建 apk 更新软件源列表命令 (OpenWrt 25.12+)。 */
export function buildApkUpdateCommand(): string {
  return "apk update";
}

/** 构建查询已安装软件包命令 (apk info -v)。 */
export function buildApkListInstalledCommand(): string {
  return "apk info -v";
}

/** 构建列出可升级软件包命令 (apk list -u)。 */
export function buildApkListUpgradableCommand(): string {
  return "apk list -u";
}

/** 构建升级全部可升级软件包命令。 */
export function buildApkUpgradeCommand(): string {
  return "apk upgrade";
}

export function buildApkUpgradePackageCommand(name: string): string {
  return `apk upgrade ${quotePackageName(name)}`;
}

/** 构建搜索仓库可用软件包命令 (apk search -v)。 */
export function buildApkSearchCommand(keyword: string): string {
  const sanitized = keyword.trim().replace(/['"\\$`]/g, "");
  return `apk search -v "*${sanitized}*" || apk search "*${sanitized}*"`;
}

/** 构建完整仓库软件包清单命令。 */
export function buildApkListAvailableCommand(): string {
  return 'apk search -v "*" || apk search "*"';
}

/** 构建安装软件包命令 (apk add)。 */
export function buildApkInstallCommand(packageName: string): string {
  return `apk add ${quotePackageName(packageName)}`;
}

/** 构建卸载软件包命令 (apk del)。 */
export function buildApkRemoveCommand(packageName: string): string {
  return `apk del ${quotePackageName(packageName)}`;
}

/**
 * 读取 OpenWrt APK feed 条目。
 *
 * 此应用仅管理用户指定的 OpenWrt APK 官方源与自定义源文件：distfeed 和
 * customfeeds.list。其余 repositories.d 文件不应在此界面中被意外修改。
 */
export function buildApkRepositoriesSnapshotCommand(): string {
  return `if ! command -v apk >/dev/null 2>&1; then echo 'ERROR|apk_missing'; exit 2; fi; found=0; for file in ${APK_CUSTOM_FEEDS_SOURCE} ${APK_DIST_FEEDS_SOURCE}; do [ -f "$file" ] || continue; found=1; awk -v source="$file" '{ raw=$0; sub(/\r$/, "", raw); if (raw ~ /^[[:space:]]*$/) next; enabled=1; if (raw ~ /^[[:space:]]*#/) { enabled=0; sub(/^[[:space:]]*#[[:space:]]*/, "", raw); } if (raw != "") printf "REPO|%s|%d|%d|%s\n", source, NR, enabled, raw; }' "$file"; done; [ "$found" -eq 1 ] || { echo 'ERROR|repositories_missing'; exit 2; }`;
}

/**
 * 受控保存 APK 仓库列表。仅接受 HTTP(S) 地址，保存前备份，并原子替换后更新索引。
 */
function normalizeRepositorySource(source: string | undefined) {
  const resolved = source || APK_CUSTOM_FEEDS_SOURCE;
  if (
    resolved !== APK_CUSTOM_FEEDS_SOURCE &&
    resolved !== APK_DIST_FEEDS_SOURCE
  ) {
    throw new Error("APK 仓库配置文件路径无效。");
  }
  return resolved;
}

export function buildApkSaveRepositoriesCommand(
  repositories: Array<
    Pick<ApkRepository, "url" | "enabled" | "source" | "deleted">
  >,
): string {
  const normalized = repositories.map((repository) => ({
    url: normalizeRepositoryUrl(repository.url),
    enabled: repository.enabled !== false,
    source: normalizeRepositorySource(repository.source),
    deleted: repository.deleted === true,
  }));
  const active = normalized.filter((repository) => !repository.deleted);
  if (!active.length) throw new Error("至少保留一个软件包仓库。");
  if (!active.some((repository) => repository.enabled))
    throw new Error("至少启用一个软件包仓库。");
  if (
    new Set(active.map((repository) => repository.url)).size !== active.length
  ) {
    throw new Error("软件包仓库地址不能重复。");
  }
  const sources = [
    ...new Set(normalized.map((repository) => repository.source)),
  ];
  const writes = sources.map((source) => {
    const entries = normalized.filter(
      (repository) => repository.source === source && !repository.deleted,
    );
    const quotedSource = quoteShell(source);
    if (!entries.length) {
      return `rm -f ${quotedSource}`;
    }
    const writeLines = entries
      .map((repository) => `${repository.enabled ? "" : "# "}${repository.url}`)
      .map(quoteShell)
      .join(" ");
    return `target=${quotedSource}; mkdir -p "$(dirname "$target")"; temp=$(mktemp /tmp/openwrt-status-apk-repositories.XXXXXX) || exit 1; printf '%s\\n' ${writeLines} > "$temp" || { rm -f "$temp"; exit 1; }; cp "$target" "$target.openwrt-status.bak" 2>/dev/null || true; mv "$temp" "$target"`;
  });
  return `if ! command -v apk >/dev/null 2>&1; then echo 'apk 未安装。'; exit 2; fi; umask 077; ${writes.join("; ")} && apk update`;
}

/** 解析 apk info -v 输出。 */
export function parseInstalledPackages(output: string): ApkPackage[] {
  const packages: ApkPackage[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("fetch ") ||
      trimmed.startsWith("OK:") ||
      trimmed.startsWith("packages:")
    )
      continue;
    const match = trimmed.match(/^(.+)-([0-9].*)$/);
    packages.push(
      match
        ? {
            name: match[1],
            version: match[2],
            description: "已安装的系统软件包 (apk)",
            installed: true,
            status: "installed",
          }
        : {
            name: trimmed,
            version: "unknown",
            description: "已安装的系统软件包 (apk)",
            installed: true,
            status: "installed",
          },
    );
  }
  return packages;
}

/** 解析 apk list -u 输出。 */
export function parseUpgradablePackages(output: string): ApkPackage[] {
  const packages: ApkPackage[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("fetch ") ||
      trimmed.startsWith("OK:") ||
      trimmed.startsWith("packages:")
    )
      continue;
    const match = trimmed.match(
      /^(.+)-([0-9].*?)(?:\s+\[upgradable from:\s+([^\]]+)\])?$/,
    );
    if (!match) continue;
    const [, name, version, previousVersion] = match;
    packages.push({
      name,
      version,
      description: previousVersion
        ? `可从 ${previousVersion} 更新`
        : "有可用更新",
      installed: true,
      status: "upgradable",
    });
  }
  return packages;
}

/** 解析 apk search -v 输出，包括完整仓库清单。 */
export function parseAvailablePackages(
  output: string,
  installedNames: Set<string>,
): ApkPackage[] {
  const packages: ApkPackage[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("fetch ") ||
      trimmed.startsWith("OK:") ||
      trimmed.startsWith("packages:")
    )
      continue;
    const sepIdx = trimmed.indexOf(" - ");
    const nameVersion = sepIdx > 0 ? trimmed.slice(0, sepIdx).trim() : trimmed;
    const description =
      sepIdx > 0
        ? trimmed.slice(sepIdx + 3).trim()
        : "软件仓库中的可用包 (apk)";
    const match = nameVersion.match(/^(.+)-([0-9][a-zA-Z0-9._.-]*)$/);
    const name = match?.[1] ?? nameVersion;
    const version = match?.[2] ?? "unknown";
    if (!name || packages.some((item) => item.name === name)) continue;
    const installed = installedNames.has(name);
    packages.push({
      name,
      version,
      description,
      installed,
      status: installed ? "installed" : "available",
    });
  }
  return packages;
}

export function parseApkRepositories(output: string): ApkRepository[] {
  const repositories: ApkRepository[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("REPO|")) continue;
    const values = line.split("|");
    const modernFormat = values.length >= 5;
    const source = modernFormat ? values[1] : undefined;
    const lineValue = modernFormat ? values[2] : values[1];
    const enabledValue = modernFormat ? values[3] : values[2];
    const url = modernFormat
      ? values.slice(4).join("|")
      : values.slice(3).join("|");
    const number = Number.parseInt(lineValue, 10);
    if (!Number.isInteger(number) || !url?.trim()) continue;
    repositories.push({
      line: number,
      enabled: enabledValue === "1",
      url: url.trim(),
      ...(source ? { source } : {}),
    });
  }
  return repositories;
}
