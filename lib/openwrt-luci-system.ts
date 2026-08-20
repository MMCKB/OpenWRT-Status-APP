export type StartupService = { name: string; enabled: boolean };

export type LedSetting = {
  section: string;
  name: string;
  sysfs: string;
  trigger: string;
  delayOn: string;
  delayOff: string;
  netdevDevice: string;
  netdevMode: string;
};

export type NewLedSettings = Pick<
  LedSetting,
  | "name"
  | "sysfs"
  | "trigger"
  | "delayOn"
  | "delayOff"
  | "netdevDevice"
  | "netdevMode"
>;

export type LedCapabilities = {
  devices: string[];
  triggers: string[];
  networkDevices: string[];
};

export type MountPoint = {
  section: string;
  target: string;
  device: string;
  fstype: string;
  enabled: boolean;
  enabledFsck: boolean;
};

export type MountedFileSystem = {
  target: string;
  device: string;
  fstype: string;
};

export type SwapPartition = {
  device: string;
};

export type SshAccessSettings = {
  installed: boolean;
  port: string;
  passwordAuth: boolean;
  rootPasswordAuth: boolean;
  instances: DropbearInstance[];
};

export type DropbearInstance = {
  section: string;
  port: string;
  interface: string;
  passwordAuth: boolean;
  rootPasswordAuth: boolean;
  gatewayPorts: boolean;
  enabled: boolean;
};

export type SshAuthorizedKey = {
  value: string;
  type: string;
  comment: string;
};

export type ApkRepositoryKey = {
  name: string;
  bytes: number;
};

export type UhttpdSettings = {
  installed: boolean;
  section: string;
  httpPorts: string;
  httpsPorts: string;
  redirectHttps: boolean;
};

export type LuciTheme = {
  name: string;
  active: boolean;
};

export type NetworkInterfaceSettings = {
  section: string;
  proto: string;
  device: string;
  ipaddr: string;
  netmask: string;
  gateway: string;
  dns: string;
  auto: boolean;
  forceLink: boolean;
  defaultRoute: boolean;
  useCustomDns: boolean;
  dnsMetric: string;
  metric: string;
  mptcp: string;
  ip4Table: string;
  ip6Table: string;
  delegate: boolean;
  ip6Assign: string;
  ip6Class: string;
  ip6Hint: string;
  ip6IfaceId: string;
  ip6Weight: string;
  firewallZone: string;
};

export type NetworkInterfaceOptions = {
  protocols: string[];
  devices: string[];
  firewallZones: Array<{ section: string; name: string }>;
};

export type NetworkInterfaceStatus = {
  section: string;
  proto: string;
  device: string;
  ipv4: string[];
  ipv6: string[];
  mac: string;
  up: boolean;
  uptimeSeconds: number | null;
};

export type NetworkDeviceSettings = {
  section: string;
  name: string;
  type: string;
  macaddr: string;
  mtu: string;
  ipv6: boolean;
};

export type NetworkGlobalSettings = {
  section: string;
  ulaPrefix: string;
  packetSteering: boolean;
};

export type ScheduledAction = "reboot" | "wan-reconnect" | "ddns-refresh";

const SAFE_SECTION = /^[A-Za-z0-9_@.\-\[\]]{1,64}$/;
const SAFE_SERVICE = /^[A-Za-z0-9_.-]{1,80}$/;
const SAFE_VALUE = /^[A-Za-z0-9_./:@,+\-\[\] ]{0,240}$/;
const SAFE_CRON_FIELD = /^[0-9*/?,\- ]{1,50}$/;
const SAFE_KEY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SAFE_LED_OPTION = /^[A-Za-z0-9_.:-]{1,128}$/;

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function uciSet(path: string, value: string): string {
  return `uci set ${quote(`${path}=${value}`)}`;
}

function uciDelete(path: string): string {
  return `uci -q delete ${quote(path)}`;
}

function assertSection(section: string): void {
  if (!SAFE_SECTION.test(section)) throw new Error("配置段标识不合法。");
}

function assertValue(value: string, label: string): void {
  if (!SAFE_VALUE.test(value)) throw new Error(`${label}包含不支持的字符。`);
}

function assertPort(value: string, label: string): void {
  if (!/^[1-9]\d{0,4}$/.test(value) || Number(value) > 65535)
    throw new Error(`${label}必须为 1-65535。`);
}

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on", "enabled"].includes(
    (value ?? "").trim().toLowerCase(),
  );
}

function parseRecords(
  prefix: string,
  output: string,
): Map<string, Record<string, string>> {
  const rows = new Map<string, Record<string, string>>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(
      new RegExp(`^${prefix}\\|([^|]+)\\|([^|]+)\\|(.*)$`),
    );
    if (!match || !SAFE_SECTION.test(match[1])) continue;
    const current = rows.get(match[1]) ?? {};
    current[match[2]] = match[3];
    rows.set(match[1], current);
  }
  return rows;
}

function parseValueMap(prefix: string, output: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(new RegExp(`^${prefix}\\|([^|]+)\\|(.*)$`));
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function parseAddressList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const address = (entry as Record<string, unknown>).address;
    return typeof address === "string" && address ? [address] : [];
  });
}

export function buildStartupSnapshotCommand(): string {
  return `for link in /etc/rc.d/S*; do [ -L "$link" ] || continue; target=$(readlink "$link"); name=$(basename "$target"); printf 'STARTUP|%s|enabled\\n' "$name"; done; for file in /etc/init.d/*; do [ -x "$file" ] || continue; name=$(basename "$file"); [ -e "/etc/rc.d/S"*"$name" ] || printf 'STARTUP|%s|disabled\\n' "$name"; done | sort -t'|' -k2,2`;
}

export function parseStartupServices(output: string): StartupService[] {
  const found = new Map<string, StartupService>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^STARTUP\|([^|]+)\|(enabled|disabled)$/);
    if (match && SAFE_SERVICE.test(match[1]))
      found.set(match[1], { name: match[1], enabled: match[2] === "enabled" });
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildStartupActionCommand(
  service: string,
  shouldEnable: boolean,
): string {
  if (!SAFE_SERVICE.test(service)) throw new Error("服务名称不合法。");
  return `[ -x /etc/init.d/${service} ] || { echo '服务未安装。'; exit 2; }; /etc/init.d/${service} ${shouldEnable ? "enable" : "disable"}; echo '${service} 已${shouldEnable ? "加入" : "移出"}开机启动。'`;
}

