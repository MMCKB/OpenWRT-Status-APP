import { describe, it, expect } from "vitest";
import {
  buildOpkgListInstalledCommand,
  buildOpkgSearchCommand,
  buildOpkgInstallCommand,
  buildOpkgRemoveCommand,
  parseInstalledPackages,
  parseAvailablePackages,
} from "../lib/router-package-commands";

describe("router-package-commands", () => {
  it("should build correct opkg commands", () => {
    expect(buildOpkgListInstalledCommand()).toBe("opkg list-installed");
    expect(buildOpkgSearchCommand("luci")).toBe('opkg find "*luci*"');
    expect(buildOpkgInstallCommand("curl")).toBe('opkg install "curl"');
    expect(buildOpkgRemoveCommand("luci-app-firewall")).toBe('opkg remove "luci-app-firewall"');
  });

  it("should parse installed packages output correctly", () => {
    const raw = `
      base-files - 247-r23861 - Base system files
      busybox - 1.36.1-2 - Core utilities
      luci - git-23.287.48283-c233e76 - LuCI Web UI
    `;
    const pkgs = parseInstalledPackages(raw);
    expect(pkgs.length).toBe(3);
    expect(pkgs[0].name).toBe("base-files");
    expect(pkgs[0].version).toBe("247-r23861");
    expect(pkgs[0].description).toBe("Base system files");
    expect(pkgs[0].installed).toBe(true);
    expect(pkgs[2].name).toBe("luci");
  });

  it("should parse available packages output and match installed status", () => {
    const raw = `
      curl - 8.4.0-1 - A command line tool for transferring data with URL syntax
      nano - 7.2-1 - Free Pico clone with more features
      busybox - 1.36.1-2 - Core utilities
    `;
    const installed = new Set(["busybox"]);
    const pkgs = parseAvailablePackages(raw, installed);
    expect(pkgs.length).toBe(3);
    expect(pkgs.find((p) => p.name === "curl")?.installed).toBe(false);
    expect(pkgs.find((p) => p.name === "busybox")?.installed).toBe(true);
  });
});
