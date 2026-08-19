import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppDialog as Alert } from "@/components/app-dialog";
import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import {
  buildAutorebootSnapshotCommand,
  buildCronSnapshotCommand,
  buildLedSnapshotCommand,
  buildMountActionCommand,
  buildMountSnapshotCommand,
  buildNetworkInterfaceSnapshotCommand,
  buildSaveAutorebootCommand,
  buildSaveLedCommand,
  buildSaveNetworkInterfaceCommand,
  buildSaveSshAccessCommand,
  buildScheduledActionCommand,
  buildSshAccessSnapshotCommand,
  buildStartupActionCommand,
  buildStartupSnapshotCommand,
  parseAutorebootSettings,
  parseCronEntries,
  parseLedSettings,
  parseMountPoints,
  parseNetworkInterfaceSettings,
  parseSshAccessSettings,
  parseStartupServices,
  type AutorebootSettings,
  type LedSetting,
  type MountPoint,
  type NetworkInterfaceSettings,
  type ScheduledAction,
  type SshAccessSettings,
  type StartupService,
} from "@/lib/openwrt-luci-system";

type Panel =
  | "automation"
  | "startup"
  | "led"
  | "mount"
  | "ssh"
  | "network"
  | "cron";

const PANELS: Array<{ id: Panel; label: string }> = [
  { id: "automation", label: "定时重启" },
  { id: "startup", label: "启动项" },
  { id: "led", label: "LED" },
  { id: "mount", label: "挂载点" },
  { id: "ssh", label: "管理权" },
  { id: "network", label: "接口" },
  { id: "cron", label: "计划任务" },
];

const emptyAutoreboot: AutorebootSettings = {
  installed: false,
  enabled: false,
  time: "04:00",
  week: "",
};
const emptySsh: SshAccessSettings = {
  installed: false,
  port: "22",
  passwordAuth: true,
  rootPasswordAuth: true,
};