export function buildLedSnapshotCommand(): string {
  return `uci -q show system | awk -F= '/=led$/{section=$1; sub(/^system\\./,"",section); print "LED|" section "|name|" section} /^system\\.[^.]+\\.(name|sysfs|trigger|delayon|delayoff|dev|mode)=/{key=$1; sub(/^system\\.[^.]+\\./,"",key); value=$2; gsub(/\\047/,"",value); split($1,p,"."); print "LED|" p[2] "|" key "|" value}'`;
}

export function parseLedSettings(output: string): LedSetting[] {
  return [...parseRecords("LED", output).entries()].map(([section, value]) => {
    const trigger = value.trigger ?? "none";
    return {
      section,
      name: value.name ?? section,
      sysfs: value.sysfs ?? "",
      trigger,
      delayOn: trigger === "timer" ? (value.delayon ?? "1000") : "",
      delayOff: trigger === "timer" ? (value.delayoff ?? "1000") : "",
      netdevDevice: trigger === "netdev" ? (value.dev ?? "") : "",
      netdevMode: trigger === "netdev" ? (value.mode ?? "link") : "",
    };
  });
}

export function buildLedCapabilitiesSnapshotCommand(): string {
  return `for led in /sys/class/leds/*; do [ -d "$led" ] || continue; name=$(basename "$led"); printf 'LEDCAP|device|%s\\n' "$name"; [ -r "$led/trigger" ] || continue; tr ' ' '\\n' < "$led/trigger" | tr -d '[]' | awk '/^[A-Za-z0-9_.:-]+$/ { print "LEDCAP|trigger|" $0 }'; done; ip -o link 2>/dev/null | awk -F': ' '{name=$2; sub(/@.*/, "", name); if (name ~ /^[A-Za-z0-9_.:-]+$/) print "LEDCAP|netdev|" name}' | sort -u`;
}

export function parseLedCapabilities(output: string): LedCapabilities {
  const devices = new Set<string>();
  const triggers = new Set<string>();
  const networkDevices = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^LEDCAP\|(device|trigger|netdev)\|([^|]+)$/);
    if (!match || !SAFE_LED_OPTION.test(match[2])) continue;
    if (match[1] === "device") devices.add(match[2]);
    else if (match[1] === "netdev") networkDevices.add(match[2]);
    else if (
      ["default-on", "heartbeat", "netdev", "none", "timer"].includes(match[2])
    )
      triggers.add(match[2]);
  }
  return {
    devices: [...devices].sort((a, b) => a.localeCompare(b)),
    triggers: [...triggers].sort((a, b) => a.localeCompare(b)),
    networkDevices: [...networkDevices].sort((a, b) => a.localeCompare(b)),
  };
}

export function buildSaveLedCommand(
  settings: Pick<
    LedSetting,
    | "section"
    | "name"
    | "sysfs"
    | "trigger"
    | "delayOn"
    | "delayOff"
    | "netdevDevice"
    | "netdevMode"
  >,
): string {
  assertSection(settings.section);
  assertValue(settings.name, "LED 名称");
  assertValue(settings.sysfs, "LED 设备");
  assertValue(settings.trigger, "LED 触发器");
  assertLedIntervals(settings.trigger, settings.delayOn, settings.delayOff);
  assertLedNetdev(settings.trigger, settings.netdevDevice, settings.netdevMode);
  const base = `system.${settings.section}`;
  const timerWrites =
    settings.trigger === "timer"
      ? `${uciSet(`${base}.delayon`, settings.delayOn)}; ${uciSet(`${base}.delayoff`, settings.delayOff)};`
      : `${uciDelete(`${base}.delayon`)}; ${uciDelete(`${base}.delayoff`)};`;
  const netdevWrites =
    settings.trigger === "netdev"
      ? `${uciSet(`${base}.dev`, settings.netdevDevice)}; ${uciSet(`${base}.mode`, settings.netdevMode)};`
      : `${uciDelete(`${base}.dev`)}; ${uciDelete(`${base}.mode`)};`;
  return `uci -q get ${quote(base)} >/dev/null || { echo 'LED 配置不存在。'; exit 2; }; existing=$(uci -q get ${quote(`${base}.name`)}); if uci -q show system | sed -n "s/^system\\.[^.]*\\.name='\\(.*\\)'$/\\1/p" | grep -Fx ${quote(settings.name)} | grep -Fvx "$existing" >/dev/null; then echo 'LED 名称已存在。'; exit 2; fi; ${uciSet(`${base}.name`, settings.name)}; ${uciSet(`${base}.sysfs`, settings.sysfs)}; ${uciSet(`${base}.trigger`, settings.trigger)}; ${timerWrites} ${netdevWrites} ${uciDelete(`${base}.color`)}; ${uciDelete(`${base}.default`)}; uci commit system; ([ -x /etc/init.d/led ] && /etc/init.d/led restart) || /etc/init.d/system reload; echo 'LED 设置已保存并重新加载。'`;
}

export function buildAddLedCommand(settings: NewLedSettings): string {
  assertValue(settings.name, "LED 名称");
  assertValue(settings.sysfs, "LED 设备");
  assertValue(settings.trigger, "LED 触发器");
  assertLedIntervals(settings.trigger, settings.delayOn, settings.delayOff);
  assertLedNetdev(settings.trigger, settings.netdevDevice, settings.netdevMode);
  const timerWrites =
    settings.trigger === "timer"
      ? `uci set "system.$section.delayon=${settings.delayOn}"; uci set "system.$section.delayoff=${settings.delayOff}";`
      : "";
  const netdevWrites =
    settings.trigger === "netdev"
      ? `uci set "system.$section.dev=${settings.netdevDevice}"; uci set "system.$section.mode=${settings.netdevMode}";`
      : "";
  return `if uci -q show system | sed -n "s/^system\\.[^.]*\\.name='\\(.*\\)'$/\\1/p" | grep -Fx ${quote(settings.name)} >/dev/null; then echo 'LED 名称已存在。'; exit 2; fi; section=$(uci add system led); uci set "system.$section.name=${settings.name}"; uci set "system.$section.sysfs=${settings.sysfs}"; uci set "system.$section.trigger=${settings.trigger}"; ${timerWrites} ${netdevWrites} uci commit system; ([ -x /etc/init.d/led ] && /etc/init.d/led restart) || /etc/init.d/system reload; echo 'LED 已新增并重新加载。'`;
}

