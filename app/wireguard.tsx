import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import QRCode from "react-native-qrcode-svg";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import {
  buildWireGuardClientConfig,
  buildWireGuardKeypairCommand,
  buildWireGuardPeerAddCommand,
  buildWireGuardPeerDeleteCommand,
  buildWireGuardSnapshotCommand,
  buildWireGuardToggleCommand,
  formatHandshakeAge,
  parseWireGuardKeypair,
  parseWireGuardSnapshot,
  type WireGuardPeerStatus,
  type WireGuardSnapshot,
} from "@/lib/openwrt-wireguard";
import { formatBytes } from "@/lib/openwrt-client";

export default function WireGuardScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [snapshot, setSnapshot] = useState<WireGuardSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<string | null>(null);
  /** 生成客户端配置的流程:{ 接口, 路由器上生成的密钥对 }。 */
  const [configFlow, setConfigFlow] = useState<{ target: string; keypair: { publicKey: string; privateKey: string } } | null>(null);

  const refresh = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    setNotice(null);
    try {
      const output = await execute(buildWireGuardSnapshotCommand());
      setSnapshot(parseWireGuardSnapshot(output));
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "无法读取 WireGuard 状态。");
    }
  }, [execute, hasRouter, isSupported]);

  useEffect(() => { void refresh(); }, [refresh]);

  const runAction = useCallback(async (command: string, message: string) => {
    setNotice(null);
    try {
      await execute(command);
      setNotice(message);
      await refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "操作失败。");
    }
  }, [execute, refresh]);

  const disabled = isRunning || !hasRouter || !isSupported;

  return <ManagementShell title="WireGuard" description="查看接口与 Peer 的握手、流量状态,受控地增删 Peer 并生成官方客户端配置。所有写入均通过应用内 SSH 在路由器本机执行。">
    <SectionCard title="接口状态" action={<Pressable disabled={disabled} onPress={() => void refresh()} style={[styles.refresh, { borderColor: colors.border }, disabled && styles.disabled]}><Text style={[styles.refreshText, { color: colors.primary }]}>{isRunning ? "读取中" : "刷新"}</Text></Pressable>}>
      {snapshot && !snapshot.available ? <Text style={[styles.notice, { color: colors.warning }]}>路由器未安装 wg 工具,请先安装 wireguard-tools 并创建 proto 为 wireguard 的接口。</Text> : null}
      {snapshot?.interfaces.length ? snapshot.interfaces.map((iface) => <InterfaceCard key={iface.uciSection ?? iface.name} iface={iface} disabled={disabled}
        onToggle={(enabled) => iface.uciSection && void runAction(buildWireGuardToggleCommand(iface.uciSection, enabled), `已${enabled ? "启动" : "停止"} ${iface.name}。`)}
        onAddPeer={() => iface.uciSection && setAddTarget(iface.uciSection)}
        onDeletePeer={(peer) => iface.uciSection && peer.uciSection && void runAction(buildWireGuardPeerDeleteCommand(iface.uciSection, peer.uciSection), "Peer 已删除。")}
        onGenerateClient={() => iface.uciSection && void (async () => {
          setNotice(null);
          try {
            const output = await execute(buildWireGuardKeypairCommand());
            const keypair = parseWireGuardKeypair(output);
            if (!keypair) throw new Error("未能生成密钥对,请确认路由器已安装 wg 工具。");
            setConfigFlow({ target: iface.uciSection!, keypair });
          } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : "生成密钥对失败。");
          }
        })()}
      />) : <EmptyState icon="vpn-key" title="未发现 WireGuard 接口" description="请先在路由器上创建 proto 为 wireguard 的接口;此处会同时展示运行状态与 UCI 配置。" />}
    </SectionCard>
    {isRunning ? <ToolNotice><View style={styles.running}><ActivityIndicator color={colors.primary} /><Text style={[styles.caption, { color: colors.muted }]}>正在通过应用内 SSH 执行…</Text></View></ToolNotice> : null}
    {error || notice ? <ToolNotice><Text selectable style={[styles.notice, { color: error ? colors.error : colors.foreground }]}>{error ?? notice}</Text></ToolNotice> : null}
    {!isSupported ? <ToolNotice><Text style={[styles.notice, { color: colors.warning }]}>此功能需要安装包含应用内 SSH 的 Android APK。</Text></ToolNotice> : null}

    {addTarget ? <AddPeerDialog target={addTarget} onClose={() => setAddTarget(null)} /> : null}
    {configFlow ? <ClientConfigDialog target={configFlow.target} keypair={configFlow.keypair} onClose={() => setConfigFlow(null)} /> : null}
  </ManagementShell>;
}

