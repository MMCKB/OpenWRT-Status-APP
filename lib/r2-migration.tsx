import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { NativeModules, Platform } from "react-native";

const PROFILES_KEY = "openwrt.router-profiles.v1";
const SETTINGS_KEY = "openwrt.router-settings.v1";
const PASSWORD_PREFIX = "openwrt.router-password.";
const SSH_PASSWORD_PREFIX = "openwrt.router-ssh-password.";
const FIRMWARE_RELEASE_PREFIX = "openwrt.router-firmware-release.";
const TRAFFIC_HISTORY_PREFIX = "openwrt-status-app:traffic-history:";

type LegacyProfile = { id?: unknown };
type NativeMigrationStatus = {
  state: "empty" | "started" | "verified" | "completed";
  completed: boolean;
  recordCount: number;
  writtenAt: string;
};

type MigrationContextValue = {
  status: "checking" | "ready" | "unavailable" | "failed";
  detail: string;
  retry: () => Promise<void>;
};

const MigrationContext = createContext<MigrationContextValue | null>(null);

function parseProfiles(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (item as LegacyProfile)?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

function nativeBridge():
  | {
      writeMigrationSnapshot: (payloadJson: string) => Promise<string>;
      getMigrationStatus: () => Promise<string>;
    }
  | undefined {
  if (Platform.OS !== "android") return undefined;
  return NativeModules.OpenWrtMigrationBridge;
}

async function buildSnapshot() {
  const [profilesJson, settingsJson] = await Promise.all([
    AsyncStorage.getItem(PROFILES_KEY),
    AsyncStorage.getItem(SETTINGS_KEY),
  ]);
  const routerIds = parseProfiles(profilesJson);
  const perRouter = await Promise.all(
    routerIds.map(async (routerId) => {
      const [luciPassword, sshPassword, firmwareReleaseUrl, trafficHistory] =
        await Promise.all([
          SecureStore.getItemAsync(`${PASSWORD_PREFIX}${routerId}`),
          SecureStore.getItemAsync(`${SSH_PASSWORD_PREFIX}${routerId}`),
          AsyncStorage.getItem(`${FIRMWARE_RELEASE_PREFIX}${routerId}`),
          AsyncStorage.getItem(`${TRAFFIC_HISTORY_PREFIX}${routerId}`),
        ]);
      return {
        routerId,
        luciPassword,
        sshPassword,
        firmwareReleaseUrl,
        trafficHistory,
      };
    }),
  );
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profilesJson,
    settingsJson,
    routers: perRouter,
    recordCount: routerIds.length,
  });
}

async function writeEncryptedMigrationSnapshot(): Promise<NativeMigrationStatus> {
  const bridge = nativeBridge();
  if (!bridge) throw new Error("当前平台不支持 Android 覆盖升级迁移。");
  const rawStatus = await bridge.writeMigrationSnapshot(await buildSnapshot());
  return JSON.parse(rawStatus) as NativeMigrationStatus;
}

export function R2MigrationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MigrationContextValue["status"]>("checking");
  const [detail, setDetail] = useState("正在准备加密升级备份。");

  const retry = useCallback(async () => {
    if (!nativeBridge()) {
      setStatus("unavailable");
      setDetail("仅 Android 覆盖升级版本会创建本地加密迁移备份。");
      return;
    }
    setStatus("checking");
    setDetail("正在写入 Android Keystore 加密迁移仓。");
    try {
      const result = await writeEncryptedMigrationSnapshot();
      setStatus(result.completed ? "ready" : "failed");
      setDetail(
        result.completed
          ? `已加密保存 ${result.recordCount} 台路由器的升级数据。`
          : "迁移备份未完成，请重试。",
      );
    } catch {
      setStatus("failed");
      setDetail("迁移备份失败。请保持当前版本并重试，不要先卸载应用。");
    }
  }, []);

  useEffect(() => {
    void retry();
  }, [retry]);

  const value = useMemo(
    () => ({ status, detail, retry }),
    [detail, retry, status],
  );
  return <MigrationContext.Provider value={value}>{children}</MigrationContext.Provider>;
}

export function useR2Migration() {
  const value = useContext(MigrationContext);
  if (!value) throw new Error("useR2Migration 必须在 R2MigrationProvider 内使用。");
  return value;
}