function assertLedIntervals(
  trigger: string,
  delayOn: string,
  delayOff: string,
): void {
  if (trigger !== "timer") return;
  for (const [label, value] of [
    ["开启时间", delayOn],
    ["关闭时间", delayOff],
  ]) {
    if (!/^\d{1,8}$/.test(value) || Number(value) < 1)
      throw new Error(`${label}必须为正整数毫秒。`);
  }
}

function assertLedNetdev(trigger: string, device: string, mode: string): void {
  if (trigger !== "netdev") return;
  if (!SAFE_LED_OPTION.test(device))
    throw new Error("网络设备活动必须选择有效的网络设备。");
  if (!/^(link|tx|rx|link tx|link rx|tx rx|link tx rx)$/.test(mode))
    throw new Error("网络设备活动触发方式不合法。");
}

export function buildDeleteLedCommand(section: string): string {
  assertSection(section);
  const base = `system.${section}`;
  return `uci -q get ${quote(base)} >/dev/null || { echo 'LED 配置不存在。'; exit 2; }; ${uciDelete(base)}; uci commit system; ([ -x /etc/init.d/led ] && /etc/init.d/led restart) || /etc/init.d/system reload; echo 'LED 已删除。'`;
}

export function buildMountSnapshotCommand(): string {
  return `uci -q show fstab | awk -F= '/=mount$/{section=$1; sub(/^fstab\\./,"",section); print "MOUNT|" section "|section|" section} /^fstab\\.[^.]+\\.(target|device|uuid|fstype|enabled|enabled_fsck)=/{key=$1; sub(/^fstab\\.[^.]+\\./,"",key); value=$2; gsub(/\\047/,"",value); split($1,p,"."); print "MOUNT|" p[2] "|" key "|" value}'; awk '{print "MOUNTED|" $2 "|" $1 "|" $3}' /proc/mounts 2>/dev/null; swapon --noheadings --raw --output NAME 2>/dev/null | awk 'NF {print "SWAP|" $1}'`;
}

export function parseMountPoints(output: string): MountPoint[] {
  return [...parseRecords("MOUNT", output).entries()].map(
    ([section, value]) => ({
      section,
      target: value.target ?? "",
      device: value.device || value.uuid || "",
      fstype: value.fstype ?? "auto",
      enabled: value.enabled !== "0",
      enabledFsck: value.enabled_fsck === "1",
    }),
  );
}

export function parseMountedFileSystems(output: string): MountedFileSystem[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^MOUNTED\|([^|]+)\|([^|]+)\|([^|]+)$/);
    return match
      ? [{ target: match[1], device: match[2], fstype: match[3] }]
      : [];
  });
}

export function parseSwapPartitions(output: string): SwapPartition[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^SWAP\|([^|]+)$/);
    return match ? [{ device: match[1] }] : [];
  });
}

export function buildMountActionCommand(
  section: string,
  shouldEnable: boolean,
): string {
  assertSection(section);
  const base = `fstab.${section}`;
  return `uci -q get ${quote(base)} >/dev/null || { echo '挂载点配置不存在。'; exit 2; }; cp /etc/config/fstab /etc/config/fstab.app-backup.$(date +%s); ${uciSet(`${base}.enabled`, shouldEnable ? "1" : "0")}; uci commit fstab; /etc/init.d/fstab restart; block mount 2>/dev/null || true; echo '挂载点已${shouldEnable ? "启用" : "停用"}。'`;
}

function assertMountPoint(settings: Omit<MountPoint, "section">): void {
  assertValue(settings.target, "挂载路径");
  assertValue(settings.device, "设备或 UUID");
  assertValue(settings.fstype, "文件系统类型");
  if (!settings.target.startsWith("/"))
    throw new Error("挂载路径必须以 / 开头。");
}

function mountWrites(
  base: string,
  settings: Omit<MountPoint, "section">,
): string {
  return [
    uciSet(`${base}.target`, settings.target),
    uciSet(`${base}.device`, settings.device),
    uciSet(`${base}.fstype`, settings.fstype),
    uciSet(`${base}.enabled`, settings.enabled ? "1" : "0"),
    uciSet(`${base}.enabled_fsck`, settings.enabledFsck ? "1" : "0"),
  ].join("; ");
}

export function buildAddMountCommand(
  settings: Omit<MountPoint, "section">,
): string {
  assertMountPoint(settings);
  return `section=$(uci add fstab mount); ${mountWrites("fstab.$section", settings)}; uci commit fstab; /etc/init.d/fstab restart; block mount 2>/dev/null || true; echo '挂载点已新增。'`;
}

export function buildSaveMountCommand(settings: MountPoint): string {
  assertSection(settings.section);
  assertMountPoint(settings);
  const base = `fstab.${settings.section}`;
  return `uci -q get ${quote(base)} >/dev/null || { echo '挂载点配置不存在。'; exit 2; }; ${mountWrites(base, settings)}; uci commit fstab; /etc/init.d/fstab restart; block mount 2>/dev/null || true; echo '挂载点已保存。'`;
}

export function buildDeleteMountCommand(section: string): string {
  assertSection(section);
  const base = `fstab.${section}`;
  return `uci -q get ${quote(base)} >/dev/null || { echo '挂载点配置不存在。'; exit 2; }; ${uciDelete(base)}; uci commit fstab; /etc/init.d/fstab restart; echo '挂载点已删除。'`;
}

export function buildGenerateMountConfigCommand(): string {
  return `block detect > /etc/config/fstab; uci commit fstab; /etc/init.d/fstab restart; echo '已根据已连接设备生成挂载配置。'`;
}

export function buildMountConnectedDevicesCommand(): string {
  return `block mount; echo '已尝试挂载已连接的设备与交换分区。'`;
}

