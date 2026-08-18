import Constants from "expo-constants";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Linking from "expo-linking";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppDialog } from "@/components/app-dialog";
import { ManagementShell } from "@/components/management-shell";
import { SectionCard } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";

const GITHUB_REPOSITORY_URL = "https://github.com/MMCKB/OpenWRT-Status-APP";

export default function AboutScreen() {
  const colors = useColors();
  const version = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "1.0.7";
  const openRepository = async () => {
    try {
      await Linking.openURL(GITHUB_REPOSITORY_URL);
    } catch {
      AppDialog.alert("无法打开 GitHub", "请检查设备网络或稍后再试。");
    }
  };

  return <ManagementShell title="关于" description="">
    <SectionCard title="应用信息">
      <View style={styles.infoRow}>
        <View style={[styles.icon, { backgroundColor: colors.surface }]}><MaterialIcons name="router" size={23} color={colors.primary} /></View>
        <View style={styles.copy}><Text style={[styles.name, { color: colors.foreground }]}>OpenWrt 路由器状态</Text><Text style={[styles.version, { color: colors.muted }]}>版本 {version}</Text></View>
      </View>
    </SectionCard>
    <SectionCard title="项目地址">
      <Pressable accessibilityRole="link" accessibilityLabel="打开 GitHub 仓库" onPress={() => void openRepository()} style={({ pressed }) => [styles.repositoryRow, { borderColor: colors.border }, pressed && styles.pressed]}>
        <View style={[styles.repositoryIcon, { backgroundColor: colors.surface }]}><MaterialIcons name="code" size={21} color={colors.primary} /></View>
        <View style={styles.copy}><Text style={[styles.repositoryTitle, { color: colors.foreground }]}>GitHub 仓库</Text><Text numberOfLines={1} style={[styles.repositoryUrl, { color: colors.muted }]}>MMCKB/OpenWRT-Status-APP</Text></View>
        <MaterialIcons name="open-in-new" size={20} color={colors.muted} />
      </Pressable>
    </SectionCard>
  </ManagementShell>;
}

const styles = StyleSheet.create({
  infoRow: { minHeight: 86, flexDirection: "row", alignItems: "center", gap: 13, padding: 15 },
  icon: { width: 50, height: 50, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 }, name: { fontSize: 17, fontWeight: "800" }, version: { fontSize: 13, marginTop: 5 },
  repositoryRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15, borderWidth: StyleSheet.hairlineWidth },
  repositoryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  repositoryTitle: { fontSize: 14, fontWeight: "800" }, repositoryUrl: { fontSize: 12, marginTop: 4 }, pressed: { opacity: 0.7 },
});
