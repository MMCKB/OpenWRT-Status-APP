import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { RouterProvider } from "@/lib/router-provider";
import { TabBarPreferenceProvider, useTabBarPreference } from "@/lib/tab-bar-preference";

const VISIBLE_ROUTES = ["index", "routers", "details", "control", "settings"] as const;

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mode } = useTabBarPreference();
  const [contentWidth, setContentWidth] = useState(0);
  const indicatorX = useSharedValue(4);
  const glossX = useSharedValue(-96);
  const safeBottom = Platform.OS === "web" ? 8 : Math.max(insets.bottom, 8);
  const tabWidth = contentWidth > 0 ? contentWidth / VISIBLE_ROUTES.length : 0;
  const activeIndex = Math.max(0, VISIBLE_ROUTES.indexOf(state.routes[state.index]?.name as (typeof VISIBLE_ROUTES)[number]));
  const isClassic = mode === "classic";
  const useNativeGlass = Platform.OS === "ios" && isGlassEffectAPIAvailable();

  useEffect(() => {
    if (tabWidth <= 0) return;
    indicatorX.value = withTiming(activeIndex * tabWidth + 4, {
      duration: 300,
    });
  }, [activeIndex, indicatorX, tabWidth]);

  useEffect(() => {
    if (isClassic || contentWidth <= 0) {
      glossX.value = -96;
      return;
    }

    glossX.value = -96;
    glossX.value = withRepeat(
      withTiming(contentWidth + 96, {
        duration: 4800,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      false,
    );
  }, [contentWidth, glossX, isClassic]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: Math.max(0, tabWidth - 8),
    transform: [{ translateX: indicatorX.value }],
  }), [tabWidth]);

  const travellingGlossStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: glossX.value }, { rotate: "21deg" }],
  }));

  function onLayout(event: LayoutChangeEvent) {
    setContentWidth(event.nativeEvent.layout.width);
  }

  const visibleRouteEntries = useMemo(
    () => VISIBLE_ROUTES
      .map((name) => state.routes.find((route) => route.name === name))
      .filter((route): route is (typeof state.routes)[number] => Boolean(route)),
    [state.routes],
  );

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { bottom: safeBottom + 7 }]}>
      <View style={[styles.shell, isClassic && styles.classicShell]}>
        {!isClassic ? (
          <>
            {useNativeGlass ? (
              <GlassView pointerEvents="none" glassEffectStyle="clear" style={styles.nativeGlass} />
            ) : Platform.OS !== "web" ? (
              <BlurView
                pointerEvents="none"
                intensity={28}
                tint="default"
                experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
                style={styles.blur}
              />
            ) : null}
            <View pointerEvents="none" style={styles.transparentGlassWash} />
            <View pointerEvents="none" style={styles.glassDepth} />
            <View pointerEvents="none" style={styles.glassEdgeRim} />
            <View pointerEvents="none" style={styles.glassInnerRim} />
            <Animated.View pointerEvents="none" style={[styles.specularSweep, travellingGlossStyle]} />
            <View pointerEvents="none" style={styles.glassTopShine} />
            <View pointerEvents="none" style={styles.glassBottomShine} />
          </>
        ) : null}
        <View onLayout={onLayout} style={styles.tabRow}>
          <Animated.View pointerEvents="none" style={[styles.activeIndicator, isClassic && styles.classicIndicator, indicatorStyle]}>
            {!isClassic ? <View style={styles.activeIndicatorGloss} /> : null}
          </Animated.View>
          {visibleRouteEntries.map((route, index) => {
            if (!route) return null;
            const descriptor = descriptors[route.key];
            const options = descriptor.options;
            const isFocused = state.index === state.routes.findIndex((item) => item.key === route.key);
            const color = isFocused ? colors.tint : colors.muted;
            const icon = options.tabBarIcon?.({ focused: isFocused, color, size: 21 });
            const label = typeof options.tabBarLabel === "string" ? options.tabBarLabel : options.title ?? route.name;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                onPress={() => {
                  if (Platform.OS !== "web") void Haptics.selectionAsync();
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!isFocused && !event.defaultPrevented) {
                    navigation.navigate(route.name, route.params);
                  }
                }}
                onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
                style={({ pressed }) => [styles.tabItem, pressed && styles.tabPressed]}
              >
                {icon}
                <Text numberOfLines={1} style={[styles.tabLabel, { color }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBottomInset = Platform.OS === "web" ? 8 : Math.max(insets.bottom, 8);
  const sceneBottomPadding = tabBottomInset + 92;

  return (
    <RouterProvider>
      <TabBarPreferenceProvider>
        <Tabs
          tabBar={(props) => <FloatingTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            tabBarHideOnKeyboard: true,
            // The custom floating bar is absolute, so reserve its visual footprint in every scene.
            sceneStyle: { paddingBottom: sceneBottomPadding },
          }}
        >
          <Tabs.Screen name="index" options={{ title: "状态", tabBarIcon: ({ color, focused }) => <IconSymbol size={focused ? 23 : 21} name="gauge.with.dots.needle.50percent" color={color} /> }} />
          <Tabs.Screen name="routers" options={{ title: "路由器", tabBarIcon: ({ color, focused }) => <IconSymbol size={focused ? 23 : 21} name="wifi" color={color} /> }} />
          <Tabs.Screen name="details" options={{ title: "详情", tabBarIcon: ({ color, focused }) => <IconSymbol size={focused ? 23 : 21} name="list.bullet.rectangle" color={color} /> }} />
          <Tabs.Screen name="control" options={{ title: "控制", tabBarIcon: ({ color, focused }) => <IconSymbol size={focused ? 23 : 21} name="terminal.fill" color={color} /> }} />
          <Tabs.Screen name="settings" options={{ title: "设置", tabBarIcon: ({ color, focused }) => <IconSymbol size={focused ? 23 : 21} name="gearshape.fill" color={color} /> }} />
          <Tabs.Screen name="firmware" options={{ href: null }} />
          <Tabs.Screen name="files" options={{ href: null }} />
          <Tabs.Screen name="router-form" options={{ href: null }} />
        </Tabs>
      </TabBarPreferenceProvider>
    </RouterProvider>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", left: 16, right: 16, zIndex: 20 },
  shell: { height: 74, overflow: "hidden", borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", backgroundColor: "transparent", shadowColor: "#2B6468", shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 14 },
  classicShell: { backgroundColor: "#FFFFFF", borderColor: "#DCE7E9", shadowOpacity: 0.11 },
  blur: { ...StyleSheet.absoluteFillObject },
  nativeGlass: { ...StyleSheet.absoluteFillObject },
  transparentGlassWash: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent" },
  glassDepth: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent" },
  glassEdgeRim: { ...StyleSheet.absoluteFillObject, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderBottomColor: "rgba(156,220,217,0.16)" },
  glassInnerRim: { position: "absolute", top: 2, bottom: 2, left: 2, right: 2, borderRadius: 999, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.16)", borderBottomWidth: 1, borderBottomColor: "rgba(15,102,106,0.035)" },
  specularSweep: { position: "absolute", top: -18, left: 0, width: 58, height: 116, borderRadius: 58, backgroundColor: "rgba(255,255,255,0.035)" },
  glassTopShine: { position: "absolute", top: 1, left: 28, right: 86, height: 2, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  glassBottomShine: { position: "absolute", left: 58, right: 28, bottom: 1, height: 1, borderRadius: 1, backgroundColor: "rgba(167,233,230,0.16)" },
  tabRow: { flex: 1, flexDirection: "row", alignItems: "stretch", paddingHorizontal: 4, paddingVertical: 4 },
  activeIndicator: { position: "absolute", top: 4, bottom: 4, left: 0, overflow: "hidden", borderRadius: 999, backgroundColor: "rgba(0,126,122,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)", shadowColor: "#DFFDFC", shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  activeIndicatorGloss: { position: "absolute", top: 2, left: 10, right: 10, height: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.22)" },
  classicIndicator: { backgroundColor: "#E6F5F4", borderColor: "#BDE6E1" },
  tabItem: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 32 },
  tabPressed: { opacity: 0.65, transform: [{ scale: 0.96 }] },
  tabLabel: { fontSize: 10.5, fontWeight: "700", lineHeight: 14 },
});
