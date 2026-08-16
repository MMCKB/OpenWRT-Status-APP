import { describe, expect, it } from "vitest";

import { DEFAULT_TAB_ORDER, isTabOrder, reorderTabOrder } from "../lib/tab-navigation";

describe("tab navigation ordering", () => {
  it("accepts only a complete unique set of supported routes", () => {
    expect(isTabOrder([...DEFAULT_TAB_ORDER])).toBe(true);
    expect(isTabOrder(["index", "routers"])).toBe(false);
    expect(isTabOrder(["index", "routers", "details", "control", "invalid"])).toBe(false);
    expect(isTabOrder(["index", "routers", "details", "control", "control"])).toBe(false);
  });

  it("moves a dragged tab to its release position without changing other routes", () => {
    expect(reorderTabOrder([...DEFAULT_TAB_ORDER], 0, 3)).toEqual(["routers", "details", "control", "index", "settings"]);
    expect(reorderTabOrder([...DEFAULT_TAB_ORDER], 4, 1)).toEqual(["index", "settings", "routers", "details", "control"]);
  });

  it("keeps the current order when the drag ends at its source or outside the tab range", () => {
    expect(reorderTabOrder([...DEFAULT_TAB_ORDER], 2, 2)).toEqual([...DEFAULT_TAB_ORDER]);
    expect(reorderTabOrder([...DEFAULT_TAB_ORDER], 1, 8)).toEqual([...DEFAULT_TAB_ORDER]);
  });
});
