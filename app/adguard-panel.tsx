import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import {
  defaultAdGuardBaseUrl,
  fetchAdGuardStats,
  fetchAdGuardStatus,
  formatAdGuardCount,
  normalizeAdGuardBaseUrl,
  type AdGuardStats,
  type AdGuardStatus,
} from "@/lib/adguard-api";
import { loadServiceCredentials, saveServiceCredentials } from "@/lib/service-credentials";
import { loadProfiles, loadSettings } from "@/lib/router-storage";
import type { RouterProfile } from "@/shared/router-types";

export default function AdGuardPanelScreen() {
  const colors = useColors();
  const [selectedRouter, setSelectedRouter] = useState<RouterProfile | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<AdGuardStatus | null>(null);
  const [stats, setStats] = useState<AdGuardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const profiles = await loadProfiles();
      const routerSettings = await loadSettings();
      const current = profiles.find((item) => item.id === routerSettings.selectedRouterId) ?? null;
      setSelectedRouter(current);
      if (current) {
        const creds = await loadServiceCredentials(current.id);
        setBaseUrl(creds.adguard.baseUrl || defaultAdGuardBaseUrl(current.baseUrl));
        setUsername(creds.adguard.username || "");
        setPassword(creds.adguard.password || "");
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
        adguard: { baseUrl: normalizeAdGuardBaseUrl(baseUrl), username, password },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }, [baseUrl, password, selectedRouter, username]);

  const loadPanel = useCallback(async () => {
    if (!selectedRouter) return;
    setBusy(true);
    setError(null);
    try {
      const creds = { baseUrl: normalizeAdGuardBaseUrl(baseUrl), username, password };
      const [nextStatus, nextStats] = await Promise.all([
        fetchAdGuardStatus(creds),
        fetchAdGuardStats(creds),
      ]);
      setStatus(nextStatus);
      setStats(nextStats);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取 AdGuard Home 状态。");
    } finally {
      setBusy(false);
    }
  }, [baseUrl, password, selectedRouter, username]);

  const blockRatio = stats && stats.numDnsQueries > 0
    ? Math.round((stats.numBlockedFiltering / stats.numDnsQueries) * 100)
    : 0;

  return <ManagementShell title="AdGuard Home" description="通过 AdGuard Home 的 HTTP API 查看拦截统计与保护状态;地址与凭据仅保存在本机。">
    <SectionCard title="API 连接" action={<Pressable disabled={busy || !baseUrl} onPress={() => void loadPanel()} style={[styles.link, busy && styles.disabled]}><Text style={[styles.linkText, { color: colors.primary }]}>{busy ? "加载中" : "刷新"}</Text></Pressable>}>
      {!selectedRouter ? <Text style={[styles.notice, { color: colors.warning }]}>请先在路由器页添加并选择一台路由器。</Text> : <>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>AdGuard Home 地址</Text>
        <TextInput value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholder="http://192.168.1.1:3000" placeholderTextColor={colors.muted} />
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>用户名</Text>
            <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
          </View>
          <View style={styles.grow}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>密码</Text>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
          </View>
        </View>
        <View style={styles.row}>
          <Pressable disabled={saving} onPress={() => void persist()} style={[styles.button, { backgroundColor: colors.primary }, saving && styles.disabled]}><Text style={styles.primaryButtonText}>保存凭据</Text></Pressable>
        </View>
      </>}
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
    </SectionCard>

    {status ? <SectionCard title="运行状态" action={<StatusPill label={status.protectionEnabled ? "保护中" : "已暂停"} tone={status.protectionEnabled ? "success" : "warning"} />}>
      <View style={styles.statRow}>
        <View style={[styles.tile, { backgroundColor: colors.background }]}><Text style={styles.tileNumber}>{status.running ? "运行中" : "已停止"}</Text><Text style={[styles.tileLabel, { color: colors.muted }]}>服务</Text></View>
        <View style={[styles.tile, { backgroundColor: colors.background }]}><Text style={styles.tileNumber}>{status.version || "—"}</Text><Text style={[styles.tileLabel, { color: colors.muted }]}>版本</Text></View>
      </View>
    </SectionCard> : null}

    {stats ? <SectionCard title="拦截统计(24 小时)">
      <View style={styles.statRow}>
        <View style={[styles.tile, { backgroundColor: colors.background }]}><Text style={styles.tileNumber}>{formatAdGuardCount(stats.numDnsQueries)}</Text><Text style={[styles.tileLabel, { color: colors.muted }]}>DNS 查询</Text></View>
        <View style={[styles.tile, { backgroundColor: colors.background }]}><Text style={[styles.tileNumber, { color: colors.primary }]}>{formatAdGuardCount(stats.numBlockedFiltering)}</Text><Text style={[styles.tileLabel, { color: colors.muted }]}>已拦截</Text></View>
        <View style={[styles.tile, { backgroundColor: colors.background }]}><Text style={styles.tileNumber}>{blockRatio}%</Text><Text style={[styles.tileLabel, { color: colors.muted }]}>拦截比例</Text></View>
      </View>
      {stats.avgProcessingTimeMs != null ? <Text style={[styles.caption, { color: colors.muted }]}>平均处理耗时 {stats.avgProcessingTimeMs} ms</Text> : null}
      <TopList title="查询最多的域名" items={stats.topQueriedDomains.slice(0, 8)} colors={colors} />
      <TopList title="拦截最多的域名" items={stats.topBlockedDomains.slice(0, 8)} colors={colors} highlight />
    </SectionCard> : <EmptyState icon="shield" title="尚未读取统计" description="填写地址与凭据后点击刷新;AdGuard Home 需与本机处于同一局域网。" />}
    {busy ? <ToolNotice><View style={styles.running}><ActivityIndicator color={colors.primary} /><Text style={[styles.caption, { color: colors.muted }]}>正在请求 AdGuard Home API…</Text></View></ToolNotice> : null}
  </ManagementShell>;
}

