import { describe, expect, it } from "vitest";

import { resolveColorScheme } from "../lib/theme-utils";

describe("主题偏好解析", () => {
  it("手动深色选择应覆盖系统浅色模式", () => {
    expect(resolveColorScheme("dark", "light")).toBe("dark");
  });

  it("手动浅色选择应覆盖系统深色模式", () => {
    expect(resolveColorScheme("light", "dark")).toBe("light");
  });

  it("跟随系统时应采用系统当前模式", () => {
    expect(resolveColorScheme("system", "dark")).toBe("dark");
    expect(resolveColorScheme("system", "light")).toBe("light");
  });
});
