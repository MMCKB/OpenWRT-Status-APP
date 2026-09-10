import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  router,
  Stack,
  useRootNavigationState,
  useSegments,
} from "expo-router";
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
import {
  setPredictiveBackAtRoot,
  setPredictiveMode,
} from "@/lib/native-predictive-back";

function RootNavigator() {
  const colors = useColors();
  return (
    <>
      <PredictiveBackController />
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
    </>
  );
}

/**
 * 预测性返回手势控制器。
 *
 * 开启：原生侧停用 ReactActivity 的常启用返回回调（它会压制系统预测动画），
 * 并注册非根屏转发器——根屏交还系统播放预测动画（Android 13+），二级屏由
 * 转发器把返回事件送回 JS 弹栈。
 *
 * 关闭：恢复 RN 回调，JS 在根屏消费返回并立即退出应用，与旧版行为一致。
 */
function PredictiveBackController() {
  const { settings } = useRouterStore();
  const predictiveBackEnabled = settings.predictiveBackEnabled;
  const navigationState = useRootNavigationState();
  const segments = useSegments();

  useEffect(() => {
    if (Platform.OS === "web") return;
    setPredictiveMode(predictiveBackEnabled);
  }, [predictiveBackEnabled]);

  // 根屏状态必须与导航严格同步：根屏禁用转发器交给系统播放预测动画，二级屏
  // 启用转发器把返回送回 JS 弹栈。若 atRoot 残留为 true，二级屏返回会被系统
  // 直接结束应用（回桌面）。navigationState 与 segments 双信号触发，并在
  // 200ms 后复检一次，覆盖导航提交与转场动画的时序差。
  useEffect(() => {
    if (Platform.OS === "web" || !predictiveBackEnabled) return;
    const sync = () => setPredictiveBackAtRoot(!router.canGoBack());
    sync();
    const timer = setTimeout(sync, 200);
    return () => clearTimeout(timer);
  }, [predictiveBackEnabled, navigationState, segments]);

  // 关闭模式下的根屏即时退出：返回事件经 RN 回调送达 JS，无人消费时退出。
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

  return null;
}
