import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { EmptyState, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { connectInAppSsh, disconnectInAppSsh, getInAppSshTarget, isInAppSshConnectedFor, isInAppSshSupported, runInAppSshCommand } from "@/lib/native-ssh";
import { useRouterStore } from "@/lib/router-provider";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

const WELCOME_OUTPUT = "OpenWrt SSH Terminal\n输入命令后点击发送或使用键盘发送键执行。\n\n";
const MAX_OUTPUT_LENGTH = 24000;

function trimTerminalOutput(value: string) {
  return value.length > MAX_OUTPUT_LENGTH ? `… 已隐藏较早输出 …\n${value.slice(-MAX_OUTPUT_LENGTH)}` : value;
}

export default function ControlScreen() {
  const { selectedProfile, getSelectedCredentials } = useRouterStore();
  const colors = useColors();
  const isDark = useColorScheme() === "dark";
  const terminalRef = useRef<ScrollView>(null);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [terminalOutput, setTerminalOutput] = useState(WELCOME_OUTPUT);
  const [command, setCommand] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) => {
      requestAnimationFrame(() => terminalRef.current?.scrollToEnd({ animated: true }));
    });
    const hide = Keyboard.addListener(hideEvent, () => undefined);
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    setConnection(selectedProfile && isInAppSshConnectedFor(selectedProfile) ? "connected" : "idle");
  }, [selectedProfile]);

  const profile = selectedProfile;
  if (!profile) {
    return (
      <View style={[styles.emptyScreen, { backgroundColor: colors.background }]}>
        <View style={styles.emptyHeader}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>终端</Text></View>
        <EmptyState icon="terminal" title="还没有可连接的路由器" description="请先在“路由器”中保存 OpenWrt 的 LuCI 与 SSH 连接资料。" />
      </View>
    );
  }

  const target = getInAppSshTarget(profile);
  const stateLabel = connection === "connected" ? "已连接" : connection === "connecting" ? "连接中" : connection === "error" ? "连接失败" : "未连接";
  const stateTone = connection === "connected" ? "success" : connection === "error" ? "danger" : "normal";

  function appendOutput(value: string) {
    setTerminalOutput((current) => trimTerminalOutput(`${current}${current.endsWith("\n") ? "" : "\n"}${value}`));
    requestAnimationFrame(() => terminalRef.current?.scrollToEnd({ animated: true }));
  }

  async function connect() {
    setConnection("connecting");
    appendOutput(`正在连接 ${target}…\n`);
    try {
      const credentials = await getSelectedCredentials();
      if (!credentials) throw new Error("未找到本机保存的 SSH 密码，请编辑路由器资料后再试。");
      const result = await connectInAppSsh(profile!, credentials.sshPassword);
      setConnection("connected");
      appendOutput(`已连接 ${result.target}\n`);
    } catch (error) {
      setConnection("error");
      appendOutput(`连接失败：${error instanceof Error ? error.message : "未知错误"}\n`);
    }
  }

  async function execute() {
    const nextCommand = command.trim();
    if (!nextCommand || connection !== "connected" || isRunning) return;
    setIsRunning(true);
    setHistory((current) => current[current.length - 1] === nextCommand ? current : [...current, nextCommand].slice(-40));
    setHistoryIndex(-1);
    setCommand("");
    appendOutput(`$ ${nextCommand}\n`);
    try {
      const output = await runInAppSshCommand(nextCommand);
      appendOutput(`${output || "命令已完成，无输出。"}\n`);
    } catch (error) {
      appendOutput(`执行失败：${error instanceof Error ? error.message : "未知错误"}\n`);
    } finally {
      setIsRunning(false);
    }
  }

  function recallCommand(direction: -1 | 1) {
    if (!history.length) return;
    const currentIndex = historyIndex === -1 ? history.length : historyIndex;
    const nextIndex = Math.min(history.length, Math.max(0, currentIndex + direction));
    setHistoryIndex(nextIndex === history.length ? -1 : nextIndex);
    setCommand(nextIndex === history.length ? "" : history[nextIndex]);
  }

  function disconnect() {
    disconnectInAppSsh();
    setConnection("idle");
    appendOutput("会话已断开。\n");
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.select({ ios: "padding", android: "height" })}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.identityWrap}>
          <View style={[styles.terminalBadge, { backgroundColor: isDark ? "#143734" : "#E6F5F4" }]}><MaterialIcons name="terminal" size={19} color={colors.primary} /></View>
          <View style={styles.identity}><Text style={[styles.target, { color: colors.foreground }]} numberOfLines={1}>{target}</Text><Text style={[styles.context, { color: colors.muted }]} numberOfLines={1}>OpenWrt · 应用内 SSH 会话</Text></View>
        </View>
        <StatusPill label={stateLabel} tone={stateTone} />
      </View>

      {!isInAppSshSupported() ? <View style={[styles.platformBanner, { backgroundColor: isDark ? "#302718" : "#FFF4DD", borderBottomColor: isDark ? "#5C4720" : "#F0D39A" }]}><MaterialIcons name="info-outline" size={17} color={colors.warning} /><Text style={[styles.platformText, { color: colors.warning }]}>内嵌 SSH 终端仅在新版 Android APK 中可用，Web 与 iOS 预览不会加载该原生组件。</Text></View> : null}

      <ScrollView ref={terminalRef} style={[styles.terminalScroll, { backgroundColor: colors.background }]} contentContainerStyle={styles.terminalContent} keyboardShouldPersistTaps="handled" onContentSizeChange={() => terminalRef.current?.scrollToEnd({ animated: false })}>
        <Text selectable style={[styles.terminalText, { color: isDark ? "#D8F1ED" : colors.foreground }]}>{terminalOutput}</Text>
        {isRunning ? <View style={styles.runningLine}><ActivityIndicator size="small" color={colors.primary} /><Text style={[styles.runningText, { color: colors.primary }]}>正在执行命令…</Text></View> : null}
      </ScrollView>

      <View style={[styles.toolStrip, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="显示上一条命令" onPress={() => recallCommand(-1)} disabled={!history.length || isRunning} style={({ pressed }) => [styles.toolButton, { backgroundColor: isDark ? "#1A2D38" : "#EAF1F3" }, (!history.length || isRunning) && styles.disabled, pressed && styles.toolPressed]}><MaterialIcons name="keyboard-arrow-up" size={21} color={colors.foreground} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="显示下一条命令" onPress={() => recallCommand(1)} disabled={!history.length || isRunning} style={({ pressed }) => [styles.toolButton, { backgroundColor: isDark ? "#1A2D38" : "#EAF1F3" }, (!history.length || isRunning) && styles.disabled, pressed && styles.toolPressed]}><MaterialIcons name="keyboard-arrow-down" size={21} color={colors.foreground} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="清除终端输出" onPress={() => setTerminalOutput(WELCOME_OUTPUT)} disabled={isRunning} style={({ pressed }) => [styles.clearButton, { backgroundColor: isDark ? "#1A2D38" : "#EAF1F3" }, isRunning && styles.disabled, pressed && styles.toolPressed]}><MaterialIcons name="delete-outline" size={18} color={colors.foreground} /><Text style={[styles.clearText, { color: colors.foreground }]}>清屏</Text></Pressable>
        {connection === "connected" ? <Pressable accessibilityRole="button" accessibilityLabel="断开 SSH 连接" onPress={disconnect} style={({ pressed }) => [styles.disconnectButton, { borderColor: colors.border }, pressed && styles.toolPressed]}><Text style={[styles.disconnectText, { color: colors.foreground }]}>断开</Text></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="连接 SSH" disabled={connection === "connecting" || !isInAppSshSupported()} onPress={() => void connect()} style={({ pressed }) => [styles.connectButton, { backgroundColor: colors.primary }, (connection === "connecting" || !isInAppSshSupported()) && styles.disabled, pressed && styles.toolPressed]}>{connection === "connecting" ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><MaterialIcons name="power" size={17} color="#FFFFFF" /><Text style={styles.connectText}>连接</Text></>}</Pressable>}
      </View>

      <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Text style={[styles.prompt, { color: colors.primary }]}>$</Text>
        <TextInput
          accessibilityLabel="SSH 命令"
          style={[styles.commandInput, { color: colors.foreground }]}
          value={command}
          onChangeText={setCommand}
          placeholder={connection === "connected" ? "输入 OpenWrt 命令" : "请先连接 SSH"}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={connection === "connected" && !isRunning}
          returnKeyType="send"
          onSubmitEditing={() => void execute()}
          onFocus={() => requestAnimationFrame(() => terminalRef.current?.scrollToEnd({ animated: true }))}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="执行 SSH 命令" disabled={connection !== "connected" || isRunning || !command.trim()} onPress={() => void execute()} style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.primary }, (connection !== "connected" || isRunning || !command.trim()) && styles.sendDisabled, pressed && styles.toolPressed]}>{isRunning ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialIcons name="arrow-upward" size={20} color="#FFFFFF" />}</Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  emptyScreen: { flex: 1 },
  emptyHeader: { paddingHorizontal: 20, paddingTop: 26 },
  emptyTitle: { fontSize: 28, fontWeight: "800" },
  topBar: { minHeight: 76, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  identityWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 11 },
  terminalBadge: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  identity: { flex: 1, minWidth: 0 },
  target: { fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  context: { fontSize: 11, marginTop: 3 },
  platformBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  platformText: { flex: 1, fontSize: 12, lineHeight: 18 },
  terminalScroll: { flex: 1 },
  terminalContent: { flexGrow: 1, padding: 16, paddingBottom: 14 },
  terminalText: { fontSize: 13, lineHeight: 20, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  runningLine: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  runningText: { fontSize: 12, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  toolStrip: { minHeight: 52, paddingHorizontal: 12, gap: 7, flexDirection: "row", alignItems: "center", borderTopWidth: 1 },
  toolButton: { width: 36, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  clearButton: { height: 34, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 8 },
  clearText: { fontSize: 12, fontWeight: "700" },
  connectButton: { marginLeft: "auto", minWidth: 76, height: 34, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 8 },
  connectText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  disconnectButton: { marginLeft: "auto", minWidth: 58, height: 34, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1 },
  disconnectText: { fontSize: 12, fontWeight: "800" },
  composer: { minHeight: 62, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1 },
  prompt: { fontSize: 20, fontWeight: "800", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  commandInput: { flex: 1, minHeight: 40, fontSize: 14, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), paddingVertical: 5 },
  sendButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19 },
  sendDisabled: { opacity: 0.42 },
  disabled: { opacity: 0.45 },
  toolPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
