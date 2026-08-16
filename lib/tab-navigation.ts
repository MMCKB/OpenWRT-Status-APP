export const DEFAULT_TAB_ORDER = ["index", "routers", "details", "control", "settings"] as const;
export type TabRouteName = (typeof DEFAULT_TAB_ORDER)[number];

export function isTabOrder(value: unknown): value is TabRouteName[] {
  return Array.isArray(value)
    && value.length === DEFAULT_TAB_ORDER.length
    && value.every((item) => typeof item === "string" && DEFAULT_TAB_ORDER.includes(item as TabRouteName))
    && new Set(value).size === DEFAULT_TAB_ORDER.length;
}

export function reorderTabOrder(order: TabRouteName[], sourceIndex: number, targetIndex: number): TabRouteName[] {
  if (!isTabOrder(order)) return [...DEFAULT_TAB_ORDER];
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex >= order.length || targetIndex >= order.length) return [...order];
  if (sourceIndex === targetIndex) return [...order];

  const nextOrder = [...order];
  const [movedRoute] = nextOrder.splice(sourceIndex, 1);
  if (!movedRoute) return [...order];
  nextOrder.splice(targetIndex, 0, movedRoute);
  return nextOrder;
}
