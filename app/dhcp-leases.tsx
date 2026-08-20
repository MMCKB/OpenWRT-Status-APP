import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppDialog as Alert } from "@/components/app-dialog";

import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import {
  buildDhcpLeaseSnapshotCommand,
  buildDhcpStaticLeaseDeleteCommand,
  buildDhcpStaticLeaseSaveCommand,
  parseDhcpLeaseSnapshot,
  type DhcpLease,
  type DhcpStaticLeaseDraft,
} from "@/lib/openwrt-admin";

const EMPTY_DRAFT: DhcpStaticLeaseDraft = {
  hostname: "",
  mac: "",
  ipv4: "",
  leasetime: "",
};

function leaseLabel(lease: DhcpLease) {
  return lease.hostname ?? lease.ipv4 ?? lease.mac;
}

export default function DhcpLeasesScreen() {
  const colors = useColors();
  const { execute, isRunning, error, hasRouter, isSupported } = useManagedSsh();
  const [dynamic, setDynamic] = useState<DhcpLease[]>([]);
  const [staticLeases, setStaticLeases] = useState<DhcpLease[]>([]);
  const [draft, setDraft] = useState<DhcpStaticLeaseDraft>(EMPTY_DRAFT);
  const [initialDraft, setInitialDraft] =
    useState<DhcpStaticLeaseDraft>(EMPTY_DRAFT);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    try {
      const snapshot = parseDhcpLeaseSnapshot(
        await execute(buildDhcpLeaseSnapshotCommand()),
      );
      setDynamic(snapshot.dynamic);
      setStaticLeases(snapshot.static);
    } catch {
      // The managed SSH hook exposes the user-facing error state.
    }
  }, [execute, hasRouter, isSupported]);

  useEffect(() => {
    if (hasRouter && isSupported) void refresh();
  }, [hasRouter, isSupported, refresh]);

  function startNew(source?: DhcpLease) {
    const nextDraft = {
      section: undefined,
      hostname: source?.hostname ?? "",
      mac: source?.mac ?? "",
      ipv4: source?.ipv4 ?? "",
      leasetime: "",
    };
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setShowForm(true);
  }

  function startEdit(lease: DhcpLease) {
    const nextDraft = {
      section: lease.section ?? undefined,
      hostname: lease.hostname ?? "",
      mac: lease.mac,
      ipv4: lease.ipv4 ?? "",
      leasetime: lease.leasetime ?? "",
    };
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setShowForm(true);
  }

  const isDraftChanged = () =>
    draft.hostname !== initialDraft.hostname ||
    draft.mac !== initialDraft.mac ||
    draft.ipv4 !== initialDraft.ipv4 ||
    (draft.leasetime ?? "") !== (initialDraft.leasetime ?? "");

  function closeForm() {
    setShowForm(false);
    setDraft(EMPTY_DRAFT);
    setInitialDraft(EMPTY_DRAFT);
  }

  function saveDraft() {
    if (!isDraftChanged()) {
      closeForm();
      return;
    }
    try {
      const command = buildDhcpStaticLeaseSaveCommand(draft);
      void (async () => {
        try {
          await execute(command);
          closeForm();
          await refresh();
        } catch {}
      })();
    } catch (caught) {
      Alert.alert(
        "无法保存",
        caught instanceof Error ? caught.message : "请检查输入内容。",
      );
    }
  }

  function requestCloseForm() {
    if (!isDraftChanged()) {
      closeForm();
      return;
    }
    Alert.alert("保存固定地址？", "已修改静态租约。关闭前是否保存到路由器？", [
      { text: "继续编辑", style: "cancel" },
      { text: "放弃修改", style: "destructive", onPress: closeForm },
      { text: "保存", onPress: saveDraft },
    ]);
  }

  function deleteLease(lease: DhcpLease) {
    if (!lease.section) return;
    Alert.alert(
      "删除固定地址",
      `确定删除 ${leaseLabel(lease)} 的静态租约吗？设备下次续租时将按 DHCP 地址池重新分配地址。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () =>
            void (async () => {
              try {
                await execute(
                  buildDhcpStaticLeaseDeleteCommand(lease.section!),
                );
                await refresh();
              } catch {}
            })(),
        },
      ],
    );
  }

  return (
    <ManagementShell
      title="DHCP 与静态租约"
      description="查看当前 DHCP 分配，并为常用设备固定 IPv4 地址。所有变更均在确认后写入路由器 UCI 配置。"
    >
      <View style={styles.toolbar}>
        <View style={styles.pills}>
          <StatusPill label={`${dynamic.length} 个动态`} tone="normal" />
          <StatusPill label={`${staticLeases.length} 个固定`} tone="success" />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="刷新 DHCP 租约"
          onPress={() => void refresh()}
          disabled={isRunning || !hasRouter || !isSupported}
          style={({ pressed }) => [
            styles.refresh,
            { backgroundColor: colors.primary },
            (isRunning || !hasRouter || !isSupported) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {isRunning ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialIcons name="refresh" size={18} color="#FFFFFF" />
              <Text style={styles.refreshText}>刷新</Text>
            </>
          )}
        </Pressable>
      </View>

      {!isSupported ? (
        <ToolNotice>
          <Text style={[styles.errorText, { color: colors.error }]}>
            DHCP 管理需要安装支持应用内 SSH 的最新 Android 安装包。
          </Text>
        </ToolNotice>
      ) : null}
      {error ? (
        <ToolNotice>
          <Text style={[styles.errorText, { color: colors.error }]}>
            {error}
          </Text>
        </ToolNotice>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => startNew()}
        disabled={isRunning || !hasRouter || !isSupported}
        style={({ pressed }) => [
          styles.add,
          { backgroundColor: colors.primary },
          (isRunning || !hasRouter || !isSupported) && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <MaterialIcons name="add" size={20} color="#FFFFFF" />
        <Text style={styles.addText}>新增固定地址</Text>
      </Pressable>

      <Modal
        visible={showForm}
        transparent
        animationType="slide"
        onRequestClose={requestCloseForm}
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
                {draft.section ? "编辑固定地址" : "新增固定地址"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭静态租约编辑弹窗"
                onPress={requestCloseForm}
                style={({ pressed }) => [
                  styles.closeButton,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
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
            <ScrollView
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps="handled"
            >
              <LeaseField
                label="设备名称"
                value={draft.hostname}
                onChangeText={(hostname) =>
                  setDraft((current) => ({ ...current, hostname }))
                }
                placeholder="例如 NAS"
                colors={colors}
              />
              <LeaseField
                label="MAC 地址"
                value={draft.mac}
                onChangeText={(mac) =>
                  setDraft((current) => ({ ...current, mac }))
                }
                placeholder="AA:BB:CC:DD:EE:FF"
                autoCapitalize="characters"
                colors={colors}
              />
              <LeaseField
                label="固定 IPv4"
                value={draft.ipv4}
                onChangeText={(ipv4) =>
                  setDraft((current) => ({ ...current, ipv4 }))
                }
                placeholder="192.168.1.20"
                keyboardType="numeric"
                colors={colors}
              />
              <LeaseField
                label="租约期限（可选）"
                value={draft.leasetime ?? ""}
                onChangeText={(leasetime) =>
                  setDraft((current) => ({ ...current, leasetime }))
                }
                placeholder="例如 12h"
                colors={colors}
              />
              <View style={styles.formActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={requestCloseForm}
                  style={({ pressed }) => [
                    styles.cancel,
                    { borderColor: colors.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.cancelText, { color: colors.foreground }]}
                  >
                    取消
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={saveDraft}
                  disabled={isRunning}
                  style={({ pressed }) => [
                    styles.save,
                    { backgroundColor: colors.primary },
                    isRunning && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.saveText}>确认应用</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {staticLeases.length ? (
        <SectionCard title="固定地址">
          {staticLeases.map((lease, index) => (
            <LeaseRow
              key={lease.section ?? lease.mac}
              lease={lease}
              colors={colors}
              showActions
              onEdit={() => startEdit(lease)}
              onDelete={() => deleteLease(lease)}
              divider={index > 0}
            />
          ))}
        </SectionCard>
      ) : null}
      {dynamic.length ? (
        <SectionCard title="当前动态租约">
          {dynamic.map((lease, index) => (
            <LeaseRow
              key={lease.mac}
              lease={lease}
              colors={colors}
              divider={index > 0}
              onFix={() => startNew(lease)}
            />
          ))}
        </SectionCard>
      ) : !isRunning && hasRouter && !staticLeases.length ? (
        <EmptyState
          icon="dns"
          title="暂未读取到 DHCP 租约"
          description="请点击刷新。使用静态 IP 且未写入 DHCP 的设备不会出现在动态租约中。"
        />
      ) : null}
    </ManagementShell>
  );
}

function LeaseField({
  label,
  value,
  onChangeText,
  placeholder,
  colors,
  autoCapitalize = "sentences",
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  colors: ReturnType<typeof useColors>;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        style={[
          styles.input,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      />
    </View>
  );
}

function LeaseRow({
  lease,
  colors,
  divider,
  showActions,
  onEdit,
  onDelete,
  onFix,
}: {
  lease: DhcpLease;
  colors: ReturnType<typeof useColors>;
  divider?: boolean;
  showActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onFix?: () => void;
}) {
  return (
    <View
      style={[
        styles.leaseRow,
        divider && { borderTopWidth: 1, borderTopColor: colors.border },
      ]}
    >
      <View
        style={[
          styles.leaseIcon,
          {
            backgroundColor:
              lease.source === "static" ? colors.surface : colors.background,
          },
        ]}
      >
        <MaterialIcons
          name={lease.source === "static" ? "push-pin" : "devices"}
          size={19}
          color={lease.source === "static" ? colors.success : colors.primary}
        />
      </View>
      <View style={styles.leaseCopy}>
        <Text
          numberOfLines={1}
          style={[styles.leaseName, { color: colors.foreground }]}
        >
          {leaseLabel(lease)}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.leaseMeta, { color: colors.muted }]}
        >
          {lease.ipv4 ?? "未取得 IPv4"} · {lease.mac}
        </Text>
        {lease.leasetime ? (
          <Text style={[styles.leaseTime, { color: colors.muted }]}>
            租约 {lease.leasetime}
          </Text>
        ) : null}
      </View>
      {showActions ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onEdit}
            style={({ pressed }) => [
              styles.smallButton,
              { borderColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.smallText, { color: colors.foreground }]}>
              编辑
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onDelete}
            style={({ pressed }) => [
              styles.smallButton,
              { borderColor: colors.error },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.smallText, { color: colors.error }]}>
              删除
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={onFix}
          style={({ pressed }) => [
            styles.smallButton,
            { borderColor: colors.primary },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.smallText, { color: colors.primary }]}>
            固定
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pills: { flexDirection: "row", gap: 7, flex: 1, flexWrap: "wrap" },
  refresh: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  refreshText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  errorText: { fontSize: 13, lineHeight: 19 },
  add: {
    minHeight: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  addText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  closeButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: { fontSize: 12, fontWeight: "800" },
  form: { paddingHorizontal: 18, paddingBottom: 30, gap: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: {
    minHeight: 43,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 9,
    marginTop: 2,
  },
  cancel: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 13, fontWeight: "800" },
  save: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  leaseRow: {
    minHeight: 74,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  leaseIcon: {
    width: 37,
    height: 37,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  leaseCopy: { flex: 1, minWidth: 0 },
  leaseName: { fontSize: 14, fontWeight: "800" },
  leaseMeta: { fontSize: 10, marginTop: 4, fontVariant: ["tabular-nums"] },
  leaseTime: { fontSize: 10, marginTop: 2 },
  actions: { alignItems: "flex-end", gap: 5 },
  smallButton: {
    minHeight: 29,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  smallText: { fontSize: 11, fontWeight: "800" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
});
