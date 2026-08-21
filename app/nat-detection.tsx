import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { MetricTile, SectionCard, StatusPill } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { detectPhoneNat, type PhoneNatResult } from "@/lib/native-nat";

function mappingCaption(result: PhoneNatResult) {
  switch (result.mappingBehavior) {
    case "endpoint-independent-mapping":
      return "多个 STUN 端点的公网映射一致";
    case "endpoint-dependent-mapping":
      return "不同 STUN 端点返回不同的公网端口";
    case "multiple-public-addresses":
      return "不同 STUN 端点返回不同的公网地址";
    default:
      return "第二个 STUN 端点未返回可比较的映射";
  }
}

export default function NatDetectionScreen() {
  const colors = useColors();
  const [result, setResult] = useState<PhoneNatResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRunning, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setNotice(null);
    try {
      setResult(await detectPhoneNat());
    } catch (reason) {
      setResult(null);
      setNotice(reason instanceof Error ? reason.message : "手机网络 NAT 检测失败。");
    } finally {
      setRunning(false);
    }
  }

  return (
    <ManagementShell
      title="NAT 类型检测"
      description="使用手机当前默认网络向公共 STUN 服务发送 UDP 请求；不连接路由器、不使用 SSH，也无需在路由器安装任何组件。"
    >
      <SectionCard title="手机当前网络">
        <View style={styles.copy}>
          <Text style={[styles.caption, { color: colors.muted }]}>
            检测会比较多个 STUN 端点返回的公网映射，用于判断手机当前网络的 NAT 行为。结果反映的是手机网络，不是路由器 WAN 的 NAT。
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isRunning}
          onPress={() => void run()}
          style={({ pressed }) => [
            styles.run,
            { backgroundColor: colors.primary },
            pressed && styles.pressed,
            isRunning && styles.disabled,
          ]}
        >
          {isRunning ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="cell-tower" size={19} color="#FFFFFF" />}
          <Text style={styles.runText}>{isRunning ? "正在检测 NAT 类型…" : "开始 NAT 类型检测"}</Text>
        </Pressable>
      </SectionCard>

      {result ? (
        <>
          <SectionCard title="检测结果">
            <View style={styles.resultHead}>
              <View style={styles.resultCopy}>
                <Text style={[styles.natType, { color: colors.foreground }]}>{result.typeLabel}</Text>
                <Text style={[styles.caption, { color: colors.muted }]}>NAT 类型判断</Text>
              </View>
              <StatusPill label="已完成" tone="success" />
            </View>
          </SectionCard>
          <SectionCard title="公网映射">
            <View style={styles.metrics}>
              <MetricTile icon="public" label="公网地址" value={result.publicAddress} caption={`端口 ${result.publicPort}`} tone="normal" />
              <MetricTile icon="compare-arrows" label="映射行为" value={mappingCaption(result)} caption={result.mappingBehavior} tone="normal" />
            </View>
          </SectionCard>
          <SectionCard title="STUN 端点">
            <View style={styles.endpoint}>
              <Text style={[styles.endpointLabel, { color: colors.muted }]}>主端点</Text>
              <Text selectable style={[styles.endpointValue, { color: colors.foreground }]}>{result.primaryServer}</Text>
            </View>
            <View style={[styles.endpoint, { borderTopColor: colors.border }]}>
              <Text style={[styles.endpointLabel, { color: colors.muted }]}>对比端点</Text>
              <Text selectable style={[styles.endpointValue, { color: colors.foreground }]}>
                {result.comparisonAddress && result.comparisonPort
                  ? `${result.comparisonAddress}:${result.comparisonPort}（${result.comparisonServer ?? "STUN"}）`
                  : "未返回可比较结果"}
              </Text>
            </View>
          </SectionCard>
        </>
      ) : null}

      {isRunning ? (
        <ToolNotice>
          <View style={styles.noticeRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.notice, { color: colors.muted }]}>正在从手机当前网络执行 STUN 检测…</Text>
          </View>
        </ToolNotice>
      ) : null}
      {notice ? (
        <ToolNotice>
          <Text selectable style={[styles.notice, { color: colors.error }]}>{notice}</Text>
        </ToolNotice>
      ) : null}
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  copy: { padding: 15 },
  caption: { fontSize: 12, lineHeight: 18 },
  run: { minHeight: 44, margin: 15, marginTop: 0, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  runText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  resultHead: { padding: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  resultCopy: { flex: 1 },
  natType: { fontSize: 17, fontWeight: "800", lineHeight: 23 },
  metrics: { padding: 14, gap: 10 },
  endpoint: { padding: 15 },
  endpointLabel: { fontSize: 12, fontWeight: "700" },
  endpointValue: { marginTop: 4, fontSize: 13, lineHeight: 19 },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  notice: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
});
