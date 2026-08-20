import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SectionCard, sharedStyles } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useR2Migration } from "@/lib/r2-migration";
import { useRouterStore } from "@/lib/router-provider";
import { useThemeContext, type ThemePreference } from "@/lib/theme-provider";
import {
  getDefaultTrafficInterfaceId,
  getTrafficInterfaceCandidates,
  trafficInterfaceId,
} from "@/lib/traffic-monitor";

const intervals = [
  { label: "实时", value: 1 },
  { label: "手动", value: 0 },
  { label: "30 秒", value: 30 },
  { label: "1 分钟", value: 60 },
  { label: "5 分钟", value: 300 },
];

const themeOptions: {
  label: string;
  value: ThemePreference;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
}[] = [
  { label: "跟随系统", value: "system", icon: "brightness-auto" },
  { label: "浅色", value: "light", icon: "light-mode" },
  { label: "深色", value: "dark", icon: "dark-mode" },
];

const diagnosticOutputOptions = [
  { label: "命令输出", value: "page" as const },
  { label: "弹窗", value: "dialog" as const },
  { label: "两者都显示", value: "both" as const },
];

export default function SettingsScreen() {
  const {
    settings,
    updateRefreshInterval,
    updateTrafficInterfaceIds,
    updateStatusTrafficView,
    updateDiagnosticOutputDisplay,
    selectedStatus,
  } = useRouterStore();
  const { colorScheme, themePreference, setThemePreference } =
    useThemeContext();
  const colors = useColors();
  const router = useRouter();
  const migration = useR2Migration();
  const softPrimary = colorScheme === "dark" ? "#1C485C" : "#E6F5F4";
  const noteSurface = colorScheme === "dark" ? "#193A52" : "#EEF3F6";
  const trafficCandidates = getTrafficInterfaceCandidates(
    selectedStatus?.interfaces ?? [],
  );
  const defaultTrafficId = getDefaultTrafficInterfaceId(
    selectedStatus?.interfaces ?? [],
  );

  function toggleTrafficInterface(interfaceId: string) {
    const effectiveSelection = settings.trafficInterfaceIds.length
      ? settings.trafficInterfaceIds
      : defaultTrafficId
        ? [defaultTrafficId]
        : [];
    const next = effectiveSelection.includes(interfaceId)
      ? effectiveSelection.filter((id) => id !== interfaceId)
      : [...effectiveSelection, interfaceId];
    void updateTrafficInterfaceIds(next);
  }

  return (
    <View style={[sharedStyles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={sharedStyles.content}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>设置</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            控制状态读取、界面外观与本地数据
          </Text>
        </View>
        <SectionCard title="外观">
          <Text style={[styles.cardDescription, { color: colors.muted }]}>
            主题仅影响本应用。选择“跟随系统”时，将自动使用设备当前的深浅色外观。
          </Text>
          <View style={styles.themeGrid}>
            {themeOptions.map((option) => {
              const selected = themePreference === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => void setThemePreference(option.value)}
                  style={({ pressed }) => [
                    styles.themeOption,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialIcons
                    name={option.icon}
                    size={19}
                    color={selected ? "#FFFFFF" : colors.primary}
                  />
                  <Text
                    style={[
                      styles.themeLabel,
                      { color: selected ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>
        <SectionCard title="状态刷新">
          <Text style={[styles.cardDescription, { color: colors.muted }]}>
            “实时”每秒读取一次接口计数；其余模式按所选频率更新当前路由器。切换到后台后不会持续请求网络。
          </Text>
          <View style={styles.intervalGrid}>
            {intervals.map((interval) => {
              const selected =
                settings.refreshIntervalSeconds === interval.value;
              return (
                <Pressable
                  key={interval.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => void updateRefreshInterval(interval.value)}
                  style={({ pressed }) => [
                    styles.interval,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.intervalText,
                      { color: selected ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {interval.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>
        <SectionCard title="实时流量网口">
          <Text style={[styles.cardDescription, { color: colors.muted }]}>
            默认仅展示主 WAN。勾选后可同时显示 LAN、备用 WAN
            或其他已报告字节计数的网口。
          </Text>
          {trafficCandidates.length ? (
            <View style={styles.interfaceList}>
              {trafficCandidates.map((item, index) => {
                const id = trafficInterfaceId(item);
                const selected = settings.trafficInterfaceIds.length
                  ? settings.trafficInterfaceIds.includes(id)
                  : id === defaultTrafficId;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggleTrafficInterface(id)}
                    style={({ pressed }) => [
                      styles.interfaceOption,
                      index > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.interfaceCheck,
                        {
                          borderColor: selected
                            ? colors.primary
                            : colors.border,
                          backgroundColor: selected
                            ? colors.primary
                            : colors.background,
                        },
                      ]}
                    >
                      {selected ? (
                        <MaterialIcons name="check" size={15} color="#FFFFFF" />
                      ) : null}
                    </View>
                    <View style={styles.infoText}>
                      <Text
                        style={[styles.infoTitle, { color: colors.foreground }]}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[
                          styles.infoDescription,
                          { color: colors.muted },
                        ]}
                      >
                        {item.device || "未报告设备"} ·{" "}
                        {item.up ? "已连接" : "未连接"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.emptyTrafficText, { color: colors.muted }]}>
              连接路由器并完成一次状态刷新后，可在这里选择流量网口。
            </Text>
          )}
        </SectionCard>
        <SectionCard title="状态页流量展示">
          <Text style={[styles.cardDescription, { color: colors.muted }]}>
            “完整图表”保留上下行趋势；“简约数据”隐藏曲线和大图标，在多网口时占用更少空间。
          </Text>
          <View style={styles.viewModeRow}>
            {(["full", "compact"] as const).map((mode) => {
              const selected = settings.statusTrafficView === mode;
              const label = mode === "full" ? "完整图表" : "简约数据";
              const icon =
                mode === "full" ? "show-chart" : "format-list-bulleted";
              return (
                <Pressable
                  key={mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => void updateStatusTrafficView(mode)}
                  style={({ pressed }) => [
                    styles.viewModeOption,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialIcons
                    name={icon}
                    size={18}
                    color={selected ? "#FFFFFF" : colors.primary}
                  />
                  <Text
                    style={[
                      styles.viewModeText,
                      { color: selected ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>
        <SectionCard title="诊断结果展示">
          <Text style={[styles.cardDescription, { color: colors.muted }]}>
            执行 Ping、DNS、NAT
            和端口等命令后，选择将路由器返回结果显示在页面中、应用内弹窗中，或同时显示。
          </Text>
          <View style={styles.viewModeRow}>
            {diagnosticOutputOptions.map((option) => {
              const selected =
                settings.diagnosticOutputDisplay === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() =>
                    void updateDiagnosticOutputDisplay(option.value)
                  }
                  style={({ pressed }) => [
                    styles.viewModeOption,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.viewModeText,
                      { color: selected ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>
        <SectionCard title="数据与隐私">
          <InfoRow
            icon="vpn-key"
            title="凭证仅存储在本机"
            description="LuCI 密码会保存在设备安全存储中；配置资料保存在本地，不会同步至云端。"
            colors={colors}
            softPrimary={softPrimary}
          />
          <InfoRow
            icon="wifi"
            title="仅访问已保存的路由器"
            description="状态读取通过 OpenWrt 的 LuCI ubus 接口完成。请在可信局域网内使用。"
            colors={colors}
            softPrimary={softPrimary}
            divider
          />
        </SectionCard>
        <SectionCard title="升级迁移">
          <InfoRow
            icon={migration.status === "ready" ? "verified-user" : "security"}
            title={
              migration.status === "ready"
                ? "加密迁移备份已就绪"
                : "覆盖升级前的本地备份"
            }
            description={migration.detail}
            colors={colors}
            softPrimary={softPrimary}
          />
          <Pressable
            accessibilityRole="button"
            disabled={migration.status === "checking"}
            onPress={() => void migration.retry()}
            style={({ pressed }) => [
              sharedStyles.secondaryButton,
              {
                margin: 14,
                opacity: migration.status === "checking" ? 0.6 : 1,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={sharedStyles.secondaryButtonText}>
              重新检查迁移备份
            </Text>
          </Pressable>
        </SectionCard>
        <SectionCard title="关于">
          <MaintenanceRow
            icon="info-outline"
            label="OpenWrt 路由器状态"
            description="查看应用版本与项目仓库。"
            target="/about"
            colors={colors}
            softPrimary={softPrimary}
            router={router}
          />
        </SectionCard>
        <View style={[styles.note, { backgroundColor: noteSurface }]}>
          <MaterialIcons name="info-outline" size={18} color={colors.muted} />
          <Text style={[styles.noteText, { color: colors.muted }]}>
            若使用 HTTP
            管理地址，账户和状态数据在本地网络中并未加密。建议优先使用可信网络与
            HTTPS。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon,
  title,
  description,
  colors,
  softPrimary,
  divider = false,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  title: string;
  description: string;
  colors: ReturnType<typeof useColors>;
  softPrimary: string;
  divider?: boolean;
}) {
  return (
    <View
      style={[
        styles.infoRow,
        divider && { borderTopWidth: 1, borderTopColor: colors.border },
      ]}
    >
      <View style={[styles.infoIcon, { backgroundColor: softPrimary }]}>
        <MaterialIcons name={icon} size={19} color={colors.primary} />
      </View>
      <View style={styles.infoText}>
        <Text style={[styles.infoTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        <Text style={[styles.infoDescription, { color: colors.muted }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

function MaintenanceRow({
  icon,
  label,
  description,
  target,
  colors,
  softPrimary,
  router,
  warning = false,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  description: string;
  target: string;
  colors: ReturnType<typeof useColors>;
  softPrimary: string;
  router: ReturnType<typeof useRouter>;
  warning?: boolean;
}) {
  const accent = warning ? colors.warning : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开${label}`}
      onPress={() => router.push(target as never)}
      style={({ pressed }) => [
        styles.maintenanceRow,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.infoIcon,
          {
            backgroundColor: warning
              ? colors.background === "#102A43"
                ? "#553F1E"
                : "#FFF4DD"
              : softPrimary,
          },
        ]}
      >
        <MaterialIcons name={icon} size={19} color={accent} />
      </View>
      <View style={styles.infoText}>
        <Text style={[styles.infoTitle, { color: colors.foreground }]}>
          {label}
        </Text>
        <Text style={[styles.infoDescription, { color: colors.muted }]}>
          {description}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "800" },
  subtitle: { fontSize: 14, marginTop: 5 },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 15,
    paddingTop: 15,
  },
  themeGrid: { flexDirection: "row", gap: 8, padding: 15 },
  themeOption: {
    flex: 1,
    minWidth: 0,
    minHeight: 76,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 4,
  },
  themeLabel: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  intervalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    padding: 15,
  },
  interval: {
    width: "48.5%",
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: 11,
  },
  intervalText: { fontSize: 13, fontWeight: "700" },
  pressed: { opacity: 0.72 },
  viewModeRow: { flexDirection: "row", gap: 8, padding: 15 },
  viewModeOption: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  viewModeText: { fontSize: 13, fontWeight: "800" },
  interfaceList: { paddingHorizontal: 15, paddingBottom: 4 },
  interfaceOption: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  interfaceCheck: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTrafficText: {
    paddingHorizontal: 15,
    paddingVertical: 18,
    fontSize: 13,
    lineHeight: 19,
  },
  navigationRow: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 15,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 15,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoText: { flex: 1 },
  infoTitle: { fontSize: 14, fontWeight: "800" },
  infoDescription: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  maintenanceRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 15,
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 14,
    borderRadius: 14,
  },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
