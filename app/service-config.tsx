import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
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
  buildPluginConfigApplyCommand,
  buildPluginConfigSnapshotCommand,
  getProxyServiceDefinition,
  parsePluginConfigSnapshot,
  type ProxyServiceId,
} from "@/lib/openwrt-advanced-admin";

const SERVICE_IDS: ProxyServiceId[] = [
  "openclash",
  "adguardhome",
  "passwall",
  "passwall2",
  "ddns",
];

function isServiceId(value: string | undefined): value is ProxyServiceId {
  return Boolean(value && SERVICE_IDS.includes(value as ProxyServiceId));
}

export default function ServiceConfigScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const serviceId = isServiceId(rawId) ? rawId : undefined;
  const service = useMemo(
    () => (serviceId ? getProxyServiceDefinition(serviceId) : null),
    [serviceId],
  );
  const { execute, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [content, setContent] = useState("");
  const [exists, setExists] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!serviceId || !hasRouter || !isSupported) return;
    setIsLoading(true);
    setNotice(null);
    try {
      const output = await execute(buildPluginConfigSnapshotCommand(serviceId));
      const snapshot = parsePluginConfigSnapshot(serviceId, output);
      setContent(snapshot.content);
      setExists(snapshot.exists);
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "无法读取服务配置。",
      );
    } finally {
      setIsLoading(false);
    }
  }, [execute, hasRouter, isSupported, serviceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const disabled =
    !serviceId ||
    !hasRouter ||
    !isSupported ||
    isRunning ||
    isLoading ||
    isSaving;

  function confirmSave() {
    if (!serviceId || !service) return;
    Alert.alert(
      `保存 ${service.label} 配置`,
      `将先备份为 ${service.configPath}.openwrt-status.bak，再覆盖原配置并重启 ${service.label}。配置错误可能导致该服务无法启动。是否继续？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "保存并重启",
          onPress: () =>
            void (async () => {
              setIsSaving(true);
              setNotice(null);
              try {
                const output = await execute(
                  buildPluginConfigApplyCommand(serviceId, content),
                );
                setNotice(
                  output.trim() || `${service.label} 配置已保存并已重启。`,
                );
                await refresh();
              } catch (reason) {
                setNotice(
                  reason instanceof Error
                    ? reason.message
                    : "保存服务配置失败。",
                );
              } finally {
                setIsSaving(false);
              }
            })(),
        },
      ],
    );
  }

  if (!serviceId || !service) {
    return (
      <ManagementShell title="服务配置">
        <EmptyState
          icon="error-outline"
          title="不支持的服务"
          description="请从“服务”标签页选择 OpenClash、PassWall、PassWall2、AdGuard Home 或 DDNS。"
        />
      </ManagementShell>
    );
  }

  return (
    <ManagementShell
      title={`${service.label} 配置`}
      description="在应用内读取和编辑 OpenWrt UCI 配置；保存后只重启当前服务，不会跳转到 LuCI 网页。"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回服务页"
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.back,
          { borderColor: colors.border, backgroundColor: colors.surface },
          pressed && styles.pressed,
        ]}
      >
        <MaterialIcons name="arrow-back" size={20} color={colors.foreground} />
        <Text style={[styles.backText, { color: colors.foreground }]}>
          返回服务
        </Text>
      </Pressable>
      <ToolNotice>
        <View style={styles.noticeRow}>
          <MaterialIcons name="security" size={19} color={colors.primary} />
          <View style={styles.noticeCopy}>
            <Text style={[styles.noticeTitle, { color: colors.foreground }]}>
              受控配置文件
            </Text>
            <Text style={[styles.noticeText, { color: colors.muted }]}>
              {service.configPath}。仅允许编辑此服务的固定 OpenWrt 配置文件。
            </Text>
          </View>
        </View>
      </ToolNotice>
      <SectionCard
        title="配置内容"
        action={
          <Pressable
            disabled={disabled}
            onPress={() => void refresh()}
            style={({ pressed }) => [
              styles.action,
              { borderColor: colors.border },
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <Text style={[styles.actionText, { color: colors.primary }]}>
              {isLoading ? "读取中" : "重新读取"}
            </Text>
          </Pressable>
        }
      >
        {exists === false ? (
          <View style={[styles.missing, { backgroundColor: colors.surface }]}>
            <StatusPill label="未找到配置文件" tone="warning" />
            <Text style={[styles.missingText, { color: colors.muted }]}>
              请先在路由器安装并初始化 {service.label}，应用不会自动创建空配置。
            </Text>
          </View>
        ) : null}
        <TextInput
          value={content}
          onChangeText={setContent}
          editable={!disabled && exists === true}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textAlignVertical="top"
          placeholder={isLoading ? "正在读取配置…" : "路由器尚未返回可编辑配置"}
          placeholderTextColor={colors.muted}
          selectionColor={colors.primary}
          style={[
            styles.editor,
            {
              color: colors.foreground,
              borderColor: colors.border,
              backgroundColor: colors.background,
            },
            (disabled || exists !== true) && styles.editorDisabled,
          ]}
        />
      </SectionCard>
      {notice ? (
        <ToolNotice>
          <Text style={[styles.noticeText, { color: colors.foreground }]}>
            {notice}
          </Text>
        </ToolNotice>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="保存并重启服务"
        disabled={disabled || exists !== true || !content.trim()}
        onPress={confirmSave}
        style={({ pressed }) => [
          styles.save,
          { backgroundColor: colors.primary },
          pressed && styles.pressed,
          (disabled || exists !== true || !content.trim()) && styles.disabled,
        ]}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveText}>保存并重启服务</Text>
        )}
      </Pressable>
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  back: {
    minHeight: 42,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  backText: { fontSize: 14, fontWeight: "800" },
  noticeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  noticeCopy: { flex: 1, gap: 3 },
  noticeTitle: { fontSize: 14, fontWeight: "800" },
  noticeText: { fontSize: 13, lineHeight: 19 },
  action: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { fontSize: 12, fontWeight: "800" },
  missing: { borderRadius: 12, padding: 12, gap: 7, marginBottom: 12 },
  missingText: { fontSize: 12, lineHeight: 18 },
  editor: {
    minHeight: 340,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "monospace",
  },
  editorDisabled: { opacity: 0.58 },
  save: {
    minHeight: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.5 },
});
