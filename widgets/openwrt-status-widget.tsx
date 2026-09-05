import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { HexColor } from "react-native-android-widget";

import type { OpenWrtWidgetView } from "@/lib/widget-bridge";

/** 桌面小组件:路由器在线状态 + 实时速率。点击主体打开应用,点击刷新按钮触发刷新。 */
export function OpenWrtStatusWidget({ view }: { view: OpenWrtWidgetView }) {
  const dark = view.kind === "ok" && view.online;
  const background: HexColor = (dark ? "#0A0F14EE" : "#F6F5F1EE") as HexColor;
  const foreground: HexColor = (dark ? "#E8EEF5" : "#1A1C1E") as HexColor;
  const muted: HexColor = (dark ? "#8FA3B8" : "#6B7280") as HexColor;
  const accent: HexColor = (view.kind === "ok" && view.online
    ? "#22C55E"
    : view.kind === "offline"
      ? "#EF4444"
      : "#9CA3AF") as HexColor;
  const link: HexColor = (dark ? "#9CC4F4" : "#0B6BCB") as HexColor;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: background,
        borderRadius: 18,
        padding: 12,
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <FlexWidget style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "match_parent" }}>
        <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
          <FlexWidget style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: accent, marginRight: 6 }} />
          <TextWidget
            text={view.kind === "no-router" ? "OpenWrt 状态" : view.routerName}
            style={{ fontSize: 13, fontWeight: "800", color: foreground }}
          />
        </FlexWidget>
        <FlexWidget
          clickAction="REFRESH"
          style={{ backgroundColor: (dark ? "#1B2836" : "#E8E6E0") as HexColor, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3 }}
        >
          <TextWidget text="刷新" style={{ fontSize: 10, fontWeight: "800", color: link }} />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", width: "match_parent", marginTop: 4 }}>
        <TextWidget
          text={view.kind === "no-router" ? "添加路由器后在此查看状态" : view.online ? view.hostname || "在线" : `离线 · ${view.hostname || "无法连接"}`}
          style={{ fontSize: view.kind === "no-router" ? 11 : 15, fontWeight: "800", color: view.online ? foreground : muted }}
        />
        {view.kind !== "no-router" ? (
          <TextWidget text={view.online ? "在线" : "离线"} style={{ fontSize: 10, fontWeight: "800", color: accent }} />
        ) : null}
      </FlexWidget>

      {view.kind !== "no-router" ? (
        <FlexWidget style={{ flexDirection: "row", justifyContent: "space-between", width: "match_parent", marginTop: 6 }}>
          <TextWidget
            text={`↓ ${view.rxRate ?? "等待采样"}   ↑ ${view.txRate ?? "等待采样"}`}
            style={{ fontSize: 11, fontWeight: "700", color: link }}
          />
          <TextWidget
            text={view.memoryPercent != null ? `内存 ${view.memoryPercent}%` : ""}
            style={{ fontSize: 10, color: muted }}
          />
        </FlexWidget>
      ) : null}
      {view.updatedAt ? (
        <TextWidget text={`更新于 ${view.updatedAt}`} style={{ fontSize: 9, color: muted }} />
      ) : null}
    </FlexWidget>
  );
}
