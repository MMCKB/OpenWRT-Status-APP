import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppDialog as Alert } from "@/components/app-dialog";

import { ManagementShell } from "@/components/management-shell";
import { SectionCard } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import { buildWanReconnectCommand, isWanInterface } from "@/lib/openwrt-admin";
import { useRouterStore } from "@/lib/router-provider";

const links = [
  { title: "网络诊断", description: "分别检测每条宽带的 Ping、DNS、路由和端口。", icon: "network-check", target: "/diagnostics" },
  { title: "无线管理", description: "快速管理 Wi‑Fi、SSID 和访客网络。", icon: "wifi", target: "/wireless-manager" },
  { title: "设备管理", description: "查看在线设备，并对未知设备执行拉黑。", icon: "devices", target: "/clients" },
  { title: "备份与服务", description: "导出配置，管理常见系统服务和 Docker。", icon: "settings-suggest", target: "/maintenance-tools" },
];

export default function QuickActionsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { selectedStatus } = useRouterStore();
  const { execute, isRunning, hasRouter, isSupported } = useManagedSsh();
  const wanInterfaces = useMemo(
    () => (selectedStatus?.interfaces ?? []).filter(isWanInterface),
    [selectedStatus?.interfaces],
  );

  const reconnect = (name: string) => {
    Alert.alert("重连宽带", `将短暂断开并重新拨号 ${name}。确定继续吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "重连",
        style: "destructive",
        onPress: () => execute(buildWanReconnectCommand(name)).then(() => Alert.alert("已执行", `${name} 已发送重连指令。`)).catch((error: Error) => Alert.alert("操作失败", error.message)),
      },
    ]);
  };

  return (
    <ManagementShell title="快捷操作" description="常用管理操作会通过已保存路由器的应用内 SSH 执行，涉及网络中断的操作需再次确认。">
      <SectionCard title="一键重连 WAN">
        {!hasRouter ? <Text style={[styles.empty, { color: colors.muted }]}>请先在“路由器”页选择一台设备。</Text> : null}
        {hasRouter && !isSupported ? <Text style={[styles.empty, { color: colors.muted }]}>请在最新 Android APK 中使用快捷控制。</Text> : null}
        {hasRouter && isSupported && wanInterfaces.length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>当前没有检测到在线 WAN 接口。</Text> : null}
        {wanInterfaces.map((item, index) => (
          <Pressable key={item.name} disabled={isRunning} onPress={() => reconnect(item.name)} style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { opacity: 0.7 }, isRunning && { opacity: 0.5 }]}>
            <View style={[styles.icon, { backgroundColor: colors.background }]}><MaterialIcons name="refresh" size={21} color={colors.primary} /></View>
            <View style={styles.copy}><Text style={[styles.title, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.description, { color: colors.muted }]}>{item.ipv4?.[0] ?? "未报告 IPv4"} · 点按重新拨号</Text></View>
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))}
      </SectionCard>
      <SectionCard title="管理入口">
        {links.map((item, index) => <Pressable key={item.target} onPress={() => router.push(item.target as never)} style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { opacity: 0.7 }]}><View style={[styles.icon, { backgroundColor: colors.background }]}><MaterialIcons name={item.icon as "wifi"} size={21} color={colors.primary} /></View><View style={styles.copy}><Text style={[styles.title, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.description, { color: colors.muted }]}>{item.description}</Text></View><MaterialIcons name="chevron-right" size={22} color={colors.muted} /></Pressable>)}
      </SectionCard>
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 16, fontSize: 13, lineHeight: 20 },
  row: { minHeight: 72, paddingHorizontal: 15, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "800" },
  description: { marginTop: 3, fontSize: 12, lineHeight: 17 },
});
