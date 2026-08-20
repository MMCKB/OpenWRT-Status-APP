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
const hapticTabPath = resolve(projectRoot, "components/haptic-tab.tsx");
const rootLayoutPath = resolve(projectRoot, "app/_layout.tsx");
const splashLoaderPath = resolve(projectRoot, "components/splash-loader.tsx");
const iconSymbolPath = resolve(projectRoot, "components/ui/icon-symbol.tsx");
const startupErrorBoundaryPath = resolve(
  projectRoot,
  "components/startup-error-boundary.tsx",
);
const gitignorePath = resolve(projectRoot, ".gitignore");
const wirelessManagerPath = resolve(projectRoot, "app/wireless-manager.tsx");
const serviceHealthPath = resolve(projectRoot, "app/services-health.tsx");
const servicesTabPath = resolve(projectRoot, "app/(tabs)/services.tsx");
const serviceConfigPath = resolve(projectRoot, "app/service-config.tsx");
const systemAdminPath = resolve(projectRoot, "app/system-admin.tsx");
const luciThemePath = resolve(projectRoot, "app/luci-theme.tsx");
const firewallPath = resolve(projectRoot, "app/firewall.tsx");
const settingsPath = resolve(projectRoot, "app/(tabs)/settings.tsx");
const mainActivityPath = resolve(
  projectRoot,
  "android/app/src/main/java/com/app/openwrtstatusapp/MainActivity.kt",
);
const mainApplicationPath = resolve(
  projectRoot,
  "android/app/src/main/java/com/app/openwrtstatusapp/MainApplication.kt",
);
const sshPluginPath = resolve(projectRoot, "plugins/with-openwrt-ssh.js");
const sshPackagePath = resolve(
  projectRoot,
  "android/app/src/main/java/com/openwrtstatus/ssh/OpenWrtSshPackage.java",
);
const natModulePath = resolve(
  projectRoot,
  "android/app/src/main/java/com/openwrtstatus/ssh/OpenWrtNatModule.java",
);
const nativeNatPath = resolve(projectRoot, "lib/native-nat.ts");
const routerProviderPath = resolve(projectRoot, "lib/router-provider.tsx");
const packagesPath = resolve(projectRoot, "app/packages.tsx");
const diagnosticsPath = resolve(projectRoot, "app/diagnostics.tsx");
const performanceBenchmarkPath = resolve(
  projectRoot,
  "app/performance-benchmark.tsx",
);

