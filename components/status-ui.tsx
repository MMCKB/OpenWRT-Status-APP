import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

type Tone = "normal" | "success" | "warning" | "danger";

const tones = {
  normal: { dot: "#6B7C93", background: "#EAF1F5" },
  success: { dot: "#1B9A6A", background: "#E8F7F1" },
  warning: { dot: "#C77A00", background: "#FFF4DD" },
  danger: { dot: "#C53B3B", background: "#FDEBEC" },
};

export function StatusPill({ label, tone = "normal" }: { label: string; tone?: Tone }) {
  const color = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: color.background }]} accessibilityLabel={label}>
      <View style={[styles.dot, { backgroundColor: color.dot }]} />
      <Text style={[styles.pillText, { color: color.dot }]}>{label}</Text>
    </View>
  );
}

export function MetricTile({ icon, label, value, caption, tone = "normal" }: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  value: string;
  caption?: string;
  tone?: Tone;
}) {
  const color = tones[tone];
  return (
    <View style={styles.metricTile}>
      <View style={[styles.iconBox, { backgroundColor: color.background }]}>
        <MaterialIcons name={icon} size={19} color={color.dot} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
      {caption ? <Text style={styles.metricCaption} numberOfLines={1}>{caption}</Text> : null}
    </View>
  );
}

export function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function EmptyState({ icon, title, description }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; title: string; description: string }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><MaterialIcons name={icon} size={30} color="#007E7A" /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

export const sharedStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FA" },
  content: { padding: 20, paddingBottom: 112, gap: 20 },
  primaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: "#007E7A", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  primaryButtonPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: "#EAF1F5", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  secondaryButtonText: { color: "#005F5C", fontSize: 16, fontWeight: "700" },
});

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: "700" },
  metricTile: { flex: 1, minWidth: 0, borderRadius: 18, backgroundColor: "#FFFFFF", padding: 14, borderWidth: 1, borderColor: "#E4EAEE" },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  metricLabel: { color: "#5B6B7D", fontSize: 12, fontWeight: "600", marginBottom: 4 },
  metricValue: { color: "#102A43", fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
  metricCaption: { color: "#7A8998", fontSize: 11, marginTop: 4 },
  sectionWrap: { gap: 9 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 },
  sectionTitle: { color: "#102A43", fontSize: 17, fontWeight: "800" },
  card: { borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4EAEE", overflow: "hidden" },
  emptyState: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 40 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#E6F5F4", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { color: "#102A43", fontSize: 20, fontWeight: "800", textAlign: "center" },
  emptyDescription: { color: "#5B6B7D", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
});
