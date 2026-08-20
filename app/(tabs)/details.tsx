import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { EmptyState, SectionCard, sharedStyles } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import {
  buildRouterHardwareDetailsCommand,
  parseRouterHardwareDetails,
  type RouterHardwareDetails,
} from "@/lib/openwrt-admin";
import {
  formatBytes,
  formatLoad,
  formatUptime,
  memoryUsagePercent,
} from "@/lib/openwrt-client";
import { useRouterStore } from "@/lib/router-provider";

function DetailRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.detailRow,
        !last && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <Text
        style={[styles.value, { color: colors.foreground }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function interfaceAddressSummary(
  ipv4: string[],
  ipv6: string[],
  device: string,
) {
  const ipv4Summary = ipv4.length ? ipv4.join(", ") : "未分配";
  const ipv6Summary = ipv6.length ? ipv6.join(", ") : "未分配";
  return `IPv4: ${ipv4Summary}\nIPv6: ${ipv6Summary}\n设备: ${device}`;
}

export default function DetailsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { selectedProfile, selectedStatus, refreshStatus, isRefreshing } =
    useRouterStore();
  const { execute, hasRouter, isSupported } = useManagedSsh();
  const [hardware, setHardware] = useState<RouterHardwareDetails | null>(null);
  const [hardwareLoading, setHardwareLoading] = useState(false);
  const system = selectedStatus?.system;
  const refreshHardware = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    setHardwareLoading(true);
    try {
      setHardware(
        parseRouterHardwareDetails(
          await execute(buildRouterHardwareDetailsCommand()),
        ),
      );
    } catch {
      setHardware(null);
    } finally {
      setHardwareLoading(false);
    }
  }, [execute, hasRouter, isSupported]);
  useEffect(() => {
    void refreshHardware();
  }, [refreshHardware]);
  const wifiTemperature = hardware?.wifiTemperaturesC.length
    ? `${Math.max(...hardware.wifiTemperaturesC).toFixed(1)} °C`
    : "未报告";
  const refreshAll = () => {
    void refreshStatus();
    void refreshHardware();
  };
  if (!selectedProfile) {
    return (
      <View style={sharedStyles.screen}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>详情</Text>
        </View>
        <EmptyState
          icon="analytics"
          title="尚无设备详情"
          description="先添加并选择一台 OpenWrt 路由器，才能查看系统、接口与无线网络的完整数据。"
        />
        <Pressable
          onPress={() => router.push("/router-form" as never)}
          style={({ pressed }) => [
            sharedStyles.primaryButton,
            styles.emptyButton,
            { backgroundColor: colors.primary },
            pressed && sharedStyles.primaryButtonPressed,
          ]}
        >
          <Text style={sharedStyles.primaryButtonText}>添加路由器</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={sharedStyles.screen}>
      <ScrollView contentContainerStyle={sharedStyles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              详情
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {selectedProfile.name}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="刷新状态"
            onPress={refreshAll}
            style={({ pressed }) => [
              styles.refreshButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && styles.refreshPressed,
            ]}
          >
            <MaterialIcons name="refresh" size={21} color={colors.primary} />
          </Pressable>
        </View>
        {isRefreshing || hardwareLoading ? (
          <Text style={[styles.refreshing, { color: colors.primary }]}>
            正在读取路由器状态…
          </Text>
        ) : null}
        <SectionCard title="系统">
          <DetailRow label="主机名" value={system?.hostname ?? "未报告"} />
          <DetailRow label="设备型号" value={system?.model ?? "未报告"} />
          <DetailRow label="固件版本" value={system?.firmware ?? "未报告"} />
          <DetailRow label="CPU 型号" value={hardware?.cpuModel ?? "未报告"} />
          <DetailRow
            label="CPU 核心"
            value={hardware?.cpuCores ? `${hardware.cpuCores} 核` : "未报告"}
          />
          <DetailRow
            label="内核版本"
            value={hardware?.kernelVersion ?? "未报告"}
          />
          <DetailRow
            label="运行时间"
            value={formatUptime(system?.uptimeSeconds ?? null)}
          />
          <DetailRow
            label="系统负载"
            value={formatLoad(system?.load ?? null)}
            last
          />
        </SectionCard>
        <SectionCard title="内存">
          <DetailRow
            label="内存使用"
            value={
              memoryUsagePercent(system ?? null) === null
                ? "未报告"
                : `${memoryUsagePercent(system ?? null)}%`
            }
          />
          <DetailRow
            label="总内存"
            value={formatBytes(system?.memoryTotal ?? null)}
          />
          <DetailRow
            label="可用内存"
            value={formatBytes(system?.memoryAvailable ?? null)}
            last
          />
        </SectionCard>
        <SectionCard title="网络接口">
          {selectedStatus?.interfaces.length ? (
            selectedStatus.interfaces.map((item, index, all) => (
              <DetailRow
                key={`${item.name}-${index}`}
                label={`${item.name} · ${item.up ? "已连接" : "未连接"}`}
                value={interfaceAddressSummary(
                  item.ipv4,
                  item.ipv6,
                  item.device,
                )}
                last={index === all.length - 1}
              />
            ))
          ) : (
            <Text style={styles.unavailable}>路由器未报告接口数据。</Text>
          )}
        </SectionCard>
        <SectionCard title="无线网络">
          {selectedStatus?.wireless.length ? (
            selectedStatus.wireless.map((item, index, all) => (
              <DetailRow
                key={`${item.name}-${index}`}
                label={`${item.ssid} · ${item.up ? "已启用" : "未启用"}`}
                value={`接口 ${item.name} · 信道 ${item.channel} · ${item.clients === null ? "客户端未报告" : `${item.clients} 台客户端`}`}
                last={index === all.length - 1}
              />
            ))
          ) : (
            <Text style={styles.unavailable}>路由器未报告无线数据。</Text>
          )}
        </SectionCard>
        <SectionCard title="无线硬件">
          <DetailRow label="Wi‑Fi 温度" value={wifiTemperature} />
          <DetailRow
            label="温度传感器"
            value={
              hardware?.wifiTemperaturesC.length
                ? `${hardware.wifiTemperaturesC.length} 个可用`
                : "路由器未报告"
            }
            last
          />
        </SectionCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 26 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 28, fontWeight: "800" },
  subtitle: { fontSize: 14, marginTop: 4 },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshPressed: { opacity: 0.7 },
  refreshing: { fontSize: 13, fontWeight: "600", marginTop: -12 },
  detailRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  label: { fontSize: 14, flex: 1 },
  value: {
    fontSize: 14,
    fontWeight: "700",
    maxWidth: "58%",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  unavailable: { fontSize: 14, paddingHorizontal: 15, paddingVertical: 18 },
  emptyButton: { marginHorizontal: 20, marginTop: 4 },
});
