import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";

export function SplashLoader({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const { colorScheme } = useThemeContext();
  const isDark = colorScheme === "dark";
  const [progress, setProgress] = useState(8);
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    // 仅在 React 树完成首帧提交后调用原生 Splash API，避免模块加载阶段的
    // 原生调用在 Android 16 上放大为进程启动异常。
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    // 路由树不再依赖字体资源加载；图标组件自行处理字体可用性。
    const progressTimer = setInterval(() => {
      setProgress((current) => Math.min(94, current + 12));
    }, 100);
    const completeTimer = setTimeout(() => setProgress(100), 420);
    const readyTimer = setTimeout(() => setIsReady(true), 620);

    return () => {
      clearInterval(progressTimer);
      clearTimeout(completeTimer);
      clearTimeout(readyTimer);
    };
  }, []);

  if (!isReady) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}> 
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowOpacity: isDark ? 0.28 : 0.1 }]}> 
          <View style={styles.routerMark} accessibilityLabel="OpenWrt">
            <View style={styles.antennaRow}>
              <View style={[styles.antenna, { borderColor: colors.primary }]} />
              <View style={[styles.antenna, { borderColor: colors.primary }]} />
            </View>
            <View style={[styles.routerBody, { backgroundColor: colors.primary }]}>
              <View style={[styles.port, { backgroundColor: isDark ? colors.background : "#0A3C4A" }]} />
              <View style={[styles.port, { backgroundColor: isDark ? colors.background : "#0A3C4A" }]} />
              <View style={[styles.port, { backgroundColor: isDark ? colors.background : "#0A3C4A" }]} />
            </View>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>OpenWrt 管理中心</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>正在准备管理模块与图标资源</Text>
          <View style={[styles.progressTrack, { backgroundColor: isDark ? "#20303D" : "#E5E7EB" }]} accessibilityRole="progressbar">
            <View style={[styles.progressBar, { backgroundColor: colors.primary, width: `${progress}%` }]} />
          </View>
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.progressText, { color: colors.primary }]}>{progress}%</Text>
          </View>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F8FA",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  routerMark: {
    width: 82,
    height: 68,
    alignItems: "center",
    marginBottom: 16,
  },
  antennaRow: {
    width: 62,
    height: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  antenna: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 4,
    borderColor: "#007E7A",
  },
  routerBody: {
    width: 82,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#007E7A",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 7,
  },
  port: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#0A3C4A",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#11181C",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#687076",
    marginBottom: 24,
    textAlign: "center",
  },
  progressTrack: {
    width: "100%",
    height: 9,
    backgroundColor: "#E5E7EB",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#007E7A",
    borderRadius: 5,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#007E7A",
  },
});
