import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AppDialog as Alert } from "@/components/app-dialog";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { buildBatchConfigBackupCommand, buildBatchRouterDiagnosticCommand } from "@/lib/openwrt-advanced-admin";
import { fetchRouterStatus } from "@/lib/openwrt-client";
import { connectInAppSsh, disconnectInAppSsh, downloadInAppSshFile, isInAppSshSupported, runInAppSshCommand } from "@/lib/native-ssh";
import { useRouterStore } from "@/lib/router-provider";
import { loadPassword, loadSshPassword } from "@/lib/router-storage";
import type { RouterProfile } from "@/shared/router-types";

type BatchOperation = "status" | "diagnostic" | "backup";
type BatchResult = { profile: RouterProfile; operation: BatchOperation; success: boolean; summary: string; localUri?: string };

async function withRouterSsh<T>(profile: RouterProfile, action: () => Promise<T>) {
  const [sshPassword, luciPassword] = await Promise.all([loadSshPassword(profile.id), loadPassword(profile.id)]);
  const password = sshPassword ?? luciPassword;
  if (!password) throw new Error("未找到 SSH 密码，请先编辑该路由器。" );
  await connectInAppSsh(profile, password);
  try { return await action(); } finally { disconnectInAppSsh(); }
}

function diagnosticSummary(output: string) {
  const loss = output.match(/(\d+(?:\.\d+)?)%\s*packet loss/i)?.[1];
  const average = output.match(/=\s*[\d.]+\/([\d.]+)\/[\d.]+(?:\/[\d.]+)?\s*ms/i)?.[1];
  const dnsOk = !/(timed out|not found|no servers could be reached|connection refused)/i.test(output) && /(?:address|name):/i.test(output);
  return `公网 ${loss === undefined ? "未报告" : `${loss}% 丢包${average ? ` · ${average} ms` : ""}`} · DNS ${dnsOk ? "正常" : "异常或未报告"}`;
}

