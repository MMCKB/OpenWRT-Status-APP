import { type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

export function ManagementShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}><View><Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>{description ? <Text style={[styles.description, { color: colors.muted }]}>{description}</Text> : null}</View>{children}</ScrollView></View>;
}

export function ToolNotice({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 44, gap: 20 }, title: { fontSize: 28, fontWeight: "800" }, description: { fontSize: 14, lineHeight: 20, marginTop: 5 }, notice: { borderRadius: 16, borderWidth: 1, padding: 14 },
});
