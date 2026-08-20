import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AppDialog as Alert } from "@/components/app-dialog";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { buildDockerContainerCommand, buildDockerContainerLogsCommand, buildDockerSnapshotCommand, parseDockerSnapshot, type DockerContainer } from "@/lib/openwrt-admin";
import { useManagedSsh } from "@/hooks/use-managed-ssh";

type DockerAction = "start" | "stop" | "restart";

export default function DockerScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    setIsLoading(true);
    setNotice(null);
    try {
      const snapshot = parseDockerSnapshot(await execute(buildDockerSnapshotCommand()));
      setAvailable(snapshot.available);
      setContainers(snapshot.containers);
      if (snapshot.available && !snapshot.containers.length) setNotice("Docker 已安装，但当前没有容器。此页面不会自动安装 Docker。 ");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "无法读取 Docker 状态。");
    } finally {
      setIsLoading(false);
    }
  }, [execute, hasRouter, isSupported]);

  useEffect(() => { void refresh(); }, [refresh]);

  const disabled = isRunning || isLoading || !hasRouter || !isSupported;
  function confirmAction(container: DockerContainer, action: DockerAction) {
    const label = action === "start" ? "启动" : action === "stop" ? "停止" : "重启";
    Alert.alert(`${label}容器`, `${label}「${container.name}」会影响该容器提供的服务。是否继续？`, [
      { text: "取消", style: "cancel" },
      { text: label, style: action === "stop" ? "destructive" : "default", onPress: () => void (async () => {
        try {
          const nextOutput = await execute(buildDockerContainerCommand(container.id, action));
          setOutput(`${label} ${container.name}\n${nextOutput.trim() || "命令已提交。"}`);
          await refresh();
        } catch {}
      })() },
    ]);
  }
  async function readLogs(container: DockerContainer) {
    try { setOutput(`日志：${container.name}\n\n${await execute(buildDockerContainerLogsCommand(container.id))}`); } catch {}
  }

  return <ManagementShell title="Docker 容器" description="查看 Docker 容器、即时 CPU/内存占用与最近日志；启停操作需二次确认并仅在路由器本机执行。">
    <SectionCard title="容器概览" action={<Pressable disabled={disabled} onPress={() => void refresh()} style={({ pressed }) => [styles.refresh, { borderColor: colors.border }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.refreshText, { color: colors.primary }]}>{isLoading ? "读取中" : "刷新"}</Text></Pressable>}>
      {available === false ? <EmptyState icon="dns" title="未检测到 Docker" description="未找到 docker 命令。请先在路由器的软件包管理中安装并启动 Docker；应用不会自动安装服务。" /> : containers.length ? containers.map((container, index) => <View key={container.id} style={[styles.containerRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
        <View style={styles.containerHeader}><View style={[styles.containerIcon, { backgroundColor: container.running ? `${colors.success}18` : `${colors.muted}18` }]}><MaterialIcons name="view-in-ar" size={20} color={container.running ? colors.success : colors.muted} /></View><View style={styles.copy}><View style={styles.titleLine}><Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{container.name}</Text><StatusPill label={container.running ? "运行中" : "已停止"} tone={container.running ? "success" : "normal"} /></View><Text numberOfLines={1} style={[styles.detail, { color: colors.muted }]}>{container.image}</Text><Text numberOfLines={1} style={[styles.detail, { color: colors.muted }]}>{container.ports || "未暴露端口"}</Text></View></View>
        <View style={styles.metrics}><Text style={[styles.metric, { color: colors.muted }]}>CPU <Text style={{ color: colors.foreground, fontWeight: "800" }}>{container.cpuPercent ?? "—"}</Text></Text><Text style={[styles.metric, { color: colors.muted }]}>内存 <Text style={{ color: colors.foreground, fontWeight: "800" }}>{container.memoryUsage ?? "—"}</Text></Text></View>
        <View style={styles.actions}><Pressable disabled={disabled} onPress={() => void readLogs(container)} style={({ pressed }) => [styles.action, { borderColor: colors.border }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.actionText, { color: colors.foreground }]}>日志</Text></Pressable>{container.running ? <><Pressable disabled={disabled} onPress={() => confirmAction(container, "restart")} style={({ pressed }) => [styles.action, { borderColor: colors.primary }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.actionText, { color: colors.primary }]}>重启</Text></Pressable><Pressable disabled={disabled} onPress={() => confirmAction(container, "stop")} style={({ pressed }) => [styles.action, { borderColor: colors.warning }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.actionText, { color: colors.warning }]}>停止</Text></Pressable></> : <Pressable disabled={disabled} onPress={() => confirmAction(container, "start")} style={({ pressed }) => [styles.action, { borderColor: colors.primary }, pressed && styles.pressed, disabled && styles.disabled]}><Text style={[styles.actionText, { color: colors.primary }]}>启动</Text></Pressable>}</View>
      </View>) : available === null ? <EmptyState icon="dns" title="尚未读取 Docker 状态" description="连接应用内 SSH 后会自动检测 Docker。" /> : <EmptyState icon="view-in-ar" title="当前没有容器" description="Docker 已安装，但未返回容器记录。" />}
    </SectionCard>
    {isRunning ? <ToolNotice><View style={styles.running}><ActivityIndicator color={colors.primary} /><Text style={[styles.notice, { color: colors.muted }]}>正在与 Docker 通信…</Text></View></ToolNotice> : null}
    {error || notice ? <ToolNotice><Text selectable style={[styles.notice, { color: error ? colors.error : colors.foreground }]}>{error ?? notice}</Text></ToolNotice> : null}
    {output ? <SectionCard title="命令输出"><View style={[styles.output, { backgroundColor: colors.background }]}><Text selectable style={[styles.outputText, { color: colors.foreground }]}>{output.trim()}</Text></View></SectionCard> : null}
    {!isSupported ? <ToolNotice><Text style={[styles.notice, { color: colors.warning }]}>此功能需要安装包含应用内 SSH 的 Android APK；网页预览仅可查看页面布局。</Text></ToolNotice> : null}
  </ManagementShell>;
}

const styles = StyleSheet.create({
  refresh: { minHeight: 32, borderWidth: 1, borderRadius: 10, justifyContent: "center", paddingHorizontal: 11 }, refreshText: { fontSize: 12, fontWeight: "800" }, containerRow: { padding: 14, gap: 11 }, containerHeader: { flexDirection: "row", gap: 10 }, containerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }, copy: { flex: 1, minWidth: 0, gap: 3 }, titleLine: { flexDirection: "row", alignItems: "center", gap: 7 }, name: { flex: 1, fontSize: 15, fontWeight: "800" }, detail: { fontSize: 11, lineHeight: 16 }, metrics: { flexDirection: "row", gap: 14 }, metric: { fontSize: 12 }, actions: { flexDirection: "row", gap: 8 }, action: { flex: 1, minHeight: 36, borderWidth: 1, borderRadius: 9, justifyContent: "center", alignItems: "center" }, actionText: { fontSize: 12, fontWeight: "800" }, running: { flexDirection: "row", gap: 10, alignItems: "center" }, notice: { fontSize: 13, lineHeight: 19 }, output: { margin: 14, padding: 12, borderRadius: 12 }, outputText: { fontFamily: "monospace", fontSize: 12, lineHeight: 18 }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.46 },
});
