import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import { BACKUP_REMOTE_PATH, buildBackupCommand, buildRestoreCommand, buildServiceCommand, buildServiceSnapshotCommand, parseServiceStates, type ServiceState } from "@/lib/openwrt-admin";
import { downloadInAppSshFile, uploadInAppSshFile } from "@/lib/native-ssh";

export default function MaintenanceToolsScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [services, setServices] = useState<ServiceState[]>([]);
  const [output, setOutput] = useState<string | null>(null);
  const [loadingServices, setLoadingServices] = useState(false);

  const refreshServices = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    setLoadingServices(true);
    try {
      const next = parseServiceStates(await execute(buildServiceSnapshotCommand()));
      setServices(next);
    } finally {
      setLoadingServices(false);
    }
  }, [execute, hasRouter, isSupported]);

  useEffect(() => { void refreshServices(); }, [refreshServices]);

  async function exportBackup() {
    try {
      setOutput("正在由路由器生成配置备份…");
      await execute(buildBackupCommand());
      const localPath = `${FileSystem.cacheDirectory}openwrt-config-backup-${Date.now()}.tar.gz`;
      await downloadInAppSshFile(BACKUP_REMOTE_PATH, localPath);
      if (!(await Sharing.isAvailableAsync())) throw new Error("此设备无法打开系统分享面板。");
      await Sharing.shareAsync(localPath, { mimeType: "application/gzip", dialogTitle: "导出 OpenWrt 配置备份" });
      setOutput("配置备份已生成，并已交给系统分享面板保存或发送。");
    } catch (reason) {
      setOutput(reason instanceof Error ? reason.message : "配置备份导出失败。");
    }
  }

  async function chooseBackupForRestore() {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/gzip", "application/x-gzip", "application/octet-stream"], copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!/\.(tar\.gz|tgz)$/i.test(asset.name)) {
      Alert.alert("文件格式不支持", "请选择由 OpenWrt sysupgrade 生成的 .tar.gz 或 .tgz 配置备份。");
      return;
    }
    Alert.alert("恢复路由器配置", `将上传“${asset.name}”并恢复配置。路由器随后会重启，当前连接会中断。`, [
      { text: "取消", style: "cancel" },
      { text: "上传并恢复", style: "destructive", onPress: () => void restoreBackup(asset.uri, asset.name) },
    ]);
  }

  async function restoreBackup(uri: string, name: string) {
    try {
      setOutput(`正在上传 ${name}…`);
      await execute("true");
      await uploadInAppSshFile(uri, BACKUP_REMOTE_PATH);
      const result = await execute(buildRestoreCommand());
      setOutput(`${result.trim() || "已提交配置恢复命令。"}\n路由器正在恢复并重启，请等待重新上线。`);
    } catch (reason) {
      setOutput(reason instanceof Error ? reason.message : "配置恢复失败。");
    }
  }

  function confirmServiceAction(service: ServiceState, action: "start" | "stop" | "restart") {
    const verb = action === "start" ? "启动" : action === "stop" ? "停止" : "重启";
    Alert.alert(`${verb}服务`, `确认${verb} ${service.name}？`, [
      { text: "取消", style: "cancel" },
      { text: verb, style: action === "stop" ? "destructive" : "default", onPress: () => void (async () => {
        try {
          setOutput(await execute(buildServiceCommand(service.name, action, service.managedBy)));
          await refreshServices();
        } catch {}
      })() },
    ]);
  }

  const disabled = isRunning || !hasRouter || !isSupported;
  return <ManagementShell title="备份与服务" description="在路由器本地执行备份、恢复和服务控制；不会上传配置到第三方服务。">
    <SectionCard title="配置备份"><View style={styles.sectionBody}><Text style={[styles.caption, { color: colors.muted }]}>导出使用 OpenWrt 原生 sysupgrade 配置归档；恢复仅接受该格式的备份文件。</Text><View style={styles.actions}><Pressable disabled={disabled} onPress={() => void exportBackup()} style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.primary }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={styles.primaryText}>导出配置备份</Text></Pressable><Pressable disabled={disabled} onPress={() => void chooseBackupForRestore()} style={({ pressed }) => [styles.secondaryAction, { borderColor: colors.warning }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.secondaryText, { color: colors.warning }]}>导入并恢复</Text></Pressable></View></View></SectionCard>
    <SectionCard title="路由器服务"><View style={styles.sectionHeader}><Text style={[styles.caption, { color: colors.muted }]}>可管理 OpenWrt 核心服务；若检测到 Docker，也会列出容器。</Text><Pressable accessibilityLabel="刷新服务" disabled={disabled || loadingServices} onPress={() => void refreshServices()} style={({ pressed }) => [styles.refresh, { borderColor: colors.border }, pressed && styles.pressed, (disabled || loadingServices) && styles.disabled]}><Text style={[styles.refreshText, { color: colors.primary }]}>{loadingServices ? "读取中" : "刷新"}</Text></Pressable></View>{services.length ? services.map((service, index) => <View key={`${service.managedBy}-${service.name}`} style={[styles.serviceRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}><View style={styles.serviceInfo}><View style={styles.serviceTitle}><Text style={[styles.serviceName, { color: colors.foreground }]}>{service.name}</Text><StatusPill label={service.running ? "运行中" : "已停止"} tone={service.running ? "success" : "normal"} /></View><Text style={[styles.serviceDetail, { color: colors.muted }]}>{service.managedBy === "docker" ? `Docker · ${service.detail ?? ""}` : "OpenWrt 系统服务"}</Text></View><View style={styles.serviceActions}>{service.running ? <Pressable disabled={disabled} onPress={() => confirmServiceAction(service, "stop")} style={({ pressed }) => [styles.smallAction, { borderColor: colors.warning }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.smallText, { color: colors.warning }]}>停止</Text></Pressable> : <Pressable disabled={disabled} onPress={() => confirmServiceAction(service, "start")} style={({ pressed }) => [styles.smallAction, { borderColor: colors.success }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.smallText, { color: colors.success }]}>启动</Text></Pressable>}<Pressable disabled={disabled} onPress={() => confirmServiceAction(service, "restart")} style={({ pressed }) => [styles.smallAction, { borderColor: colors.primary }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.smallText, { color: colors.primary }]}>重启</Text></Pressable></View></View>) : !loadingServices ? <EmptyState icon="dns" title="尚未读取服务" description="连接 Android 应用内 SSH 后点击刷新即可读取服务与 Docker 容器。" /> : null}</SectionCard>
    {isRunning ? <ToolNotice><View style={styles.running}><ActivityIndicator color={colors.primary} /><Text style={[styles.caption, { color: colors.muted }]}>正在与路由器通信…</Text></View></ToolNotice> : null}
    {error ? <ToolNotice><Text style={[styles.error, { color: colors.error }]}>{error}</Text></ToolNotice> : null}
    {output ? <SectionCard title="操作结果"><View style={[styles.output, { backgroundColor: colors.background }]}><Text selectable style={[styles.outputText, { color: colors.foreground }]}>{output}</Text></View></SectionCard> : null}
    <ToolNotice><Text style={[styles.caption, { color: colors.muted }]}>恢复配置与停止网络相关服务可能让当前连接暂时断开；每项破坏性操作都会先要求确认。</Text></ToolNotice>
  </ManagementShell>;
}

