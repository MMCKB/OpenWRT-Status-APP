import "expo-router/entry";
import { registerWidgetTaskHandler } from "react-native-android-widget";

import WidgetTaskHandler from "./widget-task-handler";

// 桌面小组件的后台任务注册:widget 在应用进程外刷新时由此入口接管。
registerWidgetTaskHandler(WidgetTaskHandler);
