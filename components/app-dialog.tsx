import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

export type AppDialogButtonStyle = "default" | "cancel" | "destructive";

export type AppDialogButton = {
  text: string;
  style?: AppDialogButtonStyle;
  onPress?: () => void;
};

type AppDialogRequest = {
  title: string;
  message?: string;
  buttons?: AppDialogButton[];
};

let activePresenter: ((request: AppDialogRequest) => void) | null = null;

/** A themed drop-in replacement for React Native Alert on management screens. */
export const AppDialog = {
  alert(title: string, message?: string, buttons?: AppDialogButton[]) {
    activePresenter?.({ title, message, buttons });
  },
};

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const [dialog, setDialog] = useState<AppDialogRequest | null>(null);

  useEffect(() => {
    activePresenter = (request) => setDialog(request);
    return () => {
      activePresenter = null;
    };
  }, []);

  const buttons = useMemo(
    () => (dialog?.buttons?.length ? dialog.buttons : [{ text: "知道了", style: "default" as const }]),
    [dialog],
  );
  const destructive = buttons.some((button) => button.style === "destructive");
  const cancelButton = buttons.find((button) => button.style === "cancel");
  const dismiss = (button?: AppDialogButton) => {
    setDialog(null);
    if (button?.onPress) setTimeout(button.onPress, 0);
  };

  return (
    <>
      {children}
      <Modal transparent visible={Boolean(dialog)} animationType="fade" statusBarTranslucent onRequestClose={() => dismiss(cancelButton)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => dismiss(cancelButton)} />
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityViewIsModal>
            <View style={[styles.iconWell, { backgroundColor: destructive ? `${colors.error}1F` : `${colors.primary}18` }]}>
              <MaterialIcons name={destructive ? "warning-amber" : "info-outline"} size={24} color={destructive ? colors.error : colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>{dialog?.title}</Text>
            {dialog?.message ? <Text style={[styles.message, { color: colors.muted }]}>{dialog.message}</Text> : null}
            <View style={[styles.buttonRow, buttons.length > 2 && styles.buttonColumn]}>
              {buttons.map((button, index) => {
                const isDestructive = button.style === "destructive";
                const isCancel = button.style === "cancel";
                return (
                  <Pressable
                    key={`${button.text}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={button.text}
                    onPress={() => dismiss(button)}
                    style={({ pressed }) => [
                      styles.button,
                      buttons.length <= 2 && styles.flexButton,
                      isCancel
                        ? { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }
                        : { backgroundColor: isDestructive ? colors.error : colors.primary },
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={[styles.buttonText, { color: isCancel ? colors.foreground : "#FFFFFF" }]}>{button.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "center", padding: 24 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5, 11, 18, 0.62)" },
  card: { width: "100%", maxWidth: 420, alignSelf: "center", borderRadius: 24, padding: 22, borderWidth: 1, shadowColor: "#000000", shadowOpacity: 0.24, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  iconWell: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontSize: 18, fontWeight: "800", lineHeight: 25 },
  message: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 22 },
  buttonColumn: { flexDirection: "column" },
  button: { minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  flexButton: { flex: 1 },
  buttonText: { fontSize: 14, fontWeight: "800" },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
