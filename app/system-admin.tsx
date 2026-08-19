import { useCallback, useEffect, useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  ActivityIndicator,
  Modal,
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
  buildAddApkRepositoryKeyCommand,
  buildAddLedCommand,
  buildAddMountCommand,
  buildAutoMountUnconfiguredCommand,
  buildAddSshInstanceCommand,
  buildAddSshAuthorizedKeyCommand,
  buildApkRepositoryKeysSnapshotCommand,
  buildChangeRouterPasswordCommand,
  buildFetchApkRepositoryKeyCommand,
  buildLedCapabilitiesSnapshotCommand,
  buildDeleteLedCommand,
  buildDeleteMountCommand,
  buildGenerateMountConfigCommand,
  buildLuciThemesSnapshotCommand,
  buildLedSnapshotCommand,
  buildMountConnectedDevicesCommand,
  buildMountSnapshotCommand,
  buildNetworkDeviceSnapshotCommand,
  buildNetworkGlobalSnapshotCommand,
  buildNetworkInterfaceDeleteCommand,
  buildNetworkInterfaceRestartCommand,
  buildNetworkInterfaceSnapshotCommand,
  buildNetworkInterfaceStatusCommand,
  buildSaveLedCommand,
  buildSaveMountCommand,
  buildSaveNetworkInterfaceCommand,
  buildSaveNetworkDeviceCommand,
  buildSaveNetworkGlobalCommand,
  buildSaveSshInstanceCommand,
  buildSaveUhttpdCommand,
  buildSetLuciThemeCommand,
  buildSshAccessSnapshotCommand,
  buildSshInstanceActionCommand,
  buildSshAuthorizedKeysSnapshotCommand,
  buildStartupActionCommand,
  buildStartupSnapshotCommand,
  parseApkRepositoryKeys,
  parseLedCapabilities,
  parseLedSettings,
  parseLuciThemes,
  parseMountedFileSystems,
  parseMountPoints,
  parseNetworkInterfaceSettings,
  parseNetworkInterfaceStatus,
  parseNetworkDeviceSettings,
  parseNetworkGlobalSettings,
  parseSshAccessSettings,
  parseSshAuthorizedKeys,
  parseSwapPartitions,
  parseStartupServices,
  parseUhttpdSettings,
  buildUhttpdSnapshotCommand,
  type ApkRepositoryKey,
  type DropbearInstance,
  type LedSetting,
  type LedCapabilities,
  type LuciTheme,
  type MountPoint,
  type MountedFileSystem,
  type NewLedSettings,
  type NetworkInterfaceSettings,
  type NetworkInterfaceStatus,
  type NetworkDeviceSettings,
  type NetworkGlobalSettings,
  type SshAccessSettings,
  type SshAuthorizedKey,
  type StartupService,
  type SwapPartition,
  type UhttpdSettings,
} from "@/lib/openwrt-luci-system";

type Panel = "startup" | "led" | "mount" | "ssh" | "network";

const PANELS: Array<{ id: Panel; label: string }> = [
  { id: "startup", label: "启动项" },
  { id: "led", label: "LED" },
  { id: "mount", label: "挂载点" },
  { id: "ssh", label: "管理权" },
  { id: "network", label: "接口" },
];

const emptySsh: SshAccessSettings = {
  installed: false,
  port: "22",
  passwordAuth: true,
  rootPasswordAuth: true,
  instances: [],
};
const emptyDropbearInstance: Omit<DropbearInstance, "section"> = {
  port: "22",
  interface: "",
  passwordAuth: true,
  rootPasswordAuth: true,
  gatewayPorts: false,
  enabled: true,
};
const emptyUhttpd: UhttpdSettings = {
  installed: false,
  section: "@uhttpd[0]",
  httpPorts: "0.0.0.0:80",
  httpsPorts: "0.0.0.0:443",
  redirectHttps: false,
};
const emptyNetworkGlobal: NetworkGlobalSettings = {
  section: "globals",
  ulaPrefix: "",
  packetSteering: false,
};