function InterfaceCard(props: {
  iface: WireGuardSnapshot["interfaces"][number];
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
  onAddPeer: () => void;
  onDeletePeer: (peer: WireGuardPeerStatus) => void;
  onGenerateClient: () => void;
}) {
  const { iface } = props;
  const colors = useColors();
  return <View style={[styles.ifaceCard, { borderColor: colors.border }]}>
    <View style={styles.ifaceHeader}>
      <MaterialIcons name="vpn-key" size={20} color={colors.primary} />
      <Text style={[styles.ifaceName, { color: colors.foreground }]}>{iface.name}</Text>
      <StatusPill label={iface.listenPort ? `端口 ${iface.listenPort}` : "未运行"} tone={iface.listenPort ? "success" : "normal"} />
    </View>
    {iface.addresses ? <Text style={[styles.detail, { color: colors.muted }]}>隧道地址:{iface.addresses}</Text> : null}
    {iface.peers.length ? iface.peers.map((peer) => <View key={peer.publicKey} style={styles.peer}>
      <View style={styles.peerCopy}>
        <Text style={[styles.peerName, { color: colors.foreground }]}>{peer.description ?? peer.publicKey.slice(0, 16) + "…"}</Text>
        <Text style={[styles.detail, { color: colors.muted }]}>
          {peer.endpoint ?? "无端点"} · {peer.allowedIps.join(", ") || "无允许 IP"}
        </Text>
        <Text style={[styles.detail, { color: colors.muted }]}>
          握手 {formatHandshakeAge(peer.latestHandshakeSeconds)} · ↓ {formatBytes(peer.rxBytes)} · ↑ {formatBytes(peer.txBytes)}
        </Text>
      </View>
      {peer.uciSection ? <Pressable onPress={() => props.onDeletePeer(peer)} hitSlop={8}><MaterialIcons name="delete-outline" size={19} color={colors.error} /></Pressable> : null}
    </View>) : <Text style={[styles.detail, { color: colors.muted }]}>暂无 Peer。</Text>}
    {iface.uciSection ? <View style={styles.ifaceActions}>
      <Pressable style={[styles.action, { borderColor: colors.border }]} disabled={props.disabled} onPress={() => props.onToggle(!iface.listenPort)}>
        <Text style={[styles.actionText, { color: colors.primary }]}>{iface.listenPort ? "停止" : "启动"}</Text>
      </Pressable>
      <Pressable style={[styles.action, { borderColor: colors.border }]} disabled={props.disabled} onPress={props.onAddPeer}>
        <Text style={[styles.actionText, { color: colors.primary }]}>添加 Peer</Text>
      </Pressable>
      <Pressable style={[styles.action, { borderColor: colors.border }]} disabled={props.disabled} onPress={props.onGenerateClient}>
        <Text style={[styles.actionText, { color: colors.primary }]}>生成客户端配置</Text>
      </Pressable>
    </View> : <Text style={[styles.detail, { color: colors.muted }]}>未找到对应的 UCI 配置段,无法进行受控修改。</Text>}
  </View>;
}

