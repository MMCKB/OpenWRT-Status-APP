import { useMemo } from "react";
import { useColors } from "@/hooks/use-colors";

type StyleRecord = Record<string, Record<string, unknown>>;

const DARK_COLOR_MAP: Record<string, keyof ReturnType<typeof useColors>> = {
  "#F6F8FA": "background",
  "#FFFFFF": "surface",
  "#EAF1F5": "surface",
  "#EEF3F6": "surface",
  "#E6F5F4": "surface",
  "#EAF8F6": "surface",
  "#F0FAF8": "surface",
  "#E8F7F1": "surface",
  "#203B55": "foreground",
  "#102A43": "foreground",
  "#304B64": "foreground",
  "#466075": "muted",
  "#5B6B7D": "muted",
  "#60758B": "muted",
  "#718398": "muted",
  "#8B9AA8": "muted",
  "#91A5B3": "muted",
  "#A0AFBA": "muted",
  "#DDE7E9": "border",
  "#D8E2E8": "border",
  "#E4EAEE": "border",
  "#CFE5E3": "border",
  "#C5D2D9": "border",
  "#EEF2F4": "border",
  "#007E7A": "primary",
  "#B13939": "error",
  "#A43131": "error",
  "#FDEBEC": "error",
  "#FFF0F0": "error",
  "#FFF3D9": "warning",
  "#F0D59A": "warning",
  "#9A6500": "warning",
  "#A96D00": "warning",
  "#7E5200": "warning",
  "#805B16": "warning",
  "#855D14": "warning",
  "#785000": "warning",
};

/**
 * Keeps legacy StyleSheet-based management pages readable in dark mode while
 * preserving their current light-mode appearance. New page code should use
 * runtime theme tokens directly; this adapter safely covers existing screens.
 */
export function useThemedStyles<T extends StyleRecord>(baseStyles: T): T {
  const colors = useColors();
  const isDark = colors.background !== "#ffffff";

  return useMemo(() => {
    if (!isDark) return baseStyles;
    return Object.fromEntries(
      Object.entries(baseStyles).map(([name, style]) => [
        name,
        Object.fromEntries(
          Object.entries(style).map(([key, value]) => {
            if (typeof value !== "string") return [key, value];
            if (key === "color" && value === "#FFFFFF") return [key, value];
            const token = DARK_COLOR_MAP[value];
            return [key, token ? colors[token] : value];
          }),
        ),
      ]),
    ) as T;
  }, [baseStyles, colors, isDark]);
}
