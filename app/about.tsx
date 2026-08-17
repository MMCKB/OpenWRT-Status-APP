import Constants from "expo-constants";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StyleSheet, Text, View } from "react-native";

import { ManagementShell } from "@/components/management-shell";
import { SectionCard } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";

export default function AboutScreen() {
  const colors = useColors();
  const version = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "1.0.7";

  return <ManagementShell title="关于" description="OpenWrt 路由器状态管理工具，面向可信局域网内的本地管理场景。">
    <SectionCard title="应用信息">
      <View style={styles.infoRow}>
        <View style={[styles.icon, { backgroundColor: colors.surface }]}><MaterialIcons name="router" size={23} color={colors.primary} /></View>
        <View style={styles.copy}><Text style={[styles.name, { color: colors.foreground }]}>OpenWrt 路由器状态</Text><Text style={[styles.version, { color: colors.muted }]}>版本 {version}</Text></View>
      </View>
    </SectionCard>
    <SectionCard title="功能说明">
      <Text style={[styles.paragraph, { color: colors.muted }]}>应用通过 LuCI ubus 与应用内 SSH 连接已保存的路由器，用于查看状态、实时流量、文件、软件包、固件升级与网络维护。</Text>
      <Text style={[styles.paragraph, { color: colors.muted }]}>路由器资料与凭证仅保存在当前设备。本应用不会将这些信息同步至云端；请仅在可信网络中使用。</Text>
    </SectionCard>
  </ManagementShell>;
}

const styles = StyleSheet.create({
  infoRow: { minHeight: 86, flexDirection: "row", alignItems: "center", gap: 13, padding: 15 },
  icon: { width: 50, height: 50, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 }, name: { fontSize: 17, fontWeight: "800" }, version: { fontSize: 13, marginTop: 5 },
  paragraph: { fontSize: 14, lineHeight: 21, paddingHorizontal: 15, paddingTop: 15 },
});
