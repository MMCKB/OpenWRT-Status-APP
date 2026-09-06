import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { useThemeContext } from "@/lib/theme-provider";
import { useColors } from "@/hooks/use-colors";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import {
  initManusRuntime,
  subscribeSafeAreaInsets,
} from "@/lib/_core/manus-runtime";
import { SplashLoader } from "@/components/splash-loader";
import { AppDialogProvider } from "@/components/app-dialog";
import { RouterProvider } from "@/lib/router-provider";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? {
      insets: initialInsets,
      frame: initialFrame,
    };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  function ThemedAppContent() {
    const colors = useColors();
    const { colorScheme } = useThemeContext();
    return (
      <SplashLoader>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
              <RouterProvider>
                <AppDialogProvider>
                  <SafeAreaView
                    style={{ flex: 1, backgroundColor: colors.background }}
                    edges={["top", "left", "right"]}
                  >
                    <RootNavigator />
                    <StatusBar
                      style={colorScheme === "dark" ? "light" : "dark"}
                    />
                  </SafeAreaView>
                </AppDialogProvider>
              </RouterProvider>
            </QueryClientProvider>
          </trpc.Provider>
        </GestureHandlerRootView>
      </SplashLoader>
    );
  }

  const content = <ThemedAppContent />;

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>
        {content}
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

import { useRouterStore } from "@/lib/router-provider";

function RootNavigator() {
  const colors = useColors();
  const { settings } = useRouterStore();
  const predictiveBackEnabled = settings.predictiveBackEnabled;

  // 关闭预测性返回时接管根屏返回：立即退出应用，保持旧版的即时退出行为。
  // 开启时不注册监听，让系统接管返回事件并播放预测动画（Android 13+）。
  // 二级页面的返回由导航栈处理，监听器只在根屏生效。
  useEffect(() => {
    if (Platform.OS === "web" || predictiveBackEnabled) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (router.canGoBack()) return false;
        BackHandler.exitApp();
        return true;
      },
    );
    return () => subscription.remove();
  }, [predictiveBackEnabled]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "default",
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="files" />
      <Stack.Screen name="firmware" />
      <Stack.Screen name="packages" />
      <Stack.Screen name="clients" />
      <Stack.Screen name="dhcp-leases" />
      <Stack.Screen name="wake-on-lan" />
      <Stack.Screen name="diagnostics" />
      <Stack.Screen name="nat-detection" />
      <Stack.Screen name="disk-speed" />
      <Stack.Screen name="wireless-manager" />
      <Stack.Screen name="wireless-optimizer" />
      <Stack.Screen name="weak-signal" />
      <Stack.Screen name="docker" />
      <Stack.Screen name="performance-benchmark" />
      <Stack.Screen name="firmware-release" />
      <Stack.Screen name="maintenance-tools" />
      <Stack.Screen name="system-admin" />
      <Stack.Screen name="quick-actions" />
      <Stack.Screen name="services-health" />
      <Stack.Screen name="service-config" />
      <Stack.Screen name="logs" />
      <Stack.Screen name="firewall" />
      <Stack.Screen name="bulk-operations" />
      <Stack.Screen name="about" />
      <Stack.Screen name="oauth/callback" />
    </Stack>
  );
}
