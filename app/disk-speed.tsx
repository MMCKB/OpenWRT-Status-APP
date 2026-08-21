import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { MetricTile, SectionCard } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import { buildDiskSpeedCommand, parseDiskSpeedResult, type DiskSpeedResult } from "@/lib/openwrt-admin";

const PRESET_SIZES = [16, 64, 128, 512] as const;

function speedLabel(value: number | null) {
  return value === null ? "未报告" : `${value.toFixed(2)} MB/s`;
}

function durationLabel(value: number | null) {
  return value === null ? "未报告" : `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} 秒`;
}

export default function DiskSpeedScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [directory, setDirectory] = useState("/tmp");
  const [size, setSize] = useState<number>(128);
  const [isCustomSize, setCustomSize] = useState(false);
  const [customSize, setCustomSizeValue] = useState("128");
  const [result, setResult] = useState<DiskSpeedResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestedSize = useMemo(() => (isCustomSize ? Number(customSize) : size), [customSize, isCustomSize, size]);
  const disabled = isRunning || !hasRouter || !isSupported;

  async function run() {
    setNotice(null);
    try {
      const output = await execute(buildDiskSpeedCommand(directory, requestedSize));
      const next = parseDiskSpeedResult(output);
      if (next.writeSpeedMBps === null || next.readSpeedMBps === null) {
        const errorLine = output.match(/^DISK_SPEED_ERROR\|(.+)$/m)?.[1];
        setResult(null);
        setNotice(errorLine ?? "测速未返回可用结果，请确认目录可写且存储空间充足。");
        return;
      }
      setResult(next);
    } catch (reason) {
      setResult(null);
      setNotice(reason instanceof Error ? reason.message : "硬盘读写测速失败。");
    }
  }

  return (
    <ManagementShell
      title="硬盘读写测速"
      description="在路由器选定目录创建临时文件，依次完成顺序写入和读取测试后自动删除。请选用已挂载硬盘目录，避免对 Flash 存储反复大文件写入。"
    >
      <SectionCard title="测速设置">
        <View style={styles.form}>
          <Text style={[styles.label, { color: colors.muted }]}>写入目录</Text>
          <TextInput
            value={directory}
            onChangeText={setDirectory}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="例如 /mnt/sda1"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <Text style={[styles.caption, { color: colors.muted }]}>必须是路由器上存在且可写的绝对路径。测速使用隐藏临时文件，完成或失败时均会尝试删除。</Text>
          <Text style={[styles.label, { color: colors.muted }]}>测试文件大小</Text>
          <View style={styles.sizes}>
            {PRESET_SIZES.map((preset) => (
              <Pressable
                key={preset}
                accessibilityRole="button"
                onPress={() => { setSize(preset); setCustomSize(false); }}
                style={({ pressed }) => [styles.size, { borderColor: !isCustomSize && size === preset ? colors.primary : colors.border, backgroundColor: !isCustomSize && size === preset ? colors.primary : colors.background }, pressed && styles.pressed]}
              >
                <Text style={[styles.sizeText, { color: !isCustomSize && size === preset ? "#FFFFFF" : colors.muted }]}>{preset} MB</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => setCustomSize(true)}
              style={({ pressed }) => [styles.size, { borderColor: isCustomSize ? colors.primary : colors.border, backgroundColor: isCustomSize ? colors.primary : colors.background }, pressed && styles.pressed]}
            >
              <Text style={[styles.sizeText, { color: isCustomSize ? "#FFFFFF" : colors.muted }]}>自定义</Text>
            </Pressable>
          </View>
          {isCustomSize ? (
            <TextInput
              value={customSize}
              onChangeText={setCustomSizeValue}
              keyboardType="number-pad"
              placeholder="1–2048"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => void run()}
          style={({ pressed }) => [styles.run, { backgroundColor: colors.primary }, pressed && styles.pressed, disabled && styles.disabled]}
        >
          {isRunning ? <ActivityIndicator color="#FFFFFF" /> : null}
          <Text style={styles.runText}>{isRunning ? "正在写入、读取并清理…" : `开始 ${requestedSize || "—"} MB 读写测速`}</Text>
        </Pressable>
      </SectionCard>
      {result ? (
        <>
          <SectionCard title="测速结果">
            <View style={styles.metrics}>
              <MetricTile icon="file-upload" label="顺序写入" value={speedLabel(result.writeSpeedMBps)} caption={durationLabel(result.writeDurationMs)} tone="success" />
              <MetricTile icon="file-download" label="顺序读取" value={speedLabel(result.readSpeedMBps)} caption={durationLabel(result.readDurationMs)} tone="success" />
            </View>
          </SectionCard>
          <SectionCard title="测试信息">
            <View style={styles.info}>
              <Text style={[styles.infoText, { color: colors.foreground }]}>目录：{result.directory}</Text>
              <Text style={[styles.infoText, { color: colors.muted }]}>文件大小：{result.fileSizeMB} MB · 测试文件已自动删除</Text>
            </View>
          </SectionCard>
        </>
      ) : null}
      {isRunning ? (
        <ToolNotice><View style={styles.noticeRow}><ActivityIndicator color={colors.primary} /><Text style={[styles.notice, { color: colors.muted }]}>测速期间请保持 SSH 连接；测试完成后会清理临时文件。</Text></View></ToolNotice>
      ) : null}
      {error || notice ? (
        <ToolNotice><Text selectable style={[styles.notice, { color: error ? colors.error : colors.foreground }]}>{error ?? notice}</Text></ToolNotice>
      ) : null}
      {!isSupported ? (
        <ToolNotice><Text style={[styles.notice, { color: colors.warning }]}>此功能需要安装包含应用内 SSH 的 Android APK；网页预览仅可查看页面布局。</Text></ToolNotice>
      ) : null}
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  form: { padding: 15, gap: 9 },
  label: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  caption: { fontSize: 12, lineHeight: 18 },
  input: { minHeight: 43, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  sizes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  size: { minHeight: 34, paddingHorizontal: 11, borderWidth: 1, borderRadius: 17, justifyContent: "center" },
  sizeText: { fontSize: 12, fontWeight: "800" },
  run: { margin: 15, marginTop: 0, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  runText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  metrics: { padding: 14, gap: 10 },
  info: { padding: 15, gap: 5 },
  infoText: { fontSize: 13, lineHeight: 19 },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  notice: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.46 },
});
