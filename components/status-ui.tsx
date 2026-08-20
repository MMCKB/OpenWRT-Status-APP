import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ReactNode, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";

type Tone = "normal" | "success" | "warning" | "danger";

function toneColors(tone: Tone, isDark: boolean) {
  const tones = {
    normal: { dot: isDark ? "#AFC2D1" : "#6B7C93", background: isDark ? "#294A60" : "#EAF1F5" },
    success: { dot: isDark ? "#56C99B" : "#1B9A6A", background: isDark ? "#164B3B" : "#E8F7F1" },
    warning: { dot: isDark ? "#F0B54D" : "#C77A00", background: isDark ? "#5A421C" : "#FFF4DD" },
    danger: { dot: isDark ? "#F07A7A" : "#C53B3B", background: isDark ? "#562C35" : "#FDEBEC" },
  };
  return tones[tone];
}

export function StatusPill({ label, tone = "normal" }: { label: string; tone?: Tone }) {
  const toneColor = toneColors(tone, useColorScheme() === "dark");
  const emphasis = useSharedValue(1);
  useEffect(() => {
    emphasis.value = withSequence(withTiming(0.58, { duration: 90, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }));
  }, [emphasis, label, tone]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: emphasis.value, transform: [{ scale: 0.96 + emphasis.value * 0.04 }] }));
  return <Animated.View style={[styles.pill, { backgroundColor: toneColor.background }, animatedStyle]} accessibilityLabel={label}><Animated.View style={[styles.dot, { backgroundColor: toneColor.dot }, animatedStyle]} /><Animated.Text style={[styles.pillText, { color: toneColor.dot }, animatedStyle]}>{label}</Animated.Text></Animated.View>;
}

function AnimatedMetricProgress({ value, tone, isDark }: { value: number; tone: Tone; isDark: boolean }) {
  const normalized = Math.max(0, Math.min(1, value));
  const progress = useSharedValue(0);
  const toneValue = useSharedValue(0);
  const toneIndex = tone === "success" ? 1 : tone === "warning" ? 2 : tone === "danger" ? 3 : 0;
  const trackColor = isDark ? "#263945" : "#E7EEF2";
  const palette = isDark ? ["#AFC2D1", "#56C99B", "#F0B54D", "#F07A7A"] : ["#6B7C93", "#1B9A6A", "#C77A00", "#C53B3B"];

  useEffect(() => {
    progress.value = withTiming(normalized, { duration: 260, easing: Easing.out(Easing.cubic) });
    toneValue.value = withTiming(toneIndex, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [normalized, progress, toneIndex, toneValue]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
    backgroundColor: interpolateColor(toneValue.value, [0, 1, 2, 3], palette),
  }));
  return <View style={[styles.metricProgressTrack, { backgroundColor: trackColor }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(normalized * 100) }}><Animated.View style={[styles.metricProgressFill, fillStyle]} /></View>;
}

export function MetricTile({ icon, label, value, caption, tone = "normal", progress, progressLabel }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; value: string; caption?: string; tone?: Tone; progress?: number | null; progressLabel?: string }) {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";
  const toneColor = toneColors(tone, isDark);
  return <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.iconBox, { backgroundColor: toneColor.background }]}><MaterialIcons name={icon} size={19} color={toneColor.dot} /></View><Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>{caption ? <Text style={[styles.metricCaption, { color: colors.muted }]}>{caption}</Text> : null}{progress === null || progress === undefined ? null : <AnimatedMetricProgress value={progress} tone={tone} isDark={isDark} />}{progressLabel ? <Text style={[styles.metricProgressLabel, { color: tone === "danger" ? colors.error : tone === "warning" ? colors.warning : colors.muted }]}>{progressLabel}</Text> : null}</View>;
}

/** 连接图标仅在连接状态或颜色语义改变时局部淡入缩放，父卡片保持原位。 */
export function AnimatedStatusIcon({ name, color, size }: { name: React.ComponentProps<typeof MaterialIcons>["name"]; color: string; size: number }) {
  const emphasis = useSharedValue(1);
  useEffect(() => {
    emphasis.value = withSequence(withTiming(0.62, { duration: 90, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 170, easing: Easing.out(Easing.quad) }));
  }, [color, emphasis, name]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: emphasis.value, transform: [{ scale: 0.92 + emphasis.value * 0.08 }] }));
  return <Animated.View style={animatedStyle}><MaterialIcons name={name} size={size} color={color} /></Animated.View>;
}

export function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const colors = useColors();
  return <View style={styles.sectionWrap}><View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>{action}</View><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View></View>;
}

export function EmptyState({ icon, title, description }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; title: string; description: string }) {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";
  return <View style={styles.emptyState}><View style={[styles.emptyIcon, { backgroundColor: isDark ? "#1C485C" : "#E6F5F4" }]}><MaterialIcons name={icon} size={30} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.emptyDescription, { color: colors.muted }]}>{description}</Text></View>;
}

export const sharedStyles = StyleSheet.create({
  screen: { flex: 1 }, content: { flexGrow: 1, padding: 20, paddingBottom: 32, gap: 20 },
  primaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: "#007E7A", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }, primaryButtonPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] }, primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: "#EAF1F5", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }, secondaryButtonText: { color: "#005F5C", fontSize: 16, fontWeight: "700" },
});

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }, dot: { width: 7, height: 7, borderRadius: 4 }, pillText: { fontSize: 12, fontWeight: "700" },
  metricTile: { flex: 1, minWidth: 0, borderRadius: 18, padding: 14, borderWidth: 1 }, iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 12 }, metricLabel: { fontSize: 12, lineHeight: 17, fontWeight: "600", marginBottom: 4 }, metricValue: { fontSize: 18, lineHeight: 24, fontWeight: "800", fontVariant: ["tabular-nums"], flexShrink: 1 }, metricCaption: { fontSize: 11, lineHeight: 16, marginTop: 4, flexShrink: 1 }, metricProgressTrack: { height: 4, borderRadius: 999, overflow: "hidden", marginTop: 10 }, metricProgressFill: { height: "100%", borderRadius: 999 }, metricProgressLabel: { fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 5 },
  sectionWrap: { gap: 9 }, sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 }, sectionTitle: { fontSize: 17, fontWeight: "800" }, card: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  emptyState: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 40 }, emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 16 }, emptyTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" }, emptyDescription: { fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
});
