export interface ApkPackage {
  name: string;
  version: string;
  description: string;
  installed: boolean;
  status?: string;
  architecture?: string;
}

function quotePackageName(name: string): string {
  const sanitized = name.trim().replace(/[^a-zA-Z0-9+._:@/-]/g, "");
  if (!sanitized) throw new Error("软件包名称无效。");
  return `"${sanitized}"`;
}

/**
 * 构建 apk 更新软件源列表命令 (OpenWrt 25.12+)
 */
export function buildApkUpdateCommand(): string {
  return "apk update";
}

/**
 * 构建查询已安装软件包命令 (apk info -v)
 */
export function buildApkListInstalledCommand(): string {
  return "apk info -v";
}

/**
 * 构建列出可升级软件包命令 (apk list -u)
 */
export function buildApkListUpgradableCommand(): string {
  return "apk list -u";
}

/**
 * 构建升级全部可升级软件包命令
 */
export function buildApkUpgradeCommand(): string {
  return "apk upgrade";
}

export function buildApkUpgradePackageCommand(name: string): string {
  return `apk upgrade ${quotePackageName(name)}`;
}

/**
 * 构建搜索仓库可用软件包命令 (apk search -v)
 */
export function buildApkSearchCommand(keyword: string): string {
  const sanitized = keyword.trim().replace(/['"\\$`]/g, "");
  return `apk search -v "*${sanitized}*" || apk search "*${sanitized}*"`;
}

/**
 * 构建安装软件包命令 (apk add)
 */
export function buildApkInstallCommand(packageName: string): string {
  const sanitized = packageName.trim().replace(/['"\\$`]/g, "");
  return `apk add "${sanitized}"`;
}

/**
 * 构建卸载软件包命令 (apk del)
 */
export function buildApkRemoveCommand(packageName: string): string {
  const sanitized = packageName.trim().replace(/['"\\$`]/g, "");
  return `apk del "${sanitized}"`;
}

/**
 * 解析 apk info -v 输出
 * OpenWrt 25.12 apk info -v 通常输出格式为: package-name-version (例如 base-files-15-r0)
 */
export function parseInstalledPackages(output: string): ApkPackage[] {
  const lines = output.split(/\r?\n/);
  const packages: ApkPackage[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("fetch ") || trimmed.startsWith("OK:") || trimmed.startsWith("packages:")) continue;
    
    // 匹配形如 name-version 的结构，其中 version 通常以数字开头
    // 例如: base-files-15-r0 => name = base-files, version = 15-r0
    const match = trimmed.match(/^(.+)-([0-9].*)$/);
    if (match) {
      const name = match[1];
      const version = match[2];
      packages.push({
        name,
        version,
        description: "已安装的系统软件包 (apk)",
        installed: true,
        status: "installed",
      });
    } else {
      packages.push({
        name: trimmed,
        version: "unknown",
        description: "已安装的系统软件包 (apk)",
        installed: true,
        status: "installed",
      });
    }
  }
  return packages;
}

/**
 * 解析 apk list -u 输出。
 * 常见格式：name-version [upgradable from: old-version]
 */
export function parseUpgradablePackages(output: string): ApkPackage[] {
  const packages: ApkPackage[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("fetch ") || trimmed.startsWith("OK:") || trimmed.startsWith("packages:")) continue;
    const match = trimmed.match(/^(.+)-([0-9].*?)(?:\s+\[upgradable from:\s+([^\]]+)\])?$/);
    if (!match) continue;
    const [, name, version, previousVersion] = match;
    packages.push({
      name,
      version,
      description: previousVersion ? `可从 ${previousVersion} 更新` : "有可用更新",
      installed: true,
      status: "upgradable",
    });
  }
  return packages;
}

/**
 * 解析 apk search -v 输出
 */
export function parseAvailablePackages(output: string, installedNames: Set<string>): ApkPackage[] {
  const lines = output.split(/\r?\n/);
  const packages: ApkPackage[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("fetch ") || trimmed.startsWith("OK:") || trimmed.startsWith("packages:")) continue;

    const sepIdx = trimmed.indexOf(" - ");
    let nameVersion = trimmed;
    let description = "软件仓库中的可用包 (apk)";
    if (sepIdx > 0) {
      nameVersion = trimmed.slice(0, sepIdx).trim();
      description = trimmed.slice(sepIdx + 3).trim();
    }

    const match = nameVersion.match(/^(.+)-([0-9][a-zA-Z0-9._.-]*)$/);
    if (match) {
      const name = match[1];
      const version = match[2];
      if (name && !packages.some((p) => p.name === name)) {
        const isInstalled = installedNames.has(name);
        packages.push({
          name,
          version,
          description,
          installed: isInstalled,
          status: isInstalled ? "installed" : "available",
        });
      }
    } else if (nameVersion) {
      if (!packages.some((p) => p.name === nameVersion)) {
        const isInstalled = installedNames.has(nameVersion);
        packages.push({
          name: nameVersion,
          version: "unknown",
          description,
          installed: isInstalled,
          status: isInstalled ? "installed" : "available",
        });
      }
    }
  }
  return packages;
}
