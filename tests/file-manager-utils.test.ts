import { describe, expect, it } from "vitest";

import { filterFileEntries, sortFileEntries } from "../lib/file-manager-utils";

const entries = [
  { name: "zeta.log", path: "/zeta.log", kind: "file" as const, mode: "644", size: 80, modifiedAt: "2026-08-15 09:00" },
  { name: "config", path: "/config", kind: "directory" as const, mode: "755", size: null, modifiedAt: "2026-08-12 09:00" },
  { name: "alpha.conf", path: "/alpha.conf", kind: "file" as const, mode: "644", size: 240, modifiedAt: "2026-08-16 09:00" },
];

describe("file manager list utilities", () => {
  it("filters file names without changing source data", () => {
    expect(filterFileEntries(entries, "CONF").map((entry) => entry.name)).toEqual(["config", "alpha.conf"]);
    expect(entries).toHaveLength(3);
  });

  it("keeps folders first while sorting files by requested field", () => {
    expect(sortFileEntries(entries, "name").map((entry) => entry.name)).toEqual(["config", "alpha.conf", "zeta.log"]);
    expect(sortFileEntries(entries, "size").map((entry) => entry.name)).toEqual(["config", "alpha.conf", "zeta.log"]);
    expect(sortFileEntries(entries, "modified").map((entry) => entry.name)).toEqual(["config", "alpha.conf", "zeta.log"]);
  });
});
