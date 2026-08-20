import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ComponentProps, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppDialog as Alert } from "@/components/app-dialog";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import {
  buildDnsLatencyCommand,
  buildNatDiagnosticCommand,
  buildWanDiagnosticCommand,
  buildWanReconnectCommand,
  isWanInterface,
} from "@/lib/openwrt-admin";
import { useRouterStore } from "@/lib/router-provider";

type DiagnosticKind = "ping" | "dns" | "trace" | "port";
const actions: {
  kind: DiagnosticKind;
  label: string;
  icon: ComponentProps<typeof MaterialIcons>["name"];
}[] = [
  { kind: "ping", label: "Ping", icon: "speed" },
  { kind: "dns", label: "DNS", icon: "dns" },
  { kind: "trace", label: "路由追踪", icon: "route" },
  { kind: "port", label: "端口", icon: "settings-ethernet" },
];

export default function DiagnosticsScreen() {
  const colors = useColors();
  const { selectedStatus, settings } = useRouterStore();
  const { execute, hasRouter, isRunning, isSupported, error } = useManagedSsh();
  const wanInterfaces = useMemo(
    () => (selectedStatus?.interfaces ?? []).filter(isWanInterface),
    [selectedStatus],
  );
  const [wan, setWan] = useState("");
  const [target, setTarget] = useState("1.1.1.1");
  const [port, setPort] = useState("443");
  const [dnsHostname, setDnsHostname] = useState("openwrt.org");
  const [dnsIpv4, setDnsIpv4] = useState("1.1.1.1");
  const [dnsIpv6, setDnsIpv6] = useState("2606:4700:4700::1111");
  const [output, setOutput] = useState<string | null>(null);
  const activeWan = wan || wanInterfaces[0]?.name || "";

  function showResult(result: string) {
    if (settings.diagnosticOutputDisplay !== "dialog") setOutput(result);
    if (settings.diagnosticOutputDisplay !== "page") {
      Alert.alert("命令输出", result.trim() || "命令未返回输出。", [
        { text: "关闭", style: "cancel" },
      ]);
    }
  }

  async function run(kind: DiagnosticKind) {
    try {
      showResult(
        await execute(
          buildWanDiagnosticCommand(activeWan, kind, target, Number(port)),
        ),
      );
    } catch {}
  }
  async function runDnsLatency(family: "ipv4" | "ipv6") {
    try {
      showResult(
        await execute(
          buildDnsLatencyCommand(
            activeWan,
            family === "ipv4" ? dnsIpv4 : dnsIpv6,
            family,
            dnsHostname,
          ),
        ),
      );
    } catch {}
  }
  async function runNat() {
    try {
      showResult(await execute(buildNatDiagnosticCommand(activeWan)));
    } catch {}
  }
  function reconnect() {
    Alert.alert(
      "重连 WAN",
      `将断开并重新拨号 ${activeWan}。这会短暂中断此宽带的网络连接。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "重连",
          style: "destructive",
          onPress: () =>
            void execute(buildWanReconnectCommand(activeWan))
              .then(showResult)
              .catch(() => {}),
        },
      ],
    );
  }

  return (
    <ManagementShell
      title="网络诊断"
      description="所有诊断命令在指定接口上执行。结果来自路由器，不会上传到外部服务。"
    >
      {!wanInterfaces.length ? (
        <EmptyState
          icon="network-check"
          title="未发现可用 WAN"
          description="请先在状态页刷新并确认至少一条 WAN 已连接。"
        />
      ) : (
        <>
          <SectionCard title="选择接口">
            {wanInterfaces.map((item, index) => (
              <Pressable
                key={item.name}
                accessibilityRole="button"
                accessibilityState={{ selected: activeWan === item.name }}
                onPress={() => setWan(item.name)}
                style={({ pressed }) => [
                  styles.wanRow,
                  index > 0 && {
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  },
                  activeWan === item.name && {
                    backgroundColor: colors.background,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <View>
                  <Text style={[styles.wanName, { color: colors.foreground }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.wanDetail, { color: colors.muted }]}>
                    {item.device} · {item.ipv4?.[0] ?? "未取得 IPv4"}
                  </Text>
                </View>
                <StatusPill
                  label={item.up ? "已连接" : "离线"}
                  tone={item.up ? "success" : "danger"}
                />
              </Pressable>
            ))}
          </SectionCard>
          <SectionCard title="常规诊断">
            <View style={styles.form}>
              <Text style={[styles.label, { color: colors.muted }]}>
                域名或 IPv4
              </Text>
              <TextInput
                value={target}
                onChangeText={setTarget}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="1.1.1.1"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
              <Text style={[styles.label, { color: colors.muted }]}>
                TCP 端口（端口检查使用）
              </Text>
              <TextInput
                value={port}
                onChangeText={setPort}
                keyboardType="number-pad"
                placeholder="443"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
            </View>
            <View style={styles.actionGrid}>
              {actions.map((action) => (
                <Pressable
                  key={action.kind}
                  accessibilityRole="button"
                  disabled={isRunning || !hasRouter || !isSupported}
                  onPress={() => void run(action.kind)}
                  style={({ pressed }) => [
                    styles.action,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                    pressed && styles.pressed,
                    (isRunning || !isSupported) && styles.disabled,
                  ]}
                >
                  <MaterialIcons
                    name={action.icon}
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.actionText, { color: colors.foreground }]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SectionCard>
          <SectionCard title="DNS 延迟测试">
            <View style={styles.form}>
              <Text style={[styles.label, { color: colors.muted }]}>
                查询域名
              </Text>
              <TextInput
                value={dnsHostname}
                onChangeText={setDnsHostname}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="openwrt.org"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
              <Text style={[styles.label, { color: colors.muted }]}>
                IPv4 DNS 服务器
              </Text>
              <TextInput
                value={dnsIpv4}
                onChangeText={setDnsIpv4}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="1.1.1.1"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
              <Text style={[styles.label, { color: colors.muted }]}>
                IPv6 DNS 服务器
              </Text>
              <TextInput
                value={dnsIpv6}
                onChangeText={setDnsIpv6}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="2606:4700:4700::1111"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
            </View>
            <View style={styles.actionGrid}>
              <Pressable
                accessibilityRole="button"
                disabled={isRunning || !hasRouter || !isSupported}
                onPress={() => void runDnsLatency("ipv4")}
                style={({ pressed }) => [
                  styles.action,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                  pressed && styles.pressed,
                  (isRunning || !isSupported) && styles.disabled,
                ]}
              >
                <MaterialIcons
                  name="language"
                  size={20}
                  color={colors.primary}
                />
                <Text style={[styles.actionText, { color: colors.foreground }]}>
                  测试 IPv4 DNS
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isRunning || !hasRouter || !isSupported}
                onPress={() => void runDnsLatency("ipv6")}
                style={({ pressed }) => [
                  styles.action,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                  pressed && styles.pressed,
                  (isRunning || !isSupported) && styles.disabled,
                ]}
              >
                <MaterialIcons
                  name="language"
                  size={20}
                  color={colors.primary}
                />
                <Text style={[styles.actionText, { color: colors.foreground }]}>
                  测试 IPv6 DNS
                </Text>
              </Pressable>
            </View>
          </SectionCard>
          <SectionCard title="NAT 类型检测">
            <Text style={[styles.sectionDescription, { color: colors.muted }]}>
              仅检测所选接口的 NAT 类型与 STUN 公网映射。若路由器未安装
              stunclient，将显示安装提示。
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={isRunning || !hasRouter || !isSupported}
              onPress={() => void runNat()}
              style={({ pressed }) => [
                styles.natButton,
                { backgroundColor: colors.primary },
                pressed && styles.pressed,
                (isRunning || !isSupported) && styles.disabled,
              ]}
            >
              <MaterialIcons name="network-check" size={19} color="#FFFFFF" />
              <Text style={styles.natButtonText}>开始 NAT 检测</Text>
            </Pressable>
          </SectionCard>
          <View style={styles.connectionAction}>
            <Pressable
              accessibilityRole="button"
              onPress={reconnect}
              disabled={isRunning || !hasRouter || !isSupported}
              style={({ pressed }) => [
                styles.reconnect,
                pressed && styles.pressed,
                (isRunning || !isSupported) && styles.disabled,
              ]}
            >
              <MaterialIcons name="sync" size={18} color={colors.warning} />
              <Text style={[styles.reconnectText, { color: colors.warning }]}>
                重连 {activeWan}
              </Text>
            </Pressable>
          </View>
          {isRunning ? (
            <ToolNotice>
              <View style={styles.running}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.runningText, { color: colors.muted }]}>
                  正在从 {activeWan} 执行诊断…
                </Text>
              </View>
            </ToolNotice>
          ) : null}
          {error ? (
            <ToolNotice>
              <Text style={[styles.error, { color: colors.error }]}>
                {error}
              </Text>
            </ToolNotice>
          ) : null}
          {output ? (
            <SectionCard title="命令输出">
              <View
                style={[styles.output, { backgroundColor: colors.background }]}
              >
                <Text
                  selectable
                  style={[styles.outputText, { color: colors.foreground }]}
                >
                  {output.trim() || "命令未返回输出。"}
                </Text>
              </View>
            </SectionCard>
          ) : null}
        </>
      )}
      <ToolNotice>
        <Text style={[styles.note, { color: colors.muted }]}>
          诊断仅在页面打开并手动触发时运行；NAT 检测会连接公共 STUN
          服务，其他测试直接使用您填入的 DNS 或诊断目标。
        </Text>
      </ToolNotice>
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  wanRow: {
    minHeight: 66,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wanName: { fontSize: 15, fontWeight: "800" },
  wanDetail: { fontSize: 12, marginTop: 3 },
  form: { padding: 15, gap: 7 },
  label: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 6,
  },
  actionGrid: {
    paddingHorizontal: 15,
    paddingBottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  action: {
    width: "48%",
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 11,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },
  actionText: { fontSize: 13, fontWeight: "800" },
  sectionDescription: {
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 9,
    fontSize: 13,
    lineHeight: 19,
  },
  natButton: {
    marginHorizontal: 15,
    marginBottom: 15,
    minHeight: 44,
    borderRadius: 11,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },
  natButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  reconnect: {
    alignSelf: "flex-start",
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 15,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },
  reconnectText: { fontSize: 13, fontWeight: "800" },
  connectionAction: { marginTop: 4, marginBottom: 4 },
  running: { flexDirection: "row", alignItems: "center", gap: 10 },
  runningText: { fontSize: 13 },
  output: { margin: 14, borderRadius: 12, padding: 12 },
  outputText: { fontSize: 12, lineHeight: 18, fontFamily: "monospace" },
  error: { fontSize: 13, lineHeight: 19 },
  note: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
});
