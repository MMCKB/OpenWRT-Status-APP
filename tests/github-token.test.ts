import { describe, expect, it } from "vitest";

const targetRepository = "MMCKB/OpenWRT-Status-APP";

describe("GitHub repository credential", () => {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    it.skip("需要在受控环境中提供 GITHUB_TOKEN", () => {});
    return;
  }

  it("可访问目标仓库且不输出令牌", async () => {
    const response = await fetch(`https://api.github.com/repos/${targetRepository}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    expect(response.status).toBe(200);
    const repository = (await response.json()) as { full_name?: string };
    expect(repository.full_name).toBe(targetRepository);
  });
});
