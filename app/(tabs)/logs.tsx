import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import { buildRouterLogCommand, parseRouterLogLines, type RouterLogCategory } from "@/lib/openwrt-advanced-admin";

const categories: { id: RouterLogCategory; label: string }[] = [
  { id: "system", label: "系统" },
  { id: "kernel", label: "内核" },
  { id: "dns", label: "DNS" },
  { id: "dial", label: "拨号" },
  { id: "firewall", label: "防火墙" },
];

export default function LogsScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [category, setCategory] = useState<RouterLogCategory>("system");
  const [filter, setFilter] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadLogs = useCallback(async (nextCategory = category, nextFilter = filter) => {
    if (!hasRouter || !isSupported) return;
    setIsLoading(true);
    setNotice(null);
    try {
      const output = await execute(buildRouterLogCommand(nextCategory, 180, nextFilter));
      setLines(parseRouterLogLines(output));
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "日志读取失败。");
      setLines([]);
    } finally {
      setIsLoading(false);
    }
  }, [category, execute, filter, hasRouter, isSupported]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  async function copyLogs() {
    if (!lines.length) return;
    await Clipboard.setStringAsync(lines.join("\n"));
    setNotice("当前日志已复制到剪贴板。");
  }

  async function exportLogs() {
    if (!lines.length) return;
    try {
      const path = `${FileSystem.cacheDirectory}openwrt-${category}-logs-${Date.now()}.txt`;
      await FileSystem.writeAsStringAsync(path, lines.join("\n"), { encoding: FileSystem.EncodingType.UTF8 });
      if (!(await Sharing.isAvailableAsync())) throw new Error("此设备无法打开系统分享面板。");
      await Sharing.shareAsync(path, { mimeType: "text/plain", dialogTitle: "导出 OpenWrt 日志" });
      setNotice("日志已生成，可在系统分享面板中保存或发送。");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "日志导出失败。");
    }
  }

  const disabled = !hasRouter || !isSupported || isRunning || isLoading;
  return <ManagementShell title="日志中心" description="从路由器读取最近日志；不会持续采集、上传或保留路由器日志。">
    <SectionCard title="日志范围">
      <View style={styles.controls}><View style={styles.chips}>{categories.map((item) => <Pressable key={item.id} disabled={disabled} onPress={() => { setCategory(item.id); void loadLogs(item.id, filter); }} style={({ pressed }) => [styles.chip, { borderColor: item.id === category ? colors.primary : colors.border, backgroundColor: item.id === category ? colors.primary : colors.background }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.chipText, { color: item.id === category ? "#fff" : colors.muted }]}>{item.label}</Text></Pressable>)}</View><TextInput value={filter} onChangeText={setFilter} placeholder="筛选关键词（可留空）" placeholderTextColor={colors.muted} maxLength={80} returnKeyType="search" onSubmitEditing={() => void loadLogs()} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} /><View style={styles.actions}><Pressable disabled={disabled} onPress={() => void loadLogs()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={styles.primaryText}>{isLoading ? "读取中…" : "读取最新日志"}</Text></Pressable><Pressable disabled={!lines.length} onPress={() => void copyLogs()} style={({ pressed }) => [styles.secondary, { borderColor: colors.border }, pressed && styles.pressed, !lines.length && styles.disabled]}><Text style={[styles.secondaryText, { color: colors.foreground }]}>复制</Text></Pressable><Pressable disabled={!lines.length} onPress={() => void exportLogs()} style={({ pressed }) => [styles.secondary, { borderColor: colors.border }, pressed && styles.pressed, !lines.length && styles.disabled]}><Text style={[styles.secondaryText, { color: colors.foreground }]}>导出</Text></Pressable></View></View>
    </SectionCard>
    <SectionCard title={`最近记录${lines.length ? ` · ${lines.length} 条` : ""}`}>
      {lines.length ? <View style={[styles.logBox, { backgroundColor: colors.background }]}>{lines.map((line, index) => <Text selectable key={`${index}-${line.slice(0, 24)}`} style={[styles.logLine, { color: colors.foreground }]}>{line}</Text>)}</View> : !isLoading ? <EmptyState icon="article" title="没有可显示的日志" description="请连接 Android 应用内 SSH 后读取，或更换日志范围和筛选词。" /> : <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={[styles.caption, { color: colors.muted }]}>正在读取路由器日志…</Text></View>}
    </SectionCard>
    {error || notice ? <ToolNotice><Text selectable style={[styles.notice, { color: error ? colors.error : colors.foreground }]}>{error ?? notice}</Text></ToolNotice> : null}
    {!isSupported ? <ToolNotice><Text style={[styles.notice, { color: colors.warning }]}>此功能需要安装包含应用内 SSH 的 Android APK。</Text></ToolNotice> : null}
  </ManagementShell>;
}

const styles = StyleSheet.create({
  controls: { padding: 15, gap: 12 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" }, chipText: { fontSize: 12, fontWeight: "800" }, input: { height: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 }, actions: { flexDirection: "row", gap: 8 }, primary: { flex: 1, minHeight: 42, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }, primaryText: { color: "#fff", fontSize: 12, fontWeight: "800" }, secondary: { minHeight: 42, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }, secondaryText: { fontSize: 12, fontWeight: "800" }, logBox: { margin: 14, borderRadius: 12, padding: 12, gap: 5 }, logLine: { fontFamily: "monospace", fontSize: 11, lineHeight: 17 }, loading: { padding: 28, alignItems: "center", gap: 10 }, caption: { fontSize: 13 }, notice: { fontSize: 13, lineHeight: 19 }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.46 },
});
