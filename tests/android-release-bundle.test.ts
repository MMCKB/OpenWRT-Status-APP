import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const gradlePath = resolve(projectRoot, "android/app/build.gradle");
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

describe("Android Release JavaScript bundle", () => {
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
  });

  it("当前源码包含服务与密码显示功能，且不含预测性返回手势设置入口", () => {
    const routerForm = readFileSync(routerFormPath, "utf8");
    const wirelessManager = readFileSync(wirelessManagerPath, "utf8");
    const serviceHealth = readFileSync(serviceHealthPath, "utf8");
    const servicesTab = readFileSync(servicesTabPath, "utf8");
    const serviceConfig = readFileSync(serviceConfigPath, "utf8");

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
    expect(serviceConfig).toContain("buildPluginConfigSnapshotCommand");
    expect(serviceConfig).toContain("buildPluginConfigApplyCommand");
    expect(serviceConfig).not.toContain("buildProxyServiceConfigUrl");
    expect(
      routerForm +
        wirelessManager +
        serviceHealth +
        servicesTab +
        serviceConfig,
    ).not.toContain("预测性返回手势");
  });
});