describe("Android Release JavaScript bundle", () => {
  it("保持 Expo 与 Gradle 的 Android 发布版本一致", () => {
    const expoConfig = readFileSync(expoConfigPath, "utf8");
    const gradle = readFileSync(gradlePath, "utf8");
    const expoVersion = expoConfig.match(/version:\s*"([0-9.]+)"/)?.[1];
    const expoVersionCode = expoConfig.match(/versionCode:\s*(\d+)/)?.[1];
    const gradleVersion = gradle.match(/versionName\s+"([0-9.]+)"/)?.[1];
    const gradleVersionCode = gradle.match(/versionCode\s+(\d+)/)?.[1];

    expect(expoVersion).toBe("1.0.33");
    expect(expoVersion).toBe(gradleVersion);
    expect(expoVersionCode).toBe("29");
    expect(expoVersionCode).toBe(gradleVersionCode);
  });

  it("仅将 debug 视为可调试变体，确保 release 从当前源码重新打包", () => {
    const gradle = readFileSync(gradlePath, "utf8");
    expect(gradle).toMatch(/debuggableVariants\s*=\s*\["debug"\]/);
    expect(gradle).not.toMatch(
      /debuggableVariants\s*=\s*\["debug",\s*"release"\]/,
    );
  });

  it("通过 Expo Router 兼容入口使用导航 API，避免 SDK 57 发布打包被直接导入拦截", () => {
    const routerForm = readFileSync(routerFormPath, "utf8");
    const hapticTab = readFileSync(hapticTabPath, "utf8");

    expect(routerForm).toContain('from "expo-router/react-navigation"');
    expect(routerForm).not.toContain('from "@react-navigation/');
    expect(hapticTab).toContain('from "expo-router/js-tabs"');
    expect(hapticTab).toContain('from "expo-router/react-navigation"');
    expect(hapticTab).not.toContain('from "@react-navigation/');
  });

  it("在 Android 上禁用会触发 React Native 0.86 Fabric 断言的栈转场动画", () => {
    const rootLayout = readFileSync(rootLayoutPath, "utf8");

    expect(rootLayout).toContain(
      'animation: Platform.OS === "android" ? "none" : "default"',
    );
  });

  it("启动链路不在模块加载时预加载字体或调用 Splash API，并由错误边界保护渲染失败", () => {
    const rootLayout = readFileSync(rootLayoutPath, "utf8");
    const splashLoader = readFileSync(splashLoaderPath, "utf8");
    const iconSymbol = readFileSync(iconSymbolPath, "utf8");
    const startupErrorBoundary = readFileSync(startupErrorBoundaryPath, "utf8");

    expect(rootLayout).toContain("StartupErrorBoundary");
    expect(splashLoader).not.toContain("preventAutoHideAsync");
    expect(splashLoader).not.toContain("useFonts");
    expect(iconSymbol).not.toContain("useFonts");
    expect(startupErrorBoundary).toContain("getDerivedStateFromError");
  });

  it("Android 16 原生启动隔离包不注册手写 SSH/NAT ReactPackage", () => {
    const mainApplication = readFileSync(mainApplicationPath, "utf8");
    const sshPlugin = readFileSync(sshPluginPath, "utf8");

    expect(mainApplication).not.toContain("OpenWrtSshPackage");
    expect(mainApplication).not.toContain("add(OpenWrtSshPackage())");
    expect(sshPlugin).toContain("const CUSTOM_NATIVE_BRIDGE_ENABLED = false");
  });

  it("不允许原生构建报告进入 Expo Router 的 app 路由目录", () => {
    const gitignore = readFileSync(gitignorePath, "utf8");

    expect(existsSync(resolve(projectRoot, "app/build"))).toBe(false);
    expect(gitignore).toContain("/app/build/");
  });

  it("不保留会覆盖新源码的预构建 bundle，并在 CI 中拒绝这类文件", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const gradle = readFileSync(gradlePath, "utf8");
    expect(existsSync(obsoleteBundlePath)).toBe(false);
    expect(workflow).toContain(
      "test ! -e android/app/src/main/assets/index.android.bundle",
    );
    expect(workflow).toContain('grep -aF "PassWall2" >/dev/null');
    expect(workflow).toContain('grep -aF "visibility-off" >/dev/null');
    expect(workflow).not.toContain("grep -aqF");
    expect(workflow).toContain("Restore stable Android release keystore");
    expect(workflow).toContain("ANDROID_RELEASE_KEYSTORE_B64");
    expect(workflow).toContain("android/app/openwrt-status-release.keystore");
    expect(workflow).toContain('--ks-key-alias "$ANDROID_RELEASE_KEY_ALIAS"');
    expect(workflow).not.toContain("Generate temporary CI debug keystore");
    expect(workflow).not.toContain("android/app/debug.keystore");
    expect(gradle).toContain("signingConfig signingConfigs.release");
    expect(gradle).toContain("openwrt-status-release.keystore");
    expect(gradle).toContain("ANDROID_RELEASE_KEYSTORE_PASSWORD");
  });

  it("当前源码包含服务、管理权扩展和密码显示，并允许 Android 16 最小包隔离原生桥接", () => {
    const routerForm = readFileSync(routerFormPath, "utf8");
    const wirelessManager = readFileSync(wirelessManagerPath, "utf8");
    const serviceHealth = readFileSync(serviceHealthPath, "utf8");
    const servicesTab = readFileSync(servicesTabPath, "utf8");
    const serviceConfig = readFileSync(serviceConfigPath, "utf8");
    const systemAdmin = readFileSync(systemAdminPath, "utf8");
    const luciTheme = readFileSync(luciThemePath, "utf8");
    const firewall = readFileSync(firewallPath, "utf8");
    const mainActivity = readFileSync(mainActivityPath, "utf8");
    const nativeNat = readFileSync(nativeNatPath, "utf8");
    const routerProvider = readFileSync(routerProviderPath, "utf8");
    const sshPlugin = readFileSync(sshPluginPath, "utf8");

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
    expect(systemAdmin).not.toContain("定时重启");
    expect(systemAdmin).toContain("计划任务");
    expect(systemAdmin).toContain("路由器密码");
    expect(systemAdmin).toContain("APK 仓库公钥");
    expect(systemAdmin).toContain("LuCI HTTP/HTTPS 服务");
    expect(systemAdmin).toContain("新增 SSH 实例");
    expect(systemAdmin).toContain("GatewayPorts");
    expect(systemAdmin).toContain("从文件导入");
    expect(systemAdmin).not.toContain("LuCI 主题");
    expect(luciTheme).toContain("LuCI 主题");
    expect(luciTheme).toContain("buildLuciThemesSnapshotCommand");
    expect(systemAdmin).toContain("挂载已连接设备");
    expect(systemAdmin).toContain("已挂载的文件系统");
    expect(systemAdmin).toContain("自定义闪烁间隔");
    expect(systemAdmin).not.toContain("颜色");
    expect(systemAdmin).toContain("buildFetchApkRepositoryKeyCommand");
    expect(systemAdmin).toContain("网络设备");
    expect(systemAdmin).toContain("全局网络设置");
    expect(systemAdmin).toContain("链路在线");
    expect(firewall).toContain("通信规则");
    expect(readFileSync(settingsPath, "utf8")).not.toContain("预测性返回手势");
    expect(existsSync(resolve(projectRoot, "lib/native-back-gesture.ts"))).toBe(
      false,
    );
    expect(
      existsSync(
        resolve(
          projectRoot,
          "android/app/src/main/java/com/openwrtstatus/ssh/OpenWrtBackGestureModule.java",
        ),
      ),
    ).toBe(false);
    expect(mainActivity).not.toContain("setPredictiveBackEnabled");
    expect(routerProvider).not.toContain("predictiveBackEnabled");
    const nativeBridgeIsolated = sshPlugin.includes(
      "const CUSTOM_NATIVE_BRIDGE_ENABLED = false",
    );
    if (nativeBridgeIsolated) {
      expect(existsSync(sshPackagePath)).toBe(false);
      expect(existsSync(natModulePath)).toBe(false);
      expect(sshPlugin).toContain("fs.rmSync(destination");
      const manifest = readFileSync(
        resolve(projectRoot, "android/app/src/main/AndroidManifest.xml"),
        "utf8",
      );
      expect(manifest).not.toContain("android.app.shortcuts");
      expect(
        existsSync(
          resolve(
            projectRoot,
            "android/app/src/main/res/xml/openwrt_status_shortcuts.xml",
          ),
        ),
      ).toBe(false);
    } else {
      const sshPackage = readFileSync(sshPackagePath, "utf8");
      const natModule = readFileSync(natModulePath, "utf8");
      expect(sshPackage).toContain("new OpenWrtNatModule(reactContext)");
      expect(sshPackage).toContain(
        "Unable to initialize OpenWrt native modules",
      );
      expect(natModule).toContain('return "OpenWrtNat"');
      expect(natModule).toContain("stun.l.google.com");
    }
    expect(nativeNat).toContain("detectPhoneNat");
    expect(nativeNat).not.toContain("native-ssh");
    expect(routerProvider).toContain("已有同名路由器，请使用不同的名称。");
  });

  it("保留 v1.0.26 的 LuCI 兼容配置与诊断可用性修复", () => {
    const packages = readFileSync(packagesPath, "utf8");
    const diagnostics = readFileSync(diagnosticsPath, "utf8");
    const performance = readFileSync(performanceBenchmarkPath, "utf8");
    const serviceHealth = readFileSync(serviceHealthPath, "utf8");
    const systemAdmin = readFileSync(systemAdminPath, "utf8");
    const wirelessManager = readFileSync(wirelessManagerPath, "utf8");

    expect(packages).toContain("customfeeds.list");
    expect(packages).toContain("distfeeds.list");
    expect(wirelessManager).toContain("绑定网络");
    expect(wirelessManager).toContain("加密方式");
    expect(systemAdmin).toContain("netdevDevice");
    expect(systemAdmin).toContain("自定义闪烁间隔");
    expect(systemAdmin).toContain("防火墙设置");
    expect(systemAdmin).toContain("forceLink");
    expect(diagnostics).toContain("diagnosticOutputDisplay");
    expect(diagnostics).toContain("NAT 类型检测");
    expect(performance).toContain("直接读取路由器本机 CPU");
    expect(serviceHealth).toContain("最近 100 行内未找到可显示的日志。");
  });
});
