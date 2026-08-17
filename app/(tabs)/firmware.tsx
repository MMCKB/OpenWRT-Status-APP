import * as DocumentPicker from "expo-document-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { connectInAppSsh, getInAppSshTarget, isInAppSshSupported, runInAppSshCommand, uploadInAppSshFile } from "@/lib/native-ssh";
import { useRouterStore } from "@/lib/router-provider";
import { useThemedStyles } from "@/lib/use-themed-styles";

type FirmwareStep = "select" | "uploading" | "ready" | "upgrading" | "error";
type FirmwareAsset = { name: string; uri: string; size?: number; mimeType?: string };

function formatFileSize(size?: number) {
  if (typeof size !== "number") return "大小未报告";
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-72) || "firmware.bin";
}

export default function FirmwareScreen() {
  const styles = useThemedStyles(baseStyles);
  const router = useRouter();
  const { selectedProfile, getSelectedCredentials } = useRouterStore();
  const [asset, setAsset] = useState<FirmwareAsset | null>(null);
  const [remotePath, setRemotePath] = useState<string | null>(null);
  const [step, setStep] = useState<FirmwareStep>("select");
  const [message, setMessage] = useState("选择与当前设备型号匹配的 OpenWrt sysupgrade 镜像。");

  if (!selectedProfile) {
    return <View style={styles.blank}><Text style={styles.blankTitle}>没有可升级的路由器</Text><Text style={styles.blankText}>请先保存并选择一台 OpenWrt 路由器。</Text></View>;
  }

  const profile = selectedProfile;
  const target = getInAppSshTarget(profile);
  const canUpgrade = step === "ready" && !!remotePath;

  async function chooseFirmware() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/octet-stream", "application/x-sysupgrade", "*/*"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      setAsset({ name: file.name, uri: file.uri, size: file.size, mimeType: file.mimeType });
      setRemotePath(null); setStep("select");
      setMessage("已选择固件。上传完成后，请在最后一步确认是否执行升级。");
    } catch (error) {
      setStep("error"); setMessage(error instanceof Error ? error.message : "无法选择固件文件。");
    }
  }

  async function uploadFirmware() {
    if (!asset) { setStep("error"); setMessage("请先选择固件文件。 "); return; }
    setStep("uploading"); setMessage("正在通过 SSH 上传固件至路由器临时目录…");
    try {
      const credentials = await getSelectedCredentials();
      if (!credentials) throw new Error("未找到本机保存的 SSH 密码，请编辑路由器资料后再试。");
      await connectInAppSsh(profile, credentials.sshPassword);
      const targetPath = `/tmp/manus-${Date.now()}-${safeFileName(asset.name)}`;
      await uploadInAppSshFile(asset.uri, targetPath);
      setRemotePath(targetPath);
      setStep("ready"); setMessage("上传完成。请仔细确认设备和固件镜像后，再开始不可逆的升级。 ");
    } catch (error) {
      setStep("error"); setMessage(error instanceof Error ? error.message : "固件上传失败。 ");
    }
  }

  function confirmUpgrade() {
    Alert.alert("确认执行固件升级？", `将对 ${target} 执行 sysupgrade。路由器会断开连接并重启；操作中断或镜像错误可能导致设备不可用。`, [
      { text: "取消", style: "cancel" },
      { text: "确认升级", style: "destructive", onPress: () => void performUpgrade() },
    ]);
  }

  async function performUpgrade() {
    if (!remotePath || !canUpgrade) return;
    setStep("upgrading"); setMessage("升级命令已提交。路由器将断开连接并重启，请勿关闭电源或离开当前网络。 ");
    try {
      await runInAppSshCommand(`sysupgrade '${remotePath}'`);
    } catch {
      // sysupgrade typically ends the SSH transport during reboot; the submitted command is the success signal.
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.nav}><Pressable accessibilityRole="button" accessibilityLabel="返回设置" onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-back" size={22} color="#203B55" /></Pressable><Text style={styles.navTitle}>固件升级</Text><View style={styles.navSpacer} /></View>
        <View style={styles.warning}><MaterialIcons name="warning-amber" size={23} color="#A96D00" /><View style={styles.warningText}><Text style={styles.warningTitle}>高风险操作</Text><Text style={styles.warningBody}>升级会替换路由器系统。仅使用与当前型号完全匹配的 sysupgrade 镜像，并在持续供电的可信网络中操作。</Text></View></View>
        <View style={styles.deviceCard}><Text style={styles.eyebrow}>升级目标</Text><Text style={styles.deviceTarget}>{target}</Text><Text style={styles.deviceHint}>仅在新版 Android APK 中可上传和升级</Text></View>
        {!isInAppSshSupported() ? <View style={styles.error}><Text style={styles.errorText}>此功能仅在 Android APK 中可用，Web 与 iOS 预览无法使用内嵌 SSH 文件传输。</Text></View> : null}
        <Text style={styles.sectionTitle}>1. 选择固件</Text>
        <Pressable accessibilityRole="button" onPress={() => void chooseFirmware()} disabled={step === "uploading" || step === "upgrading"} style={({ pressed }) => [styles.filePicker, pressed && styles.pressed]}><MaterialIcons name="upload-file" size={24} color="#007E7A" /><View style={styles.fileCopy}><Text style={styles.fileTitle}>{asset?.name ?? "选择 sysupgrade 镜像"}</Text><Text style={styles.fileMeta}>{asset ? formatFileSize(asset.size) : "文件仅临时保存在本机以供上传"}</Text></View><MaterialIcons name="chevron-right" size={22} color="#718398" /></Pressable>
        <Text style={styles.sectionTitle}>2. 上传固件</Text>
        <Pressable accessibilityRole="button" disabled={!asset || step === "uploading" || step === "upgrading" || !isInAppSshSupported()} onPress={() => void uploadFirmware()} style={({ pressed }) => [styles.verifyButton, (!asset || step === "uploading" || step === "upgrading" || !isInAppSshSupported()) && styles.disabled, pressed && styles.pressed]}>{step === "uploading" ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.verifyText}>上传到路由器</Text>}</Pressable>
        <View style={[styles.statusBox, step === "error" && styles.statusError, step === "ready" && styles.statusReady]}><Text style={styles.statusTitle}>{step === "ready" ? "上传完成" : step === "error" ? "需要处理" : step === "upgrading" ? "升级进行中" : "升级状态"}</Text><Text style={styles.statusText}>{message}</Text></View>
        <Text style={styles.sectionTitle}>3. 确认升级</Text>
        <Pressable accessibilityRole="button" disabled={!canUpgrade} onPress={confirmUpgrade} style={({ pressed }) => [styles.upgradeButton, !canUpgrade && styles.disabled, pressed && styles.pressed]}>{step === "upgrading" ? <ActivityIndicator color="#FFFFFF" /> : <><MaterialIcons name="system-update" size={19} color="#FFFFFF" /><Text style={styles.upgradeText}>确认并升级固件</Text></>}</Pressable>
        <Text style={styles.footer}>升级命令提交后，应用无法确认重启过程。请等待路由器重新上线后，再回到状态页手动刷新。</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const baseStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FA" }, content: { padding: 20, paddingBottom: 38, gap: 16 },
  blank: { flex: 1, backgroundColor: "#F6F8FA", alignItems: "center", justifyContent: "center", padding: 30 }, blankTitle: { color: "#102A43", fontSize: 22, fontWeight: "800" }, blankText: { color: "#60758B", marginTop: 8, textAlign: "center" },
  nav: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, back: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF1F5" }, navTitle: { color: "#203B55", fontSize: 16, fontWeight: "800" }, navSpacer: { width: 42 },
  warning: { flexDirection: "row", gap: 11, backgroundColor: "#FFF3D9", borderWidth: 1, borderColor: "#F0D59A", borderRadius: 16, padding: 14 }, warningText: { flex: 1 }, warningTitle: { color: "#7E5200", fontSize: 15, fontWeight: "800" }, warningBody: { color: "#855D14", fontSize: 13, lineHeight: 19, marginTop: 4 },
  deviceCard: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E4EAEE", padding: 14 }, eyebrow: { color: "#718398", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 }, deviceTarget: { color: "#203B55", fontSize: 16, fontWeight: "800", marginTop: 5, fontVariant: ["tabular-nums"] }, deviceHint: { color: "#718398", fontSize: 12, marginTop: 4 },
  error: { backgroundColor: "#FDEBEC", borderRadius: 12, padding: 13 }, errorText: { color: "#A43131", fontSize: 13, lineHeight: 19 }, sectionTitle: { color: "#203B55", fontSize: 15, fontWeight: "800", marginTop: 4 },
  filePicker: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CFE5E3", padding: 14 }, fileCopy: { flex: 1, minWidth: 0 }, fileTitle: { color: "#203B55", fontSize: 14, fontWeight: "800" }, fileMeta: { color: "#718398", fontSize: 12, marginTop: 4 },
  verifyButton: { minHeight: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#007E7A" }, verifyText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" }, statusBox: { backgroundColor: "#EEF3F6", borderRadius: 14, padding: 13 }, statusError: { backgroundColor: "#FDEBEC" }, statusReady: { backgroundColor: "#E8F7F1" }, statusTitle: { color: "#304B64", fontSize: 13, fontWeight: "800" }, statusText: { color: "#5B6B7D", fontSize: 13, lineHeight: 19, marginTop: 4 },
  upgradeButton: { minHeight: 52, borderRadius: 14, backgroundColor: "#B13939", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, upgradeText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" }, footer: { color: "#718398", fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 8 }, disabled: { opacity: 0.46 }, pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
