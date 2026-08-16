import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { EmptyState } from "@/components/status-ui";
import { filterFileEntries, sortFileEntries, type FileSortMode } from "@/lib/file-manager-utils";
import { connectInAppSsh, disconnectInAppSsh, downloadInAppSshFile, getInAppSshTarget, isInAppSshSupported, runInAppSshCommand, uploadInAppSshFile, writeInAppSshTextFile } from "@/lib/native-ssh";
import {
  buildChmodCommand,
  buildCopyCommand,
  buildCreateDirectoryCommand,
  buildDeleteCommand,
  buildFinalizeUploadCommand,
  buildListDirectoryCommand,
  buildMoveCommand,
  buildReadTextCommand,
  buildRenameCommand,
  createTemporaryUploadPath,
  createTemporaryWritePath,
  formatRemoteSize,
  joinRemotePath,
  normalizeRemotePath,
  parentRemotePath,
  parseDirectoryEntries,
  parseReadableText,
  type RemoteFileEntry,
} from "@/lib/router-file-commands";
import { useRouterStore } from "@/lib/router-provider";

type ConnectionState = "idle" | "connecting" | "connected" | "error";
type ClipboardState = { entries: RemoteFileEntry[]; mode: "copy" | "move" } | null;
type PromptKind = "folder" | "rename" | "permissions" | null;
type EditorState = { entry: RemoteFileEntry; content: string } | null;

const TEXT_FILE_LIMIT_BYTES = 64 * 1024;

function fileIcon(entry: RemoteFileEntry) {
  if (entry.kind === "directory") return "folder";
  if (entry.kind === "link") return "shortcut";
  if (/\.(conf|config|json|yaml|yml|txt|log|sh|lua|js|ts|css|html|md)$/i.test(entry.name)) return "description";
  return "insert-drive-file";
}

function describeEntry(entry: RemoteFileEntry) {
  const kind = entry.kind === "directory" ? "文件夹" : entry.kind === "link" ? "链接" : entry.kind === "file" ? "文件" : "其他";
  const details = [kind, entry.kind === "directory" ? null : formatRemoteSize(entry.size), entry.mode ? `权限 ${entry.mode}` : null, entry.modifiedAt].filter(Boolean);
  return details.join(" · ");
}

