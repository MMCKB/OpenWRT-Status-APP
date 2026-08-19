import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppDialog as Alert } from "@/components/app-dialog";
import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { SectionCard } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import { buildWakeOnLanCommand } from "@/lib/openwrt-admin";

export default function WakeOnLanScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [mac, setMac] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const disabled = !hasRouter || !isSupported || isRunning;

  function sendWakePacket() {
    try {
      const command = buildWakeOnLanCommand(mac);
      Alert.alert("发送网络唤醒包？", `路由器将向 ${mac.trim()} 广播 Wake-on-LAN 唤醒包。目标设备需要支持网络唤醒，通常还需要有线网卡和待机供电。`, [
        { text: "取消", style: "cancel" },
        { text: "发送", onPress: () => void (async () => {
          try {
            const output = await execute(command);
            if (output.includes("__WOL_UNAVAILABLE__")) {
              setNotice(output.replace("__WOL_UNAVAILABLE__", "").trim() || "路由器未安装 etherwake、wakeonlan 或 wol。 ");
              return;
            }
            setNotice(output.trim() || `已向 ${mac.trim()} 发送唤醒包。`);
          } catch {}
        })() },
      ]);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "MAC 地址无效。");
    }
  }

  return <ManagementShell title="网络唤醒" description="通过已连接的 OpenWrt 路由器发送 Wake-on-LAN 广播包。"><SectionCard title="发送唤醒包"><View style={styles.form}><Text style={[styles.label, { color: colors.foreground }]}>设备 MAC 地址</Text><TextInput value={mac} onChangeText={setMac} autoCapitalize="characters" autoCorrect={false} placeholder="例如 AA:BB:CC:DD:EE:FF" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} maxLength={17} /><Pressable accessibilityRole="button" disabled={disabled} onPress={sendWakePacket} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, pressed && styles.pressed, disabled && styles.disabled]}>{isRunning ? <ActivityIndicator color="#FFFFFF" /> : <><MaterialIcons name="power-settings-new" size={18} color="#FFFFFF" /><Text style={styles.buttonText}>发送唤醒包</Text></>}</Pressable></View></SectionCard><ToolNotice><Text style={[styles.notice, { color: colors.muted }]}>如提示缺少工具，请在路由器的软件包管理中安装 etherwake、wakeonlan 或 wol。部分无线网卡、关机状态或跨网段场景不支持网络唤醒。</Text></ToolNotice>{error ? <ToolNotice><Text style={[styles.notice, { color: colors.error }]}>{error}</Text></ToolNotice> : null}{notice ? <ToolNotice><Text style={[styles.notice, { color: colors.foreground }]}>{notice}</Text></ToolNotice> : null}</ManagementShell>;
}

const styles = StyleSheet.create({ form: { gap: 12 }, label: { fontSize: 13, fontWeight: "800" }, input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15, fontVariant: ["tabular-nums"] }, button: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }, buttonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" }, notice: { fontSize: 13, lineHeight: 19 }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.5 } });
