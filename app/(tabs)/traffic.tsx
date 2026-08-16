import { useCallback, useEffect, useMemo, useState } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { loadTrafficHistory, summarizeTrafficUsage, type TrafficHistoryPoint } from "@/lib/traffic-history";
import { useRouterStore } from "@/lib/router-provider";
import { selectTrafficInterfaces } from "@/lib/traffic-monitor";

type RangeKey = "day" | "week" | "month";
const ranges: { key: RangeKey; label: string; hours: number }[] = [{ key: "day", label: "今日", hours: 24 }, { key: "week", label: "7 天", hours: 24 * 7 }, { key: "month", label: "30 天", hours: 24 * 30 }];

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

export default function TrafficScreen() {
  const colors = useColors();
  const { selectedProfile, selectedStatus, refreshStatus } = useRouterStore();
  const [range, setRange] = useState<RangeKey>("day");
  const [history, setHistory] = useState<TrafficHistoryPoint[]>([]);

  const reload = useCallback(async () => { if (selectedProfile) setHistory(await loadTrafficHistory(selectedProfile.id)); }, [selectedProfile]);
  useEffect(() => { void reload(); }, [reload]);
  const activeRange = ranges.find((item) => item.key === range)!;
  const from = useMemo(() => new Date(Date.now() - activeRange.hours * 60 * 60 * 1000), [activeRange.hours]);
  const wanInterfaces = selectedStatus ? selectTrafficInterfaces(selectedStatus.interfaces).items : [];

  return <ManagementShell title="流量统计" description="流量从应用打开期间的 WAN 字节计数增量计算。路由器重启或应用未运行的时间段不会被补录。"><View style={styles.segment}>{ranges.map((item) => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: range === item.key }} onPress={() => setRange(item.key)} style={({ pressed }) => [styles.segmentItem, { backgroundColor: range === item.key ? colors.primary : colors.surface, borderColor: range === item.key ? colors.primary : colors.border }, pressed && styles.pressed]}><Text style={[styles.segmentText, { color: range === item.key ? "#FFFFFF" : colors.foreground }]}>{item.label}</Text></Pressable>)}</View><Pressable accessibilityRole="button" onPress={() => void refreshStatus().then(reload)} style={({ pressed }) => [styles.update, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><MaterialIcons name="refresh" size={17} color={colors.primary} /><Text style={[styles.updateText, { color: colors.foreground }]}>立即采样并更新统计</Text></Pressable>{wanInterfaces.length ? <SectionCard title="按 WAN 统计">{wanInterfaces.map((item, index) => { const summary = summarizeTrafficUsage(history, item.name, from, new Date()); return <View key={item.name} style={[styles.wanRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}><View style={styles.wanTop}><View><Text style={[styles.wanName, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.wanDevice, { color: colors.muted }]}>{item.device} · {summary.samples} 个采样点</Text></View><MaterialIcons name="lan" size={21} color={colors.primary} /></View><View style={styles.metrics}><Metric label="下载" value={formatBytes(summary.rxBytes)} color={colors.primary} foreground={colors.foreground} /><Metric label="上传" value={formatBytes(summary.txBytes)} color={colors.success} foreground={colors.foreground} /></View></View>; })}</SectionCard> : <EmptyState icon="query-stats" title="等待 WAN 采样" description="先在状态页刷新一次，应用便会开始保存每条 WAN 的流量统计。" />}<ToolNotice><Text style={[styles.note, { color: colors.muted }]}>本功能不包含后台监测、阈值告警或推送通知。</Text></ToolNotice></ManagementShell>;
}

function Metric({ label, value, color, foreground }: { label: string; value: string; color: string; foreground: string }) { return <View style={[styles.metric, { borderLeftColor: color }]}><Text style={[styles.metricLabel, { color }]}>{label}</Text><Text style={[styles.metricValue, { color: foreground }]}>{value}</Text></View>; }

const styles = StyleSheet.create({
  segment: { flexDirection: "row", gap: 8 }, segmentItem: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" }, segmentText: { fontSize: 13, fontWeight: "800" }, update: { minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, updateText: { fontSize: 13, fontWeight: "800" }, wanRow: { padding: 15, gap: 14 }, wanTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, wanName: { fontSize: 16, fontWeight: "800" }, wanDevice: { fontSize: 12, marginTop: 3 }, metrics: { flexDirection: "row", gap: 10 }, metric: { flex: 1, borderLeftWidth: 3, paddingLeft: 10 }, metricLabel: { fontSize: 12, fontWeight: "800" }, metricValue: { fontSize: 20, fontWeight: "800", marginTop: 3, fontVariant: ["tabular-nums"] }, note: { fontSize: 13, lineHeight: 19 }, pressed: { opacity: 0.72 },
});
