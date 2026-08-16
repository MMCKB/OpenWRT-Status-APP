import { useCallback, useEffect, useState } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { buildBlockClientCommand, buildClientSnapshotCommand, buildUnblockClientCommand, parseConnectedClients, type ConnectedClient } from "@/lib/openwrt-admin";
import { useManagedSsh } from "@/hooks/use-managed-ssh";

export default function ClientsScreen() {
  const colors = useColors();
  const { execute, isRunning, error, hasRouter, isSupported } = useManagedSsh();
  const [clients, setClients] = useState<ConnectedClient[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const output = await execute(buildClientSnapshotCommand());
      setClients(parseConnectedClients(output));
    } catch {}
  }, [execute]);

  useEffect(() => { if (hasRouter && isSupported) void refresh(); }, [hasRouter, isSupported, refresh]);

  function changeBlock(client: ConnectedClient) {
    const isBlocked = blocked.has(client.mac);
    Alert.alert(isBlocked ? "解除拉黑" : "拉黑设备", `${client.hostname ?? client.mac}\n${isBlocked ? "将移除本应用创建的防火墙规则。" : "该设备将无法通过 LAN 访问路由器网络。"}`, [
      { text: "取消", style: "cancel" },
      { text: isBlocked ? "解除" : "拉黑", style: isBlocked ? "default" : "destructive", onPress: () => void (async () => {
        try {
          await execute(isBlocked ? buildUnblockClientCommand(client.mac) : buildBlockClientCommand(client.mac));
          setBlocked((current) => { const next = new Set(current); isBlocked ? next.delete(client.mac) : next.add(client.mac); return next; });
        } catch {}
      })() },
    ]);
  }

  return <ManagementShell title="已连接设备" description="设备来源于 DHCP 租约和邻居表；在线状态反映最近一次路由器查询。"><View style={styles.toolbar}><StatusPill label={`${clients.length} 台设备`} tone="normal" /><Pressable accessibilityRole="button" onPress={() => void refresh()} disabled={isRunning || !hasRouter || !isSupported} style={({ pressed }) => [styles.refresh, { backgroundColor: colors.primary }, (isRunning || !hasRouter || !isSupported) && styles.disabled, pressed && styles.pressed]}>{isRunning ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><MaterialIcons name="refresh" size={18} color="#FFFFFF" /><Text style={styles.refreshText}>刷新</Text></>}</Pressable></View>{!isSupported ? <ToolNotice><Text style={[styles.noticeText, { color: colors.muted }]}>设备扫描需要安装最新 Android APK，因为它会通过应用内 SSH 查询路由器。</Text></ToolNotice> : null}{error ? <ToolNotice><Text style={[styles.errorText, { color: colors.error }]}>{error}</Text></ToolNotice> : null}{clients.length ? <SectionCard title="LAN 客户端">{clients.map((client, index) => <View key={client.mac} style={[styles.clientRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}><View style={[styles.deviceIcon, { backgroundColor: client.online ? (colors.background === "#102A43" ? "#164B3B" : "#E8F7F1") : colors.background }]}><MaterialIcons name={client.online ? "phone-android" : "devices-other"} size={20} color={client.online ? colors.success : colors.muted} /></View><View style={styles.clientInfo}><Text style={[styles.clientTitle, { color: colors.foreground }]}>{client.hostname ?? "未命名设备"}</Text><Text style={[styles.clientSub, { color: colors.muted }]}>{client.ipv4 ?? "未取得 IP"} · {client.mac}</Text></View><Pressable accessibilityRole="button" onPress={() => changeBlock(client)} disabled={isRunning} style={({ pressed }) => [styles.blockButton, { borderColor: blocked.has(client.mac) ? colors.success : colors.border }, pressed && styles.pressed]}><Text style={[styles.blockText, { color: blocked.has(client.mac) ? colors.success : colors.foreground }]}>{blocked.has(client.mac) ? "解除" : "拉黑"}</Text></Pressable></View>)}</SectionCard> : !isRunning && hasRouter ? <EmptyState icon="devices" title="暂未读取到客户端" description="请点击刷新。部分静态 IP 设备不会出现在 DHCP 租约中。" /> : null}</ManagementShell>;
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, refresh: { minHeight: 38, paddingHorizontal: 13, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 5 }, refreshText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" }, noticeText: { fontSize: 13, lineHeight: 19 }, errorText: { fontSize: 13, lineHeight: 19 }, clientRow: { minHeight: 72, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, deviceIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, clientInfo: { flex: 1, minWidth: 0 }, clientTitle: { fontSize: 14, fontWeight: "800" }, clientSub: { fontSize: 11, marginTop: 3, fontVariant: ["tabular-nums"] }, blockButton: { minWidth: 50, paddingHorizontal: 9, minHeight: 32, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" }, blockText: { fontSize: 12, fontWeight: "800" }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.5 },
});
