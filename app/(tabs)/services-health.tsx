import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, MetricTile, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import { buildHealthSnapshotCommand, buildProxyServiceActionCommand, buildProxyServiceSnapshotCommand, buildRouterHealthReportMarkdown, parseHealthSnapshot, parseProxyServiceStates, type ManagedAction, type ProxyServiceState, type RouterHealthSnapshot } from "@/lib/openwrt-advanced-admin";
import { formatBytes, memoryUsagePercent } from "@/lib/openwrt-client";
import { useRouterStore } from "@/lib/router-provider";

function serviceTone(service: ProxyServiceState) {
  if (!service.installed) return "normal" as const;
  return service.running ? "success" as const : "warning" as const;
}

export default function ServicesHealthScreen() {
  const colors = useColors();
  const { selectedProfile, selectedStatus } = useRouterStore();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [services, setServices] = useState<ProxyServiceState[]>([]);
  const [health, setHealth] = useState<RouterHealthSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    setIsLoading(true);
    setNotice(null);
    try {
      const serviceOutput = await execute(buildProxyServiceSnapshotCommand());
      setServices(parseProxyServiceStates(serviceOutput));
      const healthOutput = await execute(buildHealthSnapshotCommand());
      setHealth(parseHealthSnapshot(healthOutput));
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "无法读取服务与健康状态。");
    } finally {
      setIsLoading(false);
    }
  }, [execute, hasRouter, isSupported]);

  useEffect(() => { void refresh(); }, [refresh]);

  const memoryPercent = memoryUsagePercent(selectedStatus?.system ?? null);
  const temperature = useMemo(() => health?.temperaturesC.length ? `${Math.max(...health.temperaturesC).toFixed(1)} °C` : "未报告", [health]);
  const disk = health?.disks[0] ?? null;
  const disabled = !hasRouter || !isSupported || isRunning || isLoading;

  function confirmServiceAction(service: ProxyServiceState, action: ManagedAction) {
    const verb = action === "restart" ? "重启" : action === "start" ? "启动" : "停止";
    if (!service.installed) {
      Alert.alert("服务未安装", `${service.label} 未检测到对应的 OpenWrt 服务脚本。`);
      return;
    }
    Alert.alert(`${verb} ${service.label}`, `${verb} 会短暂影响代理或 DNS 服务。是否继续？`, [
      { text: "取消", style: "cancel" },
      { text: verb, style: action === "stop" ? "destructive" : "default", onPress: () => void (async () => {
        try {
          const output = await execute(buildProxyServiceActionCommand(service.id, action));
          setNotice(output.trim() || `${service.label} 已提交${verb}命令。`);
          await refresh();
        } catch {}
      })() },
    ]);
  }

  async function exportReport() {
    if (!selectedProfile) return;
    try {
      const content = buildRouterHealthReportMarkdown(selectedProfile, selectedStatus, health, services);
      const target = `${FileSystem.cacheDirectory}openwrt-health-${Date.now()}.md`;
      await FileSystem.writeAsStringAsync(target, content, { encoding: FileSystem.EncodingType.UTF8 });
      if (!(await Sharing.isAvailableAsync())) throw new Error("此设备无法打开系统分享面板。");
      await Sharing.shareAsync(target, { mimeType: "text/markdown", dialogTitle: "导出路由器健康报告" });
      setNotice("健康报告已生成，可在系统分享面板中保存或发送。");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "健康报告导出失败。");
    }
  }

  return <ManagementShell title="代理与健康" description="读取 OpenClash、AdGuard Home 与路由器资源状态；服务控制仅通过应用内 SSH 在本机执行。">
    <SectionCard title="OpenClash 与 AdGuard Home" action={<Pressable disabled={disabled} onPress={() => void refresh()} style={({ pressed }) => [styles.refresh, { borderColor: colors.border }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.refreshText, { color: colors.primary }]}>{isLoading ? "读取中" : "刷新"}</Text></Pressable>}>
      {services.length ? services.map((service, index) => <View key={service.id} style={[styles.serviceRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
        <View style={styles.serviceInfo}><View style={styles.serviceTitle}><Text style={[styles.serviceName, { color: colors.foreground }]}>{service.label}</Text><StatusPill label={!service.installed ? "未安装" : service.running ? "运行中" : "已停止"} tone={serviceTone(service)} /></View><Text style={[styles.caption, { color: colors.muted }]}>{service.installed ? `服务脚本：${service.initName}` : "未发现服务脚本；不会尝试安装或修改配置。"}</Text></View>
        <View style={styles.serviceActions}><Pressable disabled={disabled || !service.installed} onPress={() => confirmServiceAction(service, service.running ? "restart" : "start")} style={({ pressed }) => [styles.smallAction, { borderColor: colors.primary }, pressed && styles.pressed, (disabled || !service.installed) && styles.disabled]}><Text style={[styles.smallText, { color: colors.primary }]}>{service.running ? "重启" : "启动"}</Text></Pressable>{service.running ? <Pressable disabled={disabled} onPress={() => confirmServiceAction(service, "stop")} style={({ pressed }) => [styles.smallAction, { borderColor: colors.warning }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.smallText, { color: colors.warning }]}>停止</Text></Pressable> : null}</View>
      </View>) : <EmptyState icon="dns" title="尚未读取代理服务" description="连接 Android 应用内 SSH 后即可检测 OpenClash 与 AdGuard Home。" />}
    </SectionCard>

    <SectionCard title="路由器健康报告" action={<Pressable disabled={!selectedProfile} onPress={() => void exportReport()} style={({ pressed }) => [styles.refresh, { borderColor: colors.border }, pressed && styles.pressed, !selectedProfile && styles.disabled]}><Text style={[styles.refreshText, { color: colors.primary }]}>导出</Text></Pressable>}>
      <View style={styles.metrics}><MetricTile icon="memory" label="内存使用" value={memoryPercent === null ? "未报告" : `${memoryPercent}%`} caption={selectedStatus?.system?.memoryAvailable === null || selectedStatus?.system?.memoryAvailable === undefined ? undefined : `可用 ${formatBytes(selectedStatus.system.memoryAvailable)}`} tone={memoryPercent !== null && memoryPercent >= 90 ? "danger" : memoryPercent !== null && memoryPercent >= 75 ? "warning" : "success"} /><MetricTile icon="storage" label="存储（根/Overlay）" value={disk?.usePercent === null || disk?.usePercent === undefined ? "未报告" : `${disk.usePercent}%`} caption={disk?.availableKb === null || disk?.availableKb === undefined ? undefined : `可用 ${formatBytes(disk.availableKb * 1024)}`} tone={disk?.usePercent !== null && disk?.usePercent !== undefined && disk.usePercent >= 90 ? "danger" : "normal"} /><MetricTile icon="thermostat" label="最高温度" value={temperature} caption={health?.temperaturesC.length ? `${health.temperaturesC.length} 个传感器` : "硬件未报告"} tone={health?.temperaturesC.some((value) => value >= 85) ? "danger" : health?.temperaturesC.some((value) => value >= 70) ? "warning" : "normal"} /><MetricTile icon="speed" label="公网延迟" value={health?.ping?.averageMs === null || health?.ping?.averageMs === undefined ? "未报告" : `${health.ping.averageMs} ms`} caption={health?.ping ? `${health.ping.lossPercent ?? "—"}% 丢包 · DNS ${health.dnsReachable ? "正常" : health.dnsReachable === false ? "失败" : "未报告"}` : "采样目标 1.1.1.1"} tone={health?.ping?.lossPercent && health.ping.lossPercent > 0 ? "warning" : health?.ping ? "success" : "normal"} /></View>
      <View style={[styles.healthFooter, { borderTopColor: colors.border }]}><Text style={[styles.caption, { color: colors.muted }]}>报告会汇总当前 LuCI 状态及手动 SSH 采样的存储、温度、连通性和代理服务状态；不会后台监测。</Text><Pressable disabled={disabled} onPress={() => void refresh()} style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.primary }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={styles.primaryText}>{isLoading ? "正在采样…" : "重新采样健康状态"}</Text></Pressable></View>
    </SectionCard>
    {isRunning ? <ToolNotice><View style={styles.running}><ActivityIndicator color={colors.primary} /><Text style={[styles.caption, { color: colors.muted }]}>正在与路由器通信…</Text></View></ToolNotice> : null}
    {error || notice ? <ToolNotice><Text selectable style={[styles.notice, { color: error ? colors.error : colors.foreground }]}>{error ?? notice}</Text></ToolNotice> : null}
    {!isSupported ? <ToolNotice><Text style={[styles.notice, { color: colors.warning }]}>此功能需要安装包含应用内 SSH 的 Android APK；网页预览仅可查看页面布局。</Text></ToolNotice> : null}
  </ManagementShell>;
}

const styles = StyleSheet.create({
  refresh: { minHeight: 32, borderWidth: 1, borderRadius: 10, justifyContent: "center", paddingHorizontal: 11 }, refreshText: { fontSize: 12, fontWeight: "800" }, serviceRow: { padding: 15, gap: 11 }, serviceInfo: { gap: 5 }, serviceTitle: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }, serviceName: { fontSize: 16, fontWeight: "800" }, caption: { fontSize: 12, lineHeight: 18 }, serviceActions: { flexDirection: "row", gap: 8 }, smallAction: { flex: 1, minHeight: 36, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" }, smallText: { fontSize: 12, fontWeight: "800" }, metrics: { padding: 14, gap: 10, flexDirection: "row", flexWrap: "wrap" }, healthFooter: { borderTopWidth: StyleSheet.hairlineWidth, padding: 15, gap: 12 }, primaryAction: { minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#fff", fontSize: 13, fontWeight: "800" }, running: { flexDirection: "row", gap: 10, alignItems: "center" }, notice: { fontSize: 13, lineHeight: 19 }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.46 },
});