function AddPeerDialog(props: { target: string; onClose: () => void }) {
  const { execute } = useManagedSsh();
  const colors = useColors();
  const [description, setDescription] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [allowedIps, setAllowedIps] = useState("");
  const [endpointHost, setEndpointHost] = useState("");
  const [endpointPort, setEndpointPort] = useState("");
  const [keepalive, setKeepalive] = useState("25");
  const [keypair, setKeypair] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await execute(buildWireGuardPeerAddCommand(props.target, {
        description, publicKey, allowedIps, endpointHost, endpointPort, persistentKeepalive: keepalive,
      }));
      props.onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }, [description, endpointHost, endpointPort, execute, allowedIps, keepalive, props, publicKey]);

  return <Modal transparent animationType="fade" onRequestClose={props.onClose}>
    <View style={styles.modalBackdrop}>
      <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.modalTitle, { color: colors.foreground }]}>添加 Peer({props.target})</Text>
        <ScrollView style={{ maxHeight: 380 }}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>备注</Text>
          <TextInput value={description} onChangeText={setDescription} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholderTextColor={colors.muted} placeholder="例如:客厅电视" />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>客户端公钥(Base64)</Text>
          <TextInput value={publicKey} onChangeText={setPublicKey} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholderTextColor={colors.muted} />
          <Pressable onPress={async () => {
            setSaving(true);
            setError(null);
            try {
              const output = await execute(buildWireGuardKeypairCommand());
              const generated = parseWireGuardKeypair(output);
              if (!generated) throw new Error("未能生成密钥对。");
              setPublicKey(generated.publicKey);
              setKeypair(generated);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "生成失败。");
            } finally {
              setSaving(false);
            }
          }} style={[styles.generate, { borderColor: colors.border }]} disabled={saving}>
            <Text style={[styles.actionText, { color: colors.primary }]}>{saving ? "生成中…" : "在路由器生成密钥对"}</Text>
          </Pressable>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>允许的 IP 段(逗号分隔 CIDR)</Text>
          <TextInput value={allowedIps} onChangeText={setAllowedIps} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholderTextColor={colors.muted} placeholder="10.0.0.2/32" />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>端点(可选)</Text>
          <View style={styles.endpointRow}>
            <TextInput value={endpointHost} onChangeText={setEndpointHost} autoCapitalize="none" autoCorrect={false} style={[styles.input, styles.endpointHost, { color: colors.foreground, borderColor: colors.border }]} placeholderTextColor={colors.muted} placeholder="host" />
            <TextInput value={endpointPort} onChangeText={setEndpointPort} style={[styles.input, styles.endpointPort, { color: colors.foreground, borderColor: colors.border }]} placeholderTextColor={colors.muted} placeholder="51820" keyboardType="number-pad" />
          </View>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>持续 Keepalive(秒,0 为不启用)</Text>
          <TextInput value={keepalive} onChangeText={setKeepalive} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} keyboardType="number-pad" />
          {keypair ? <Text style={[styles.configPreview, { color: colors.primary }]}>已生成客户端密钥对:保存 Peer 后请使用"生成客户端配置"导出客户端配置文件(私钥:{keypair.privateKey.slice(0, 8)}…)。</Text> : null}
          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
        </ScrollView>
        <View style={styles.modalActions}>
          <Pressable onPress={props.onClose} style={styles.modalButton}><Text style={{ color: colors.muted }}>取消</Text></Pressable>
          <Pressable onPress={() => void submit()} disabled={saving || !publicKey || !allowedIps} style={[styles.modalButton, { backgroundColor: colors.primary }, (!publicKey || !allowedIps) && styles.disabled]}>
            <Text style={styles.primaryButtonText}>{saving ? "保存中…" : "保存"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

function ClientConfigDialog(props: {
  target: string;
  keypair: { publicKey: string; privateKey: string };
  onClose: () => void;
}) {
  const colors = useColors();
  const [address, setAddress] = useState("");
  const [serverKey, setServerKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [dns, setDns] = useState("10.0.0.1");
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<string | null>(null);

  const generate = useCallback(() => {
    setError(null);
    try {
      setConfig(buildWireGuardClientConfig({
        clientPrivateKey: props.keypair.privateKey,
        clientAddress: address,
        serverPublicKey: serverKey,
        endpoint,
        dns: dns || undefined,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "生成失败。");
    }
  }, [address, dns, endpoint, props.keypair.privateKey, serverKey]);

  return <Modal transparent animationType="fade" onRequestClose={props.onClose}>
    <View style={styles.modalBackdrop}>
      <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.modalTitle, { color: colors.foreground }]}>生成客户端配置({props.target})</Text>
        <ScrollView style={{ maxHeight: 420 }}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>客户端隧道地址</Text>
          <TextInput value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholder="10.0.0.2/32" placeholderTextColor={colors.muted} />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>服务端公钥(即刚生成的公钥)</Text>
          <TextInput value={serverKey} onChangeText={setServerKey} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholderTextColor={colors.muted} />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>端点(host:port)</Text>
          <TextInput value={endpoint} onChangeText={setEndpoint} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholder="vpn.example.com:51820" placeholderTextColor={colors.muted} />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>DNS(可选)</Text>
          <TextInput value={dns} onChangeText={setDns} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
          <Pressable onPress={generate} style={[styles.generate, { backgroundColor: colors.primary }]}><Text style={styles.primaryButtonText}>生成配置</Text></Pressable>
          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          {config ? <>
            <Text selectable style={[styles.configPreview, { color: colors.foreground }]}>{config}</Text>
            <View style={styles.qrWrap}><QRCode value={config} size={210} /></View>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>使用 WireGuard 官方客户端扫码导入;客户端私钥在路由器上生成,请妥善保存。</Text>
          </> : null}
        </ScrollView>
        <View style={styles.modalActions}>
          <Pressable onPress={props.onClose} style={styles.modalButton}><Text style={{ color: colors.muted }}>关闭</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  refresh: { minHeight: 32, borderWidth: 1, borderRadius: 10, justifyContent: "center", paddingHorizontal: 11 }, refreshText: { fontSize: 12, fontWeight: "800" },
  ifaceCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  ifaceHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  ifaceName: { fontSize: 16, fontWeight: "800", flex: 1 },
  detail: { fontSize: 12, lineHeight: 17 },
  peer: { paddingTop: 10, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  peerCopy: { flex: 1, minWidth: 0, gap: 3 },
  peerName: { fontSize: 14, fontWeight: "800" },
  ifaceActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  action: { minHeight: 30, borderWidth: 1, borderRadius: 9, justifyContent: "center", paddingHorizontal: 10 },
  actionText: { fontSize: 12, fontWeight: "800" },
  running: { flexDirection: "row", alignItems: "center", gap: 10 },
  caption: { fontSize: 12, lineHeight: 18 },
  notice: { fontSize: 13, lineHeight: 19 },
  disabled: { opacity: 0.46 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(4,10,17,0.55)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 430, borderRadius: 18, padding: 16, maxHeight: "88%" },
  modalTitle: { fontSize: 16, fontWeight: "900", marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: "800", marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, minHeight: 38, fontSize: 13 },
  generate: { minHeight: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 8, paddingHorizontal: 10 },
  endpointRow: { flexDirection: "row", gap: 8 },
  endpointHost: { flex: 1 },
  endpointPort: { width: 90 },
  configPreview: { fontSize: 11, fontFamily: "monospace", lineHeight: 16, marginTop: 8 },
  qrWrap: { alignItems: "center", padding: 12 },
  error: { fontSize: 12, marginTop: 8, lineHeight: 17 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  modalButton: { minHeight: 38, justifyContent: "center", alignItems: "center", paddingHorizontal: 14, borderRadius: 10 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "800" },
});
