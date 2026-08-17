import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import { buildWirelessChannelApplyCommand, buildWirelessOptimizationSnapshotCommand, parseWirelessOptimizationSnapshot, recommendWirelessChannel, type WirelessChannelRecommendation, type WirelessOptimizationSnapshot } from "@/lib/openwrt-admin";

export default function WirelessOptimizerScreen() {
  const colors = useColors();
  const { execute, isRunning, error, hasRouter, isSupported } = useManagedSsh();
  const [snapshot, setSnapshot] = useState<WirelessOptimizationSnapshot>({ radios: [], networks: [] });
  const [hasScanned, setHasScanned] = useState(false);

  const refresh = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    try {
      setSnapshot(parseWirelessOptimizationSnapshot(await execute(buildWirelessOptimizationSnapshotCommand())));
      setHasScanned(true);
    } catch {
      // The managed SSH hook exposes the user-facing error state.
    }
  }, [execute, hasRouter, isSupported]);

  const recommendations = useMemo(() => snapshot.radios.map((radio) => recommendWirelessChannel(radio, snapshot.networks)), [snapshot]);

  function applyRecommendation(recommendation: WirelessChannelRecommendation) {
    if (recommendation.suggestedChannel === null || recommendation.suggestedChannel === recommendation.currentChannel) return;
    Alert.alert("应用无线信道", `将 ${recommendation.radio} 从信道 ${recommendation.currentChannel} 切换到信道 ${recommendation.suggestedChannel}。无线会短暂重载，已连接设备可能需要重新关联。`, [
      { text: "取消", style: "cancel" },
      { text: "确认切换", onPress: () => void (async () => {
        try {
          await execute(buildWirelessChannelApplyCommand(recommendation.radio, recommendation.suggestedChannel!));
          await refresh();
        } catch {}
      })() },
    ]);
  }

  return (
    <ManagementShell title="无线优化助手" description="扫描附近无线网络，按当前无线设备的可见信道计算保守的拥挤度建议。">
      <View style={styles.toolbar}>
        <View style={styles.pills}><StatusPill label={hasScanned ? `${snapshot.radios.length} 个 radio` : "尚未扫描"} tone="normal" />{hasScanned ? <StatusPill label={`${snapshot.networks.length} 个邻近网络`} tone="success" /> : null}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="扫描附近无线网络" onPress={() => void refresh()} disabled={isRunning || !hasRouter || !isSupported} style={({ pressed }) => [styles.scan, { backgroundColor: colors.primary }, (isRunning || !hasRouter || !isSupported) && styles.disabled, pressed && styles.pressed]}>{isRunning ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><MaterialIcons name="wifi-find" size={18} color="#FFFFFF" /><Text style={styles.scanText}>扫描</Text></>}</Pressable>
      </View>

      <ToolNotice><View style={styles.noticeRow}><MaterialIcons name="info-outline" size={19} color={colors.primary} /><Text style={[styles.noticeText, { color: colors.muted }]}>扫描会占用无线射频片刻。建议仅基于本次可见网络与信号强度，不能保证所有环境下的吞吐量；应用前请确认不会影响正在进行的业务。</Text></View></ToolNotice>
      {!isSupported ? <ToolNotice><Text style={[styles.errorText, { color: colors.error }]}>无线扫描需要安装支持应用内 SSH 的最新 Android 安装包。</Text></ToolNotice> : null}
      {error ? <ToolNotice><Text style={[styles.errorText, { color: colors.error }]}>{error}</Text></ToolNotice> : null}

      {recommendations.map((recommendation) => <RecommendationCard key={recommendation.radio} recommendation={recommendation} scanCount={snapshot.networks.filter((network) => network.radio === recommendation.radio).length} colors={colors} disabled={isRunning} onApply={() => applyRecommendation(recommendation)} />)}

      {hasScanned && !snapshot.radios.length && !isRunning ? <EmptyState icon="wifi-off" title="未读取到可扫描的无线设备" description="该路由器可能没有可用的 iwinfo 无线接口，或当前固件未提供扫描权限。" /> : null}

      {hasScanned && snapshot.networks.length ? <SectionCard title="附近网络（信号由强到弱）">{snapshot.radios.map((radio) => {
        const networks = snapshot.networks.filter((network) => network.radio === radio.name).sort((a, b) => (b.signalDbm ?? -100) - (a.signalDbm ?? -100));
        if (!networks.length) return null;
        return <View key={radio.name} style={styles.networkGroup}><Text style={[styles.groupTitle, { color: colors.muted }]}>{radio.name}</Text>{networks.slice(0, 12).map((network, index) => <View key={`${network.bssid ?? network.ssid ?? "hidden"}-${network.channel}-${index}`} style={[styles.networkRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}><View style={[styles.wifiIcon, { backgroundColor: colors.background }]}><MaterialIcons name="wifi" size={18} color={colors.primary} /></View><View style={styles.networkCopy}><Text numberOfLines={1} style={[styles.networkSsid, { color: colors.foreground }]}>{network.ssid ?? "隐藏网络"}</Text><Text numberOfLines={1} style={[styles.networkMeta, { color: colors.muted }]}>{network.bssid ?? "未报告 BSSID"}</Text></View><View style={styles.networkStats}><Text style={[styles.channel, { color: colors.foreground }]}>CH {network.channel}</Text><Text style={[styles.signal, { color: colors.muted }]}>{network.signalDbm === null ? "—" : `${network.signalDbm} dBm`}</Text></View></View>)}</View>;
      })}</SectionCard> : null}
    </ManagementShell>
  );
}

