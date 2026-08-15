import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { EmptyState, MetricTile, SectionCard, sharedStyles, StatusPill } from "@/components/status-ui";
import { formatBytes, formatLoad, formatUptime, memoryUsagePercent } from "@/lib/openwrt-client";
import { useRouterStore } from "@/lib/router-provider";

function formatUpdateTime(timestamp?: string) {
  if (!timestamp) return "尚未刷新";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

export default function StatusScreen() {
  const router = useRouter();
  const { selectedProfile, selectedStatus, isReady, isRefreshing, refreshStatus } = useRouterStore();

  useFocusEffect(useCallback(() => {
    if (selectedProfile && !selectedStatus) void refreshStatus();
  }, [refreshStatus, selectedProfile, selectedStatus]));

  if (!isReady) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#007E7A" /><Text style={styles.loadingText}>正在载入本地配置…</Text></View>;
  }

  if (!selectedProfile) {
    return (
      <View style={sharedStyles.screen}>
        <View style={styles.topBar}><Text style={styles.title}>状态</Text></View>
        <EmptyState icon="router" title="添加你的第一台路由器" description="保存 LuCI 地址与账户后，即可在局域网内查看 OpenWrt 的实时运行状态。" />
        <Pressable accessibilityRole="button" accessibilityLabel="添加路由器" onPress={() => router.push("/router-form" as never)} style={({ pressed }) => [sharedStyles.primaryButton, styles.emptyButton, pressed && sharedStyles.primaryButtonPressed]}>
          <Text style={sharedStyles.primaryButtonText}>添加路由器</Text>
        </Pressable>
      </View>
    );
  }

  const system = selectedStatus?.system;
  const memoryPercent = memoryUsagePercent(system ?? null);
  const isOnline = selectedStatus?.online === true;
  return (
    <View style={sharedStyles.screen}>
      <ScrollView
        contentContainerStyle={sharedStyles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refreshStatus()} tintColor="#007E7A" />}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>当前路由器</Text>
            <Text style={styles.title} numberOfLines={1}>{selectedProfile.name}</Text>
            <Text style={styles.endpoint} numberOfLines={1}>{selectedProfile.baseUrl}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="刷新状态" onPress={() => void refreshStatus()} style={({ pressed }) => [styles.refreshButton, pressed && styles.iconPressed]}>
            <MaterialIcons name="refresh" size={22} color="#007E7A" />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}><MaterialIcons name={isOnline ? "router" : "router"} size={28} color={isOnline ? "#1B9A6A" : "#C53B3B"} /></View>
          <View style={styles.heroContent}>
            <StatusPill label={isOnline ? "在线" : "连接失败"} tone={isOnline ? "success" : "danger"} />
            <Text style={styles.hostname}>{system?.hostname ?? "无法读取设备"}</Text>
            <Text style={styles.model}>{system?.model ?? selectedStatus?.error ?? "下拉刷新以重新尝试连接。"}</Text>
          </View>
        </View>

        {selectedStatus?.error ? <View style={styles.errorBox}><MaterialIcons name="info-outline" size={19} color="#A43131" /><Text style={styles.errorText}>{selectedStatus.error}</Text></View> : null}

        <View style={styles.metricRow}>
          <MetricTile icon="timer" label="运行时间" value={formatUptime(system?.uptimeSeconds ?? null)} tone="success" />
          <MetricTile icon="speed" label="系统负载" value={formatLoad(system?.load ?? null)} caption="1 / 5 / 15 分钟" />
        </View>
        <View style={styles.metricRow}>
          <MetricTile icon="memory" label="内存" value={memoryPercent === null ? "未报告" : `${memoryPercent}% 已用`} caption={system ? `${formatBytes(system.memoryAvailable)} 可用` : undefined} tone={memoryPercent !== null && memoryPercent > 85 ? "warning" : "normal"} />
          <MetricTile icon="system-update-alt" label="固件" value={system?.firmware ?? "未报告"} tone="normal" />
        </View>

        <SectionCard title="网络接口" action={<Text style={styles.sectionMeta}>{selectedStatus?.interfaces.length ?? 0} 个</Text>}>
          {selectedStatus?.interfaces.length ? selectedStatus.interfaces.slice(0, 3).map((item, index) => (
            <View key={`${item.name}-${index}`} style={[styles.listRow, index > 0 && styles.rowDivider]}>
              <View style={[styles.rowStatus, { backgroundColor: item.up ? "#1B9A6A" : "#C53B3B" }]} />
              <View style={styles.rowMain}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowSubtitle}>{item.ipv4[0] ?? item.device}</Text></View>
              <Text style={styles.rowSide}>{item.up ? "已连接" : "未连接"}</Text>
            </View>
          )) : <Text style={styles.emptyRow}>路由器未报告网络接口状态。</Text>}
        </SectionCard>

        <SectionCard title="无线网络" action={<Text style={styles.sectionMeta}>{selectedStatus?.wireless.length ?? 0} 个</Text>}>
          {selectedStatus?.wireless.length ? selectedStatus.wireless.slice(0, 3).map((item, index) => (
            <View key={`${item.name}-${index}`} style={[styles.listRow, index > 0 && styles.rowDivider]}>
              <MaterialIcons name="wifi" size={20} color={item.up ? "#007E7A" : "#7A8998"} />
              <View style={styles.rowMain}><Text style={styles.rowTitle}>{item.ssid}</Text><Text style={styles.rowSubtitle}>{item.name} · 信道 {item.channel}</Text></View>
              <Text style={styles.rowSide}>{item.clients === null ? "—" : `${item.clients} 台`}</Text>
            </View>
          )) : <Text style={styles.emptyRow}>路由器未报告无线网络状态。</Text>}
        </SectionCard>

        {selectedStatus?.warnings.length ? <View style={styles.warningBox}><Text style={styles.warningText}>{selectedStatus.warnings.join(" ")}</Text></View> : null}
        <Text style={styles.updatedAt}>更新于 {formatUpdateTime(selectedStatus?.fetchedAt)} · 下拉即可刷新</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F6F8FA", gap: 12 },
  loadingText: { color: "#5B6B7D", fontSize: 14 },
  topBar: { paddingHorizontal: 20, paddingTop: 26 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { color: "#60758B", fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 },
  title: { color: "#102A43", fontSize: 28, lineHeight: 35, fontWeight: "800" },
  endpoint: { color: "#60758B", fontSize: 13, marginTop: 4 },
  refreshButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#E6F5F4", alignItems: "center", justifyContent: "center", marginLeft: 14 },
  iconPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  heroCard: { flexDirection: "row", alignItems: "center", padding: 18, backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#DDE7E9", gap: 14 },
  heroIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: "#EAF5F4", alignItems: "center", justifyContent: "center" },
  heroContent: { flex: 1, minWidth: 0, gap: 6 },
  hostname: { color: "#102A43", fontSize: 18, fontWeight: "800" },
  model: { color: "#5B6B7D", fontSize: 13, lineHeight: 19 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: "#FDEBEC", borderRadius: 14, padding: 13 },
  errorText: { color: "#A43131", flex: 1, fontSize: 13, lineHeight: 19 },
  metricRow: { flexDirection: "row", gap: 10 },
  sectionMeta: { color: "#6B7C93", fontSize: 13, fontWeight: "600" },
  listRow: { minHeight: 63, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 15 },
  rowDivider: { borderTopWidth: 1, borderTopColor: "#EEF2F4" },
  rowStatus: { width: 8, height: 8, borderRadius: 4 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { color: "#203B55", fontSize: 15, fontWeight: "700" },
  rowSubtitle: { color: "#738397", fontSize: 12, marginTop: 3 },
  rowSide: { color: "#60758B", fontSize: 12, fontWeight: "600" },
  emptyRow: { color: "#738397", fontSize: 14, paddingHorizontal: 15, paddingVertical: 19 },
  warningBox: { backgroundColor: "#FFF4DD", borderRadius: 12, padding: 12 },
  warningText: { color: "#8B5A00", fontSize: 13, lineHeight: 19 },
  updatedAt: { color: "#7A8998", textAlign: "center", fontSize: 12, paddingBottom: 8 },
  emptyButton: { marginHorizontal: 20, marginTop: 4 },
});
