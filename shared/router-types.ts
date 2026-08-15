export interface RouterProfile {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  sshUsername?: string;
  sshPort?: number;
  createdAt: string;
  lastConnectedAt?: string;
}

export interface RouterSettings {
  selectedRouterId: string | null;
  refreshIntervalSeconds: number;
}

export interface SystemStatus {
  hostname: string;
  model: string;
  firmware: string;
  uptimeSeconds: number | null;
  load: [number, number, number] | null;
  memoryTotal: number | null;
  memoryAvailable: number | null;
}

export interface InterfaceStatus {
  name: string;
  device: string;
  up: boolean;
  ipv4: string[];
  uptimeSeconds: number | null;
}

export interface WirelessStatus {
  name: string;
  ssid: string;
  up: boolean;
  channel: string;
  clients: number | null;
}

export interface RouterStatus {
  routerId: string;
  online: boolean;
  fetchedAt: string;
  system: SystemStatus | null;
  interfaces: InterfaceStatus[];
  wireless: WirelessStatus[];
  warnings: string[];
  error?: string;
}

export interface InstalledPackage {
  name: string;
  version: string;
}
