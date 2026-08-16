import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

export type TabBarMode = "liquid" | "classic";

interface TabBarPreferenceValue {
  mode: TabBarMode;
  setMode: (mode: TabBarMode) => void;
}

const STORAGE_KEY = "@openwrt-status/tab-bar-mode";
const TabBarPreferenceContext = createContext<TabBarPreferenceValue | null>(null);

export function TabBarPreferenceProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<TabBarMode>("liquid");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((storedMode) => {
      if (!active) return;
      if (storedMode === "classic" || storedMode === "liquid") {
        setModeState(storedMode);
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const setMode = (nextMode: TabBarMode) => {
    setModeState(nextMode);
    if (hydrated) {
      void AsyncStorage.setItem(STORAGE_KEY, nextMode);
    }
  };

  const value = useMemo(() => ({ mode, setMode }), [mode, hydrated]);
  return <TabBarPreferenceContext.Provider value={value}>{children}</TabBarPreferenceContext.Provider>;
}

export function useTabBarPreference() {
  const context = useContext(TabBarPreferenceContext);
  if (!context) {
    throw new Error("useTabBarPreference must be used inside TabBarPreferenceProvider");
  }
  return context;
}
