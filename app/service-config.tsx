import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppDialog as Alert } from "@/components/app-dialog";
import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import {
  buildPluginSettingsApplyCommand,
  buildPluginSettingsSnapshotCommand,
  getPluginSettingDefinitions,
  getProxyServiceDefinition,
  parsePluginSettingsSnapshot,
  type PluginSettingsSection,
  type ProxyServiceId,
} from "@/lib/openwrt-advanced-admin";

const SERVICE_IDS: ProxyServiceId[] = [
  "openclash",
  "adguardhome",
  "passwall",
  "passwall2",
  "ddns",
];

function isServiceId(value: string | undefined): value is ProxyServiceId {
  return Boolean(value && SERVICE_IDS.includes(value as ProxyServiceId));
}

function isEnabled(value: string | undefined) {
  return ["1", "true", "on", "yes", "enabled"].includes(
    value?.trim().toLowerCase() ?? "",
  );
}

function isBooleanOption(key: string, value: string) {
  return (
    /^(?:enabled|enable|disabled|disable|[a-z0-9]+_(?:enabled|enable|disabled|disable)|(?:enabled|enable|disabled|disable)_[a-z0-9]+|ipv6|ipv6_enable|udp|tcp|dnsmasq|redirect|proxy|filter|sniffer|auto_update|auto_restart)$/i.test(
      key,
    ) &&
    /^(0|1|true|false|on|off|yes|no|enabled|disabled)$/i.test(value.trim())
  );
}

const COMMON_OPTION_LABELS: Record<string, string> = {
  enabled: "启用服务",
  config: "配置文件",
  proxy_port: "代理端口",
  tproxy_port: "透明代理端口",
  mixed_port: "混合代理端口",
  socks_port: "SOCKS 端口",
  http_port: "HTTP 端口",
  dns_port: "DNS 端口",
  service_name: "服务商",
  interface: "检测接口",
  ip_source: "IP 获取方式",
  ip_url: "公网 IP 查询地址",
  lookup_host: "解析检查主机",
  check_interval: "检查间隔（分钟）",
  force_interval: "强制更新间隔（小时）",
  ddns_dateformat: "DDNS 日期格式",
  ddns_loglines: "DDNS 日志行数",
  ddns_rundir: "DDNS 运行目录",
  ddns_logdir: "DDNS 日志目录",
  en_mode: "增强模式",
  proxy_mode: "代理模式",
  run_mode: "运行模式",
  dns_mode: "DNS 模式",
  log_level: "日志等级",
  log_size: "日志保留大小",
  enable_redirect: "启用流量重定向",
  enable_rule_source: "启用规则订阅",
  rule_source: "规则订阅来源",
  rule_source_update: "自动更新规则订阅",
  rule_source_update_interval: "规则订阅更新间隔",
  config_auto_update: "自动更新配置订阅",
  config_update_path: "配置订阅地址",
  auto_update: "自动更新",
  auto_restart: "自动重启服务",
  geo_auto_update: "自动更新 Geo 数据库",
  geo_update_day: "Geo 数据库更新日期",
  keep_alive: "保持服务运行",
  china_ip_route: "中国 IP 路由模式",
  ipv6_enable: "启用 IPv6",
  ipv6_dns: "IPv6 DNS 设置",
  stream_auto_select: "自动选择流媒体节点",
  sniffer: "启用流量嗅探",
  sniffing: "启用流量嗅探",
  allow_lan: "允许局域网访问",
  allow_remote: "允许远程访问",
  bind_address: "监听地址",
  bind_interface: "绑定接口",
  listen_port: "监听端口",
  dashboard_port: "控制面板端口",
  external_controller: "外部控制器地址",
  external_ui: "外部控制面板",
  secret: "控制器密钥",
  token: "访问令牌",
  rule_mode: "规则模式",
  default_mode: "默认代理模式",
  operation_mode: "运行模式",
  routing_mark: "路由标记",
  firewall_mode: "防火墙模式",
  proxy_ipv6: "代理 IPv6 流量",
  enable_ipv6: "启用 IPv6",
  ipv6: "启用 IPv6",
  udp: "代理 UDP 流量",
  tcp: "代理 TCP 流量",
  local_port: "本地代理端口",
  redir_port: "REDIR 端口",
  tun: "启用 TUN 模式",
  tun_mode: "TUN 运行模式",
  dnsmasq: "接管 DNSMasq",
  disable_masq_cache: "禁用 DNS 缓存",
  respect_rules: "遵循规则集",
  rule_provider: "规则提供商",
  geodata_loader: "Geo 数据加载方式",
  geosite_url: "GeoSite 下载地址",
  geoip_url: "GeoIP 下载地址",
  geoip_dat_url: "GeoIP 数据地址",
  geosite_dat_url: "GeoSite 数据地址",
  update_interval: "更新间隔",
  subscription: "订阅地址",
  subscribe_url: "订阅地址",
  config_path: "配置文件路径",
  config_file: "配置文件",
  log_file: "日志文件",
  start_delay: "启动延迟（秒）",
  retry_count: "失败重试次数",
  retry_interval: "重试间隔（秒）",
  health_check: "启用健康检查",
  health_check_url: "健康检查地址",
  server: "服务地址",
  server_url: "服务地址",
  hostname: "主机名",
  zone: "防火墙区域",
  use_https: "使用 HTTPS",
  use_proxy: "使用代理",
  proxy: "启用代理",
  insecure: "允许不安全证书",
  force: "强制更新",
  verbose: "详细日志",
  debug: "调试日志",
  family: "IP 地址族",
  ip_network: "IP 网络",
  source: "更新来源",
  domain: "域名",
  username: "用户名或 API 标识",
  password: "密码或 API Token",
};

