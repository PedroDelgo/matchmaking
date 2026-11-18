import React, { type ReactNode } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useReducedMotion } from "../hooks/useReducedMotion";
export function Motion({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(280).delay(delay)}
    >
      {children}
    </Animated.View>
  );
}
