import { NativeModules, Platform } from "react-native";

import type { RouterProfile } from "@/shared/router-types";

interface OpenWrtSshBridge {
  connect(
    host: string,
    port: number,
    username: string,
    password: string,
    key: string,
  ): Promise<void>;
  execute(key: string, command: string): Promise<string>;
  uploadFile(key: string, localUri: string, remotePath: string): Promise<void>;
  downloadFile(
    key: string,
    remotePath: string,
    localUri: string,
  ): Promise<void>;
  writeTextFile(
    key: string,
    content: string,
    remotePath: string,
  ): Promise<void>;
  disconnect(key: string): void;
}

interface ActiveSshSession {
  key: string;
  target: string;
}

let activeSession: ActiveSshSession | null = null;

function bridge() {
  const module = NativeModules.OpenWrtSsh as OpenWrtSshBridge | undefined;
  if (Platform.OS !== "android") {
    throw new Error("应用内 SSH 控制目前仅支持 Android APK。");
  }
  if (!module) {
    throw new Error(
      "SSH 原生组件未加载。请安装包含最新版本的 Android APK 后使用。",
    );
  }
  return module;
}

function hostFromProfile(profile: RouterProfile) {
  const address = /^https?:\/\//i.test(profile.baseUrl)
    ? profile.baseUrl
    : `http://${profile.baseUrl}`;
  const host = new URL(address).hostname;
  if (!host) throw new Error("无法从 LuCI 管理地址识别 SSH 主机。");
  return host;
}

export function isInAppSshSupported() {
  return Platform.OS === "android";
}

export function getInAppSshTarget(profile: RouterProfile) {
  const host = hostFromProfile(profile);
  const username = profile.sshUsername || profile.username;
  return `${username}@${host}:${profile.sshPort ?? 22}`;
}

/** 返回当前全局应用内 SSH 会话的目标；仅用于同步页面连接状态。 */
export function getInAppSshSessionTarget() {
  return activeSession?.target ?? null;
}

/** 判断当前会话是否已经连接到指定路由器，避免在页面切换时重复断开和重连。 */
export function isInAppSshConnectedFor(profile: RouterProfile) {
  try {
    return activeSession?.target === getInAppSshTarget(profile);
  } catch {
    return false;
  }
}

export async function connectInAppSsh(
  profile: RouterProfile,
  password: string,
) {
  const nativeBridge = bridge();
  const host = hostFromProfile(profile);
  const username = profile.sshUsername || profile.username;
  const port = profile.sshPort ?? 22;
  const target = `${username}@${host}:${port}`;
  if (activeSession?.target === target) {
    return { target, banner: "正在复用已有会话。" };
  }
  if (activeSession) disconnectInAppSsh();
  const key = `openwrt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await nativeBridge.connect(host, port, username, password, key);
  activeSession = { key, target };
  return { target: activeSession.target, banner: "会话已建立。" };
}

export async function runInAppSshCommand(command: string) {
  const nativeBridge = bridge();
  if (!activeSession) throw new Error("尚未连接 SSH。请先建立会话。");
  const normalized = command.trim();
  if (!normalized) throw new Error("请输入要执行的命令。");
  return nativeBridge.execute(activeSession.key, normalized);
}

export async function uploadInAppSshFile(localUri: string, remotePath: string) {
  const nativeBridge = bridge();
  if (!activeSession) throw new Error("尚未连接 SSH。请先建立会话。");
  if (!localUri || !remotePath.startsWith("/"))
    throw new Error("远程上传路径无效。");
  await nativeBridge.uploadFile(activeSession.key, localUri, remotePath);
}

export async function downloadInAppSshFile(
  remotePath: string,
  localUri: string,
) {
  const nativeBridge = bridge();
  if (!activeSession) throw new Error("尚未连接 SSH。请先建立会话。");
  if (!remotePath.startsWith("/") || !localUri.startsWith("file://")) {
    throw new Error("文件下载路径无效。");
  }
  await nativeBridge.downloadFile(activeSession.key, remotePath, localUri);
}

export async function writeInAppSshTextFile(
  content: string,
  remotePath: string,
) {
  const nativeBridge = bridge();
  if (!activeSession) throw new Error("尚未连接 SSH。请先建立会话。");
  if (!remotePath.startsWith("/")) throw new Error("远程写入路径无效。");
  await nativeBridge.writeTextFile(activeSession.key, content, remotePath);
}

export function disconnectInAppSsh() {
  if (!activeSession) return;
  const module = NativeModules.OpenWrtSsh as OpenWrtSshBridge | undefined;
  module?.disconnect(activeSession.key);
  activeSession = null;
}
