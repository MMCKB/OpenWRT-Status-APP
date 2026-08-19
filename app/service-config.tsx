import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
  buildPluginSettingsApplyCommand,
  buildPluginSettingsSnapshotCommand,
  getPluginSettingDefinitions,
  getProxyServiceDefinition,
  parsePluginSettingsSnapshot,
  type PluginSettingsSection,
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

function isEnabled(value: string | undefined) {
  return ["1", "true", "on", "yes", "enabled"].includes(
    value?.trim().toLowerCase() ?? "",
  );
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
  const fields = useMemo(
    () => (serviceId ? getPluginSettingDefinitions(serviceId) : []),
    [serviceId],
  );
  const { execute, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [sections, setSections] = useState<PluginSettingsSection[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [exists, setExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!serviceId || !hasRouter || !isSupported) return;
    setLoading(true);
    setNotice(null);
    try {
      const output = await execute(
        buildPluginSettingsSnapshotCommand(serviceId),
      );
      const snapshot = parsePluginSettingsSnapshot(serviceId, output);
      setExists(snapshot.exists);
      setSections(snapshot.sections);
      setDrafts(
        Object.fromEntries(
          snapshot.sections.map((section) => [
            section.section,
            Object.fromEntries(
              fields.map((field) => [
                field.key,
                section.values[field.key] ?? "",
              ]),
            ),
          ]),
        ),
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "无法读取服务设置。",
      );
    } finally {
      setLoading(false);
    }
  }, [execute, fields, hasRouter, isSupported, serviceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const disabled =
    !serviceId || !hasRouter || !isSupported || isRunning || loading;
  const setValue = (section: string, key: string, value: string) =>
    setDrafts((current) => ({
      ...current,
      [section]: { ...(current[section] ?? {}), [key]: value },
    }));

  function save(section: PluginSettingsSection) {
    if (!serviceId || !service) return;
    Alert.alert(
      `保存 ${service.label} 设置`,
      `应用会仅更新本页显示的常用 UCI 选项，先备份 ${service.configPath}，再提交并重启服务。其他高级配置不会被覆盖。是否继续？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "保存并重启",
          onPress: () =>
            void (async () => {
              setSaving(section.section);
              setNotice(null);
              try {
                const output = await execute(
                  buildPluginSettingsApplyCommand(
                    serviceId,
                    section.section,
                    drafts[section.section] ?? {},
                  ),
                );
                setNotice(
                  output.trim() || `${service.label} 设置已保存并已重启。`,
                );
                await refresh();
              } catch (reason) {
                setNotice(
                  reason instanceof Error
                    ? reason.message
                    : "保存服务设置失败。",
                );
              } finally {
                setSaving(null);
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
      title={`${service.label} 设置`}
      description="在应用内以图形化表单修改常用 LuCI/UCI 选项；不再编辑原始配置文件。"
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
          <MaterialIcons name="tune" size={19} color={colors.primary} />
          <View style={styles.noticeCopy}>
            <Text style={[styles.noticeTitle, { color: colors.foreground }]}>
              应用内受控设置
            </Text>
            <Text style={[styles.noticeText, { color: colors.muted }]}>
              仅展示可安全通用的常用选项。保存前自动备份，未展示的高级 LuCI
              设置不会被删除。
            </Text>
          </View>
        </View>
      </ToolNotice>
      <SectionCard
        title="服务设置"
        action={
          <Pressable
            disabled={disabled || saving !== null}
            onPress={() => void refresh()}
            style={({ pressed }) => [
              styles.action,
              { borderColor: colors.border },
              pressed && styles.pressed,
              (disabled || saving !== null) && styles.disabled,
            ]}
          >
            <Text style={[styles.actionText, { color: colors.primary }]}>
              {loading ? "读取中" : "重新读取"}
            </Text>
          </Pressable>
        }
      >
        {exists === false ? (
          <View style={[styles.missing, { backgroundColor: colors.surface }]}>
            <StatusPill label="未找到服务设置" tone="warning" />
            <Text style={[styles.missingText, { color: colors.muted }]}>
              请先在路由器安装并初始化 {service.label}。
            </Text>
          </View>
        ) : null}
        {exists === true && sections.length === 0 ? (
          <EmptyState
            icon="tune"
            title="没有可编辑的设置段"
            description="服务尚未完成初始化，或当前固件的配置结构暂不兼容。"
          />
        ) : null}
        {sections.map((section, index) => {
          const sectionSaving = saving === section.section;
          return (
            <View
              key={section.section}
              style={[
                styles.section,
                index > 0 && {
                  borderTopColor: colors.border,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {serviceId === "ddns"
                  ? `DDNS 服务：${section.section}`
                  : `设置段：${section.section}`}
              </Text>
              {fields.map((field) => {
                const value = drafts[section.section]?.[field.key] ?? "";
                if (field.kind === "switch")
                  return (
                    <View key={field.key} style={styles.switchRow}>
                      <Text
                        style={[
                          styles.fieldLabel,
                          { color: colors.foreground, flex: 1 },
                        ]}
                      >
                        {field.label}
                      </Text>
                      <Switch
                        value={isEnabled(value)}
                        disabled={disabled || sectionSaving}
                        onValueChange={(next) =>
                          setValue(section.section, field.key, next ? "1" : "0")
                        }
                        trackColor={{
                          false: colors.border,
                          true: colors.primary,
                        }}
                      />
                    </View>
                  );
                return (
                  <View key={field.key} style={styles.field}>
                    <Text
                      style={[styles.fieldLabel, { color: colors.foreground }]}
                    >
                      {field.label}
                    </Text>
                    <TextInput
                      value={value}
                      onChangeText={(next) =>
                        setValue(section.section, field.key, next)
                      }
                      editable={!disabled && !sectionSaving}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={field.kind === "password"}
                      keyboardType={
                        field.kind === "number" ? "number-pad" : "default"
                      }
                      placeholder={field.placeholder}
                      placeholderTextColor={colors.muted}
                      selectionColor={colors.primary}
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
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`保存 ${section.section} 设置`}
                disabled={disabled || sectionSaving}
                onPress={() => save(section)}
                style={({ pressed }) => [
                  styles.save,
                  { backgroundColor: colors.primary },
                  pressed && styles.pressed,
                  (disabled || sectionSaving) && styles.disabled,
                ]}
              >
                {sectionSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveText}>保存并重启服务</Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </SectionCard>
      {notice ? (
        <ToolNotice>
          <Text style={[styles.noticeText, { color: colors.foreground }]}>
            {notice}
          </Text>
        </ToolNotice>
      ) : null}
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
  section: { paddingTop: 14, gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "800" },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "700" },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  switchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  save: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 3,
  },
  saveText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.5 },
});
