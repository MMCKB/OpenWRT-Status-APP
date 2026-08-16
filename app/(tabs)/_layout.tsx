import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { RouterProvider } from "@/lib/router-provider";

function LiquidGlassTabBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={Platform.OS === "web" ? 72 : 82}
        tint="light"
        experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        style={styles.blur}
      />
      <View style={styles.glassTint} />
      <View style={styles.glassHighlight} />
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const safeBottom = Platform.OS === "web" ? 8 : Math.max(insets.bottom, 8);
  const floatingBottom = safeBottom + 6;

  return (
    <RouterProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.muted,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarHideOnKeyboard: true,
          tabBarBackground: () => <LiquidGlassTabBackground />,
          tabBarStyle: {
            position: "absolute",
            left: 16,
            right: 16,
            bottom: floatingBottom,
            height: 70,
            paddingTop: 6,
            paddingBottom: 6,
            borderTopWidth: 0,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.72)",
            borderRadius: 26,
            backgroundColor: "rgba(246,252,252,0.28)",
            overflow: "hidden",
            shadowColor: "#234B58",
            shadowOpacity: 0.16,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          },
          tabBarItemStyle: {
            marginHorizontal: 2,
            marginVertical: 2,
            borderRadius: 20,
          },
          tabBarIconStyle: { marginTop: 0 },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
            marginTop: 1,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "状态",
            tabBarIcon: ({ color }) => <IconSymbol size={25} name="gauge.with.dots.needle.50percent" color={color} />,
          }}
        />
        <Tabs.Screen name="routers" options={{ title: "路由器", tabBarIcon: ({ color }) => <IconSymbol size={25} name="wifi" color={color} /> }} />
        <Tabs.Screen name="details" options={{ title: "详情", tabBarIcon: ({ color }) => <IconSymbol size={25} name="list.bullet.rectangle" color={color} /> }} />
        <Tabs.Screen name="control" options={{ title: "控制", tabBarIcon: ({ color }) => <IconSymbol size={25} name="terminal.fill" color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: "设置", tabBarIcon: ({ color }) => <IconSymbol size={25} name="gearshape.fill" color={color} /> }} />
        <Tabs.Screen name="firmware" options={{ href: null }} />
        <Tabs.Screen name="files" options={{ href: null }} />
        <Tabs.Screen name="router-form" options={{ href: null }} />
      </Tabs>
    </RouterProvider>
  );
}

const styles = StyleSheet.create({
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(235, 250, 249, 0.38)",
  },
  glassHighlight: {
    position: "absolute",
    top: 0,
    left: 30,
    right: 30,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
});