export default function BulkOperationsScreen() {
  const colors = useColors();
  const { profiles, selectedProfile } = useRouterStore();
  const [selectedIds, setSelectedIds] = useState<string[]>(() => selectedProfile ? [selectedProfile.id] : []);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [operation, setOperation] = useState<BatchOperation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedProfiles = useMemo(() => profiles.filter((profile) => selectedIds.includes(profile.id)), [profiles, selectedIds]);
  const androidSsh = isInAppSshSupported();
  const isRunning = operation !== null;

  function toggle(id: string) {
    if (isRunning) return;
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectAll() { if (!isRunning) setSelectedIds(profiles.map((profile) => profile.id)); }

  async function perform(nextOperation: BatchOperation) {
    if (!selectedProfiles.length) { setNotice("请至少选择一台路由器。"); return; }
    if ((nextOperation === "diagnostic" || nextOperation === "backup") && !androidSsh) { setNotice("诊断与备份需要安装包含应用内 SSH 的 Android APK。"); return; }
    setOperation(nextOperation);
    setResults([]);
    setNotice(`将按顺序处理 ${selectedProfiles.length} 台路由器；不会并行执行 SSH 会话。`);
    const completed: BatchResult[] = [];
    for (let index = 0; index < selectedProfiles.length; index += 1) {
      const profile = selectedProfiles[index];
      setRunningId(profile.id);
      try {
        if (nextOperation === "status") {
          const password = await loadPassword(profile.id);
          if (!password) throw new Error("未找到 LuCI 密码，请先编辑该路由器。" );
          const status = await fetchRouterStatus(profile.id, profile.baseUrl, profile.username, password);
          completed.push({ profile, operation: nextOperation, success: status.online, summary: status.online ? `在线 · ${status.system?.hostname ?? "已获取状态"}` : status.error ?? "路由器无响应" });
        } else if (nextOperation === "diagnostic") {
          const output = await withRouterSsh(profile, () => runInAppSshCommand(buildBatchRouterDiagnosticCommand()));
          completed.push({ profile, operation: nextOperation, success: true, summary: diagnosticSummary(output) });
        } else {
          const batchId = `batch_${Date.now().toString(36)}_${index + 1}`;
          const { command, remotePath } = buildBatchConfigBackupCommand(batchId);
          const localUri = `${FileSystem.cacheDirectory}openwrt-${profile.id}-${Date.now()}.tar.gz`;
          const output = await withRouterSsh(profile, async () => {
            const response = await runInAppSshCommand(command);
            if (!response.includes("BACKUP_READY")) throw new Error(response.trim() || "路由器未生成备份文件。");
            await downloadInAppSshFile(remotePath, localUri);
            await runInAppSshCommand(`rm -f '${remotePath}'`);
            return response;
          });
          if (!output.includes("BACKUP_READY")) throw new Error("配置备份未完成。");
          completed.push({ profile, operation: nextOperation, success: true, summary: "配置备份已下载到本机，可单独分享保存。", localUri });
        }
      } catch (reason) {
        completed.push({ profile, operation: nextOperation, success: false, summary: reason instanceof Error ? reason.message : "操作失败。" });
      }
      setResults([...completed]);
    }
    setRunningId(null);
    setOperation(null);
    const successCount = completed.filter((item) => item.success).length;
    setNotice(`批量${nextOperation === "status" ? "状态刷新" : nextOperation === "diagnostic" ? "网络诊断" : "配置备份"}完成：${successCount}/${completed.length} 成功。`);
  }

  function confirmOperation(nextOperation: BatchOperation) {
    const label = nextOperation === "status" ? "刷新状态" : nextOperation === "diagnostic" ? "网络诊断" : "配置备份";
    const message = nextOperation === "backup" ? `将依次为 ${selectedProfiles.length} 台路由器生成 sysupgrade 配置备份并下载到此设备。完成后可逐个分享保存。是否继续？` : `将依次对 ${selectedProfiles.length} 台路由器执行${label}。不会并行建立 SSH 会话。是否继续？`;
    Alert.alert(`批量${label}`, message, [{ text: "取消", style: "cancel" }, { text: "开始", onPress: () => void perform(nextOperation) }]);
  }

  async function shareBackup(result: BatchResult) {
    if (!result.localUri) return;
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error("此设备无法打开系统分享面板。");
      await Sharing.shareAsync(result.localUri, { mimeType: "application/gzip", dialogTitle: `保存 ${result.profile.name} 配置备份` });
      setNotice(`${result.profile.name} 的配置备份已打开系统分享面板。`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "备份分享失败。");
    }
  }

  return <ManagementShell title="多路由器批量操作" description="一次选择多台已保存路由器，按顺序完成状态刷新、连通性诊断或配置备份，避免并发 SSH 会话互相干扰。">
    <SectionCard title={`选择路由器${selectedProfiles.length ? ` · 已选 ${selectedProfiles.length}` : ""}`} action={<Pressable disabled={isRunning || !profiles.length} onPress={selectAll} style={({ pressed }) => [styles.selectAll, { borderColor: colors.border }, pressed && styles.pressed, (isRunning || !profiles.length) && styles.disabled]}><Text style={[styles.selectAllText, { color: colors.primary }]}>全选</Text></Pressable>}>
      {profiles.length ? profiles.map((profile, index) => { const selected = selectedIds.includes(profile.id); return <Pressable key={profile.id} onPress={() => toggle(profile.id)} style={({ pressed }) => [styles.profile, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, selected && { backgroundColor: colors.background }, pressed && styles.pressed]}><View style={[styles.check, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : "transparent" }]}>{selected ? <Text style={styles.checkText}>✓</Text> : null}</View><View style={styles.profileCopy}><Text style={[styles.profileName, { color: colors.foreground }]}>{profile.name}</Text><Text style={[styles.caption, { color: colors.muted }]}>{profile.baseUrl}</Text></View>{runningId === profile.id ? <ActivityIndicator color={colors.primary} /> : selected ? <StatusPill label="已选择" tone="success" /> : null}</Pressable>; }) : <EmptyState icon="router" title="尚未添加路由器" description="请先在“路由器”页面保存至少一台设备。" />}
    </SectionCard>
    <SectionCard title="可执行操作">
      <View style={styles.operations}><Pressable disabled={isRunning || !selectedProfiles.length} onPress={() => confirmOperation("status")} style={({ pressed }) => [styles.operation, { borderColor: colors.primary }, pressed && styles.pressed, (isRunning || !selectedProfiles.length) && styles.disabled]}><Text style={[styles.operationTitle, { color: colors.primary }]}>批量刷新状态</Text><Text style={[styles.caption, { color: colors.muted }]}>通过 LuCI API 读取在线和系统概览</Text></Pressable><Pressable disabled={isRunning || !selectedProfiles.length || !androidSsh} onPress={() => confirmOperation("diagnostic")} style={({ pressed }) => [styles.operation, { borderColor: colors.primary }, pressed && styles.pressed, (isRunning || !selectedProfiles.length || !androidSsh) && styles.disabled]}><Text style={[styles.operationTitle, { color: colors.primary }]}>批量网络诊断</Text><Text style={[styles.caption, { color: colors.muted }]}>Ping、DNS 和 uptime 基础检查</Text></Pressable><Pressable disabled={isRunning || !selectedProfiles.length || !androidSsh} onPress={() => confirmOperation("backup")} style={({ pressed }) => [styles.operation, { borderColor: colors.warning }, pressed && styles.pressed, (isRunning || !selectedProfiles.length || !androidSsh) && styles.disabled]}><Text style={[styles.operationTitle, { color: colors.warning }]}>批量配置备份</Text><Text style={[styles.caption, { color: colors.muted }]}>下载 sysupgrade 格式配置包，完成后逐个保存</Text></Pressable></View>
    </SectionCard>
    <SectionCard title={`执行结果${results.length ? ` · ${results.length}` : ""}`}>
      {results.length ? results.map((result, index) => <View key={`${result.profile.id}-${index}`} style={[styles.result, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}><View style={styles.profileCopy}><Text style={[styles.profileName, { color: colors.foreground }]}>{result.profile.name}</Text><Text selectable style={[styles.caption, { color: colors.muted }]}>{result.summary}</Text></View><View style={styles.resultActions}><StatusPill label={result.success ? "完成" : "失败"} tone={result.success ? "success" : "danger"} />{result.localUri ? <Pressable onPress={() => void shareBackup(result)} style={({ pressed }) => [styles.share, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.shareText, { color: colors.primary }]}>保存</Text></Pressable> : null}</View></View>) : <EmptyState icon="playlist-play" title="等待批量操作" description="选择路由器后，执行结果会保留在此页面中，直到下一次操作开始。" />}
    </SectionCard>
    {notice ? <ToolNotice><Text selectable style={[styles.notice, { color: colors.foreground }]}>{notice}</Text></ToolNotice> : null}
    {!androidSsh ? <ToolNotice><Text style={[styles.notice, { color: colors.warning }]}>网页预览仅支持批量状态刷新；诊断与配置备份需使用 Android APK 内的 SSH 组件。</Text></ToolNotice> : null}
  </ManagementShell>;
}

const styles = StyleSheet.create({
  selectAll: { minHeight: 32, borderWidth: 1, borderRadius: 10, justifyContent: "center", paddingHorizontal: 11 }, selectAllText: { fontSize: 12, fontWeight: "800" }, profile: { minHeight: 70, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 }, check: { width: 24, height: 24, borderWidth: 1.5, borderRadius: 8, alignItems: "center", justifyContent: "center" }, checkText: { color: "#fff", fontWeight: "900" }, profileCopy: { flex: 1, minWidth: 0, gap: 3 }, profileName: { fontSize: 15, fontWeight: "800" }, caption: { fontSize: 12, lineHeight: 18 }, operations: { padding: 15, gap: 10 }, operation: { borderWidth: 1, borderRadius: 13, padding: 13, gap: 4 }, operationTitle: { fontSize: 14, fontWeight: "800" }, result: { minHeight: 76, padding: 15, flexDirection: "row", alignItems: "center", gap: 10 }, resultActions: { gap: 8, alignItems: "flex-end" }, share: { minHeight: 30, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, justifyContent: "center" }, shareText: { fontSize: 11, fontWeight: "800" }, notice: { fontSize: 13, lineHeight: 20 }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.46 },
});
