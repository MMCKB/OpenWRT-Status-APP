import { describe, expect, it } from "vitest";

import {
  buildAddApkRepositoryKeyCommand,
  buildAddSshInstanceCommand,
  buildAddSshAuthorizedKeyCommand,
  buildChangeRouterPasswordCommand,
  buildFetchApkRepositoryKeyCommand,
  buildLedSnapshotCommand,
  buildMountActionCommand,
  buildNetworkInterfaceDeleteCommand,
  buildNetworkInterfaceRestartCommand,
  buildSaveAutorebootCommand,
  buildSaveLedCommand,
  buildSaveNetworkDeviceCommand,
  buildSaveNetworkGlobalCommand,
  buildSaveNetworkInterfaceCommand,
  buildSaveSshAccessCommand,
  buildSaveSshInstanceCommand,
  buildSaveUhttpdCommand,
  buildScheduledActionCommand,
  buildStartupActionCommand,
  parseAutorebootSettings,
  parseApkRepositoryKeys,
  parseLedSettings,
  parseMountPoints,
  parseNetworkDeviceSettings,
  parseNetworkGlobalSettings,
  parseNetworkInterfaceSettings,
  parseNetworkInterfaceStatus,
  parseSshAuthorizedKeys,
  parseSshAccessSettings,
  parseStartupServices,
  parseUhttpdSettings,
} from "@/lib/openwrt-luci-system";

