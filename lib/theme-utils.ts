import type { ColorScheme } from "@/constants/theme";

export type ThemePreference = "system" | ColorScheme;

export function resolveColorScheme(preference: ThemePreference, systemScheme: ColorScheme): ColorScheme {
  return preference === "system" ? systemScheme : preference;
}
