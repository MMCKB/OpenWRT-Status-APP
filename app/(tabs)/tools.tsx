import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ManagementShell } from "@/components/management-shell";
import { SectionCard } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";

const tools = [
  { title: "已连接设备", description: "查看 DHCP 客户端与在线邻居，可安全拉黑未知设备。", icon: "devices", target: "/clients" },
  { title: "流量统计", description: "按每条 WAN 查看本机采样的日、周、月流量。", icon: "query-stats", target: "/traffic" },
  { title: "网络诊断", description: "按 WAN 执行 Ping、DNS、路由追踪和端口连通性检查。", icon: "network-check", target: "/diagnostics" },
  { title: "无线管理", description: "管理 SSID、无线开关及访客网络二维码。", icon: "wifi", target: "/wireless-manager" },
  { title: "代理与健康", description: "查看 OpenClash、AdGuard Home 与资源、温度、连通性报告。", icon: "monitor-heart", target: "/services-health" },
  { title: "日志中心", description: "按系统、内核、DNS、拨号或防火墙查看并导出最近日志。", icon: "article", target: "/logs" },
  { title: "防火墙与端口转发", description: "查看安全区域，安全管理端口转发与 UPnP 服务。", icon: "security", target: "/firewall" },
  { title: "多路由器批量操作", description: "依次刷新多台路由器状态、执行基础诊断或下载配置备份。", icon: "router", target: "/bulk-operations" },
  { title: "备份与服务", description: "导出/恢复配置，查看 OpenWrt 服务和 Docker 容器。", icon: "settings-suggest", target: "/maintenance-tools" },
  { title: "快捷操作", description: "一键重连 WAN，并快速进入常用路由器管理功能。", icon: "bolt", target: "/quick-actions" },
];

export default function ToolsScreen() {
  const colors = useColors();
  const router = useRouter();
  return <ManagementShell title="网络工具" description="所有写入操作都会通过已保存路由器的应用内 SSH 执行，并在执行前要求确认。"><SectionCard title="路由器管理">{tools.map((item, index) => <Pressable key={item.target} accessibilityRole="button" onPress={() => router.push(item.target as never)} style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }, pressed && styles.pressed]}><View style={[styles.icon, { backgroundColor: colors.background }]}><MaterialIcons name={item.icon as ComponentProps<typeof MaterialIcons>["name"]} size={21} color={colors.primary} /></View><View style={styles.copy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.rowDescription, { color: colors.muted }]}>{item.description}</Text></View><MaterialIcons name="chevron-right" size={22} color={colors.muted} /></Pressable>)}</SectionCard></ManagementShell>;
}

const styles = StyleSheet.create({
  row: { minHeight: 78, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 }, icon: { width: 39, height: 39, borderRadius: 12, alignItems: "center", justifyContent: "center" }, copy: { flex: 1, minWidth: 0 }, rowTitle: { fontSize: 15, fontWeight: "800" }, rowDescription: { fontSize: 12, lineHeight: 18, marginTop: 3 }, pressed: { opacity: 0.7 },
});
