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

export function buildAutorebootSnapshotCommand(): string {
  return `[ -f /etc/config/autoreboot ] && echo 'AUTOREBOOT|installed|yes' || echo 'AUTOREBOOT|installed|no'; section=$(uci -q show autoreboot 2>/dev/null | sed -n 's/^autoreboot\\.\\([^.=]*\\)=\\(global\\|autoreboot\\)$/\\1/p' | head -n 1); [ -n "$section" ] || exit 0; uci -q get "autoreboot.$section.enable" 2>/dev/null | sed 's/^/AUTOREBOOT|enable|/'; uci -q get "autoreboot.$section.enabled" 2>/dev/null | sed 's/^/AUTOREBOOT|enabled|/'; uci -q get "autoreboot.$section.time" 2>/dev/null | sed 's/^/AUTOREBOOT|time|/'; uci -q get "autoreboot.$section.week" 2>/dev/null | sed 's/^/AUTOREBOOT|week|/'; uci -q get "autoreboot.$section.weekdays" 2>/dev/null | sed 's/^/AUTOREBOOT|weekdays|/'`;
}

export function parseAutorebootSettings(output: string): AutorebootSettings {
  const values = parseValueMap("AUTOREBOOT", output);
  return {
    installed: values.get("installed") === "yes",
    enabled: enabled(values.get("enable") ?? values.get("enabled")),
    time: values.get("time") || "04:00",
    week: values.get("week") || values.get("weekdays") || "",
  };
}

export function buildSaveAutorebootCommand(
  settings: Pick<AutorebootSettings, "enabled" | "time" | "week">,
): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time))
    throw new Error("自动重启时间必须为 HH:MM。");
  if (settings.week && !/^[1-7](,[1-7])*$/.test(settings.week))
    throw new Error("重启星期仅支持 1-7，并以逗号分隔。");
  return `[ -f /etc/config/autoreboot ] || { echo '未安装 luci-app-autoreboot / autoreboot。'; exit 2; }; section=$(uci -q show autoreboot 2>/dev/null | sed -n 's/^autoreboot\\.\\([^.=]*\\)=\\(global\\|autoreboot\\)$/\\1/p' | head -n 1); [ -n "$section" ] || { echo '未找到自动重启配置段。'; exit 2; }; cp /etc/config/autoreboot /etc/config/autoreboot.app-backup.$(date +%s); uci set "autoreboot.$section.enable=${settings.enabled ? "1" : "0"}"; uci set "autoreboot.$section.time=${settings.time}"; uci set "autoreboot.$section.week=${settings.week}"; uci commit autoreboot; /etc/init.d/autoreboot restart 2>/dev/null || true; echo '自动重启设置已保存。'`;
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
  const base = `system.${settings.section}`;
  return `uci -q get ${quote(base)} >/dev/null || { echo 'LED 配置不存在。'; exit 2; }; cp /etc/config/system /etc/config/system.app-backup.$(date +%s); ${uciSet(`${base}.trigger`, settings.trigger)}; ${uciSet(`${base}.default`, settings.defaultValue)}; uci commit system; /etc/init.d/system reload; echo 'LED 设置已保存。'`;
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
  const base = `fstab.${section}`;
  return `uci -q get ${quote(base)} >/dev/null || { echo '挂载点配置不存在。'; exit 2; }; cp /etc/config/fstab /etc/config/fstab.app-backup.$(date +%s); ${uciSet(`${base}.enabled`, shouldEnable ? "1" : "0")}; uci commit fstab; /etc/init.d/fstab restart; block mount 2>/dev/null || true; echo '挂载点已${shouldEnable ? "启用" : "停用"}。'`;
}

export function buildSshAccessSnapshotCommand(): string {
  return `[ -x /etc/init.d/dropbear ] && echo 'SSH|installed|yes' || echo 'SSH|installed|no'; uci -q get dropbear.@dropbear[0].Port 2>/dev/null | sed 's/^/SSH|port|/'; uci -q get dropbear.@dropbear[0].PasswordAuth 2>/dev/null | sed 's/^/SSH|password|/'; uci -q get dropbear.@dropbear[0].RootPasswordAuth 2>/dev/null | sed 's/^/SSH|rootpassword|/'`;
}

export function parseSshAccessSettings(output: string): SshAccessSettings {
  const values = parseValueMap("SSH", output);
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
  assertPort(settings.port, "SSH 端口");
  return `[ -x /etc/init.d/dropbear ] || { echo 'Dropbear 未安装。'; exit 2; }; cp /etc/config/dropbear /etc/config/dropbear.app-backup.$(date +%s); ${uciSet("dropbear.@dropbear[0].Port", settings.port)}; ${uciSet("dropbear.@dropbear[0].PasswordAuth", settings.passwordAuth ? "on" : "off")}; ${uciSet("dropbear.@dropbear[0].RootPasswordAuth", settings.rootPasswordAuth ? "on" : "off")}; uci commit dropbear; /etc/init.d/dropbear restart; echo 'SSH 管理权限已保存。'`;
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
  settings: Pick<
    UhttpdSettings,
    "section" | "httpPorts" | "httpsPorts" | "redirectHttps"
  >,
): string {
  assertSection(settings.section);
  const httpEntries = parseListenEntries(settings.httpPorts, "HTTP 监听地址");
  const httpsEntries = parseListenEntries(
    settings.httpsPorts,
    "HTTPS 监听地址",
  );
  if (!httpEntries.length && !httpsEntries.length)
    throw new Error("至少需要保留一个 HTTP 或 HTTPS 监听地址。");
  const base = `uhttpd.${settings.section}`;
  const writeList = (key: string, entries: string[]) =>
    [
      uciDelete(`${base}.${key}`),
      ...entries.map(
        (entry) => `uci add_list ${quote(`${base}.${key}=${entry}`)}`,
      ),
    ].join("; ");
  return `[ -x /etc/init.d/uhttpd ] || { echo 'uhttpd 未安装。'; exit 2; }; uci -q get ${quote(base)} >/dev/null || { echo '未找到 uhttpd 配置。'; exit 2; }; cp /etc/config/uhttpd /etc/config/uhttpd.app-backup.$(date +%s); ${writeList("listen_http", httpEntries)}; ${writeList("listen_https", httpsEntries)}; ${uciSet(`${base}.redirect_https`, settings.redirectHttps ? "1" : "0")}; uci commit uhttpd; /etc/init.d/uhttpd reload; echo 'LuCI HTTP/HTTPS 服务设置已保存。'`;
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

export function buildNetworkInterfaceStatusCommand(): string {
  return `ubus call network.interface dump; ip -o link 2>/dev/null | awk '{name=$2; sub(/:$/,"",name); sub(/@.*/,"",name); for (i=1; i<=NF; i++) if ($i == "link/ether") { print "IFMAC|" name "|" $(i+1); break }}'`;
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
    value ? uciSet(`${base}.${key}`, value) : uciDelete(`${base}.${key}`);
  return `uci -q get ${quote(base)} >/dev/null || { echo '接口配置不存在。'; exit 2; }; cp /etc/config/network /etc/config/network.app-backup.$(date +%s); ${uciSet(`${base}.proto`, settings.proto)}; ${setOrDelete("device", settings.device)}; ${setOrDelete("ipaddr", settings.ipaddr)}; ${setOrDelete("netmask", settings.netmask)}; ${setOrDelete("gateway", settings.gateway)}; ${setOrDelete("dns", settings.dns)}; ${uciSet(`${base}.auto`, settings.auto ? "1" : "0")}; uci commit network; /etc/init.d/network reload; echo '接口设置已保存，网络可能短暂重连。'`;
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
