import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { appendTrafficRate, calculateTrafficRate, formatTrafficRate, makeTrafficSnapshot, type TrafficRate, type TrafficSnapshot } from "@/lib/traffic-monitor";
import type { InterfaceStatus } from "@/shared/router-types";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";

function ThroughputSparkline({ history, field, color }: { history: TrafficRate[]; field: "rxBytesPerSecond" | "txBytesPerSecond"; color: string }) {
  const values = history.map((item) => item[field]);
  const highest = Math.max(...values, 1);
  const bars = values.slice(-18);
  return (
    <View style={styles.sparkline} accessibilityLabel="最近流量变化">
      {bars.length ? bars.map((value, index) => <View key={`${field}-${index}`} style={[styles.bar, { height: Math.max(3, (value / highest) * 28), backgroundColor: color }]} />) : <View style={styles.emptyLine} />}
    </View>
  );
}

export function RealtimeTrafficCard({ interfaces, fetchedAt, refreshing }: { interfaces: InterfaceStatus[]; fetchedAt?: string; refreshing: boolean }) {
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
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>实时流量</Text>
          <Text style={styles.subtitle}>{sourceLabel} · 约每 5 秒采样</Text>
        </View>
        <View style={styles.livePill}><View style={[styles.liveDot, refreshing && styles.liveDotMuted]} /><Text style={styles.liveText}>{refreshing ? "刷新中" : "实时"}</Text></View>
      </View>
      <View style={styles.metricRow}>
        <View style={styles.metric}>
          <View style={[styles.iconBox, styles.downloadBox]}><MaterialIcons name="south" size={18} color="#087E8B" /></View>
          <Text style={styles.metricLabel}>下载</Text>
          <Text style={styles.metricValue}>{formatTrafficRate(rate?.rxBytesPerSecond ?? null)}</Text>
          <ThroughputSparkline history={history} field="rxBytesPerSecond" color="#20A6B4" />
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <View style={[styles.iconBox, styles.uploadBox]}><MaterialIcons name="north" size={18} color="#6A5AE0" /></View>
          <Text style={styles.metricLabel}>上传</Text>
          <Text style={styles.metricValue}>{formatTrafficRate(rate?.txBytesPerSecond ?? null)}</Text>
          <ThroughputSparkline history={history} field="txBytesPerSecond" color="#8A7DF1" />
        </View>
      </View>
      <Text style={styles.footer}>{rate ? `本次采样间隔 ${Math.max(1, Math.round(rate.sampleSeconds))} 秒` : snapshot.source === "unreported" ? "路由器未报告接口字节计数" : "收到下一次状态刷新后将显示速率"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#102A43", borderRadius: 22, padding: 17, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 17 },
  title: { color: "#F7FBFC", fontSize: 18, fontWeight: "800" },
  subtitle: { color: "#AFC3CD", fontSize: 12, marginTop: 4 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: "#1A4961" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#49D89C" },
  liveDotMuted: { backgroundColor: "#F5C04E" },
  liveText: { color: "#D9EEF2", fontSize: 11, fontWeight: "700" },
  metricRow: { flexDirection: "row", alignItems: "stretch" },
  metric: { flex: 1, minWidth: 0 },
  divider: { width: 1, backgroundColor: "#2D5267", marginHorizontal: 13 },
  iconBox: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  downloadBox: { backgroundColor: "#DDF8FA" },
  uploadBox: { backgroundColor: "#EAE7FF" },
  metricLabel: { color: "#AFC3CD", fontSize: 12, fontWeight: "600" },
  metricValue: { color: "#FFFFFF", fontSize: 19, fontWeight: "800", marginTop: 4, fontVariant: ["tabular-nums"] },
  sparkline: { height: 31, flexDirection: "row", alignItems: "flex-end", gap: 2, marginTop: 11 },
  bar: { width: 4, borderRadius: 3, opacity: 0.95 },
  emptyLine: { height: 2, backgroundColor: "#365D72", flex: 1, borderRadius: 2 },
  footer: { color: "#8FAAB8", fontSize: 11, marginTop: 12 },
});
