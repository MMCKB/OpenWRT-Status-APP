import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";
import * as SystemUI from "expo-system-ui";

import { SchemeColors, type ColorScheme } from "@/constants/theme";
import { resolveColorScheme, type ThemePreference } from "@/lib/theme-utils";

export type { ThemePreference } from "@/lib/theme-utils";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
  setColorScheme: (scheme: ColorScheme) => Promise<void>;
};

const THEME_PREFERENCE_KEY = "openwrt.theme-preference.v1";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSystemScheme(): ColorScheme {
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(readSystemScheme);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("system");
  const colorScheme = resolveColorScheme(themePreference, systemScheme);

  const applyScheme = useCallback((scheme: ColorScheme) => {
    nativewindColorScheme.set(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");
      const palette = SchemeColors[scheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(THEME_PREFERENCE_KEY).then((stored) => {
      if (!active || stored !== "light" && stored !== "dark" && stored !== "system") return;
      setThemePreferenceState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Keep the in-app “follow system” preference live while Android changes uiMode.
    setSystemScheme(readSystemScheme());
    const subscription = Appearance.addChangeListener(({ colorScheme: nextScheme }) => {
      setSystemScheme(nextScheme === "dark" ? "dark" : "light");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    applyScheme(colorScheme);
    void SystemUI.setBackgroundColorAsync(SchemeColors[colorScheme].background).catch(() => undefined);
  }, [applyScheme, colorScheme]);

  const setThemePreference = useCallback(async (preference: ThemePreference) => {
    setThemePreferenceState(preference);
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
  }, []);

  const setColorScheme = useCallback(
    (scheme: ColorScheme) => setThemePreference(scheme),
    [setThemePreference],
  );

  const themeVariables = useMemo(
    () =>
      vars({
        "color-primary": SchemeColors[colorScheme].primary,
        "color-background": SchemeColors[colorScheme].background,
        "color-surface": SchemeColors[colorScheme].surface,
        "color-foreground": SchemeColors[colorScheme].foreground,
        "color-muted": SchemeColors[colorScheme].muted,
        "color-border": SchemeColors[colorScheme].border,
        "color-success": SchemeColors[colorScheme].success,
        "color-warning": SchemeColors[colorScheme].warning,
        "color-error": SchemeColors[colorScheme].error,
      }),
    [colorScheme],
  );

  const value = useMemo(
    () => ({ colorScheme, themePreference, setThemePreference, setColorScheme }),
    [colorScheme, setColorScheme, setThemePreference, themePreference],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1, backgroundColor: SchemeColors[colorScheme].background }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}
