import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

try {
  SplashScreen.preventAutoHideAsync();
} catch {
  // The native splash may already be hidden on web or during hot reload.
}

const materialFont = (MaterialIcons.font as Record<string, unknown>).material;

export function SplashLoader({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState(8);
  const [isReady, setIsReady] = useState(false);
  const [fontsLoaded] = useFonts({ material: materialFont as never });

  useEffect(() => {
    // Hide the native splash as soon as the React tree exists. Otherwise it covers
    // this React progress screen and the user only sees the static launcher image.
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    // The route tree must never be gated by a font request. A failed or delayed font
    // request used to leave this view at 100% forever on some Android releases.
    const progressTimer = setInterval(() => {
      setProgress((current) => Math.min(94, current + 12));
    }, 100);
    const completeTimer = setTimeout(() => setProgress(100), fontsLoaded ? 520 : 760);
    const readyTimer = setTimeout(() => setIsReady(true), fontsLoaded ? 760 : 1_000);

    return () => {
      clearInterval(progressTimer);
      clearTimeout(completeTimer);
      clearTimeout(readyTimer);
    };
  }, [fontsLoaded]);

  if (!isReady) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.routerMark} accessibilityLabel="OpenWrt">
            <View style={styles.antennaRow}>
              <View style={styles.antenna} />
              <View style={styles.antenna} />
            </View>
            <View style={styles.routerBody}>
              <View style={styles.port} />
              <View style={styles.port} />
              <View style={styles.port} />
            </View>
          </View>
          <Text style={styles.title}>OpenWrt 管理中心</Text>
          <Text style={styles.subtitle}>正在准备管理模块与图标资源</Text>
          <View style={styles.progressTrack} accessibilityRole="progressbar">
            <View style={[styles.progressBar, { width: `${progress}%` }]} />
          </View>
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color="#007E7A" />
            <Text style={styles.progressText}>{progress}%</Text>
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
