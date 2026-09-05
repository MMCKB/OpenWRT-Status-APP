import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ManagementShell } from "@/components/management-shell";
import { SectionCard } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";

const tools = [
  {
    title: "文件管理",
    description:
      "通过应用内 SSH 浏览、上传、编辑、复制、移动与管理路由器文件。",
    icon: "folder-open",
    target: "/files",
  },
  {
    title: "软件包管理",
    description: "查看已安装 apk 系统包，搜索在线仓库并执行安装、卸载与更新。",
    icon: "extension",
    target: "/packages",
  },
  {
    title: "固件升级",
    description: "选择 sysupgrade 镜像，经 SSH 上传后确认执行升级。",
    icon: "system-update",
    target: "/firmware",
  },
  {
    title: "已连接设备",
    description: "查看 DHCP 客户端与在线邻居，可安全拉黑未知设备。",
    icon: "devices",
    target: "/clients",
  },
  {
    title: "DHCP 与静态租约",
    description: "查看动态租约，并为常用设备固定 IPv4 地址。",
    icon: "dns",
    target: "/dhcp-leases",
  },
  {
    title: "网络唤醒",
    description: "向指定 MAC 地址发送 Wake-on-LAN 局域网唤醒包。",
    icon: "power-settings-new",
    target: "/wake-on-lan",
  },
  {
    title: "网络诊断",
    description: "按 WAN 执行 Ping、DNS、路由追踪和端口连通性检查。",
    icon: "network-check",
    target: "/diagnostics",
  },
  {
    title: "NAT 类型检测",
    description: "检测手机当前网络的 NAT 类型与公网映射，不依赖路由器 SSH。",
    icon: "cell-tower",
    target: "/nat-detection",
  },
  {
    title: "硬盘读写测速",
    description: "在选定目录写入、读取测试文件并自动删除，查看路由器存储速度。",
    icon: "storage",
    target: "/disk-speed",
  },
  {
    title: "无线管理",
    description: "管理 SSID、无线开关及访客网络二维码。",
    icon: "wifi",
    target: "/wireless-manager",
  },
  {
    title: "无线优化助手",
    description: "扫描附近网络，查看信道拥挤度建议并确认后应用。",
    icon: "wifi-find",
    target: "/wireless-optimizer",
  },
  {
    title: "弱信号设备",
    description: "按 RSSI 识别弱信号 Wi‑Fi 客户端，辅助调整摆位和无线信道。",
    icon: "signal-cellular-alt",
    target: "/weak-signal",
  },
  {
    title: "Docker 容器",
    description: "查看容器状态、即时资源占用和日志，并在确认后启停或重启。",
    icon: "view-in-ar",
    target: "/docker",
  },
  {
    title: "性能基准测试",
    description:
      "执行 Ping、DNS 和系统资源采样，快速定位链路或路由器性能问题。",
    icon: "speed",
    target: "/performance-benchmark",
  },
  {
    title: "GitHub 固件更新",
    description:
      "配置 GitHub Release 链接，检查新版本、选择资产并确认下载升级。",
    icon: "system-update-alt",
    target: "/firmware-release",
  },
  {
    title: "日志中心",
    description: "按系统、内核、DNS、拨号或防火墙查看并导出最近日志。",
    icon: "article",
    target: "/logs",
  },
  {
    title: "防火墙与端口转发",
    description: "查看安全区域，安全管理端口转发与 UPnP 服务。",
    icon: "security",
    target: "/firewall",
  },
  {
    title: "多路由器批量操作",
    description: "依次刷新多台路由器状态、执行基础诊断或下载配置备份。",
    icon: "router",
    target: "/bulk-operations",
  },
  {
    title: "备份与服务",
    description: "导出/恢复配置，查看 OpenWrt 服务和 Docker 容器。",
    icon: "settings-suggest",
    target: "/maintenance-tools",
  },
  {
    title: "系统管理",
    description: "管理启动项、LED、挂载点、SSH、接口和计划任务。",
    icon: "admin-panel-settings",
    target: "/system-admin",
  },
  {
    title: "LuCI 主题",
    description:
      "读取已安装的 LuCI 主题，并在应用内安全切换路由器网页管理界面外观。",
    icon: "palette",
    target: "/luci-theme",
  },
  {
    title: "快捷操作",
    description: "一键重连 WAN，并快速进入常用路由器管理功能。",
    icon: "bolt",
    target: "/quick-actions",
  },
];

export default function ToolsScreen() {
  const colors = useColors();
  const router = useRouter();
  return (
    <ManagementShell
      title="工具"
      description="路由器维护、诊断和服务控制集中在这里；写入操作均通过已保存路由器的应用内 SSH 执行。"
    >
      <SectionCard title="路由器管理">
        {tools.map((item, index) => (
          <Pressable
            key={item.target}
            accessibilityRole="button"
            onPress={() => router.push(item.target as never)}
            style={({ pressed }) => [
              styles.row,
              index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.icon, { backgroundColor: colors.background }]}>
              <MaterialIcons
                name={item.icon as ComponentProps<typeof MaterialIcons>["name"]}
                size={21}
                color={colors.primary}
              />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                {item.title}
              </Text>
              <Text style={[styles.rowDescription, { color: colors.muted }]}>
                {item.description}
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={22}
              color={colors.muted}
            />
          </Pressable>
        ))}
      </SectionCard>
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 78,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  icon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: "800" },
  rowDescription: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  pressed: { opacity: 0.7 },
});
