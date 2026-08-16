import { describe, expect, it } from "vitest";

import { getTabIndexForOffset, getTabIndicatorX } from "../lib/tab-navigation";

describe("tab drag selection", () => {
  it("maps the finger position to the matching page slot", () => {
    expect(getTabIndexForOffset(-12, 64, 5)).toBe(0);
    expect(getTabIndexForOffset(10, 64, 5)).toBe(0);
    expect(getTabIndexForOffset(130, 64, 5)).toBe(2);
    expect(getTabIndexForOffset(500, 64, 5)).toBe(4);
  });

  it("keeps the liquid selection capsule inside the rail", () => {
    expect(getTabIndicatorX(32, 64, 320)).toBe(4);
    expect(getTabIndicatorX(160, 64, 320)).toBe(132);
    expect(getTabIndicatorX(500, 64, 320)).toBe(260);
  });
});
