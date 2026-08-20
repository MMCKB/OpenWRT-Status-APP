import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { ReadyFadeInView, RefreshStatusLabel, RotatingRefreshIcon } from "@/components/animated-view";
import { RealtimeTrafficCard } from "@/components/realtime-traffic-card";
import { AnimatedStatusIcon, EmptyState, MetricTile, SectionCard, sharedStyles, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { formatBytes, formatLoad, formatUptime, memoryUsagePercent } from "@/lib/openwrt-client";
import { useRouterStore } from "@/lib/router-provider";

function formatUpdateTime(timestamp?: string) {
  if (!timestamp) return "尚未刷新";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

export default function StatusScreen() {
  const router = useRouter();
  const colors = useColors();
  const isDark = useColorScheme() === "dark";
  const { selectedProfile, selectedStatus, isReady, isRefreshing, isTrafficRefreshing, refreshStatus, settings } = useRouterStore();
  const softPrimary = isDark ? "#1C485C" : "#E6F5F4";
  const heroSurface = isDark ? "#183B54" : "#FFFFFF";
  const errorSurface = isDark ? "#512E36" : "#FDEBEC";
  const warningSurface = isDark ? "#59451F" : "#FFF4DD";
  const [refreshFeedback, setRefreshFeedback] = useState<"refreshing" | "success" | "error" | null>(null);
  const manualRefreshRequested = useRef(false);
  const wasRefreshing = useRef(isRefreshing);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    if (selectedProfile && !selectedStatus) void refreshStatus();
  }, [refreshStatus, selectedProfile, selectedStatus]));

  useEffect(() => {
    const didCompleteManualRefresh = manualRefreshRequested.current && wasRefreshing.current && !isRefreshing;
    wasRefreshing.current = isRefreshing;
    if (!didCompleteManualRefresh) return;

    manualRefreshRequested.current = false;
    setRefreshFeedback(selectedStatus?.error ? "error" : "success");
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setRefreshFeedback(null), 1_450);
  }, [isRefreshing, selectedStatus?.error]);

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  const handleManualRefresh = useCallback(() => {
    if (isRefreshing) return;
    manualRefreshRequested.current = true;
    setRefreshFeedback("refreshing");
    void refreshStatus();
  }, [isRefreshing, refreshStatus]);

  if (!isReady) {
    return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /><Text style={[styles.loadingText, { color: colors.muted }]}>正在载入本地配置…</Text></View>;
  }

  if (!selectedProfile) {
    return <View style={[sharedStyles.screen, { backgroundColor: colors.background }]}><View style={styles.topBar}><Text style={[styles.title, { color: colors.foreground }]}>状态</Text></View><EmptyState icon="router" title="添加你的第一台路由器" description="保存 LuCI 地址与账户后，即可在局域网内查看 OpenWrt 的实时运行状态。" /><Pressable accessibilityRole="button" accessibilityLabel="添加路由器" onPress={() => router.push("/router-form" as never)} style={({ pressed }) => [sharedStyles.primaryButton, styles.emptyButton, pressed && sharedStyles.primaryButtonPressed]}><Text style={sharedStyles.primaryButtonText}>添加路由器</Text></Pressable></View>;
  }

  const system = selectedStatus?.system;
  const memoryPercent = memoryUsagePercent(system ?? null);
  const isOnline = selectedStatus?.online === true;
  const hasFirstStatusData = Boolean(selectedStatus?.fetchedAt);
  const refreshLabel = refreshFeedback === "refreshing" ? "刷新中" : refreshFeedback === "success" ? "刷新完成" : refreshFeedback === "error" ? "刷新失败" : null;
  return (
    <View style={[sharedStyles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={sharedStyles.content} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleManualRefresh} tintColor={colors.primary} />}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}><Text style={[styles.eyebrow, { color: colors.muted }]}>当前路由器</Text><Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{selectedProfile.name}</Text><Text style={[styles.endpoint, { color: colors.muted }]} numberOfLines={1}>{selectedProfile.baseUrl}</Text></View>
          <View style={styles.refreshCluster}>
            <Pressable accessibilityRole="button" accessibilityLabel={refreshLabel ?? "刷新状态"} accessibilityHint={refreshLabel ?? "手动刷新路由器状态"} onPress={handleManualRefresh} style={({ pressed }) => [styles.refreshButton, { backgroundColor: softPrimary }, pressed && styles.iconPressed]}><RotatingRefreshIcon spinning={refreshFeedback === "refreshing"} size={22} color={colors.primary} /></Pressable>
            <RefreshStatusLabel label={refreshLabel} style={[styles.refreshStatus, { color: refreshFeedback === "error" ? colors.error : colors.muted }]} />
          </View>
        </View>

        <ReadyFadeInView ready={hasFirstStatusData} delay={20}><View style={[styles.heroCard, { backgroundColor: heroSurface, borderColor: colors.border }]}><View style={[styles.heroIcon, { backgroundColor: softPrimary }]}><AnimatedStatusIcon name="router" size={28} color={isOnline ? colors.success : colors.error} /></View><View style={styles.heroContent}><StatusPill label={isOnline ? "在线" : "连接失败"} tone={isOnline ? "success" : "danger"} /><Text style={[styles.hostname, { color: colors.foreground }]}>{system?.hostname ?? "无法读取设备"}</Text><Text style={[styles.model, { color: colors.muted }]}>{system?.model ?? selectedStatus?.error ?? "下拉刷新以重新尝试连接。"}</Text></View></View></ReadyFadeInView>

        <ReadyFadeInView ready={hasFirstStatusData} delay={55}><RealtimeTrafficCard interfaces={selectedStatus?.interfaces ?? []} fetchedAt={selectedStatus?.fetchedAt} refreshing={settings.refreshIntervalSeconds === 1 ? isTrafficRefreshing : isRefreshing} refreshIntervalSeconds={settings.refreshIntervalSeconds} selectedInterfaceIds={settings.trafficInterfaceIds} viewMode={settings.statusTrafficView} /></ReadyFadeInView>
        {selectedStatus?.error ? <View style={[styles.errorBox, { backgroundColor: errorSurface }]}><MaterialIcons name="info-outline" size={19} color={colors.error} /><Text style={[styles.errorText, { color: colors.error }]}>{selectedStatus.error}</Text></View> : null}

        <ReadyFadeInView ready={hasFirstStatusData} delay={90}><View style={styles.metricRow}><MetricTile icon="timer" label="运行时间" value={formatUptime(system?.uptimeSeconds ?? null)} tone="success" /><MetricTile icon="speed" label="系统负载" value={formatLoad(system?.load ?? null)} caption="1 / 5 / 15 分钟" /></View></ReadyFadeInView>
        <ReadyFadeInView ready={hasFirstStatusData} delay={120}><View style={styles.metricRow}><MetricTile icon="memory" label="内存" value={memoryPercent === null ? "未报告" : `${memoryPercent}% 已用`} caption={system ? `${formatBytes(system.memoryAvailable)} 可用` : undefined} tone={memoryPercent !== null && memoryPercent > 85 ? "warning" : "normal"} /><MetricTile icon="system-update-alt" label="固件" value={system?.firmware ?? "未报告"} tone="normal" /></View></ReadyFadeInView>

        <ReadyFadeInView ready={hasFirstStatusData} delay={150}><SectionCard title="网络接口" action={<Text style={[styles.sectionMeta, { color: colors.muted }]}>{selectedStatus?.interfaces.length ?? 0} 个</Text>}>
          {selectedStatus?.interfaces.length ? selectedStatus.interfaces.map((item, index) => <View key={`${item.name}-${index}`} style={[styles.listRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}><View style={[styles.rowStatus, { backgroundColor: item.up ? colors.success : colors.error }]} /><View style={styles.rowMain}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.rowSubtitle, { color: colors.muted }]}>IPv4 {item.ipv4[0] ?? "未分配"} · IPv6 {item.ipv6[0] ?? "未分配"}</Text></View><Text style={[styles.rowSide, { color: colors.muted }]}>{item.up ? "已连接" : "未连接"}</Text></View>) : <Text style={[styles.emptyRow, { color: colors.muted }]}>路由器未报告网络接口状态。</Text>}
        </SectionCard></ReadyFadeInView>
        <ReadyFadeInView ready={hasFirstStatusData} delay={180}><SectionCard title="无线网络" action={<Text style={[styles.sectionMeta, { color: colors.muted }]}>{selectedStatus?.wireless.length ?? 0} 个</Text>}>
          {selectedStatus?.wireless.length ? selectedStatus.wireless.map((item, index) => <View key={`${item.name}-${index}`} style={[styles.listRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}><MaterialIcons name="wifi" size={20} color={item.up ? colors.primary : colors.muted} /><View style={styles.rowMain}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.ssid}</Text><Text style={[styles.rowSubtitle, { color: colors.muted }]}>{item.name} · 信道 {item.channel}</Text></View><Text style={[styles.rowSide, { color: colors.muted }]}>{item.clients === null ? "—" : `${item.clients} 台`}</Text></View>) : <Text style={[styles.emptyRow, { color: colors.muted }]}>路由器未报告无线网络状态。</Text>}
        </SectionCard></ReadyFadeInView>
        {selectedStatus?.warnings.length ? <View style={[styles.warningBox, { backgroundColor: warningSurface }]}><Text style={[styles.warningText, { color: colors.warning }]}>{selectedStatus.warnings.join(" ")}</Text></View> : null}
        <Text style={[styles.updatedAt, { color: colors.muted }]}>更新于 {formatUpdateTime(selectedStatus?.fetchedAt)} · {settings.refreshIntervalSeconds === 1 ? "实时模式（每秒更新）" : settings.refreshIntervalSeconds > 0 ? `每 ${settings.refreshIntervalSeconds} 秒自动更新` : "手动刷新"}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, loadingText: { fontSize: 14 }, topBar: { paddingHorizontal: 20, paddingTop: 26 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerText: { flex: 1, minWidth: 0 }, eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }, title: { fontSize: 28, lineHeight: 35, fontWeight: "800" }, endpoint: { fontSize: 13, marginTop: 4 }, refreshCluster: { width: 46, height: 46, marginLeft: 14, position: "relative" }, refreshButton: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" }, refreshStatus: { position: "absolute", top: 49, right: -4, width: 66, textAlign: "right", fontSize: 11, fontWeight: "700" }, iconPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  heroCard: { flexDirection: "row", alignItems: "center", padding: 18, borderRadius: 20, borderWidth: 1, gap: 14 }, heroIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" }, heroContent: { flex: 1, minWidth: 0, gap: 6 }, hostname: { fontSize: 18, fontWeight: "800" }, model: { fontSize: 13, lineHeight: 19 }, errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: 14, padding: 13 }, errorText: { flex: 1, fontSize: 13, lineHeight: 19 },
  metricRow: { flexDirection: "row", gap: 10 }, sectionMeta: { fontSize: 13, fontWeight: "600" }, listRow: { minHeight: 63, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 15 }, rowStatus: { width: 8, height: 8, borderRadius: 4 }, rowMain: { flex: 1, minWidth: 0 }, rowTitle: { fontSize: 15, fontWeight: "700" }, rowSubtitle: { fontSize: 12, marginTop: 3 }, rowSide: { fontSize: 12, fontWeight: "600" }, emptyRow: { fontSize: 14, paddingHorizontal: 15, paddingVertical: 19 }, warningBox: { borderRadius: 12, padding: 12 }, warningText: { fontSize: 13, lineHeight: 19 }, updatedAt: { textAlign: "center", fontSize: 12, paddingBottom: 8 }, emptyButton: { marginHorizontal: 20, marginTop: 4 },
});
