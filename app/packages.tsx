import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppDialog as Alert } from "@/components/app-dialog";
import { MaterialIcons } from "@expo/vector-icons";

import { EmptyState } from "@/components/status-ui";
import {
  connectInAppSsh,
  disconnectInAppSsh,
  getInAppSshTarget,
  isInAppSshSupported,
  runInAppSshCommand,
} from "@/lib/native-ssh";
import {
  buildApkListInstalledCommand,
  buildApkListUpgradableCommand,
  buildApkListAvailableCommand,
  buildApkUpgradeCommand,
  buildApkUpgradePackageCommand,
  buildApkInstallCommand,
  buildApkRemoveCommand,
  buildApkUpdateCommand,
  buildApkRepositoriesSnapshotCommand,
  buildApkSaveRepositoriesCommand,
  APK_CUSTOM_FEEDS_SOURCE,
  parseInstalledPackages,
  parseUpgradablePackages,
  parseAvailablePackages,
  parseApkRepositories,
  type ApkRepository,
  type ApkPackage,
} from "@/lib/router-package-commands";
import { useRouterStore } from "@/lib/router-provider";
import { useThemedStyles } from "@/lib/use-themed-styles";

type ConnectionState = "idle" | "connecting" | "connected" | "error";
type TabFilter = "installed" | "updates" | "available";
const APK_REPOSITORIES_HELP =
  "需读取 /etc/apk/repositories.d/customfeeds.list 和 /etc/apk/repositories.d/distfeed。";

