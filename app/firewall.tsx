import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
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
  buildFirewallForwardingToggleCommand,
  buildFirewallRuleCreateCommand,
  buildFirewallRuleDeleteCommand,
  buildFirewallRuleToggleCommand,
  buildFirewallSnapshotCommand,
  buildPortForwardCreateCommand,
  buildPortForwardDeleteCommand,
  buildPortForwardToggleCommand,
  buildUpnpActionCommand,
  parseFirewallSnapshot,
  type FirewallSnapshot,
  type FirewallTrafficRuleDraft,
  type PortForwardDraft,
  type PortForwardRule,
} from "@/lib/openwrt-advanced-admin";

const emptyDraft: PortForwardDraft = {
  name: "",
  sourceZone: "wan",
  destinationZone: "lan",
  destinationIp: "",
  sourcePort: "",
  destinationPort: "",
  protocol: "tcp",
};
const emptyTrafficDraft: FirewallTrafficRuleDraft = {
  name: "",
  sourceZone: "",
  destinationZone: "",
  protocol: "tcp",
  sourceIp: "",
  destinationIp: "",
  sourcePort: "",
  destinationPort: "",
  target: "ACCEPT",
};

export default function FirewallScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [snapshot, setSnapshot] = useState<FirewallSnapshot | null>(null);
  const [draft, setDraft] = useState<PortForwardDraft>(emptyDraft);
  const [trafficDraft, setTrafficDraft] =
    useState<FirewallTrafficRuleDraft>(emptyTrafficDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [trafficModalVisible, setTrafficModalVisible] = useState(false);
  const [portForwardModalVisible, setPortForwardModalVisible] = useState(false);

  const refresh = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    setIsLoading(true);
    setNotice(null);
    try {
      const output = await execute(buildFirewallSnapshotCommand());
      const next = parseFirewallSnapshot(output);
      setSnapshot(next);
      const names = next.zones.map((zone) => zone.name);
      setDraft((current) => ({
        ...current,
        sourceZone: names.includes(current.sourceZone)
          ? current.sourceZone
          : (names.find((name) => /wan/i.test(name)) ?? "wan"),
        destinationZone: names.includes(current.destinationZone)
          ? current.destinationZone
          : (names.find((name) => /lan/i.test(name)) ?? "lan"),
      }));
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "防火墙状态读取失败。",
      );
    } finally {
      setIsLoading(false);
    }
  }, [execute, hasRouter, isSupported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const disabled = !hasRouter || !isSupported || isRunning || isLoading;

  function runConfirmed(
    title: string,
    message: string,
    command: string,
    success: string,
    destructive = false,
  ) {
    Alert.alert(title, message, [
      { text: "取消", style: "cancel" },
      {
        text: "确认执行",
        style: destructive ? "destructive" : "default",
        onPress: () =>
          void (async () => {
            try {
              const output = await execute(command);
              setNotice(output.trim() || success);
              await refresh();
            } catch {}
          })(),
      },
    ]);
  }

  function toggleRule(rule: PortForwardRule, enabled: boolean) {
    runConfirmed(
      enabled ? "启用端口转发" : "停用端口转发",
      `${enabled ? "启用" : "停用"}“${rule.name}”会立即重载防火墙。是否继续？`,
      buildPortForwardToggleCommand(rule.section, enabled),
      `规则“${rule.name}”已${enabled ? "启用" : "停用"}。`,
      !enabled,
    );
  }

  function deleteRule(rule: PortForwardRule) {
    runConfirmed(
      "删除端口转发",
      `删除“${rule.name}”后会立即重载防火墙，且无法自动恢复。是否继续？`,
      buildPortForwardDeleteCommand(rule.section),
      `规则“${rule.name}”已删除。`,
      true,
    );
  }

  function confirmCreate() {
    try {
      const command = buildPortForwardCreateCommand(draft);
      setPortForwardModalVisible(false);
      runConfirmed(
        "新增端口转发",
        `将把外网 ${draft.sourcePort || "—"} 转发到 ${draft.destinationIp || "—"}:${draft.destinationPort || "—"}，并立即重载防火墙。是否继续？`,
        command,
        "端口转发规则已新增。",
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "端口转发参数无效。",
      );
    }
  }

  function confirmTrafficCreate() {
    try {
      const command = buildFirewallRuleCreateCommand(trafficDraft);
      setTrafficModalVisible(false);
      runConfirmed(
        "新增通信规则",
        `将创建“${trafficDraft.name || "未命名规则"}”并立即重载防火墙。错误规则可能影响联网，请确认参数。`,
        command,
        "通信规则已新增。",
        trafficDraft.target !== "ACCEPT",
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "通信规则参数无效。",
      );
    }
  }

  return (
    <ManagementShell
      title="防火墙与端口转发"
      description="读取 UCI 防火墙配置。新增、启停或删除规则前均会展示确认提示，并立即重载防火墙。"
    >
      <SectionCard
        title="安全区域"
        action={
          <Pressable
            disabled={disabled}
            onPress={() => void refresh()}
            style={({ pressed }) => [
              styles.refresh,
              { borderColor: colors.border },
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <Text style={[styles.refreshText, { color: colors.primary }]}>
              {isLoading ? "读取中" : "刷新"}
            </Text>
          </Pressable>
        }
      >
        {snapshot?.zones.length ? (
          snapshot.zones.map((zone, index) => (
            <View
              key={zone.section}
              style={[
                styles.zone,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={styles.zoneHead}>
                <View>
                  <Text style={[styles.zoneName, { color: colors.foreground }]}>
                    {zone.name}
                  </Text>
                  <Text style={[styles.caption, { color: colors.muted }]}>
                    {zone.networks.length
                      ? zone.networks.join(" · ")
                      : "未关联网络"}
                  </Text>
                </View>
                <StatusPill
                  label={`入 ${zone.input} · 转发 ${zone.forward}`}
                  tone={zone.input === "ACCEPT" ? "warning" : "success"}
                />
              </View>
              <Text style={[styles.caption, { color: colors.muted }]}>
                输出策略：{zone.output}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState
            icon="security"
            title="尚未读取安全区域"
            description="连接 Android 应用内 SSH 后可读取当前防火墙区域。"
          />
        )}
      </SectionCard>

      <SectionCard
        title={`区域转发${snapshot?.forwardings.length ? ` · ${snapshot.forwardings.length}` : ""}`}
      >
        {snapshot?.forwardings.length ? (
          snapshot.forwardings.map((forwarding, index) => (
            <View
              key={forwarding.section}
              style={[
                styles.rule,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={styles.ruleHead}>
                <View style={styles.ruleCopy}>
                  <Text style={[styles.ruleName, { color: colors.foreground }]}>
                    {forwarding.sourceZone} → {forwarding.destinationZone}
                  </Text>
                  <Text style={[styles.caption, { color: colors.muted }]}>
                    允许区域间转发；关闭后会立即重载防火墙。
                  </Text>
                </View>
                <Switch
                  value={forwarding.enabled}
                  disabled={disabled}
                  onValueChange={(value) =>
                    runConfirmed(
                      value ? "启用区域转发" : "停用区域转发",
                      `${value ? "启用" : "停用"} ${forwarding.sourceZone} → ${forwarding.destinationZone}。是否继续？`,
                      buildFirewallForwardingToggleCommand(
                        forwarding.section,
                        value,
                      ),
                      "区域转发状态已更新。",
                      !value,
                    )
                  }
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            icon="alt-route"
            title="未检测到自定义区域转发"
            description="默认区域策略仍会在上方安全区域中显示。"
          />
        )}
      </SectionCard>

      <SectionCard
        title={`通信规则${snapshot?.trafficRules.length ? ` · ${snapshot.trafficRules.length}` : ""}`}
      >
        {snapshot?.trafficRules.length ? (
          snapshot.trafficRules.map((rule, index) => (
            <View
              key={rule.section}
              style={[
                styles.rule,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={styles.ruleHead}>
                <View style={styles.ruleCopy}>
                  <Text style={[styles.ruleName, { color: colors.foreground }]}>
                    {rule.name}
                  </Text>
                  <Text style={[styles.caption, { color: colors.muted }]}>
                    {rule.sourceZone} → {rule.destinationZone} · {rule.protocol}{" "}
                    · {rule.destinationIp || "任意地址"}
                    {rule.destinationPort
                      ? `:${rule.destinationPort}`
                      : ""} · {rule.target}
                  </Text>
                </View>
                <Switch
                  value={rule.enabled}
                  disabled={disabled}
                  onValueChange={(value) =>
                    runConfirmed(
                      value ? "启用通信规则" : "停用通信规则",
                      `${value ? "启用" : "停用"}“${rule.name}”会立即重载防火墙。是否继续？`,
                      buildFirewallRuleToggleCommand(rule.section, value),
                      `规则“${rule.name}”已${value ? "启用" : "停用"}。`,
                      !value,
                    )
                  }
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <Pressable
                disabled={disabled}
                onPress={() =>
                  runConfirmed(
                    "删除通信规则",
                    `删除“${rule.name}”会立即重载防火墙，且无法自动恢复。是否继续？`,
                    buildFirewallRuleDeleteCommand(rule.section),
                    `规则“${rule.name}”已删除。`,
                    true,
                  )
                }
                style={({ pressed }) => [
                  styles.delete,
                  { borderColor: colors.error },
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}
              >
                <Text style={[styles.deleteText, { color: colors.error }]}>
                  删除规则
                </Text>
              </Pressable>
            </View>
          ))
        ) : (
          <EmptyState
            icon="security"
            title="未检测到通信规则"
            description="可在下方新增允许、拒绝或丢弃通信的规则。"
          />
        )}
      </SectionCard>

      <SectionCard title="新增通信规则">
        <Pressable
          disabled={disabled}
          onPress={() => setTrafficModalVisible(true)}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.primary },
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <Text style={styles.primaryText}>新增通信规则</Text>
        </Pressable>
      </SectionCard>
      <Modal
        visible={trafficModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTrafficModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalSheet, { backgroundColor: colors.surface }]}
          >
            <View
              style={[styles.modalHeader, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                新增通信规则
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setTrafficModalVisible(false)}
                style={({ pressed }) => [
                  styles.modalClose,
                  { backgroundColor: colors.background },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[styles.modalCloseText, { color: colors.foreground }]}
                >
                  关闭
                </Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalBody}
            >
              <View style={styles.form}>
                <TextInput
                  value={trafficDraft.name}
                  onChangeText={(value) =>
                    setTrafficDraft((current) => ({ ...current, name: value }))
                  }
                  placeholder="规则名称，例如允许 DNS"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  maxLength={48}
                />
                <View style={styles.row}>
                  <TextInput
                    value={trafficDraft.sourceZone}
                    onChangeText={(value) =>
                      setTrafficDraft((current) => ({
                        ...current,
                        sourceZone: value,
                      }))
                    }
                    placeholder="来源区域（留空为任意）"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      styles.half,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    maxLength={32}
                  />
                  <TextInput
                    value={trafficDraft.destinationZone}
                    onChangeText={(value) =>
                      setTrafficDraft((current) => ({
                        ...current,
                        destinationZone: value,
                      }))
                    }
                    placeholder="目标区域（留空为本机）"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      styles.half,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    maxLength={32}
                  />
                </View>
                <View style={styles.row}>
                  <TextInput
                    value={trafficDraft.destinationIp}
                    onChangeText={(value) =>
                      setTrafficDraft((current) => ({
                        ...current,
                        destinationIp: value,
                      }))
                    }
                    placeholder="目标 IPv4 / CIDR（可选）"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      styles.half,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    maxLength={18}
                  />
                  <TextInput
                    value={trafficDraft.destinationPort}
                    onChangeText={(value) =>
                      setTrafficDraft((current) => ({
                        ...current,
                        destinationPort: value,
                      }))
                    }
                    keyboardType="numbers-and-punctuation"
                    placeholder="目标端口（可选）"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      styles.half,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    maxLength={11}
                  />
                </View>
                <View style={styles.protocols}>
                  {(["tcp", "udp", "tcp udp"] as const).map((protocol) => (
                    <Pressable
                      key={protocol}
                      onPress={() =>
                        setTrafficDraft((current) => ({ ...current, protocol }))
                      }
                      style={({ pressed }) => [
                        styles.protocol,
                        {
                          borderColor:
                            trafficDraft.protocol === protocol
                              ? colors.primary
                              : colors.border,
                          backgroundColor:
                            trafficDraft.protocol === protocol
                              ? colors.primary
                              : colors.background,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.protocolText,
                          {
                            color:
                              trafficDraft.protocol === protocol
                                ? "#fff"
                                : colors.muted,
                          },
                        ]}
                      >
                        {protocol.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.protocols}>
                  {(["ACCEPT", "REJECT", "DROP"] as const).map((target) => (
                    <Pressable
                      key={target}
                      onPress={() =>
                        setTrafficDraft((current) => ({ ...current, target }))
                      }
                      style={({ pressed }) => [
                        styles.protocol,
                        {
                          borderColor:
                            trafficDraft.target === target
                              ? colors.primary
                              : colors.border,
                          backgroundColor:
                            trafficDraft.target === target
                              ? colors.primary
                              : colors.background,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.protocolText,
                          {
                            color:
                              trafficDraft.target === target
                                ? "#fff"
                                : colors.muted,
                          },
                        ]}
                      >
                        {target}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  disabled={disabled}
                  onPress={confirmTrafficCreate}
                  style={({ pressed }) => [
                    styles.primary,
                    { backgroundColor: colors.primary },
                    pressed && styles.pressed,
                    disabled && styles.disabled,
                  ]}
                >
                  <Text style={styles.primaryText}>检查后新增通信规则</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <SectionCard
        title={`端口转发${snapshot?.portForwards.length ? ` · ${snapshot.portForwards.length}` : ""}`}
      >
        {snapshot?.portForwards.length ? (
          snapshot.portForwards.map((rule, index) => (
            <View
              key={rule.section}
              style={[
                styles.rule,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={styles.ruleHead}>
                <View style={styles.ruleCopy}>
                  <Text style={[styles.ruleName, { color: colors.foreground }]}>
                    {rule.name}
                  </Text>
                  <Text style={[styles.caption, { color: colors.muted }]}>
                    {rule.sourceZone}:{rule.sourcePort} → {rule.destinationIp}:
                    {rule.destinationPort} · {rule.protocol}
                  </Text>
                </View>
                <Switch
                  value={rule.enabled}
                  disabled={disabled}
                  onValueChange={(value) => toggleRule(rule, value)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <Pressable
                disabled={disabled}
                onPress={() => deleteRule(rule)}
                style={({ pressed }) => [
                  styles.delete,
                  { borderColor: colors.error },
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}
              >
                <Text style={[styles.deleteText, { color: colors.error }]}>
                  删除规则
                </Text>
              </Pressable>
            </View>
          ))
        ) : (
          <EmptyState
            icon="alt-route"
            title="未配置端口转发"
            description="可在下方新增规则。应用只允许固定格式的 IPv4、端口及协议参数。"
          />
        )}
      </SectionCard>

      <SectionCard title="新增端口转发">
        <Pressable
          disabled={disabled}
          onPress={() => setPortForwardModalVisible(true)}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.primary },
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <Text style={styles.primaryText}>新增端口转发</Text>
        </Pressable>
      </SectionCard>
      <Modal
        visible={portForwardModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPortForwardModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalSheet, { backgroundColor: colors.surface }]}
          >
            <View
              style={[styles.modalHeader, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                新增端口转发
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPortForwardModalVisible(false)}
                style={({ pressed }) => [
                  styles.modalClose,
                  { backgroundColor: colors.background },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[styles.modalCloseText, { color: colors.foreground }]}
                >
                  关闭
                </Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalBody}
            >
              <View style={styles.form}>
                <TextInput
                  value={draft.name}
                  onChangeText={(value) =>
                    setDraft((current) => ({ ...current, name: value }))
                  }
                  placeholder="规则名称，例如 NAS HTTPS"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  maxLength={48}
                />
                <View style={styles.row}>
                  <TextInput
                    value={draft.sourceZone}
                    onChangeText={(value) =>
                      setDraft((current) => ({ ...current, sourceZone: value }))
                    }
                    placeholder="来源区域"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      styles.half,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    maxLength={32}
                  />
                  <TextInput
                    value={draft.destinationZone}
                    onChangeText={(value) =>
                      setDraft((current) => ({
                        ...current,
                        destinationZone: value,
                      }))
                    }
                    placeholder="目标区域"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      styles.half,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    maxLength={32}
                  />
                </View>
                <View style={styles.row}>
                  <TextInput
                    value={draft.sourcePort}
                    onChangeText={(value) =>
                      setDraft((current) => ({ ...current, sourcePort: value }))
                    }
                    keyboardType="numbers-and-punctuation"
                    placeholder="外部端口，例如 443"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      styles.half,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    maxLength={11}
                  />
                  <TextInput
                    value={draft.destinationPort}
                    onChangeText={(value) =>
                      setDraft((current) => ({
                        ...current,
                        destinationPort: value,
                      }))
                    }
                    keyboardType="numbers-and-punctuation"
                    placeholder="内部端口，例如 443"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      styles.half,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    maxLength={11}
                  />
                </View>
                <TextInput
                  value={draft.destinationIp}
                  onChangeText={(value) =>
                    setDraft((current) => ({
                      ...current,
                      destinationIp: value,
                    }))
                  }
                  keyboardType="numbers-and-punctuation"
                  placeholder="内网 IPv4，例如 192.168.1.20"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  maxLength={15}
                />
                <View style={styles.protocols}>
                  {(["tcp", "udp", "tcp udp"] as const).map((protocol) => (
                    <Pressable
                      key={protocol}
                      onPress={() =>
                        setDraft((current) => ({ ...current, protocol }))
                      }
                      style={({ pressed }) => [
                        styles.protocol,
                        {
                          borderColor:
                            draft.protocol === protocol
                              ? colors.primary
                              : colors.border,
                          backgroundColor:
                            draft.protocol === protocol
                              ? colors.primary
                              : colors.background,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.protocolText,
                          {
                            color:
                              draft.protocol === protocol
                                ? "#fff"
                                : colors.muted,
                          },
                        ]}
                      >
                        {protocol.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  disabled={disabled}
                  onPress={confirmCreate}
                  style={({ pressed }) => [
                    styles.primary,
                    { backgroundColor: colors.primary },
                    pressed && styles.pressed,
                    disabled && styles.disabled,
                  ]}
                >
                  <Text style={styles.primaryText}>检查后新增规则</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <SectionCard title="UPnP / NAT-PMP">
        <View style={styles.upnp}>
          <View style={styles.ruleCopy}>
            <Text style={[styles.ruleName, { color: colors.foreground }]}>
              miniupnpd
            </Text>
            <Text style={[styles.caption, { color: colors.muted }]}>
              {snapshot?.upnp.installed
                ? `服务${snapshot.upnp.running ? "正在运行" : "已停止"} · UCI 开关${snapshot.upnp.enabled ? "已启用" : "未启用"}`
                : "未检测到 miniupnpd 服务。"}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              disabled={disabled || !snapshot?.upnp.installed}
              onPress={() =>
                runConfirmed(
                  "重启 UPnP",
                  "重启会短暂中断自动端口映射。是否继续？",
                  buildUpnpActionCommand("restart"),
                  "UPnP 已重启。",
                )
              }
              style={({ pressed }) => [
                styles.action,
                { borderColor: colors.primary },
                pressed && styles.pressed,
                (disabled || !snapshot?.upnp.installed) && styles.disabled,
              ]}
            >
              <Text style={[styles.actionText, { color: colors.primary }]}>
                重启
              </Text>
            </Pressable>
            <Pressable
              disabled={disabled || !snapshot?.upnp.installed}
              onPress={() =>
                runConfirmed(
                  snapshot?.upnp.running ? "停止 UPnP" : "启动 UPnP",
                  "此操作会改变 UPnP 服务的运行状态。是否继续？",
                  buildUpnpActionCommand(
                    snapshot?.upnp.running ? "stop" : "start",
                  ),
                  "UPnP 服务命令已提交。",
                  Boolean(snapshot?.upnp.running),
                )
              }
              style={({ pressed }) => [
                styles.action,
                { borderColor: colors.warning },
                pressed && styles.pressed,
                (disabled || !snapshot?.upnp.installed) && styles.disabled,
              ]}
            >
              <Text style={[styles.actionText, { color: colors.warning }]}>
                {snapshot?.upnp.running ? "停止" : "启动"}
              </Text>
            </Pressable>
          </View>
        </View>
      </SectionCard>
      {isRunning ? (
        <ToolNotice>
          <View style={styles.running}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.caption, { color: colors.muted }]}>
              正在执行防火墙操作…
            </Text>
          </View>
        </ToolNotice>
      ) : null}
      {error || notice ? (
        <ToolNotice>
          <Text
            selectable
            style={[
              styles.notice,
              { color: error ? colors.error : colors.foreground },
            ]}
          >
            {error ?? notice}
          </Text>
        </ToolNotice>
      ) : null}
      {!isSupported ? (
        <ToolNotice>
          <Text style={[styles.notice, { color: colors.warning }]}>
            此功能需要安装包含应用内 SSH 的 Android APK。
          </Text>
        </ToolNotice>
      ) : null}
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  refresh: {
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 11,
  },
  refreshText: { fontSize: 12, fontWeight: "800" },
  zone: { padding: 15, gap: 7 },
  zoneHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  zoneName: { fontSize: 16, fontWeight: "800" },
  caption: { fontSize: 12, lineHeight: 18 },
  rule: { padding: 15, gap: 12 },
  ruleHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  ruleCopy: { flex: 1, minWidth: 0, gap: 4 },
  ruleName: { fontSize: 15, fontWeight: "800" },
  delete: {
    height: 36,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { fontSize: 12, fontWeight: "800" },
  form: { padding: 15, gap: 10 },
  row: { gap: 10 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  half: { alignSelf: "stretch" },
  protocols: { flexDirection: "row", gap: 8 },
  protocol: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  protocolText: { fontSize: 11, fontWeight: "800" },
  primary: {
    minHeight: 44,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.46)",
  },
  modalSheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  modalHeader: {
    minHeight: 60,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontWeight: "800" },
  modalClose: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    justifyContent: "center",
  },
  modalCloseText: { fontSize: 13, fontWeight: "800" },
  modalBody: { padding: 16, paddingBottom: 32 },
  upnp: { padding: 15, gap: 13 },
  actions: { flexDirection: "row", gap: 8 },
  action: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { fontSize: 12, fontWeight: "800" },
  running: { flexDirection: "row", alignItems: "center", gap: 10 },
  notice: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.46 },
});
