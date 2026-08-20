import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import QRCode from "react-native-qrcode-svg";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  buildGuestNetworkCommand,
  buildWifiClientSnapshotCommand,
  buildWifiDeleteCommand,
  buildWifiQrValue,
  buildWifiSnapshotCommand,
  buildWifiSettingsSaveCommand,
  buildWifiSsidCommand,
  buildWifiToggleCommand,
  parseWifiClients,
  parseWifiConfigs,
  parseWifiNetworkBindings,
  WIFI_ENCRYPTION_OPTIONS,
  type WifiClient,
  type WifiConfigEntry,
} from "@/lib/openwrt-admin";

function signalLabel(signalDbm: number | null) {
  if (signalDbm === null) return "未报告";
  if (signalDbm >= -55) return `${signalDbm} dBm · 很强`;
  if (signalDbm >= -67) return `${signalDbm} dBm · 良好`;
  if (signalDbm >= -75) return `${signalDbm} dBm · 一般`;
  return `${signalDbm} dBm · 较弱`;
}

function hasWirelessSettingsChanged(
  draft: WifiConfigEntry,
  initial: WifiConfigEntry,
) {
  return (
    draft.encryption !== initial.encryption ||
    draft.key !== initial.key ||
    draft.network !== initial.network ||
    draft.hidden !== initial.hidden ||
    draft.isolate !== initial.isolate
  );
}

