import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { sharedStyles, StatusPill } from "@/components/status-ui";
import { useRouterStore } from "@/lib/router-provider";

export default function RouterFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { profiles, saveProfile, deleteProfile, testConnection } = useRouterStore();
  const existing = useMemo(() => profiles.find((profile) => profile.id === params.id), [params.id, profiles]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [username, setUsername] = useState("root");
  const [sshUsername, setSshUsername] = useState("root");
  const [sshPort, setSshPort] = useState("22");
  const [password, setPassword] = useState("");
  const [sshPassword, setSshPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tested, setTested] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setAddress(existing.baseUrl);
    setUsername(existing.username);
    setSshUsername(existing.sshUsername ?? existing.username);
    setSshPort(String(existing.sshPort ?? 22));
  }, [existing]);

  const draft = { name, baseUrl: address, username, sshUsername, sshPort: Number(sshPort) };

  async function handleTest() {
    setIsTesting(true); setMessage(null); setTested(null);
    try {
      const status = await testConnection(draft, password, existing?.id);
      setTested("success");
      setMessage(`连接成功：${status.system?.hostname ?? "已读取路由器状态"}`);
    } catch (error) {
      setTested("error");
      setMessage(error instanceof Error ? error.message : "测试连接失败。");
    } finally { setIsTesting(false); }
  }

  async function handleSave() {
    setIsSaving(true); setMessage(null);
    try {
      await saveProfile(draft, password, sshPassword ?? "", existing?.id);
      router.replace("/");
    } catch (error) {
      setTested("error");
      setMessage(error instanceof Error ? error.message : "无法保存路由器资料。");
    } finally { setIsSaving(false); }
  }

  function handleDelete() {
    if (!existing) return;
    Alert.alert("删除此路由器？", "此操作会移除本地保存的地址、账户与密码，且无法恢复。", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => { void deleteProfile(existing.id).then(() => router.replace("/routers" as never)); } },
    ]);
  }

  return (
    <KeyboardAvoidingView style={sharedStyles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.nav}><Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}><MaterialIcons name="arrow-back" size={22} color="#203B55" /></Pressable><Text style={styles.navTitle}>{existing ? "编辑路由器" : "添加路由器"}</Text><View style={styles.navSpacer} /></View>
        <View><Text style={styles.title}>{existing ? "连接资料" : "连接 OpenWrt"}</Text><Text style={styles.subtitle}>使用 LuCI 的 ubus 接口读取系统与网络状态。</Text></View>
        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>显示名称</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="例如：家中主路由" placeholderTextColor="#93A1AF" returnKeyType="next" />
          <Text style={styles.fieldLabel}>LuCI 管理地址</Text><TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="http://192.168.1.1 或完整 /ubus 地址" placeholderTextColor="#93A1AF" autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="next" />
          <Text style={styles.helpText}>若只填写主机地址，应用会自动补全为 /ubus。</Text>
          <Text style={styles.fieldLabel}>用户名</Text><TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="root" placeholderTextColor="#93A1AF" autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
          <Text style={styles.fieldLabel}>SSH 用户名</Text><TextInput style={styles.input} value={sshUsername} onChangeText={setSshUsername} placeholder="root" placeholderTextColor="#93A1AF" autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
          <Text style={styles.fieldLabel}>SSH 端口</Text><TextInput style={styles.input} value={sshPort} onChangeText={setSshPort} placeholder="22" placeholderTextColor="#93A1AF" keyboardType="number-pad" returnKeyType="next" />
          <Text style={styles.helpText}>应用内终端使用 LuCI 地址中的主机名，以及这里设置的 SSH 账户与端口。</Text>
          <Text style={styles.fieldLabel}>密码{existing ? "（留空以保留原密码）" : ""}</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder={existing ? "输入新密码以替换" : "LuCI 密码"} placeholderTextColor="#93A1AF" secureTextEntry autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => void handleSave()} />
          <Text style={styles.fieldLabel}>SSH 密码{existing ? "（留空以保留原密码）" : "（留空则使用 LuCI 密码）"}</Text><TextInput style={styles.input} value={sshPassword} onChangeText={setSshPassword} placeholder="SSH 密码" placeholderTextColor="#93A1AF" secureTextEntry autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => void handleSave()} />
        </View>
        {message ? <View style={[styles.message, tested === "error" ? styles.errorMessage : styles.successMessage]}><StatusPill label={tested === "error" ? "连接失败" : "连接成功"} tone={tested === "error" ? "danger" : "success"} /><Text style={styles.messageText}>{message}</Text></View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="测试连接" disabled={isTesting || isSaving} onPress={() => void handleTest()} style={({ pressed }) => [sharedStyles.secondaryButton, (isTesting || isSaving) && styles.disabled, pressed && sharedStyles.primaryButtonPressed]}>{isTesting ? <ActivityIndicator color="#007E7A" /> : <Text style={sharedStyles.secondaryButtonText}>测试连接</Text>}</Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="保存路由器" disabled={isSaving || isTesting} onPress={() => void handleSave()} style={({ pressed }) => [sharedStyles.primaryButton, (isSaving || isTesting) && styles.disabled, pressed && sharedStyles.primaryButtonPressed]}>{isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={sharedStyles.primaryButtonText}>保存路由器</Text>}</Pressable>
        {existing ? <Pressable accessibilityRole="button" accessibilityLabel="删除路由器" onPress={handleDelete} style={({ pressed }) => [styles.deleteButton, pressed && styles.buttonPressed]}><Text style={styles.deleteText}>删除路由器</Text></Pressable> : null}
        <View style={styles.securityNote}><MaterialIcons name="lock-outline" size={18} color="#60758B" /><Text style={styles.securityText}>密码保存于设备安全存储。请仅在可信局域网中连接路由器。</Text></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 36, gap: 16 },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 42 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF1F5" },
  navTitle: { color: "#203B55", fontSize: 16, fontWeight: "800" },
  navSpacer: { width: 42 },
  title: { color: "#102A43", fontSize: 26, fontWeight: "800" },
  subtitle: { color: "#60758B", fontSize: 14, lineHeight: 20, marginTop: 5 },
  formCard: { backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: "#E4EAEE", padding: 15 },
  fieldLabel: { color: "#304B64", fontSize: 13, fontWeight: "800", marginTop: 13, marginBottom: 7 },
  input: { color: "#102A43", fontSize: 15, minHeight: 46, borderColor: "#D8E2E8", borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, backgroundColor: "#FBFCFD" },
  helpText: { color: "#718398", fontSize: 12, lineHeight: 17, marginTop: 6 },
  message: { gap: 8, borderRadius: 14, padding: 13 },
  successMessage: { backgroundColor: "#E8F7F1" },
  errorMessage: { backgroundColor: "#FDEBEC" },
  messageText: { color: "#35556A", fontSize: 13, lineHeight: 19 },
  disabled: { opacity: 0.55 },
  deleteButton: { alignItems: "center", minHeight: 42, justifyContent: "center", marginTop: 2 },
  deleteText: { color: "#C53B3B", fontSize: 15, fontWeight: "700" },
  buttonPressed: { opacity: 0.65 },
  securityNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 8, paddingTop: 5 },
  securityText: { color: "#60758B", flex: 1, fontSize: 12, lineHeight: 18 },
});