function optionLabel(serviceId: ProxyServiceId, key: string) {
  const known = getPluginSettingDefinitions(serviceId).find(
    (definition) => definition.key === key,
  );
  return known?.label ?? COMMON_OPTION_LABELS[key] ?? `未翻译设置项：${key}`;
}

function sectionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    ddns: "DDNS 全局设置",
    service: "DDNS 服务",
    openclash: "OpenClash 设置",
    openclash_config: "OpenClash 配置",
    openclash_group: "OpenClash 策略组",
    openclash_rule: "OpenClash 规则",
    openclash_server: "OpenClash 节点",
    passwall: "PassWall 设置",
    passwall2: "PassWall2 设置",
    global_forwarding: "全局转发设置",
    nodes: "节点设置",
    rules: "规则设置",
    socks: "SOCKS 服务设置",
    acl: "访问控制设置",
    server: "服务设置",
    global: "全局设置",
    config: "通用设置",
  };
  return labels[type] ?? `配置类型：${type}`;
}

function sectionLabel(serviceId: ProxyServiceId, section: string) {
  const common: Record<string, string> = {
    global: "全局设置",
    config: "主要设置",
    default: "默认设置",
  };
  if (common[section]) return common[section];
  if (serviceId === "ddns") return `DDNS 服务 ${section}`;
  if (serviceId === "openclash") return `OpenClash 配置段 ${section}`;
  if (serviceId === "passwall" || serviceId === "passwall2") {
    return `${serviceId === "passwall" ? "PassWall" : "PassWall2"} 配置段 ${section}`;
  }
  return `配置段 ${section}`;
}