const styles = StyleSheet.create({
  sectionBody: { padding: 15, gap: 12 }, caption: { fontSize: 13, lineHeight: 19 }, actions: { flexDirection: "row", gap: 10 }, primaryAction: { minHeight: 44, paddingHorizontal: 15, borderRadius: 11, alignItems: "center", justifyContent: "center", flex: 1 }, primaryText: { color: "#fff", fontSize: 13, fontWeight: "800" }, secondaryAction: { minHeight: 44, paddingHorizontal: 15, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, flex: 1 }, secondaryText: { fontSize: 13, fontWeight: "800" }, sectionHeader: { padding: 15, gap: 10 }, refresh: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 34, justifyContent: "center" }, refreshText: { fontSize: 12, fontWeight: "800" }, serviceRow: { padding: 15, gap: 10 }, serviceInfo: { gap: 3 }, serviceTitle: { flexDirection: "row", alignItems: "center", gap: 8 }, serviceName: { fontSize: 15, fontWeight: "800" }, serviceDetail: { fontSize: 12 }, serviceActions: { flexDirection: "row", gap: 8 }, smallAction: { flex: 1, borderWidth: 1, borderRadius: 9, minHeight: 36, alignItems: "center", justifyContent: "center" }, smallText: { fontSize: 12, fontWeight: "800" }, running: { flexDirection: "row", alignItems: "center", gap: 10 }, output: { margin: 14, padding: 12, borderRadius: 12 }, outputText: { fontFamily: "monospace", fontSize: 12, lineHeight: 18 }, error: { fontSize: 13, lineHeight: 19 }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.46 },
});
