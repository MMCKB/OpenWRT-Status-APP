import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import {
  defaultClashBaseUrl,
  fetchClashConnections,
  fetchClashProxyDelay,
  fetchClashProxies,
  fetchClashVersion,
  normalizeClashBaseUrl,
  selectClashGroups,
  switchClashProxy,
  type ClashProxyGroup,
} from "@/lib/clash-api";
import { loadServiceCredentials, saveServiceCredentials } from "@/lib/service-credentials";
import { runInAppSshCommand } from "@/lib/native-ssh";
import { loadProfiles, loadSettings } from "@/lib/router-storage";
import type { RouterProfile } from "@/shared/router-types";

function formatBytesTotal(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024).toFixed(0)} KB`;
}

/** 从 OpenClash 的运行配置里读取 external-controller 与 secret。 */
async function readClashSettingsFromRouter() {
  const output = await runInAppSshCommand(
    "grep -hE 'external-controller|^secret' /etc/openclash/config.yaml /etc/openclash/*.yaml 2>/dev/null | head -4; uci -q get openclash.config.dashboard_password 2>/dev/null",
  );
  const controller = output.match(/external-controller:\s*'?([^'\n]+)'?/)?.[1]?.trim();
  const secret = output.match(/^secret:\s*'?([^'\n]+)'?/m)?.[1]?.trim() ?? "";
  return { controller, secret };
}

export default function ClashPanelScreen() {
  const colors = useColors();
  const [selectedRouter, setSelectedRouter] = useState<RouterProfile | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [credsReady, setCredsReady] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [groups, setGroups] = useState<ClashProxyGroup[]>([]);
  const [connections, setConnections] = useState<{ downloadTotal: number; uploadTotal: number; activeCount: number } | null>(null);
  const [delayMap, setDelayMap] = useState<Record<string, number | null>>({});
  const [testingGroup, setTestingGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    void (async () => {
      const profiles = await loadProfiles();
      const routerSettings = await loadSettings();
      const current = profiles.find((item) => item.id === routerSettings.selectedRouterId) ?? null;
      setSelectedRouter(current);
      if (current) {
        const creds = await loadServiceCredentials(current.id);
        setBaseUrl(creds.clash.baseUrl || defaultClashBaseUrl(current.baseUrl));
        setSecret(creds.clash.secret || "");
        setCredsReady(true);
      }
    })();
  }, []);

  const persist = useCallback(async () => {
    if (!selectedRouter) return;
    setSaving(true);
    try {
      const creds = await loadServiceCredentials(selectedRouter.id);
      await saveServiceCredentials(selectedRouter.id, {
        ...creds,
        clash: { baseUrl: normalizeClashBaseUrl(baseUrl), secret },
      });
      setCredsReady(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }, [baseUrl, secret, selectedRouter]);

  const loadPanel = useCallback(async (silent = false) => {
    if (!selectedRouter) return;
    setBusy(true);
    setError(null);
    try {
      const creds = { baseUrl: normalizeClashBaseUrl(baseUrl), secret };
      const [versionText, proxies, connections] = await Promise.all([
        fetchClashVersion(creds),
        fetchClashProxies(creds),
        fetchClashConnections(creds).catch(() => null),
      ]);
      setVersion(versionText);
      setGroups(selectClashGroups(proxies));
      if (connections) setConnections(connections);
      if (!silent) setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取 Clash 状态。");
    } finally {
      setBusy(false);
    }
  }, [baseUrl, secret, selectedRouter]);

  const testGroupDelays = useCallback(async (group: ClashProxyGroup) => {
    setTestingGroup(group.name);
    setError(null);
    try {
      const creds = { baseUrl: normalizeClashBaseUrl(baseUrl), secret };
      const results = await Promise.all(
        group.all.slice(0, 24).map(async (name) => ({
          name,
          delay: await fetchClashProxyDelay(creds, name).catch(() => null),
        })),
      );
      setDelayMap((previous) => ({ ...previous, ...Object.fromEntries(results.map((item) => [item.name, item.delay])) }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "测速失败。");
    } finally {
      setTestingGroup(null);
    }
  }, [baseUrl, secret]);

  const switchNode = useCallback(async (group: ClashProxyGroup, name: string) => {
    setError(null);
    try {
      await switchClashProxy({ baseUrl: normalizeClashBaseUrl(baseUrl), secret }, group.name, name);
      setGroups((previous) => previous.map((item) => (item.name === group.name ? { ...item, now: name } : item)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "切换失败。");
    }
  }, [baseUrl, secret]);

  const readFromRouter = useCallback(async () => {
    setReading(true);
    setError(null);
    try {
      const { controller, secret: routerSecret } = await readClashSettingsFromRouter();
      if (controller) {
        const host = controller.split(":")[0];
        const port = controller.split(":")[1] ?? "9090";
        const routerHost = selectedRouter
          ? new URL(/^https?:\/\//i.test(selectedRouter.baseUrl) ? selectedRouter.baseUrl : `http://${selectedRouter.baseUrl}`).hostname
          : host;
        // external-controller 若绑定 0.0.0.0,从手机侧访问需替换为路由器地址。
        setBaseUrl(`http://${host === "0.0.0.0" ? routerHost : host}:${port}`);
        if (routerSecret) setSecret(routerSecret);
      } else {
        setError("未能从 OpenClash 配置中读取 external-controller。");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取失败,请确认应用内 SSH 已连接。");
    } finally {
      setReading(false);
    }
  }, [selectedRouter]);

  const disabled = busy || !selectedRouter;

  return <ManagementShell title="OpenClash 面板" description="通过 OpenClash 内置的 Clash API 查看代理组、测速并切换节点;面板地址与密钥保存在本机。">
    <SectionCard title="API 连接" action={selectedRouter ? <Pressable disabled={reading} onPress={() => void readFromRouter()} style={styles.link}><Text style={[styles.linkText, { color: colors.primary }]}>{reading ? "读取中" : "从路由器读取"}</Text></Pressable> : null}>
      {!selectedRouter ? <Text style={[styles.notice, { color: colors.warning }]}>请先在路由器页添加并选择一台路由器。</Text> : <>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>Clash API 地址</Text>
        <TextInput value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholder="http://192.168.1.1:9090" placeholderTextColor={colors.muted} />
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>密钥(secret,可为空)</Text>
        <TextInput value={secret} onChangeText={setSecret} autoCapitalize="none" autoCorrect={false} secureTextEntry style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        <View style={styles.row}>
          <Pressable disabled={saving} onPress={() => void persist()} style={[styles.button, { backgroundColor: colors.primary }, saving && styles.disabled]}><Text style={styles.primaryButtonText}>保存</Text></Pressable>
          <Pressable disabled={disabled || !baseUrl} onPress={() => void loadPanel()} style={[styles.button, styles.outline, { borderColor: colors.border }, disabled && styles.disabled]}><Text style={[styles.buttonText, { color: colors.primary }]}>{busy ? "加载中…" : "连接面板"}</Text></Pressable>
        </View>
      </>}
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
    </SectionCard>

    {version ? <SectionCard title={`Clash ${version}`} action={connections ? <Text style={[styles.caption, { color: colors.muted }]}>{connections.activeCount} 条连接 · ↓ {formatBytesTotal(connections.downloadTotal)} · ↑ {formatBytesTotal(connections.uploadTotal)}</Text> : null}>
      {groups.length ? groups.map((group) => <View key={group.name} style={styles.groupBlock}>
        <View style={styles.groupHeader}>
          <Text style={[styles.groupName, { color: colors.foreground }]} numberOfLines={1}>{group.name}</Text>
          <StatusPill label={group.now ?? "—"} tone="normal" />
          <Pressable disabled={testingGroup !== null} onPress={() => void testGroupDelays(group)} style={[styles.link, testingGroup !== null && styles.disabled]}>
            <Text style={[styles.linkText, { color: colors.primary }]}>{testingGroup === group.name ? "测速中" : "测速"}</Text>
          </Pressable>
        </View>
        <View style={styles.nodeWrap}>
          {group.all.slice(0, 30).map((name) => {
            const selected = group.now === name;
            const delay = delayMap[name];
            return <Pressable key={name} onPress={() => void switchNode(group, name)} style={[styles.node, { borderColor: selected ? colors.primary : colors.border }, selected && { backgroundColor: `${colors.primary}14` }]}>
              <Text numberOfLines={1} style={[styles.nodeName, { color: selected ? colors.primary : colors.foreground }]}>{name}</Text>
              <Text style={[styles.nodeDelay, { color: delay == null ? colors.muted : delay < 200 ? colors.success : delay < 500 ? colors.warning : colors.error }]}>
                {delay == null ? "—" : `${delay}ms`}
              </Text>
            </Pressable>;
          })}
        </View>
      </View>) : <EmptyState icon="hub" title="未读取到代理组" description="连接成功后将在此显示全部可切换的代理组。" />}
    </SectionCard> : null}
    {busy ? <ToolNotice><View style={styles.running}><ActivityIndicator color={colors.primary} /><Text style={[styles.caption, { color: colors.muted }]}>正在请求 Clash API…</Text></View></ToolNotice> : null}
  </ManagementShell>;
}

const styles = StyleSheet.create({
  link: { minHeight: 30, justifyContent: "center", paddingHorizontal: 6 }, linkText: { fontSize: 12, fontWeight: "800" },
  notice: { fontSize: 13, lineHeight: 19 }, caption: { fontSize: 12, lineHeight: 17 },
  fieldLabel: { fontSize: 11, fontWeight: "800", marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, minHeight: 38, fontSize: 13 },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  button: { minHeight: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: 14 },
  outline: { borderWidth: 1 },
  buttonText: { fontSize: 12, fontWeight: "800" },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "800" },
  error: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  disabled: { opacity: 0.46 },
  groupBlock: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(128,128,128,0.3)", paddingTop: 10 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  groupName: { fontSize: 14, fontWeight: "800", flex: 1 },
  nodeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  node: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, minHeight: 34, justifyContent: "center", alignItems: "center", gap: 2, minWidth: 96 },
  nodeName: { fontSize: 11, fontWeight: "700", maxWidth: 120 },
  nodeDelay: { fontSize: 10, fontWeight: "800" },
  running: { flexDirection: "row", alignItems: "center", gap: 10 },
});
