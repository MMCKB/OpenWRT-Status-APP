import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  fetchRouterStatus,
  fetchRouterTraffic,
  normalizeRouterEndpoint,
} from "@/lib/openwrt-client";
import { recordWanTrafficHistory } from "@/lib/traffic-history";
import {
  loadPassword,
  loadProfiles,
  loadSettings,
  loadSshPassword,
  removePassword,
  removeSshPassword,
  savePassword,
  saveProfiles,
  saveSettings,
  saveSshPassword,
} from "@/lib/router-storage";
import type {
  RouterProfile,
  RouterSettings,
  RouterStatus,
} from "@/shared/router-types";

type RouterDraft = Pick<
  RouterProfile,
  "name" | "baseUrl" | "username" | "sshUsername" | "sshPort"
>;

interface RouterContextValue {
  profiles: RouterProfile[];
  settings: RouterSettings;
  selectedProfile: RouterProfile | null;
  selectedStatus: RouterStatus | null;
  isReady: boolean;
  isRefreshing: boolean;
  isTrafficRefreshing: boolean;
  setSelectedRouter: (routerId: string) => Promise<void>;
  saveProfile: (
    draft: RouterDraft,
    password: string,
    sshPassword: string,
    id?: string,
  ) => Promise<RouterProfile>;
  deleteProfile: (routerId: string) => Promise<void>;
  testConnection: (
    draft: RouterDraft,
    password: string,
    routerId?: string,
  ) => Promise<RouterStatus>;
  refreshStatus: () => Promise<RouterStatus | null>;
  updateRefreshInterval: (seconds: number) => Promise<void>;
  updateTrafficInterfaceIds: (interfaceIds: string[]) => Promise<void>;
  updateStatusTrafficView: (view: "full" | "compact") => Promise<void>;
  updateDiagnosticOutputDisplay: (
    display: "page" | "dialog" | "both",
  ) => Promise<void>;
  getSelectedCredentials: () => Promise<{
    luciPassword: string | null;
    sshPassword: string;
  } | null>;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function makeId() {
  return `router-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<RouterProfile[]>([]);
  const [settings, setSettings] = useState<RouterSettings>({
    selectedRouterId: null,
    refreshIntervalSeconds: 60,
    trafficInterfaceIds: [],
    statusTrafficView: "full",
    diagnosticOutputDisplay: "both",
  });
  const [selectedStatus, setSelectedStatus] = useState<RouterStatus | null>(
    null,
  );
  const [isReady, setIsReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTrafficRefreshing, setIsTrafficRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const trafficRefreshInFlightRef = useRef(false);

  const selectedProfile = useMemo(
    () =>
      profiles.find((profile) => profile.id === settings.selectedRouterId) ??
      null,
    [profiles, settings.selectedRouterId],
  );

  useEffect(() => {
    let active = true;
    Promise.all([loadProfiles(), loadSettings()])
      .then(([savedProfiles, savedSettings]) => {
        if (!active) return;
        const selectedRouterId = savedProfiles.some(
          (profile) => profile.id === savedSettings.selectedRouterId,
        )
          ? savedSettings.selectedRouterId
          : (savedProfiles[0]?.id ?? null);
        setProfiles(savedProfiles);
        setSettings({ ...savedSettings, selectedRouterId });
      })
      .finally(() => {
        if (active) setIsReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!selectedProfile) return null;
    if (refreshInFlightRef.current) return selectedStatus;
    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    try {
      const password = await loadPassword(selectedProfile.id);
      if (!password)
        throw new Error("未找到已保存的路由器密码，请重新编辑该路由器。");
      const status = await fetchRouterStatus(
        selectedProfile.id,
        selectedProfile.baseUrl,
        selectedProfile.username,
        password,
      );
      setSelectedStatus(status);
      if (status.online) {
        void recordWanTrafficHistory(
          status.routerId,
          status.interfaces,
          status.fetchedAt,
        );
      }
      const updated = profiles.map((profile) =>
        profile.id === selectedProfile.id
          ? { ...profile, lastConnectedAt: status.fetchedAt }
          : profile,
      );
      setProfiles(updated);
      await saveProfiles(updated);
      return status;
    } catch (error) {
      const offline: RouterStatus = {
        routerId: selectedProfile.id,
        online: false,
        fetchedAt: new Date().toISOString(),
        system: null,
        interfaces: [],
        wireless: [],
        warnings: [],
        error: error instanceof Error ? error.message : "无法读取路由器状态。",
      };
      setSelectedStatus(offline);
      return offline;
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [profiles, selectedProfile, selectedStatus]);

  const refreshTraffic = useCallback(async () => {
    if (!selectedProfile || trafficRefreshInFlightRef.current) return;
    trafficRefreshInFlightRef.current = true;
    setIsTrafficRefreshing(true);
    try {
      const password = await loadPassword(selectedProfile.id);
      if (!password) return;
      const traffic = await fetchRouterTraffic(
        selectedProfile.baseUrl,
        selectedProfile.username,
        password,
      );
      setSelectedStatus((current) =>
        current
          ? {
              ...current,
              interfaces: traffic.interfaces,
              fetchedAt: traffic.fetchedAt,
              online: true,
              error: undefined,
            }
          : current,
      );
      void recordWanTrafficHistory(
        selectedProfile.id,
        traffic.interfaces,
        traffic.fetchedAt,
      );
    } catch {
      // A transient counter sample must not replace the full status or interrupt other pages.
    } finally {
      trafficRefreshInFlightRef.current = false;
      setIsTrafficRefreshing(false);
    }
  }, [selectedProfile]);

  useEffect(() => {
    if (!isReady || !selectedProfile || settings.refreshIntervalSeconds <= 0)
      return;
    const timer = setInterval(
      () => {
        if (settings.refreshIntervalSeconds === 1) {
          void refreshTraffic();
        } else {
          void refreshStatus();
        }
      },
      Math.max(1, settings.refreshIntervalSeconds) * 1000,
    );
    return () => clearInterval(timer);
  }, [
    isReady,
    refreshStatus,
    refreshTraffic,
    selectedProfile,
    settings.refreshIntervalSeconds,
  ]);

  const setSelectedRouter = useCallback(
    async (routerId: string) => {
      const next = { ...settings, selectedRouterId: routerId };
      setSettings(next);
      setSelectedStatus(null);
      await saveSettings(next);
    },
    [settings],
  );

  const saveProfile = useCallback(
    async (
      draft: RouterDraft,
      password: string,
      sshPassword: string,
      id?: string,
    ) => {
      const existing = id
        ? profiles.find((profile) => profile.id === id)
        : undefined;
      const name = draft.name.trim() || "我的 OpenWrt";
      const duplicate = profiles.find(
        (profile) => profile.name.trim() === name && profile.id !== id,
      );
      if (duplicate) throw new Error("已有同名路由器，请使用不同的名称。");
      const profile: RouterProfile = {
        id: existing?.id ?? makeId(),
        name,
        baseUrl: normalizeRouterEndpoint(draft.baseUrl),
        username: draft.username.trim() || "root",
        sshUsername:
          draft.sshUsername?.trim() || draft.username.trim() || "root",
        sshPort:
          Number.isInteger(draft.sshPort) &&
          (draft.sshPort ?? 0) > 0 &&
          (draft.sshPort ?? 0) <= 65535
            ? draft.sshPort
            : (existing?.sshPort ?? 22),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        lastConnectedAt: existing?.lastConnectedAt,
      };
      const nextProfiles = existing
        ? profiles.map((item) => (item.id === profile.id ? profile : item))
        : [...profiles, profile];
      setProfiles(nextProfiles);
      await saveProfiles(nextProfiles);
      if (password) await savePassword(profile.id, password);
      if (sshPassword) {
        await saveSshPassword(profile.id, sshPassword);
      } else if (!existing && password) {
        await saveSshPassword(profile.id, password);
      }
      if (
        !settings.selectedRouterId ||
        settings.selectedRouterId === profile.id
      ) {
        const nextSettings = { ...settings, selectedRouterId: profile.id };
        setSettings(nextSettings);
        await saveSettings(nextSettings);
      }
      return profile;
    },
    [profiles, settings],
  );

  const deleteProfile = useCallback(
    async (routerId: string) => {
      const nextProfiles = profiles.filter(
        (profile) => profile.id !== routerId,
      );
      const nextSettings = {
        ...settings,
        selectedRouterId:
          settings.selectedRouterId === routerId
            ? (nextProfiles[0]?.id ?? null)
            : settings.selectedRouterId,
      };
      setProfiles(nextProfiles);
      setSettings(nextSettings);
      if (settings.selectedRouterId === routerId) setSelectedStatus(null);
      await Promise.all([
        saveProfiles(nextProfiles),
        saveSettings(nextSettings),
        removePassword(routerId),
        removeSshPassword(routerId),
      ]);
    },
    [profiles, settings],
  );

  const testConnection = useCallback(
    async (draft: RouterDraft, password: string, routerId = "test") => {
      if (!password) throw new Error("请输入 LuCI 密码以测试连接。");
      return fetchRouterStatus(
        routerId,
        draft.baseUrl,
        draft.username || "root",
        password,
      );
    },
    [],
  );

  const updateRefreshInterval = useCallback(
    async (seconds: number) => {
      const next = {
        ...settings,
        refreshIntervalSeconds: Math.max(0, Math.floor(seconds)),
      };
      setSettings(next);
      await saveSettings(next);
    },
    [settings],
  );

  const updateTrafficInterfaceIds = useCallback(
    async (interfaceIds: string[]) => {
      const next = {
        ...settings,
        trafficInterfaceIds: [...new Set(interfaceIds)],
      };
      setSettings(next);
      await saveSettings(next);
    },
    [settings],
  );

  const updateStatusTrafficView = useCallback(
    async (view: "full" | "compact") => {
      const next = { ...settings, statusTrafficView: view };
      setSettings(next);
      await saveSettings(next);
    },
    [settings],
  );

  const updateDiagnosticOutputDisplay = useCallback(
    async (display: "page" | "dialog" | "both") => {
      const next = { ...settings, diagnosticOutputDisplay: display };
      setSettings(next);
      await saveSettings(next);
    },
    [settings],
  );

  const getSelectedCredentials = useCallback(async () => {
    if (!selectedProfile) return null;
    const [luciPassword, sshPassword] = await Promise.all([
      loadPassword(selectedProfile.id),
      loadSshPassword(selectedProfile.id),
    ]);
    const effectiveSshPassword = sshPassword ?? luciPassword;
    if (!effectiveSshPassword) return null;
    return { luciPassword, sshPassword: effectiveSshPassword };
  }, [selectedProfile]);

  const value = useMemo<RouterContextValue>(
    () => ({
      profiles,
      settings,
      selectedProfile,
      selectedStatus,
      isReady,
      isRefreshing,
      isTrafficRefreshing,
      setSelectedRouter,
      saveProfile,
      deleteProfile,
      testConnection,
      refreshStatus,
      updateRefreshInterval,
      updateTrafficInterfaceIds,
      updateStatusTrafficView,
      updateDiagnosticOutputDisplay,
      getSelectedCredentials,
    }),
    [
      profiles,
      settings,
      selectedProfile,
      selectedStatus,
      isReady,
      isRefreshing,
      isTrafficRefreshing,
      setSelectedRouter,
      saveProfile,
      deleteProfile,
      testConnection,
      refreshStatus,
      updateRefreshInterval,
      updateTrafficInterfaceIds,
      updateStatusTrafficView,
      updateDiagnosticOutputDisplay,
      getSelectedCredentials,
    ],
  );

  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
}

export function useRouterStore() {
  const value = useContext(RouterContext);
  if (!value) throw new Error("useRouterStore 必须在 RouterProvider 内使用。");
  return value;
}