function RecommendationCard({ recommendation, scanCount, colors, disabled, onApply }: { recommendation: WirelessChannelRecommendation; scanCount: number; colors: ReturnType<typeof useColors>; disabled: boolean; onApply: () => void }) {
  const canApply = recommendation.suggestedChannel !== null && recommendation.suggestedChannel !== recommendation.currentChannel;
  return <SectionCard title={recommendation.radio}><View style={styles.recommendation}><View style={[styles.recommendationIcon, { backgroundColor: colors.background }]}><MaterialIcons name="settings-input-antenna" size={22} color={colors.primary} /></View><View style={styles.recommendationCopy}><View style={styles.channelLine}><Text style={[styles.current, { color: colors.muted }]}>当前 {recommendation.currentChannel ?? "未报告"}</Text><MaterialIcons name="arrow-forward" size={17} color={colors.muted} /><Text style={[styles.suggested, { color: colors.foreground }]}>建议 {recommendation.suggestedChannel ?? "无"}</Text></View><Text style={[styles.reason, { color: colors.muted }]}>{recommendation.reason}</Text><Text style={[styles.scanCount, { color: colors.muted }]}>本 radio 扫描到 {scanCount} 个邻近网络</Text></View></View>{canApply ? <Pressable accessibilityRole="button" onPress={onApply} disabled={disabled} style={({ pressed }) => [styles.apply, { backgroundColor: colors.primary }, disabled && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="tune" size={17} color="#FFFFFF" /><Text style={styles.applyText}>确认切换到信道 {recommendation.suggestedChannel}</Text></Pressable> : <View style={[styles.keep, { borderColor: colors.border }]}><MaterialIcons name="check-circle-outline" size={17} color={colors.success} /><Text style={[styles.keepText, { color: colors.muted }]}>保持当前配置</Text></View>}</SectionCard>;
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, pills: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 7 }, scan: { minHeight: 38, paddingHorizontal: 13, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 5 }, scanText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" }, noticeRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 }, noticeText: { flex: 1, fontSize: 13, lineHeight: 19 }, errorText: { fontSize: 13, lineHeight: 19 }, recommendation: { padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 11 }, recommendationIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" }, recommendationCopy: { flex: 1, minWidth: 0 }, channelLine: { flexDirection: "row", alignItems: "center", gap: 5 }, current: { fontSize: 13, fontWeight: "700" }, suggested: { fontSize: 14, fontWeight: "900" }, reason: { fontSize: 12, lineHeight: 18, marginTop: 6 }, scanCount: { fontSize: 10, marginTop: 5 }, apply: { minHeight: 41, marginHorizontal: 14, marginBottom: 14, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, applyText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" }, keep: { minHeight: 39, marginHorizontal: 14, marginBottom: 14, borderRadius: 10, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, keepText: { fontSize: 13, fontWeight: "700" }, networkGroup: { paddingVertical: 6 }, groupTitle: { paddingHorizontal: 14, paddingVertical: 8, fontSize: 11, fontWeight: "800", textTransform: "uppercase" }, networkRow: { minHeight: 61, paddingHorizontal: 14, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 10 }, wifiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" }, networkCopy: { flex: 1, minWidth: 0 }, networkSsid: { fontSize: 13, fontWeight: "800" }, networkMeta: { marginTop: 3, fontSize: 10 }, networkStats: { alignItems: "flex-end" }, channel: { fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] }, signal: { marginTop: 3, fontSize: 10, fontVariant: ["tabular-nums"] }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.5 },
});