export default function SystemAdminScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [panel, setPanel] = useState<Panel>("automation");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [autoreboot, setAutoreboot] = useState(emptyAutoreboot);
  const [services, setServices] = useState<StartupService[]>([]);
  const [leds, setLeds] = useState<LedSetting[]>([]);
  const [mounts, setMounts] = useState<MountPoint[]>([]);
  const [ssh, setSsh] = useState(emptySsh);
  const [interfaces, setInterfaces] = useState<NetworkInterfaceSettings[]>([]);
  const [cronEntries, setCronEntries] = useState<string[]>([]);
  const [weekday, setWeekday] = useState("*");
  const [hour, setHour] = useState("04");
  const [minute, setMinute] = useState("00");
  const [scheduledAction, setScheduledAction] =
    useState<ScheduledAction>("reboot");

  const disabled = !hasRouter || !isSupported || isRunning || loading;

  const refresh = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    setLoading(true);
    try {
      const [
        autorebootRaw,
        startupRaw,
        ledRaw,
        mountRaw,
        sshRaw,
        networkRaw,
        cronRaw,
      ] = await Promise.all([
        execute(buildAutorebootSnapshotCommand()),
        execute(buildStartupSnapshotCommand()),
        execute(buildLedSnapshotCommand()),
        execute(buildMountSnapshotCommand()),
        execute(buildSshAccessSnapshotCommand()),
        execute(buildNetworkInterfaceSnapshotCommand()),
        execute(buildCronSnapshotCommand()),
      ]);
      setAutoreboot(parseAutorebootSettings(autorebootRaw));
      setServices(parseStartupServices(startupRaw));
      setLeds(parseLedSettings(ledRaw));
      setMounts(parseMountPoints(mountRaw));
      setSsh(parseSshAccessSettings(sshRaw));
      setInterfaces(parseNetworkInterfaceSettings(networkRaw));
      setCronEntries(parseCronEntries(cronRaw));
    } catch (reason) {
      setOutput(
        reason instanceof Error ? reason.message : "读取系统配置失败。",
      );
    } finally {
      setLoading(false);
    }
  }, [execute, hasRouter, isSupported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(command: string, successText?: string) {
    try {
      setOutput((await execute(command)) || successText || "已提交操作。");
      await refresh();
    } catch (reason) {
      setOutput(reason instanceof Error ? reason.message : "操作失败。");
    }
  }

  function confirm(
    title: string,
    message: string,
    command: () => string,
    successText?: string,
    destructive = false,
  ) {
    Alert.alert(title, message, [
      { text: "取消", style: "cancel" },
      {
        text: "确认",
        style: destructive ? "destructive" : "default",
        onPress: () => {
          try {
            void run(command(), successText);
          } catch (reason) {
            setOutput(
              reason instanceof Error ? reason.message : "参数不合法。",
            );
          }
        },
      },
    ]);
  }

  const title = useMemo(
    () =>
      ({
        automation: "定时重启",
        startup: "启动项",
        led: "LED 配置",
        mount: "挂载点",
        ssh: "管理权",
        network: "接口设置",
        cron: "计划任务",
      })[panel],
    [panel],
  );

  return (
    <ManagementShell
      title="系统管理"
      description="以 UCI 与 OpenWrt 服务接口管理系统设置。所有保存均在路由器本地执行，并自动创建时间戳备份。"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {PANELS.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setPanel(item.id)}
            style={({ pressed }) => [
              styles.tab,
              {
                borderColor: panel === item.id ? colors.primary : colors.border,
                backgroundColor:
                  panel === item.id ? colors.primary : colors.surface,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: panel === item.id ? "#fff" : colors.foreground },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <SectionCard title={title}>
        {panel === "automation" ? (
          <View style={styles.body}>
            {!autoreboot.installed ? (
              <EmptyState
                icon="schedule"
                title="未检测到 autoreboot"
                description="请先在软件包管理中安装 luci-app-autoreboot 或 autoreboot。"
              />
            ) : (
              <>
                <SettingSwitch
                  label="启用自动重启"
                  value={autoreboot.enabled}
                  onValueChange={(value) =>
                    setAutoreboot((current) => ({ ...current, enabled: value }))
                  }
                  colors={colors}
                />
                <TextField
                  label="每天执行时间"
                  value={autoreboot.time}
                  onChangeText={(value) =>
                    setAutoreboot((current) => ({ ...current, time: value }))
                  }
                  placeholder="04:00"
                  colors={colors}
                />
                <TextField
                  label="星期（留空代表每天）"
                  value={autoreboot.week}
                  onChangeText={(value) =>
                    setAutoreboot((current) => ({ ...current, week: value }))
                  }
                  placeholder="1,2,3,4,5"
                  colors={colors}
                />
                <Text style={[styles.help, { color: colors.muted }]}>
                  星期使用 1-7，例如 1,2,3,4,5 表示周一至周五。保存时重启
                  autoreboot 服务。
                </Text>
                <PrimaryButton
                  label="保存定时重启"
                  disabled={disabled}
                  color={colors.primary}
                  onPress={() =>
                    confirm(
                      "保存定时重启",
                      "将更新路由器的自动重启计划。",
                      () => buildSaveAutorebootCommand(autoreboot),
                      "自动重启设置已保存。",
                    )
                  }
                />
              </>
            )}
          </View>
        ) : null}

        {panel === "startup" ? (
          <View>
            {services.length ? (
              services.map((service, index) => (
                <View
                  key={service.name}
                  style={[
                    styles.row,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.rowCopy}>
                    <Text
                      style={[styles.rowTitle, { color: colors.foreground }]}
                    >
                      {service.name}
                    </Text>
                    <Text style={[styles.help, { color: colors.muted }]}>
                      {service.enabled ? "开机自动启动" : "不随系统启动"}
                    </Text>
                  </View>
                  <Switch
                    value={service.enabled}
                    disabled={disabled}
                    onValueChange={(value) =>
                      confirm(
                        value ? "启用启动项" : "关闭启动项",
                        `${service.name} 将${value ? "在开机时自动启动" : "不再随开机启动"}。`,
                        () => buildStartupActionCommand(service.name, value),
                      )
                    }
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>
              ))
            ) : (
              <EmptyState
                icon="settings-suggest"
                title="未读取启动项"
                description="连接应用内 SSH 后点击右上方刷新。"
              />
            )}
          </View>
        ) : null}

        {panel === "led" ? (
          <View>
            {leds.length ? (
              leds.map((led, index) => (
                <LedRow
                  key={led.section}
                  led={led}
                  disabled={disabled}
                  colors={colors}
                  onSave={(next) =>
                    confirm(
                      "保存 LED 设置",
                      `将更新“${led.name}”的触发器并重载系统设置。`,
                      () => buildSaveLedCommand(next),
                    )
                  }
                  divider={index > 0}
                />
              ))
            ) : (
              <EmptyState
                icon="lightbulb"
                title="未检测到 LED 配置"
                description="该路由器可能未在 /etc/config/system 定义可管理的 LED。"
              />
            )}
          </View>
        ) : null}

        {panel === "mount" ? (
          <View>
            {mounts.length ? (
              mounts.map((mount, index) => (
                <View
                  key={mount.section}
                  style={[
                    styles.row,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.rowCopy}>
                    <Text
                      style={[styles.rowTitle, { color: colors.foreground }]}
                    >
                      {mount.target || "未设置挂载路径"}
                    </Text>
                    <Text style={[styles.help, { color: colors.muted }]}>
                      {[mount.device, mount.fstype]
                        .filter(Boolean)
                        .join(" · ") || "未识别设备"}
                    </Text>
                  </View>
                  <Switch
                    value={mount.enabled}
                    disabled={disabled}
                    onValueChange={(value) =>
                      confirm(
                        value ? "启用挂载点" : "停用挂载点",
                        `${mount.target || mount.section} 将${value ? "恢复" : "停止"}自动挂载。`,
                        () => buildMountActionCommand(mount.section, value),
                      )
                    }
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>
              ))
            ) : (
              <EmptyState
                icon="storage"
                title="未配置挂载点"
                description="请在路由器上插入存储设备或创建 fstab 挂载配置后刷新。"
              />
            )}
          </View>
        ) : null}

        {panel === "ssh" ? (
          <View style={styles.body}>
            {!ssh.installed ? (
              <EmptyState
                icon="vpn-key"
                title="Dropbear 未安装"
                description="当前路由器未检测到 OpenWrt 默认 SSH 服务。"
              />
            ) : (
              <>
                <TextField
                  label="SSH 端口"
                  value={ssh.port}
                  onChangeText={(value) =>
                    setSsh((current) => ({ ...current, port: value }))
                  }
                  placeholder="22"
                  keyboardType="number-pad"
                  colors={colors}
                />
                <SettingSwitch
                  label="允许密码登录"
                  value={ssh.passwordAuth}
                  onValueChange={(value) =>
                    setSsh((current) => ({ ...current, passwordAuth: value }))
                  }
                  colors={colors}
                />
                <SettingSwitch
                  label="允许 root 使用密码登录"
                  value={ssh.rootPasswordAuth}
                  onValueChange={(value) =>
                    setSsh((current) => ({
                      ...current,
                      rootPasswordAuth: value,
                    }))
                  }
                  colors={colors}
                />
                <Text style={[styles.warning, { color: colors.warning }]}>
                  关闭密码登录前，请确认已配置可用 SSH
                  公钥；修改端口或权限可能中断当前连接。
                </Text>
                <PrimaryButton
                  label="保存 SSH 管理权限"
                  disabled={disabled}
                  color={colors.primary}
                  onPress={() =>
                    confirm(
                      "保存 SSH 管理权限",
                      "Dropbear 将重启，当前 SSH 连接可能短暂断开。",
                      () => buildSaveSshAccessCommand(ssh),
                      "SSH 管理权限已保存。",
                    )
                  }
                />
              </>
            )}
          </View>
        ) : null}

        {panel === "network" ? (
          <View>
            {interfaces.length ? (
              interfaces.map((item, index) => (
                <NetworkRow
                  key={item.section}
                  item={item}
                  disabled={disabled}
                  colors={colors}
                  divider={index > 0}
                  onSave={(next) =>
                    confirm(
                      "保存接口设置",
                      `将更新 ${item.section} 并重载网络；连接可能短暂中断。`,
                      () => buildSaveNetworkInterfaceCommand(next),
                      "接口设置已保存。",
                      true,
                    )
                  }
                />
              ))
            ) : (
              <EmptyState
                icon="lan"
                title="未读取网络接口"
                description="请确认路由器允许 UCI 网络配置读取后刷新。"
              />
            )}
          </View>
        ) : null}

        {panel === "cron" ? (
          <View style={styles.body}>
            <Text style={[styles.help, { color: colors.muted }]}>
              创建由本应用标记的常用计划任务；其他现有 crontab
              条目只读显示，不会被应用修改。
            </Text>
            <TextField
              label="分钟"
              value={minute}
              onChangeText={setMinute}
              placeholder="00"
              colors={colors}
            />
            <TextField
              label="小时"
              value={hour}
              onChangeText={setHour}
              placeholder="04"
              colors={colors}
            />
            <TextField
              label="星期（* 或 1-7）"
              value={weekday}
              onChangeText={setWeekday}
              placeholder="*"
              colors={colors}
            />
            <View style={styles.choiceRow}>
              {(
                [
                  ["reboot", "重启路由器"],
                  ["wan-reconnect", "重连 WAN"],
                  ["ddns-refresh", "刷新 DDNS"],
                ] as Array<[ScheduledAction, string]>
              ).map(([id, label]) => (
                <Pressable
                  key={id}
                  onPress={() => setScheduledAction(id)}
                  style={({ pressed }) => [
                    styles.choice,
                    {
                      borderColor:
                        scheduledAction === id ? colors.primary : colors.border,
                      backgroundColor:
                        scheduledAction === id
                          ? colors.primary
                          : colors.surface,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={{
                      color:
                        scheduledAction === id ? "#fff" : colors.foreground,
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <PrimaryButton
              label="保存常用计划任务"
              disabled={disabled}
              color={colors.primary}
              onPress={() =>
                confirm(
                  "保存计划任务",
                  "将替换该类型此前由本应用创建的计划任务。",
                  () =>
                    buildScheduledActionCommand(
                      minute,
                      hour,
                      weekday,
                      scheduledAction,
                    ),
                  "计划任务已保存。",
                )
              }
            />
            {cronEntries.length ? (
              <View
                style={[
                  styles.readOnly,
                  { backgroundColor: colors.background },
                ]}
              >
                {cronEntries.map((entry, index) => (
                  <Text
                    key={`${entry}-${index}`}
                    selectable
                    style={[styles.mono, { color: colors.foreground }]}
                  >
                    {entry}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={[styles.help, { color: colors.muted }]}>
                未发现 crontab 条目。
              </Text>
            )}
          </View>
        ) : null}
      </SectionCard>
      <View style={styles.refreshRow}>
        <Pressable
          disabled={disabled}
          onPress={() => void refresh()}
          style={({ pressed }) => [
            styles.refresh,
            { borderColor: colors.border },
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <Text style={[styles.refreshText, { color: colors.primary }]}>
            {loading ? "读取中…" : "刷新系统设置"}
          </Text>
        </Pressable>
        {isRunning ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
      {error ? (
        <ToolNotice>
          <Text style={[styles.help, { color: colors.error }]}>{error}</Text>
        </ToolNotice>
      ) : null}
      {output ? (
        <SectionCard title="操作结果">
          <View style={[styles.output, { backgroundColor: colors.background }]}>
            <Text
              selectable
              style={[styles.mono, { color: colors.foreground }]}
            >
              {output}
            </Text>
          </View>
        </SectionCard>
      ) : null}
      <ToolNotice>
        <Text style={[styles.help, { color: colors.muted }]}>
          每次写入前均会在相应 /etc/config 文件旁保存 app-backup
          时间戳副本。高风险变更会要求确认。
        </Text>
      </ToolNotice>
    </ManagementShell>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize="none"
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      />
    </View>
  );
}

function SettingSwitch({
  label,
  value,
  onValueChange,
  colors,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
      />
    </View>
  );
}

function PrimaryButton({
  label,
  disabled,
  color,
  onPress,
}: {
  label: string;
  disabled: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: color },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function LedRow({
  led,
  disabled,
  colors,
  onSave,
  divider,
}: {
  led: LedSetting;
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  onSave: (
    value: Pick<LedSetting, "section" | "trigger" | "defaultValue">,
  ) => void;
  divider: boolean;
}) {
  const [trigger, setTrigger] = useState(led.trigger);
  const [defaultValue, setDefaultValue] = useState(led.defaultValue);
  return (
    <View
      style={[
        styles.body,
        divider && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.rowTitle, { color: colors.foreground }]}>
        {led.name}
      </Text>
      <Text style={[styles.help, { color: colors.muted }]}>
        {led.sysfs || led.section}
      </Text>
      <TextField
        label="触发器"
        value={trigger}
        onChangeText={setTrigger}
        placeholder="none / netdev / timer"
        colors={colors}
      />
      <SettingSwitch
        label="默认点亮"
        value={defaultValue === "1"}
        onValueChange={(value) => setDefaultValue(value ? "1" : "0")}
        colors={colors}
      />
      <PrimaryButton
        label="保存 LED"
        disabled={disabled}
        color={colors.primary}
        onPress={() => onSave({ section: led.section, trigger, defaultValue })}
      />
    </View>
  );
}

function NetworkRow({
  item,
  disabled,
  colors,
  onSave,
  divider,
}: {
  item: NetworkInterfaceSettings;
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  onSave: (value: NetworkInterfaceSettings) => void;
  divider: boolean;
}) {
  const [draft, setDraft] = useState(item);
  const update = (
    key: keyof NetworkInterfaceSettings,
    value: string | boolean,
  ) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <View
      style={[
        styles.body,
        divider && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
      ]}
    >
      <View style={styles.interfaceHeader}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>
          {item.section}
        </Text>
        <StatusPill label={draft.proto} tone="normal" />
      </View>
      <TextField
        label="协议（dhcp / static / pppoe）"
        value={draft.proto}
        onChangeText={(value) => update("proto", value)}
        colors={colors}
      />
      <TextField
        label="设备"
        value={draft.device}
        onChangeText={(value) => update("device", value)}
        placeholder="eth0.2"
        colors={colors}
      />
      <TextField
        label="IPv4 地址"
        value={draft.ipaddr}
        onChangeText={(value) => update("ipaddr", value)}
        colors={colors}
      />
      <TextField
        label="子网掩码"
        value={draft.netmask}
        onChangeText={(value) => update("netmask", value)}
        colors={colors}
      />
      <TextField
        label="网关"
        value={draft.gateway}
        onChangeText={(value) => update("gateway", value)}
        colors={colors}
      />
      <TextField
        label="DNS（以空格分隔）"
        value={draft.dns}
        onChangeText={(value) => update("dns", value)}
        colors={colors}
      />
      <SettingSwitch
        label="随系统启动"
        value={draft.auto}
        onValueChange={(value) => update("auto", value)}
        colors={colors}
      />
      <PrimaryButton
        label={`保存 ${item.section}`}
        disabled={disabled}
        color={colors.primary}
        onPress={() => onSave(draft)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: { gap: 8, paddingBottom: 12 },
  tab: {
    borderWidth: 1,
    borderRadius: 99,
    minHeight: 35,
    paddingHorizontal: 13,
    justifyContent: "center",
  },
  tabText: { fontSize: 12, fontWeight: "800" },
  body: { padding: 15, gap: 12 },
  row: {
    minHeight: 64,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: "800" },
  help: { fontSize: 12, lineHeight: 18 },
  warning: { fontSize: 12, lineHeight: 18, fontWeight: "700" },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "800" },
  input: {
    minHeight: 43,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  switchRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  primary: {
    minHeight: 44,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  refreshRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  refresh: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 13,
    justifyContent: "center",
  },
  refreshText: { fontSize: 12, fontWeight: "800" },
  output: { margin: 14, padding: 12, borderRadius: 12 },
  mono: { fontFamily: "monospace", fontSize: 12, lineHeight: 18 },
  readOnly: { borderRadius: 10, padding: 11, gap: 5 },
  choiceRow: { gap: 8 },
  choice: {
    minHeight: 38,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  interfaceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