export default function SystemAdminScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [panel, setPanel] = useState<Panel>("startup");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [services, setServices] = useState<StartupService[]>([]);
  const [leds, setLeds] = useState<LedSetting[]>([]);
  const [ledCapabilities, setLedCapabilities] = useState<LedCapabilities>({
    devices: [],
    triggers: [],
  });
  const [mounts, setMounts] = useState<MountPoint[]>([]);
  const [mountedFileSystems, setMountedFileSystems] = useState<
    MountedFileSystem[]
  >([]);
  const [swapPartitions, setSwapPartitions] = useState<SwapPartition[]>([]);
  const [ssh, setSsh] = useState(emptySsh);
  const [sshKeys, setSshKeys] = useState<SshAuthorizedKey[]>([]);
  const [newSshKey, setNewSshKey] = useState("");
  const [routerPassword, setRouterPassword] = useState("");
  const [routerPasswordConfirmation, setRouterPasswordConfirmation] =
    useState("");
  const [apkKeys, setApkKeys] = useState<ApkRepositoryKey[]>([]);
  const [apkKeyName, setApkKeyName] = useState("");
  const [apkKeyValue, setApkKeyValue] = useState("");
  const [apkKeyUrl, setApkKeyUrl] = useState("");
  const [uhttpd, setUhttpd] = useState(emptyUhttpd);
  const [luciThemes, setLuciThemes] = useState<LuciTheme[]>([]);
  const [interfaces, setInterfaces] = useState<NetworkInterfaceSettings[]>([]);
  const [interfaceStatuses, setInterfaceStatuses] = useState<
    NetworkInterfaceStatus[]
  >([]);
  const [networkDevices, setNetworkDevices] = useState<NetworkDeviceSettings[]>(
    [],
  );
  const [networkGlobal, setNetworkGlobal] = useState(emptyNetworkGlobal);

  const disabled = !hasRouter || !isSupported || isRunning || loading;

  const refresh = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    setLoading(true);
    try {
      const [
        startupRaw,
        ledRaw,
        ledCapabilitiesRaw,
        mountRaw,
        sshRaw,
        sshKeysRaw,
        apkKeysRaw,
        uhttpdRaw,
        luciThemesRaw,
        networkRaw,
        interfaceStatusRaw,
        networkDeviceRaw,
        networkGlobalRaw,
      ] = await Promise.all([
        execute(buildStartupSnapshotCommand()),
        execute(buildLedSnapshotCommand()),
        execute(buildLedCapabilitiesSnapshotCommand()),
        execute(buildMountSnapshotCommand()),
        execute(buildSshAccessSnapshotCommand()),
        execute(buildSshAuthorizedKeysSnapshotCommand()),
        execute(buildApkRepositoryKeysSnapshotCommand()),
        execute(buildUhttpdSnapshotCommand()),
        execute(buildLuciThemesSnapshotCommand()),
        execute(buildNetworkInterfaceSnapshotCommand()),
        execute(buildNetworkInterfaceStatusCommand()),
        execute(buildNetworkDeviceSnapshotCommand()),
        execute(buildNetworkGlobalSnapshotCommand()),
      ]);
      setServices(parseStartupServices(startupRaw));
      setLeds(parseLedSettings(ledRaw));
      setLedCapabilities(parseLedCapabilities(ledCapabilitiesRaw));
      setMounts(parseMountPoints(mountRaw));
      setMountedFileSystems(parseMountedFileSystems(mountRaw));
      setSwapPartitions(parseSwapPartitions(mountRaw));
      setSsh(parseSshAccessSettings(sshRaw));
      setSshKeys(parseSshAuthorizedKeys(sshKeysRaw));
      setApkKeys(parseApkRepositoryKeys(apkKeysRaw));
      setUhttpd(parseUhttpdSettings(uhttpdRaw));
      setLuciThemes(parseLuciThemes(luciThemesRaw));
      setInterfaces(parseNetworkInterfaceSettings(networkRaw));
      setInterfaceStatuses(parseNetworkInterfaceStatus(interfaceStatusRaw));
      setNetworkDevices(parseNetworkDeviceSettings(networkDeviceRaw));
      setNetworkGlobal(parseNetworkGlobalSettings(networkGlobalRaw));
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

  async function importSshPublicKey() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      const asset = result.canceled ? undefined : result.assets?.[0];
      if (!asset) return;
      setNewSshKey((await FileSystem.readAsStringAsync(asset.uri)).trim());
    } catch (reason) {
      setOutput(
        reason instanceof Error ? reason.message : "读取公钥文件失败。",
      );
    }
  }

  async function importApkRepositoryKey() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      const asset = result.canceled ? undefined : result.assets?.[0];
      if (!asset) return;
      setApkKeyValue((await FileSystem.readAsStringAsync(asset.uri)).trim());
      if (asset.name.trim()) setApkKeyName(asset.name.trim());
    } catch (reason) {
      setOutput(
        reason instanceof Error ? reason.message : "读取仓库公钥文件失败。",
      );
    }
  }

  const title = useMemo(
    () =>
      ({
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
      description="以 UCI 与 OpenWrt 服务接口管理系统设置，所有保存均在路由器本地执行。"
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
                  capabilities={ledCapabilities}
                  disabled={disabled}
                  colors={colors}
                  onSave={(next) =>
                    leds.some(
                      (item) =>
                        item.section !== led.section && item.name === next.name,
                    )
                      ? setOutput("LED 名称已存在，请选择其他名称。")
                      : confirm(
                          "保存 LED 设置",
                          `将更新“${led.name}”的触发器并重载系统设置。`,
                          () => buildSaveLedCommand(next),
                        )
                  }
                  onDelete={() =>
                    confirm(
                      "删除 LED 配置",
                      `将删除“${led.name}”配置。此操作不会删除路由器上的 LED 设备。`,
                      () => buildDeleteLedCommand(led.section),
                      "LED 配置已删除。",
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
            <NewLedForm
              disabled={disabled}
              colors={colors}
              capabilities={ledCapabilities}
              onCreate={(next) =>
                leds.some((item) => item.name === next.name)
                  ? setOutput("LED 名称已存在，不能重复添加。")
                  : confirm(
                      "新增 LED",
                      `将新增“${next.name}”LED 配置。`,
                      () => buildAddLedCommand(next),
                      "LED 已新增。",
                    )
              }
            />
          </View>
        ) : null}

        {panel === "mount" ? (
          <View>
            <View style={styles.cardActionRow}>
              <NewMountPointForm
                disabled={disabled}
                colors={colors}
                onCreate={(mount) =>
                  confirm(
                    "新增挂载点",
                    `将为 ${mount.device || "所选设备"} 创建挂载配置。`,
                    () => buildAddMountCommand(mount),
                    "挂载点已新增。",
                  )
                }
              />
              <SmallButton
                label="生成配置"
                disabled={disabled}
                color={colors.primary}
                onPress={() =>
                  confirm(
                    "生成挂载配置",
                    "将扫描已连接分区并生成缺失的 fstab 配置。",
                    buildGenerateMountConfigCommand,
                  )
                }
              />
            </View>
            <View style={styles.cardActionRow}>
              <SmallButton
                label="挂载已连接设备"
                disabled={disabled}
                color={colors.primary}
                onPress={() =>
                  confirm(
                    "挂载已连接设备",
                    "将执行已配置挂载点。",
                    buildMountConnectedDevicesCommand,
                  )
                }
              />
              <SmallButton
                label="自动挂载未配置分区"
                disabled={disabled}
                color={colors.primary}
                onPress={() =>
                  confirm(
                    "自动挂载分区",
                    "将为尚未配置的磁盘和交换分区生成并启用挂载配置。",
                    buildAutoMountUnconfiguredCommand,
                  )
                }
              />
            </View>
            {mounts.length ? (
              mounts.map((mount, index) => (
                <MountPointCard
                  key={mount.section}
                  mount={mount}
                  disabled={disabled}
                  colors={colors}
                  divider={index > 0}
                  onSave={(next) =>
                    confirm(
                      "保存挂载点",
                      `将保存 ${next.target || next.section} 的配置。`,
                      () => buildSaveMountCommand(next),
                    )
                  }
                  onDelete={() =>
                    confirm(
                      "删除挂载点",
                      `将删除 ${mount.target || mount.section} 的配置。`,
                      () => buildDeleteMountCommand(mount.section),
                      "挂载点已删除。",
                      true,
                    )
                  }
                />
              ))
            ) : (
              <EmptyState
                icon="storage"
                title="未配置挂载点"
                description="请在路由器上插入存储设备或创建 fstab 挂载配置后刷新。"
              />
            )}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
              已挂载的文件系统
            </Text>
            {mountedFileSystems.length ? (
              mountedFileSystems.map((item) => (
                <View
                  key={`${item.target}-${item.device}`}
                  style={[
                    styles.deviceRow,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.rowCopy}>
                    <Text
                      style={[styles.rowTitle, { color: colors.foreground }]}
                    >
                      {item.target}
                    </Text>
                    <Text style={[styles.help, { color: colors.muted }]}>
                      {[item.device, item.fstype].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.help, { color: colors.muted }]}>
                未检测到已挂载的文件系统。
              </Text>
            )}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
              已启用的交换分区
            </Text>
            {swapPartitions.length ? (
              swapPartitions.map((item) => (
                <View
                  key={item.device}
                  style={[
                    styles.deviceRow,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                    {item.device}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.help, { color: colors.muted }]}>
                未检测到已启用的交换分区。
              </Text>
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
                <Text style={[styles.help, { color: colors.muted }]}>
                  可为 Dropbear
                  的每个实例分别设置端口、监听接口和认证权限；保存或启停会短暂重启
                  SSH 服务。
                </Text>
                {ssh.instances.length ? (
                  ssh.instances.map((instance) => (
                    <DropbearInstanceRow
                      key={instance.section}
                      instance={instance}
                      disabled={disabled}
                      colors={colors}
                      onSave={(next) =>
                        confirm(
                          "保存 SSH 实例",
                          `将更新 ${next.section} 的 Dropbear 设置并重启 SSH 服务。`,
                          () => buildSaveSshInstanceCommand(next),
                          "SSH 实例已保存。",
                        )
                      }
                      onEnabledChange={(value) =>
                        confirm(
                          value ? "启用 SSH 实例" : "停用 SSH 实例",
                          `${instance.section} 将${value ? "开始" : "停止"}监听新的 SSH 连接。`,
                          () =>
                            buildSshInstanceActionCommand(
                              instance.section,
                              value,
                            ),
                          `SSH 实例已${value ? "启用" : "停用"}。`,
                        )
                      }
                    />
                  ))
                ) : (
                  <EmptyState
                    icon="vpn-key"
                    title="未配置 Dropbear 实例"
                    description="可新增一个 SSH 实例，或在路由器上恢复默认 Dropbear 配置后刷新。"
                  />
                )}
                <NewDropbearInstance
                  disabled={disabled}
                  colors={colors}
                  onCreate={(next) =>
                    confirm(
                      "新增 SSH 实例",
                      "将新增 Dropbear 实例并重启 SSH 服务。",
                      () => buildAddSshInstanceCommand(next),
                      "SSH 实例已新增。",
                    )
                  }
                />
                <Text style={[styles.warning, { color: colors.warning }]}>
                  关闭密码登录前，请确认已配置可用 SSH
                  公钥；修改端口、监听接口或权限可能中断当前连接。
                </Text>
                <View
                  style={[styles.subsection, { borderTopColor: colors.border }]}
                >
                  <Text
                    style={[
                      styles.subsectionTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    路由器密码
                  </Text>
                  <Text style={[styles.help, { color: colors.muted }]}>
                    修改 root 帐户密码。保存后，当前 SSH 会话可能需要重新认证。
                  </Text>
                  <TextField
                    label="新密码"
                    value={routerPassword}
                    onChangeText={setRouterPassword}
                    placeholder="至少设置一个非空密码"
                    secureTextEntry
                    colors={colors}
                  />
                  <TextField
                    label="确认新密码"
                    value={routerPasswordConfirmation}
                    onChangeText={setRouterPasswordConfirmation}
                    placeholder="再次输入新密码"
                    secureTextEntry
                    colors={colors}
                  />
                  <PrimaryButton
                    label="修改路由器密码"
                    disabled={
                      disabled ||
                      !routerPassword ||
                      routerPassword !== routerPasswordConfirmation
                    }
                    color={colors.primary}
                    onPress={() =>
                      confirm(
                        "修改路由器密码",
                        "将修改 root 帐户密码。请妥善保存新密码。",
                        () => buildChangeRouterPasswordCommand(routerPassword),
                        "路由器密码已修改。",
                      )
                    }
                  />
                </View>
                <View
                  style={[styles.subsection, { borderTopColor: colors.border }]}
                >
                  <Text
                    style={[
                      styles.subsectionTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    SSH 公钥
                  </Text>
                  <Text style={[styles.help, { color: colors.muted }]}>
                    已配置 {sshKeys.length} 个公钥。添加后可用于禁用密码登录。
                  </Text>
                  {sshKeys.slice(0, 4).map((key, index) => (
                    <Text
                      key={`${key.value}-${index}`}
                      selectable
                      style={[styles.mono, { color: colors.muted }]}
                      numberOfLines={1}
                    >
                      {key.type}
                      {key.comment ? ` · ${key.comment}` : ""}
                    </Text>
                  ))}
                  <TextField
                    label="新增 OpenSSH 公钥"
                    value={newSshKey}
                    onChangeText={setNewSshKey}
                    placeholder="ssh-ed25519 AAAA… 设备备注"
                    multiline
                    colors={colors}
                  />
                  <PrimaryButton
                    label="添加 SSH 公钥"
                    disabled={disabled || !newSshKey.trim()}
                    color={colors.primary}
                    onPress={() =>
                      confirm(
                        "添加 SSH 公钥",
                        "将向 /etc/dropbear/authorized_keys 追加此公钥。",
                        () => buildAddSshAuthorizedKeyCommand(newSshKey),
                        "SSH 公钥已添加。",
                      )
                    }
                  />
                  <PrimaryButton
                    label="从文件导入 SSH 公钥"
                    disabled={disabled}
                    color={colors.primary}
                    onPress={() => void importSshPublicKey()}
                  />
                </View>
                <View
                  style={[styles.subsection, { borderTopColor: colors.border }]}
                >
                  <Text
                    style={[
                      styles.subsectionTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    APK 仓库公钥
                  </Text>
                  <Text style={[styles.help, { color: colors.muted }]}>
                    已发现 {apkKeys.length} 个 /etc/apk/keys 公钥文件。
                  </Text>
                  {apkKeys.slice(0, 4).map((key) => (
                    <Text
                      key={key.name}
                      selectable
                      style={[styles.mono, { color: colors.muted }]}
                    >
                      {key.name} · {key.bytes} B
                    </Text>
                  ))}
                  <TextField
                    label="公钥文件名"
                    value={apkKeyName}
                    onChangeText={setApkKeyName}
                    placeholder="example.pub"
                    colors={colors}
                  />
                  <TextField
                    label="公钥内容"
                    value={apkKeyValue}
                    onChangeText={setApkKeyValue}
                    placeholder="粘贴 APK 仓库签名公钥"
                    multiline
                    colors={colors}
                  />
                  <TextField
                    label="公钥文件 URL"
                    value={apkKeyUrl}
                    onChangeText={setApkKeyUrl}
                    placeholder="https://example.com/keys/example.pub"
                    colors={colors}
                  />
                  <PrimaryButton
                    label="从文件导入 APK 仓库公钥"
                    disabled={disabled}
                    color={colors.primary}
                    onPress={() => void importApkRepositoryKey()}
                  />
                  <PrimaryButton
                    label="从 URL 下载并保存 APK 公钥"
                    disabled={
                      disabled || !apkKeyName.trim() || !apkKeyUrl.trim()
                    }
                    color={colors.primary}
                    onPress={() =>
                      confirm(
                        "从 URL 下载 APK 仓库公钥",
                        "将由路由器通过 HTTPS 下载并保存到 /etc/apk/keys。请仅使用可信仓库提供的链接。",
                        () =>
                          buildFetchApkRepositoryKeyCommand(
                            apkKeyName,
                            apkKeyUrl,
                          ),
                        "APK 仓库公钥已从 URL 下载并保存。",
                      )
                    }
                  />
                  <PrimaryButton
                    label="保存 APK 仓库公钥"
                    disabled={
                      disabled || !apkKeyName.trim() || !apkKeyValue.trim()
                    }
                    color={colors.primary}
                    onPress={() =>
                      confirm(
                        "保存 APK 仓库公钥",
                        "将写入 /etc/apk/keys。请仅添加可信仓库提供的签名公钥。",
                        () =>
                          buildAddApkRepositoryKeyCommand(
                            apkKeyName,
                            apkKeyValue,
                          ),
                        "APK 仓库公钥已保存。",
                      )
                    }
                  />
                </View>
                <View
                  style={[styles.subsection, { borderTopColor: colors.border }]}
                >
                  <Text
                    style={[
                      styles.subsectionTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    LuCI HTTP/HTTPS 服务
                  </Text>
                  {!uhttpd.installed ? (
                    <Text style={[styles.help, { color: colors.warning }]}>
                      未检测到 uhttpd，无法配置 LuCI Web 服务。
                    </Text>
                  ) : (
                    <>
                      <SettingSwitch
                        label="将 HTTP 重定向至 HTTPS"
                        value={uhttpd.redirectHttps}
                        onValueChange={(value) =>
                          setUhttpd((current) => ({
                            ...current,
                            redirectHttps: value,
                          }))
                        }
                        colors={colors}
                      />
                      <PrimaryButton
                        label="保存 LuCI 服务设置"
                        disabled={disabled}
                        color={colors.primary}
                        onPress={() =>
                          confirm(
                            "保存 LuCI 服务设置",
                            "uhttpd 将重载，网页管理界面可能短暂不可用。",
                            () => buildSaveUhttpdCommand(uhttpd),
                            "LuCI HTTP/HTTPS 服务设置已保存。",
                          )
                        }
                      />
                    </>
                  )}
                </View>
                <View
                  style={[styles.subsection, { borderTopColor: colors.border }]}
                >
                  <Text
                    style={[
                      styles.subsectionTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    LuCI 主题
                  </Text>
                  <Text style={[styles.help, { color: colors.muted }]}>
                    显示路由器中实际安装的主题。切换后请在浏览器刷新 LuCI
                    管理页面。
                  </Text>
                  {luciThemes.length ? (
                    luciThemes.map((theme) => (
                      <Pressable
                        key={theme.name}
                        disabled={disabled || theme.active}
                        onPress={() =>
                          confirm(
                            "切换 LuCI 主题",
                            `将 LuCI 主题切换为“${theme.name}”。`,
                            () => buildSetLuciThemeCommand(theme.name),
                            "LuCI 主题已切换。",
                          )
                        }
                        style={({ pressed }) => [
                          styles.themeRow,
                          {
                            backgroundColor: theme.active
                              ? colors.primary + "18"
                              : colors.background,
                            borderColor: theme.active
                              ? colors.primary
                              : colors.border,
                            opacity: pressed && !theme.active ? 0.72 : 1,
                          },
                        ]}
                      >
                        <View style={styles.rowCopy}>
                          <Text
                            style={[
                              styles.rowTitle,
                              { color: colors.foreground },
                            ]}
                          >
                            {theme.name}
                          </Text>
                          <Text style={[styles.help, { color: colors.muted }]}>
                            {theme.active ? "当前使用" : "点按切换"}
                          </Text>
                        </View>
                        <MaterialIcons
                          name={theme.active ? "check-circle" : "chevron-right"}
                          size={theme.active ? 20 : 22}
                          color={theme.active ? colors.primary : colors.muted}
                        />
                      </Pressable>
                    ))
                  ) : (
                    <Text style={[styles.help, { color: colors.muted }]}>
                      未发现可切换的 LuCI 主题目录。
                    </Text>
                  )}
                </View>
              </>
            )}
          </View>
        ) : null}

        {panel === "network" ? (
          <View style={styles.body}>
            {interfaces.length ? (
              interfaces.map((item) => (
                <NetworkInterfaceCard
                  key={item.section}
                  item={item}
                  status={interfaceStatuses.find(
                    (status) => status.section === item.section,
                  )}
                  disabled={disabled}
                  colors={colors}
                  onSave={(next) =>
                    confirm(
                      "保存接口设置",
                      `将更新 ${item.section} 并重载网络；连接可能短暂中断。`,
                      () => buildSaveNetworkInterfaceCommand(next),
                      "接口设置已保存。",
                      true,
                    )
                  }
                  onRestart={() =>
                    confirm(
                      "重启接口",
                      `将短暂关闭并重新启动 ${item.section}。`,
                      () => buildNetworkInterfaceRestartCommand(item.section),
                      `${item.section} 已重启。`,
                    )
                  }
                  onDelete={() =>
                    confirm(
                      "删除接口",
                      `将删除 ${item.section} 的 UCI 配置并重载网络，此操作无法直接撤销。`,
                      () => buildNetworkInterfaceDeleteCommand(item.section),
                      `${item.section} 已删除。`,
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
            <View
              style={[styles.subsection, { borderTopColor: colors.border }]}
            >
              <Text
                style={[styles.subsectionTitle, { color: colors.foreground }]}
              >
                网络设备
              </Text>
              <Text style={[styles.help, { color: colors.muted }]}>
                配置 LuCI“网络 → 接口 → 设备”中的已有设备；保存会重载网络。
              </Text>
              {networkDevices.length ? (
                networkDevices.map((device) => (
                  <NetworkDeviceRow
                    key={device.section}
                    item={device}
                    disabled={disabled}
                    colors={colors}
                    onSave={(next) =>
                      confirm(
                        "保存网络设备",
                        `将更新 ${device.name || device.section} 并重载网络。`,
                        () => buildSaveNetworkDeviceCommand(next),
                        "网络设备设置已保存。",
                        true,
                      )
                    }
                  />
                ))
              ) : (
                <Text style={[styles.help, { color: colors.muted }]}>
                  未读取到独立的 network device 段。
                </Text>
              )}
            </View>
            <View
              style={[styles.subsection, { borderTopColor: colors.border }]}
            >
              <Text
                style={[styles.subsectionTitle, { color: colors.foreground }]}
              >
                全局网络设置
              </Text>
              <TextField
                label="IPv6 ULA 前缀"
                value={networkGlobal.ulaPrefix}
                onChangeText={(value) =>
                  setNetworkGlobal((current) => ({
                    ...current,
                    ulaPrefix: value,
                  }))
                }
                placeholder="fd00:1234:5678::/48"
                colors={colors}
              />
              <SettingSwitch
                label="启用数据包转发加速"
                value={networkGlobal.packetSteering}
                onValueChange={(value) =>
                  setNetworkGlobal((current) => ({
                    ...current,
                    packetSteering: value,
                  }))
                }
                colors={colors}
              />
              <PrimaryButton
                label="保存全局网络设置"
                disabled={disabled}
                color={colors.primary}
                onPress={() =>
                  confirm(
                    "保存全局网络设置",
                    "将更新全局网络配置并重载网络。",
                    () => buildSaveNetworkGlobalCommand(networkGlobal),
                    "全局网络设置已保存。",
                    true,
                  )
                }
              />
            </View>
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
    </ManagementShell>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry = false,
  multiline = false,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
  secureTextEntry?: boolean;
  multiline?: boolean;
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
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
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

function NewLedForm({
  disabled,
  colors,
  capabilities,
  onCreate,
}: {
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  capabilities: LedCapabilities;
  onCreate: (value: NewLedSettings) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [sysfs, setSysfs] = useState("");
  const [trigger, setTrigger] = useState("none");
  const [delayOn, setDelayOn] = useState("500");
  const [delayOff, setDelayOff] = useState("500");
  const activeDevices = capabilities.devices;
  const activeTriggers = capabilities.triggers.filter(
    (value) => LED_TRIGGER_LABELS[value],
  );
  const reset = () => {
    setSysfs(activeDevices[0] ?? "");
    setTrigger("none");
    setDelayOn("500");
    setDelayOff("500");
  };
  return (
    <View style={[styles.subsection, { borderTopColor: colors.border }]}>
      <PrimaryButton
        label="添加 LED"
        disabled={disabled || !activeDevices.length}
        color={colors.primary}
        onPress={() => {
          reset();
          setEditing(true);
        }}
      />
      <Modal
        visible={editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                添加 LED 配置
              </Text>
              <SmallButton
                label="关闭"
                disabled={false}
                color={colors.border}
                onPress={() => setEditing(false)}
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.help, { color: colors.muted }]}>
                名称会使用所选 LED 设备名称，避免创建重复配置。
              </Text>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                LED 名称
              </Text>
              <ChoiceChips
                values={activeDevices}
                selected={sysfs}
                onSelect={setSysfs}
                colors={colors}
              />
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                触发器
              </Text>
              <ChoiceChips
                values={activeTriggers}
                selected={trigger}
                onSelect={setTrigger}
                colors={colors}
                labels={LED_TRIGGER_LABELS}
              />
              {trigger === "timer" ? (
                <LedTimerChoices
                  delayOn={delayOn}
                  delayOff={delayOff}
                  onDelayOn={setDelayOn}
                  onDelayOff={setDelayOff}
                  colors={colors}
                />
              ) : null}
              <PrimaryButton
                label="保存新增 LED"
                disabled={disabled || !sysfs}
                color={colors.primary}
                onPress={() => {
                  onCreate({
                    name: sysfs,
                    sysfs,
                    trigger,
                    delayOn: trigger === "timer" ? delayOn : "",
                    delayOff: trigger === "timer" ? delayOff : "",
                  });
                  setEditing(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const LED_TRIGGER_LABELS: Record<string, string> = {
  "default-on": "始终开启（kernel: default-on）",
  heartbeat: "心跳闪烁（kernel: heartbeat）",
  netdev: "网络设备活动（kernel: netdev）",
  none: "始终关闭（kernel: none）",
  timer: "自定义闪烁间隔（kernel: timer）",
};

function LedTimerChoices({
  delayOn,
  delayOff,
  onDelayOn,
  onDelayOff,
  colors,
}: {
  delayOn: string;
  delayOff: string;
  onDelayOn: (value: string) => void;
  onDelayOff: (value: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const values = ["100", "250", "500", "1000", "2000"];
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        开启时间（毫秒）
      </Text>
      <ChoiceChips
        values={values}
        selected={delayOn}
        onSelect={onDelayOn}
        colors={colors}
      />
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        关闭时间（毫秒）
      </Text>
      <ChoiceChips
        values={values}
        selected={delayOff}
        onSelect={onDelayOff}
        colors={colors}
      />
    </View>
  );
}

function ChoiceChips({
  values,
  selected,
  onSelect,
  colors,
  emptyLabel = "无",
  labels,
}: {
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
  colors: ReturnType<typeof useColors>;
  emptyLabel?: string;
  labels?: Record<string, string>;
}) {
  return (
    <View style={styles.choiceRow}>
      {values.map((value) => {
        const active = selected === value;
        return (
          <Pressable
            key={value || "empty"}
            onPress={() => onSelect(value)}
            style={({ pressed }) => [
              styles.choice,
              {
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primary : colors.surface,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={{
                color: active ? "#fff" : colors.foreground,
                fontSize: 12,
                fontWeight: "800",
              }}
            >
              {(labels?.[value] ?? value) || emptyLabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DropbearInstanceFields({
  draft,
  onChange,
  colors,
}: {
  draft: Omit<DropbearInstance, "section">;
  onChange: (value: Omit<DropbearInstance, "section">) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <>
      <TextField
        label="SSH 端口"
        value={draft.port}
        onChangeText={(port) => onChange({ ...draft, port })}
        placeholder="22"
        keyboardType="number-pad"
        colors={colors}
      />
      <TextField
        label="监听接口（以空格分隔，留空即全部接口）"
        value={draft.interface}
        onChangeText={(interfaceName) =>
          onChange({ ...draft, interface: interfaceName })
        }
        placeholder="lan wan"
        colors={colors}
      />
      <SettingSwitch
        label="启用此 SSH 实例"
        value={draft.enabled}
        onValueChange={(enabled) => onChange({ ...draft, enabled })}
        colors={colors}
      />
      <SettingSwitch
        label="允许密码登录"
        value={draft.passwordAuth}
        onValueChange={(passwordAuth) => onChange({ ...draft, passwordAuth })}
        colors={colors}
      />
      <SettingSwitch
        label="允许 root 使用密码登录"
        value={draft.rootPasswordAuth}
        onValueChange={(rootPasswordAuth) =>
          onChange({ ...draft, rootPasswordAuth })
        }
        colors={colors}
      />
      <SettingSwitch
        label="允许远程主机连接转发端口（GatewayPorts）"
        value={draft.gatewayPorts}
        onValueChange={(gatewayPorts) => onChange({ ...draft, gatewayPorts })}
        colors={colors}
      />
    </>
  );
}

function DropbearInstanceRow({
  instance,
  disabled,
  colors,
  onSave,
  onEnabledChange,
}: {
  instance: DropbearInstance;
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  onSave: (value: DropbearInstance) => void;
  onEnabledChange: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState(instance);
  const [editing, setEditing] = useState(false);
  const editableDraft: Omit<DropbearInstance, "section"> = {
    port: draft.port,
    interface: draft.interface,
    passwordAuth: draft.passwordAuth,
    rootPasswordAuth: draft.rootPasswordAuth,
    gatewayPorts: draft.gatewayPorts,
    enabled: draft.enabled,
  };
  return (
    <View
      style={[
        styles.deviceRow,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>
          {instance.section}
        </Text>
        <Text style={[styles.help, { color: colors.muted }]}>
          {`端口 ${instance.port} · ${instance.interface || "全部接口"} · ${instance.gatewayPorts ? "允许网关端口" : "仅本地转发"}`}
        </Text>
      </View>
      <Switch
        value={instance.enabled}
        disabled={disabled}
        onValueChange={onEnabledChange}
        trackColor={{ false: colors.border, true: colors.primary }}
      />
      <SmallButton
        label="编辑"
        disabled={disabled}
        color={colors.primary}
        onPress={() => {
          setDraft(instance);
          setEditing(true);
        }}
      />
      <Modal
        visible={editing}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.rowCopy}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  编辑 SSH 实例
                </Text>
                <Text style={[styles.help, { color: colors.muted }]}>
                  {instance.section}
                </Text>
              </View>
              <SmallButton
                label="关闭"
                disabled={false}
                color={colors.border}
                onPress={() => setEditing(false)}
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <DropbearInstanceFields
                draft={editableDraft}
                onChange={(next) =>
                  setDraft((current) => ({ ...current, ...next }))
                }
                colors={colors}
              />
              <PrimaryButton
                label="保存 SSH 实例"
                disabled={disabled}
                color={colors.primary}
                onPress={() => {
                  onSave(draft);
                  setEditing(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function NewDropbearInstance({
  disabled,
  colors,
  onCreate,
}: {
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  onCreate: (value: Omit<DropbearInstance, "section">) => void;
}) {
  const [draft, setDraft] = useState(emptyDropbearInstance);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <PrimaryButton
        label="新增 SSH 实例"
        disabled={disabled}
        color={colors.primary}
        onPress={() => {
          setDraft(emptyDropbearInstance);
          setEditing(true);
        }}
      />
      <Modal
        visible={editing}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.rowCopy}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  新增 SSH 实例
                </Text>
                <Text style={[styles.help, { color: colors.muted }]}>
                  保存后 Dropbear 会短暂重启。
                </Text>
              </View>
              <SmallButton
                label="关闭"
                disabled={false}
                color={colors.border}
                onPress={() => setEditing(false)}
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <DropbearInstanceFields
                draft={draft}
                onChange={setDraft}
                colors={colors}
              />
              <PrimaryButton
                label="创建 SSH 实例"
                disabled={disabled || !draft.port.trim()}
                color={colors.primary}
                onPress={() => {
                  onCreate(draft);
                  setEditing(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function LedRow({
  led,
  disabled,
  colors,
  capabilities,
  onSave,
  onDelete,
  divider,
}: {
  led: LedSetting;
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  capabilities: LedCapabilities;
  onSave: (
    value: Pick<
      LedSetting,
      "section" | "name" | "sysfs" | "trigger" | "delayOn" | "delayOff"
    >,
  ) => void;
  onDelete: () => void;
  divider: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(led);
  useEffect(() => setDraft(led), [led]);
  const triggers = Object.keys(LED_TRIGGER_LABELS).filter((value) =>
    capabilities.triggers.includes(value),
  );
  const triggerLabel = LED_TRIGGER_LABELS[led.trigger] ?? led.trigger;
  return (
    <View
      style={[
        styles.interfaceCard,
        { backgroundColor: colors.background, borderColor: colors.border },
        divider && {
          marginTop: 10,
        },
      ]}
    >
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.ledSummary, pressed && styles.pressed]}
      >
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>
            {led.name}
          </Text>
          <Text style={[styles.help, { color: colors.muted }]}>
            {led.sysfs || "未绑定 LED 设备"}
          </Text>
          <Text style={[styles.help, { color: colors.muted }]}>
            {triggerLabel}
            {led.trigger === "timer"
              ? ` · 开 ${led.delayOn || "500"}ms / 关 ${led.delayOff || "500"}ms`
              : ""}
          </Text>
        </View>
        <MaterialIcons
          name={expanded ? "expand-less" : "expand-more"}
          size={24}
          color={colors.muted}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.cardActionRow}>
          <SmallButton
            label="编辑"
            disabled={disabled}
            color={colors.primary}
            onPress={() => {
              setDraft(led);
              setEditing(true);
            }}
          />
          <SmallButton
            label="删除"
            disabled={disabled}
            color={colors.error}
            onPress={onDelete}
          />
        </View>
      ) : null}
      <Modal
        visible={editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                编辑 LED 配置
              </Text>
              <SmallButton
                label="关闭"
                disabled={false}
                color={colors.border}
                onPress={() => setEditing(false)}
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                名称与 LED 名称
              </Text>
              <ChoiceChips
                values={capabilities.devices}
                selected={draft.sysfs}
                onSelect={(sysfs) =>
                  setDraft((value) => ({ ...value, sysfs, name: sysfs }))
                }
                colors={colors}
              />
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                触发器
              </Text>
              <ChoiceChips
                values={triggers.length ? triggers : ["none"]}
                selected={draft.trigger}
                onSelect={(trigger) =>
                  setDraft((value) => ({ ...value, trigger }))
                }
                colors={colors}
                labels={LED_TRIGGER_LABELS}
              />
              {draft.trigger === "timer" ? (
                <LedTimerChoices
                  delayOn={draft.delayOn || "500"}
                  delayOff={draft.delayOff || "500"}
                  onDelayOn={(delayOn) =>
                    setDraft((value) => ({ ...value, delayOn }))
                  }
                  onDelayOff={(delayOff) =>
                    setDraft((value) => ({ ...value, delayOff }))
                  }
                  colors={colors}
                />
              ) : null}
              <PrimaryButton
                label="保存"
                disabled={disabled || !draft.name || !draft.sysfs}
                color={colors.primary}
                onPress={() => {
                  onSave({
                    section: draft.section,
                    name: draft.name,
                    sysfs: draft.sysfs,
                    trigger: draft.trigger,
                    delayOn: draft.trigger === "timer" ? draft.delayOn : "",
                    delayOff: draft.trigger === "timer" ? draft.delayOff : "",
                  });
                  setEditing(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MountPointFields({
  value,
  onChange,
  colors,
}: {
  value: Omit<MountPoint, "section">;
  onChange: (value: Omit<MountPoint, "section">) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const update = (
    key: keyof Omit<MountPoint, "section">,
    next: string | boolean,
  ) => onChange({ ...value, [key]: next });
  return (
    <>
      <TextField
        label="挂载路径"
        value={value.target}
        onChangeText={(next) => update("target", next)}
        placeholder="/mnt/sda1"
        colors={colors}
      />
      <TextField
        label="设备路径"
        value={value.device}
        onChangeText={(next) => update("device", next)}
        placeholder="/dev/sda1"
        colors={colors}
      />
      <TextField
        label="文件系统"
        value={value.fstype}
        onChangeText={(next) => update("fstype", next)}
        placeholder="ext4"
        colors={colors}
      />
      <SettingSwitch
        label="开机自动挂载"
        value={value.enabled}
        onValueChange={(next) => update("enabled", next)}
        colors={colors}
      />
      <SettingSwitch
        label="挂载前检查文件系统"
        value={value.enabledFsck}
        onValueChange={(next) => update("enabledFsck", next)}
        colors={colors}
      />
    </>
  );
}

function MountPointCard({
  mount,
  disabled,
  colors,
  divider,
  onSave,
  onDelete,
}: {
  mount: MountPoint;
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  divider: boolean;
  onSave: (value: MountPoint) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(mount);
  useEffect(() => setDraft(mount), [mount]);
  return (
    <View
      style={[
        styles.interfaceCard,
        { backgroundColor: colors.background, borderColor: colors.border },
        divider && { marginTop: 10 },
      ]}
    >
      <View style={styles.interfaceHeader}>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>
            {mount.target || "未设置挂载路径"}
          </Text>
          <Text style={[styles.help, { color: colors.muted }]}>
            {[mount.device, mount.fstype].filter(Boolean).join(" · ") ||
              "未识别设备"}
          </Text>
        </View>
        <StatusPill
          label={mount.enabled ? "自动挂载" : "已停用"}
          tone={mount.enabled ? "success" : "warning"}
        />
      </View>
      <Text style={[styles.help, { color: colors.muted }]}>
        挂载前文件系统检查：{mount.enabledFsck ? "开启" : "关闭"}
      </Text>
      <View style={styles.cardActionRow}>
        <SmallButton
          label="编辑"
          disabled={disabled}
          color={colors.primary}
          onPress={() => {
            setDraft(mount);
            setEditing(true);
          }}
        />
        <SmallButton
          label="删除"
          disabled={disabled}
          color={colors.error}
          onPress={onDelete}
        />
      </View>
      <Modal
        visible={editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                编辑挂载点
              </Text>
              <SmallButton
                label="关闭"
                disabled={false}
                color={colors.border}
                onPress={() => setEditing(false)}
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <MountPointFields
                value={draft}
                onChange={(next) =>
                  setDraft((current) => ({ ...current, ...next }))
                }
                colors={colors}
              />
              <PrimaryButton
                label="保存"
                disabled={
                  disabled || !draft.target.trim() || !draft.device.trim()
                }
                color={colors.primary}
                onPress={() => {
                  onSave(draft);
                  setEditing(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function NewMountPointForm({
  disabled,
  colors,
  onCreate,
}: {
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  onCreate: (value: Omit<MountPoint, "section">) => void;
}) {
  const empty: Omit<MountPoint, "section"> = {
    target: "",
    device: "",
    fstype: "auto",
    enabled: true,
    enabledFsck: false,
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(empty);
  return (
    <>
      <SmallButton
        label="新增挂载点"
        disabled={disabled}
        color={colors.primary}
        onPress={() => {
          setDraft(empty);
          setEditing(true);
        }}
      />
      <Modal
        visible={editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                新增挂载点
              </Text>
              <SmallButton
                label="关闭"
                disabled={false}
                color={colors.border}
                onPress={() => setEditing(false)}
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <MountPointFields
                value={draft}
                onChange={setDraft}
                colors={colors}
              />
              <PrimaryButton
                label="创建挂载点"
                disabled={
                  disabled || !draft.target.trim() || !draft.device.trim()
                }
                color={colors.primary}
                onPress={() => {
                  onCreate(draft);
                  setEditing(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function NetworkInterfaceCard({
  item,
  status,
  disabled,
  colors,
  onSave,
  onRestart,
  onDelete,
}: {
  item: NetworkInterfaceSettings;
  status?: NetworkInterfaceStatus;
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  onSave: (value: NetworkInterfaceSettings) => void;
  onRestart: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(item);
  const [editing, setEditing] = useState(false);
  const update = (
    key: keyof NetworkInterfaceSettings,
    value: string | boolean,
  ) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <View
      style={[
        styles.interfaceCard,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <View style={styles.interfaceHeader}>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>
            {item.section}
          </Text>
          <Text style={[styles.help, { color: colors.muted }]}>
            {status?.device || item.device || "未绑定设备"}
          </Text>
        </View>
        <View style={styles.statusStack}>
          <StatusPill label={status?.proto || item.proto} tone="normal" />
          <StatusPill
            label={status?.up ? "链路在线" : "链路离线"}
            tone={status?.up ? "success" : "warning"}
          />
        </View>
      </View>
      <View style={styles.interfaceMetrics}>
        <InterfaceDetail
          label="运行时间"
          value={
            status?.uptimeSeconds == null
              ? "—"
              : formatUptime(status.uptimeSeconds)
          }
          colors={colors}
        />
        <InterfaceDetail
          label="MAC"
          value={status?.mac || "—"}
          colors={colors}
        />
        <InterfaceDetail
          label="IPv4"
          value={status?.ipv4.join(", ") || item.ipaddr || "—"}
          colors={colors}
        />
        <InterfaceDetail
          label="IPv6"
          value={status?.ipv6.join(", ") || "—"}
          colors={colors}
        />
      </View>
      <View style={styles.cardActionRow}>
        <SmallButton
          label="重启"
          disabled={disabled}
          color={colors.primary}
          onPress={onRestart}
        />
        <SmallButton
          label="编辑"
          disabled={disabled}
          color={colors.primary}
          onPress={() => {
            setDraft(item);
            setEditing(true);
          }}
        />
        <SmallButton
          label="删除"
          disabled={disabled}
          color={colors.error}
          onPress={onDelete}
        />
      </View>
      <Modal
        visible={editing}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  编辑 {item.section}
                </Text>
                <Text style={[styles.help, { color: colors.muted }]}>
                  保存后网络会短暂重载。
                </Text>
              </View>
              <Pressable
                onPress={() => setEditing(false)}
                style={({ pressed }) => [
                  styles.closeButton,
                  { borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[styles.closeButtonText, { color: colors.foreground }]}
                >
                  关闭
                </Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
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
                onPress={() => {
                  onSave(draft);
                  setEditing(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function NetworkDeviceRow({
  item,
  disabled,
  colors,
  onSave,
}: {
  item: NetworkDeviceSettings;
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  onSave: (value: NetworkDeviceSettings) => void;
}) {
  const [draft, setDraft] = useState(item);
  const [editing, setEditing] = useState(false);
  const update = (key: keyof NetworkDeviceSettings, value: string | boolean) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <View
      style={[
        styles.deviceRow,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>
          {item.name || item.section}
        </Text>
        <Text style={[styles.help, { color: colors.muted }]}>
          {[item.type, item.macaddr, item.mtu ? `MTU ${item.mtu}` : ""]
            .filter(Boolean)
            .join(" · ") || "默认设备设置"}
        </Text>
      </View>
      <SmallButton
        label="编辑"
        disabled={disabled}
        color={colors.primary}
        onPress={() => {
          setDraft(item);
          setEditing(true);
        }}
      />
      <Modal
        visible={editing}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                编辑网络设备
              </Text>
              <Pressable
                onPress={() => setEditing(false)}
                style={({ pressed }) => [
                  styles.closeButton,
                  { borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[styles.closeButtonText, { color: colors.foreground }]}
                >
                  关闭
                </Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <TextField
                label="设备名称"
                value={draft.name}
                onChangeText={(value) => update("name", value)}
                colors={colors}
              />
              <TextField
                label="设备类型"
                value={draft.type}
                onChangeText={(value) => update("type", value)}
                placeholder="bridge / 8021q"
                colors={colors}
              />
              <TextField
                label="MAC 地址"
                value={draft.macaddr}
                onChangeText={(value) => update("macaddr", value)}
                placeholder="00:11:22:33:44:55"
                colors={colors}
              />
              <TextField
                label="MTU"
                value={draft.mtu}
                onChangeText={(value) => update("mtu", value)}
                keyboardType="number-pad"
                colors={colors}
              />
              <SettingSwitch
                label="启用 IPv6"
                value={draft.ipv6}
                onValueChange={(value) => update("ipv6", value)}
                colors={colors}
              />
              <PrimaryButton
                label="保存网络设备"
                disabled={disabled}
                color={colors.primary}
                onPress={() => {
                  onSave(draft);
                  setEditing(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InterfaceDetail({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.interfaceDetail}>
      <Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text>
      <Text
        selectable
        numberOfLines={2}
        style={[styles.detailValue, { color: colors.foreground }]}
      >
        {value}
      </Text>
    </View>
  );
}

function SmallButton({
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
        styles.smallButton,
        { borderColor: color },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.smallButtonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days
    ? `${days} 天 ${hours} 小时`
    : hours
      ? `${hours} 小时 ${minutes} 分`
      : `${minutes} 分`;
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
  subsection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    gap: 12,
    marginTop: 4,
  },
  subsectionTitle: { fontSize: 15, fontWeight: "800" },
  interfaceCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  themeRow: {
    minHeight: 60,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ledSummary: { flexDirection: "row", alignItems: "center", gap: 10 },
  actionRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  statusStack: { alignItems: "flex-end", gap: 6 },
  interfaceMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  interfaceDetail: { width: "47%", gap: 2 },
  detailLabel: { fontSize: 11, fontWeight: "700" },
  detailValue: { fontSize: 12, lineHeight: 18, fontWeight: "700" },
  cardActionRow: { flexDirection: "row", gap: 8 },
  smallButton: {
    minHeight: 35,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 9,
  },
  smallButtonText: { fontSize: 12, fontWeight: "800" },
  deviceRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.46)",
  },
  modalSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    paddingBottom: 13,
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalContent: { paddingHorizontal: 18, paddingBottom: 30, gap: 14 },
  closeButton: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 9,
    borderWidth: 1,
  },
  closeButtonText: { fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
