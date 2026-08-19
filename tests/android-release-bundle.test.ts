import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const gradlePath = resolve(projectRoot, "android/app/build.gradle");
const expoConfigPath = resolve(projectRoot, "app.config.ts");
const workflowPath = resolve(
  projectRoot,
  ".github/workflows/build-android.yml",
);
const obsoleteBundlePath = resolve(
  projectRoot,
  "android/app/src/main/assets/index.android.bundle",
);
const routerFormPath = resolve(projectRoot, "app/(tabs)/router-form.tsx");
const wirelessManagerPath = resolve(projectRoot, "app/wireless-manager.tsx");
const serviceHealthPath = resolve(projectRoot, "app/services-health.tsx");
const servicesTabPath = resolve(projectRoot, "app/(tabs)/services.tsx");
const serviceConfigPath = resolve(projectRoot, "app/service-config.tsx");
const systemAdminPath = resolve(projectRoot, "app/system-admin.tsx");
const firewallPath = resolve(projectRoot, "app/firewall.tsx");
const settingsPath = resolve(projectRoot, "app/(tabs)/settings.tsx");
const backGestureModulePath = resolve(
  projectRoot,
  "android/app/src/main/java/com/openwrtstatus/ssh/OpenWrtBackGestureModule.java",
);
const mainActivityPath = resolve(
  projectRoot,
  "android/app/src/main/java/com/app/openwrtstatusapp/MainActivity.kt",
);
const routerProviderPath = resolve(projectRoot, "lib/router-provider.tsx");

describe("Android Release JavaScript bundle", () => {
  it("保持 Expo 与 Gradle 的 Android 发布版本一致", () => {
    const expoConfig = readFileSync(expoConfigPath, "utf8");
    const gradle = readFileSync(gradlePath, "utf8");
    const expoVersion = expoConfig.match(/version:\s*"([0-9.]+)"/)?.[1];
    const expoVersionCode = expoConfig.match(/versionCode:\s*(\d+)/)?.[1];
    const gradleVersion = gradle.match(/versionName\s+"([0-9.]+)"/)?.[1];
    const gradleVersionCode = gradle.match(/versionCode\s+(\d+)/)?.[1];

    expect(expoVersion).toBe("1.0.23");
    expect(expoVersion).toBe(gradleVersion);
    expect(expoVersionCode).toBe("19");
    expect(expoVersionCode).toBe(gradleVersionCode);
  });

  it("仅将 debug 视为可调试变体，确保 release 从当前源码重新打包", () => {
    const gradle = readFileSync(gradlePath, "utf8");
    expect(gradle).toMatch(/debuggableVariants\s*=\s*\["debug"\]/);
    expect(gradle).not.toMatch(
      /debuggableVariants\s*=\s*\["debug",\s*"release"\]/,
    );
  });

  it("不保留会覆盖新源码的预构建 bundle，并在 CI 中拒绝这类文件", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    expect(existsSync(obsoleteBundlePath)).toBe(false);
    expect(workflow).toContain(
      "test ! -e android/app/src/main/assets/index.android.bundle",
    );
    expect(workflow).toContain('grep -aF "PassWall2"');
    expect(workflow).toContain('grep -aF "visibility-off"');
    expect(workflow).toContain('grep -aF "预测性返回手势"');
    expect(workflow).not.toContain(
      '! unzip -p "$FINAL_APK" assets/index.android.bundle | grep -aF "预测性返回手势"',
    );
    expect(workflow).toContain('grep -F "setPredictiveBackEnabled"');
  });

  it("当前源码包含服务、密码显示与可控制的预测性返回手势", () => {
    const routerForm = readFileSync(routerFormPath, "utf8");
    const wirelessManager = readFileSync(wirelessManagerPath, "utf8");
    const serviceHealth = readFileSync(serviceHealthPath, "utf8");
    const servicesTab = readFileSync(servicesTabPath, "utf8");
    const serviceConfig = readFileSync(serviceConfigPath, "utf8");
    const systemAdmin = readFileSync(systemAdminPath, "utf8");
    const firewall = readFileSync(firewallPath, "utf8");
    const settings = readFileSync(settingsPath, "utf8");
    const backGestureModule = readFileSync(backGestureModulePath, "utf8");
    const mainActivity = readFileSync(mainActivityPath, "utf8");
    const routerProvider = readFileSync(routerProviderPath, "utf8");

    expect(routerForm).toContain("isPasswordVisible");
    expect(routerForm).toContain("isSshPasswordVisible");
    expect(routerForm).toContain('setName("")');
    expect(routerForm).toContain('setAddress("")');
    expect(wirelessManager).toContain("isGuestPasswordVisible");
    expect(serviceHealth).toContain("PassWall2");
    expect(servicesTab).toContain(
      'export { default } from "../services-health"',
    );
    expect(serviceHealth).toContain('title="服务与健康"');
    expect(serviceConfig).toContain("buildPluginSettingsSnapshotCommand");
    expect(serviceConfig).toContain("buildPluginSettingsApplyCommand");
    expect(serviceConfig).not.toContain("buildProxyServiceConfigUrl");
    expect(serviceConfig).toContain("完整服务设置");
    expect(wirelessManager).toContain("加密方式");
    expect(systemAdmin).toContain("定时重启");
    expect(systemAdmin).toContain("计划任务");
    expect(systemAdmin).toContain("路由器密码");
    expect(systemAdmin).toContain("APK 仓库公钥");
    expect(systemAdmin).toContain("LuCI HTTP/HTTPS 服务");
    expect(systemAdmin).toContain("网络设备");
    expect(systemAdmin).toContain("全局网络设置");
    expect(systemAdmin).toContain("链路在线");
    expect(firewall).toContain("通信规则");
    expect(settings).toContain("预测性返回手势");
    expect(backGestureModule).toContain("OpenWrtBackGesture");
    expect(backGestureModule).toContain("predictive-back-enabled");
    expect(mainActivity).toContain("setPredictiveBackEnabled");
    expect(mainActivity).toContain("OnBackInvokedCallback");
    expect(mainActivity).toContain("PRIORITY_DEFAULT");
    expect(mainActivity).toContain("onBackPressedDispatcher.onBackPressed()");
    expect(mainActivity).toContain("override fun onResume()");
    expect(mainActivity).toContain("override fun onDestroy()");
    expect(routerProvider).toMatch(
      /setPredictiveBackEnabled\(\s*savedSettings\.predictiveBackEnabled\s*,?\s*\)/,
    );
    expect(routerProvider).toContain("已有同名路由器，请使用不同的名称。");
  });
});
