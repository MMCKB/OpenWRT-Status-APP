// 类型放宽:expo-router 57 内部 react-navigation 类型与直接依赖存在偏斜。
import { PlatformPressable } from "@react-navigation/elements";
// 类型放宽:expo-router 57 内部 react-navigation 类型与直接依赖存在偏斜。
import * as Haptics from "expo-haptics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HapticTab(props: any) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === "ios") {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
