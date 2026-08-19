import { describe, it, expect } from "vitest";
import {
  buildApkUpdateCommand,
  buildApkListInstalledCommand,
  buildApkListUpgradableCommand,
  buildApkListAvailableCommand,
  buildApkUpgradeCommand,
  buildApkUpgradePackageCommand,
  buildApkSearchCommand,
  buildApkInstallCommand,
  buildApkRemoveCommand,
  buildApkRepositoriesSnapshotCommand,
  buildApkSaveRepositoriesCommand,
  parseInstalledPackages,
  parseUpgradablePackages,
  parseAvailablePackages,
  parseApkRepositories,
} from "../lib/router-package-commands";

describe("router-package-commands (apk)", () => {
  it("should build correct apk commands for OpenWrt 25.12", () => {
    expect(buildApkUpdateCommand()).toBe("apk update");
    expect(buildApkListInstalledCommand()).toBe("apk info -v");
    expect(buildApkListUpgradableCommand()).toBe("apk list -u");
    expect(buildApkListAvailableCommand()).toBe('apk search -v "*" || apk search "*"');
    expect(buildApkUpgradeCommand()).toBe("apk upgrade");
    expect(buildApkUpgradePackageCommand("luci-base")).toBe('apk upgrade "luci-base"');
    expect(buildApkSearchCommand("luci")).toBe('apk search -v "*luci*" || apk search "*luci*"');
    expect(buildApkInstallCommand("curl")).toBe('apk add "curl"');
    expect(buildApkRemoveCommand("luci-app-firewall")).toBe('apk del "luci-app-firewall"');
  });

  it("should parse installed packages output from apk info -v", () => {
    const raw = `
      base-files-15-r0
      busybox-1.36.1-r3
      luci-base-git-24.123-r1
    `;
    const pkgs = parseInstalledPackages(raw);
    expect(pkgs.length).toBe(3);
    expect(pkgs[0].name).toBe("base-files");
    expect(pkgs[0].version).toBe("15-r0");
    expect(pkgs[0].installed).toBe(true);
    expect(pkgs[2].name).toBe("luci-base-git");
  });

  it("should parse apk list -u output", () => {
    const raw = `
      busybox-1.36.1-r4 [upgradable from: 1.36.1-r3]
      luci-base-git-24.125-r1 [upgradable from: 24.123-r1]
    `;
    const pkgs = parseUpgradablePackages(raw);
    expect(pkgs.length).toBe(2);
    expect(pkgs[0]).toMatchObject({ name: "busybox", version: "1.36.1-r4", installed: true, status: "upgradable" });
    expect(pkgs[1].description).toContain("24.123-r1");
  });

  it("should parse available packages output from apk search -v", () => {
    const raw = `
      curl-8.4.0-r1 - A command line tool for transferring data
      nano-7.2-r0 - Free Pico clone editor
    `;
    const installed = new Set(["nano"]);
    const pkgs = parseAvailablePackages(raw, installed);
    expect(pkgs.length).toBe(2);
    expect(pkgs.find((p) => p.name === "curl")?.installed).toBe(false);
    expect(pkgs.find((p) => p.name === "nano")?.installed).toBe(true);
  });

  it("should build a safe APK repositories snapshot and save command", () => {
    expect(buildApkRepositoriesSnapshotCommand()).toContain('file=/etc/apk/repositories');
    expect(buildApkRepositoriesSnapshotCommand()).toContain('REPO|%d|%d|%s');

    const command = buildApkSaveRepositoriesCommand([
      { url: "https://downloads.openwrt.org/releases/25.12/packages/aarch64_cortex-a53/base", enabled: true },
      { url: "https://downloads.openwrt.org/releases/25.12/packages/aarch64_cortex-a53/luci", enabled: false },
    ]);
    expect(command).toContain("umask 077");
    expect(command).toContain("cp \"$target\" \"$target.openwrt-status.bak\"");
    expect(command).toContain("mv \"$temp\" \"$target\" && apk update");
    expect(command).toContain("'# https://downloads.openwrt.org/releases/25.12/packages/aarch64_cortex-a53/luci'");
  });

  it("should reject unsafe, duplicate, or disabled-only repository configurations", () => {
    expect(() => buildApkSaveRepositoriesCommand([])).toThrow("至少保留一个软件包仓库");
    expect(() =>
      buildApkSaveRepositoriesCommand([{ url: "ftp://mirror.example/repo", enabled: true }]),
    ).toThrow("仓库地址必须");
    expect(() =>
      buildApkSaveRepositoriesCommand([{ url: "https://mirror.example/$(touch-pwned)", enabled: true }]),
    ).toThrow("仓库地址必须");
    expect(() =>
      buildApkSaveRepositoriesCommand([
        { url: "https://mirror.example/repo", enabled: true },
        { url: "https://mirror.example/repo", enabled: true },
      ]),
    ).toThrow("不能重复");
    expect(() =>
      buildApkSaveRepositoriesCommand([{ url: "https://mirror.example/repo", enabled: false }]),
    ).toThrow("至少启用一个");
  });

  it("should parse enabled and disabled APK repository lines", () => {
    const repositories = parseApkRepositories(`
      unrelated output
      REPO|2|1|https://downloads.openwrt.org/releases/25.12/targets/x86/64/packages
      REPO|4|0|https://mirror.example/openwrt/packages
    `);
    expect(repositories).toEqual([
      {
        line: 2,
        enabled: true,
        url: "https://downloads.openwrt.org/releases/25.12/targets/x86/64/packages",
      },
      { line: 4, enabled: false, url: "https://mirror.example/openwrt/packages" },
    ]);
  });
});
