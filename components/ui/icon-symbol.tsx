import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFonts } from "expo-font";
import type { SymbolWeight } from "expo-symbols";
import type { ComponentProps } from "react";
import type { OpaqueColorValue, StyleProp, TextStyle } from "react-native";

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];

const MAPPING: Record<string, MaterialIconName> = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "gauge.with.dots.needle.50percent": "speed",
  wifi: "wifi",
  "list.bullet.rectangle": "format-list-bulleted",
  "gearshape.fill": "settings",
  "terminal.fill": "terminal",
  "folder.fill": "folder",
  "doc.text.fill": "description",
  "arrow.up.arrow.down": "swap-vert",
  network: "router",
  cpu: "memory",
  memorychip: "storage",
  "shield.fill": "security",
  "lock.fill": "lock",
  "arrow.clockwise": "refresh",
  "slider.horizontal.3": "tune",
  qrcode: "qr-code",
  "qrcode.viewfinder": "qr-code-scanner",
  "waveform.path.ecg": "show-chart",
  "xmark.circle.fill": "cancel",
  "checkmark.circle.fill": "check-circle",
  "exclamationmark.triangle.fill": "warning",
  "info.circle.fill": "info",
  "plus.circle.fill": "add-circle",
  "trash.fill": "delete",
  "square.and.arrow.up": "share",
  "square.and.arrow.down": "download",
  pencil: "edit",
  "eye.fill": "visibility",
  "eye.slash.fill": "visibility-off",
  power: "power-settings-new",
  "play.fill": "play-arrow",
  "stop.fill": "stop",
  restart: "restart-alt",
  "server.rack": "dns",
  "doc.on.doc": "content-copy",
  magnifyingglass: "search",
  "arrow.up": "arrow-upward",
  "arrow.down": "arrow-downward",
  gear: "settings",
  "wrench.and.screwdriver": "build",
  "chart.bar.fill": "bar-chart",
  "list.clipboard": "assignment",
  "tray.full.fill": "all-inbox",
  "slider.vertical.3": "tune",
  "network.badge.shield.half.filled": "network-check",
  "wifi.slash": "wifi-off",
  "dot.radiowaves.left.and.right": "wifi-tethering",
  desktopcomputer: "computer",
  iphone: "smartphone",
  laptopcomputer: "laptop",
  "tv.fill": "tv",
  "gamecontroller.fill": "sports-esports",
  "ellipsis.circle.fill": "more-vert",
};

const materialFont = (MaterialIcons.font as Record<string, unknown>).material;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: string;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const [fontLoaded] = useFonts({ material: materialFont as never });
  const mappedName = MAPPING[name] ?? (name as MaterialIconName);
  const iconName = Object.prototype.hasOwnProperty.call(MaterialIcons.glyphMap, mappedName)
    ? mappedName
    : "help-outline";

  if (!fontLoaded) return null;
  return <MaterialIcons color={color} size={size} name={iconName} style={style} />;
}
