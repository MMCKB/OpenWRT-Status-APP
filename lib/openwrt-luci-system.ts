export type AutorebootSettings = {
  installed: boolean;
  enabled: boolean;
  time: string;
  week: string;
};

export type StartupService = { name: string; enabled: boolean };

export type LedSetting = {
  section: string;
  name: string;
  sysfs: string;
  trigger: string;
  defaultValue: string;
};

export type MountPoint = {
  section: string;
  target: string;
  device: string;
  fstype: string;
  enabled: boolean;
  enabledFsck: boolean;
};

export type SshAccessSettings = {
  installed: boolean;
  port: string;
  passwordAuth: boolean;
  rootPasswordAuth: boolean;
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
};

export type ScheduledAction = "reboot" | "wan-reconnect" | "ddns-refresh";

const SAFE_SECTION = /^[A-Za-z0-9_@.-]{1,64}$/;
const SAFE_SERVICE = /^[A-Za-z0-9_.-]{1,80}$/;
const SAFE_VALUE = /^[A-Za-z0-9_./:@,+\- ]{0,240}$/;
const SAFE_CRON_FIELD = /^[0-9*/?,\- ]{1,50}$/;

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function assertSection(section: string): void {
  if (!SAFE_SECTION.test(section)) throw new Error("配置段标识不合法。");
}

function assertValue(value: string, label: string): void {
  if (!SAFE_VALUE.test(value)) throw new Error(`${label}包含不支持的字符。`);
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

export function buildAutorebootSnapshotCommand(): string {
  return `[ -f /etc/config/autoreboot ] && echo 'AUTOREBOOT|installed|yes' || echo 'AUTOREBOOT|installed|no'; uci -q get autoreboot.@global[0].enable 2>/dev/null | sed 's/^/AUTOREBOOT|enable|/'; uci -q get autoreboot.@global[0].time 2>/dev/null | sed 's/^/AUTOREBOOT|time|/'; uci -q get autoreboot.@global[0].week 2>/dev/null | sed 's/^/AUTOREBOOT|week|/'`;
}

export function parseAutorebootSettings(output: string): AutorebootSettings {
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^AUTOREBOOT\|([^|]+)\|(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return {
    installed: values.get("installed") === "yes",
    enabled: enabled(values.get("enable")),
    time: values.get("time") || "04:00",
    week: values.get("week") || "",
  };
}

export function buildSaveAutorebootCommand(
  settings: Pick<AutorebootSettings, "enabled" | "time" | "week">,
): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time))
    throw new Error("自动重启时间必须为 HH:MM。");
  if (settings.week && !/^[1-7](,[1-7])*$/.test(settings.week))
    throw new Error("重启星期仅支持 1-7，并以逗号分隔。");
  return `[ -f /etc/config/autoreboot ] || { echo '未安装 luci-app-autoreboot / autoreboot。'; exit 2; }; cp /etc/config/autoreboot /etc/config/autoreboot.app-backup.$(date +%s); uci set autoreboot.@global[0].enable=${settings.enabled ? "1" : "0"}; uci set autoreboot.@global[0].time=${quote(settings.time)}; uci set autoreboot.@global[0].week=${quote(settings.week)}; uci commit autoreboot; /etc/init.d/autoreboot restart 2>/dev/null || true; echo '自动重启设置已保存。'`;
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
  return `uci -q show system | awk -F= '/=led$/{section=$1; sub(/^system\\./,"",section); print "LED|" section "|name|" section} /^system\\.[^.]+\\.(name|sysfs|trigger|default)=/{key=$1; sub(/^system\\.[^.]+\\./,"",key); value=$2; gsub(/\\047/,"",value); split($1,p,"."); print "LED|" p[2] "|" key "|" value}'`;
}

export function parseLedSettings(output: string): LedSetting[] {
  return [...parseRecords("LED", output).entries()].map(([section, value]) => ({
    section,
    name: value.name ?? section,
    sysfs: value.sysfs ?? "",
    trigger: value.trigger ?? "none",
    defaultValue: value.default ?? "0",
  }));
}

export function buildSaveLedCommand(
  settings: Pick<LedSetting, "section" | "trigger" | "defaultValue">,
): string {
  assertSection(settings.section);
  assertValue(settings.trigger, "LED 触发器");
  if (!/^[01]$/.test(settings.defaultValue))
    throw new Error("LED 默认状态仅支持 0 或 1。");
  return `uci -q get system.${settings.section} >/dev/null || { echo 'LED 配置不存在。'; exit 2; }; cp /etc/config/system /etc/config/system.app-backup.$(date +%s); uci set system.${settings.section}.trigger=${quote(settings.trigger)}; uci set system.${settings.section}.default=${settings.defaultValue}; uci commit system; /etc/init.d/system reload; echo 'LED 设置已保存。'`;
}

