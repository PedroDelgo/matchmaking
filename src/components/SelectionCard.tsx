import React, { useEffect, useState } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { colors, tokens } from "../theme/tokens";
import { motion } from "../theme/motion";
import { Icon, Text } from "./ui";

export function SelectionCard({
  label,
  icon,
  selected,
  onPress,
  style,
}: {
  label: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const background = useSharedValue<string>(
    selected ? colors.primarySoft : colors.surface,
  );
  const border = useSharedValue<string>(
    selected ? colors.primary : colors.border,
  );
  const iconScale = useSharedValue(selected ? motion.scale.selected : 1);
  const scale = useSharedValue(1);
  useEffect(() => {
    const duration = reduced ? 0 : motion.duration.selection;
    background.set(
      withTiming(selected ? colors.primarySoft : colors.surface, { duration }),
    );
    border.set(
      withTiming(selected ? colors.primary : colors.border, { duration }),
    );
    iconScale.set(
      withTiming(selected ? motion.scale.selected : 1, { duration }),
    );
    return () => {
      cancelAnimation(background);
      cancelAnimation(border);
      cancelAnimation(iconScale);
    };
  }, [selected, reduced, background, border, iconScale]);
  useEffect(() => () => cancelAnimation(scale), [scale]);
  const surface = useAnimatedStyle(() => ({
    backgroundColor: background.get(),
    borderColor: border.get(),
    transform: [{ scale: scale.get() }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.get() }],
  }));
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() =>
        scale.set(
          withTiming(reduced ? 1 : motion.scale.pressed, {
            duration: motion.duration.micro,
          }),
        )
      }
      onPressOut={() =>
        scale.set(
          withTiming(1, { duration: reduced ? 0 : motion.duration.micro }),
        )
      }
      style={[
        { borderRadius: tokens.radius.md },
        style,
        focused && {
          outlineColor: colors.primaryDark,
          outlineWidth: 2,
          outlineOffset: 2,
        },
      ]}
    >
      <Animated.View
        style={[
          {
            flex: 1,
            minHeight: 90,
            borderWidth: 2,
            borderRadius: tokens.radius.md,
            padding: 14,
            gap: 10,
          },
          surface,
        ]}
      >
        <Animated.View
          style={[
            { flexDirection: "row", justifyContent: "space-between" },
            iconStyle,
          ]}
        >
          <Icon name={icon} size={24} />
          {selected && (
            <Icon name="checkmark-circle" color={colors.primaryDark} />
          )}
        </Animated.View>
        <Text>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}
