import { Platform, TurboModuleRegistry } from "react-native";

import type { RouterProfile } from "@/shared/router-types";

interface NativeSshModule {
  connectToHostByPassword(host: string, port: number, username: string, password: string, key: string, callback: (error: string | null) => void): void;
  startShell(key: string, ptyType: string, callback: (error: string | null, response: string | null) => void): void;
  writeToShell(command: string, key: string, callback: (error: string | null, response: string | null) => void): void;
  closeShell(key: string): void;
  disconnect(key: string): void;
}

interface ActiveSshSession {
  key: string;
  target: string;
}

let activeSession: ActiveSshSession | null = null;

function nativeModule() {
  return TurboModuleRegistry.get("RTNSshClient") as unknown as NativeSshModule | null;
}

function hostFromProfile(profile: RouterProfile) {
  const address = /^https?:\/\//i.test(profile.baseUrl) ? profile.baseUrl : `http://${profile.baseUrl}`;
  const host = new URL(address).hostname;
  if (!host) throw new Error("无法从 LuCI 管理地址识别 SSH 主机。");
  return host;
}

function ensureAndroid() {
  if (Platform.OS !== "android") {
    throw new Error("应用内 SSH 终端目前仅支持 Android 构建；请在 Android APK 上使用此功能。");
  }
  const module = nativeModule();
  if (!module) {
    throw new Error("SSH 原生组件未加载。请安装最新 Android 构建，而不是使用 Web 预览。 ");
  }
  return module;
}

function withCallback(operation: (callback: (error: string | null, response?: string | null) => void) => void) {
  return new Promise<string>((resolve, reject) => {
    operation((error, response) => {
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve(response ?? "");
    });
  });
}

export function isInAppSshSupported() {
  return Platform.OS === "android";
}

export function getInAppSshTarget(profile: RouterProfile) {
  const host = hostFromProfile(profile);
  const username = profile.sshUsername || profile.username;
  return `${username}@${host}:${profile.sshPort ?? 22}`;
}

export async function connectInAppSsh(profile: RouterProfile, password: string) {
  const module = ensureAndroid();
  const host = hostFromProfile(profile);
  const username = profile.sshUsername || profile.username;
  const port = profile.sshPort ?? 22;
  const key = `openwrt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await withCallback((callback) => module.connectToHostByPassword(host, port, username, password, key, callback));
  try {
    const banner = await withCallback((callback) => module.startShell(key, "xterm", callback));
    activeSession = { key, target: `${username}@${host}:${port}` };
    return { target: activeSession.target, banner };
  } catch (error) {
    module.disconnect(key);
    throw error;
  }
}

export async function runInAppSshCommand(command: string) {
  const module = ensureAndroid();
  if (!activeSession) throw new Error("尚未连接 SSH。请先建立会话。");
  const normalized = command.trim();
  if (!normalized) throw new Error("请输入要执行的命令。");
  return withCallback((callback) => module.writeToShell(`${normalized}\n`, activeSession!.key, callback));
}

export function disconnectInAppSsh() {
  if (!activeSession) return;
  const module = nativeModule();
  module?.closeShell(activeSession.key);
  module?.disconnect(activeSession.key);
  activeSession = null;
}
