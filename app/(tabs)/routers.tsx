import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState, sharedStyles, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useRouterStore } from "@/lib/router-provider";
import type { RouterProfile } from "@/shared/router-types";

export default function RoutersScreen() {
  const router = useRouter();
  const colors = useColors();
  const isDark = useColorScheme() === "dark";
  const { profiles, selectedProfile, setSelectedRouter } = useRouterStore();
  const softPrimary = isDark ? "#1C485C" : "#E6F5F4";
  const selectedSurface = isDark ? "#1A4055" : "#FBFEFE";

  function renderItem({ item }: { item: RouterProfile }) {
    const isSelected = item.id === selectedProfile?.id;
    return <Pressable accessibilityRole="button" accessibilityLabel={`选择路由器 ${item.name}`} onPress={() => void setSelectedRouter(item.id)} style={({ pressed }) => [styles.routerCard, { backgroundColor: isSelected ? selectedSurface : colors.surface, borderColor: isSelected ? colors.primary : colors.border }, pressed && styles.cardPressed]}><View style={[styles.routerIcon, { backgroundColor: softPrimary }]}><MaterialIcons name="router" size={23} color={colors.primary} /></View><View style={styles.cardBody}><View style={styles.nameRow}><Text style={[styles.routerName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>{isSelected ? <StatusPill label="当前" tone="success" /> : null}</View><Text style={[styles.routerUrl, { color: colors.muted }]} numberOfLines={1}>{item.baseUrl}</Text><Text style={[styles.routerUser, { color: colors.muted }]}>账户：{item.username}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`编辑 ${item.name}`} onPress={(event) => { event.stopPropagation(); router.push({ pathname: "/router-form" as never, params: { id: item.id } } as never); }} style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.65, backgroundColor: softPrimary }]}><MaterialIcons name="edit" size={18} color={colors.muted} /></Pressable></Pressable>;
  }

  return <View style={[sharedStyles.screen, { backgroundColor: colors.background }]}><View style={styles.header}><View><Text style={[styles.title, { color: colors.foreground }]}>路由器</Text><Text style={[styles.subtitle, { color: colors.muted }]}>选择要查看的 OpenWrt 设备</Text></View></View><FlatList data={profiles} renderItem={renderItem} keyExtractor={(item) => item.id} contentContainerStyle={profiles.length ? styles.listContent : styles.emptyList} ListEmptyComponent={<EmptyState icon="router" title="还没有保存路由器" description="添加 LuCI 管理地址与账户信息，状态页将只显示真实读取的数据。" />} /><View style={styles.bottomAction}><Pressable accessibilityRole="button" accessibilityLabel="添加路由器" onPress={() => router.push("/router-form" as never)} style={({ pressed }) => [sharedStyles.primaryButton, pressed && sharedStyles.primaryButtonPressed]}><View style={styles.buttonRow}><MaterialIcons name="add" size={20} color="#FFFFFF" /><Text style={sharedStyles.primaryButtonText}>添加路由器</Text></View></Pressable></View></View>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 16 }, title: { fontSize: 28, fontWeight: "800" }, subtitle: { fontSize: 14, marginTop: 5 }, listContent: { paddingHorizontal: 20, paddingBottom: 96, gap: 11 }, emptyList: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingBottom: 96 },
  routerCard: { flexDirection: "row", alignItems: "center", minHeight: 92, borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 }, cardPressed: { opacity: 0.75 }, routerIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" }, cardBody: { flex: 1, minWidth: 0 }, nameRow: { flexDirection: "row", alignItems: "center", gap: 7 }, routerName: { fontSize: 16, fontWeight: "800", flexShrink: 1 }, routerUrl: { fontSize: 12, marginTop: 4 }, routerUser: { fontSize: 12, marginTop: 2 }, editButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  bottomAction: { position: "absolute", left: 20, right: 20, bottom: 18 }, buttonRow: { flexDirection: "row", alignItems: "center", gap: 7 },
});