export function buildAutoMountUnconfiguredCommand(): string {
  return `block mount; swapon -a 2>/dev/null || true; echo '已尝试自动挂载未配置的磁盘分区和交换分区。'`;
}

export function buildSshAccessSnapshotCommand(): string {
  return `[ -x /etc/init.d/dropbear ] && echo 'SSH|installed|yes' || echo 'SSH|installed|no'; uci -q show dropbear 2>/dev/null | awk -F= '/=dropbear$/{section=$1; sub(/^dropbear\\./,"",section); print "SSHINSTANCE|" section "|section|" section} /^dropbear\\.[^.]+\\.(Port|Interface|PasswordAuth|RootPasswordAuth|GatewayPorts|enable)=/{key=$1; sub(/^dropbear\\.[^.]+\\./,"",key); value=$2; gsub(/\\047/,"",value); split($1,p,"."); print "SSHINSTANCE|" p[2] "|" key "|" value}'`;
}

export function parseSshAccessSettings(output: string): SshAccessSettings {
  const values = parseValueMap("SSH", output);
  const instances = [...parseRecords("SSHINSTANCE", output).entries()].map(
    ([section, value]) => ({
      section,
      port: value.Port || value.port || "22",
      interface: value.Interface || value.interface || "",
      passwordAuth: enabled(value.PasswordAuth ?? value.password),
      rootPasswordAuth: enabled(value.RootPasswordAuth ?? value.rootpassword),
      gatewayPorts: enabled(value.GatewayPorts ?? value.gatewayports),
      enabled: value.enable !== "0",
    }),
  );
  const primary = instances[0];
  return {
    installed: values.get("installed") === "yes",
    port: primary?.port || values.get("port") || "22",
    passwordAuth: primary?.passwordAuth ?? enabled(values.get("password")),
    rootPasswordAuth:
      primary?.rootPasswordAuth ?? enabled(values.get("rootpassword")),
    instances,
  };
}

export function buildSaveSshAccessCommand(
  settings: Pick<
    SshAccessSettings,
    "port" | "passwordAuth" | "rootPasswordAuth"
  >,
): string {
  assertPort(settings.port, "SSH 端口");
  return `[ -x /etc/init.d/dropbear ] || { echo 'Dropbear 未安装。'; exit 2; }; cp /etc/config/dropbear /etc/config/dropbear.app-backup.$(date +%s); ${uciSet("dropbear.@dropbear[0].Port", settings.port)}; ${uciSet("dropbear.@dropbear[0].PasswordAuth", settings.passwordAuth ? "on" : "off")}; ${uciSet("dropbear.@dropbear[0].RootPasswordAuth", settings.rootPasswordAuth ? "on" : "off")}; uci commit dropbear; /etc/init.d/dropbear restart; echo 'SSH 管理权限已保存。'`;
}

function assertDropbearInstance(
  settings: Pick<
    DropbearInstance,
    | "port"
    | "interface"
    | "passwordAuth"
    | "rootPasswordAuth"
    | "gatewayPorts"
    | "enabled"
  >,
): void {
  assertPort(settings.port, "SSH 端口");
  if (settings.interface.trim()) assertValue(settings.interface, "监听接口");
}

function dropbearInstanceWrites(
  base: string,
  settings: Pick<
    DropbearInstance,
    | "port"
    | "interface"
    | "passwordAuth"
    | "rootPasswordAuth"
    | "gatewayPorts"
    | "enabled"
  >,
): string {
  const interfaces = settings.interface.trim().split(/\s+/).filter(Boolean);
  return [
    uciSet(`${base}.Port`, settings.port),
    uciDelete(`${base}.Interface`),
    ...interfaces.map(
      (item) => `uci add_list ${quote(`${base}.Interface=${item}`)}`,
    ),
    uciSet(`${base}.PasswordAuth`, settings.passwordAuth ? "on" : "off"),
    uciSet(
      `${base}.RootPasswordAuth`,
      settings.rootPasswordAuth ? "on" : "off",
    ),
    uciSet(`${base}.GatewayPorts`, settings.gatewayPorts ? "on" : "off"),
    uciSet(`${base}.enable`, settings.enabled ? "1" : "0"),
  ].join("; ");
}

export function buildSaveSshInstanceCommand(
  settings: DropbearInstance,
): string {
  assertSection(settings.section);
  assertDropbearInstance(settings);
  const base = `dropbear.${settings.section}`;
  return `[ -x /etc/init.d/dropbear ] || { echo 'Dropbear 未安装。'; exit 2; }; uci -q get ${quote(base)} >/dev/null || { echo 'SSH 实例不存在。'; exit 2; }; ${dropbearInstanceWrites(base, settings)}; uci commit dropbear; /etc/init.d/dropbear restart; echo 'SSH 实例已保存。'`;
}

export function buildAddSshInstanceCommand(
  settings: Omit<DropbearInstance, "section">,
): string {
  assertDropbearInstance(settings);
  return `[ -x /etc/init.d/dropbear ] || { echo 'Dropbear 未安装。'; exit 2; }; section=$(uci add dropbear dropbear); ${dropbearInstanceWrites("dropbear.$section", settings)}; uci commit dropbear; /etc/init.d/dropbear restart; echo 'SSH 实例已新增。'`;
}

export function buildSshInstanceActionCommand(
  section: string,
  shouldEnable: boolean,
): string {
  assertSection(section);
  const base = `dropbear.${section}`;
  return `[ -x /etc/init.d/dropbear ] || { echo 'Dropbear 未安装。'; exit 2; }; uci -q get ${quote(base)} >/dev/null || { echo 'SSH 实例不存在。'; exit 2; }; ${uciSet(`${base}.enable`, shouldEnable ? "1" : "0")}; uci commit dropbear; /etc/init.d/dropbear restart; echo 'SSH 实例已${shouldEnable ? "启用" : "停用"}。'`;
}

export function buildChangeRouterPasswordCommand(newPassword: string): string {
  if (
    !newPassword ||
    newPassword.length > 128 ||
    /[\u0000\r\n:]/.test(newPassword)
  )
    throw new Error("路由器密码不能为空，且不能包含换行、冒号或空字符。");
  return `command -v chpasswd >/dev/null || { echo '系统未提供 chpasswd。'; exit 2; }; printf '%s\\n' ${quote(`root:${newPassword}`)} | chpasswd; echo '路由器 root 密码已修改。'`;
}

