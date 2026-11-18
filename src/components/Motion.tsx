import React, { type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { tokens } from "../theme/tokens";
export function Motion({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      style={style}
      entering={
        reduced
          ? undefined
          : FadeInDown.duration(tokens.motion.enter).delay(delay)
      }
    >
      {children}
    </Animated.View>
  );
}
