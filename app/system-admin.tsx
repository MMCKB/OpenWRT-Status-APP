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
  buildLedSnapshotCommand,
  buildMountConnectedDevicesCommand,
  buildMountSnapshotCommand,
  buildNetworkDeviceSnapshotCommand,
  buildNetworkGlobalSnapshotCommand,
  buildNetworkInterfaceDeleteCommand,
  buildNetworkInterfaceRestartCommand,
  buildNetworkInterfaceOptionsSnapshotCommand,
  buildNetworkInterfaceSnapshotCommand,
  buildNetworkInterfaceStatusCommand,
  buildSaveLedCommand,
  buildSaveMountCommand,
  buildSaveNetworkInterfaceCommand,
  buildSaveNetworkDeviceCommand,
  buildSaveNetworkGlobalCommand,
  buildSaveSshInstanceCommand,
  buildSaveUhttpdCommand,
  buildSshAccessSnapshotCommand,
  buildSshInstanceActionCommand,
  buildSshAuthorizedKeysSnapshotCommand,
  buildStartupActionCommand,
  buildStartupSnapshotCommand,
  parseApkRepositoryKeys,
  parseLedCapabilities,
  parseLedSettings,
  parseMountedFileSystems,
  parseMountPoints,
  parseNetworkInterfaceOptions,
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
  type MountPoint,
  type MountedFileSystem,
  type NewLedSettings,
  type NetworkInterfaceSettings,
  type NetworkInterfaceOptions,
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
const emptyNetworkInterfaceOptions: NetworkInterfaceOptions = {
  protocols: ["dhcp", "static", "pppoe", "none", "unmanaged"],
  devices: [],
  firewallZones: [],
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
    networkDevices: [],
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
  const [apkKeyUrlDialogVisible, setApkKeyUrlDialogVisible] = useState(false);
  const [uhttpd, setUhttpd] = useState(emptyUhttpd);
  const [interfaces, setInterfaces] = useState<NetworkInterfaceSettings[]>([]);
  const [interfaceStatuses, setInterfaceStatuses] = useState<
    NetworkInterfaceStatus[]
  >([]);
  const [networkDevices, setNetworkDevices] = useState<NetworkDeviceSettings[]>(
    [],
  );
  const [networkGlobal, setNetworkGlobal] = useState(emptyNetworkGlobal);
  const [networkInterfaceOptions, setNetworkInterfaceOptions] =
    useState<NetworkInterfaceOptions>(emptyNetworkInterfaceOptions);

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
        networkRaw,
        interfaceStatusRaw,
        networkDeviceRaw,
        networkGlobalRaw,
        networkInterfaceOptionsRaw,
      ] = await Promise.all([
        execute(buildStartupSnapshotCommand()),
        execute(buildLedSnapshotCommand()),
        execute(buildLedCapabilitiesSnapshotCommand()),
        execute(buildMountSnapshotCommand()),
        execute(buildSshAccessSnapshotCommand()),
        execute(buildSshAuthorizedKeysSnapshotCommand()),
        execute(buildApkRepositoryKeysSnapshotCommand()),
        execute(buildUhttpdSnapshotCommand()),
        execute(buildNetworkInterfaceSnapshotCommand()),
        execute(buildNetworkInterfaceStatusCommand()),
        execute(buildNetworkDeviceSnapshotCommand()),
        execute(buildNetworkGlobalSnapshotCommand()),
        execute(buildNetworkInterfaceOptionsSnapshotCommand()),
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
      setInterfaces(parseNetworkInterfaceSettings(networkRaw));
      setInterfaceStatuses(parseNetworkInterfaceStatus(interfaceStatusRaw));
      setNetworkDevices(parseNetworkDeviceSettings(networkDeviceRaw));
      setNetworkGlobal(parseNetworkGlobalSettings(networkGlobalRaw));
      setNetworkInterfaceOptions(
        parseNetworkInterfaceOptions(networkInterfaceOptionsRaw),
      );
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

  function downloadApkRepositoryKeyFromUrl() {
    try {
      const url = apkKeyUrl.trim();
      const inferredName = url
        .split(/[?#]/, 1)[0]
        .split("/")
        .filter(Boolean)
        .pop()
        ?.trim();
      const keyName = apkKeyName.trim() || inferredName;
      if (!keyName) {
        throw new Error("请提供以公钥文件名结尾的 HTTPS 链接。");
      }
      setApkKeyName(keyName);
      setApkKeyUrlDialogVisible(false);
      void run(
        buildFetchApkRepositoryKeyCommand(keyName, url),
        "APK 仓库公钥已从 URL 下载并保存。",
      );
    } catch (reason) {
      setOutput(reason instanceof Error ? reason.message : "公钥 URL 不合法。");
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
      <SectionCard title={title} frameless={panel === "led" || panel === "mount"}>
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
                  onSave={(
                    next: Pick<
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
                  ) =>
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
                mountedFileSystems={mountedFileSystems}
                swapPartitions={swapPartitions}
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
                    "将扫描当前全部文件系统和交换分区，并生成后替换现有 fstab 配置。",
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
                  mountedFileSystems={mountedFileSystems}
                  swapPartitions={swapPartitions}
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
                    styles.mountDeviceRow,
                    { borderColor: colors.border },
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
                    styles.mountDeviceRow,
                    { borderColor: colors.border },
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
                  <PrimaryButton
                    label="从文件导入 APK 仓库公钥"
                    disabled={disabled}
                    color={colors.primary}
                    onPress={() => void importApkRepositoryKey()}
                  />
                  <PrimaryButton
                    label="从 URL 下载 APK 公钥"
                    disabled={disabled}
                    color={colors.primary}
                    onPress={() => setApkKeyUrlDialogVisible(true)}
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
                  options={networkInterfaceOptions}
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
      <Modal
        visible={apkKeyUrlDialogVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setApkKeyUrlDialogVisible(false)}
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
                下载 APK 仓库公钥
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭公钥 URL 输入"
                onPress={() => setApkKeyUrlDialogVisible(false)}
                style={({ pressed }) => [
                  styles.closeButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
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
            <View style={styles.modalContent}>
              <Text style={[styles.help, { color: colors.muted }]}>
                路由器将通过 HTTPS 下载公钥并保存到
                /etc/apk/keys。文件名会优先采用上方填写的名称，否则自动从链接推断。
              </Text>
              <TextField
                label="公钥文件 URL"
                value={apkKeyUrl}
                onChangeText={setApkKeyUrl}
                placeholder="https://example.com/keys/example.pub"
                colors={colors}
              />
              <PrimaryButton
                label="下载并保存"
                disabled={disabled || !apkKeyUrl.trim()}
                color={colors.primary}
                onPress={downloadApkRepositoryKeyFromUrl}
              />
            </View>
          </View>
        </View>
      </Modal>
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

function ModalCloseButton({
  colors,
  onPress,
}: {
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="关闭编辑弹窗"
      onPress={onPress}
      style={({ pressed }) => [
        styles.closeButton,
        { backgroundColor: colors.background, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.closeButtonText, { color: colors.foreground }]}>
        关闭
      </Text>
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
  const [name, setName] = useState("");
  const [sysfs, setSysfs] = useState("");
  const [trigger, setTrigger] = useState("none");
  const [delayOn, setDelayOn] = useState("500");
  const [delayOff, setDelayOff] = useState("500");
  const [netdevDevice, setNetdevDevice] = useState("");
  const [netdevMode, setNetdevMode] = useState("link");
  const [initialDraft, setInitialDraft] = useState<NewLedSettings>({
    name: "",
    sysfs: "",
    trigger: "none",
    delayOn: "500",
    delayOff: "500",
    netdevDevice: "",
    netdevMode: "link",
  });
  const activeDevices = capabilities.devices;
  const activeTriggers = capabilities.triggers.filter(
    (value) => LED_TRIGGER_LABELS[value],
  );
  const getDraft = (): NewLedSettings => ({
    name: name.trim(),
    sysfs,
    trigger,
    delayOn: trigger === "timer" ? delayOn : "",
    delayOff: trigger === "timer" ? delayOff : "",
    netdevDevice: trigger === "netdev" ? netdevDevice : "",
    netdevMode: trigger === "netdev" ? netdevMode : "",
  });
  const reset = () => {
    const nextDraft: NewLedSettings = {
      name: activeDevices[0] ?? "",
      sysfs: activeDevices[0] ?? "",
      trigger: "none",
      delayOn: "",
      delayOff: "",
      netdevDevice: "",
      netdevMode: "",
    };
    setName(nextDraft.name);
    setSysfs(nextDraft.sysfs);
    setTrigger(nextDraft.trigger);
    setDelayOn("500");
    setDelayOff("500");
    setNetdevDevice(capabilities.networkDevices[0] ?? "");
    setNetdevMode("link");
    setInitialDraft(nextDraft);
  };
  const closeEditor = () => setEditing(false);
  const isChanged = () =>
    JSON.stringify(getDraft()) !== JSON.stringify(initialDraft);
  const save = () => {
    const nextDraft = getDraft();
    if (JSON.stringify(nextDraft) !== JSON.stringify(initialDraft))
      onCreate(nextDraft);
    closeEditor();
  };
  const requestClose = () => {
    if (!isChanged()) {
      closeEditor();
      return;
    }
    Alert.alert(
      "保存新增 LED 配置？",
      "已填写或修改 LED 配置。关闭前是否保存到路由器？",
      [
        { text: "继续编辑", style: "cancel" },
        { text: "放弃修改", style: "destructive", onPress: closeEditor },
        { text: "保存", onPress: save },
      ],
    );
  };
  return (
    <View style={styles.bottomAddAction}>
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
        onRequestClose={requestClose}
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
              <ModalCloseButton colors={colors} onPress={requestClose} />
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                配置名称
              </Text>
              <TextField
                label=""
                value={name}
                onChangeText={setName}
                placeholder="例如：状态灯"
                colors={colors}
              />
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
              {trigger === "netdev" ? (
                <LedNetdevChoices
                  devices={capabilities.networkDevices}
                  selectedDevice={netdevDevice}
                  selectedMode={netdevMode}
                  onSelectDevice={setNetdevDevice}
                  onSelectMode={setNetdevMode}
                  colors={colors}
                />
              ) : null}
              <PrimaryButton
                label="保存新增 LED"
                disabled={
                  disabled ||
                  !name.trim() ||
                  !sysfs ||
                  (trigger === "netdev" && !netdevDevice)
                }
                color={colors.primary}
                onPress={save}
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
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        开启时间（毫秒）
      </Text>
      <TextField
        label=""
        value={delayOn}
        onChangeText={onDelayOn}
        keyboardType="number-pad"
        placeholder="例如：500"
        colors={colors}
      />
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        关闭时间（毫秒）
      </Text>
      <TextField
        label=""
        value={delayOff}
        onChangeText={onDelayOff}
        keyboardType="number-pad"
        placeholder="例如：500"
        colors={colors}
      />
    </View>
  );
}

function LedNetdevChoices({
  devices,
  selectedDevice,
  selectedMode,
  onSelectDevice,
  onSelectMode,
  colors,
}: {
  devices: string[];
  selectedDevice: string;
  selectedMode: string;
  onSelectDevice: (value: string) => void;
  onSelectMode: (value: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        设备
      </Text>
      <ChoiceChips
        values={devices}
        selected={selectedDevice}
        onSelect={onSelectDevice}
        colors={colors}
        emptyLabel="未发现网络设备"
      />
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        触发方式
      </Text>
      <ChoiceChips
        values={["link", "tx", "rx", "link tx", "link rx", "link tx rx"]}
        selected={selectedMode}
        onSelect={onSelectMode}
        colors={colors}
        labels={{
          link: "链路",
          tx: "发送",
          rx: "接收",
          "link tx": "链路 + 发送",
          "link rx": "链路 + 接收",
          "link tx rx": "链路 + 发送 + 接收",
        }}
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
  const closeEditor = () => setEditing(false);
  const isChanged = () => JSON.stringify(draft) !== JSON.stringify(instance);
  const requestClose = () => {
    if (!isChanged()) {
      closeEditor();
      return;
    }
    Alert.alert(
      "保存 SSH 实例？",
      "已修改 SSH 实例。关闭前是否保存到路由器？",
      [
        { text: "继续编辑", style: "cancel" },
        { text: "放弃修改", style: "destructive", onPress: closeEditor },
        {
          text: "保存",
          onPress: () => {
            onSave(draft);
            closeEditor();
          },
        },
      ],
    );
  };
  const save = () => {
    if (isChanged()) onSave(draft);
    closeEditor();
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
        onRequestClose={requestClose}
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
              <ModalCloseButton colors={colors} onPress={requestClose} />
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
                onPress={save}
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
              <ModalCloseButton
                colors={colors}
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
      | "section"
      | "name"
      | "sysfs"
      | "trigger"
      | "delayOn"
      | "delayOff"
      | "netdevDevice"
      | "netdevMode"
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
  const closeEditor = () => setEditing(false);
  const isChanged = () => JSON.stringify(draft) !== JSON.stringify(led);
  const save = () => {
    if (isChanged()) {
      onSave({
        section: draft.section,
        name: draft.name,
        sysfs: draft.sysfs,
        trigger: draft.trigger,
        delayOn: draft.trigger === "timer" ? draft.delayOn : "",
        delayOff: draft.trigger === "timer" ? draft.delayOff : "",
        netdevDevice: draft.trigger === "netdev" ? draft.netdevDevice : "",
        netdevMode: draft.trigger === "netdev" ? draft.netdevMode : "",
      });
    }
    closeEditor();
  };
  const requestClose = () => {
    if (!isChanged()) {
      closeEditor();
      return;
    }
    Alert.alert(
      "保存 LED 配置？",
      "已修改 LED 配置。关闭前是否保存到路由器？",
      [
        { text: "继续编辑", style: "cancel" },
        { text: "放弃修改", style: "destructive", onPress: closeEditor },
        { text: "保存", onPress: save },
      ],
    );
  };
  return (
    <View
      style={[
        styles.frameLessRow,
        { borderBottomColor: colors.border },
        divider && { marginTop: 2 },
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
        onRequestClose={requestClose}
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
              <ModalCloseButton colors={colors} onPress={requestClose} />
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                配置名称
              </Text>
              <TextField
                label=""
                value={draft.name}
                onChangeText={(name) =>
                  setDraft((value) => ({ ...value, name }))
                }
                placeholder="例如：状态灯"
                colors={colors}
              />
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                LED 名称
              </Text>
              <ChoiceChips
                values={capabilities.devices}
                selected={draft.sysfs}
                onSelect={(sysfs) => setDraft((value) => ({ ...value, sysfs }))}
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
              {draft.trigger === "netdev" ? (
                <LedNetdevChoices
                  devices={capabilities.networkDevices}
                  selectedDevice={draft.netdevDevice}
                  selectedMode={draft.netdevMode}
                  onSelectDevice={(netdevDevice) =>
                    setDraft((value) => ({ ...value, netdevDevice }))
                  }
                  onSelectMode={(netdevMode) =>
                    setDraft((value) => ({ ...value, netdevMode }))
                  }
                  colors={colors}
                />
              ) : null}
              <PrimaryButton
                label="保存"
                disabled={disabled || !draft.name || !draft.sysfs}
                color={colors.primary}
                onPress={save}
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
  mountedFileSystems,
  swapPartitions,
}: {
  value: Omit<MountPoint, "section">;
  onChange: (value: Omit<MountPoint, "section">) => void;
  colors: ReturnType<typeof useColors>;
  mountedFileSystems: MountedFileSystem[];
  swapPartitions: SwapPartition[];
}) {
  const update = (
    key: keyof Omit<MountPoint, "section">,
    next: string | boolean,
  ) => onChange({ ...value, [key]: next });
  return (
    <>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        挂载路径
      </Text>
      <ChoiceChips
        values={Array.from(
          new Set(
            [
              ...mountedFileSystems.map((item) => item.target),
              value.target,
            ].filter(Boolean),
          ),
        )}
        selected={value.target}
        onSelect={(next) => update("target", next)}
        colors={colors}
      />
      <TextInput
        value={value.target}
        onChangeText={(next) => update("target", next)}
        placeholder="自定义挂载路径，例如 /mnt/data"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.mountCustomInput,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      />
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}> 
        设备路径（UUID）
      </Text>
      <ChoiceChips
        values={Array.from(
          new Set(
            [
              ...mountedFileSystems.map((item) => item.device),
              ...swapPartitions.map((item) => item.device),
              value.device,
            ].filter(Boolean),
          ),
        )}
        selected={value.device}
        onSelect={(next) => {
          const matched = mountedFileSystems.find(
            (item) => item.device === next,
          );
          onChange({
            ...value,
            device: next,
            fstype: matched?.fstype || value.fstype,
            target: matched?.target || value.target,
          });
        }}
        colors={colors}
      />
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        文件系统
      </Text>
      <ChoiceChips
        values={Array.from(
          new Set(
            [
              ...mountedFileSystems.map((item) => item.fstype),
              value.fstype,
              "auto",
            ].filter(Boolean),
          ),
        )}
        selected={value.fstype}
        onSelect={(next) => update("fstype", next)}
        colors={colors}
      />
      <TextInput
        value={value.fstype}
        onChangeText={(next) => update("fstype", next)}
        placeholder="自定义文件系统类型，例如 btrfs"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.mountCustomInput,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
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
  mountedFileSystems,
  swapPartitions,
}: {
  mount: MountPoint;
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  divider: boolean;
  onSave: (value: MountPoint) => void;
  onDelete: () => void;
  mountedFileSystems: MountedFileSystem[];
  swapPartitions: SwapPartition[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(mount);
  useEffect(() => setDraft(mount), [mount]);
  const closeEditor = () => setEditing(false);
  const isChanged = () => JSON.stringify(draft) !== JSON.stringify(mount);
  const save = () => {
    if (isChanged()) onSave(draft);
    closeEditor();
  };
  const requestClose = () => {
    if (!isChanged()) {
      closeEditor();
      return;
    }
    Alert.alert("保存挂载点？", "已修改挂载点。关闭前是否保存到路由器？", [
      { text: "继续编辑", style: "cancel" },
      { text: "放弃修改", style: "destructive", onPress: closeEditor },
      { text: "保存", onPress: save },
    ]);
  };
  return (
    <View
      style={[
        styles.frameLessRow,
        { borderBottomColor: colors.border },
        divider && { marginTop: 2 },
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
        onRequestClose={requestClose}
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
              <ModalCloseButton colors={colors} onPress={requestClose} />
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
                mountedFileSystems={mountedFileSystems}
                swapPartitions={swapPartitions}
              />
              <PrimaryButton
                label="保存"
                disabled={
                  disabled || !draft.target.trim() || !draft.device.trim()
                }
                color={colors.primary}
                onPress={save}
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
  mountedFileSystems,
  swapPartitions,
  onCreate,
}: {
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  mountedFileSystems: MountedFileSystem[];
  swapPartitions: SwapPartition[];
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
  const [initialDraft, setInitialDraft] = useState(empty);
  const closeEditor = () => setEditing(false);
  const isChanged = () =>
    JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const save = () => {
    if (isChanged()) onCreate(draft);
    closeEditor();
  };
  const requestClose = () => {
    if (!isChanged()) {
      closeEditor();
      return;
    }
    Alert.alert("创建挂载点？", "已填写挂载点配置。关闭前是否保存到路由器？", [
      { text: "继续编辑", style: "cancel" },
      { text: "放弃修改", style: "destructive", onPress: closeEditor },
      { text: "保存", onPress: save },
    ]);
  };
  return (
    <>
      <SmallButton
        label="新增挂载点"
        disabled={disabled}
        color={colors.primary}
        onPress={() => {
          const source = mountedFileSystems[0];
          const nextDraft = source
            ? {
                ...empty,
                target: source.target,
                device: source.device,
                fstype: source.fstype,
              }
            : empty;
          setDraft(nextDraft);
          setInitialDraft(nextDraft);
          setEditing(true);
        }}
      />
      <Modal
        visible={editing}
        transparent
        animationType="slide"
        onRequestClose={requestClose}
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
              <ModalCloseButton colors={colors} onPress={requestClose} />
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <MountPointFields
                value={draft}
                onChange={setDraft}
                colors={colors}
                mountedFileSystems={mountedFileSystems}
                swapPartitions={swapPartitions}
              />
              <PrimaryButton
                label="创建挂载点"
                disabled={
                  disabled || !draft.target.trim() || !draft.device.trim()
                }
                color={colors.primary}
                onPress={save}
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
  options,
  onSave,
  onRestart,
  onDelete,
}: {
  item: NetworkInterfaceSettings;
  status?: NetworkInterfaceStatus;
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  options: NetworkInterfaceOptions;
  onSave: (value: NetworkInterfaceSettings) => void;
  onRestart: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(item);
  const [editing, setEditing] = useState(false);
  const [editTab, setEditTab] = useState<"general" | "advanced" | "firewall">(
    "general",
  );
  const update = (
    key: keyof NetworkInterfaceSettings,
    value: string | boolean,
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const closeEditor = () => setEditing(false);
  const isChanged = () => JSON.stringify(draft) !== JSON.stringify(item);
  const save = () => {
    if (isChanged()) onSave(draft);
    closeEditor();
  };
  const requestClose = () => {
    if (!isChanged()) {
      closeEditor();
      return;
    }
    Alert.alert(
      "保存网络接口？",
      `已修改 ${item.section} 接口。关闭前是否保存到路由器？`,
      [
        { text: "继续编辑", style: "cancel" },
        { text: "放弃修改", style: "destructive", onPress: closeEditor },
        { text: "保存", onPress: save },
      ],
    );
  };
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
        onRequestClose={requestClose}
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
              <ModalCloseButton colors={colors} onPress={requestClose} />
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <ChoiceChips
                values={["general", "advanced", "firewall"]}
                selected={editTab}
                onSelect={(value) =>
                  setEditTab(value as "general" | "advanced" | "firewall")
                }
                labels={{
                  general: "常规设置",
                  advanced: "高级设置",
                  firewall: "防火墙设置",
                }}
                colors={colors}
              />
              {editTab === "general" ? (
                <>
                  <Text
                    style={[styles.fieldLabel, { color: colors.foreground }]}
                  >
                    协议
                  </Text>
                  <ChoiceChips
                    values={[
                      ...new Set([...options.protocols, draft.proto]),
                    ].filter(Boolean)}
                    selected={draft.proto}
                    onSelect={(value) => update("proto", value)}
                    colors={colors}
                  />
                  <Text
                    style={[styles.fieldLabel, { color: colors.foreground }]}
                  >
                    设备
                  </Text>
                  <ChoiceChips
                    values={[
                      "",
                      ...new Set([...options.devices, draft.device]),
                    ].filter(
                      (value, index, list) => index === list.indexOf(value),
                    )}
                    selected={draft.device}
                    onSelect={(value) => update("device", value)}
                    emptyLabel="未指定"
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
                  <SettingSwitch
                    label="随系统启动"
                    value={draft.auto}
                    onValueChange={(value) => update("auto", value)}
                    colors={colors}
                  />
                </>
              ) : editTab === "advanced" ? (
                <>
                  <SettingSwitch
                    label="强制连接"
                    value={draft.forceLink}
                    onValueChange={(value) => update("forceLink", value)}
                    colors={colors}
                  />
                  <Text style={[styles.help, { color: colors.muted }]}>
                    无论链路状态如何，保持接口处于连接状态。
                  </Text>
                  <SettingSwitch
                    label="使用此接口网关作为默认网关"
                    value={draft.defaultRoute}
                    onValueChange={(value) => update("defaultRoute", value)}
                    colors={colors}
                  />
                  <SettingSwitch
                    label="使用自定义 DNS 服务器"
                    value={draft.useCustomDns}
                    onValueChange={(value) => update("useCustomDns", value)}
                    colors={colors}
                  />
                  {draft.useCustomDns ? (
                    <TextField
                      label="DNS（以空格分隔）"
                      value={draft.dns}
                      onChangeText={(value) => update("dns", value)}
                      colors={colors}
                    />
                  ) : null}
                  <TextField
                    label="DNS 权重"
                    value={draft.dnsMetric}
                    onChangeText={(value) => update("dnsMetric", value)}
                    keyboardType="number-pad"
                    colors={colors}
                  />
                  <TextField
                    label="网关跃点"
                    value={draft.metric}
                    onChangeText={(value) => update("metric", value)}
                    keyboardType="number-pad"
                    colors={colors}
                  />
                  <Text
                    style={[styles.fieldLabel, { color: colors.foreground }]}
                  >
                    多路 TCP（MPTCP）
                  </Text>
                  <ChoiceChips
                    values={["off", "on", "backup", "master"]}
                    selected={draft.mptcp}
                    onSelect={(value) => update("mptcp", value)}
                    labels={{
                      off: "关",
                      on: "开",
                      backup: "备用",
                      master: "主链路",
                    }}
                    colors={colors}
                  />
                  <TextField
                    label="覆盖 IPv4 路由表"
                    value={draft.ip4Table}
                    onChangeText={(value) => update("ip4Table", value)}
                    placeholder="未指定"
                    colors={colors}
                  />
                  <TextField
                    label="覆盖 IPv6 路由表"
                    value={draft.ip6Table}
                    onChangeText={(value) => update("ip6Table", value)}
                    placeholder="未指定"
                    colors={colors}
                  />
                  <SettingSwitch
                    label="委派 IPv6 前缀"
                    value={draft.delegate}
                    onValueChange={(value) => update("delegate", value)}
                    colors={colors}
                  />
                  <TextField
                    label="IPv6 前缀分配长度"
                    value={draft.ip6Assign}
                    onChangeText={(value) => update("ip6Assign", value)}
                    placeholder="已禁用"
                    keyboardType="number-pad"
                    colors={colors}
                  />
                  <TextField
                    label="IPv6 前缀过滤器"
                    value={draft.ip6Class}
                    onChangeText={(value) => update("ip6Class", value)}
                    placeholder="-- 请选择 --"
                    colors={colors}
                  />
                  <TextField
                    label="IPv6 后缀"
                    value={draft.ip6IfaceId}
                    onChangeText={(value) => update("ip6IfaceId", value)}
                    placeholder="::1"
                    colors={colors}
                  />
                  <TextField
                    label="IPv6 优先级"
                    value={draft.ip6Weight}
                    onChangeText={(value) => update("ip6Weight", value)}
                    keyboardType="number-pad"
                    colors={colors}
                  />
                </>
              ) : (
                <>
                  <Text
                    style={[styles.fieldLabel, { color: colors.foreground }]}
                  >
                    创建/分配防火墙区域
                  </Text>
                  <ChoiceChips
                    values={[
                      "",
                      ...options.firewallZones.map((zone) => zone.section),
                    ]}
                    selected={draft.firewallZone}
                    onSelect={(value) => update("firewallZone", value)}
                    emptyLabel="未指定"
                    labels={Object.fromEntries(
                      options.firewallZones.map((zone) => [
                        zone.section,
                        zone.name,
                      ]),
                    )}
                    colors={colors}
                  />
                  <Text style={[styles.help, { color: colors.muted }]}>
                    保存时会将此接口从其他区域移除，再加入所选区域。
                  </Text>
                </>
              )}
              <PrimaryButton
                label={`保存 ${item.section}`}
                disabled={disabled}
                color={colors.primary}
                onPress={save}
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
  const closeEditor = () => setEditing(false);
  const isChanged = () => JSON.stringify(draft) !== JSON.stringify(item);
  const save = () => {
    if (isChanged()) onSave(draft);
    closeEditor();
  };
  const requestClose = () => {
    if (!isChanged()) {
      closeEditor();
      return;
    }
    Alert.alert(
      "保存网络设备？",
      `已修改 ${item.name || item.section}。关闭前是否保存到路由器？`,
      [
        { text: "继续编辑", style: "cancel" },
        { text: "放弃修改", style: "destructive", onPress: closeEditor },
        { text: "保存", onPress: save },
      ],
    );
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
        onRequestClose={requestClose}
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
              <ModalCloseButton colors={colors} onPress={requestClose} />
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
                onPress={save}
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
  filled = false,
  onPress,
}: {
  label: string;
  disabled: boolean;
  color: string;
  filled?: boolean;
  onPress: () => void;
}) {
  const emphasized = filled || label === "关闭" || label === "删除";
  const actionColor = label === "关闭" ? "#D92D20" : color;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        {
          borderColor: actionColor,
          backgroundColor: emphasized ? actionColor : "transparent",
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.smallButtonText,
          { color: emphasized ? "#FFFFFF" : actionColor },
        ]}
      >
        {label}
      </Text>
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
  mountCustomInput: {
    minHeight: 43,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
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
  bottomAddAction: { paddingTop: 16, paddingBottom: 4 },
  frameLessRow: {
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mountDeviceRow: {
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  closeButtonText: { fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