function TopList(props: { title: string; items: Array<[string, number]>; colors: ReturnType<typeof useColors>; highlight?: boolean }) {
  if (!props.items.length) return null;
  const max = Math.max(...props.items.map((item) => item[1]), 1);
  return <View style={styles.topList}>
    <Text style={[styles.topListTitle, { color: props.colors.foreground }]}>{props.title}</Text>
    {props.items.map(([domain, count]) => <View key={domain} style={styles.topRow}>
      <Text numberOfLines={1} style={[styles.topDomain, { color: props.colors.foreground }]}>{domain}</Text>
      <View style={[styles.topMeter, { backgroundColor: props.colors.border }]}><View style={[styles.topMeterValue, { width: `${Math.max(8, (count / max) * 100)}%`, backgroundColor: props.highlight ? props.colors.error : props.colors.primary }]} /></View>
      <Text style={[styles.topCount, { color: props.colors.muted }]}>{formatAdGuardCount(count)}</Text>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  link: { minHeight: 30, justifyContent: "center", paddingHorizontal: 6 }, linkText: { fontSize: 12, fontWeight: "800" },
  notice: { fontSize: 13, lineHeight: 19 }, caption: { fontSize: 12, lineHeight: 17, paddingHorizontal: 14, paddingBottom: 6 },
  fieldLabel: { fontSize: 11, fontWeight: "800", marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, minHeight: 38, fontSize: 13 },
  row: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "flex-end" },
  grow: { flex: 1 },
  button: { minHeight: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: 14 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "800" },
  error: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  disabled: { opacity: 0.46 },
  statRow: { flexDirection: "row", gap: 8, padding: 12 },
  tile: { flex: 1, minHeight: 66, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 3 },
  tileNumber: { fontSize: 18, fontWeight: "900" },
  tileLabel: { fontSize: 11, fontWeight: "700" },
  topList: { marginTop: 8, paddingHorizontal: 14, paddingBottom: 6, gap: 6 },
  topListTitle: { fontSize: 13, fontWeight: "800" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  topDomain: { fontSize: 11, flex: 0.9 },
  topMeter: { flex: 1, height: 5, borderRadius: 6, overflow: "hidden" },
  topMeterValue: { height: "100%", borderRadius: 6 },
  topCount: { fontSize: 10, fontWeight: "800", width: 42, textAlign: "right" },
  running: { flexDirection: "row", alignItems: "center", gap: 10 },
});