export default function FilesScreen() {
  const router = useRouter();
  const { selectedProfile, getSelectedCredentials } = useRouterStore();
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [currentPath, setCurrentPath] = useState("/");
  const [pathInput, setPathInput] = useState("/");
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [selected, setSelected] = useState<RemoteFileEntry | null>(null);
  const [isMultiSelecting, setIsMultiSelecting] = useState(false);
  const [multiSelected, setMultiSelected] = useState<RemoteFileEntry[]>([]);
  const [clipboard, setClipboard] = useState<ClipboardState>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState<FileSortMode>("name");
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("连接后即可浏览和管理路由器上的文件。");
  const [promptKind, setPromptKind] = useState<PromptKind>(null);
  const [promptValue, setPromptValue] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [isSavingText, setIsSavingText] = useState(false);

  useEffect(() => () => disconnectInAppSsh(), []);

  const profile = selectedProfile;
  if (!profile) {
    return (
      <View style={styles.blankScreen}>
        <View style={styles.nav}><Pressable accessibilityRole="button" accessibilityLabel="返回设置" onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-back" size={22} color="#203B55" /></Pressable><Text style={styles.navTitle}>文件管理</Text><View style={styles.navSpacer} /></View>
        <EmptyState icon="folder" title="还没有可管理的路由器" description="请先在“路由器”中保存 OpenWrt 的 LuCI 与 SSH 连接资料。" />
      </View>
    );
  }

  const target = getInAppSshTarget(profile);
  const isConnected = connection === "connected";
  const isBusy = isLoading || connection === "connecting";

  async function refreshDirectory(directory = currentPath) {
    const normalized = normalizeRemotePath(directory);
    setIsLoading(true);
    try {
      const output = await runInAppSshCommand(buildListDirectoryCommand(normalized));
      if (output.includes("__MANUS_NOT_DIRECTORY__")) throw new Error("该位置不是可浏览的文件夹。");
      setEntries(parseDirectoryEntries(output, normalized));
      setCurrentPath(normalized);
      setPathInput(normalized);
      setSelected(null);
      setMultiSelected([]);
      setNotice(`${normalized} · 已加载 ${parseDirectoryEntries(output, normalized).length} 项`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法读取路由器目录。");
    } finally {
      setIsLoading(false);
    }
  }

  async function connect() {
    setConnection("connecting");
    setNotice(`正在连接 ${target}…`);
    try {
      const credentials = await getSelectedCredentials();
      if (!credentials) throw new Error("未找到本机保存的 SSH 密码，请编辑路由器资料后再试。");
      await connectInAppSsh(profile!, credentials.sshPassword);
      setConnection("connected");
      setNotice("SSH 会话已连接，正在读取根目录…");
      await refreshDirectory("/");
    } catch (error) {
      setConnection("error");
      setNotice(error instanceof Error ? error.message : "SSH 连接失败。");
    }
  }

  function disconnect() {
    disconnectInAppSsh();
    setConnection("idle");
    setEntries([]);
    setSelected(null);
    setMultiSelected([]);
    setIsMultiSelecting(false);
    setClipboard(null);
    setNotice("SSH 会话已断开。");
  }

  function openDirectory(path: string) {
    if (!isConnected || isBusy) return;
    void refreshDirectory(path);
  }

  async function openTextEditor(entry: RemoteFileEntry) {
    if (!isConnected || isBusy || entry.kind !== "file") return;
    setIsLoading(true);
    setNotice(`正在读取 ${entry.name}…`);
    try {
      const result = parseReadableText(await runInAppSshCommand(buildReadTextCommand(entry.path, TEXT_FILE_LIMIT_BYTES)));
      if (result.tooLargeBytes !== null) {
        Alert.alert("文件过大", `${entry.name} 为 ${formatRemoteSize(result.tooLargeBytes)}。为了避免应用内存占用过高，文件编辑器最多打开 ${formatRemoteSize(TEXT_FILE_LIMIT_BYTES)} 的文本文件。`);
        setNotice("该文件超过编辑器大小限制。");
        return;
      }
      setEditor({ entry, content: result.content ?? "" });
      setNotice(`正在编辑 ${entry.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法读取文本文件。");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveTextFile() {
    if (!editor || isSavingText) return;
    setIsSavingText(true);
    try {
      const temporaryPath = createTemporaryWritePath(editor.entry.path);
      await writeInAppSshTextFile(editor.content, temporaryPath);
      await runInAppSshCommand(buildFinalizeUploadCommand(temporaryPath, editor.entry.path));
      if (editor.entry.mode) await runInAppSshCommand(buildChmodCommand(editor.entry.path, editor.entry.mode));
      setEditor(null);
      setNotice(`已保存 ${editor.entry.name}。`);
      await refreshDirectory();
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "无法将修改写入路由器。");
    } finally {
      setIsSavingText(false);
    }
  }

  function showPrompt(kind: Exclude<PromptKind, null>) {
    if (!isConnected || isBusy) return;
    if ((kind === "rename" || kind === "permissions") && !selected) return;
    setPromptKind(kind);
    setPromptValue(kind === "rename" ? selected?.name ?? "" : kind === "permissions" ? selected?.mode ?? "644" : "");
  }

  function dismissPrompt() {
    setPromptKind(null);
    setPromptValue("");
  }

  async function submitPrompt() {
    if (!promptKind) return;
    const trimmed = promptValue.trim();
    try {
      if (promptKind === "folder") {
        await runInAppSshCommand(buildCreateDirectoryCommand(joinRemotePath(currentPath, trimmed)));
        setNotice(`已创建文件夹 ${trimmed}。`);
      }
      if (promptKind === "rename" && selected) {
        await runInAppSshCommand(buildRenameCommand(selected.path, trimmed));
        setNotice(`已重命名为 ${trimmed}。`);
      }
      if (promptKind === "permissions" && selected) {
        await runInAppSshCommand(buildChmodCommand(selected.path, trimmed));
        setNotice(`已将 ${selected.name} 的权限设置为 ${trimmed}。`);
      }
      dismissPrompt();
      await refreshDirectory();
    } catch (error) {
      Alert.alert("操作失败", error instanceof Error ? error.message : "无法完成文件操作。");
    }
  }

  async function chooseAndUpload() {
    if (!isConnected || isBusy) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const destination = joinRemotePath(currentPath, asset.name);
      Alert.alert("上传文件", `将 ${asset.name} 上传到 ${destination}。若目标已存在，将会被替换。`, [
        { text: "取消", style: "cancel" },
        { text: "上传", onPress: () => void uploadAsset(asset.uri, asset.name, destination) },
      ]);
    } catch (error) {
      Alert.alert("无法选择文件", error instanceof Error ? error.message : "文件选择失败。");
    }
  }

  async function uploadAsset(localUri: string, fileName: string, destination: string) {
    setIsLoading(true);
    setNotice(`正在上传 ${fileName}…`);
    try {
      const temporaryPath = createTemporaryUploadPath(fileName);
      await uploadInAppSshFile(localUri, temporaryPath);
      await runInAppSshCommand(buildFinalizeUploadCommand(temporaryPath, destination));
      setNotice(`已上传 ${fileName}。`);
      await refreshDirectory();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "文件上传失败。");
    } finally {
      setIsLoading(false);
    }
  }

  async function downloadAndShare(entry: RemoteFileEntry) {
    if (!isConnected || isBusy || entry.kind !== "file") return;
    setIsLoading(true);
    setNotice(`正在下载 ${entry.name}…`);
    try {
      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) throw new Error("手机缓存目录不可用，无法保存下载文件。");
      const downloadDirectory = `${cacheDirectory}openwrt-downloads/`;
      const safeName = entry.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "openwrt-file";
      const localUri = `${downloadDirectory}${Date.now()}-${safeName}`;
      await FileSystem.makeDirectoryAsync(downloadDirectory, { intermediates: true });
      await downloadInAppSshFile(entry.path, localUri);
      setNotice(`已下载 ${entry.name}，正在打开系统分享面板。`);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("文件已下载", `已保存到应用缓存：${entry.name}。当前设备无法打开系统分享面板。`);
        return;
      }
      await Sharing.shareAsync(localUri, { dialogTitle: `保存或分享 ${entry.name}` });
      setNotice(`已完成 ${entry.name} 的下载。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "文件下载失败。");
    } finally {
      setIsLoading(false);
    }
  }

  function cycleSortMode() {
    setSortMode((current) => current === "name" ? "size" : current === "size" ? "modified" : "name");
  }

  const activeSelection = isMultiSelecting ? multiSelected : selected ? [selected] : [];

  function toggleMultiSelection(entry: RemoteFileEntry) {
    setMultiSelected((current) => current.some((item) => item.path === entry.path)
      ? current.filter((item) => item.path !== entry.path)
      : [...current, entry]);
  }

  function clearSelection() {
    setSelected(null);
    setMultiSelected([]);
    setIsMultiSelecting(false);
  }

  function stageClipboard(mode: "copy" | "move") {
    if (!activeSelection.length) return;
    setClipboard({ entries: activeSelection, mode });
    const countLabel = activeSelection.length === 1 ? activeSelection[0].name : `${activeSelection.length} 项`;
    setNotice(mode === "copy" ? `已复制 ${countLabel}，请进入目标文件夹后粘贴。` : `已剪切 ${countLabel}，请进入目标文件夹后粘贴。`);
  }

  async function pasteClipboard() {
    if (!clipboard || isBusy) return;
    const eligibleEntries = clipboard.entries.filter((entry) => parentRemotePath(entry.path) !== currentPath);
    if (!eligibleEntries.length) {
      Alert.alert("无需粘贴", "当前已经是所选内容所在的位置。");
      return;
    }
    setIsLoading(true);
    try {
      for (const entry of eligibleEntries) {
        const command = clipboard.mode === "copy" ? buildCopyCommand(entry.path, currentPath) : buildMoveCommand(entry.path, currentPath);
        await runInAppSshCommand(command);
      }
      const countLabel = eligibleEntries.length === 1 ? eligibleEntries[0].name : `${eligibleEntries.length} 项`;
      setNotice(clipboard.mode === "copy" ? `已复制 ${countLabel}。` : `已移动 ${countLabel}。`);
      setClipboard(null);
      clearSelection();
      await refreshDirectory();
    } catch (error) {
      Alert.alert("粘贴失败", error instanceof Error ? error.message : "无法将文件放入当前文件夹。");
    } finally {
      setIsLoading(false);
    }
  }

  function confirmDelete() {
    if (!activeSelection.length || isBusy) return;
    const description = activeSelection.length === 1
      ? `将永久删除 ${activeSelection[0].path}${activeSelection[0].kind === "directory" ? " 及其全部内容" : ""}。此操作无法撤销。`
      : `将永久删除所选的 ${activeSelection.length} 个文件或文件夹。此操作无法撤销。`;
    Alert.alert("确认删除？", description, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => void deleteSelection(),
      },
    ]);
  }

  async function deleteSelection() {
    if (!activeSelection.length) return;
    setIsLoading(true);
    try {
      for (const entry of activeSelection) await runInAppSshCommand(buildDeleteCommand(entry.path));
      setNotice(activeSelection.length === 1 ? `已删除 ${activeSelection[0].name}。` : `已删除 ${activeSelection.length} 项。`);
      clearSelection();
      await refreshDirectory();
    } catch (error) {
      Alert.alert("删除失败", error instanceof Error ? error.message : "无法删除此文件。\n");
    } finally {
      setIsLoading(false);
    }
  }

  function goToPath() {
    try {
      openDirectory(normalizeRemotePath(pathInput));
    } catch (error) {
      Alert.alert("路径无效", error instanceof Error ? error.message : "请输入以 / 开头的路径。");
    }
  }

  const promptTitle = promptKind === "folder" ? "新建文件夹" : promptKind === "rename" ? "重命名" : "修改权限";
  const promptHint = promptKind === "folder" ? "输入文件夹名称" : promptKind === "rename" ? "输入新名称" : "例如 644、755 或 0755";
  const visibleEntries = sortFileEntries(filterFileEntries(entries, searchTerm), sortMode);
  const sortLabel = sortMode === "name" ? "名称" : sortMode === "size" ? "大小" : "时间";

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.nav}><Pressable accessibilityRole="button" accessibilityLabel="返回设置" onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-back" size={22} color="#203B55" /></Pressable><View style={styles.navCopy}><Text style={styles.navTitle}>文件管理</Text><Text style={styles.target} numberOfLines={1}>{target}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="刷新文件夹" disabled={!isConnected || isBusy} onPress={() => void refreshDirectory()} style={({ pressed }) => [styles.refreshButton, (!isConnected || isBusy) && styles.disabled, pressed && styles.pressed]}>{isLoading ? <ActivityIndicator size="small" color="#007E7A" /> : <MaterialIcons name="refresh" size={21} color="#007E7A" />}</Pressable></View>

      {!isInAppSshSupported() ? <View style={styles.platformBanner}><MaterialIcons name="info-outline" size={18} color="#9A6500" /><Text style={styles.platformText}>文件管理依赖应用内 SSH，仅在重新构建后的 Android APK 中可用。</Text></View> : null}

      <View style={styles.directorySection}>
        <View style={styles.listHeader}>
          <View style={styles.listHeaderCopy}>
            <Text style={styles.listTitle}>目录内容</Text>
            <Text style={styles.listSubtitle}>{visibleEntries.length} 项 · 按{sortLabel}排序</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="切换文件排序方式" disabled={!isConnected || isBusy} onPress={cycleSortMode} style={({ pressed }) => [styles.sortButton, (!isConnected || isBusy) && styles.disabled, pressed && styles.pressed]}>
            <MaterialIcons name="sort" size={18} color="#007E7A" />
            <Text style={styles.sortButtonText}>{sortLabel}</Text>
          </Pressable>
        </View>

        <FlatList
          data={visibleEntries}
          keyExtractor={(entry) => entry.path}
          style={styles.list}
          contentContainerStyle={[styles.listContent, !visibleEntries.length && styles.emptyListContent]}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refreshDirectory()} enabled={isConnected && !isBusy} tintColor="#007E7A" />}
          ListEmptyComponent={<View style={styles.emptyList}><MaterialIcons name={isConnected ? "folder-open" : "wifi-off"} size={32} color="#91A5B3" /><Text style={styles.emptyListTitle}>{isConnected ? (searchTerm ? "没有匹配的文件" : "文件夹为空") : "连接 SSH 后浏览目录"}</Text><Text style={styles.emptyListText}>{isConnected ? (searchTerm ? "尝试更换筛选关键词。" : "可上传文件或创建一个新文件夹。") : "连接路由器后，文件列表会显示在这里。"}</Text></View>}
          renderItem={({ item }) => {
            const itemSelected = isMultiSelecting ? multiSelected.some((entry) => entry.path === item.path) : selected?.path === item.path;
            const isDirectory = item.kind === "directory";
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${isMultiSelecting ? "选择" : isDirectory ? "打开文件夹" : "选择文件"} ${item.name}`}
                onPress={() => isMultiSelecting ? toggleMultiSelection(item) : isDirectory ? openDirectory(item.path) : setSelected(item)}
                onLongPress={() => { if (!isMultiSelecting) { setSelected(null); setIsMultiSelecting(true); } toggleMultiSelection(item); }}
                style={({ pressed }) => [styles.entry, itemSelected && styles.entrySelected, pressed && styles.pressed]}
              >
                <View style={[styles.entryIcon, isDirectory && styles.directoryIcon]}>
                  <MaterialIcons name={fileIcon(item)} size={21} color={isDirectory ? "#007E7A" : "#5E7182"} />
                </View>
                <View style={styles.entryCopy}>
                  <View style={styles.entryTitleRow}>
                    <Text style={styles.entryName} numberOfLines={1}>{item.name}</Text>
                    {isDirectory ? <Text style={styles.entryKind}>文件夹</Text> : null}
                  </View>
                  <Text style={styles.entryMeta} numberOfLines={1}>{describeEntry(item)}</Text>
                </View>
                {isMultiSelecting ? <MaterialIcons name={itemSelected ? "check-circle" : "radio-button-unchecked"} size={22} color={itemSelected ? "#007E7A" : "#A0AFBA"} /> : isDirectory ? <MaterialIcons name="chevron-right" size={22} color="#91A5B3" /> : <MaterialIcons name={itemSelected ? "check-circle" : "more-horiz"} size={21} color={itemSelected ? "#007E7A" : "#718398"} />}
              </Pressable>
            );
          }}
        />
      </View>

      <ScrollView style={styles.bottomPanel} contentContainerStyle={styles.bottomPanelContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.searchCard}>
          <View style={styles.pathHeading}><MaterialIcons name="search" size={19} color="#007E7A" /><Text style={styles.pathLabel}>搜索文件夹</Text><Text style={styles.upText}>{visibleEntries.length} 项</Text></View>
          <TextInput accessibilityLabel="按文件名筛选" style={styles.searchInput} value={searchTerm} onChangeText={setSearchTerm} editable={isConnected && !isBusy} placeholder="输入文件或文件夹名称" placeholderTextColor="#8B9AA8" autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" />
        </View>

        <View style={styles.pathCard}>
          <View style={styles.pathHeading}><MaterialIcons name="folder-open" size={19} color="#007E7A" /><Text style={styles.pathLabel}>当前位置</Text><Pressable accessibilityRole="button" accessibilityLabel="返回上级文件夹" disabled={!isConnected || currentPath === "/" || isBusy} onPress={() => openDirectory(parentRemotePath(currentPath))} style={({ pressed }) => [styles.upButton, (!isConnected || currentPath === "/" || isBusy) && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="arrow-upward" size={17} color="#466075" /><Text style={styles.upText}>上级</Text></Pressable></View>
          <View style={styles.pathInputRow}><TextInput accessibilityLabel="路由器文件路径" style={styles.pathInput} value={pathInput} onChangeText={setPathInput} editable={isConnected && !isBusy} autoCapitalize="none" autoCorrect={false} returnKeyType="go" onSubmitEditing={goToPath} /><Pressable accessibilityRole="button" accessibilityLabel="前往该路径" disabled={!isConnected || isBusy} onPress={goToPath} style={({ pressed }) => [styles.goButton, (!isConnected || isBusy) && styles.disabled, pressed && styles.pressed]}><Text style={styles.goText}>前往</Text></Pressable></View>
        </View>

        <View style={styles.connectionCard}>
          <View style={styles.connectionCopy}><Text style={styles.connectionLabel}>{connection === "connected" ? "SSH 已连接" : connection === "connecting" ? "正在连接" : connection === "error" ? "连接失败" : "SSH 未连接"}</Text><Text style={styles.notice} numberOfLines={2}>{notice}</Text></View>
          {isConnected ? <Pressable accessibilityRole="button" accessibilityLabel="断开 SSH" onPress={disconnect} style={({ pressed }) => [styles.disconnectButton, pressed && styles.pressed]}><Text style={styles.disconnectText}>断开</Text></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="连接 SSH" disabled={isBusy || !isInAppSshSupported()} onPress={() => void connect()} style={({ pressed }) => [styles.connectButton, (isBusy || !isInAppSshSupported()) && styles.disabled, pressed && styles.pressed]}>{connection === "connecting" ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.connectText}>连接</Text>}</Pressable>}
        </View>

        <View style={styles.primaryTools}>
          <Pressable accessibilityRole="button" accessibilityLabel="上传文件到当前文件夹" disabled={!isConnected || isBusy} onPress={() => void chooseAndUpload()} style={({ pressed }) => [styles.primaryTool, (!isConnected || isBusy) && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="upload-file" size={19} color="#FFFFFF" /><Text style={styles.primaryToolText}>上传</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="在当前文件夹新建文件夹" disabled={!isConnected || isBusy} onPress={() => showPrompt("folder")} style={({ pressed }) => [styles.secondaryTool, (!isConnected || isBusy) && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="create-new-folder" size={19} color="#007E7A" /><Text style={styles.secondaryToolText}>新建文件夹</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={isMultiSelecting ? "结束多选" : "开始多选"} disabled={!isConnected || isBusy} onPress={() => isMultiSelecting ? clearSelection() : (setSelected(null), setIsMultiSelecting(true))} style={({ pressed }) => [styles.secondaryTool, (!isConnected || isBusy) && styles.disabled, pressed && styles.pressed]}><MaterialIcons name={isMultiSelecting ? "close" : "checklist"} size={19} color="#007E7A" /><Text style={styles.secondaryToolText}>{isMultiSelecting ? "结束多选" : "多选"}</Text></Pressable>
          {clipboard ? <Pressable accessibilityRole="button" accessibilityLabel="将剪贴板内容粘贴到当前文件夹" disabled={!isConnected || isBusy} onPress={() => void pasteClipboard()} style={({ pressed }) => [styles.pasteTool, (!isConnected || isBusy) && styles.disabled, pressed && styles.pressed]}><MaterialIcons name={clipboard.mode === "copy" ? "content-copy" : "drive-file-move"} size={18} color="#785000" /><Text style={styles.pasteToolText}>{clipboard.mode === "copy" ? "粘贴复制" : "粘贴移动"}</Text></Pressable> : null}
        </View>

        {activeSelection.length ? <View style={styles.selectionTray}><View style={styles.selectionInfo}><MaterialIcons name={isMultiSelecting ? "checklist" : fileIcon(activeSelection[0])} size={19} color="#007E7A" /><View style={styles.selectionCopy}><Text style={styles.selectionName} numberOfLines={1}>{isMultiSelecting ? `已选择 ${activeSelection.length} 项` : activeSelection[0].name}</Text><Text style={styles.selectionMeta} numberOfLines={1}>{isMultiSelecting ? "可批量复制、移动或删除" : describeEntry(activeSelection[0])}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="取消文件选择" onPress={clearSelection} style={styles.closeSelection}><MaterialIcons name="close" size={19} color="#60758B" /></Pressable></View><View style={styles.selectionActions}>{!isMultiSelecting && selected?.kind === "file" ? <><Pressable accessibilityRole="button" onPress={() => void openTextEditor(selected)} disabled={isBusy} style={({ pressed }) => [styles.actionButton, isBusy && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="edit" size={17} color="#007E7A" /><Text style={styles.actionText}>编辑</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void downloadAndShare(selected)} disabled={isBusy} style={({ pressed }) => [styles.actionButton, isBusy && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="download" size={17} color="#007E7A" /><Text style={styles.actionText}>下载</Text></Pressable></> : null}<Pressable accessibilityRole="button" onPress={() => stageClipboard("copy")} disabled={isBusy} style={({ pressed }) => [styles.actionButton, isBusy && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="content-copy" size={17} color="#007E7A" /><Text style={styles.actionText}>复制</Text></Pressable><Pressable accessibilityRole="button" onPress={() => stageClipboard("move")} disabled={isBusy} style={({ pressed }) => [styles.actionButton, isBusy && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="drive-file-move" size={17} color="#007E7A" /><Text style={styles.actionText}>移动</Text></Pressable>{!isMultiSelecting ? <><Pressable accessibilityRole="button" onPress={() => showPrompt("rename")} disabled={isBusy} style={({ pressed }) => [styles.actionButton, isBusy && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="drive-file-rename-outline" size={17} color="#007E7A" /><Text style={styles.actionText}>重命名</Text></Pressable><Pressable accessibilityRole="button" onPress={() => showPrompt("permissions")} disabled={isBusy} style={({ pressed }) => [styles.actionButton, isBusy && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="lock-open" size={17} color="#007E7A" /><Text style={styles.actionText}>权限</Text></Pressable></> : null}<Pressable accessibilityRole="button" onPress={confirmDelete} disabled={isBusy} style={({ pressed }) => [styles.deleteAction, isBusy && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={17} color="#B13939" /><Text style={styles.deleteActionText}>删除</Text></Pressable></View></View> : null}
      </ScrollView>

      <Modal transparent animationType="fade" visible={promptKind !== null} onRequestClose={dismissPrompt}>
        <View style={styles.modalBackdrop}><View style={styles.promptModal}><Text style={styles.modalTitle}>{promptTitle}</Text><Text style={styles.modalDescription}>{promptKind === "permissions" ? "仅输入 3 或 4 位八进制权限。常用文件为 644，可执行脚本通常为 755。" : `位置：${currentPath}`}</Text><TextInput accessibilityLabel={promptTitle} style={styles.modalInput} value={promptValue} onChangeText={setPromptValue} placeholder={promptHint} placeholderTextColor="#8B9AA8" autoCapitalize="none" autoCorrect={false} autoFocus returnKeyType="done" onSubmitEditing={() => void submitPrompt()} /><View style={styles.modalActions}><Pressable accessibilityRole="button" onPress={dismissPrompt} style={({ pressed }) => [styles.cancelModal, pressed && styles.pressed]}><Text style={styles.cancelModalText}>取消</Text></Pressable><Pressable accessibilityRole="button" disabled={!promptValue.trim()} onPress={() => void submitPrompt()} style={({ pressed }) => [styles.confirmModal, !promptValue.trim() && styles.disabled, pressed && styles.pressed]}><Text style={styles.confirmModalText}>确认</Text></Pressable></View></View></View>
      </Modal>

      <Modal transparent animationType="slide" visible={editor !== null} onRequestClose={() => !isSavingText && setEditor(null)}>
        <KeyboardAvoidingView style={styles.editorBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.editorModal}><View style={styles.editorHeader}><View style={styles.editorHeading}><Text style={styles.editorTitle} numberOfLines={1}>{editor?.entry.name}</Text><Text style={styles.editorPath} numberOfLines={1}>{editor?.entry.path}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="关闭编辑器" disabled={isSavingText} onPress={() => setEditor(null)} style={({ pressed }) => [styles.closeEditor, isSavingText && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="close" size={22} color="#466075" /></Pressable></View><TextInput accessibilityLabel="文件内容" style={styles.editorInput} value={editor?.content ?? ""} onChangeText={(content) => setEditor((current) => current ? { ...current, content } : null)} multiline textAlignVertical="top" autoCapitalize="none" autoCorrect={false} editable={!isSavingText} /><View style={styles.editorFooter}><Text style={styles.editorHint}>保存会直接替换路由器上的文件。</Text><Pressable accessibilityRole="button" disabled={isSavingText} onPress={() => void saveTextFile()} style={({ pressed }) => [styles.saveButton, isSavingText && styles.disabled, pressed && styles.pressed]}>{isSavingText ? <ActivityIndicator color="#FFFFFF" /> : <><MaterialIcons name="save" size={18} color="#FFFFFF" /><Text style={styles.saveText}>保存</Text></>}</Pressable></View></View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FA" }, blankScreen: { flex: 1, backgroundColor: "#F6F8FA" }, nav: { minHeight: 58, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#F6F8FA" }, back: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#EAF1F5", alignItems: "center", justifyContent: "center" }, navCopy: { flex: 1, minWidth: 0 }, navTitle: { color: "#203B55", fontSize: 17, fontWeight: "800" }, target: { color: "#718398", fontSize: 11, marginTop: 2, fontVariant: ["tabular-nums"] }, navSpacer: { width: 38 }, refreshButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#E6F5F4", alignItems: "center", justifyContent: "center" }, platformBanner: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingVertical: 11, backgroundColor: "#FFF3D9", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#F0D59A" }, platformText: { flex: 1, color: "#805B16", fontSize: 12, lineHeight: 18 }, connectionCard: { marginHorizontal: 20, marginTop: 4, padding: 13, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: "#DDE7E9" }, connectionCopy: { flex: 1, minWidth: 0 }, connectionLabel: { color: "#203B55", fontSize: 13, fontWeight: "800" }, notice: { color: "#60758B", fontSize: 12, lineHeight: 17, marginTop: 3 }, connectButton: { minWidth: 68, minHeight: 34, paddingHorizontal: 12, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#007E7A" }, connectText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" }, disconnectButton: { minWidth: 60, minHeight: 34, paddingHorizontal: 10, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#C5D2D9" }, disconnectText: { color: "#466075", fontSize: 13, fontWeight: "800" }, pathCard: { marginHorizontal: 20, marginTop: 11, padding: 12, backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: "#DDE7E9" }, pathHeading: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 9 }, pathLabel: { flex: 1, color: "#304B64", fontSize: 12, fontWeight: "800" }, upButton: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: "#EEF3F6" }, upText: { color: "#466075", fontSize: 11, fontWeight: "700" }, pathInputRow: { flexDirection: "row", gap: 8 }, pathInput: { flex: 1, minHeight: 38, borderRadius: 9, borderWidth: 1, borderColor: "#D8E2E8", paddingHorizontal: 10, color: "#203B55", fontSize: 13, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) }, goButton: { minWidth: 52, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#E6F5F4" }, goText: { color: "#007E7A", fontSize: 12, fontWeight: "800" }, directorySection: { flex: 1, minHeight: 260 }, bottomPanel: { maxHeight: 370 }, bottomPanelContent: { paddingBottom: 24 }, searchCard: { marginHorizontal: 20, marginTop: 12, padding: 12, backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: "#DDE7E9" }, searchInput: { width: "100%", minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: "#D8E2E8", paddingHorizontal: 12, color: "#203B55", fontSize: 13 }, listHeader: { marginHorizontal: 20, marginTop: 14, paddingHorizontal: 15, paddingVertical: 13, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderTopLeftRadius: 15, borderTopRightRadius: 15, borderWidth: 1, borderBottomWidth: 0, borderColor: "#DDE7E9" }, listHeaderCopy: { flex: 1, minWidth: 0 }, listTitle: { color: "#304B64", fontSize: 14, fontWeight: "800" }, listSubtitle: { color: "#718398", fontSize: 11, marginTop: 3 }, sortButton: { minHeight: 32, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, backgroundColor: "#E6F5F4" }, sortButtonText: { color: "#007E7A", fontSize: 12, fontWeight: "800" }, primaryTools: { paddingHorizontal: 20, paddingTop: 11, paddingBottom: 2, flexDirection: "row", flexWrap: "wrap", gap: 8 }, primaryTool: { minHeight: 38, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, backgroundColor: "#007E7A" }, primaryToolText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" }, secondaryTool: { minHeight: 38, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, backgroundColor: "#E6F5F4" }, secondaryToolText: { color: "#007E7A", fontSize: 12, fontWeight: "800" }, pasteTool: { minHeight: 38, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, backgroundColor: "#FFF3D9" }, pasteToolText: { color: "#785000", fontSize: 12, fontWeight: "800" }, selectionTray: { marginHorizontal: 20, marginBottom: 8, padding: 11, backgroundColor: "#EAF8F6", borderRadius: 14, borderWidth: 1, borderColor: "#C3E6DF" }, selectionInfo: { flexDirection: "row", alignItems: "center", gap: 8 }, selectionCopy: { flex: 1, minWidth: 0 }, selectionName: { color: "#203B55", fontSize: 13, fontWeight: "800" }, selectionMeta: { color: "#60758B", fontSize: 11, marginTop: 2 }, closeSelection: { padding: 4 }, selectionActions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }, actionButton: { minHeight: 31, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, backgroundColor: "#FFFFFF" }, actionText: { color: "#007E7A", fontSize: 11, fontWeight: "800" }, deleteAction: { minHeight: 31, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, backgroundColor: "#FFF0F0" }, deleteActionText: { color: "#B13939", fontSize: 11, fontWeight: "800" }, list: { flex: 1, marginHorizontal: 20, marginBottom: 0, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE7E9", borderBottomLeftRadius: 15, borderBottomRightRadius: 15, overflow: "hidden" }, listContent: { paddingBottom: 28 }, emptyListContent: { flexGrow: 1 }, entry: { minHeight: 70, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#EEF2F4" }, entrySelected: { backgroundColor: "#F0FAF8" }, entryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF3F6" }, directoryIcon: { backgroundColor: "#E6F5F4" }, entryCopy: { flex: 1, minWidth: 0 }, entryTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 }, entryName: { color: "#203B55", fontSize: 14, fontWeight: "700", flexShrink: 1 }, entryKind: { color: "#007E7A", fontSize: 10, fontWeight: "800", backgroundColor: "#E6F5F4", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 }, entryMeta: { color: "#718398", fontSize: 11, marginTop: 4 }, selectButton: { padding: 5 }, emptyList: { alignItems: "center", justifyContent: "center", padding: 34, gap: 6 }, emptyListTitle: { color: "#304B64", fontSize: 15, fontWeight: "800", marginTop: 3 }, emptyListText: { color: "#718398", fontSize: 12, textAlign: "center" }, modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(12, 34, 51, 0.42)" }, promptModal: { width: "100%", maxWidth: 420, backgroundColor: "#FFFFFF", borderRadius: 18, padding: 19 }, modalTitle: { color: "#203B55", fontSize: 18, fontWeight: "800" }, modalDescription: { color: "#60758B", fontSize: 12, lineHeight: 18, marginTop: 6 }, modalInput: { minHeight: 45, marginTop: 14, borderRadius: 10, borderWidth: 1, borderColor: "#D8E2E8", paddingHorizontal: 11, color: "#203B55", fontSize: 14 }, modalActions: { marginTop: 15, flexDirection: "row", justifyContent: "flex-end", gap: 8 }, cancelModal: { minHeight: 38, paddingHorizontal: 14, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF3F6" }, cancelModalText: { color: "#466075", fontSize: 13, fontWeight: "800" }, confirmModal: { minHeight: 38, paddingHorizontal: 15, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#007E7A" }, confirmModalText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" }, editorBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(12, 34, 51, 0.42)" }, editorModal: { height: "88%", backgroundColor: "#F6F8FA", borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden" }, editorHeader: { minHeight: 66, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#DDE7E9" }, editorHeading: { flex: 1, minWidth: 0 }, editorTitle: { color: "#203B55", fontSize: 16, fontWeight: "800" }, editorPath: { color: "#718398", fontSize: 11, marginTop: 3, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) }, closeEditor: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF3F6" }, editorInput: { flex: 1, margin: 14, marginBottom: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#D8E2E8", backgroundColor: "#FFFFFF", color: "#102A43", fontSize: 13, lineHeight: 20, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) }, editorFooter: { minHeight: 62, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#DDE7E9" }, editorHint: { flex: 1, color: "#718398", fontSize: 11, lineHeight: 15 }, saveButton: { minWidth: 80, minHeight: 38, paddingHorizontal: 12, borderRadius: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "#007E7A" }, saveText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
});