export default function WirelessManagerScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [networks, setNetworks] = useState<WifiConfigEntry[]>([]);
  const [networkBindings, setNetworkBindings] = useState<string[]>([]);
  const [clients, setClients] = useState<WifiClient[]>([]);
  const [draftSsids, setDraftSsids] = useState<Record<string, string>>({});
  const [draftNetworks, setDraftNetworks] = useState<
    Record<string, WifiConfigEntry>
  >({});
  const [editingNetwork, setEditingNetwork] = useState<WifiConfigEntry | null>(
    null,
  );
  const [visibleNetworkKeys, setVisibleNetworkKeys] = useState<
    Record<string, boolean>
  >({});
  const [guestSsid, setGuestSsid] = useState("OpenWrt-Guest");
  const [guestPassword, setGuestPassword] = useState("");
  const [isGuestPasswordVisible, setIsGuestPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const guestQr = useMemo(() => {
    try {
      return guestPassword.trim()
        ? buildWifiQrValue(guestSsid, guestPassword)
        : null;
    } catch {
      return null;
    }
  }, [guestPassword, guestSsid]);

  const availableNetworkBindings = useMemo(
    () =>
      [
        ...new Set([
          "lan",
          "wan",
          "wan6",
          "guest",
          ...networkBindings,
          ...networks.flatMap((item) =>
            item.network.split(/\s+/).filter(Boolean),
          ),
        ]),
      ].sort((left, right) => left.localeCompare(right)),
    [networkBindings, networks],
  );

  const refresh = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    setIsLoading(true);
    try {
      const [configOutput, clientOutput] = await Promise.all([
        execute(buildWifiSnapshotCommand()),
        execute(buildWifiClientSnapshotCommand()),
      ]);
      const nextNetworks = parseWifiConfigs(configOutput);
      setNetworks(nextNetworks);
      setNetworkBindings(parseWifiNetworkBindings(configOutput));
      setClients(parseWifiClients(clientOutput));
      setDraftSsids(
        Object.fromEntries(
          nextNetworks.map((item) => [item.section, item.ssid]),
        ),
      );
      setDraftNetworks(
        Object.fromEntries(nextNetworks.map((item) => [item.section, item])),
      );
    } catch {
      // 错误已由共享 SSH 钩子保存并呈现。
    } finally {
      setIsLoading(false);
    }
  }, [execute, hasRouter, isSupported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleNetwork = useCallback(
    (network: WifiConfigEntry, enabled: boolean) => {
      Alert.alert(
        enabled ? "开启无线网络" : "关闭无线网络",
        `${enabled ? "开启" : "关闭"} “${network.ssid}” 后，相关设备会短暂断开。`,
        [
          { text: "取消", style: "cancel" },
          {
            text: enabled ? "确认开启" : "确认关闭",
            style: enabled ? "default" : "destructive",
            onPress: () => {
              void execute(buildWifiToggleCommand(network.section, enabled))
                .then(refresh)
                .catch(() => undefined);
            },
          },
        ],
      );
    },
    [execute, refresh],
  );

  const saveSsid = useCallback(
    (network: WifiConfigEntry) => {
      const nextSsid = (draftSsids[network.section] ?? "").trim();
      if (!nextSsid || nextSsid === network.ssid) return;
      Alert.alert(
        "修改无线名称",
        `将 “${network.ssid}” 改为 “${nextSsid}”，无线会重载。`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "确认修改",
            onPress: () => {
              void execute(buildWifiSsidCommand(network.section, nextSsid))
                .then(refresh)
                .catch(() => undefined);
            },
          },
        ],
      );
    },
    [draftSsids, execute, refresh],
  );

  const saveWirelessSettings = useCallback(
    (network: WifiConfigEntry) => {
      const draft = draftNetworks[network.section] ?? network;
      if (!hasWirelessSettingsChanged(draft, network)) {
        setEditingNetwork(null);
        return;
      }
      try {
        void execute(buildWifiSettingsSaveCommand(draft))
          .then(async () => {
            setEditingNetwork(null);
            await refresh();
          })
          .catch(() => undefined);
      } catch (reason) {
        Alert.alert(
          "无法保存无线设置",
          reason instanceof Error ? reason.message : "请检查输入。",
        );
      }
    },
    [draftNetworks, execute, refresh],
  );

  const requestCloseWirelessSettings = useCallback(
    (network: WifiConfigEntry | null) => {
      if (!network) {
        setEditingNetwork(null);
        return;
      }
      const draft = draftNetworks[network.section] ?? network;
      if (!hasWirelessSettingsChanged(draft, network)) {
        setEditingNetwork(null);
        return;
      }
      Alert.alert(
        "保存无线设置？",
        "已修改无线设置。关闭前是否保存到路由器？",
        [
          { text: "继续编辑", style: "cancel" },
          {
            text: "放弃修改",
            style: "destructive",
            onPress: () => setEditingNetwork(null),
          },
          { text: "保存", onPress: () => saveWirelessSettings(network) },
        ],
      );
    },
    [draftNetworks, saveWirelessSettings],
  );

  const deleteNetwork = useCallback(
    (network: WifiConfigEntry) => {
      Alert.alert(
        "删除无线网络",
        `确定删除 “${network.ssid}” 吗？此操作会删除该无线配置并重新加载 Wi‑Fi。${network.section === "openwrt_app_guest" ? "同时会清理应用创建的访客网络、DHCP 和防火墙配置。" : ""}`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "确认删除",
            style: "destructive",
            onPress: () => {
              void execute(buildWifiDeleteCommand(network.section))
                .then(refresh)
                .catch(() => undefined);
            },
          },
        ],
      );
    },
    [execute, refresh],
  );

  const createGuest = useCallback(() => {
    const radio = networks[0]?.device;
    if (!radio) return;
    try {
      const command = buildGuestNetworkCommand(radio, guestSsid, guestPassword);
      Alert.alert(
        "创建或更新访客网络",
        "将创建独立访客子网（192.168.75.0/24），默认仅允许访问互联网，不能访问主 LAN。",
        [
          { text: "取消", style: "cancel" },
          {
            text: "确认创建",
            onPress: () => {
              void execute(command)
                .then(refresh)
                .catch(() => undefined);
            },
          },
        ],
      );
    } catch (reason) {
      Alert.alert(
        "无法创建访客网络",
        reason instanceof Error ? reason.message : "请检查访客网络信息。",
      );
    }
  }, [execute, guestPassword, guestSsid, networks, refresh]);

  const disabled = isRunning || isLoading || !hasRouter || !isSupported;
  return (
    <ManagementShell
      title="无线管理"
      description="管理现有无线网络，查看客户端信号，并创建隔离的访客网络。所有变更均直接写入路由器。"
    >
      {!hasRouter ? (
        <EmptyState
          icon="router"
          title="尚未选择路由器"
          description="请先在“路由器”页面选择一台设备。"
        />
      ) : !isSupported ? (
        <EmptyState
          icon="android"
          title="需要 Android 应用"
          description="无线管理通过应用内 SSH 运行，请安装最新 Android APK。"
        />
      ) : (
        <>
          <SectionCard
            title="无线网络"
            action={
              <Pressable
                accessibilityRole="button"
                onPress={() => void refresh()}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.refresh,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons
                  name="refresh"
                  size={19}
                  color={colors.primary}
                />
              </Pressable>
            }
          >
            {isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.helper, { color: colors.muted }]}>
                  正在读取无线配置…
                </Text>
              </View>
            ) : networks.length ? (
              networks.map((network, index) => (
                <View
                  key={network.section}
                  style={[
                    styles.network,
                    index > 0 && {
                      borderTopColor: colors.border,
                      borderTopWidth: 1,
                    },
                  ]}
                >
                  <View style={styles.networkTop}>
                    <View style={styles.networkCopy}>
                      <Text style={[styles.sectionId, { color: colors.muted }]}>
                        {network.device}
                      </Text>
                      <TextInput
                        value={draftSsids[network.section] ?? network.ssid}
                        onChangeText={(value) =>
                          setDraftSsids((previous) => ({
                            ...previous,
                            [network.section]: value,
                          }))
                        }
                        maxLength={32}
                        editable={!disabled}
                        style={[
                          styles.ssidInput,
                          {
                            color: colors.foreground,
                            borderColor: colors.border,
                            backgroundColor: colors.background,
                          },
                        ]}
                      />
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => saveSsid(network)}
                        disabled={
                          disabled ||
                          (draftSsids[network.section] ?? network.ssid) ===
                            network.ssid
                        }
                        style={({ pressed }) => [
                          styles.saveSsid,
                          { borderColor: colors.primary },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.saveSsidText,
                            { color: colors.primary },
                          ]}
                        >
                          保存名称
                        </Text>
                      </Pressable>
                    </View>
                    <Switch
                      value={!network.disabled}
                      onValueChange={(value) => toggleNetwork(network, value)}
                      disabled={disabled}
                      trackColor={{
                        false: colors.border,
                        true: colors.primary,
                      }}
                    />
                  </View>
                  <View style={styles.networkActions}>
                    <StatusPill
                      label={network.disabled ? "已关闭" : "已开启"}
                      tone={network.disabled ? "warning" : "success"}
                    />
                    <View style={styles.actionGroup}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setDraftNetworks((current) => ({
                            ...current,
                            [network.section]: network,
                          }));
                          setEditingNetwork(network);
                        }}
                        style={({ pressed }) => [
                          styles.advancedButton,
                          { borderColor: colors.primary },
                          pressed && styles.pressed,
                        ]}
                      >
                        <MaterialIcons
                          name="tune"
                          size={16}
                          color={colors.primary}
                        />
                        <Text
                          style={[
                            styles.saveSsidText,
                            { color: colors.primary },
                          ]}
                        >
                          编辑
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`删除 ${network.ssid}`}
                        onPress={() => deleteNetwork(network)}
                        disabled={disabled}
                        style={({ pressed }) => [
                          styles.deleteButton,
                          { borderColor: colors.error },
                          pressed && styles.pressed,
                          disabled && styles.disabled,
                        ]}
                      >
                        <MaterialIcons
                          name="delete-outline"
                          size={16}
                          color={colors.error}
                        />
                        <Text
                          style={[styles.deleteText, { color: colors.error }]}
                        >
                          删除
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.center}>
                <Text style={[styles.helper, { color: colors.muted }]}>
                  未读取到可编辑的无线配置。
                </Text>
              </View>
            )}
          </SectionCard>
          <SectionCard title={`无线客户端 · ${clients.length}`}>
            {clients.length ? (
              clients.map((client, index) => (
                <View
                  key={`${client.interfaceName}-${client.mac}`}
                  style={[
                    styles.clientRow,
                    index > 0 && {
                      borderTopColor: colors.border,
                      borderTopWidth: 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.clientIcon,
                      { backgroundColor: colors.background },
                    ]}
                  >
                    <MaterialIcons
                      name="wifi"
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.clientCopy}>
                    <Text
                      style={[styles.clientMac, { color: colors.foreground }]}
                    >
                      {client.mac}
                    </Text>
                    <Text style={[styles.helper, { color: colors.muted }]}>
                      {client.interfaceName ?? "无线接口"} ·{" "}
                      {signalLabel(client.signalDbm)}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.center}>
                <Text style={[styles.helper, { color: colors.muted }]}>
                  当前没有从无线驱动读取到已连接客户端。
                </Text>
              </View>
            )}
          </SectionCard>
          <SectionCard title="访客网络">
            <View style={styles.guestForm}>
              <Text style={[styles.helper, { color: colors.muted }]}>
                会使用第一个已发现的无线设备，创建或更新应用专用的 guest
                配置段。
              </Text>
              <TextInput
                value={guestSsid}
                onChangeText={setGuestSsid}
                editable={!disabled}
                maxLength={32}
                placeholder="访客网络名称"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              />
              <View style={styles.passwordField}>
                <TextInput
                  value={guestPassword}
                  onChangeText={setGuestPassword}
                  editable={!disabled}
                  secureTextEntry={!isGuestPasswordVisible}
                  autoCapitalize="none"
                  maxLength={63}
                  placeholder="访客网络密码（8–63 位）"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    styles.passwordInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isGuestPasswordVisible
                      ? "隐藏访客网络密码"
                      : "显示访客网络密码"
                  }
                  accessibilityState={{ selected: isGuestPasswordVisible }}
                  hitSlop={8}
                  onPress={() =>
                    setIsGuestPasswordVisible((visible) => !visible)
                  }
                  style={({ pressed }) => [
                    styles.passwordToggle,
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialIcons
                    name={
                      isGuestPasswordVisible ? "visibility-off" : "visibility"
                    }
                    size={21}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={
                  disabled ||
                  guestPassword.trim().length < 8 ||
                  !networks.length
                }
                onPress={createGuest}
                style={({ pressed }) => [
                  styles.guestButton,
                  { backgroundColor: colors.primary },
                  pressed && styles.pressed,
                  (disabled ||
                    guestPassword.trim().length < 8 ||
                    !networks.length) &&
                    styles.disabled,
                ]}
              >
                <MaterialIcons
                  name="add-circle-outline"
                  size={19}
                  color="#FFFFFF"
                />
                <Text style={styles.guestButtonText}>创建或更新访客网络</Text>
              </Pressable>
              {guestQr ? (
                <View style={[styles.qrArea, { backgroundColor: "#FFFFFF" }]}>
                  <QRCode
                    value={guestQr}
                    size={156}
                    color="#12313A"
                    backgroundColor="#FFFFFF"
                  />
                  <Text style={styles.qrCaption}>访客扫描此二维码即可连接</Text>
                </View>
              ) : (
                <Text style={[styles.helper, { color: colors.muted }]}>
                  填写至少 8 位密码后，将显示可扫描的离线二维码。
                </Text>
              )}
            </View>
          </SectionCard>
        </>
      )}
      {error ? (
        <ToolNotice>
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        </ToolNotice>
      ) : null}
      <Modal
        visible={Boolean(editingNetwork)}
        transparent
        animationType="slide"
        onRequestClose={() => requestCloseWirelessSettings(editingNetwork)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalSheet, { backgroundColor: colors.surface }]}
          >
            {editingNetwork ? (
              <ScrollView contentContainerStyle={styles.modalScroll}>
                <WirelessSettingsForm
                  network={
                    draftNetworks[editingNetwork.section] ?? editingNetwork
                  }
                  isPasswordVisible={
                    visibleNetworkKeys[editingNetwork.section] ?? false
                  }
                  colors={colors}
                  disabled={disabled}
                  networkBindings={availableNetworkBindings}
                  onClose={() => requestCloseWirelessSettings(editingNetwork)}
                  onChange={(key, value) =>
                    setDraftNetworks((current) => ({
                      ...current,
                      [editingNetwork.section]: {
                        ...(current[editingNetwork.section] ?? editingNetwork),
                        [key]: value,
                      },
                    }))
                  }
                  onTogglePassword={() =>
                    setVisibleNetworkKeys((current) => ({
                      ...current,
                      [editingNetwork.section]: !(
                        current[editingNetwork.section] ?? false
                      ),
                    }))
                  }
                  onSave={() => saveWirelessSettings(editingNetwork)}
                />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </ManagementShell>
  );
}

