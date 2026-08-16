import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import { EmptyState } from "@/components/status-ui";
import { connectInAppSsh, disconnectInAppSsh, getInAppSshTarget, isInAppSshSupported, runInAppSshCommand } from "@/lib/native-ssh";
import {
  buildOpkgListInstalledCommand,
  buildOpkgSearchCommand,
  buildOpkgInstallCommand,
  buildOpkgRemoveCommand,
  buildOpkgUpdateCommand,
  parseInstalledPackages,
  parseAvailablePackages,
  type OpkgPackage,
} from "@/lib/router-package-commands";
import { useRouterStore } from "@/lib/router-provider";

type ConnectionState = "idle" | "connecting" | "connected" | "error";
type TabFilter = "installed" | "search";

export default function PackagesScreen() {
  const router = useRouter();
  const { profiles, selectedProfile, getSelectedCredentials } = useRouterStore();

  const profile = selectedProfile ?? profiles[0];
  const target = profile ? getInAppSshTarget(profile) : "root@localhost:22";

  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [notice, setNotice] = useState<string>("连接后即可管理路由器系统软件包。");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<TabFilter>("installed");
  const [installedPackages, setInstalledPackages] = useState<OpkgPackage[]>([]);
  const [availablePackages, setAvailablePackages] = useState<OpkgPackage[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isActionModalVisible, setIsActionModalVisible] = useState<boolean>(false);
  const [actionOutput, setActionOutput] = useState<string>("");

  const isConnected = connection === "connected";

  useEffect(() => () => { void disconnectInAppSsh(); }, []);

  if (!profile) {
    return (
      <View style={styles.blankScreen}>
        <View style={styles.nav}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回设置" onPress={() => router.back()} style={styles.back}>
            <MaterialIcons name="arrow-back" size={22} color="#203B55" />
          </Pressable>
          <Text style={styles.navTitleText}>软件包管理</Text>
          <View style={styles.navSpacer} />
        </View>
        <EmptyState icon="extension" title="还没有可管理的路由器" description="请先在“路由器”中保存 OpenWrt 的连接资料。" />
      </View>
    );
  }

  async function connect() {
    setConnection("connecting");
    setNotice(`正在连接 ${target}…`);
    try {
      const credentials = await getSelectedCredentials();
      if (!credentials) throw new Error("未找到本机保存的 SSH 密码，请编辑路由器资料后再试。");
      await connectInAppSsh(profile!, credentials.sshPassword);
      setConnection("connected");
      setNotice("SSH 已连接，正在加载已安装软件包...");
      await loadInstalledPackages();
    } catch (error) {
      setConnection("error");
      setNotice(error instanceof Error ? error.message : "连接失败。");
    }
  }

  async function disconnect() {
    try {
      await disconnectInAppSsh();
    } catch {}
    setConnection("idle");
    setNotice("已断开 SSH 连接。");
    setInstalledPackages([]);
  }

  async function loadInstalledPackages() {
    if (!isConnected || isBusy) return;
    setIsLoading(true);
    try {
      const output = await runInAppSshCommand(buildOpkgListInstalledCommand());
      const parsed = parseInstalledPackages(output);
      setInstalledPackages(parsed);
      setNotice(`已加载 ${parsed.length} 个系统软件包。`);
    } catch (error) {
      Alert.alert("加载失败", error instanceof Error ? error.message : "无法获取已安装软件包。");
    } finally {
      setIsLoading(false);
    }
  }

  async function updateRepository() {
    if (!isConnected || isBusy) return;
    setIsBusy(true);
    setNotice("正在更新软件源列表 (opkg update)...");
    try {
      await runInAppSshCommand(buildOpkgUpdateCommand());
      setNotice("软件源列表更新成功。");
      Alert.alert("更新成功", "系统软件源列表已刷新。");
      if (activeTab === "search" && searchQuery) {
        await executeSearch(searchQuery);
      }
    } catch (error) {
      Alert.alert("更新失败", error instanceof Error ? error.message : "无法更新软件源。");
    } finally {
      setIsBusy(false);
    }
  }

  async function executeSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      setAvailablePackages([]);
      return;
    }
    if (!isConnected || isBusy) return;
    setIsLoading(true);
    try {
      const output = await runInAppSshCommand(buildOpkgSearchCommand(trimmed));
      const installedMap = new Set(installedPackages.map((p) => p.name));
      const parsed = parseAvailablePackages(output, installedMap);
      setAvailablePackages(parsed);
      setNotice(`找到 ${parsed.length} 个相关软件包。`);
    } catch (error) {
      Alert.alert("搜索失败", error instanceof Error ? error.message : "无法查询软件包。");
    } finally {
      setIsLoading(false);
    }
  }

  function confirmInstall(pkg: OpkgPackage) {
    Alert.alert("确认安装", `确定要安装软件包 "${pkg.name}" (${pkg.version}) 吗？`, [
      { text: "取消", style: "cancel" },
      { text: "安装", onPress: () => void runPackageAction(buildOpkgInstallCommand(pkg.name), `已成功安装 ${pkg.name}`) },
    ]);
  }

  function confirmRemove(pkg: OpkgPackage) {
    Alert.alert("确认卸载", `确定要卸载软件包 "${pkg.name}" 吗？这可能会影响依赖它的功能。`, [
      { text: "取消", style: "cancel" },
      { text: "卸载", style: "destructive", onPress: () => void runPackageAction(buildOpkgRemoveCommand(pkg.name), `已成功卸载 ${pkg.name}`) },
    ]);
  }

  async function runPackageAction(command: string, successMessage: string) {
    setIsBusy(true);
    setActionOutput(`执行命令: ${command}\n正在处理...\n`);
    setIsActionModalVisible(true);
    try {
      const output = await runInAppSshCommand(command);
      setActionOutput(`执行命令: ${command}\n\n[执行结果]\n${output}\n\n${successMessage}`);
      setNotice(successMessage);
      await loadInstalledPackages();
      if (activeTab === "search" && searchQuery) {
        await executeSearch(searchQuery);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "操作执行失败。";
      setActionOutput(`执行命令: ${command}\n\n[错误]\n${msg}`);
      Alert.alert("执行失败", msg);
    } finally {
      setIsBusy(false);
    }
  }

  const displayedPackages = activeTab === "installed"
    ? installedPackages.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.description.toLowerCase().includes(searchTerm.toLowerCase()))
    : availablePackages;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回设置" onPress={() => router.back()} style={styles.back}>
          <MaterialIcons name="arrow-back" size={22} color="#203B55" />
        </Pressable>
        <View style={styles.navCopy}>
          <Text style={styles.navTitleText}>软件包管理</Text>
          <Text style={styles.target} numberOfLines={1}>{profile.name} ({target})</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="更新软件包源列表" disabled={!isConnected || isBusy} onPress={() => void updateRepository()} style={({ pressed }) => [styles.refreshButton, (!isConnected || isBusy) && styles.disabled, pressed && styles.pressed]}>
          {isBusy ? <ActivityIndicator size="small" color="#007E7A" /> : <MaterialIcons name="system-update-alt" size={21} color="#007E7A" />}
        </Pressable>
      </View>

      <View style={styles.connectionCard}>
        <View style={styles.connectionCopy}>
          <Text style={styles.connectionLabel}>{connection === "connected" ? "SSH 已连接" : connection === "connecting" ? "正在连接" : connection === "error" ? "连接失败" : "SSH 未连接"}</Text>
          <Text style={styles.notice} numberOfLines={2}>{notice}</Text>
        </View>
        {isConnected ? (
          <Pressable accessibilityRole="button" accessibilityLabel="断开 SSH" onPress={disconnect} style={({ pressed }) => [styles.disconnectButton, pressed && styles.pressed]}>
            <Text style={styles.disconnectText}>断开</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="连接 SSH" disabled={isBusy || !isInAppSshSupported()} onPress={() => void connect()} style={({ pressed }) => [styles.connectButton, (isBusy || !isInAppSshSupported()) && styles.disabled, pressed && styles.pressed]}>
            {connection === "connecting" ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.connectText}>连接</Text>}
          </Pressable>
        )}
      </View>

      <View style={styles.tabRow}>
        <Pressable accessibilityRole="button" onPress={() => setActiveTab("installed")} style={[styles.tabButton, activeTab === "installed" && styles.activeTabButton]}>
          <MaterialIcons name="inventory" size={17} color={activeTab === "installed" ? "#007E7A" : "#60758B"} />
          <Text style={[styles.tabButtonText, activeTab === "installed" && styles.activeTabButtonText]}>已安装 ({installedPackages.length})</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setActiveTab("search")} style={[styles.tabButton, activeTab === "search" && styles.activeTabButton]}>
          <MaterialIcons name="search" size={17} color={activeTab === "search" ? "#007E7A" : "#60758B"} />
          <Text style={[styles.tabButtonText, activeTab === "search" && styles.activeTabButtonText]}>仓库搜索</Text>
        </Pressable>
      </View>

      {activeTab === "installed" ? (
        <View style={styles.searchCard}>
          <TextInput
            accessibilityLabel="筛选已安装软件包"
            style={styles.searchInput}
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="在已安装包中筛选..."
            placeholderTextColor="#8B9AA8"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      ) : (
        <View style={styles.searchCard}>
          <View style={styles.searchRow}>
            <TextInput
              accessibilityLabel="搜索仓库软件包"
              style={[styles.searchInput, { flex: 1 }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="输入关键词搜索在线仓库 (如 luci, curl)..."
              placeholderTextColor="#8B9AA8"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => void executeSearch(searchQuery)}
            />
            <Pressable accessibilityRole="button" disabled={!isConnected || isBusy} onPress={() => void executeSearch(searchQuery)} style={({ pressed }) => [styles.searchAction, (!isConnected || isBusy) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.searchActionText}>搜索</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.directorySection}>
        <View style={styles.listHeader}>
          <View style={styles.listHeaderCopy}>
            <Text style={styles.listTitle}>{activeTab === "installed" ? "已安装软件包列表" : "仓库搜索结果"}</Text>
            <Text style={styles.listSubtitle}>{displayedPackages.length} 个结果</Text>
          </View>
        </View>

        <FlatList
          data={displayedPackages}
          keyExtractor={(item) => item.name}
          style={styles.list}
          contentContainerStyle={[styles.listContent, !displayedPackages.length && styles.emptyListContent]}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void (activeTab === "installed" ? loadInstalledPackages() : executeSearch(searchQuery))} enabled={isConnected && !isBusy} tintColor="#007E7A" />}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <MaterialIcons name="extension" size={32} color="#91A5B3" />
              <Text style={styles.emptyListTitle}>{isConnected ? (activeTab === "installed" ? "没有找到匹配的软件包" : "请输入关键词搜索仓库包") : "连接 SSH 后管理软件包"}</Text>
              <Text style={styles.emptyListText}>{isConnected ? "尝试更换关键词或更新源列表。" : "连接路由器后，系统软件包将在此显示。"}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.entry}>
              <View style={[styles.entryIcon, item.installed && styles.installedIcon]}>
                <MaterialIcons name={item.installed ? "check" : "extension"} size={20} color={item.installed ? "#007E7A" : "#5E7182"} />
              </View>
              <View style={styles.entryCopy}>
                <View style={styles.entryTitleRow}>
                  <Text style={styles.entryName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.entryVersion} numberOfLines={1}>{item.version}</Text>
                </View>
                <Text style={styles.entryMeta} numberOfLines={2}>{item.description}</Text>
              </View>
              <View style={styles.entryActionRow}>
                {item.installed ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`卸载 ${item.name}`} disabled={isBusy} onPress={() => confirmRemove(item)} style={({ pressed }) => [styles.removeButton, isBusy && styles.disabled, pressed && styles.pressed]}>
                    <Text style={styles.removeButtonText}>卸载</Text>
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`安装 ${item.name}`} disabled={isBusy} onPress={() => confirmInstall(item)} style={({ pressed }) => [styles.installButton, isBusy && styles.disabled, pressed && styles.pressed]}>
                    <Text style={styles.installButtonText}>安装</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        />
      </View>

      <Modal transparent animationType="fade" visible={isActionModalVisible} onRequestClose={() => setIsActionModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.actionModal}>
            <Text style={styles.actionModalTitle}>操作执行详情</Text>
            <TextInput style={styles.outputBox} multiline editable={false} value={actionOutput} />
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={() => setIsActionModalVisible(false)} style={styles.confirmModal}>
                <Text style={styles.confirmModalText}>关闭</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FA" },
  blankScreen: { flex: 1, backgroundColor: "#F6F8FA" },
  nav: { minHeight: 58, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#F6F8FA" },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#EAF1F5", alignItems: "center", justifyContent: "center" },
  navCopy: { flex: 1, minWidth: 0 },
  navTitleText: { color: "#203B55", fontSize: 17, fontWeight: "800" },
  navSpacer: { width: 38 },
  target: { color: "#718398", fontSize: 11, marginTop: 2, fontVariant: ["tabular-nums"] },
  refreshButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#E6F5F4", alignItems: "center", justifyContent: "center" },
  connectionCard: { marginHorizontal: 20, marginTop: 4, padding: 13, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: "#DDE7E9" },
  connectionCopy: { flex: 1, minWidth: 0 },
  connectionLabel: { color: "#203B55", fontSize: 13, fontWeight: "800" },
  notice: { color: "#60758B", fontSize: 12, lineHeight: 17, marginTop: 3 },
  connectButton: { minWidth: 68, minHeight: 34, paddingHorizontal: 12, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#007E7A" },
  connectText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  disconnectButton: { minWidth: 60, minHeight: 34, paddingHorizontal: 10, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#C5D2D9" },
  disconnectText: { color: "#466075", fontSize: 13, fontWeight: "800" },
  tabRow: { marginHorizontal: 20, marginTop: 12, flexDirection: "row", gap: 10 },
  tabButton: { flex: 1, minHeight: 40, paddingHorizontal: 12, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE7E9" },
  activeTabButton: { backgroundColor: "#E6F5F4", borderColor: "#007E7A" },
  tabButtonText: { color: "#60758B", fontSize: 13, fontWeight: "700" },
  activeTabButtonText: { color: "#007E7A", fontSize: 13, fontWeight: "800" },
  searchCard: { marginHorizontal: 20, marginTop: 10, padding: 10, backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#DDE7E9" },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: { width: "100%", minHeight: 40, borderRadius: 9, borderWidth: 1, borderColor: "#D8E2E8", paddingHorizontal: 12, color: "#203B55", fontSize: 13 },
  searchAction: { minWidth: 62, minHeight: 40, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#007E7A" },
  searchActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  directorySection: { flex: 1, minHeight: 260, marginTop: 10 },
  listHeader: { marginHorizontal: 20, paddingHorizontal: 15, paddingVertical: 12, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderTopLeftRadius: 15, borderTopRightRadius: 15, borderWidth: 1, borderBottomWidth: 0, borderColor: "#DDE7E9" },
  listHeaderCopy: { flex: 1, minWidth: 0 },
  listTitle: { color: "#304B64", fontSize: 14, fontWeight: "800" },
  listSubtitle: { color: "#718398", fontSize: 11, marginTop: 3 },
  list: { flex: 1, marginHorizontal: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE7E9", borderBottomLeftRadius: 15, borderBottomRightRadius: 15, overflow: "hidden" },
  listContent: { paddingBottom: 28 },
  emptyListContent: { flexGrow: 1 },
  entry: { minHeight: 74, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#EEF2F4" },
  entryIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF3F6" },
  installedIcon: { backgroundColor: "#E6F5F4" },
  entryCopy: { flex: 1, minWidth: 0 },
  entryTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  entryName: { color: "#203B55", fontSize: 13, fontWeight: "800", flexShrink: 1 },
  entryVersion: { color: "#718398", fontSize: 11, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  entryMeta: { color: "#60758B", fontSize: 11, marginTop: 4, lineHeight: 15 },
  entryActionRow: { alignItems: "flex-end" },
  installButton: { minWidth: 54, minHeight: 32, paddingHorizontal: 10, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#007E7A" },
  installButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  removeButton: { minWidth: 54, minHeight: 32, paddingHorizontal: 10, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0F0", borderWidth: 1, borderColor: "#F5C6C6" },
  removeButtonText: { color: "#B13939", fontSize: 12, fontWeight: "800" },
  emptyList: { alignItems: "center", justifyContent: "center", padding: 34, gap: 6 },
  emptyListTitle: { color: "#304B64", fontSize: 15, fontWeight: "800", marginTop: 3 },
  emptyListText: { color: "#718398", fontSize: 12, textAlign: "center" },
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(12, 34, 51, 0.42)" },
  actionModal: { width: "100%", maxWidth: 450, maxHeight: "80%", backgroundColor: "#FFFFFF", borderRadius: 18, padding: 20 },
  actionModalTitle: { color: "#203B55", fontSize: 16, fontWeight: "800" },
  outputBox: { width: "100%", height: 220, marginTop: 12, borderRadius: 10, borderWidth: 1, borderColor: "#D8E2E8", backgroundColor: "#0F1E2E", color: "#64D2FF", padding: 12, fontSize: 12, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  modalActions: { marginTop: 15, flexDirection: "row", justifyContent: "flex-end" },
  confirmModal: { minHeight: 38, paddingHorizontal: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#007E7A" },
  confirmModalText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
});
