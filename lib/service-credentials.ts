import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AdGuardCredentials } from "./adguard-api";
import type { ClashCredentials } from "./clash-api";

export interface ServiceCredentials {
  clash: Partial<ClashCredentials>;
  adguard: Partial<AdGuardCredentials>;
}

const STORAGE_PREFIX = "openwrt.service-creds.";

function storageKey(routerId: string) {
  return `${STORAGE_PREFIX}${routerId}`;
}

export async function loadServiceCredentials(routerId: string): Promise<ServiceCredentials> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(routerId));
    if (!raw) return { clash: {}, adguard: {} };
    const parsed = JSON.parse(raw) as Partial<ServiceCredentials>;
    return { clash: parsed.clash ?? {}, adguard: parsed.adguard ?? {} };
  } catch {
    return { clash: {}, adguard: {} };
  }
}

export async function saveServiceCredentials(
  routerId: string,
  credentials: ServiceCredentials,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(routerId), JSON.stringify(credentials));
}
