import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  appendTrafficRate,
  calculateTrafficRate,
  formatTrafficRate,
  makeTrafficInterfaceSnapshots,
  type TrafficInterfaceSnapshot,
  type TrafficRate,
} from "@/lib/traffic-monitor";
import type { InterfaceStatus } from "@/shared/router-types";

type RateMap = Record<string, TrafficRate | null>;
type HistoryMap = Record<string, TrafficRate[]>;

function ThroughputSparkline({ history, field, color, emptyColor, label }: { history: TrafficRate[]; field: "rxBytesPerSecond" | "txBytesPerSecond"; color: string; emptyColor: string; label: string }) {
  const values = history.map((item) => item[field]);
  const highest = Math.max(...values, 1);
  const bars = values.slice(-18);
  return (
    <View style={styles.sparkline} accessibilityLabel={`${label}最近${field === "rxBytesPerSecond" ? "下载" : "上传"}流量变化`}>
      {bars.length
        ? bars.map((value, index) => <View key={`${label}-${field}-${index}`} style={[styles.bar, { height: Math.max(3, (value / highest) * 28), backgroundColor: color }]} />)
        : <View style={[styles.emptyLine, { backgroundColor: emptyColor }]} />}
    </View>
  );
}

function WanTrafficPanel({ snapshot, rate, history, refreshing }: { snapshot: TrafficInterfaceSnapshot; rate: TrafficRate | null; history: TrafficRate[]; refreshing: boolean }) {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";
  const trackColor = isDark ? "#315B72" : "#D9E6EB";
  const downloadSoft = isDark ? "#153F4D" : "#E4F8FA";
  const uploadSoft = isDark ? "#2B2857" : "#EEECFF";
  const liveBackground = isDark ? "#21485E" : "#E7F5F3";

  return (
    <View style={[styles.interfacePanel, { backgroundColor: isDark ? "#143149" : "#F9FCFC", borderColor: colors.border }]}>
      <View style={styles.interfaceHeader}>
        <View style={styles.interfaceIdentity}>
          <View style={[styles.interfaceIcon, { backgroundColor: liveBackground }]}><MaterialIcons name="router" size={16} color={colors.primary} /></View>
          <View style={styles.interfaceText}>
            <Text style={[styles.interfaceName, { color: colors.foreground }]} numberOfLines={1}>{snapshot.label}</Text>
            <Text style={[styles.interfaceDevice, { color: colors.muted }]} numberOfLines={1}>{snapshot.device || "WAN 接口"}</Text>
          </View>
        </View>
        <View style={[styles.livePill, { backgroundColor: liveBackground }]}>
          <View style={[styles.liveDot, { backgroundColor: refreshing ? colors.warning : colors.success }]} />
          <Text style={[styles.liveText, { color: colors.foreground }]}>{refreshing ? "刷新中" : "实时"}</Text>
        </View>
      </View>
      <View style={styles.metricRow}>
        <View style={styles.metric}>
          <View style={[styles.iconBox, { backgroundColor: downloadSoft }]}><MaterialIcons name="south" size={18} color="#168A98" /></View>
          <Text style={[styles.metricLabel, { color: colors.muted }]}>下载</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{formatTrafficRate(rate?.rxBytesPerSecond ?? null)}</Text>
          <ThroughputSparkline label={snapshot.label} history={history} field="rxBytesPerSecond" color="#20A6B4" emptyColor={trackColor} />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.metric}>
          <View style={[styles.iconBox, { backgroundColor: uploadSoft }]}><MaterialIcons name="north" size={18} color="#796DE3" /></View>
          <Text style={[styles.metricLabel, { color: colors.muted }]}>上传</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{formatTrafficRate(rate?.txBytesPerSecond ?? null)}</Text>
          <ThroughputSparkline label={snapshot.label} history={history} field="txBytesPerSecond" color="#8A7DF1" emptyColor={trackColor} />
        </View>
      </View>
      <Text style={[styles.panelFooter, { color: colors.muted }]}>{rate ? `采样间隔 ${Math.max(1, Math.round(rate.sampleSeconds))} 秒` : "收到下一次状态刷新后将显示速率"}</Text>
    </View>
  );
}

export function RealtimeTrafficCard({ interfaces, fetchedAt, refreshing }: { interfaces: InterfaceStatus[]; fetchedAt?: string; refreshing: boolean }) {
  const colors = useColors();
  const snapshots = useMemo(
    () => makeTrafficInterfaceSnapshots(interfaces, fetchedAt ? new Date(fetchedAt).getTime() : Date.now()),
    [fetchedAt, interfaces],
  );
  const previous = useRef<Record<string, TrafficInterfaceSnapshot>>({});
  const [rates, setRates] = useState<RateMap>({});
  const [histories, setHistories] = useState<HistoryMap>({});

  useEffect(() => {
    const nextPrevious: Record<string, TrafficInterfaceSnapshot> = {};
    const nextRates: RateMap = {};
    snapshots.forEach((snapshot) => {
      nextRates[snapshot.id] = calculateTrafficRate(previous.current[snapshot.id] ?? null, snapshot);
      nextPrevious[snapshot.id] = snapshot;
    });
    previous.current = nextPrevious;
    setRates(nextRates);
    setHistories((current) => {
      const next: HistoryMap = {};
      snapshots.forEach((snapshot) => {
        next[snapshot.id] = appendTrafficRate(current[snapshot.id] ?? [], nextRates[snapshot.id]);
      });
      return next;
    });
  }, [snapshots]);

  const sourceLabel = snapshots.length
    ? snapshots[0].source === "wan"
      ? `${snapshots.length} 个 WAN 接口 · 分别采样`
      : `${snapshots.length} 个在线接口 · 分别采样`
    : "等待接口统计";

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>实时流量</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{sourceLabel} · 约每 5 秒采样</Text>
        </View>
      </View>
      {snapshots.length ? snapshots.map((snapshot) => (
        <WanTrafficPanel key={snapshot.id} snapshot={snapshot} rate={rates[snapshot.id] ?? null} history={histories[snapshot.id] ?? []} refreshing={refreshing} />
      )) : <View style={[styles.emptyState, { backgroundColor: colors.background }]}><MaterialIcons name="data-usage" size={20} color={colors.muted} /><Text style={[styles.emptyText, { color: colors.muted }]}>路由器未报告 WAN 接口字节计数</Text></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 1, padding: 17, gap: 10, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 3 },
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 4 },
  interfacePanel: { borderRadius: 16, borderWidth: 1, padding: 14 },
  interfaceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 },
  interfaceIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  interfaceIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  interfaceText: { flex: 1, minWidth: 0 },
  interfaceName: { fontSize: 15, fontWeight: "800" },
  interfaceDevice: { fontSize: 11, marginTop: 2 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 11, fontWeight: "700" },
  metricRow: { flexDirection: "row", alignItems: "stretch" },
  metric: { flex: 1, minWidth: 0 },
  divider: { width: 1, marginHorizontal: 13 },
  iconBox: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  metricLabel: { fontSize: 12, fontWeight: "600" },
  metricValue: { fontSize: 18, fontWeight: "800", marginTop: 4, fontVariant: ["tabular-nums"] },
  sparkline: { height: 31, flexDirection: "row", alignItems: "flex-end", gap: 2, marginTop: 11 },
  bar: { width: 4, borderRadius: 3, opacity: 0.95 },
  emptyLine: { height: 2, flex: 1, borderRadius: 2 },
  panelFooter: { fontSize: 11, marginTop: 12 },
  emptyState: { minHeight: 64, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14 },
  emptyText: { fontSize: 13, fontWeight: "600" },
});
