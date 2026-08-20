import { PropsWithChildren, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const colors = useColors();
  const arrowRotation = useSharedValue(0);

  const toggle = () => {
    const nextOpen = !isOpen;
    arrowRotation.value = withTiming(nextOpen ? 90 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
    setIsOpen(nextOpen);
  };
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotation.value}deg` }],
  }));

  return (
    <Animated.View className="bg-background" layout={LinearTransition.duration(200)}>
      <TouchableOpacity
        className="flex-row items-center gap-1.5"
        onPress={toggle}
        activeOpacity={0.8}
      >
        <Animated.View style={arrowStyle}>
          <IconSymbol name="chevron.right" size={18} weight="medium" color={colors.icon} />
        </Animated.View>
        <Text className="text-base font-semibold text-foreground">{title}</Text>
      </TouchableOpacity>
      {isOpen ? (
        <Animated.View
          className="mt-1.5 ml-6"
          entering={FadeInDown.duration(180).easing(Easing.out(Easing.cubic))}
          exiting={FadeOutUp.duration(140).easing(Easing.in(Easing.quad))}
          layout={LinearTransition.duration(200)}
        >
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
