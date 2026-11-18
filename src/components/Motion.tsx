import React, { type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  ZoomIn,
} from "react-native-reanimated";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { motion } from "../theme/motion";
export function Motion({
  children,
  delay = 0,
  style,
  direction = "forward",
  preset = "enter",
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  direction?: "forward" | "backward";
  preset?: "enter" | "competition" | "transition";
}) {
  const reduced = useReducedMotion();
  const duration =
    preset === "competition"
      ? motion.duration.competition
      : motion.duration.transition;
  const animation =
    preset === "transition"
      ? (direction === "forward" ? FadeInRight : FadeInLeft)
          .withInitialValues({
            transform: [
              {
                translateX:
                  direction === "forward"
                    ? motion.distance.enter
                    : -motion.distance.enter,
              },
            ],
          })
          .duration(duration)
      : preset === "competition"
        ? ZoomIn.duration(duration)
        : FadeInDown.duration(duration);
  return (
    <Animated.View
      style={style}
      entering={
        reduced ? undefined : animation.easing(motion.easing.enter).delay(delay)
      }
    >
      {children}
    </Animated.View>
  );
}
