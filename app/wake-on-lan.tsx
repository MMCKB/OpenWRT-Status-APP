import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
  buildWolCandidatesSnapshotCommand,
  buildWolDevicesSnapshotCommand,
  buildWolTargetSaveCommand,
  parseWolCandidates,
  parseWolDevices,
  type WolDevice,
} from "@/lib/openwrt-admin";

export default function WakeOnLanScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [devices, setDevices] = useState<WolDevice[]>([]);
  const [candidates, setCandidates] = useState<WolDevice[]>([]);
  const [selectedMac, setSelectedMac] = useState<string | null>(null);
  const [candidatePickerVisible, setCandidatePickerVisible] = useState(false);
  const [selectedCandidateMac, setSelectedCandidateMac] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedDevice = useMemo(
    () => devices.find((device) => device.mac === selectedMac) ?? null,
    [devices, selectedMac],
  );
  const selectedCandidate = useMemo(
    () => candidates.find((device) => device.mac === selectedCandidateMac) ?? null,
    [candidates, selectedCandidateMac],
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
      if (!discovered.length)
        setNotice("尚未保存唤醒目标。可通过“从已知设备添加”选择曾连接到路由器的客户端。");
    } catch {}
  }, [execute]);

  const openCandidatePicker = useCallback(async () => {
    try {
      const output = await execute(buildWolCandidatesSnapshotCommand());
      const discovered = parseWolCandidates(output);
      setCandidates(discovered);
      setSelectedCandidateMac((current) =>
        current && discovered.some((device) => device.mac === current)
          ? current
          : null,
      );
      setCandidatePickerVisible(true);
      if (!discovered.length)
        setNotice("未读取到 DHCP 租约或邻居缓存中的已知设备。请先让目标设备连接到路由器网络。");
    } catch {}
  }, [execute]);

  const saveCandidate = useCallback(async () => {
    if (!selectedCandidate) return;
    try {
      await execute(buildWolTargetSaveCommand(selectedCandidate));
      setCandidatePickerVisible(false);
      setSelectedCandidateMac(null);
      setSelectedMac(selectedCandidate.mac);
      setNotice(`${selectedCandidate.hostname ?? selectedCandidate.mac} 已保存到网络唤醒目标列表。`);
      await refreshDevices();
    } catch {}
  }, [execute, refreshDevices, selectedCandidate]);

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
      description="从已知客户端中选择并保存唤醒目标，再由 OpenWrt 路由器发送广播唤醒包。"
    >
      <View style={styles.form}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.label, { color: colors.foreground }]}>
            已保存的唤醒设备
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
        <Pressable
          accessibilityRole="button"
          onPress={() => void openCandidatePicker()}
          disabled={isRunning || !hasRouter || !isSupported}
          style={({ pressed }) => [
            styles.addButton,
            { borderColor: colors.primary },
            pressed && styles.pressed,
            (isRunning || !hasRouter || !isSupported) && styles.disabled,
          ]}
        >
          <MaterialIcons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.addButtonText, { color: colors.primary }]}>从已知设备添加</Text>
        </Pressable>
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
            尚未保存网络唤醒目标。请通过上方按钮从已连接或曾连接的 DHCP 客户端中添加。
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
      <Modal visible={candidatePickerVisible} transparent animationType="fade" onRequestClose={() => setCandidatePickerVisible(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setCandidatePickerVisible(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityViewIsModal>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCopy}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>选择唤醒设备</Text>
                <Text style={[styles.modalDescription, { color: colors.muted }]}>来源为 DHCP 租约、静态租约和路由器邻居缓存；选择后会保存到 LuCI 唤醒目标列表。</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setCandidatePickerVisible(false)} style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.background }, pressed && styles.pressed]}>
                <MaterialIcons name="close" size={18} color={colors.foreground} />
              </Pressable>
            </View>
            <FlatList
              data={candidates}
              keyExtractor={(item) => item.mac}
              style={styles.candidateList}
              ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.muted }]}>暂无可添加的已知设备。</Text>}
              renderItem={({ item, index }) => {
                const selected = item.mac === selectedCandidateMac;
                const alreadySaved = devices.some((device) => device.mac === item.mac);
                return (
                  <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setSelectedCandidateMac(item.mac)} style={({ pressed }) => [styles.candidateRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }, selected && { backgroundColor: colors.background }, pressed && styles.pressed]}>
                    <View style={styles.clientInfo}>
                      <Text numberOfLines={1} style={[styles.clientName, { color: colors.foreground }]}>{item.hostname ?? "未命名设备"}{alreadySaved ? "（已保存）" : ""}</Text>
                      <Text numberOfLines={1} style={[styles.clientMeta, { color: colors.muted }]}>{item.ipv4 ?? "未记录 IPv4"} · {item.mac}</Text>
                    </View>
                    <MaterialIcons name={selected ? "radio-button-checked" : "radio-button-unchecked"} size={22} color={selected ? colors.primary : colors.muted} />
                  </Pressable>
                );
              }}
            />
            <Pressable accessibilityRole="button" disabled={!selectedCandidate || isRunning} onPress={() => void saveCandidate()} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, (!selectedCandidate || isRunning) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>{selectedCandidate ? `保存 ${selectedCandidate.hostname ?? selectedCandidate.mac}` : "请选择设备"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  addButton: { minHeight: 42, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  addButtonText: { fontSize: 13, fontWeight: "800" },
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
  modalRoot: { flex: 1, justifyContent: "center", padding: 20 },
  modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(5, 11, 18, 0.62)" },
  modalCard: { maxHeight: "78%", borderRadius: 22, padding: 18, borderWidth: 1 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  modalTitleCopy: { flex: 1, gap: 4 },
  modalTitle: { fontSize: 18, fontWeight: "800", lineHeight: 24 },
  modalDescription: { fontSize: 13, lineHeight: 19 },
  closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  candidateList: { maxHeight: 360 },
  candidateRow: { minHeight: 62, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  saveButton: { minHeight: 46, marginTop: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
