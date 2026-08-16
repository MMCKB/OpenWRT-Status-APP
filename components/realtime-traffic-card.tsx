import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { appendTrafficRate, calculateTrafficRate, formatTrafficRate, makeTrafficSnapshot, type TrafficRate, type TrafficSnapshot } from "@/lib/traffic-monitor";
import type { InterfaceStatus } from "@/shared/router-types";

function ThroughputSparkline({ history, field, color, emptyColor }: { history: TrafficRate[]; field: "rxBytesPerSecond" | "txBytesPerSecond"; color: string; emptyColor: string }) {
  const values = history.map((item) => item[field]);
  const highest = Math.max(...values, 1);
  const bars = values.slice(-18);
  return (
    <View style={styles.sparkline} accessibilityLabel="最近流量变化">
      {bars.length
        ? bars.map((value, index) => <View key={`${field}-${index}`} style={[styles.bar, { height: Math.max(3, (value / highest) * 28), backgroundColor: color }]} />)
        : <View style={[styles.emptyLine, { backgroundColor: emptyColor }]} />}
    </View>
  );
}

export function RealtimeTrafficCard({ interfaces, fetchedAt, refreshing }: { interfaces: InterfaceStatus[]; fetchedAt?: string; refreshing: boolean }) {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";
  const previous = useRef<TrafficSnapshot | null>(null);
  const [rate, setRate] = useState<TrafficRate | null>(null);
  const [history, setHistory] = useState<TrafficRate[]>([]);
  const snapshot = useMemo(() => makeTrafficSnapshot(interfaces, fetchedAt ? new Date(fetchedAt).getTime() : Date.now()), [fetchedAt, interfaces]);

  useEffect(() => {
    const nextRate = calculateTrafficRate(previous.current, snapshot);
    previous.current = snapshot;
    setRate(nextRate);
    setHistory((current) => appendTrafficRate(current, nextRate));
  }, [snapshot]);

  const sourceLabel = snapshot.source === "wan" ? "WAN 接口" : snapshot.source === "interfaces" ? "在线接口汇总" : "等待接口统计";
  const liveBackground = isDark ? "#21485E" : "#E7F5F3";
  const trackColor = isDark ? "#315B72" : "#D9E6EB";
  const downloadSoft = isDark ? "#153F4D" : "#E4F8FA";
  const uploadSoft = isDark ? "#2B2857" : "#EEECFF";

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>实时流量</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{sourceLabel} · 约每 5 秒采样</Text>
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
          <ThroughputSparkline history={history} field="rxBytesPerSecond" color="#20A6B4" emptyColor={trackColor} />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.metric}>
          <View style={[styles.iconBox, { backgroundColor: uploadSoft }]}><MaterialIcons name="north" size={18} color="#796DE3" /></View>
          <Text style={[styles.metricLabel, { color: colors.muted }]}>上传</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{formatTrafficRate(rate?.txBytesPerSecond ?? null)}</Text>
          <ThroughputSparkline history={history} field="txBytesPerSecond" color="#8A7DF1" emptyColor={trackColor} />
        </View>
      </View>
      <Text style={[styles.footer, { color: colors.muted }]}>{rate ? `本次采样间隔 ${Math.max(1, Math.round(rate.sampleSeconds))} 秒` : snapshot.source === "unreported" ? "路由器未报告接口字节计数" : "收到下一次状态刷新后将显示速率"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 1, padding: 17, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 17 },
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 4 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 11, fontWeight: "700" },
  metricRow: { flexDirection: "row", alignItems: "stretch" },
  metric: { flex: 1, minWidth: 0 },
  divider: { width: 1, marginHorizontal: 13 },
  iconBox: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  metricLabel: { fontSize: 12, fontWeight: "600" },
  metricValue: { fontSize: 19, fontWeight: "800", marginTop: 4, fontVariant: ["tabular-nums"] },
  sparkline: { height: 31, flexDirection: "row", alignItems: "flex-end", gap: 2, marginTop: 11 },
  bar: { width: 4, borderRadius: 3, opacity: 0.95 },
  emptyLine: { height: 2, flex: 1, borderRadius: 2 },
  footer: { fontSize: 11, marginTop: 12 },
});
