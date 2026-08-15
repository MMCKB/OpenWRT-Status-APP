import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { EmptyState, SectionCard, sharedStyles } from "@/components/status-ui";
import { formatBytes, formatLoad, formatUptime, memoryUsagePercent } from "@/lib/openwrt-client";
import { useRouterStore } from "@/lib/router-provider";

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.detailRow, !last && styles.rowDivider]}><Text style={styles.label}>{label}</Text><Text style={styles.value} numberOfLines={2}>{value}</Text></View>;
}

export default function DetailsScreen() {
  const router = useRouter();
  const { selectedProfile, selectedStatus, refreshStatus, isRefreshing } = useRouterStore();
  const system = selectedStatus?.system;
  if (!selectedProfile) {
    return <View style={sharedStyles.screen}><View style={styles.header}><Text style={styles.title}>详情</Text></View><EmptyState icon="analytics" title="尚无设备详情" description="先添加并选择一台 OpenWrt 路由器，才能查看系统、接口与无线网络的完整数据。" /><Pressable onPress={() => router.push("/router-form" as never)} style={({ pressed }) => [sharedStyles.primaryButton, styles.emptyButton, pressed && sharedStyles.primaryButtonPressed]}><Text style={sharedStyles.primaryButtonText}>添加路由器</Text></Pressable></View>;
  }
  return (
    <View style={sharedStyles.screen}>
      <ScrollView contentContainerStyle={sharedStyles.content}>
        <View style={styles.headerRow}><View><Text style={styles.title}>详情</Text><Text style={styles.subtitle}>{selectedProfile.name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="刷新状态" onPress={() => void refreshStatus()} style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshPressed]}><MaterialIcons name="refresh" size={21} color="#007E7A" /></Pressable></View>
        {isRefreshing ? <Text style={styles.refreshing}>正在读取路由器状态…</Text> : null}
        <SectionCard title="系统">
          <DetailRow label="主机名" value={system?.hostname ?? "未报告"} />
          <DetailRow label="设备型号" value={system?.model ?? "未报告"} />
          <DetailRow label="固件版本" value={system?.firmware ?? "未报告"} />
          <DetailRow label="运行时间" value={formatUptime(system?.uptimeSeconds ?? null)} />
          <DetailRow label="系统负载" value={formatLoad(system?.load ?? null)} last />
        </SectionCard>
        <SectionCard title="内存">
          <DetailRow label="内存使用" value={memoryUsagePercent(system ?? null) === null ? "未报告" : `${memoryUsagePercent(system ?? null)}%`} />
          <DetailRow label="总内存" value={formatBytes(system?.memoryTotal ?? null)} />
          <DetailRow label="可用内存" value={formatBytes(system?.memoryAvailable ?? null)} last />
        </SectionCard>
        <SectionCard title="网络接口">
          {selectedStatus?.interfaces.length ? selectedStatus.interfaces.map((item, index, all) => <DetailRow key={`${item.name}-${index}`} label={`${item.name} · ${item.up ? "已连接" : "未连接"}`} value={item.ipv4.join(", ") || item.device} last={index === all.length - 1} />) : <Text style={styles.unavailable}>路由器未报告接口数据。</Text>}
        </SectionCard>
        <SectionCard title="无线网络">
          {selectedStatus?.wireless.length ? selectedStatus.wireless.map((item, index, all) => <DetailRow key={`${item.name}-${index}`} label={`${item.ssid} · ${item.up ? "已启用" : "未启用"}`} value={`接口 ${item.name} · 信道 ${item.channel} · ${item.clients === null ? "客户端未报告" : `${item.clients} 台客户端`}`} last={index === all.length - 1} />) : <Text style={styles.unavailable}>路由器未报告无线数据。</Text>}
        </SectionCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 26 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#102A43", fontSize: 28, fontWeight: "800" },
  subtitle: { color: "#60758B", fontSize: 14, marginTop: 4 },
  refreshButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#E6F5F4", alignItems: "center", justifyContent: "center" },
  refreshPressed: { opacity: 0.7 },
  refreshing: { color: "#007E7A", fontSize: 13, fontWeight: "600", marginTop: -12 },
  detailRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18, paddingHorizontal: 15, paddingVertical: 11 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: "#EEF2F4" },
  label: { color: "#5B6B7D", fontSize: 14, flex: 1 },
  value: { color: "#203B55", fontSize: 14, fontWeight: "700", maxWidth: "58%", textAlign: "right", fontVariant: ["tabular-nums"] },
  unavailable: { color: "#738397", fontSize: 14, paddingHorizontal: 15, paddingVertical: 18 },
  emptyButton: { marginHorizontal: 20, marginTop: 4 },
});