export function buildMountSnapshotCommand(): string {
  return `uci -q show fstab | awk -F= '/=mount$/{section=$1; sub(/^fstab\\./,"",section); print "MOUNT|" section "|section|" section} /^fstab\\.[^.]+\\.(target|device|uuid|fstype|enabled|enabled_fsck)=/{key=$1; sub(/^fstab\\.[^.]+\\./,"",key); value=$2; gsub(/\\047/,"",value); split($1,p,"."); print "MOUNT|" p[2] "|" key "|" value}'`;
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

export function buildMountActionCommand(
  section: string,
  shouldEnable: boolean,
): string {
  assertSection(section);
  return `uci -q get fstab.${section} >/dev/null || { echo '挂载点配置不存在。'; exit 2; }; cp /etc/config/fstab /etc/config/fstab.app-backup.$(date +%s); uci set fstab.${section}.enabled=${shouldEnable ? "1" : "0"}; uci commit fstab; /etc/init.d/fstab restart; block mount 2>/dev/null || true; echo '挂载点已${shouldEnable ? "启用" : "停用"}。'`;
}

export function buildSshAccessSnapshotCommand(): string {
  return `[ -x /etc/init.d/dropbear ] && echo 'SSH|installed|yes' || echo 'SSH|installed|no'; uci -q get dropbear.@dropbear[0].Port 2>/dev/null | sed 's/^/SSH|port|/'; uci -q get dropbear.@dropbear[0].PasswordAuth 2>/dev/null | sed 's/^/SSH|password|/'; uci -q get dropbear.@dropbear[0].RootPasswordAuth 2>/dev/null | sed 's/^/SSH|rootpassword|/'`;
}

export function parseSshAccessSettings(output: string): SshAccessSettings {
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^SSH\|([^|]+)\|(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return {
    installed: values.get("installed") === "yes",
    port: values.get("port") || "22",
    passwordAuth: enabled(values.get("password")),
    rootPasswordAuth: enabled(values.get("rootpassword")),
  };
}

export function buildSaveSshAccessCommand(
  settings: Pick<
    SshAccessSettings,
    "port" | "passwordAuth" | "rootPasswordAuth"
  >,
): string {
  if (!/^[1-9]\d{0,4}$/.test(settings.port) || Number(settings.port) > 65535)
    throw new Error("SSH 端口必须为 1-65535。");
  return `[ -x /etc/init.d/dropbear ] || { echo 'Dropbear 未安装。'; exit 2; }; cp /etc/config/dropbear /etc/config/dropbear.app-backup.$(date +%s); uci set dropbear.@dropbear[0].Port=${quote(settings.port)}; uci set dropbear.@dropbear[0].PasswordAuth=${settings.passwordAuth ? "on" : "off"}; uci set dropbear.@dropbear[0].RootPasswordAuth=${settings.rootPasswordAuth ? "on" : "off"}; uci commit dropbear; /etc/init.d/dropbear restart; echo 'SSH 管理权限已保存。'`;
}

export function buildNetworkInterfaceSnapshotCommand(): string {
  return `uci -q show network | awk -F= '/=interface$/{section=$1; sub(/^network\\./,"",section); print "IFACE|" section "|section|" section} /^network\\.[^.]+\\.(proto|device|ifname|ipaddr|netmask|gateway|dns|auto)=/{key=$1; sub(/^network\\.[^.]+\\./,"",key); value=$2; gsub(/\\047/,"",value); split($1,p,"."); print "IFACE|" p[2] "|" key "|" value}'`;
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
    }),
  );
}

export function buildSaveNetworkInterfaceCommand(
  settings: NetworkInterfaceSettings,
): string {
  assertSection(settings.section);
  if (
    !["dhcp", "static", "pppoe", "none", "unmanaged"].includes(settings.proto)
  )
    throw new Error("不支持的接口协议。");
  for (const [label, value] of Object.entries({
    设备: settings.device,
    "IPv4 地址": settings.ipaddr,
    掩码: settings.netmask,
    网关: settings.gateway,
    DNS: settings.dns,
  }))
    assertValue(value, label);
  const base = `network.${settings.section}`;
  const setOrDelete = (key: string, value: string) =>
    value
      ? `uci set ${base}.${key}=${quote(value)}`
      : `uci -q delete ${base}.${key}`;
  return `uci -q get ${base} >/dev/null || { echo '接口配置不存在。'; exit 2; }; cp /etc/config/network /etc/config/network.app-backup.$(date +%s); uci set ${base}.proto=${quote(settings.proto)}; ${setOrDelete("device", settings.device)}; ${setOrDelete("ipaddr", settings.ipaddr)}; ${setOrDelete("netmask", settings.netmask)}; ${setOrDelete("gateway", settings.gateway)}; ${setOrDelete("dns", settings.dns)}; uci set ${base}.auto=${settings.auto ? "1" : "0"}; uci commit network; /etc/init.d/network reload; echo '接口设置已保存，网络可能短暂重连。'`;
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
