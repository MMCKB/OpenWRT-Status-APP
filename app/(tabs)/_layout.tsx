import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
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
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={25}
              name="gauge.with.dots.needle.50percent"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="routers"
        options={{
          title: "路由器",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={25} name="wifi" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="details"
        options={{
          title: "详情",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={25} name="list.bullet.rectangle" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="control"
        options={{
          title: "控制",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={25} name="terminal.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: "服务",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={25} name="server.rack" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: "工具",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={25} name="wrench.and.screwdriver" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "设置",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={25} name="gearshape.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen name="router-form" options={{ href: null }} />
    </Tabs>
  );
}
