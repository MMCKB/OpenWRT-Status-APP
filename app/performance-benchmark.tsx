import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { MetricTile, SectionCard } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import {
  buildPerformanceBenchmarkCommand,
  parsePerformanceBenchmark,
  type PerformanceBenchmark,
} from "@/lib/openwrt-admin";
import { useManagedSsh } from "@/hooks/use-managed-ssh";

function usageLabel(usedKb: number | null, totalKb: number | null) {
  if (usedKb === null || totalKb === null || totalKb <= 0) return "未报告";
  return `${(usedKb / 1024).toFixed(0)} / ${(totalKb / 1024).toFixed(0)} MB`;
}

function freeMemoryLabel(totalKb: number | null, availableKb: number | null) {
  if (totalKb === null || availableKb === null) return "未报告";
  return `${(availableKb / 1024).toFixed(0)} / ${(totalKb / 1024).toFixed(0)} MB`;
}

export default function PerformanceBenchmarkScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [result, setResult] = useState<PerformanceBenchmark | null>(null);
  const [rawOutput, setRawOutput] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run() {
    setNotice(null);
    try {
      const output = await execute(buildPerformanceBenchmarkCommand());
      setRawOutput(output);
      setResult(parsePerformanceBenchmark(output));
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "性能采样失败。");
    }
  }

  const disabled = isRunning || !hasRouter || !isSupported;
  const storageUsage =
    result?.storageTotalKb && result.storageUsedKb !== null
      ? result.storageUsedKb / result.storageTotalKb
      : null;
  const loadUsage =
    result?.loadAverage !== null &&
    result?.loadAverage !== undefined &&
    result.cpuCores !== null &&
    result.cpuCores > 0
      ? result.loadAverage / result.cpuCores
      : null;
  const memoryUsage =
    result?.memoryTotalKb && result.memoryAvailableKb !== null
      ? 1 - result.memoryAvailableKb / result.memoryTotalKb
      : null;

  return (
    <ManagementShell
      title="性能基准测试"
      description="直接读取路由器本机 CPU、负载、内存和 Overlay 存储指标，不执行 Ping 或互联网连通性测试。"
    >
      <SectionCard title="路由器本机采样">
        <View style={styles.form}>
          <Text style={[styles.caption, { color: colors.muted }]}>
            采样不会修改路由器配置。可用于判断资源是否接近瓶颈；网络质量请使用独立的
            DNS 与 NAT 工具。
          </Text>
        </View>
        <Pressable
          disabled={disabled}
          onPress={() => void run()}
          style={({ pressed }) => [
            styles.run,
            { backgroundColor: colors.primary },
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <Text style={styles.runText}>
            {isRunning ? "采样中…" : "开始本机采样"}
          </Text>
        </Pressable>
      </SectionCard>
      {result ? (
        <>
          <SectionCard title="处理器与负载">
            <View style={styles.metrics}>
              <View style={styles.metricRow}>
                <MetricTile
                  icon="memory"
                  label="CPU"
                  value={result.cpuModel ?? "未报告"}
                  caption={
                    result.cpuCores === null
                      ? "核心数未报告"
                      : `${result.cpuCores} 核`
                  }
                  tone="normal"
                />
                <MetricTile
                  icon="speed"
                  label="1 分钟负载"
                  value={
                    result.loadAverage === null
                      ? "未报告"
                      : result.loadAverage.toFixed(2)
                  }
                  caption="当前系统调度压力"
                  tone={
                    result.loadAverage !== null &&
                    result.cpuCores !== null &&
                    result.loadAverage > result.cpuCores
                      ? "warning"
                      : "success"
                  }
                  progress={loadUsage}
                  progressLabel={
                    loadUsage !== null && loadUsage >= 0.75
                      ? loadUsage >= 1
                        ? "警告：负载接近或超过核心数"
                        : "注意：负载较高"
                      : undefined
                  }
                />
              </View>
            </View>
          </SectionCard>
          <SectionCard title="内存与存储">
            <View style={styles.metrics}>
              <View style={styles.metricRow}>
                <MetricTile
                  icon="memory"
                  label="可用内存"
                  value={freeMemoryLabel(
                    result.memoryTotalKb,
                    result.memoryAvailableKb,
                  )}
                  caption="可用 / 总内存"
                  tone={
                    result.memoryAvailableKb !== null &&
                    result.memoryTotalKb !== null &&
                    result.memoryAvailableKb / result.memoryTotalKb < 0.1
                      ? "warning"
                      : "normal"
                  }
                  progress={memoryUsage}
                  progressLabel={
                    memoryUsage !== null && memoryUsage >= 0.75
                      ? memoryUsage >= 0.9
                        ? "危险：可用内存不足"
                        : "警告：可用内存偏低"
                      : undefined
                  }
                />
                <MetricTile
                  icon="storage"
                  label="Overlay 存储"
                  value={usageLabel(
                    result.storageUsedKb,
                    result.storageTotalKb,
                  )}
                  caption="已用 / 总容量"
                  tone={
                    storageUsage !== null && storageUsage > 0.9
                      ? "danger"
                      : storageUsage !== null && storageUsage > 0.75
                        ? "warning"
                        : "success"
                  }
                  progress={storageUsage}
                  progressLabel={
                    storageUsage !== null && storageUsage >= 0.75
                      ? storageUsage >= 0.9
                        ? "危险：Overlay 存储不足"
                        : "警告：Overlay 存储偏低"
                      : undefined
                  }
                />
              </View>
            </View>
          </SectionCard>
          {rawOutput ? (
            <SectionCard title="原始输出">
              <View
                style={[styles.output, { backgroundColor: colors.background }]}
              >
                <Text
                  selectable
                  style={[styles.outputText, { color: colors.foreground }]}
                >
                  {rawOutput.trim() || "命令未返回输出。"}
                </Text>
              </View>
            </SectionCard>
          ) : null}
        </>
      ) : null}
      {isRunning ? (
        <ToolNotice>
          <View style={styles.running}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.notice, { color: colors.muted }]}>
              正在读取路由器本机资源指标…
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
            此功能需要安装包含应用内 SSH 的 Android
            APK；网页预览仅可查看页面布局。
          </Text>
        </ToolNotice>
      ) : null}
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  form: { padding: 15, gap: 7 },
  caption: { fontSize: 12, lineHeight: 18 },
  run: {
    margin: 15,
    marginTop: 0,
    minHeight: 44,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  runText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  metrics: { padding: 14, gap: 10 },
  metricRow: { flexDirection: "row", gap: 10 },
  output: { margin: 14, padding: 12, borderRadius: 12 },
  outputText: { fontFamily: "monospace", fontSize: 12, lineHeight: 18 },
  running: { flexDirection: "row", gap: 10, alignItems: "center" },
  notice: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.46 },
});
