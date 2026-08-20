import { describe, expect, it } from "vitest";

import {
  buildChmodCommand,
  buildCopyCommand,
  buildListDirectoryCommand,
  buildRenameCommand,
  joinRemotePath,
  normalizeRemotePath,
  parseDirectoryEntries,
  parseReadableText,
  shellQuote,
} from "../lib/router-file-commands";

describe("router file command helpers", () => {
  it("规范化绝对路径并拒绝相对路径", () => {
    expect(normalizeRemotePath("/etc//config/../dropbear")).toBe("/etc/dropbear");
    expect(() => normalizeRemotePath("etc/config")).toThrow("必须以 / 开头");
    expect(() => joinRemotePath("/etc", "../passwd")).toThrow("不能包含 /");
  });

  it("对含单引号的路径进行 shell 安全引用", () => {
    expect(shellQuote("/tmp/it's.conf")).toBe("'/tmp/it'\\''s.conf'");
    expect(buildRenameCommand("/tmp/old file", "new's file")).toBe("mv '/tmp/old file' '/tmp/new'\\''s file'");
  });

  it("生成目录浏览与文件复制命令", () => {
    expect(buildListDirectoryCommand("/etc")).toContain("dir='/etc'");
    expect(buildListDirectoryCommand("/etc")).toContain("stat -c %a");
    expect(buildCopyCommand("/etc/config/network", "/tmp")).toBe("cp -Rp '/etc/config/network' '/tmp'");
  });

  it("解析目录清单并将文件夹排在前面", () => {
    const entries = parseDirectoryEntries("network\tf\t644\t500\t2026-08-01 08:00\nconfig\td\t755\t0\t2026-08-02 09:00", "/etc");
    expect(entries).toEqual([
      { name: "config", path: "/etc/config", kind: "directory", mode: "755", size: 0, modifiedAt: "2026-08-02 09:00" },
      { name: "network", path: "/etc/network", kind: "file", mode: "644", size: 500, modifiedAt: "2026-08-01 08:00" },
    ]);
  });

  it("识别过大的文本文件并验证 chmod 模式", () => {
    expect(parseReadableText("__MANUS_FILE_TOO_LARGE__:70000")).toEqual({ content: null, tooLargeBytes: 70000 });
    expect(buildChmodCommand("/etc/config/network", "0644")).toBe("chmod 0644 '/etc/config/network'");
    expect(() => buildChmodCommand("/etc/config/network", "7777x")).toThrow("权限必须为");
  });
});
