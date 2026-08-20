import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppDialog as Alert } from "@/components/app-dialog";
import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import {
  buildWakeOnLanCommand,
  buildWolDevicesSnapshotCommand,
  parseWolDevices,
  type WolDevice,
} from "@/lib/openwrt-admin";

export default function WakeOnLanScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [devices, setDevices] = useState<WolDevice[]>([]);
  const [selectedMac, setSelectedMac] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedDevice = useMemo(
    () => devices.find((device) => device.mac === selectedMac) ?? null,
    [devices, selectedMac],
  );
  const disabled = !hasRouter || !isSupported || isRunning || !selectedDevice;

  const refreshDevices = useCallback(async () => {
    try {
      const output = await execute(buildWolDevicesSnapshotCommand());
      const discovered = parseWolDevices(output);
      setDevices(discovered);
      setSelectedMac((current) =>
        current && discovered.some((device) => device.mac === current)
          ? current
          : null,
      );
      if (!discovered.length) {
        setNotice(
          "未读取到 LuCI 已配置的唤醒目标。请先在路由器的 LuCI 网络唤醒页面保存设备后重新读取。",
        );
      }
    } catch {}
  }, [execute]);

  useEffect(() => {
    if (hasRouter && isSupported) void refreshDevices();
  }, [hasRouter, isSupported, refreshDevices]);

  function sendWakePacket() {
    if (!selectedDevice) return;
    try {
      const command = buildWakeOnLanCommand(selectedDevice.mac);
      const deviceName =
        selectedDevice.hostname ?? selectedDevice.ipv4 ?? selectedDevice.mac;
      Alert.alert(
        "发送网络唤醒包？",
        `路由器将向 ${deviceName}（${selectedDevice.mac}）广播 Wake-on-LAN 唤醒包。目标设备需要支持网络唤醒，通常还需要有线网卡和待机供电。`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "发送",
            onPress: () =>
              void (async () => {
                try {
                  const output = await execute(command);
                  if (
                    output.includes("__WOL_UNAVAILABLE__") ||
                    output.includes("__WOL_INTERFACE_UNAVAILABLE__")
                  ) {
                    setNotice(
                      output.replace("__WOL_UNAVAILABLE__", "").trim() ||
                        "路由器未安装 etherwake、wakeonlan 或 wol。 ",
                    );
                    return;
                  }
                  setNotice(output.trim() || `已向 ${deviceName} 发送唤醒包。`);
                } catch {}
              })(),
          },
        ],
      );
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "MAC 地址无效。");
    }
  }

  return (
    <ManagementShell
      title="网络唤醒"
      description="从 LuCI 网络唤醒页面保存的目标中选择设备，再由 OpenWrt 路由器发送广播唤醒包。"
    >
      <View style={styles.form}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.label, { color: colors.foreground }]}>
            LuCI 已配置设备
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refreshDevices()}
            disabled={isRunning || !hasRouter || !isSupported}
            style={({ pressed }) => [
              styles.refreshButton,
              { borderColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons name="refresh" size={17} color={colors.primary} />
            <Text style={[styles.refreshText, { color: colors.primary }]}>
              重新读取
            </Text>
          </Pressable>
        </View>
        {devices.length ? (
          <View style={[styles.clientList, { borderColor: colors.border }]}>
            {devices.map((device, index) => {
              const selected = selectedMac === device.mac;
              return (
                <Pressable
                  key={device.mac}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedMac(device.mac)}
                  style={({ pressed }) => [
                    styles.clientRow,
                    index > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    },
                    selected && {
                      backgroundColor:
                        colors.background === "#102A43" ? "#164B3B" : "#E8F7F1",
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.clientInfo}>
                    <Text
                      numberOfLines={1}
                      style={[styles.clientName, { color: colors.foreground }]}
                    >
                      {device.hostname ?? "未命名设备"}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.clientMeta, { color: colors.muted }]}
                    >
                      {device.ipv4 ?? "未配置 IPv4"} · {device.mac}
                    </Text>
                  </View>
                  <MaterialIcons
                    name={
                      selected
                        ? "radio-button-checked"
                        : "radio-button-unchecked"
                    }
                    size={22}
                    color={selected ? colors.primary : colors.muted}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            暂未读取到 LuCI
            已配置设备，请在路由器网络唤醒页面保存目标后重新读取。
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={sendWakePacket}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary },
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          {isRunning ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <MaterialIcons
                name="power-settings-new"
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.buttonText}>
                {selectedDevice
                  ? `唤醒 ${selectedDevice.hostname ?? selectedDevice.mac}`
                  : "请选择设备"}
              </Text>
            </>
          )}
        </Pressable>
      </View>
      <ToolNotice>
        <Text style={[styles.notice, { color: colors.muted }]}>
          如提示缺少工具，请在路由器的软件包管理中安装 etherwake、wakeonlan 或
          wol。部分无线网卡、关机状态或跨网段场景不支持网络唤醒。
        </Text>
      </ToolNotice>
      {error ? (
        <ToolNotice>
          <Text style={[styles.notice, { color: colors.error }]}>{error}</Text>
        </ToolNotice>
      ) : null}
      {notice ? (
        <ToolNotice>
          <Text style={[styles.notice, { color: colors.foreground }]}>
            {notice}
          </Text>
        </ToolNotice>
      ) : null}
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: { fontSize: 13, fontWeight: "800" },
  refreshButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  refreshText: { fontSize: 12, fontWeight: "800" },
  clientList: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  clientRow: {
    minHeight: 62,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  clientInfo: { flex: 1, gap: 3 },
  clientName: { fontSize: 14, fontWeight: "800" },
  clientMeta: { fontSize: 12, fontVariant: ["tabular-nums"] },
  emptyText: { fontSize: 13, lineHeight: 19 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  notice: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
});
