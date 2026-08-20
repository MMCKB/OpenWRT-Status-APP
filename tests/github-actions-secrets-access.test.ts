import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("GitHub Actions Secrets 权限", () => {
  it("稳定 APK 签名仅从 GitHub Actions Secrets 恢复，且不依赖个人访问令牌", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/build-android.yml"),
      "utf8",
    );

    expect(workflow).toContain("secrets.ANDROID_RELEASE_KEYSTORE_B64");
    expect(workflow).toContain("secrets.ANDROID_RELEASE_KEYSTORE_PASSWORD");
    expect(workflow).toContain("secrets.ANDROID_RELEASE_KEY_PASSWORD");
    expect(workflow).toContain("secrets.ANDROID_RELEASE_KEY_ALIAS");
    expect(workflow).not.toContain("GITHUB_ACTIONS_SECRETS_PAT");
  });
});
