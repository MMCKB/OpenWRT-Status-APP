export const DEFAULT_TAB_ORDER = ["index", "routers", "details", "control", "settings"] as const;
export const TAB_ROUTE_NAMES = ["index", "routers", "details", "control", "settings"] as const;

export type TabRouteName = (typeof TAB_ROUTE_NAMES)[number];

function clamp(value: number, minimum: number, maximum: number) {
  "worklet";
  return Math.max(minimum, Math.min(maximum, value));
}

/** Maps a finger position in the tab rail to the page represented by that position. */
export function getTabIndexForOffset(offsetX: number, tabWidth: number, tabCount: number) {
  "worklet";
  if (tabWidth <= 0 || tabCount <= 0) return 0;
  return clamp(Math.floor(offsetX / tabWidth), 0, tabCount - 1);
}

/** Keeps the liquid selection capsule centered below the finger without leaving the rail. */
export function getTabIndicatorX(pointerX: number, tabWidth: number, contentWidth: number) {
  "worklet";
  const indicatorWidth = Math.max(0, tabWidth - 8);
  const minimum = 4;
  const maximum = Math.max(minimum, contentWidth - indicatorWidth - 4);
  return clamp(pointerX - indicatorWidth / 2, minimum, maximum);
}
