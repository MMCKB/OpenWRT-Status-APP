import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { MetricTile, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { buildPerformanceBenchmarkCommand, parsePerformanceBenchmark, type PerformanceBenchmark } from "@/lib/openwrt-admin";
import { useManagedSsh } from "@/hooks/use-managed-ssh";

function memoryLabel(totalKb: number | null, availableKb: number | null) {
  if (totalKb === null || availableKb === null) return "未报告";
  return `${(availableKb / 1024).toFixed(0)} / ${(totalKb / 1024).toFixed(0)} MB`;
}

export default function PerformanceBenchmarkScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [target, setTarget] = useState("1.1.1.1");
  const [result, setResult] = useState<PerformanceBenchmark | null>(null);
  const [rawOutput, setRawOutput] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run() {
    setNotice(null);
    try {
      const output = await execute(buildPerformanceBenchmarkCommand(target));
      setRawOutput(output);
      setResult(parsePerformanceBenchmark(output));
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "性能采样失败。");
    }
  }
  const disabled = isRunning || !hasRouter || !isSupported;
  const lossTone = result?.packetLossPercent === null || result?.packetLossPercent === undefined ? "normal" : result.packetLossPercent > 10 ? "danger" : result.packetLossPercent > 0 ? "warning" : "success";

  return <ManagementShell title="性能基准测试" description="从路由器执行 8 次 Ping、DNS 解析和系统资源采样。结果用于排查链路质量，并非互联网带宽测速。">
    <SectionCard title="测试目标"><View style={styles.form}><Text style={[styles.label, { color: colors.muted }]}>Ping 目标（IPv4 或域名）</Text><TextInput value={target} onChangeText={setTarget} autoCapitalize="none" autoCorrect={false} placeholder="1.1.1.1" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /><Text style={[styles.caption, { color: colors.muted }]}>DNS 固定查询 openwrt.org，并通过路由器本地解析器完成。不会在后台持续测速。</Text></View><Pressable disabled={disabled} onPress={() => void run()} style={({ pressed }) => [styles.run, { backgroundColor: colors.primary }, pressed && styles.pressed, disabled && styles.disabled]}><MaterialIcons name="speed" size={19} color="#fff" /><Text style={styles.runText}>{isRunning ? "测试中…" : "开始性能采样"}</Text></Pressable></SectionCard>
    {result ? <><SectionCard title="链路结果" action={<StatusPill label={result.packetLossPercent === null ? "未完整报告" : result.packetLossPercent === 0 ? "连通正常" : "存在丢包"} tone={lossTone} />}><View style={styles.metrics}><View style={styles.metricRow}><MetricTile icon="speed" label="平均延迟" value={result.latencyAvgMs === null ? "未报告" : `${result.latencyAvgMs.toFixed(1)} ms`} caption={result.latencyMinMs === null || result.latencyMaxMs === null ? "8 次 Ping" : `${result.latencyMinMs.toFixed(1)}–${result.latencyMaxMs.toFixed(1)} ms`} tone={result.latencyAvgMs !== null && result.latencyAvgMs > 120 ? "warning" : "success"} /><MetricTile icon="network-check" label="丢包率" value={result.packetLossPercent === null ? "未报告" : `${result.packetLossPercent}%`} caption={result.packetsSent === null || result.packetsReceived === null ? undefined : `${result.packetsReceived} / ${result.packetsSent} 成功`} tone={lossTone} /></View><View style={styles.metricRow}><MetricTile icon="dns" label="DNS 解析" value={result.dnsReachable === null ? "未报告" : result.dnsReachable ? "正常" : "失败"} caption="本地解析器查询 openwrt.org" tone={result.dnsReachable ? "success" : result.dnsReachable === false ? "danger" : "normal"} /><MetricTile icon="memory" label="可用内存" value={memoryLabel(result.memoryTotalKb, result.memoryAvailableKb)} caption={result.loadAverage === null ? "负载未报告" : `1 分钟负载 ${result.loadAverage.toFixed(2)}`} tone={result.memoryAvailableKb !== null && result.memoryTotalKb !== null && result.memoryAvailableKb / result.memoryTotalKb < 0.1 ? "warning" : "normal"} /></View></View></SectionCard>{rawOutput ? <SectionCard title="原始输出"><View style={[styles.output, { backgroundColor: colors.background }]}><Text selectable style={[styles.outputText, { color: colors.foreground }]}>{rawOutput.trim() || "命令未返回输出。"}</Text></View></SectionCard> : null}</> : null}
    {isRunning ? <ToolNotice><View style={styles.running}><ActivityIndicator color={colors.primary} /><Text style={[styles.notice, { color: colors.muted }]}>路由器正在完成 Ping 与 DNS 采样…</Text></View></ToolNotice> : null}
    {error || notice ? <ToolNotice><Text selectable style={[styles.notice, { color: error ? colors.error : colors.foreground }]}>{error ?? notice}</Text></ToolNotice> : null}
    {!isSupported ? <ToolNotice><Text style={[styles.notice, { color: colors.warning }]}>此功能需要安装包含应用内 SSH 的 Android APK；网页预览仅可查看页面布局。</Text></ToolNotice> : null}
  </ManagementShell>;
}

const styles = StyleSheet.create({
  form: { padding: 15, gap: 7 }, label: { fontSize: 12, fontWeight: "700" }, input: { height: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 }, caption: { fontSize: 12, lineHeight: 18, marginTop: 2 }, run: { margin: 15, marginTop: 0, minHeight: 44, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, runText: { color: "#fff", fontSize: 13, fontWeight: "800" }, metrics: { padding: 14, gap: 10 }, metricRow: { flexDirection: "row", gap: 10 }, output: { margin: 14, padding: 12, borderRadius: 12 }, outputText: { fontFamily: "monospace", fontSize: 12, lineHeight: 18 }, running: { flexDirection: "row", gap: 10, alignItems: "center" }, notice: { fontSize: 13, lineHeight: 19 }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.46 },
});