function WirelessSettingsForm({
  network,
  isPasswordVisible,
  colors,
  disabled,
  networkBindings,
  onChange,
  onTogglePassword,
  onClose,
  onSave,
}: {
  network: WifiConfigEntry;
  isPasswordVisible: boolean;
  colors: ReturnType<typeof useColors>;
  disabled: boolean;
  networkBindings: string[];
  onChange: (
    key: "encryption" | "key" | "network" | "hidden" | "isolate",
    value: string | boolean,
  ) => void;
  onTogglePassword: () => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <View
      style={[
        styles.advancedForm,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <View style={styles.modalHeader}>
        <Text style={[styles.advancedTitle, { color: colors.foreground }]}>
          编辑无线设置
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭无线设置编辑"
          onPress={onClose}
          style={({ pressed }) => [
            styles.closePill,
            { backgroundColor: colors.background },
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons name="close" size={17} color={colors.foreground} />
          <Text style={[styles.closePillText, { color: colors.foreground }]}>
            关闭
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.helper, { color: colors.muted }]}>
        可选择常用 WPA2/WPA3 加密、SSID 隐藏、客户端隔离和绑定网络接口。
      </Text>
      <Text style={[styles.label, { color: colors.foreground }]}>加密方式</Text>
      <View style={styles.choiceGrid}>
        {WIFI_ENCRYPTION_OPTIONS.map((option) => {
          const selected = network.encryption === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              disabled={disabled}
              onPress={() => onChange("encryption", option.value)}
              style={({ pressed }) => [
                styles.choicePill,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  { color: selected ? "#FFFFFF" : colors.foreground },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.label, { color: colors.foreground }]}>无线密码</Text>
      <View style={styles.passwordField}>
        <TextInput
          value={network.key}
          onChangeText={(value) => onChange("key", value)}
          editable={!disabled}
          secureTextEntry={!isPasswordVisible}
          autoCapitalize="none"
          placeholder="WPA 密码"
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            styles.passwordInput,
            {
              color: colors.foreground,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={onTogglePassword}
          style={({ pressed }) => [
            styles.passwordToggle,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons
            name={isPasswordVisible ? "visibility-off" : "visibility"}
            size={21}
            color={colors.muted}
          />
        </Pressable>
      </View>
      <Text style={[styles.label, { color: colors.foreground }]}>绑定网络</Text>
      <Text style={[styles.helper, { color: colors.muted }]}>
        可同时选择多个接口。
      </Text>
      <View style={styles.choiceGrid}>
        {networkBindings.map((binding) => {
          const selected = network.network.split(/\s+/).includes(binding);
          return (
            <Pressable
              key={binding}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              disabled={disabled}
              onPress={() => {
                const next = new Set(
                  network.network.split(/\s+/).filter(Boolean),
                );
                if (next.has(binding)) next.delete(binding);
                else next.add(binding);
                onChange("network", [...next].join(" "));
              }}
              style={({ pressed }) => [
                styles.choicePill,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  { color: selected ? "#FFFFFF" : colors.foreground },
                ]}
              >
                {binding}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.optionRow}>
        <Text style={[styles.label, { color: colors.foreground }]}>
          隐藏 SSID
        </Text>
        <Switch
          value={network.hidden}
          onValueChange={(value) => onChange("hidden", value)}
          disabled={disabled}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>
      <View style={styles.optionRow}>
        <Text style={[styles.label, { color: colors.foreground }]}>
          客户端隔离
        </Text>
        <Switch
          value={network.isolate}
          onValueChange={(value) => onChange("isolate", value)}
          disabled={disabled}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onSave}
        disabled={disabled}
        style={({ pressed }) => [
          styles.advancedSave,
          { backgroundColor: colors.primary },
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <Text style={styles.guestButtonText}>保存</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  refresh: { padding: 4 },
  center: {
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
  },
  helper: { fontSize: 12, lineHeight: 18 },
  network: { padding: 15, gap: 10 },
  networkTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  networkCopy: { flex: 1, gap: 7 },
  sectionId: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  ssidInput: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 42,
    paddingHorizontal: 11,
    fontSize: 15,
    fontWeight: "700",
  },
  saveSsid: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  saveSsidText: { fontSize: 12, fontWeight: "800" },
  networkActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  actionGroup: { flexDirection: "row", gap: 7 },
  advancedButton: {
    minHeight: 31,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deleteButton: {
    minHeight: 31,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deleteText: { fontSize: 12, fontWeight: "800" },
  advancedForm: { padding: 16, gap: 9 },
  advancedTitle: { fontSize: 14, fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.52)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  modalScroll: { paddingBottom: 24 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  closePill: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  closePillText: { fontSize: 12, fontWeight: "800" },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choicePill: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceText: { fontSize: 12, fontWeight: "800" },
  label: { fontSize: 13, fontWeight: "800" },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 38,
  },
  advancedSave: {
    minHeight: 44,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  clientRow: {
    minHeight: 68,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  clientIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  clientCopy: { flex: 1, gap: 3 },
  clientMac: { fontSize: 14, fontWeight: "800" },
  guestForm: { padding: 15, gap: 11 },
  input: {
    borderWidth: 1,
    borderRadius: 11,
    minHeight: 46,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  passwordField: { position: "relative" },
  passwordInput: { paddingRight: 50 },
  passwordToggle: {
    position: "absolute",
    right: 1,
    top: 1,
    width: 46,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  guestButton: {
    minHeight: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  guestButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  qrArea: {
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 18,
    marginTop: 2,
  },
  qrCaption: { color: "#12313A", fontSize: 13, fontWeight: "700" },
  error: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