export default function ServiceConfigScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const serviceId = isServiceId(rawId) ? rawId : undefined;
  const service = useMemo(
    () => (serviceId ? getProxyServiceDefinition(serviceId) : null),
    [serviceId],
  );
  const { execute, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [sections, setSections] = useState<PluginSettingsSection[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [exists, setExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!serviceId || !hasRouter || !isSupported) return;
    setLoading(true);
    setNotice(null);
    try {
      const output = await execute(
        buildPluginSettingsSnapshotCommand(serviceId),
      );
      const snapshot = parsePluginSettingsSnapshot(serviceId, output);
      setExists(snapshot.exists);
      setSections(snapshot.sections);
      setDrafts(
        Object.fromEntries(
          snapshot.sections.map((section) => [section.section, section.values]),
        ),
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "无法读取服务设置。",
      );
    } finally {
      setLoading(false);
    }
  }, [execute, hasRouter, isSupported, serviceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const disabled =
    !serviceId || !hasRouter || !isSupported || isRunning || loading;
  const setValue = (section: string, key: string, value: string) =>
    setDrafts((current) => ({
      ...current,
      [section]: { ...(current[section] ?? {}), [key]: value },
    }));

  function save(section: PluginSettingsSection) {
    if (!serviceId || !service) return;
    Alert.alert(
      `保存 ${service.label} 设置`,
      `应用会更新本页读取到的全部实际 UCI 选项，先备份 ${service.configPath}，再提交并重启服务。是否继续？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "保存并重启",
          onPress: () =>
            void (async () => {
              setSaving(section.section);
              setNotice(null);
              try {
                const output = await execute(
                  buildPluginSettingsApplyCommand(
                    serviceId,
                    section.section,
                    drafts[section.section] ?? {},
                  ),
                );
                setNotice(
                  output.trim() || `${service.label} 设置已保存并已重启。`,
                );
                await refresh();
              } catch (reason) {
                setNotice(
                  reason instanceof Error
                    ? reason.message
                    : "保存服务设置失败。",
                );
              } finally {
                setSaving(null);
              }
            })(),
        },
      ],
    );
  }

  if (!serviceId || !service) {
    return (
      <ManagementShell title="服务配置">
        <EmptyState
          icon="error-outline"
          title="不支持的服务"
          description="请从“服务”标签页选择 OpenClash、PassWall、PassWall2、AdGuard Home 或 DDNS。"
        />
      </ManagementShell>
    );
  }

  return (
    <ManagementShell
      title={`${service.label} 设置`}
      description="读取此服务当前实际存在的全部 UCI 设置段与选项。保存前会创建配置备份。"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回服务页"
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.back,
          { borderColor: colors.border, backgroundColor: colors.surface },
          pressed && styles.pressed,
        ]}
      >
        <MaterialIcons name="arrow-back" size={20} color={colors.foreground} />
        <Text style={[styles.backText, { color: colors.foreground }]}>
          返回服务
        </Text>
      </Pressable>
      <View style={styles.settingsGroup}>
        <View style={styles.groupHeader}>
          <Text style={[styles.groupTitle, { color: colors.foreground }]}>
            完整服务设置
          </Text>
          <Pressable
            disabled={disabled || saving !== null}
            onPress={() => void refresh()}
            style={({ pressed }) => [
              styles.action,
              { borderColor: colors.border },
              pressed && styles.pressed,
              (disabled || saving !== null) && styles.disabled,
            ]}
          >
            <Text style={[styles.actionText, { color: colors.primary }]}>
              {loading ? "读取中" : "重新读取"}
            </Text>
          </Pressable>
        </View>
        {exists === false ? (
          <View style={[styles.missing, { backgroundColor: colors.surface }]}>
            <StatusPill label="未找到服务设置" tone="warning" />
            <Text style={[styles.missingText, { color: colors.muted }]}>
              请先在路由器安装并初始化 {service.label}。
            </Text>
          </View>
        ) : null}
        {exists === true && sections.length === 0 ? (
          <EmptyState
            icon="tune"
            title="没有可编辑的设置段"
            description="服务尚未完成初始化，或当前固件的配置结构暂不兼容。"
          />
        ) : null}
        {sections.map((section, index) => {
          const sectionSaving = saving === section.section;
          return (
            <View
              key={section.section}
              style={[
                styles.section,
                index > 0 && {
                  borderTopColor: colors.border,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {sectionLabel(serviceId, section.section)}
              </Text>
              <Text style={[styles.sectionType, { color: colors.muted }]}>
                {sectionTypeLabel(section.type)}
              </Text>
              {Object.entries(drafts[section.section] ?? {}).map(
                ([key, value]) => {
                  if (isBooleanOption(key, value))
                    return (
                      <View key={key} style={styles.switchRow}>
                        <Text
                          style={[
                            styles.fieldLabel,
                            { color: colors.foreground, flex: 1 },
                          ]}
                        >
                          {optionLabel(serviceId, key)}
                        </Text>
                        <Switch
                          value={isEnabled(value)}
                          disabled={disabled || sectionSaving}
                          onValueChange={(next) =>
                            setValue(section.section, key, next ? "1" : "0")
                          }
                          trackColor={{
                            false: colors.border,
                            true: colors.primary,
                          }}
                        />
                      </View>
                    );
                  return (
                    <View key={key} style={styles.field}>
                      <Text
                        style={[
                          styles.fieldLabel,
                          { color: colors.foreground },
                        ]}
                      >
                        {optionLabel(serviceId, key)}
                      </Text>
                      <TextInput
                        value={value}
                        onChangeText={(next) =>
                          setValue(section.section, key, next)
                        }
                        editable={!disabled && !sectionSaving}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={/^(password|token|secret|key)$/i.test(
                          key,
                        )}
                        placeholderTextColor={colors.muted}
                        selectionColor={colors.primary}
                        style={[
                          styles.input,
                          {
                            color: colors.foreground,
                            borderColor: colors.border,
                            backgroundColor: colors.background,
                          },
                        ]}
                      />
                    </View>
                  );
                },
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`保存 ${section.section} 设置`}
                disabled={disabled || sectionSaving}
                onPress={() => save(section)}
                style={({ pressed }) => [
                  styles.save,
                  { backgroundColor: colors.primary },
                  pressed && styles.pressed,
                  (disabled || sectionSaving) && styles.disabled,
                ]}
              >
                {sectionSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveText}>保存并重启服务</Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
      {notice ? (
        <ToolNotice>
          <Text style={[styles.noticeText, { color: colors.foreground }]}>
            {notice}
          </Text>
        </ToolNotice>
      ) : null}
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  back: {
    minHeight: 42,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  backText: { fontSize: 14, fontWeight: "800" },
  noticeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  noticeCopy: { flex: 1, gap: 3 },
  noticeTitle: { fontSize: 14, fontWeight: "800" },
  noticeText: { fontSize: 13, lineHeight: 19 },
  action: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { fontSize: 12, fontWeight: "800" },
  settingsGroup: { gap: 14 },
  groupHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  groupTitle: { flex: 1, fontSize: 22, fontWeight: "900" },
  missing: { borderRadius: 12, padding: 12, gap: 7, marginBottom: 12 },
  missingText: { fontSize: 12, lineHeight: 18 },
  section: { paddingTop: 14, gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "800" },
  sectionType: { marginTop: -8, fontSize: 12 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "700" },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  switchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  save: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 3,
  },
  saveText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.5 },
});
