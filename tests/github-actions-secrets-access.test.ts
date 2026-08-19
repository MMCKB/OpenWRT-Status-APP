import { describe, expect, it } from "vitest";

const repository = "MMCKB/OpenWRT-Status-APP";

describe("GitHub Actions Secrets 权限", () => {
  it("可读取仓库 Actions Secrets 的公钥以安全配置稳定 APK 签名", async () => {
    const token = process.env.GITHUB_ACTIONS_SECRETS_PAT;
    expect(token).toBeTruthy();

    const response = await fetch(
      `https://api.github.com/repos/${repository}/actions/secrets/public-key`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      key_id?: string;
      key?: string;
    };
    expect(payload.key_id).toBeTruthy();
    expect(payload.key).toBeTruthy();
  });
});
