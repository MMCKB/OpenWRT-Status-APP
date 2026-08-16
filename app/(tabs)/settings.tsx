import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SectionCard, sharedStyles } from "@/components/status-ui";
import { useRouterStore } from "@/lib/router-provider";

const intervals = [
  { label: "手动", value: 0 },
  { label: "30 秒", value: 30 },
  { label: "1 分钟", value: 60 },
  { label: "5 分钟", value: 300 },
];

export default function SettingsScreen() {
  const { settings, updateRefreshInterval } = useRouterStore();
  const router = useRouter();
  return (
    <View style={sharedStyles.screen}>
      <ScrollView contentContainerStyle={sharedStyles.content}>
        <View><Text style={styles.title}>设置</Text><Text style={styles.subtitle}>控制状态读取与本地数据</Text></View>
        <SectionCard title="状态刷新">
          <Text style={styles.cardDescription}>应用打开时会按此频率更新当前路由器。切换到后台后不会持续请求网络。</Text>
          <View style={styles.intervalGrid}>{intervals.map((interval) => {
            const selected = settings.refreshIntervalSeconds === interval.value;
            return <Pressable key={interval.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => void updateRefreshInterval(interval.value)} style={({ pressed }) => [styles.interval, selected && styles.intervalSelected, pressed && styles.intervalPressed]}><Text style={[styles.intervalText, selected && styles.intervalTextSelected]}>{interval.label}</Text></Pressable>;
          })}</View>
        </SectionCard>
        <SectionCard title="数据与隐私">
          <View style={styles.infoRow}><View style={styles.infoIcon}><MaterialIcons name="vpn-key" size={19} color="#007E7A" /></View><View style={styles.infoText}><Text style={styles.infoTitle}>凭证仅存储在本机</Text><Text style={styles.infoDescription}>LuCI 密码会保存在设备安全存储中；配置资料保存在本地，不会同步至云端。</Text></View></View>
          <View style={[styles.infoRow, styles.infoDivider]}><View style={styles.infoIcon}><MaterialIcons name="wifi" size={19} color="#007E7A" /></View><View style={styles.infoText}><Text style={styles.infoTitle}>仅访问已保存的路由器</Text><Text style={styles.infoDescription}>状态读取通过 OpenWrt 的 LuCI ubus 接口完成。请在可信局域网内使用。</Text></View></View>
        </SectionCard>
        <SectionCard title="维护">
          <Pressable accessibilityRole="button" accessibilityLabel="打开文件管理" onPress={() => router.push("/files" as never)} style={({ pressed }) => [styles.maintenanceRow, pressed && styles.intervalPressed]}>
            <View style={styles.infoIcon}><MaterialIcons name="folder-open" size={19} color="#007E7A" /></View>
            <View style={styles.infoText}><Text style={styles.infoTitle}>文件管理</Text><Text style={styles.infoDescription}>通过应用内 SSH 浏览、上传、编辑、复制、移动与管理路由器文件。</Text></View>
            <MaterialIcons name="chevron-right" size={20} color="#718398" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="打开软件包管理" onPress={() => router.push("/packages" as never)} style={({ pressed }) => [styles.maintenanceRow, pressed && styles.intervalPressed]}>
            <View style={styles.infoIcon}><MaterialIcons name="extension" size={19} color="#007E7A" /></View>
            <View style={styles.infoText}><Text style={styles.infoTitle}>软件包管理</Text><Text style={styles.infoDescription}>查看已安装系统包，搜索在线仓库并执行安装、卸载与更新。</Text></View>
            <MaterialIcons name="chevron-right" size={20} color="#718398" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="打开固件升级" onPress={() => router.push("/firmware" as never)} style={({ pressed }) => [styles.maintenanceRow, pressed && styles.intervalPressed]}>
            <View style={styles.infoIcon}><MaterialIcons name="system-update" size={19} color="#C77A00" /></View>
            <View style={styles.infoText}><Text style={styles.infoTitle}>固件升级</Text><Text style={styles.infoDescription}>选择 sysupgrade 镜像，经 SSH 上传后确认执行升级。</Text></View>
            <MaterialIcons name="chevron-right" size={20} color="#718398" />
          </Pressable>
        </SectionCard>
        <View style={styles.note}><MaterialIcons name="info-outline" size={18} color="#60758B" /><Text style={styles.noteText}>若使用 HTTP 管理地址，账户和状态数据在本地网络中并未加密。建议优先使用可信网络与 HTTPS。</Text></View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#102A43", fontSize: 28, fontWeight: "800" },
  subtitle: { color: "#60758B", fontSize: 14, marginTop: 5 },
  cardDescription: { color: "#5B6B7D", fontSize: 14, lineHeight: 20, paddingHorizontal: 15, paddingTop: 15 },
  intervalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 15 },
  interval: { borderRadius: 10, borderWidth: 1, borderColor: "#DDE7E9", minWidth: "46%", alignItems: "center", paddingVertical: 11 },
  intervalSelected: { backgroundColor: "#007E7A", borderColor: "#007E7A" },
  intervalPressed: { opacity: 0.72 },
  intervalText: { color: "#466075", fontSize: 13, fontWeight: "700" },
  intervalTextSelected: { color: "#FFFFFF" },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 15 },
  infoDivider: { borderTopWidth: 1, borderTopColor: "#EEF2F4" },
  maintenanceRow: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12, padding: 15 },
  infoIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#E6F5F4" },
  infoText: { flex: 1 },
  infoTitle: { color: "#203B55", fontSize: 14, fontWeight: "800" },
  infoDescription: { color: "#60758B", fontSize: 13, lineHeight: 19, marginTop: 4 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 14, backgroundColor: "#EEF3F6", borderRadius: 14 },
  noteText: { flex: 1, color: "#51697E", fontSize: 13, lineHeight: 19 },
});
