import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { DEFAULT_TAB_ORDER, isTabOrder, type TabRouteName } from "./tab-navigation";

export type TabBarMode = "liquid" | "classic";
export { DEFAULT_TAB_ORDER, type TabRouteName } from "./tab-navigation";

interface TabBarPreferenceValue {
  mode: TabBarMode;
  setMode: (mode: TabBarMode) => void;
  tabOrder: TabRouteName[];
  setTabOrder: (order: TabRouteName[]) => void;
}

const STORAGE_KEY = "@openwrt-status/tab-bar-mode";
const ORDER_STORAGE_KEY = "@openwrt-status/tab-bar-order";
const TabBarPreferenceContext = createContext<TabBarPreferenceValue | null>(null);

export function TabBarPreferenceProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<TabBarMode>("liquid");
  const [tabOrder, setTabOrderState] = useState<TabRouteName[]>([...DEFAULT_TAB_ORDER]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(ORDER_STORAGE_KEY)]).then(([storedMode, storedOrder]) => {
      if (!active) return;
      if (storedMode === "classic" || storedMode === "liquid") {
        setModeState(storedMode);
      }
      if (storedOrder) {
        try {
          const parsed: unknown = JSON.parse(storedOrder);
          if (isTabOrder(parsed)) setTabOrderState(parsed);
        } catch {
          // Ignore malformed locally stored navigation preferences.
        }
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

  const setTabOrder = (nextOrder: TabRouteName[]) => {
    if (!isTabOrder(nextOrder)) return;
    setTabOrderState(nextOrder);
    if (hydrated) {
      void AsyncStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
    }
  };

  const value = useMemo(() => ({ mode, setMode, tabOrder, setTabOrder }), [mode, tabOrder, hydrated]);
  return <TabBarPreferenceContext.Provider value={value}>{children}</TabBarPreferenceContext.Provider>;
}

export function useTabBarPreference() {
  const context = useContext(TabBarPreferenceContext);
  if (!context) {
    throw new Error("useTabBarPreference must be used inside TabBarPreferenceProvider");
  }
  return context;
}
