import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

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
  return <View style={[styles.pill, { backgroundColor: toneColor.background }]} accessibilityLabel={label}><View style={[styles.dot, { backgroundColor: toneColor.dot }]} /><Text style={[styles.pillText, { color: toneColor.dot }]}>{label}</Text></View>;
}

export function MetricTile({ icon, label, value, caption, tone = "normal" }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; value: string; caption?: string; tone?: Tone }) {
  const colors = useColors();
  const toneColor = toneColors(tone, useColorScheme() === "dark");
  return <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.iconBox, { backgroundColor: toneColor.background }]}><MaterialIcons name={icon} size={19} color={toneColor.dot} /></View><Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>{caption ? <Text style={[styles.metricCaption, { color: colors.muted }]}>{caption}</Text> : null}</View>;
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
  metricTile: { flex: 1, minWidth: 0, borderRadius: 18, padding: 14, borderWidth: 1 }, iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 12 }, metricLabel: { fontSize: 12, lineHeight: 17, fontWeight: "600", marginBottom: 4 }, metricValue: { fontSize: 18, lineHeight: 24, fontWeight: "800", fontVariant: ["tabular-nums"], flexShrink: 1 }, metricCaption: { fontSize: 11, lineHeight: 16, marginTop: 4, flexShrink: 1 },
  sectionWrap: { gap: 9 }, sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 }, sectionTitle: { fontSize: 17, fontWeight: "800" }, card: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  emptyState: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 40 }, emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 16 }, emptyTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" }, emptyDescription: { fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
});
