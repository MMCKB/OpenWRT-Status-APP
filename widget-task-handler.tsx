import type { WidgetTaskHandlerProps } from "react-native-android-widget";

import { OpenWrtStatusWidget } from "./widgets/openwrt-status-widget";
import { buildOpenWrtWidgetView } from "./lib/widget-bridge";

async function buildWidgetComponent() {
  const view = await buildOpenWrtWidgetView();
  return <OpenWrtStatusWidget view={view} />;
}

export default async function WidgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetAction, clickAction } = props;

  switch (widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED":
      props.renderWidget(await buildWidgetComponent());
      break;
    case "WIDGET_CLICK":
      // OPEN_APP 由系统直接处理;REFRESH 重新拉取状态并重绘。
      if (clickAction === "REFRESH") {
        props.renderWidget(await buildWidgetComponent());
      }
      break;
    case "WIDGET_DELETED":
      // 系统移除 widget,无需清理。
      break;
    default:
      break;
  }
}
