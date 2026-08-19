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
}

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

/** 读取 /etc/apk/repositories 的每个有效条目。 */
export function buildApkRepositoriesSnapshotCommand(): string {
  return `if ! command -v apk >/dev/null 2>&1; then echo 'ERROR|apk_missing'; exit 2; fi; file=/etc/apk/repositories; [ -f "$file" ] || { echo 'ERROR|repositories_missing'; exit 2; }; awk '{ raw=$0; sub(/\\r$/, "", raw); if (raw ~ /^[[:space:]]*$/) next; enabled=1; if (raw ~ /^[[:space:]]*#/) { enabled=0; sub(/^[[:space:]]*#[[:space:]]*/, "", raw); } if (raw != "") printf "REPO|%d|%d|%s\\n", NR, enabled, raw; }' "$file"`;
}

/**
 * 受控保存 APK 仓库列表。仅接受 HTTP(S) 地址，保存前备份，并原子替换后更新索引。
 */
export function buildApkSaveRepositoriesCommand(repositories: Array<Pick<ApkRepository, "url" | "enabled">>): string {
  const normalized = repositories.map((repository) => ({
    url: normalizeRepositoryUrl(repository.url),
    enabled: repository.enabled !== false,
  }));
  if (!normalized.length) throw new Error("至少保留一个软件包仓库。");
  if (!normalized.some((repository) => repository.enabled)) throw new Error("至少启用一个软件包仓库。");
  if (new Set(normalized.map((repository) => repository.url)).size !== normalized.length) {
    throw new Error("软件包仓库地址不能重复。");
  }
  const lines = normalized.map((repository) => `${repository.enabled ? "" : "# "}${repository.url}`);
  const writeLines = lines.map(quoteShell).join(" ");
  return `if ! command -v apk >/dev/null 2>&1; then echo 'apk 未安装。'; exit 2; fi; umask 077; target=/etc/apk/repositories; temp=$(mktemp /tmp/openwrt-status-apk-repositories.XXXXXX) || { echo '无法创建临时仓库文件。'; exit 1; }; printf '%s\\n' ${writeLines} > "$temp" || { rm -f "$temp"; echo '仓库配置写入失败。'; exit 1; }; cp "$target" "$target.openwrt-status.bak" 2>/dev/null || true; mv "$temp" "$target" && apk update`;
}

/** 解析 apk info -v 输出。 */
export function parseInstalledPackages(output: string): ApkPackage[] {
  const packages: ApkPackage[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("fetch ") || trimmed.startsWith("OK:") || trimmed.startsWith("packages:")) continue;
    const match = trimmed.match(/^(.+)-([0-9].*)$/);
    packages.push(
      match
        ? { name: match[1], version: match[2], description: "已安装的系统软件包 (apk)", installed: true, status: "installed" }
        : { name: trimmed, version: "unknown", description: "已安装的系统软件包 (apk)", installed: true, status: "installed" },
    );
  }
  return packages;
}

/** 解析 apk list -u 输出。 */
export function parseUpgradablePackages(output: string): ApkPackage[] {
  const packages: ApkPackage[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("fetch ") || trimmed.startsWith("OK:") || trimmed.startsWith("packages:")) continue;
    const match = trimmed.match(/^(.+)-([0-9].*?)(?:\s+\[upgradable from:\s+([^\]]+)\])?$/);
    if (!match) continue;
    const [, name, version, previousVersion] = match;
    packages.push({ name, version, description: previousVersion ? `可从 ${previousVersion} 更新` : "有可用更新", installed: true, status: "upgradable" });
  }
  return packages;
}

/** 解析 apk search -v 输出，包括完整仓库清单。 */
export function parseAvailablePackages(output: string, installedNames: Set<string>): ApkPackage[] {
  const packages: ApkPackage[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("fetch ") || trimmed.startsWith("OK:") || trimmed.startsWith("packages:")) continue;
    const sepIdx = trimmed.indexOf(" - ");
    const nameVersion = sepIdx > 0 ? trimmed.slice(0, sepIdx).trim() : trimmed;
    const description = sepIdx > 0 ? trimmed.slice(sepIdx + 3).trim() : "软件仓库中的可用包 (apk)";
    const match = nameVersion.match(/^(.+)-([0-9][a-zA-Z0-9._.-]*)$/);
    const name = match?.[1] ?? nameVersion;
    const version = match?.[2] ?? "unknown";
    if (!name || packages.some((item) => item.name === name)) continue;
    const installed = installedNames.has(name);
    packages.push({ name, version, description, installed, status: installed ? "installed" : "available" });
  }
  return packages;
}

export function parseApkRepositories(output: string): ApkRepository[] {
  const repositories: ApkRepository[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("REPO|")) continue;
    const [, lineValue, enabledValue, url] = line.split("|", 4);
    const number = Number.parseInt(lineValue, 10);
    if (!Number.isInteger(number) || !url?.trim()) continue;
    repositories.push({ line: number, enabled: enabledValue === "1", url: url.trim() });
  }
  return repositories;
}
