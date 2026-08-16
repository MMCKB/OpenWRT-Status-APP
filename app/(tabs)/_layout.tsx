import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { RouterProvider } from "@/lib/router-provider";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <RouterProvider>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
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
      <Tabs.Screen name="packages" options={{ href: null }} />
      <Tabs.Screen name="router-form" options={{ href: null }} />
      <Tabs.Screen name="tools" options={{ href: null }} />
      <Tabs.Screen name="clients" options={{ href: null }} />
      <Tabs.Screen name="traffic" options={{ href: null }} />
      <Tabs.Screen name="diagnostics" options={{ href: null }} />
      <Tabs.Screen name="wireless-manager" options={{ href: null }} />
      <Tabs.Screen name="maintenance-tools" options={{ href: null }} />
      <Tabs.Screen name="quick-actions" options={{ href: null }} />
    </Tabs>
    </RouterProvider>
  );
}
