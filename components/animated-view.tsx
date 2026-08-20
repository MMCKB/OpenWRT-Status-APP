import React, { useEffect, useRef } from "react";
import { Pressable, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

interface FadeInViewProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

export function FadeInView({
  children,
  delay = 0,
  duration = 300,
  style,
  className,
}: FadeInViewProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }));
  }, [delay, duration, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      className={className}
      style={[
        style,
        animatedStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

interface AnimatedPressableCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

export function AnimatedPressableCard({
  children,
  onPress,
  style,
  className,
}: AnimatedPressableCardProps) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withTiming(0.97, { duration: 90, easing: Easing.out(Easing.quad) });
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) });
  };

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        className={className}
        style={[style, animatedStyle]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

interface ReadyFadeInViewProps extends FadeInViewProps {
  /** 当本次会话首次取得状态数据时置为 true；之后的轮询不会再次入场。 */
  ready: boolean;
}

/** 为首次成功数据渲染提供一次性淡入上移动画，刷新和实时轮询不会重新触发。 */
export function ReadyFadeInView({ ready, children, delay = 0, duration = 220, style, className }: ReadyFadeInViewProps) {
  const hasPlayed = useRef(false);
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (!ready || hasPlayed.current) return;
    hasPlayed.current = true;
    opacity.value = 0;
    translateY.value = 8;
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }));
  }, [delay, duration, opacity, ready, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View className={className} style={[style, animatedStyle]}>{children}</Animated.View>;
}

/** 仅在显式刷新进行时旋转图标，停止时平滑归位。 */
export function RotatingRefreshIcon({ spinning, color, size = 22 }: { spinning: boolean; color: string; size?: number }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (spinning) {
      rotation.value = withRepeat(withTiming(360, { duration: 760, easing: Easing.linear }), -1, false);
      return;
    }
    cancelAnimation(rotation);
    rotation.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) });
  }, [rotation, spinning]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  return <Animated.View style={animatedStyle}><MaterialIcons name="refresh" size={size} color={color} /></Animated.View>;
}

/** 刷新状态以局部淡入淡出的文本反馈呈现，不改变按钮的尺寸或点击区域。 */
export function RefreshStatusLabel({ label, style }: { label: string | null; style?: StyleProp<TextStyle> }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(label ? 1 : 0, { duration: 140, easing: Easing.out(Easing.quad) });
  }, [label, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.Text pointerEvents="none" style={[style, animatedStyle]}>{label ?? ""}</Animated.Text>;
}