export function buildSshAuthorizedKeysSnapshotCommand(): string {
  return `[ -r /etc/dropbear/authorized_keys ] && sed 's/^/SSHKEY|/' /etc/dropbear/authorized_keys || true`;
}

export function parseSshAuthorizedKeys(output: string): SshAuthorizedKey[] {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.startsWith("SSHKEY|")) return [];
    const value = line.slice(7).trim();
    const [type = "", material = "", ...comment] = value.split(/\s+/);
    if (
      !/^[A-Za-z0-9@._+-]{2,100}$/.test(type) ||
      !/^[A-Za-z0-9+/=]{16,20000}$/.test(material)
    )
      return [];
    return [{ value, type, comment: comment.join(" ") }];
  });
}

export function buildAddSshAuthorizedKeyCommand(publicKey: string): string {
  const normalized = publicKey.trim();
  if (
    !/^[A-Za-z0-9@._+-]{2,100} [A-Za-z0-9+/=]{16,20000}(?: [^\r\n]{0,160})?$/.test(
      normalized,
    )
  )
    throw new Error("SSH 公钥格式无效，请粘贴完整的一行 OpenSSH 公钥。");
  return `mkdir -p /etc/dropbear; touch /etc/dropbear/authorized_keys; chmod 600 /etc/dropbear/authorized_keys; grep -qxF ${quote(normalized)} /etc/dropbear/authorized_keys 2>/dev/null || printf '%s\\n' ${quote(normalized)} >> /etc/dropbear/authorized_keys; echo 'SSH 公钥已添加。'`;
}

export function buildApkRepositoryKeysSnapshotCommand(): string {
  return `for key in /etc/apk/keys/*; do [ -f "$key" ] || continue; name=$(basename "$key"); case "$name" in ''|*[!A-Za-z0-9._-]*) continue ;; esac; size=$(wc -c < "$key" | tr -d ' '); printf 'APKKEY|%s|%s\\n' "$name" "$size"; done`;
}

export function parseApkRepositoryKeys(output: string): ApkRepositoryKey[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^APKKEY\|([^|]+)\|(\d+)$/);
    if (!match || !SAFE_KEY_NAME.test(match[1])) return [];
    return [{ name: match[1], bytes: Number(match[2]) }];
  });
}

export function buildAddApkRepositoryKeyCommand(
  name: string,
  publicKey: string,
): string {
  const normalizedName = name.trim().endsWith(".pub")
    ? name.trim()
    : `${name.trim()}.pub`;
  if (!SAFE_KEY_NAME.test(normalizedName))
    throw new Error("APK 公钥文件名仅支持字母、数字、点、下划线和连字符。");
  if (
    !publicKey.trim() ||
    publicKey.length > 20_000 ||
    /\u0000/.test(publicKey)
  )
    throw new Error("APK 公钥内容无效或过长。");
  return `mkdir -p /etc/apk/keys; cp /etc/apk/keys/${normalizedName} /etc/apk/keys/${normalizedName}.app-backup.$(date +%s) 2>/dev/null || true; printf '%s' ${quote(publicKey.trim())} > /etc/apk/keys/${normalizedName}; chmod 644 /etc/apk/keys/${normalizedName}; echo 'APK 仓库公钥已保存。'`;
}

export function buildFetchApkRepositoryKeyCommand(
  name: string,
  sourceUrl: string,
): string {
  const normalizedName = name.trim().endsWith(".pub")
    ? name.trim()
    : `${name.trim()}.pub`;
  if (!SAFE_KEY_NAME.test(normalizedName))
    throw new Error("APK 公钥文件名仅支持字母、数字、点、下划线和连字符。");
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl.trim());
  } catch {
    throw new Error("公钥文件 URL 无效。");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  )
    throw new Error("公钥文件 URL 仅支持无认证的 HTTP(S) 地址。");
  const remote = parsed.toString();
  return `mkdir -p /etc/apk/keys; tmp=/tmp/${normalizedName}.app-download.$$; trap 'rm -f "$tmp"' EXIT; (command -v uclient-fetch >/dev/null 2>&1 && uclient-fetch -q -O "$tmp" ${quote(remote)}) || (command -v wget >/dev/null 2>&1 && wget -q -O "$tmp" ${quote(remote)}) || { echo '无法下载 APK 仓库公钥。'; exit 2; }; [ -s "$tmp" ] && [ "$(wc -c < "$tmp")" -le 20000 ] || { echo '下载的 APK 公钥为空或过长。'; exit 2; }; mv "$tmp" /etc/apk/keys/${normalizedName}; chmod 644 /etc/apk/keys/${normalizedName}; echo 'APK 仓库公钥已从 URL 导入。'`;
}

export function buildUhttpdSnapshotCommand(): string {
  return `[ -x /etc/init.d/uhttpd ] && echo 'UHTTPD|installed|yes' || echo 'UHTTPD|installed|no'; uci -q show uhttpd 2>/dev/null | awk -F= '/=uhttpd$/{section=$1; sub(/^uhttpd\\./,"",section); print "UHTTPD|" section "|section|" section} /^uhttpd\\.[^.]+\\.(listen_http|listen_https|redirect_https)=/{key=$1; sub(/^uhttpd\\.[^.]+\\./,"",key); value=$2; gsub(/\\047/,"",value); split($1,p,"."); print "UHTTPD|" p[2] "|" key "|" value}'`;
}

export function parseUhttpdSettings(output: string): UhttpdSettings {
  const values = parseValueMap("UHTTPD", output);
  const sections = parseRecords("UHTTPD", output);
  const [section, settings] = [...sections.entries()][0] ?? ["@uhttpd[0]", {}];
  return {
    installed: values.get("installed") === "yes",
    section,
    httpPorts: settings.listen_http ?? "0.0.0.0:80",
    httpsPorts: settings.listen_https ?? "0.0.0.0:443",
    redirectHttps: enabled(settings.redirect_https),
  };
}

