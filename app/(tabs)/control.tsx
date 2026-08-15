import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { EmptyState, SectionCard, sharedStyles, StatusPill } from "@/components/status-ui";
import { fetchInstalledPackages } from "@/lib/openwrt-client";
import { connectInAppSsh, disconnectInAppSsh, getInAppSshTarget, isInAppSshSupported, runInAppSshCommand } from "@/lib/native-ssh";
import { useRouterStore } from "@/lib/router-provider";
import type { InstalledPackage } from "@/shared/router-types";

const quickCommands = [
  { label: "系统摘要", command: "ubus call system board" },
  { label: "接口状态", command: "ip addr" },
  { label: "磁盘空间", command: "df -h" },
  { label: "最近日志", command: "logread | tail -n 40" },
];

export default function ControlScreen() {
  const { selectedProfile, getSelectedCredentials } = useRouterStore();
  const [connection, setConnection] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [terminalOutput, setTerminalOutput] = useState("欢迎使用 OpenWrt 控制台。连接后可运行 SSH 命令。\n");
  const [command, setCommand] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [packages, setPackages] = useState<InstalledPackage[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);

  useEffect(() => () => disconnectInAppSsh(), []);

  const profile = selectedProfile;
  if (!profile) {
    return <View style={sharedStyles.screen}><View style={styles.header}><Text style={styles.title}>控制</Text></View><EmptyState icon="terminal" title="还没有可控制的路由器" description="请先在“路由器”中保存 OpenWrt 的 LuCI 与 SSH 连接资料。" /></View>;
  }

  const target = getInAppSshTarget(profile);

  async function connect() {
    setConnection("connecting");
    try {
      const credentials = await getSelectedCredentials();
      if (!credentials) throw new Error("未找到本机保存的 SSH 密码，请编辑路由器资料后再试。");
      const result = await connectInAppSsh(profile!, credentials.sshPassword);
      setConnection("connected");
      setTerminalOutput((current) => `${current}\n已连接 ${result.target}\n${result.banner}`);
    } catch (error) {
      setConnection("error");
      setTerminalOutput((current) => `${current}\n连接失败：${error instanceof Error ? error.message : "未知错误"}\n`);
    }
  }

  async function execute(nextCommand = command) {
    setIsRunning(true);
    try {
      const output = await runInAppSshCommand(nextCommand);
      setTerminalOutput((current) => `${current}\n$ ${nextCommand.trim()}\n${output}`);
      setCommand("");
    } catch (error) {
      setTerminalOutput((current) => `${current}\n执行失败：${error instanceof Error ? error.message : "未知错误"}\n`);
    } finally {
      setIsRunning(false);
    }
  }

  async function loadPackages() {
    setIsLoadingPackages(true); setPackageError(null);
    try {
      const credentials = await getSelectedCredentials();
      if (!credentials) throw new Error("未找到 LuCI 凭证，请编辑路由器资料后再试。");
      const result = await fetchInstalledPackages(profile!.baseUrl, profile!.username, credentials.luciPassword);
      setPackages(result);
    } catch (error) {
      setPackageError(error instanceof Error ? error.message : "无法读取软件包清单。");
    } finally { setIsLoadingPackages(false); }
  }

  return (
    <KeyboardAvoidingView style={sharedStyles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        data={packages}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={<View style={styles.headerContent}>
          <View><Text style={styles.title}>控制</Text><Text style={styles.subtitle}>应用内 SSH 与软件包清单</Text></View>
          <SectionCard title="应用内 SSH 终端">
            <View style={styles.terminalCard}>
              <View style={styles.terminalTop}><View><Text style={styles.terminalTarget}>{target}</Text><Text style={styles.terminalHint}>命令直接在当前 Android 应用内执行</Text></View><StatusPill label={connection === "connected" ? "已连接" : connection === "connecting" ? "连接中" : connection === "error" ? "失败" : "未连接"} tone={connection === "connected" ? "success" : connection === "error" ? "danger" : "normal"} /></View>
              {!isInAppSshSupported() ? <Text style={styles.platformNote}>该原生终端随 Android APK 提供；Web 与 iOS 预览中不可用。</Text> : null}
              <View style={styles.outputBox}><Text selectable style={styles.outputText}>{terminalOutput}</Text></View>
              <View style={styles.commandRow}><TextInput accessibilityLabel="SSH 命令" style={styles.commandInput} value={command} onChangeText={setCommand} placeholder="输入 OpenWrt 命令" placeholderTextColor="#88A0B2" autoCapitalize="none" autoCorrect={false} editable={connection === "connected" && !isRunning} returnKeyType="send" onSubmitEditing={() => void execute()} /><Pressable accessibilityRole="button" accessibilityLabel="执行 SSH 命令" disabled={connection !== "connected" || isRunning} onPress={() => void execute()} style={({ pressed }) => [styles.runButton, (connection !== "connected" || isRunning) && styles.disabled, pressed && styles.buttonPressed]}>{isRunning ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialIcons name="send" size={18} color="#FFFFFF" />}</Pressable></View>
              <View style={styles.quickGrid}>{quickCommands.map((item) => <Pressable key={item.label} accessibilityRole="button" disabled={connection !== "connected" || isRunning} onPress={() => void execute(item.command)} style={({ pressed }) => [styles.quickButton, (connection !== "connected" || isRunning) && styles.disabled, pressed && styles.buttonPressed]}><Text style={styles.quickText}>{item.label}</Text></Pressable>)}</View>
              <View style={styles.terminalActions}>{connection !== "connected" ? <Pressable accessibilityRole="button" disabled={connection === "connecting" || !isInAppSshSupported()} onPress={() => void connect()} style={({ pressed }) => [sharedStyles.primaryButton, styles.actionButton, (connection === "connecting" || !isInAppSshSupported()) && styles.disabled, pressed && sharedStyles.primaryButtonPressed]}>{connection === "connecting" ? <ActivityIndicator color="#FFFFFF" /> : <Text style={sharedStyles.primaryButtonText}>连接 SSH</Text>}</Pressable> : <Pressable accessibilityRole="button" onPress={() => { disconnectInAppSsh(); setConnection("idle"); setTerminalOutput((current) => `${current}\n会话已断开。\n`); }} style={({ pressed }) => [sharedStyles.secondaryButton, styles.actionButton, pressed && sharedStyles.primaryButtonPressed]}><Text style={sharedStyles.secondaryButtonText}>断开连接</Text></Pressable>}</View>
              <Text style={styles.securityNote}>SSH 密码仅保存于本机安全存储。命令会立即以 SSH 用户权限执行，请仅管理您拥有或获授权的路由器。</Text>
            </View>
          </SectionCard>
          <SectionCard title="已安装软件包" action={<Text style={styles.packageCount}>{packages.length ? `${packages.length} 个` : ""}</Text>}>
            <View style={styles.packageIntro}><Text style={styles.packageText}>通过已认证的 LuCI rpc-sys 接口读取完整包清单，不会执行安装、升级或卸载操作。</Text><Pressable accessibilityRole="button" onPress={() => void loadPackages()} disabled={isLoadingPackages} style={({ pressed }) => [styles.loadPackages, isLoadingPackages && styles.disabled, pressed && styles.buttonPressed]}>{isLoadingPackages ? <ActivityIndicator color="#007E7A" /> : <Text style={styles.loadPackagesText}>{packages.length ? "刷新清单" : "读取软件包"}</Text>}</Pressable></View>
            {packageError ? <Text style={styles.packageError}>{packageError}</Text> : null}
          </SectionCard>
        </View>}
        renderItem={({ item, index }) => <View style={[styles.packageRow, index === 0 && styles.packageRowFirst]}><View style={styles.packageIcon}><MaterialIcons name="inventory-2" size={17} color="#007E7A" /></View><View style={styles.packageInfo}><Text style={styles.packageName}>{item.name}</Text><Text style={styles.packageVersion}>{item.version}</Text></View></View>}
        ListEmptyComponent={packages.length === 0 && !isLoadingPackages && !packageError ? <Text style={styles.emptyPackages}>点击“读取软件包”后，已安装的软件包会显示在这里。</Text> : null}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 20, paddingBottom: 34 },
  headerContent: { gap: 20 },
  header: { paddingHorizontal: 20, paddingTop: 26 },
  title: { color: "#102A43", fontSize: 28, fontWeight: "800" },
  subtitle: { color: "#60758B", fontSize: 14, marginTop: 5 },
  terminalCard: { padding: 14, gap: 12 },
  terminalTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  terminalTarget: { color: "#203B55", fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  terminalHint: { color: "#718398", fontSize: 12, marginTop: 3 },
  platformNote: { color: "#8B5A00", fontSize: 12, lineHeight: 18, padding: 10, backgroundColor: "#FFF4DD", borderRadius: 10 },
  outputBox: { minHeight: 146, maxHeight: 230, borderRadius: 12, backgroundColor: "#102A43", padding: 12 },
  outputText: { color: "#D7F1ED", fontSize: 12, lineHeight: 18, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  commandRow: { flexDirection: "row", gap: 8 },
  commandInput: { flex: 1, minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: "#D8E2E8", backgroundColor: "#FBFCFD", paddingHorizontal: 12, color: "#102A43", fontSize: 14, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  runButton: { width: 48, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#007E7A" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickButton: { minWidth: "47%", flexGrow: 1, alignItems: "center", borderRadius: 10, backgroundColor: "#EAF5F4", paddingVertical: 10, paddingHorizontal: 8 },
  quickText: { color: "#006F6B", fontSize: 12, fontWeight: "700" },
  terminalActions: { flexDirection: "row" },
  actionButton: { flex: 1 },
  securityNote: { color: "#60758B", fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.72 },
  packageCount: { color: "#6B7C93", fontSize: 13, fontWeight: "600" },
  packageIntro: { padding: 14, gap: 12 },
  packageText: { color: "#5B6B7D", fontSize: 13, lineHeight: 19 },
  loadPackages: { minHeight: 42, borderRadius: 11, backgroundColor: "#E6F5F4", alignItems: "center", justifyContent: "center" },
  loadPackagesText: { color: "#006F6B", fontSize: 14, fontWeight: "800" },
  packageError: { color: "#A43131", fontSize: 13, lineHeight: 19, paddingHorizontal: 14, paddingBottom: 14 },
  packageRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 11, marginHorizontal: 0, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#E8EEF1", backgroundColor: "#FFFFFF" },
  packageRowFirst: { marginTop: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, borderTopColor: "#E4EAEE" },
  packageIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#E6F5F4", alignItems: "center", justifyContent: "center" },
  packageInfo: { flex: 1, minWidth: 0 },
  packageName: { color: "#203B55", fontSize: 14, fontWeight: "800" },
  packageVersion: { color: "#718398", fontSize: 12, marginTop: 3 },
  emptyPackages: { color: "#718398", fontSize: 13, lineHeight: 19, paddingVertical: 16, textAlign: "center" },
});
