import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { buildWeakSignalSnapshotCommand, parseWeakSignalClients, type WeakSignalClient } from "@/lib/openwrt-admin";
import { useManagedSsh } from "@/hooks/use-managed-ssh";

function qualityTone(client: WeakSignalClient) {
  if (client.quality === "weak") return "danger" as const;
  if (client.quality === "fair" || client.quality === "unknown") return "warning" as const;
  return "success" as const;
}

function signalWidth(signalDbm: number | null) {
  if (signalDbm === null) return "18%";
  return `${Math.max(8, Math.min(100, ((signalDbm + 90) / 40) * 100))}%` as const;
}

export default function WeakSignalScreen() {
  const colors = useColors();
  const router = useRouter();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [clients, setClients] = useState<WeakSignalClient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    setIsLoading(true);
    setNotice(null);
    try {
      const output = await execute(buildWeakSignalSnapshotCommand());
      const next = parseWeakSignalClients(output);
      setClients(next);
      if (!next.length) setNotice("未读取到无线客户端。设备仅通过网线接入、驱动未提供 station dump 或无线未启用时，列表会为空。");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "无法读取无线客户端信号。");
    } finally {
      setIsLoading(false);
    }
  }, [execute, hasRouter, isSupported]);

  useEffect(() => { void refresh(); }, [refresh]);

  const summary = useMemo(() => ({
    weak: clients.filter((item) => item.quality === "weak").length,
    fair: clients.filter((item) => item.quality === "fair").length,
    good: clients.filter((item) => item.quality === "good").length,
  }), [clients]);
  const disabled = isRunning || isLoading || !hasRouter || !isSupported;

  return <ManagementShell title="弱信号设备" description="读取已关联 Wi‑Fi 客户端的 RSSI，并按弱信号优先排序；仅在手动刷新时通过应用内 SSH 采样。">
    <SectionCard title="信号概况" action={<Pressable disabled={disabled} onPress={() => void refresh()} style={({ pressed }) => [styles.refresh, { borderColor: colors.border }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.refreshText, { color: colors.primary }]}>{isLoading ? "采样中" : "刷新"}</Text></Pressable>}>
      <View style={styles.summary}>
        <View style={[styles.summaryTile, { backgroundColor: colors.background }]}><Text style={[styles.summaryNumber, { color: summary.weak ? colors.error : colors.foreground }]}>{summary.weak}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>弱信号</Text></View>
        <View style={[styles.summaryTile, { backgroundColor: colors.background }]}><Text style={[styles.summaryNumber, { color: summary.fair ? colors.warning : colors.foreground }]}>{summary.fair}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>需关注</Text></View>
        <View style={[styles.summaryTile, { backgroundColor: colors.background }]}><Text style={[styles.summaryNumber, { color: colors.success }]}>{summary.good}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>良好</Text></View>
      </View>
      <Text style={[styles.caption, { color: colors.muted }]}>阈值：≤ −75 dBm 为弱信号；−74 至 −67 dBm 需要关注。信号受距离、遮挡、终端天线和信道干扰共同影响。</Text>
    </SectionCard>

    <SectionCard title="无线客户端" action={<Pressable onPress={() => router.push("/wireless-optimizer")} style={({ pressed }) => [styles.link, pressed && styles.pressed]}><Text style={[styles.linkText, { color: colors.primary }]}>优化信道</Text></Pressable>}>
      {clients.length ? clients.map((client, index) => <View key={`${client.mac}-${client.interfaceName ?? "unknown"}`} style={[styles.clientRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
        <View style={[styles.clientIcon, { backgroundColor: client.quality === "weak" ? `${colors.error}18` : client.quality === "fair" ? `${colors.warning}18` : `${colors.success}18` }]}><MaterialIcons name="wifi" size={21} color={client.quality === "weak" ? colors.error : client.quality === "fair" ? colors.warning : colors.success} /></View>
        <View style={styles.clientCopy}><View style={styles.clientHeader}><Text numberOfLines={1} style={[styles.clientName, { color: colors.foreground }]}>{client.hostname ?? client.mac}</Text><StatusPill label={client.qualityLabel} tone={qualityTone(client)} /></View><Text style={[styles.clientDetail, { color: colors.muted }]}>{client.ipv4 ?? "未取得 IPv4"} · {client.interfaceName ?? "未报告接口"} · {client.mac}</Text><View style={[styles.meterTrack, { backgroundColor: colors.border }]}><View style={[styles.meterValue, { width: signalWidth(client.signalDbm), backgroundColor: client.quality === "weak" ? colors.error : client.quality === "fair" ? colors.warning : colors.success }]} /></View></View>
        <Text style={[styles.signal, { color: client.signalDbm === null ? colors.muted : client.quality === "weak" ? colors.error : client.quality === "fair" ? colors.warning : colors.success }]}>{client.signalDbm === null ? "—" : `${client.signalDbm} dBm`}</Text>
      </View>) : <EmptyState icon="wifi" title="尚未取得无线客户端" description="连接应用内 SSH 后刷新；有线设备不会出现在此列表。" />}
    </SectionCard>
    {isRunning ? <ToolNotice><View style={styles.running}><ActivityIndicator color={colors.primary} /><Text style={[styles.caption, { color: colors.muted }]}>正在采样无线客户端信号…</Text></View></ToolNotice> : null}
    {error || notice ? <ToolNotice><Text selectable style={[styles.notice, { color: error ? colors.error : colors.foreground }]}>{error ?? notice}</Text></ToolNotice> : null}
    {!isSupported ? <ToolNotice><Text style={[styles.notice, { color: colors.warning }]}>此功能需要安装包含应用内 SSH 的 Android APK；网页预览仅可查看页面布局。</Text></ToolNotice> : null}
  </ManagementShell>;
}

const styles = StyleSheet.create({
  refresh: { minHeight: 32, borderWidth: 1, borderRadius: 10, justifyContent: "center", paddingHorizontal: 11 }, refreshText: { fontSize: 12, fontWeight: "800" }, summary: { flexDirection: "row", gap: 9, padding: 14, paddingBottom: 10 }, summaryTile: { flex: 1, minHeight: 74, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 3 }, summaryNumber: { fontSize: 24, fontWeight: "900" }, summaryLabel: { fontSize: 12, fontWeight: "700" }, caption: { fontSize: 12, lineHeight: 18, paddingHorizontal: 14, paddingBottom: 14 }, link: { minHeight: 32, justifyContent: "center", paddingHorizontal: 2 }, linkText: { fontSize: 12, fontWeight: "800" }, clientRow: { flexDirection: "row", gap: 10, alignItems: "center", padding: 14 }, clientIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, clientCopy: { flex: 1, minWidth: 0, gap: 5 }, clientHeader: { flexDirection: "row", alignItems: "center", gap: 7 }, clientName: { flex: 1, fontSize: 15, fontWeight: "800" }, clientDetail: { fontSize: 11, lineHeight: 16 }, meterTrack: { height: 5, borderRadius: 6, overflow: "hidden" }, meterValue: { height: "100%", borderRadius: 6 }, signal: { width: 58, textAlign: "right", fontSize: 12, fontWeight: "800" }, running: { flexDirection: "row", alignItems: "center", gap: 10 }, notice: { fontSize: 13, lineHeight: 19 }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.46 },
});
