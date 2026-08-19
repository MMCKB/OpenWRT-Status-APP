import { describe, expect, it } from "vitest";

import {
  buildLedSnapshotCommand,
  buildMountActionCommand,
  buildSaveAutorebootCommand,
  buildSaveNetworkInterfaceCommand,
  buildSaveSshAccessCommand,
  buildScheduledActionCommand,
  buildStartupActionCommand,
  parseAutorebootSettings,
  parseLedSettings,
  parseMountPoints,
  parseNetworkInterfaceSettings,
  parseSshAccessSettings,
  parseStartupServices,
} from "@/lib/openwrt-luci-system";

describe("LuCI 系统管理命令", () => {
  it("解析自动重启、启动项、LED、挂载和接口快照", () => {
    expect(
      parseAutorebootSettings(
        "AUTOREBOOT|installed|yes\nAUTOREBOOT|enable|1\nAUTOREBOOT|time|03:30\nAUTOREBOOT|week|1,7",
      ),
    ).toEqual({
      installed: true,
      enabled: true,
      time: "03:30",
      week: "1,7",
    });
    expect(
      parseStartupServices("STARTUP|network|enabled\nSTARTUP|ddns|disabled"),
    ).toEqual([
      { name: "ddns", enabled: false },
      { name: "network", enabled: true },
    ]);
    expect(
      parseLedSettings(
        "LED|wan|name|WAN\nLED|wan|sysfs|green:wan\nLED|wan|trigger|netdev\nLED|wan|default|1",
      ),
    ).toEqual([
      {
        section: "wan",
        name: "WAN",
        sysfs: "green:wan",
        trigger: "netdev",
        defaultValue: "1",
      },
    ]);
    expect(
      parseMountPoints(
        "MOUNT|usb|target|/mnt/usb\nMOUNT|usb|device|/dev/sda1\nMOUNT|usb|fstype|ext4\nMOUNT|usb|enabled|1\nMOUNT|usb|enabled_fsck|1",
      ),
    ).toEqual([
      {
        section: "usb",
        target: "/mnt/usb",
        device: "/dev/sda1",
        fstype: "ext4",
        enabled: true,
        enabledFsck: true,
      },
    ]);
    expect(
      parseNetworkInterfaceSettings(
        "IFACE|lan|proto|static\nIFACE|lan|device|br-lan\nIFACE|lan|ipaddr|192.168.1.1\nIFACE|lan|netmask|255.255.255.0\nIFACE|lan|auto|1",
      ),
    ).toEqual([
      {
        section: "lan",
        proto: "static",
        device: "br-lan",
        ipaddr: "192.168.1.1",
        netmask: "255.255.255.0",
        gateway: "",
        dns: "",
        auto: true,
      },
    ]);
    expect(
      parseSshAccessSettings(
        "SSH|installed|yes\nSSH|port|2222\nSSH|password|on\nSSH|rootpassword|off",
      ),
    ).toEqual({
      installed: true,
      port: "2222",
      passwordAuth: true,
      rootPasswordAuth: false,
    });
  });

  it("为高风险配置生成带备份和受控重载的命令", () => {
    expect(
      buildSaveAutorebootCommand({ enabled: true, time: "04:00", week: "1,7" }),
    ).toContain("/etc/config/autoreboot.app-backup.$(date +%s)");
    expect(buildMountActionCommand("usb", false)).toContain(
      "uci set fstab.usb.enabled=0",
    );
    expect(
      buildSaveSshAccessCommand({
        port: "2222",
        passwordAuth: true,
        rootPasswordAuth: false,
      }),
    ).toContain("/etc/init.d/dropbear restart");
    expect(
      buildSaveNetworkInterfaceCommand({
        section: "lan",
        proto: "static",
        device: "br-lan",
        ipaddr: "192.168.1.1",
        netmask: "255.255.255.0",
        gateway: "",
        dns: "1.1.1.1",
        auto: true,
      }),
    ).toContain("/etc/init.d/network reload");
    expect(
      buildScheduledActionCommand("0", "4", "1-5", "ddns-refresh"),
    ).toContain("/etc/init.d/ddns restart");
    expect(buildLedSnapshotCommand()).not.toContain("\u0000");
  });

  it("拒绝危险的系统配置输入", () => {
    expect(() => buildStartupActionCommand("ddns; reboot", true)).toThrow(
      "服务名称不合法",
    );
    expect(() =>
      buildSaveSshAccessCommand({
        port: "0",
        passwordAuth: true,
        rootPasswordAuth: true,
      }),
    ).toThrow("SSH 端口");
    expect(() =>
      buildSaveNetworkInterfaceCommand({
        section: "lan; reboot",
        proto: "dhcp",
        device: "",
        ipaddr: "",
        netmask: "",
        gateway: "",
        dns: "",
        auto: true,
      }),
    ).toThrow("配置段标识");
    expect(() =>
      buildScheduledActionCommand("0; reboot", "4", "*", "reboot"),
    ).toThrow("计划时间");
  });
});