export default function PackagesScreen() {
  const styles = useThemedStyles(baseStyles);
  const router = useRouter();
  const { profiles, selectedProfile, getSelectedCredentials } =
    useRouterStore();

  const profile = selectedProfile ?? profiles[0];
  const target = profile ? getInAppSshTarget(profile) : "root@localhost:22";

  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [notice, setNotice] =
    useState<string>("连接后即可管理路由器系统软件包。");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<TabFilter>("installed");
  const [installedPackages, setInstalledPackages] = useState<ApkPackage[]>([]);
  const [upgradablePackages, setUpgradablePackages] = useState<ApkPackage[]>(
    [],
  );
  const [availablePackages, setAvailablePackages] = useState<ApkPackage[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [repositories, setRepositories] = useState<ApkRepository[]>([]);
  const [isRepositoriesModalVisible, setIsRepositoriesModalVisible] =
    useState<boolean>(false);
  const [newRepositoryUrl, setNewRepositoryUrl] = useState<string>("");

  const [isActionModalVisible, setIsActionModalVisible] =
    useState<boolean>(false);
  const [actionOutput, setActionOutput] = useState<string>("");

  const isConnected = connection === "connected";

  if (!profile) {
    return (
      <View style={styles.blankScreen}>
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回设置"
            onPress={() => router.back()}
            style={styles.back}
          >
            <MaterialIcons name="arrow-back" size={22} color="#203B55" />
          </Pressable>
          <Text style={styles.navTitleText}>软件包管理</Text>
          <View style={styles.navSpacer} />
        </View>
        <EmptyState
          icon="extension"
          title="还没有可管理的路由器"
          description="请先在“路由器”中保存 OpenWrt 的连接资料。"
        />
      </View>
    );
  }

  async function connect() {
    setConnection("connecting");
    setNotice(`正在连接 ${target}…`);
    try {
      const credentials = await getSelectedCredentials();
      if (!credentials)
        throw new Error("未找到本机保存的 SSH 密码，请编辑路由器资料后再试。");
      await connectInAppSsh(profile!, credentials.sshPassword);
      setConnection("connected");
      setNotice("SSH 已连接，正在加载 apk 软件包信息...");
      await loadInstalledPackages();
      await loadUpgradablePackages();
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
    setUpgradablePackages([]);
    setAvailablePackages([]);
    setRepositories([]);
  }

  async function loadInstalledPackages(): Promise<ApkPackage[]> {
    if (isLoading) return [];
    setIsLoading(true);
    try {
      const output = await runInAppSshCommand(buildApkListInstalledCommand());
      const parsed = parseInstalledPackages(output);
      setInstalledPackages(parsed);
      setNotice(`已加载 ${parsed.length} 个系统软件包。`);
      return parsed;
    } catch (error) {
      Alert.alert(
        "加载失败",
        error instanceof Error ? error.message : "无法获取已安装软件包。",
      );
      return [];
    } finally {
      setIsLoading(false);
    }
  }

  async function loadUpgradablePackages(): Promise<ApkPackage[]> {
    if (isLoading) return [];
    setIsLoading(true);
    try {
      const output = await runInAppSshCommand(buildApkListUpgradableCommand());
      const parsed = parseUpgradablePackages(output);
      setUpgradablePackages(parsed);
      setNotice(
        parsed.length
          ? `发现 ${parsed.length} 个可更新软件包。`
          : "当前没有可更新的软件包。",
      );
      return parsed;
    } catch (error) {
      Alert.alert(
        "读取更新列表失败",
        error instanceof Error ? error.message : "无法获取可更新软件包。",
      );
      return [];
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAvailablePackages(
    installedList = installedPackages,
  ): Promise<ApkPackage[]> {
    if (isLoading) return [];
    setIsLoading(true);
    try {
      const output = await runInAppSshCommand(buildApkListAvailableCommand());
      const parsed = parseAvailablePackages(
        output,
        new Set(installedList.map((item) => item.name)),
      );
      setAvailablePackages(parsed);
      setNotice(`已载入仓库中的 ${parsed.length} 个软件包。`);
      return parsed;
    } catch (error) {
      Alert.alert(
        "读取仓库列表失败",
        error instanceof Error ? error.message : "无法获取软件包仓库列表。",
      );
      return [];
    } finally {
      setIsLoading(false);
    }
  }

  async function updateRepository() {
    if (!isConnected || isBusy) return;
    setIsBusy(true);
    setNotice("正在更新 apk 软件源列表...");
    try {
      const output = await runInAppSshCommand(buildApkUpdateCommand());
      const installed = await loadInstalledPackages();
      const updates = await loadUpgradablePackages();
      const available = await loadAvailablePackages(installed);
      setActiveTab("available");
      setNotice(
        `软件源更新完成，已载入 ${available.length} 个仓库软件包${updates.length ? `，发现 ${updates.length} 个可更新软件包。` : "。"}`,
      );
      const cleanOutput = (output || "软件源已更新完成，无详细输出。").trim();
      const preview = updates
        .slice(0, 16)
        .map((pkg) => `• ${pkg.name}  ${pkg.version}`)
        .join("\n");
      setActionOutput(
        `[软件源更新输出]\n${cleanOutput.length > 1200 ? cleanOutput.slice(0, 1200) + "\n...(输出过长已截断)" : cleanOutput}\n\n[完整仓库列表：${available.length} 个软件包]\n[可更新软件包：${updates.length}]${preview ? `\n${preview}${updates.length > 16 ? "\n…" : ""}` : "\n当前没有可更新软件包。"}`,
      );
      setIsActionModalVisible(true);
    } catch (error) {
      Alert.alert(
        "更新失败",
        error instanceof Error ? error.message : "无法更新软件源。",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function selectTab(tab: TabFilter) {
    setActiveTab(tab);
    if (tab === "available" && isConnected && !availablePackages.length) {
      await loadAvailablePackages();
    }
  }

  async function openRepositories() {
    if (!isConnected || isLoading || isBusy) return;
    setIsRepositoriesModalVisible(true);
    setIsLoading(true);
    try {
      const output = await runInAppSshCommand(
        buildApkRepositoriesSnapshotCommand(),
      );
      const parsed = parseApkRepositories(output);
      setRepositories(parsed);
      setNotice(
        parsed.length
          ? `已读取 ${parsed.length} 个 APK 仓库配置。`
          : `读取不到 APK 仓库配置。${APK_REPOSITORIES_HELP}`,
      );
    } catch (error) {
      Alert.alert(
        "读取仓库配置失败",
        error instanceof Error
          ? `${error.message}\n\n${APK_REPOSITORIES_HELP}`
          : `读取不到 APK 仓库配置。${APK_REPOSITORIES_HELP}`,
      );
      setIsRepositoriesModalVisible(false);
    } finally {
      setIsLoading(false);
    }
  }

  function addRepository() {
    const url = newRepositoryUrl.trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) {
      Alert.alert(
        "仓库地址无效",
        "请输入以 http:// 或 https:// 开头的完整仓库地址。",
      );
      return;
    }
    if (repositories.some((repository) => repository.url === url)) {
      Alert.alert("仓库地址重复", "该仓库已经在配置列表中。");
      return;
    }
    setRepositories((current) => [
      ...current,
      {
        line: Date.now(),
        url,
        enabled: true,
        source: APK_CUSTOM_FEEDS_SOURCE,
      },
    ]);
    setNewRepositoryUrl("");
  }

  async function saveRepositories() {
    if (!isConnected || isBusy) return;
    setIsBusy(true);
    try {
      const command = buildApkSaveRepositoriesCommand(repositories);
      const output = await runInAppSshCommand(command);
      const installed = await loadInstalledPackages();
      const updates = await loadUpgradablePackages();
      const available = await loadAvailablePackages(installed);
      setIsRepositoriesModalVisible(false);
      setActionOutput(
        `[APK 仓库配置已保存]\n${(output || "仓库配置已写入并更新索引。").trim()}\n\n已重新载入 ${available.length} 个仓库软件包；当前可更新 ${updates.length} 个。`,
      );
      setIsActionModalVisible(true);
      setActiveTab("available");
      setNotice("APK 仓库配置已保存并更新软件包索引。");
    } catch (error) {
      Alert.alert(
        "保存仓库配置失败",
        error instanceof Error ? error.message : "无法保存 APK 仓库配置。",
      );
    } finally {
      setIsBusy(false);
    }
  }

  function confirmInstall(pkg: ApkPackage) {
    Alert.alert(
      "确认安装",
      `确定要安装软件包 "${pkg.name}" (${pkg.version}) 吗？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "安装",
          onPress: () =>
            void runPackageAction(
              buildApkInstallCommand(pkg.name),
              `已成功安装 ${pkg.name}`,
            ),
        },
      ],
    );
  }

  function confirmUpgrade(pkg: ApkPackage) {
    Alert.alert("确认更新", `确定要更新软件包 "${pkg.name}" 吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "更新",
        onPress: () =>
          void runPackageAction(
            buildApkUpgradePackageCommand(pkg.name),
            `已成功更新 ${pkg.name}`,
          ),
      },
    ]);
  }

  function confirmRemove(pkg: ApkPackage) {
    Alert.alert(
      "确认卸载",
      `确定要卸载软件包 "${pkg.name}" 吗？这可能会影响依赖它的功能。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "卸载",
          style: "destructive",
          onPress: () =>
            void runPackageAction(
              buildApkRemoveCommand(pkg.name),
              `已成功卸载 ${pkg.name}`,
            ),
        },
      ],
    );
  }

  async function runPackageAction(command: string, successMessage: string) {
    setIsBusy(true);
    setActionOutput(`执行命令: ${command}\n正在处理...\n`);
    setIsActionModalVisible(true);
    try {
      const output = await runInAppSshCommand(command);
      setActionOutput(
        `执行命令: ${command}\n\n[执行结果]\n${output}\n\n${successMessage}`,
      );
      setNotice(successMessage);
      const installed = await loadInstalledPackages();
      await loadUpgradablePackages();
      if (availablePackages.length) {
        await loadAvailablePackages(installed);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "操作执行失败。";
      setActionOutput(`执行命令: ${command}\n\n[错误]\n${msg}`);
      Alert.alert("执行失败", msg);
    } finally {
      setIsBusy(false);
    }
  }

  const localQuery = searchTerm.trim().toLowerCase();
  const matchesLocalQuery = (pkg: ApkPackage) =>
    !localQuery ||
    pkg.name.toLowerCase().includes(localQuery) ||
    pkg.description.toLowerCase().includes(localQuery);
  const displayedPackages =
    activeTab === "installed"
      ? installedPackages.filter(matchesLocalQuery)
      : activeTab === "updates"
        ? upgradablePackages.filter(matchesLocalQuery)
        : availablePackages.filter(matchesLocalQuery);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回设置"
          onPress={() => router.back()}
          style={styles.back}
        >
          <MaterialIcons name="arrow-back" size={22} color="#203B55" />
        </Pressable>
        <View style={styles.navCopy}>
          <Text style={styles.navTitleText}>软件包管理</Text>
          <Text style={styles.target} numberOfLines={1}>
            {profile.name} ({target})
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="更新软件包源列表"
          disabled={!isConnected || isBusy}
          onPress={() => void updateRepository()}
          style={({ pressed }) => [
            styles.refreshButton,
            (!isConnected || isBusy) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#007E7A" />
          ) : (
            <MaterialIcons name="system-update-alt" size={18} color="#007E7A" />
          )}
          <Text style={styles.refreshText}>更新源</Text>
        </Pressable>
      </View>

      <View style={styles.connectionCard}>
        <View style={styles.connectionCopy}>
          <Text style={styles.connectionLabel}>
            {connection === "connected"
              ? "SSH 已连接"
              : connection === "connecting"
                ? "正在连接"
                : connection === "error"
                  ? "连接失败"
                  : "SSH 未连接"}
          </Text>
          <Text style={styles.notice} numberOfLines={2}>
            {notice}
          </Text>
        </View>
        {isConnected ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="断开 SSH"
            onPress={disconnect}
            style={({ pressed }) => [
              styles.disconnectButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.disconnectText}>断开</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="连接 SSH"
            disabled={isBusy || !isInAppSshSupported()}
            onPress={() => void connect()}
            style={({ pressed }) => [
              styles.connectButton,
              (isBusy || !isInAppSshSupported()) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {connection === "connecting" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.connectText}>连接</Text>
            )}
          </Pressable>
        )}
      </View>

      <View style={styles.tabRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void selectTab("installed")}
          style={[
            styles.tabButton,
            activeTab === "installed" && styles.activeTabButton,
          ]}
        >
          <MaterialIcons
            name="inventory"
            size={17}
            color={activeTab === "installed" ? "#007E7A" : "#60758B"}
          />
          <Text
            style={[
              styles.tabButtonText,
              activeTab === "installed" && styles.activeTabButtonText,
            ]}
          >
            已安装 ({installedPackages.length})
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void selectTab("updates")}
          style={[
            styles.tabButton,
            activeTab === "updates" && styles.activeTabButton,
          ]}
        >
          <MaterialIcons
            name="system-update-alt"
            size={17}
            color={activeTab === "updates" ? "#007E7A" : "#60758B"}
          />
          <Text
            style={[
              styles.tabButtonText,
              activeTab === "updates" && styles.activeTabButtonText,
            ]}
          >
            可更新 ({upgradablePackages.length})
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void selectTab("available")}
          style={[
            styles.tabButton,
            activeTab === "available" && styles.activeTabButton,
          ]}
        >
          <MaterialIcons
            name="search"
            size={17}
            color={activeTab === "available" ? "#007E7A" : "#60758B"}
          />
          <Text
            style={[
              styles.tabButtonText,
              activeTab === "available" && styles.activeTabButtonText,
            ]}
          >
            仓库浏览 ({availablePackages.length})
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel={
              activeTab === "installed"
                ? "筛选已安装软件包"
                : activeTab === "updates"
                  ? "筛选可更新软件包"
                  : "筛选仓库软件包"
            }
            style={styles.searchInputFlex}
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder={
              activeTab === "installed"
                ? "在已安装包列表中筛选..."
                : activeTab === "updates"
                  ? "在可更新包列表中筛选..."
                  : "在完整仓库列表中筛选..."
            }
            placeholderTextColor="#8B9AA8"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="配置 APK 仓库"
            disabled={!isConnected || isBusy || isLoading}
            onPress={() => void openRepositories()}
            style={({ pressed }) => [
              styles.repositoryButton,
              (!isConnected || isBusy || isLoading) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons name="settings" size={16} color="#007E7A" />
            <Text style={styles.repositoryButtonText}>仓库</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.directorySection}>
        <View style={styles.listHeader}>
          <View style={styles.listHeaderCopy}>
            <Text style={styles.listTitle}>
              {activeTab === "installed"
                ? "已安装软件包列表"
                : activeTab === "updates"
                  ? "可更新软件包"
                  : "完整仓库软件包"}
            </Text>
            <Text style={styles.listSubtitle}>
              {displayedPackages.length} 个结果
            </Text>
          </View>
          {activeTab === "updates" && upgradablePackages.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() =>
                void runPackageAction(
                  buildApkUpgradeCommand(),
                  "已完成全部软件包更新",
                )
              }
              style={({ pressed }) => [
                styles.updateAllButton,
                isBusy && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <MaterialIcons
                name="system-update-alt"
                size={15}
                color="#FFFFFF"
              />
              <Text style={styles.updateAllButtonText}>全部更新</Text>
            </Pressable>
          ) : null}
        </View>

        <FlatList
          data={displayedPackages}
          keyExtractor={(item) => item.name}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            !displayedPackages.length && styles.emptyListContent,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() =>
                void (activeTab === "installed"
                  ? loadInstalledPackages()
                  : activeTab === "updates"
                    ? loadUpgradablePackages()
                    : loadAvailablePackages())
              }
              enabled={isConnected && !isBusy}
              tintColor="#007E7A"
            />
          }
          initialNumToRender={24}
          maxToRenderPerBatch={32}
          windowSize={10}
          removeClippedSubviews={Platform.OS !== "web"}
          getItemLayout={(_, index) => ({
            length: 76,
            offset: 76 * index,
            index,
          })}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <MaterialIcons name="extension" size={32} color="#91A5B3" />
              <Text style={styles.emptyListTitle}>
                {isConnected
                  ? activeTab === "installed"
                    ? "没有找到匹配的软件包"
                    : activeTab === "updates"
                      ? "当前没有可更新的软件包"
                      : "尚未读取仓库软件包"
                  : "连接 SSH 后管理软件包"}
              </Text>
              <Text style={styles.emptyListText}>
                {isConnected
                  ? activeTab === "updates"
                    ? "先点击右上角更新源，再下拉刷新更新列表。"
                    : activeTab === "available"
                      ? "先点击右上角更新源，应用会读取完整仓库软件包列表。"
                      : "尝试更新源列表或更换筛选关键词。"
                  : "连接路由器后，系统软件包将在此显示。"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.entry}>
              <View
                style={[
                  styles.entryIcon,
                  item.installed && styles.installedIcon,
                ]}
              >
                <MaterialIcons
                  name={item.installed ? "check" : "extension"}
                  size={20}
                  color={item.installed ? "#007E7A" : "#5E7182"}
                />
              </View>
              <View style={styles.entryCopy}>
                <View style={styles.entryTitleRow}>
                  <Text style={styles.entryName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.entryVersion} numberOfLines={1}>
                    {item.version}
                  </Text>
                </View>
                <Text style={styles.entryMeta} numberOfLines={2}>
                  {item.description}
                </Text>
              </View>
              <View style={styles.entryActionRow}>
                {activeTab === "updates" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`更新 ${item.name}`}
                    disabled={isBusy}
                    onPress={() => confirmUpgrade(item)}
                    style={({ pressed }) => [
                      styles.updateButton,
                      isBusy && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.updateButtonText}>更新</Text>
                  </Pressable>
                ) : item.installed ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`卸载 ${item.name}`}
                    disabled={isBusy}
                    onPress={() => confirmRemove(item)}
                    style={({ pressed }) => [
                      styles.removeButton,
                      isBusy && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.removeButtonText}>卸载</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`安装 ${item.name}`}
                    disabled={isBusy}
                    onPress={() => confirmInstall(item)}
                    style={({ pressed }) => [
                      styles.installButton,
                      isBusy && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.installButtonText}>安装</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        />
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={isActionModalVisible}
        onRequestClose={() => setIsActionModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.actionModal}>
            <Text style={styles.actionModalTitle}>操作执行详情</Text>
            <TextInput
              style={styles.outputBox}
              multiline
              editable={false}
              value={actionOutput}
            />
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsActionModalVisible(false)}
                style={styles.confirmModal}
              >
                <Text style={styles.confirmModalText}>关闭</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={isRepositoriesModalVisible}
        onRequestClose={() => setIsRepositoriesModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.repositoriesModal}>
            <View style={styles.repositoriesModalHeader}>
              <View style={styles.repositoriesModalCopy}>
                <Text style={styles.actionModalTitle}>APK 仓库配置</Text>
                <Text style={styles.repositoriesHint}>
                  保存会备份原配置、原子写入
                  /etc/apk/repositories，并更新软件源。
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭仓库配置"
                onPress={() => setIsRepositoriesModalVisible(false)}
                style={styles.repositoriesClose}
              >
                <MaterialIcons name="close" size={20} color="#60758B" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.repositoriesList}
              contentContainerStyle={styles.repositoriesListContent}
            >
              {repositories
                .filter((repository) => !repository.deleted)
                .map((repository) => (
                  <View
                    key={`${repository.source ?? "root"}-${repository.line}-${repository.url}`}
                    style={styles.repositoryEntry}
                  >
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityLabel={`${repository.enabled ? "禁用" : "启用"}仓库 ${repository.url}`}
                      onPress={() =>
                        setRepositories((current) =>
                          current.map((item) =>
                            item.line === repository.line &&
                            item.source === repository.source
                              ? { ...item, enabled: !item.enabled }
                              : item,
                          ),
                        )
                      }
                      style={[
                        styles.repositoryToggle,
                        repository.enabled && styles.repositoryToggleOn,
                      ]}
                    >
                      <View
                        style={[
                          styles.repositoryToggleThumb,
                          repository.enabled && styles.repositoryToggleThumbOn,
                        ]}
                      />
                    </Pressable>
                    <Text
                      style={[
                        styles.repositoryUrl,
                        !repository.enabled && styles.repositoryUrlDisabled,
                      ]}
                      selectable
                    >
                      {repository.url}
                    </Text>
                    {repository.source ? (
                      <Text style={styles.repositorySource} numberOfLines={1}>
                        {repository.source}
                      </Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`删除仓库 ${repository.url}`}
                      onPress={() =>
                        setRepositories((current) =>
                          current.map((item) =>
                            item.line === repository.line &&
                            item.source === repository.source
                              ? { ...item, deleted: true }
                              : item,
                          ),
                        )
                      }
                      style={styles.repositoryDelete}
                    >
                      <MaterialIcons
                        name="delete-outline"
                        size={18}
                        color="#B13939"
                      />
                      <Text style={styles.repositoryDeleteText}>删除</Text>
                    </Pressable>
                  </View>
                ))}
              {!repositories.some((repository) => !repository.deleted) ? (
                <Text style={styles.repositoriesEmpty}>
                  未读取到仓库条目。请确认路由器使用 apk，并检查
                  customfeeds.list 与 distfeeds.list。
                </Text>
              ) : null}
            </ScrollView>

            <View style={styles.addRepositoryRow}>
              <TextInput
                accessibilityLabel="新增 APK 仓库地址"
                value={newRepositoryUrl}
                onChangeText={setNewRepositoryUrl}
                style={styles.addRepositoryInput}
                placeholder="https://downloads.openwrt.org/..."
                placeholderTextColor="#8B9AA8"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={addRepository}
              />
              <Pressable
                accessibilityRole="button"
                onPress={addRepository}
                style={({ pressed }) => [
                  styles.addRepositoryButton,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons name="add" size={19} color="#FFFFFF" />
              </Pressable>
            </View>
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy || isLoading}
                onPress={() => void saveRepositories()}
                style={({ pressed }) => [
                  styles.confirmModal,
                  (isBusy || isLoading) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmModalText}>保存并更新</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const baseStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FA" },
  blankScreen: { flex: 1, backgroundColor: "#F6F8FA" },
  nav: {
    minHeight: 58,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#F6F8FA",
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EAF1F5",
    alignItems: "center",
    justifyContent: "center",
  },
  navCopy: { flex: 1, minWidth: 0 },
  navTitleText: { color: "#203B55", fontSize: 17, fontWeight: "800" },
  navSpacer: { width: 38 },
  target: {
    color: "#718398",
    fontSize: 11,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  refreshButton: {
    minWidth: 72,
    height: 36,
    paddingHorizontal: 9,
    borderRadius: 18,
    flexDirection: "row",
    gap: 4,
    backgroundColor: "#E6F5F4",
    alignItems: "center",
    justifyContent: "center",
  },
  refreshText: { color: "#007E7A", fontSize: 11, fontWeight: "800" },
  connectionCard: {
    marginHorizontal: 20,
    marginTop: 4,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#DDE7E9",
  },
  connectionCopy: { flex: 1, minWidth: 0 },
  connectionLabel: { color: "#203B55", fontSize: 13, fontWeight: "800" },
  notice: { color: "#60758B", fontSize: 12, lineHeight: 17, marginTop: 3 },
  connectButton: {
    minWidth: 68,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007E7A",
  },
  connectText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  disconnectButton: {
    minWidth: 60,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C5D2D9",
  },
  disconnectText: { color: "#466075", fontSize: 13, fontWeight: "800" },
  tabRow: {
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },
  tabButton: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE7E9",
  },
  activeTabButton: { backgroundColor: "#E6F5F4", borderColor: "#007E7A" },
  tabButtonText: { color: "#60758B", fontSize: 13, fontWeight: "700" },
  activeTabButtonText: { color: "#007E7A", fontSize: 13, fontWeight: "800" },
  searchCard: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DDE7E9",
  },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: {
    width: "100%",
    minHeight: 40,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#D8E2E8",
    paddingHorizontal: 12,
    color: "#203B55",
    fontSize: 13,
  },
  searchInputFlex: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#D8E2E8",
    paddingHorizontal: 12,
    color: "#203B55",
    fontSize: 13,
  },
  repositoryButton: {
    minWidth: 72,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
    backgroundColor: "#E6F5F4",
    borderWidth: 1,
    borderColor: "#A7DCD9",
  },
  repositoryButtonText: { color: "#007E7A", fontSize: 12, fontWeight: "800" },
  searchAction: {
    minWidth: 62,
    minHeight: 40,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007E7A",
  },
  searchActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  directorySection: { flex: 1, minHeight: 260, marginTop: 10 },
  listHeader: {
    marginHorizontal: 20,
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "#DDE7E9",
  },
  listHeaderCopy: { flex: 1, minWidth: 0 },
  listTitle: { color: "#304B64", fontSize: 14, fontWeight: "800" },
  listSubtitle: { color: "#718398", fontSize: 11, marginTop: 3 },
  list: {
    flex: 1,
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE7E9",
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    overflow: "hidden",
  },
  listContent: { paddingBottom: 28 },
  emptyListContent: { flexGrow: 1 },
  entry: {
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F4",
  },
  entryIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF3F6",
  },
  installedIcon: { backgroundColor: "#E6F5F4" },
  entryCopy: { flex: 1, minWidth: 0 },
  entryTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  entryName: {
    color: "#203B55",
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 1,
  },
  entryVersion: {
    color: "#718398",
    fontSize: 11,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  entryMeta: { color: "#60758B", fontSize: 11, marginTop: 4, lineHeight: 15 },
  entryActionRow: { alignItems: "flex-end" },
  updateAllButton: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#007E7A",
  },
  updateAllButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  installButton: {
    minWidth: 54,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007E7A",
  },
  installButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  updateButton: {
    minWidth: 54,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E6F5F4",
    borderWidth: 1,
    borderColor: "#A7DCD9",
  },
  updateButtonText: { color: "#007E7A", fontSize: 12, fontWeight: "800" },
  removeButton: {
    minWidth: 54,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C93D3D",
  },
  removeButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  emptyList: {
    alignItems: "center",
    justifyContent: "center",
    padding: 34,
    gap: 6,
  },
  emptyListTitle: {
    color: "#304B64",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 3,
  },
  emptyListText: { color: "#718398", fontSize: 12, textAlign: "center" },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(12, 34, 51, 0.42)",
  },
  actionModal: {
    width: "100%",
    maxWidth: 450,
    maxHeight: "80%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
  },
  repositoriesModal: {
    width: "100%",
    maxWidth: 470,
    maxHeight: "84%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
  },
  repositoriesModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  repositoriesModalCopy: { flex: 1, minWidth: 0 },
  repositoriesHint: {
    color: "#60758B",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  repositoriesClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF3F6",
  },
  repositoriesList: { maxHeight: 260, marginTop: 14 },
  repositoriesListContent: { gap: 8, paddingBottom: 2 },
  repositoryEntry: {
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#DDE7E9",
    borderRadius: 10,
    backgroundColor: "#F8FAFB",
  },
  repositoryToggle: {
    width: 34,
    height: 20,
    borderRadius: 10,
    padding: 2,
    justifyContent: "center",
    backgroundColor: "#C5D2D9",
  },
  repositoryToggleOn: { alignItems: "flex-end", backgroundColor: "#007E7A" },
  repositoryToggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  repositoryToggleThumbOn: { backgroundColor: "#FFFFFF" },
  repositoryUrl: {
    flex: 1,
    color: "#203B55",
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  repositoryUrlDisabled: {
    color: "#8B9AA8",
    textDecorationLine: "line-through",
  },
  repositorySource: {
    position: "absolute",
    left: 53,
    right: 76,
    bottom: 5,
    color: "#8B9AA8",
    fontSize: 9,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  repositoryDelete: {
    minWidth: 52,
    height: 30,
    borderRadius: 7,
    flexDirection: "row",
    gap: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "#F5C6C6",
  },
  repositoryDeleteText: { color: "#B13939", fontSize: 11, fontWeight: "800" },
  repositoriesEmpty: {
    color: "#718398",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 24,
  },
  addRepositoryRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  addRepositoryInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#D8E2E8",
    paddingHorizontal: 12,
    color: "#203B55",
    fontSize: 12,
  },
  addRepositoryButton: {
    width: 42,
    height: 42,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007E7A",
  },
  actionModalTitle: { color: "#203B55", fontSize: 16, fontWeight: "800" },
  outputBox: {
    width: "100%",
    height: 220,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D8E2E8",
    backgroundColor: "#0F1E2E",
    color: "#64D2FF",
    padding: 12,
    fontSize: 12,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  modalActions: {
    marginTop: 15,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  confirmModal: {
    minHeight: 38,
    paddingHorizontal: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007E7A",
  },
  confirmModalText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
});
