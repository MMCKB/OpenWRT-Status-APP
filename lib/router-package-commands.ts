export interface OpkgPackage {
  name: string;
  version: string;
  description: string;
  installed: boolean;
  status?: string;
  architecture?: string;
}

/**
 * 构建 opkg 更新软件包列表命令
 */
export function buildOpkgUpdateCommand(): string {
  return "opkg update";
}

/**
 * 构建查询已安装软件包命令
 */
export function buildOpkgListInstalledCommand(): string {
  return "opkg list-installed";
}

/**
 * 构建搜索仓库可用软件包命令
 */
export function buildOpkgSearchCommand(keyword: string): string {
  const sanitized = keyword.trim().replace(/['"\\$`]/g, "");
  return `opkg find "*${sanitized}*"`;
}

/**
 * 构建安装软件包命令
 */
export function buildOpkgInstallCommand(packageName: string): string {
  const sanitized = packageName.trim().replace(/['"\\$`]/g, "");
  return `opkg install "${sanitized}"`;
}

/**
 * 构建卸载软件包命令
 */
export function buildOpkgRemoveCommand(packageName: string): string {
  const sanitized = packageName.trim().replace(/['"\\$`]/g, "");
  return `opkg remove "${sanitized}"`;
}

/**
 * 解析 opkg list-installed 输出
 */
export function parseInstalledPackages(output: string): OpkgPackage[] {
  const lines = output.split(/\r?\n/);
  const packages: OpkgPackage[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // 格式通常为: package_name - version - description 或 package_name - version
    const parts = trimmed.split(" - ");
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const version = parts[1].trim();
      const description = parts.slice(2).join(" - ").trim() || "已安装的系统软件包";
      if (name) {
        packages.push({
          name,
          version,
          description,
          installed: true,
          status: "installed",
        });
      }
    } else {
      // 兼容单空格或其它分隔符
      const spaceParts = trimmed.split(/\s+/);
      if (spaceParts.length >= 2) {
        packages.push({
          name: spaceParts[0],
          version: spaceParts[1],
          description: spaceParts.slice(2).join(" ") || "已安装的系统软件包",
          installed: true,
          status: "installed",
        });
      }
    }
  }
  return packages;
}

/**
 * 解析 opkg find / list 可用软件包输出
 */
export function parseAvailablePackages(output: string, installedNames: Set<string>): OpkgPackage[] {
  const lines = output.split(/\r?\n/);
  const packages: OpkgPackage[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // 格式通常为: package_name - version - description
    const parts = trimmed.split(" - ");
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const version = parts[1].trim();
      const description = parts.slice(2).join(" - ").trim() || "软件仓库中的可用包";
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
    }
  }
  return packages;
}