function parseListenEntries(value: string, label: string): string[] {
  const entries = value.trim() ? value.trim().split(/\s+/) : [];
  for (const entry of entries) {
    const match = entry.match(
      /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+):([1-9]\d{0,4})$/,
    );
    if (!match || Number(match[1]) > 65535)
      throw new Error(`${label}格式应为主机:端口，例如 0.0.0.0:80。`);
  }
  return entries;
}

export function buildSaveUhttpdCommand(
  settings: Pick<UhttpdSettings, "section" | "redirectHttps">,
): string {
  assertSection(settings.section);
  const base = `uhttpd.${settings.section}`;
  return `[ -x /etc/init.d/uhttpd ] || { echo 'uhttpd 未安装。'; exit 2; }; uci -q get ${quote(base)} >/dev/null || { echo '未找到 uhttpd 配置。'; exit 2; }; ${uciSet(`${base}.redirect_https`, settings.redirectHttps ? "1" : "0")}; uci commit uhttpd; /etc/init.d/uhttpd reload; echo 'HTTPS 重定向设置已保存。'`;
}

export function buildLuciThemesSnapshotCommand(): string {
  return 'active=$(uci -q get luci.main.mediaurlbase 2>/dev/null || true); active="${active##*/}"; for dir in /www/luci-static/*; do [ -d "$dir" ] || continue; name=$(basename "$dir"); case "$name" in *[!A-Za-z0-9_-]*|\'\') continue;; esac; printf \'THEME|%s|%s\\n\' "$name" "$([ "$name" = "$active" ] && echo active || echo inactive)"; done | sort -t\'|\' -k2,2';
}

export function parseLuciThemes(output: string): LuciTheme[] {
  const themes = new Map<string, LuciTheme>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(
      /^THEME\|([A-Za-z0-9_-]{1,64})\|(active|inactive)$/,
    );
    if (!match) continue;
    themes.set(match[1], { name: match[1], active: match[2] === "active" });
  }
  return [...themes.values()].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function buildSetLuciThemeCommand(theme: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(theme)) {
    throw new Error("LuCI 主题名称不合法。");
  }
  const target = `/www/luci-static/${theme}`;
  return `[ -d ${quote(target)} ] || { echo '未找到此 LuCI 主题。'; exit 2; }; uci -q get luci.main >/dev/null || uci set luci.main=core; ${uciSet("luci.main.mediaurlbase", `/luci-static/${theme}`)}; uci commit luci; /etc/init.d/uhttpd reload 2>/dev/null || true; echo 'LuCI 主题已切换。'`;
}

export function buildNetworkInterfaceSnapshotCommand(): string {
  return `uci -q show network | awk -F= '/=interface$/{section=$1; sub(/^network\\./,"",section); print "IFACE|" section "|section|" section} /^network\\.[^.]+\\.(proto|device|ifname|ipaddr|netmask|gateway|dns|auto|force_link|defaultroute|peerdns|dns_metric|metric|mptcp|ip4table|ip6table|delegate|ip6assign|ip6class|ip6hint|ip6ifaceid|ip6weight)=/{key=$1; sub(/^network\\.[^.]+\\./,"",key); value=$2; gsub(/\\047/,"",value); split($1,p,"."); print "IFACE|" p[2] "|" key "|" value}'`;
}

export function parseNetworkInterfaceSettings(
  output: string,
): NetworkInterfaceSettings[] {
  return [...parseRecords("IFACE", output).entries()].map(
    ([section, value]) => ({
      section,
      proto: value.proto ?? "none",
      device: value.device || value.ifname || "",
      ipaddr: value.ipaddr ?? "",
      netmask: value.netmask ?? "",
      gateway: value.gateway ?? "",
      dns: value.dns ?? "",
      auto: value.auto !== "0",
      forceLink: enabled(value.force_link),
      defaultRoute: value.defaultroute !== "0",
      useCustomDns: value.peerdns === "0",
      dnsMetric: value.dns_metric ?? "",
      metric: value.metric ?? "",
      mptcp: value.mptcp ?? "off",
      ip4Table: value.ip4table ?? "",
      ip6Table: value.ip6table ?? "",
      delegate: value.delegate !== "0",
      ip6Assign: value.ip6assign ?? "",
      ip6Class: value.ip6class ?? "",
      ip6Hint: value.ip6hint ?? "",
      ip6IfaceId: value.ip6ifaceid ?? "",
      ip6Weight: value.ip6weight ?? "",
      firewallZone: "",
    }),
  );
}

export function buildNetworkInterfaceOptionsSnapshotCommand(): string {
  return `for proto in /lib/netifd/proto/*.sh; do [ -f "$proto" ] || continue; name=$(basename "$proto" .sh); case "$name" in *[!A-Za-z0-9_-]*|'') continue;; esac; printf 'IFOPTION|protocol|%s\\n' "$name"; done; uci -q show network | sed -n "s/^network\\.[^.]*\\.\\(device\\|ifname\\)='\\([^']*\\)'$/\\2/p" | tr ' ' '\\n' | awk '/^[A-Za-z0-9_.:@-]+$/ {print "IFOPTION|device|" $0}'; ip -o link 2>/dev/null | awk -F': ' '{name=$2; sub(/@.*/, "", name); if (name ~ /^[A-Za-z0-9_.:@-]+$/) print "IFOPTION|device|" name}'; uci -q show firewall | awk -F= '/=zone$/{section=$1; sub(/^firewall\\./,"",section); name=section; if (section ~ /^[A-Za-z0-9_.-]+$/) print "IFZONE|" section "|" name} /^firewall\\.[^.]+\\.name=/{section=$1; sub(/^firewall\\./,"",section); sub(/\\.name$/,"",section); name=$2; gsub(/\\047/,"",name); print "IFZONE|" section "|" name}' | sort -u`;
}

