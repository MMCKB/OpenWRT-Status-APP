import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { RouterProvider } from "@/lib/router-provider";
import { TabBarPreferenceProvider, useTabBarPreference } from "@/lib/tab-bar-preference";
import { getTabIndexForOffset, getTabIndicatorX, TAB_ROUTE_NAMES } from "@/lib/tab-navigation";

const VISIBLE_ROUTES = TAB_ROUTE_NAMES;

interface DraggableTabItemProps {
  label: string;
  icon: ReactNode;
  color: string;
  isFocused: boolean;
  index: number;
  tabCount: number;
  tabWidth: number;
  isDragging: boolean;
  onPress: () => void;
  onDragStart: (index: number) => void;
  onDragMove: (pointerX: number, targetIndex: number) => void;
  onDragEnd: (targetIndex: number) => void;
  onDragFinalize: () => void;
}

function DraggableTabItem({
  label,
  icon,
  color,
  isFocused,
  index,
  tabCount,
  tabWidth,
  isDragging,
  onPress,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragFinalize,
}: DraggableTabItemProps) {
  const translationX = useSharedValue(0);
  const scale = useSharedValue(1);
  const targetIndex = useSharedValue(index);

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translationX.value }, { scale: scale.value }],
  }));

  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(320)
    .onBegin(() => {
      targetIndex.value = index;
      scale.value = withSpring(1.055, { damping: 16, stiffness: 220 });
      runOnJS(onDragStart)(index);
    })
    .onUpdate((event) => {
      translationX.value = event.translationX;
      if (tabWidth <= 0) return;
      const pointerX = index * tabWidth + tabWidth / 2 + event.translationX;
      const nextTarget = getTabIndexForOffset(pointerX, tabWidth, tabCount);
      if (nextTarget !== targetIndex.value) {
        targetIndex.value = nextTarget;
      }
      runOnJS(onDragMove)(pointerX, nextTarget);
    })
    .onEnd(() => {
      runOnJS(onDragEnd)(targetIndex.value);
    })
    .onFinalize(() => {
      translationX.value = withSpring(0, { damping: 17, stiffness: 220 });
      scale.value = withSpring(1, { damping: 17, stiffness: 220 });
      runOnJS(onDragFinalize)();
    });

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View style={[styles.tabGestureTarget, isDragging && styles.draggingTab, dragStyle]}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={isFocused ? { selected: true } : {}}
          accessibilityLabel={label}
          accessibilityHint="双击打开。长按后向左或向右滑动，松手即可选择对应页面。"
          onPress={onPress}
          style={({ pressed }) => [styles.tabItem, pressed && !isDragging && styles.tabPressed]}
        >
          {icon}
          <Text numberOfLines={1} style={[styles.tabLabel, { color }]}>{label}</Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mode } = useTabBarPreference();
  const [contentWidth, setContentWidth] = useState(0);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const lastDragTarget = useRef<number | null>(null);
  const indicatorX = useSharedValue(4);
  const dragTargetX = useSharedValue(4);
  const dragActive = useSharedValue(0);
  const glossX = useSharedValue(-96);
  const safeBottom = Platform.OS === "web" ? 8 : Math.max(insets.bottom, 8);
  const tabWidth = contentWidth > 0 ? contentWidth / VISIBLE_ROUTES.length : 0;
  const isClassic = mode === "classic";
  const useNativeGlass = Platform.OS === "ios" && isLiquidGlassSupported;

  const visibleRouteEntries = useMemo(() => {
    const routesByName = new Map(state.routes.map((route) => [route.name, route]));
    return VISIBLE_ROUTES
      .map((name) => routesByName.get(name))
      .filter((route): route is (typeof state.routes)[number] => Boolean(route));
  }, [state.routes]);

  const activeIndex = Math.max(0, visibleRouteEntries.findIndex((route) => route.key === state.routes[state.index]?.key));

  useEffect(() => {
    if (tabWidth <= 0) return;
    indicatorX.value = withTiming(activeIndex * tabWidth + 4, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [activeIndex, indicatorX, tabWidth]);

  useEffect(() => {
    if (isClassic || contentWidth <= 0) {
      glossX.value = -96;
      return;
    }

    glossX.value = -96;
    glossX.value = withRepeat(
      withTiming(contentWidth + 96, { duration: 5200, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, [contentWidth, glossX, isClassic]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: Math.max(0, tabWidth - 8),
    opacity: dragActive.value ? 0.9 : 1,
    transform: [
      { translateX: dragActive.value ? dragTargetX.value : indicatorX.value },
      { scale: 1 + dragActive.value * 0.075 },
    ],
  }), [tabWidth]);

  const travellingGlossStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: glossX.value }, { rotate: "21deg" }],
  }));

  function onLayout(event: LayoutChangeEvent) {
    setContentWidth(event.nativeEvent.layout.width);
  }

  function beginDrag(index: number) {
    setDraggingIndex(index);
    setDragTargetIndex(index);
    lastDragTarget.current = index;
    dragTargetX.value = withTiming(index * tabWidth + 4, { duration: 120 });
    dragActive.value = withTiming(1, { duration: 100 });
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function updateDragPosition(pointerX: number, targetIndex: number) {
    dragTargetX.value = withSpring(getTabIndicatorX(pointerX, tabWidth, contentWidth), { damping: 18, stiffness: 240 });
    if (lastDragTarget.current !== targetIndex) {
      lastDragTarget.current = targetIndex;
      setDragTargetIndex(targetIndex);
      if (Platform.OS !== "web") void Haptics.selectionAsync();
    }
  }

  function navigateToRoute(route: (typeof state.routes)[number], isFocused: boolean) {
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  }

  function commitDrag(targetIndex: number) {
    const route = visibleRouteEntries[targetIndex];
    if (!route) return;
    const isFocused = route.key === state.routes[state.index]?.key;
    navigateToRoute(route, isFocused);
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function finalizeDrag() {
    setDraggingIndex(null);
    setDragTargetIndex(null);
    lastDragTarget.current = null;
    dragActive.value = withTiming(0, { duration: 180 });
  }

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { bottom: safeBottom + 7 }]}>
      {useNativeGlass && !isClassic ? (
        <LiquidGlassView animated effect="clear" interactive style={styles.shell}>
          <TabBarContents />
        </LiquidGlassView>
      ) : (
        <View style={[styles.shell, isClassic && styles.classicShell]}>
          <TabBarContents />
        </View>
      )}
    </View>
  );

  function TabBarContents() {
    return (
      <>
        {!isClassic ? (
          <>
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
            const descriptor = descriptors[route.key];
            const options = descriptor.options;
            const isFocused = route.key === state.routes[state.index]?.key;
            const isVisualActive = dragTargetIndex === null ? isFocused : dragTargetIndex === index;
            const color = isVisualActive ? colors.tint : colors.muted;
            const icon = options.tabBarIcon?.({ focused: isVisualActive, color, size: 21 });
            const label = typeof options.tabBarLabel === "string" ? options.tabBarLabel : options.title ?? route.name;
            return (
              <DraggableTabItem
                key={route.key}
                label={label}
                icon={icon}
                color={String(color)}
                isFocused={isFocused}
                index={index}
                tabCount={visibleRouteEntries.length}
                tabWidth={tabWidth}
                isDragging={draggingIndex === index}
                onPress={() => {
                  if (Platform.OS !== "web") void Haptics.selectionAsync();
                  navigateToRoute(route, isFocused);
                }}
                onDragStart={beginDrag}
                onDragMove={updateDragPosition}
                onDragEnd={commitDrag}
                onDragFinalize={finalizeDrag}
              />
            );
          })}
        </View>
      </>
    );
  }
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
  shell: {
    height: 74,
    overflow: "visible",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "transparent",
    shadowColor: "#184A4D",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  classicShell: { overflow: "hidden", backgroundColor: "#FFFFFF", borderColor: "#DCE7E9", shadowOpacity: 0.11 },
  glassEdgeRim: { ...StyleSheet.absoluteFillObject, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", borderBottomColor: "rgba(118,197,194,0.11)" },
  glassInnerRim: { position: "absolute", top: 2, bottom: 2, left: 2, right: 2, borderRadius: 999, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.10)", borderBottomWidth: 1, borderBottomColor: "rgba(15,102,106,0.025)" },
  specularSweep: { position: "absolute", top: -18, left: 0, width: 58, height: 116, borderRadius: 58, backgroundColor: "rgba(255,255,255,0.025)" },
  glassTopShine: { position: "absolute", top: 1, left: 28, right: 86, height: 1, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.12)" },
  glassBottomShine: { position: "absolute", left: 58, right: 28, bottom: 1, height: 1, borderRadius: 1, backgroundColor: "rgba(94,196,191,0.10)" },
  tabRow: { flex: 1, flexDirection: "row", alignItems: "stretch", paddingHorizontal: 4, paddingVertical: 4 },
  activeIndicator: { position: "absolute", top: 4, bottom: 4, left: 0, overflow: "hidden", borderRadius: 999, backgroundColor: "rgba(0,126,122,0.075)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", shadowColor: "#C7FFFC", shadowOpacity: 0.12, shadowRadius: 9, shadowOffset: { width: 0, height: 2 } },
  activeIndicatorGloss: { position: "absolute", top: 2, left: 10, right: 10, height: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.045)", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)" },
  classicIndicator: { backgroundColor: "#E6F5F4", borderColor: "#BDE6E1" },
  tabGestureTarget: { flex: 1, minWidth: 0, zIndex: 1 },
  draggingTab: { zIndex: 8, elevation: 16 },
  tabItem: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 32 },
  tabPressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  tabLabel: { fontSize: 10.5, fontWeight: "700", lineHeight: 14 },
});
