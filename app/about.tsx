import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { AppDialog } from "@/components/app-dialog";
import { ManagementShell } from "@/components/management-shell";
import { useColors } from "@/hooks/use-colors";

const GITHUB_REPOSITORY_URL = "https://github.com/MMCKB/OpenWRT-Status-APP";

export default function AboutScreen() {
  const colors = useColors();
  const version =
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "1.0.22";

  const openRepository = async () => {
    try {
      await Linking.openURL(GITHUB_REPOSITORY_URL);
    } catch {
      AppDialog.alert("无法打开 GitHub", "请检查设备网络或稍后再试。");
    }
  };

  return (
    <ManagementShell title="关于" description="">
      <View style={styles.brand}>
        <View
          style={[
            styles.icon,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Image
            source={require("../assets/images/icon.png")}
            style={styles.iconImage}
          />
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>
          OpenWrt 路由器状态
        </Text>
        <Text style={[styles.version, { color: colors.muted }]}>
          版本 {version}
        </Text>
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="打开 GitHub 仓库"
        onPress={() => void openRepository()}
        style={({ pressed }) => [
          styles.repository,
          { borderColor: colors.border },
          pressed && styles.pressed,
        ]}
      >
        <MaterialIcons name="code" size={20} color={colors.primary} />
        <Text style={[styles.repositoryText, { color: colors.foreground }]}>
          GitHub 仓库
        </Text>
        <MaterialIcons name="open-in-new" size={19} color={colors.muted} />
      </Pressable>
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", paddingTop: 34, paddingBottom: 34 },
  icon: {
    width: 92,
    height: 92,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  iconImage: { width: 82, height: 82, borderRadius: 22 },
  name: { marginTop: 18, fontSize: 21, fontWeight: "800", letterSpacing: 0.1 },
  version: { marginTop: 7, fontSize: 14, fontWeight: "600" },
  repository: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  repositoryText: { flex: 1, fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.68 },
});