export function parseNetworkInterfaceOptions(
  output: string,
): NetworkInterfaceOptions {
  const protocols = new Set(["dhcp", "static", "pppoe", "none", "unmanaged"]);
  const devices = new Set<string>();
  const zones = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const option = line.match(/^IFOPTION\|(protocol|device)\|([^|]+)$/);
    if (option && SAFE_LED_OPTION.test(option[2])) {
      if (option[1] === "protocol") protocols.add(option[2]);
      else devices.add(option[2]);
      continue;
    }
    const zone = line.match(/^IFZONE\|([^|]+)\|([^|]+)$/);
    if (zone && SAFE_SECTION.test(zone[1]) && SAFE_VALUE.test(zone[2])) {
      zones.set(zone[1], zone[2]);
    }
  }
  return {
    protocols: [...protocols].sort((left, right) => left.localeCompare(right)),
    devices: [...devices].sort((left, right) => left.localeCompare(right)),
    firewallZones: [...zones.entries()]
      .map(([section, name]) => ({ section, name }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function buildNetworkInterfaceStatusCommand(): string {
  return 'ubus call network.interface dump; ip -o link 2>/dev/null | awk \'{name=$2; sub(/:$/, "", name); sub(/@.*/, "", name); for (i=1; i<=NF; i++) if ($i == "link/ether") { print "IFMAC|" name "|" $(i+1); break }}\'';
}

export function parseNetworkInterfaceStatus(
  output: string,
): NetworkInterfaceStatus[] {
  const marker = output.search(/\r?\nIFMAC\|/);
  const jsonSource = marker >= 0 ? output.slice(0, marker) : output;
  const start = jsonSource.indexOf("{");
  const end = jsonSource.lastIndexOf("}");
  if (start < 0 || end < start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSource.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const interfaces = (parsed as Record<string, unknown>).interface;
  if (!Array.isArray(interfaces)) return [];
  const macByDevice = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^IFMAC\|([^|]+)\|([0-9A-Fa-f:]{17})$/);
    if (match) macByDevice.set(match[1], match[2]);
  }
  return interfaces.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const value = entry as Record<string, unknown>;
    const section = typeof value.interface === "string" ? value.interface : "";
    if (!section || !SAFE_SECTION.test(section)) return [];
    const device =
      typeof value.l3_device === "string"
        ? value.l3_device
        : typeof value.device === "string"
          ? value.device
          : "";
    return [
      {
        section,
        proto: typeof value.proto === "string" ? value.proto : "unknown",
        device,
        ipv4: parseAddressList(value["ipv4-address"]),
        ipv6: parseAddressList(value["ipv6-address"]),
        mac: device ? (macByDevice.get(device) ?? "") : "",
        up: value.up === true,
        uptimeSeconds:
          typeof value.uptime === "number" && Number.isFinite(value.uptime)
            ? value.uptime
            : null,
      },
    ];
  });
}

export function buildSaveNetworkInterfaceCommand(
  settings: NetworkInterfaceSettings,
): string {
  assertSection(settings.section);
  if (!SAFE_LED_OPTION.test(settings.proto))
    throw new Error("接口协议不合法。");
  if (settings.firewallZone) assertSection(settings.firewallZone);
  for (const [label, value] of Object.entries({
    设备: settings.device,
    "IPv4 地址": settings.ipaddr,
    掩码: settings.netmask,
    网关: settings.gateway,
    DNS: settings.dns,
    "DNS 权重": settings.dnsMetric,
    网关跃点: settings.metric,
    "IPv4 路由表": settings.ip4Table,
    "IPv6 路由表": settings.ip6Table,
    "IPv6 前缀长度": settings.ip6Assign,
    "IPv6 前缀过滤器": settings.ip6Class,
    "IPv6 后缀": settings.ip6IfaceId,
    "IPv6 优先级": settings.ip6Weight,
  }))
    assertValue(value, label);
  const base = `network.${settings.section}`;
  const setOrDelete = (key: string, value: string) =>
    value ? uciSet(`${base}.${key}`, value) : uciDelete(`${base}.${key}`);
  const firewallWrites = `for zone in $(uci -q show firewall | sed -n "s/^firewall\\.\\([^.]*\\)=zone$/\\1/p"); do networks=$(uci -q get "firewall.$zone.network"); uci -q delete "firewall.$zone.network"; for network in $networks; do [ "$network" = ${quote(settings.section)} ] || uci add_list "firewall.$zone.network=$network"; done; done; ${settings.firewallZone ? `uci -q get ${quote(`firewall.${settings.firewallZone}`)} >/dev/null || { echo '防火墙区域不存在。'; exit 2; }; uci add_list ${quote(`firewall.${settings.firewallZone}.network=${settings.section}`)};` : ""} uci commit firewall; /etc/init.d/firewall reload 2>/dev/null || true;`;
  return `uci -q get ${quote(base)} >/dev/null || { echo '接口配置不存在。'; exit 2; }; cp /etc/config/network /etc/config/network.app-backup.$(date +%s); ${uciSet(`${base}.proto`, settings.proto)}; ${setOrDelete("device", settings.device)}; ${setOrDelete("ipaddr", settings.ipaddr)}; ${setOrDelete("netmask", settings.netmask)}; ${setOrDelete("gateway", settings.gateway)}; ${setOrDelete("dns", settings.dns)}; ${uciSet(`${base}.auto`, settings.auto ? "1" : "0")}; ${uciSet(`${base}.force_link`, settings.forceLink ? "1" : "0")}; ${uciSet(`${base}.defaultroute`, settings.defaultRoute ? "1" : "0")}; ${uciSet(`${base}.peerdns`, settings.useCustomDns ? "0" : "1")}; ${setOrDelete("dns_metric", settings.dnsMetric)}; ${setOrDelete("metric", settings.metric)}; ${setOrDelete("mptcp", settings.mptcp === "off" ? "" : settings.mptcp)}; ${setOrDelete("ip4table", settings.ip4Table)}; ${setOrDelete("ip6table", settings.ip6Table)}; ${uciSet(`${base}.delegate`, settings.delegate ? "1" : "0")}; ${setOrDelete("ip6assign", settings.ip6Assign)}; ${setOrDelete("ip6class", settings.ip6Class)}; ${setOrDelete("ip6hint", settings.ip6Hint)}; ${setOrDelete("ip6ifaceid", settings.ip6IfaceId)}; ${setOrDelete("ip6weight", settings.ip6Weight)}; uci commit network; ${firewallWrites} /etc/init.d/network reload; echo '接口设置已保存，网络可能短暂重连。'`;
}

