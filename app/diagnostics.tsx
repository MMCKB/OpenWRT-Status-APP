import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ComponentProps, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppDialog as Alert } from "@/components/app-dialog";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import { buildWanDiagnosticCommand, buildWanReconnectCommand, isWanInterface } from "@/lib/openwrt-admin";
import { useRouterStore } from "@/lib/router-provider";

type DiagnosticKind = "ping" | "dns" | "trace" | "port";
const actions: { kind: DiagnosticKind; label: string; icon: ComponentProps<typeof MaterialIcons>["name"] }[] = [
  { kind: "ping", label: "Ping", icon: "speed" }, { kind: "dns", label: "DNS", icon: "dns" }, { kind: "trace", label: "路由追踪", icon: "route" }, { kind: "port", label: "端口", icon: "settings-ethernet" },
];

export default function DiagnosticsScreen() {
  const colors = useColors();
  const { selectedStatus } = useRouterStore();
  const { execute, hasRouter, isRunning, isSupported, error } = useManagedSsh();
  const wanInterfaces = useMemo(() => (selectedStatus?.interfaces ?? []).filter(isWanInterface), [selectedStatus]);
  const [wan, setWan] = useState("");
  const [target, setTarget] = useState("1.1.1.1");
  const [port, setPort] = useState("443");
  const [output, setOutput] = useState<string | null>(null);
  const activeWan = wan || wanInterfaces[0]?.name || "";

  async function run(kind: DiagnosticKind) {
    try { setOutput(await execute(buildWanDiagnosticCommand(activeWan, kind, target, Number(port)))); } catch {}
  }
  function reconnect() {
    Alert.alert("重连 WAN", `将断开并重新拨号 ${activeWan}。这会短暂中断此宽带的网络连接。`, [{ text: "取消", style: "cancel" }, { text: "重连", style: "destructive", onPress: () => void execute(buildWanReconnectCommand(activeWan)).then(setOutput).catch(() => {}) }]);
  }

  return <ManagementShell title="网络诊断" description="所有诊断命令在指定 WAN 上执行。结果来自路由器，不会上传到外部服务。">{!wanInterfaces.length ? <EmptyState icon="network-check" title="未发现可用 WAN" description="请先在状态页刷新并确认至少一条 WAN 已连接。" /> : <><SectionCard title="选择宽带">{wanInterfaces.map((item, index) => <Pressable key={item.name} accessibilityRole="button" accessibilityState={{ selected: activeWan === item.name }} onPress={() => setWan(item.name)} style={({ pressed }) => [styles.wanRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }, activeWan === item.name && { backgroundColor: colors.background }, pressed && styles.pressed]}><View><Text style={[styles.wanName, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.wanDetail, { color: colors.muted }]}>{item.device} · {item.ipv4?.[0] ?? "未取得 IPv4"}</Text></View><StatusPill label={item.up ? "已连接" : "离线"} tone={item.up ? "success" : "danger"} /></Pressable>)}</SectionCard><SectionCard title="诊断目标"><View style={styles.form}><Text style={[styles.label, { color: colors.muted }]}>域名或 IPv4</Text><TextInput value={target} onChangeText={setTarget} autoCapitalize="none" autoCorrect={false} placeholder="1.1.1.1" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /><Text style={[styles.label, { color: colors.muted }]}>TCP 端口（端口检查使用）</Text><TextInput value={port} onChangeText={setPort} keyboardType="number-pad" placeholder="443" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /></View><View style={styles.actionGrid}>{actions.map((action) => <Pressable key={action.kind} accessibilityRole="button" disabled={isRunning || !hasRouter || !isSupported} onPress={() => void run(action.kind)} style={({ pressed }) => [styles.action, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed, (isRunning || !isSupported) && styles.disabled]}><MaterialIcons name={action.icon} size={20} color={colors.primary} /><Text style={[styles.actionText, { color: colors.foreground }]}>{action.label}</Text></Pressable>)}</View><Pressable accessibilityRole="button" onPress={reconnect} disabled={isRunning || !hasRouter || !isSupported} style={({ pressed }) => [styles.reconnect, { borderColor: colors.warning }, pressed && styles.pressed, (isRunning || !isSupported) && styles.disabled]}><MaterialIcons name="sync" size={18} color={colors.warning} /><Text style={[styles.reconnectText, { color: colors.warning }]}>重连 {activeWan}</Text></Pressable></SectionCard>{isRunning ? <ToolNotice><View style={styles.running}><ActivityIndicator color={colors.primary} /><Text style={[styles.runningText, { color: colors.muted }]}>正在从 {activeWan} 执行诊断…</Text></View></ToolNotice> : null}{error ? <ToolNotice><Text style={[styles.error, { color: colors.error }]}>{error}</Text></ToolNotice> : null}{output ? <SectionCard title="命令输出"><View style={[styles.output, { backgroundColor: colors.background }]}><Text selectable style={[styles.outputText, { color: colors.foreground }]}>{output.trim() || "命令未返回输出。"}</Text></View></SectionCard> : null}</>}<ToolNotice><Text style={[styles.note, { color: colors.muted }]}>诊断仅在页面打开并手动触发时运行，不包含持续后台监控或推送。</Text></ToolNotice></ManagementShell>;
}

const styles = StyleSheet.create({
  wanRow: { minHeight: 66, padding: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, wanName: { fontSize: 15, fontWeight: "800" }, wanDetail: { fontSize: 12, marginTop: 3 }, form: { padding: 15, gap: 7 }, label: { fontSize: 12, fontWeight: "700", marginTop: 2 }, input: { height: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14, marginBottom: 6 }, actionGrid: { paddingHorizontal: 15, paddingBottom: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }, action: { width: "48%", minHeight: 44, borderWidth: 1, borderRadius: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 }, actionText: { fontSize: 13, fontWeight: "800" }, reconnect: { marginHorizontal: 15, marginBottom: 15, minHeight: 42, borderWidth: 1, borderRadius: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 }, reconnectText: { fontSize: 13, fontWeight: "800" }, running: { flexDirection: "row", alignItems: "center", gap: 10 }, runningText: { fontSize: 13 }, output: { margin: 14, borderRadius: 12, padding: 12 }, outputText: { fontSize: 12, lineHeight: 18, fontFamily: "monospace" }, error: { fontSize: 13, lineHeight: 19 }, note: { fontSize: 13, lineHeight: 19 }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.48 },
});
