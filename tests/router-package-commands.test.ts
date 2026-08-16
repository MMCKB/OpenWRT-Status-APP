import { describe, it, expect } from "vitest";
import {
  buildApkUpdateCommand,
  buildApkListInstalledCommand,
  buildApkListUpgradableCommand,
  buildApkUpgradeCommand,
  buildApkUpgradePackageCommand,
  buildApkSearchCommand,
  buildApkInstallCommand,
  buildApkRemoveCommand,
  parseInstalledPackages,
  parseUpgradablePackages,
  parseAvailablePackages,
} from "../lib/router-package-commands";

describe("router-package-commands (apk)", () => {
  it("should build correct apk commands for OpenWrt 25.12", () => {
    expect(buildApkUpdateCommand()).toBe("apk update");
    expect(buildApkListInstalledCommand()).toBe("apk info -v");
    expect(buildApkListUpgradableCommand()).toBe("apk list -u");
    expect(buildApkUpgradeCommand()).toBe("apk upgrade");
    expect(buildApkUpgradePackageCommand("luci-base")).toBe('apk upgrade "luci-base"');
    expect(buildApkSearchCommand("luci")).toBe('apk search -v "*luci*"');
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
});