export function buildNetworkInterfaceRestartCommand(section: string): string {
  assertSection(section);
  return `ifdown ${quote(section)} 2>/dev/null || true; sleep 1; ifup ${quote(section)}; echo '接口 ${section} 已重启。'`;
}

export function buildNetworkInterfaceDeleteCommand(section: string): string {
  assertSection(section);
  const base = `network.${section}`;
  return `uci -q get ${quote(base)} >/dev/null || { echo '接口配置不存在。'; exit 2; }; cp /etc/config/network /etc/config/network.app-backup.$(date +%s); ${uciDelete(base)}; uci commit network; /etc/init.d/network reload; echo '接口 ${section} 已删除，网络可能短暂重连。'`;
}

export function buildNetworkDeviceSnapshotCommand(): string {
  return `uci -q show network | awk -F= '/=device$/{section=$1; sub(/^network\\./,"",section); print "DEVICE|" section "|section|" section} /^network\\.[^.]+\\.(name|type|macaddr|mtu|ipv6)=/{key=$1; sub(/^network\\.[^.]+\\./,"",key); value=$2; gsub(/\\047/,"",value); split($1,p,"."); print "DEVICE|" p[2] "|" key "|" value}'`;
}

export function parseNetworkDeviceSettings(
  output: string,
): NetworkDeviceSettings[] {
  return [...parseRecords("DEVICE", output).entries()].map(
    ([section, value]) => ({
      section,
      name: value.name ?? section,
      type: value.type ?? "",
      macaddr: value.macaddr ?? "",
      mtu: value.mtu ?? "",
      ipv6: value.ipv6 !== "0",
    }),
  );
}

export function buildSaveNetworkDeviceCommand(
  settings: NetworkDeviceSettings,
): string {
  assertSection(settings.section);
  assertValue(settings.name, "设备名称");
  assertValue(settings.type, "设备类型");
  if (
    settings.macaddr &&
    !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(settings.macaddr)
  )
    throw new Error("MAC 地址格式无效。");
  if (
    settings.mtu &&
    (!/^\d{3,5}$/.test(settings.mtu) || Number(settings.mtu) > 65535)
  )
    throw new Error("MTU 必须为 3-5 位且不超过 65535 的数字。");
  const base = `network.${settings.section}`;
  const setOrDelete = (key: string, value: string) =>
    value ? uciSet(`${base}.${key}`, value) : uciDelete(`${base}.${key}`);
  return `uci -q get ${quote(base)} >/dev/null || { echo '网络设备配置不存在。'; exit 2; }; cp /etc/config/network /etc/config/network.app-backup.$(date +%s); ${setOrDelete("name", settings.name)}; ${setOrDelete("type", settings.type)}; ${setOrDelete("macaddr", settings.macaddr)}; ${setOrDelete("mtu", settings.mtu)}; ${uciSet(`${base}.ipv6`, settings.ipv6 ? "1" : "0")}; uci commit network; /etc/init.d/network reload; echo '网络设备设置已保存。'`;
}

export function buildNetworkGlobalSnapshotCommand(): string {
  return `uci -q show network | awk -F= '/=globals$/{section=$1; sub(/^network\\./,"",section); print "GLOBAL|" section "|section|" section} /^network\\.[^.]+\\.(ula_prefix|packet_steering)=/{key=$1; sub(/^network\\.[^.]+\\./,"",key); value=$2; gsub(/\\047/,"",value); split($1,p,"."); print "GLOBAL|" p[2] "|" key "|" value}'`;
}

export function parseNetworkGlobalSettings(
  output: string,
): NetworkGlobalSettings {
  const [section, value] = [...parseRecords("GLOBAL", output).entries()][0] ?? [
    "globals",
    {},
  ];
  return {
    section,
    ulaPrefix: value.ula_prefix ?? "",
    packetSteering: enabled(value.packet_steering),
  };
}

export function buildSaveNetworkGlobalCommand(
  settings: NetworkGlobalSettings,
): string {
  assertSection(settings.section);
  assertValue(settings.ulaPrefix, "IPv6 ULA 前缀");
  if (
    settings.ulaPrefix &&
    !/^[Ff][CcDd][0-9A-Fa-f:]+\/[0-9]{1,3}$/.test(settings.ulaPrefix)
  )
    throw new Error("IPv6 ULA 前缀格式无效，例如 fd00:1234::/48。");
  const base = `network.${settings.section}`;
  const ulaCommand = settings.ulaPrefix
    ? uciSet(`${base}.ula_prefix`, settings.ulaPrefix)
    : uciDelete(`${base}.ula_prefix`);
  return `uci -q get ${quote(base)} >/dev/null || { echo '全局网络配置不存在。'; exit 2; }; cp /etc/config/network /etc/config/network.app-backup.$(date +%s); ${ulaCommand}; ${uciSet(`${base}.packet_steering`, settings.packetSteering ? "1" : "0")}; uci commit network; /etc/init.d/network reload; echo '全局网络设置已保存。'`;
}

const scheduledCommands: Record<ScheduledAction, string> = {
  reboot: "/sbin/reboot",
  "wan-reconnect": "ifdown wan; sleep 3; ifup wan",
  "ddns-refresh": "/etc/init.d/ddns restart",
};

export function buildScheduledActionCommand(
  minute: string,
  hour: string,
  weekdays: string,
  action: ScheduledAction,
): string {
  if (
    !SAFE_CRON_FIELD.test(minute) ||
    !SAFE_CRON_FIELD.test(hour) ||
    !SAFE_CRON_FIELD.test(weekdays)
  )
    throw new Error("计划时间格式不合法。");
  const tag = `# openwrt-status-app:${action}`;
  const line = `${minute} ${hour} * * ${weekdays} ${scheduledCommands[action]} ${tag}`;
  return `(crontab -l 2>/dev/null | grep -vF ${quote(tag)}; printf '%s\\n' ${quote(line)}) | crontab -; /etc/init.d/cron restart; echo '计划任务已保存。'`;
}

export function buildCronSnapshotCommand(): string {
  return `crontab -l 2>/dev/null | sed 's/^/CRON|/'`;
}

export function parseCronEntries(output: string): string[] {
  return output
    .split(/\r?\n/)
    .flatMap((line) => (line.startsWith("CRON|") ? [line.slice(5)] : []));
}
