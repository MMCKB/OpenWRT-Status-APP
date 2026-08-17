import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import { buildHostTrafficSnapshotCommand, calculateHostTrafficRates, parseHostTrafficCounters, type HostTrafficCounter, type HostTrafficRate } from "@/lib/openwrt-admin";
import { formatTrafficRate } from "@/lib/traffic-monitor";

const SAMPLE_INTERVAL_MS = 2_000;

export default function TrafficRankingScreen() {
  const colors = useColors();
  const router = useRouter();
  const { execute, isRunning, error, hasRouter, isSupported } = useManagedSsh();
  const previousCounters = useRef<HostTrafficCounter[]>([]);
  const [rates, setRates] = useState<HostTrafficRate[]>([]);
  const [hasFirstSample, setHasFirstSample] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (isRunning || !hasRouter || !isSupported) return;
    try {
      const counters = parseHostTrafficCounters(await execute(buildHostTrafficSnapshotCommand()));
      const nextRates = calculateHostTrafficRates(previousCounters.current, counters);
      previousCounters.current = counters;
      setRates(nextRates);
      setHasFirstSample(true);
      setLastUpdatedAt(Date.now());
    } catch {
      // The managed SSH hook exposes the user-facing error state.
    }
  }, [execute, hasRouter, isRunning, isSupported]);

  useEffect(() => {
    previousCounters.current = [];
    setRates([]);
    setHasFirstSample(false);
    if (!hasRouter || !isSupported) return;
    void refresh();
    const timer = setInterval(() => void refresh(), SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasRouter, isSupported, refresh]);

  const activeRates = rates.filter((item) => item.rxBytesPerSecond !== null || item.txBytesPerSecond !== null);

  return (
    <ManagementShell title="实时流量排行" description="每 2 秒通过路由器连接跟踪表采样一次，按设备上行与下行总速率排序。">
      <View style={styles.toolbar}>
        <View style={styles.pills}>
          <StatusPill label={hasFirstSample ? `${activeRates.length} 台设备` : "准备采样"} tone="normal" />
          {lastUpdatedAt ? <Text style={[styles.updated, { color: colors.muted }]}>刚刚更新</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="立即刷新设备流量排行" onPress={() => void refresh()} disabled={isRunning || !hasRouter || !isSupported} style={({ pressed }) => [styles.refresh, { backgroundColor: colors.primary }, (isRunning || !hasRouter || !isSupported) && styles.disabled, pressed && styles.pressed]}>
          {isRunning ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><MaterialIcons name="refresh" size={18} color="#FFFFFF" /><Text style={styles.refreshText}>刷新</Text></>}
        </Pressable>
      </View>

      <ToolNotice>
        <View style={styles.noticeRow}>
          <MaterialIcons name="info-outline" size={19} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.muted }]}>统计仅包含路由器能从 conntrack 识别并与 DHCP/邻居表匹配的 IPv4 设备；首个样本只建立基线，不显示速率。</Text>
        </View>
      </ToolNotice>

      {!isSupported ? <ToolNotice><Text style={[styles.errorText, { color: colors.error }]}>实时设备流量需要安装支持应用内 SSH 的最新 Android 安装包。</Text></ToolNotice> : null}
      {error ? <ToolNotice><Text style={[styles.errorText, { color: colors.error }]}>{error}</Text></ToolNotice> : null}

      {activeRates.length ? (
        <SectionCard title="按当前速率排序">
          {activeRates.map((item, index) => {
            const total = (item.rxBytesPerSecond ?? 0) + (item.txBytesPerSecond ?? 0);
            return <View key={item.mac} style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={[styles.rank, { backgroundColor: index < 3 ? colors.primary : colors.surface }]}><Text style={[styles.rankText, { color: index < 3 ? "#FFFFFF" : colors.muted }]}>{index + 1}</Text></View>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{item.hostname ?? "未命名设备"}</Text>
                <Text numberOfLines={1} style={[styles.metadata, { color: colors.muted }]}>{item.ipv4 ?? "未取得 IP"} · {item.mac}</Text>
              </View>
              <View style={styles.speeds}>
                <Text style={[styles.total, { color: colors.foreground }]}>{formatTrafficRate(total)}</Text>
                <View style={styles.directionRow}><MaterialIcons name="arrow-upward" size={13} color={colors.warning} /><Text style={[styles.direction, { color: colors.muted }]}>{formatTrafficRate(item.txBytesPerSecond)}</Text></View>
                <View style={styles.directionRow}><MaterialIcons name="arrow-downward" size={13} color={colors.success} /><Text style={[styles.direction, { color: colors.muted }]}>{formatTrafficRate(item.rxBytesPerSecond)}</Text></View>
              </View>
            </View>;
          })}
        </SectionCard>
      ) : hasFirstSample && !isRunning && hasRouter ? (
        <EmptyState icon="query-stats" title="暂未读取到可排行的设备流量" description="该路由器可能未启用 conntrack 计数，或当前设备尚未产生可匹配的 IPv4 连接。" />
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => router.push("/clients")} style={({ pressed }) => [styles.linkRow, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}>
        <MaterialIcons name="devices" size={20} color={colors.primary} />
        <View style={styles.linkCopy}><Text style={[styles.linkTitle, { color: colors.foreground }]}>管理已连接设备</Text><Text style={[styles.linkText, { color: colors.muted }]}>查看完整客户端列表，并使用已有的拉黑控制。</Text></View>
        <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
      </Pressable>
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, pills: { flexDirection: "row", alignItems: "center", gap: 8 }, updated: { fontSize: 12 }, refresh: { minHeight: 38, paddingHorizontal: 13, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 5 }, refreshText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" }, noticeRow: { flexDirection: "row", gap: 9, alignItems: "flex-start" }, noticeText: { flex: 1, fontSize: 13, lineHeight: 19 }, errorText: { fontSize: 13, lineHeight: 19 }, row: { minHeight: 78, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, rank: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" }, rankText: { fontWeight: "800", fontSize: 12 }, copy: { flex: 1, minWidth: 0 }, name: { fontSize: 14, fontWeight: "800" }, metadata: { fontSize: 10, marginTop: 4, fontVariant: ["tabular-nums"] }, speeds: { alignItems: "flex-end", minWidth: 94 }, total: { fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] }, directionRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 }, direction: { fontSize: 10, fontVariant: ["tabular-nums"] }, linkRow: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, linkCopy: { flex: 1 }, linkTitle: { fontSize: 14, fontWeight: "800" }, linkText: { marginTop: 2, fontSize: 12, lineHeight: 17 }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.5 },
});