describe("LuCI 系统管理命令", () => {
  it("解析自动重启、启动项、LED、挂载和接口快照", () => {
    expect(
      parseAutorebootSettings(
        "AUTOREBOOT|installed|yes\nAUTOREBOOT|enable|1\nAUTOREBOOT|time|03:30\nAUTOREBOOT|week|1,7",
      ),
    ).toMatchObject({
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
        color: "",
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
    ).toMatchObject({
      installed: true,
      port: "2222",
      passwordAuth: true,
      rootPasswordAuth: false,
      instances: [],
    });
  });

  it("为高风险配置生成受控重载命令且不额外创建配置副本", () => {
    expect(
      buildSaveAutorebootCommand({
        enabled: true,
        minute: "0",
        hour: "4",
        day: "*",
        month: "*",
        week: "1,7",
      }),
    ).not.toContain("app-backup");
    expect(buildMountActionCommand("usb", false)).toContain(
      "uci set 'fstab.usb.enabled=0'",
    );
    expect(
      buildSaveSshAccessCommand({
        port: "2222",
        passwordAuth: true,
        rootPasswordAuth: false,
      }),
    ).toContain("/etc/init.d/dropbear restart");
    expect(
      buildSaveSshInstanceCommand({
        section: "main",
        port: "2222",
        interface: "lan wan",
        passwordAuth: false,
        rootPasswordAuth: false,
        gatewayPorts: true,
        enabled: true,
      }),
    ).toContain("dropbear.main.GatewayPorts=on");
    expect(
      buildAddSshInstanceCommand({
        port: "2223",
        interface: "lan",
        passwordAuth: true,
        rootPasswordAuth: true,
        gatewayPorts: false,
        enabled: true,
      }),
    ).toContain("uci add dropbear dropbear");
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
    expect(() => buildChangeRouterPasswordCommand("bad\npassword")).toThrow(
      "路由器密码",
    );
    expect(() =>
      buildAddSshAuthorizedKeyCommand("ssh-ed25519 invalid; reboot"),
    ).toThrow("SSH 公钥格式");
    expect(() => buildAddApkRepositoryKeyCommand("bad/key", "key")).toThrow(
      "APK 公钥文件名",
    );
    expect(() =>
      buildFetchApkRepositoryKeyCommand("vendor", "ftp://example.com/key.pub"),
    ).toThrow("HTTP(S)");
    expect(() =>
      buildAddSshInstanceCommand({
        port: "0",
        interface: "lan",
        passwordAuth: true,
        rootPasswordAuth: true,
        gatewayPorts: false,
        enabled: true,
      }),
    ).toThrow("SSH 端口");
    expect(() =>
      buildSaveNetworkDeviceCommand({
        section: "@device[0]",
        name: "br-lan",
        type: "bridge",
        macaddr: "not-a-mac",
        mtu: "1500",
        ipv6: true,
      }),
    ).toThrow("MAC 地址");
  });

  it("兼容 LuCI 生成的匿名 UCI 配置段", () => {
    expect(
      parseLedSettings(
        "LED|@led[0]|name|wan\nLED|@led[0]|sysfs|green:wan\nLED|@led[0]|trigger|netdev\nLED|@led[0]|default|1",
      ),
    ).toEqual([
      {
        section: "@led[0]",
        name: "wan",
        sysfs: "green:wan",
        trigger: "netdev",
        color: "",
        defaultValue: "1",
      },
    ]);
    expect(
      parseMountPoints(
        "MOUNT|@mount[0]|section|@mount[0]\nMOUNT|@mount[0]|target|/mnt/usb\nMOUNT|@mount[0]|uuid|ABCD-1234\nMOUNT|@mount[0]|fstype|ext4\nMOUNT|@mount[0]|enabled|1\nMOUNT|@mount[0]|enabled_fsck|0",
      ),
    ).toMatchObject([
      { section: "@mount[0]", target: "/mnt/usb", device: "ABCD-1234" },
    ]);
    expect(
      buildSaveLedCommand({
        section: "@led[0]",
        trigger: "netdev",
        color: "blue",
        defaultValue: "1",
      }),
    ).toContain("'system.@led[0].trigger=netdev'");
    expect(buildMountActionCommand("@mount[0]", false)).toContain(
      "'fstab.@mount[0].enabled=0'",
    );
    expect(
      parseAutorebootSettings(
        "AUTOREBOOT|installed|yes\nAUTOREBOOT|enabled|on\nAUTOREBOOT|time|02:15\nAUTOREBOOT|weekdays|1,3,5",
      ),
    ).toMatchObject({
      installed: true,
      enabled: true,
      time: "02:15",
      week: "1,3,5",
    });
  });

  it("解析并安全保存管理权配置", () => {
    expect(
      parseSshAuthorizedKeys(
        "SSHKEY|ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleMaterial laptop\nSSHKEY|# comment",
      ),
    ).toEqual([
      {
        value: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleMaterial laptop",
        type: "ssh-ed25519",
        comment: "laptop",
      },
    ]);
    expect(parseApkRepositoryKeys("APKKEY|vendor.pub|456")).toEqual([
      { name: "vendor.pub", bytes: 456 },
    ]);
    expect(
      parseUhttpdSettings(
        "UHTTPD|installed|yes\nUHTTPD|main|section|main\nUHTTPD|main|listen_http|0.0.0.0:80\nUHTTPD|main|listen_https|0.0.0.0:443\nUHTTPD|main|redirect_https|1",
      ),
    ).toEqual({
      installed: true,
      section: "main",
      httpPorts: "0.0.0.0:80",
      httpsPorts: "0.0.0.0:443",
      redirectHttps: true,
    });
    expect(buildChangeRouterPasswordCommand("safe-password")).toContain(
      "chpasswd",
    );
    expect(
      buildAddSshAuthorizedKeyCommand(
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleMaterial laptop",
      ),
    ).toContain("authorized_keys");
    expect(buildAddApkRepositoryKeyCommand("vendor", "public-key")).toContain(
      "/etc/apk/keys/vendor.pub",
    );
    expect(
      buildFetchApkRepositoryKeyCommand(
        "vendor",
        "https://example.com/keys/vendor.pub",
      ),
    ).toContain("uclient-fetch");
    expect(
      buildSaveUhttpdCommand({
        section: "main",
        redirectHttps: true,
      }),
    ).toContain("/etc/init.d/uhttpd reload");
    expect(
      buildSaveUhttpdCommand({ section: "main", redirectHttps: true }),
    ).not.toContain("listen_http");
  });

  it("解析 LuCI Dropbear 多实例及其监听接口和权限", () => {
    expect(
      parseSshAccessSettings(
        "SSH|installed|yes\nSSHINSTANCE|main|section|main\nSSHINSTANCE|main|Port|22\nSSHINSTANCE|main|Interface|lan wan\nSSHINSTANCE|main|PasswordAuth|on\nSSHINSTANCE|main|RootPasswordAuth|off\nSSHINSTANCE|main|GatewayPorts|on\nSSHINSTANCE|main|enable|1\nSSHINSTANCE|guest|section|guest\nSSHINSTANCE|guest|Port|2222\nSSHINSTANCE|guest|enable|0",
      ),
    ).toMatchObject({
      installed: true,
      port: "22",
      passwordAuth: true,
      rootPasswordAuth: false,
      instances: [
        {
          section: "main",
          port: "22",
          interface: "lan wan",
          passwordAuth: true,
          rootPasswordAuth: false,
          gatewayPorts: true,
          enabled: true,
        },
        { section: "guest", port: "2222", enabled: false },
      ],
    });
  });

  it("解析接口运行状态并提供接口、设备和全局网络的受控操作", () => {
    expect(
      parseNetworkInterfaceStatus(
        '{"interface":[{"interface":"wan","proto":"dhcp","l3_device":"eth0.2","up":true,"uptime":3661,"ipv4-address":[{"address":"203.0.113.2"}],"ipv6-address":[{"address":"2001:db8::2"}]}]}\nIFMAC|eth0.2|00:11:22:33:44:55',
      ),
    ).toEqual([
      {
        section: "wan",
        proto: "dhcp",
        device: "eth0.2",
        ipv4: ["203.0.113.2"],
        ipv6: ["2001:db8::2"],
        mac: "00:11:22:33:44:55",
        up: true,
        uptimeSeconds: 3661,
      },
    ]);
    expect(buildNetworkInterfaceRestartCommand("wan")).toContain(
      "ifdown 'wan'",
    );
    expect(buildNetworkInterfaceDeleteCommand("wan")).toContain(
      "uci -q delete 'network.wan'",
    );
    expect(
      parseNetworkDeviceSettings(
        "DEVICE|@device[0]|section|@device[0]\nDEVICE|@device[0]|name|br-lan\nDEVICE|@device[0]|type|bridge\nDEVICE|@device[0]|mtu|1500\nDEVICE|@device[0]|ipv6|1",
      ),
    ).toMatchObject([
      {
        section: "@device[0]",
        name: "br-lan",
        type: "bridge",
        mtu: "1500",
        ipv6: true,
      },
    ]);
    expect(
      parseNetworkGlobalSettings(
        "GLOBAL|globals|section|globals\nGLOBAL|globals|ula_prefix|fd00:1234::/48\nGLOBAL|globals|packet_steering|1",
      ),
    ).toEqual({
      section: "globals",
      ulaPrefix: "fd00:1234::/48",
      packetSteering: true,
    });
    expect(
      buildSaveNetworkDeviceCommand({
        section: "@device[0]",
        name: "br-lan",
        type: "bridge",
        macaddr: "00:11:22:33:44:55",
        mtu: "1500",
        ipv6: true,
      }),
    ).toContain("/etc/init.d/network reload");
    expect(
      buildSaveNetworkGlobalCommand({
        section: "globals",
        ulaPrefix: "fd00:1234::/48",
        packetSteering: true,
      }),
    ).toContain("packet_steering=1");
  });
});
