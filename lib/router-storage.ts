import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { RouterProfile, RouterSettings } from "@/shared/router-types";

const PROFILES_KEY = "openwrt.router-profiles.v1";
const SETTINGS_KEY = "openwrt.router-settings.v1";
const PASSWORD_PREFIX = "openwrt.router-password.";
const SSH_PASSWORD_PREFIX = "openwrt.router-ssh-password.";
const FIRMWARE_RELEASE_PREFIX = "openwrt.router-firmware-release.";

const defaultSettings: RouterSettings = {
  selectedRouterId: null,
  refreshIntervalSeconds: 60,
  trafficInterfaceIds: [],
  statusTrafficView: "full",
  predictiveBackEnabled: true,
};

function passwordKey(routerId: string) {
  return `${PASSWORD_PREFIX}${routerId}`;
}

function sshPasswordKey(routerId: string) {
  return `${SSH_PASSWORD_PREFIX}${routerId}`;
}

function firmwareReleaseKey(routerId: string) {
  return `${FIRMWARE_RELEASE_PREFIX}${routerId}`;
}

async function setSecret(key: string, value: string) {
  if (Platform.OS === "web") {
    globalThis.sessionStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getSecret(key: string) {
  if (Platform.OS === "web") {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function removeSecret(key: string) {
  if (Platform.OS === "web") {
    globalThis.sessionStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function loadProfiles(): Promise<RouterProfile[]> {
  const raw = await AsyncStorage.getItem(PROFILES_KEY);
  if (!raw) return [];
  try {
    const decoded = JSON.parse(raw) as unknown;
    return Array.isArray(decoded) ? (decoded as RouterProfile[]) : [];
  } catch {
    return [];
  }
}

export async function saveProfiles(profiles: RouterProfile[]) {
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export async function loadSettings(): Promise<RouterSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings;
  try {
    const decoded = JSON.parse(raw) as Partial<RouterSettings>;
    return {
      selectedRouterId: decoded.selectedRouterId ?? null,
      refreshIntervalSeconds:
        typeof decoded.refreshIntervalSeconds === "number"
          ? decoded.refreshIntervalSeconds
          : defaultSettings.refreshIntervalSeconds,
      trafficInterfaceIds: Array.isArray(decoded.trafficInterfaceIds)
        ? decoded.trafficInterfaceIds.filter((item): item is string => typeof item === "string")
        : defaultSettings.trafficInterfaceIds,
      statusTrafficView: decoded.statusTrafficView === "compact" ? "compact" : "full",
      predictiveBackEnabled:
        typeof decoded.predictiveBackEnabled === "boolean"
          ? decoded.predictiveBackEnabled
          : defaultSettings.predictiveBackEnabled,
    };
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(settings: RouterSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function savePassword(routerId: string, password: string) {
  await setSecret(passwordKey(routerId), password);
}

export async function loadPassword(routerId: string) {
  return getSecret(passwordKey(routerId));
}

export async function removePassword(routerId: string) {
  await removeSecret(passwordKey(routerId));
}

export async function saveSshPassword(routerId: string, password: string) {
  await setSecret(sshPasswordKey(routerId), password);
}

export async function loadSshPassword(routerId: string) {
  return getSecret(sshPasswordKey(routerId));
}

export async function removeSshPassword(routerId: string) {
  await removeSecret(sshPasswordKey(routerId));
}

export async function loadFirmwareReleaseUrl(routerId: string) {
  return AsyncStorage.getItem(firmwareReleaseKey(routerId));
}

export async function saveFirmwareReleaseUrl(routerId: string, url: string) {
  const normalized = url.trim();
  if (normalized) await AsyncStorage.setItem(firmwareReleaseKey(routerId), normalized);
  else await AsyncStorage.removeItem(firmwareReleaseKey(routerId));
}
