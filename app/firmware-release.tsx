import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { downloadGithubReleaseAsset } from "@/lib/github-firmware-download";
import { compareReleaseVersion, fetchLatestGithubRelease, parseGithubReleaseUrl, type GithubRelease, type GithubReleaseAsset } from "@/lib/github-release";
import { getInAppSshTarget, uploadInAppSshFile } from "@/lib/native-ssh";
import { buildFirmwareDeviceInfoCommand, parseFirmwareDeviceInfo, type FirmwareDeviceInfo } from "@/lib/openwrt-admin";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import { useRouterStore } from "@/lib/router-provider";
import { loadFirmwareReleaseUrl, saveFirmwareReleaseUrl } from "@/lib/router-storage";

function formatSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function formatDate(value: string | null) {
  if (!value) return "日期未报告";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日期未报告" : date.toLocaleDateString();
}

function remoteFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100) || "firmware.bin";
}

export default function FirmwareReleaseScreen() {
  const router = useRouter();
  const colors = useColors();
  const { selectedProfile } = useRouterStore();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [sourceUrl, setSourceUrl] = useState("");
  const [release, setRelease] = useState<GithubRelease | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<FirmwareDeviceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [activity, setActivity] = useState("填写公开 GitHub 仓库的 Release 链接后，检查最新版本与固件资产。");

  useEffect(() => {
    let active = true;
    if (!selectedProfile) return;
    void loadFirmwareReleaseUrl(selectedProfile.id).then((stored) => {
      if (active) setSourceUrl(stored ?? "");
    });
    return () => { active = false; };
  }, [selectedProfile]);

  const checkRelease = useCallback(async () => {
    if (!selectedProfile || !isSupported) return;
    setLoading(true);
    setActivity("正在从 GitHub 查询公开 Release，并读取路由器当前固件版本…");
    try {
      parseGithubReleaseUrl(sourceUrl);
      await saveFirmwareReleaseUrl(selectedProfile.id, sourceUrl);
      const latest = await fetchLatestGithubRelease(sourceUrl);
      const current = parseFirmwareDeviceInfo(await execute(buildFirmwareDeviceInfoCommand()));
      setRelease(latest);
      setDeviceInfo(current);
      setActivity(latest.assets.some((asset) => asset.firmwareCandidate) ? "已读取最新 Release。请手动确认型号、目标平台和镜像类型后再选择下载。" : "已读取最新 Release，但未识别到常见固件镜像资产。");
    } catch (reason) {
      setRelease(null);
      setActivity(reason instanceof Error ? reason.message : "GitHub 版本检查失败。");
    } finally {
      setLoading(false);
    }
  }, [execute, isSupported, selectedProfile, sourceUrl]);

  const runUpgrade = useCallback(async (remotePath: string, name: string) => {
    setActivity(`正在提交 sysupgrade：${name}。路由器会断开连接并重启，请保持供电。`);
    try {
      await execute(`sysupgrade '${remotePath}'`);
    } catch {
      // sysupgrade normally closes the SSH transport while rebooting. Command submission is sufficient here.
    }
  }, [execute]);

  const downloadUploadAndConfirm = useCallback(async (asset: GithubReleaseAsset) => {
    if (!selectedProfile) return;
    try {
      setActivity(`正在从 GitHub 下载 ${asset.name}…`);
      const downloaded = await downloadGithubReleaseAsset(asset);
      const remotePath = `/tmp/manus-github-${Date.now()}-${remoteFileName(asset.name)}`;
      setActivity(`正在上传 ${asset.name} 到路由器临时目录…`);
      await execute("true");
      await uploadInAppSshFile(downloaded.uri, remotePath);
      setActivity(`已上传 ${asset.name}。请在最后一步确认 sysupgrade。`);
      Alert.alert("确认执行固件升级？", `“${asset.name}”已上传至 ${getInAppSshTarget(selectedProfile)}。升级会中断连接并重启路由器；镜像不匹配可能导致设备不可用。`, [
        { text: "暂不升级", style: "cancel" },
        { text: "确认 sysupgrade", style: "destructive", onPress: () => void runUpgrade(remotePath, asset.name) },
      ]);
    } catch (reason) {
      setActivity(reason instanceof Error ? reason.message : "固件下载或上传失败。");
    }
  }, [execute, runUpgrade, selectedProfile]);

  function confirmAsset(asset: GithubReleaseAsset) {
    Alert.alert("下载并上传固件", `将下载“${asset.name}”（${formatSize(asset.size)}）并上传到当前路由器。应用不会自动执行 sysupgrade，上传后仍会要求你再次确认。`, [
      { text: "取消", style: "cancel" },
      { text: "下载并上传", style: "destructive", onPress: () => void downloadUploadAndConfirm(asset) },
    ]);
  }

  if (!selectedProfile) return <ManagementShell title="GitHub 固件检查" description="请先选择一台路由器。"><EmptyState icon="router" title="未选择路由器" description="返回主页选择路由器后再检查固件版本。" /></ManagementShell>;

  const candidates = release?.assets.filter((asset) => asset.firmwareCandidate) ?? [];
  const comparison = release ? compareReleaseVersion(deviceInfo?.version, release.tagName) : null;
  const disabled = loading || isRunning || !hasRouter || !isSupported;
  return <ManagementShell title="GitHub 固件检查" description="从你配置的公开 GitHub Release 检查版本并手动选择固件。不会自动升级或校验镜像适配性。">
    <SectionCard title="Release 链接"><View style={styles.cardBody}>
      <Text style={[styles.caption, { color: colors.muted }]}>支持 GitHub 仓库的 Release 页面，例如 https://github.com/owner/repository/releases。链接按当前路由器分别保存。</Text>
      <TextInput value={sourceUrl} onChangeText={setSourceUrl} editable={!disabled} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="GitHub Release 链接" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
      <Pressable accessibilityRole="button" disabled={!sourceUrl.trim() || disabled} onPress={() => void checkRelease()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, (!sourceUrl.trim() || disabled) && styles.disabled, pressed && styles.pressed]}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>检查最新 Release</Text>}</Pressable>
      <Text style={[styles.status, { color: colors.muted }]}>{activity}</Text>
      {!isSupported ? <Text style={[styles.error, { color: colors.error }]}>此功能需要安装 Android APK；Web 预览无法进行 SSH 上传与升级。</Text> : null}
    </View></SectionCard>
    {release ? <SectionCard title="Release 与当前系统"><View style={styles.cardBody}>
      <View style={styles.releaseTitleRow}><View style={styles.releaseCopy}><Text style={[styles.releaseTitle, { color: colors.foreground }]}>{release.name ?? release.tagName}</Text><Text style={[styles.caption, { color: colors.muted }]}>Tag {release.tagName} · {formatDate(release.publishedAt)}</Text></View><StatusPill label={comparison === 1 ? "发现新版本" : comparison === 0 ? "版本相同" : comparison === -1 ? "当前更高" : "待核对"} tone={comparison === 1 ? "success" : "normal"} /></View>
      <Text style={[styles.current, { color: colors.foreground }]}>当前固件：{deviceInfo?.description ?? deviceInfo?.version ?? "未报告"}{deviceInfo?.target ? ` · ${deviceInfo.target}` : ""}</Text>
      <Text style={[styles.caption, { color: colors.muted }]}>{comparison === 1 ? "GitHub Tag 的数字版本更高，但仍必须手动确认镜像适配当前设备。" : comparison === 0 ? "数字版本相同。请根据 Release 说明决定是否升级。" : comparison === -1 ? "GitHub Tag 的数字版本低于当前系统。" : "无法可靠比较版本号，请按型号、目标平台和 Release 说明手动核对。"}</Text>
    </View></SectionCard> : null}
    {release ? <SectionCard title={`可选固件资产（${candidates.length}）`}><View style={styles.assetList}>{candidates.length ? candidates.map((asset, index) => <Pressable key={asset.id} accessibilityRole="button" disabled={disabled} onPress={() => confirmAsset(asset)} style={({ pressed }) => [styles.assetRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && styles.pressed, disabled && styles.disabled]}><MaterialIcons name="file-download" size={22} color={colors.primary} /><View style={styles.assetCopy}><Text numberOfLines={2} style={[styles.assetName, { color: colors.foreground }]}>{asset.name}</Text><Text style={[styles.assetMeta, { color: colors.muted }]}>{formatSize(asset.size)} · 下载、上传后再次确认升级</Text></View><MaterialIcons name="chevron-right" size={22} color={colors.muted} /></Pressable>) : <EmptyState icon="file-present" title="未识别固件资产" description="Release 中没有 .bin、.img、.itb 或常见 sysupgrade 文件。" />}</View></SectionCard> : null}
    {error ? <ToolNotice><Text style={[styles.error, { color: colors.error }]}>{error}</Text></ToolNotice> : null}
    <ToolNotice><Text style={[styles.caption, { color: colors.muted }]}>本功能仅允许公开 GitHub Release 的 HTTPS 链接和 GitHub 下载域名。为遵从当前升级设置，应用不执行 SHA-256 校验；请务必自行核对型号、目标平台与 sysupgrade 镜像。</Text></ToolNotice>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.back, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.backText, { color: colors.foreground }]}>返回</Text></Pressable>
  </ManagementShell>;
}

const styles = StyleSheet.create({
  cardBody: { padding: 15, gap: 10 }, caption: { fontSize: 12, lineHeight: 18 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 13 }, primary: { minHeight: 45, borderRadius: 11, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" }, status: { fontSize: 12, lineHeight: 18 }, error: { fontSize: 13, lineHeight: 19 }, releaseTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 }, releaseCopy: { flex: 1, minWidth: 0 }, releaseTitle: { fontSize: 15, fontWeight: "800" }, current: { fontSize: 13, lineHeight: 19, fontWeight: "700" }, assetList: { overflow: "hidden" }, assetRow: { minHeight: 67, flexDirection: "row", alignItems: "center", gap: 11, padding: 14 }, assetCopy: { flex: 1, minWidth: 0 }, assetName: { fontSize: 13, lineHeight: 18, fontWeight: "800" }, assetMeta: { fontSize: 11, marginTop: 3 }, back: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 11 }, backText: { fontSize: 14, fontWeight: "800" }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.46 },
});
