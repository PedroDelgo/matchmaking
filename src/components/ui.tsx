import React, { type ReactNode, useId, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  StyleSheet,
  Text as NativeText,
  TextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type StyleProp,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, fonts, tokens, typography } from "../theme/tokens";
import { useBrandFonts } from "../theme/FontContext";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useReducedMotion } from "../hooks/useReducedMotion";
export type IconName = keyof typeof Ionicons.glyphMap;
type Variant = "display" | "title" | "heading" | "body" | "label" | "caption";
type Tone =
  "neutral" | "info" | "orange" | "success" | "warning" | "danger" | "error";
const textStyles: Record<Variant, TextStyle> = typography;
export function Text({
  variant = "body",
  color = colors.ink,
  style,
  ...props
}: TextProps & { variant?: Variant; color?: string }) {
  const brandFonts = useBrandFonts();
  return (
    <NativeText
      {...props}
      style={[
        textStyles[variant],
        { color },
        style,
        !brandFonts && {
          fontFamily: undefined,
          fontWeight:
            variant === "display" ||
            variant === "title" ||
            variant === "heading"
              ? "800"
              : "400",
        },
      ]}
    />
  );
}
export function Icon({
  name,
  size = 20,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessible={false}
      aria-hidden={true}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  variant?:
    "primary" | "secondary" | "outline" | "ghost" | "danger" | "destructive";
  size?: "normal" | "large";
  icon?: IconName;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};
export function Button({
  label,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
  size = "normal",
  ...props
}: ButtonProps) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));
  const unavailable = !!disabled || !!loading;
  const destructive = variant === "danger" || variant === "destructive";
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "secondary"
        ? colors.ink
        : destructive
          ? colors.danger
          : colors.transparent;
  const fg = variant === "secondary" || destructive ? colors.white : colors.ink;
  return (
    <AnimatedPressable
      {...props}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      onHoverIn={(event) => {
        setHovered(true);
        props.onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        props.onHoverOut?.(event);
      }}
      onPressIn={(event) => {
        if (!reduced && !unavailable)
          scale.set(
            withTiming(tokens.interaction.pressedScale, {
              duration: tokens.motion.press,
            }),
          );
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(
          reduced ? 1 : withTiming(1, { duration: tokens.motion.press }),
        );
        props.onPressOut?.(event);
      }}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityState={{
        ...props.accessibilityState,
        disabled: unavailable,
        busy: !!loading,
      }}
      disabled={disabled || loading}
      style={({ pressed }: PressableStateCallbackType) => [
        s.button,
        {
          backgroundColor: bg,
          borderColor: focused
            ? colors.primaryDark
            : variant === "outline"
              ? colors.border
              : bg,
        },
        hovered && !unavailable && { opacity: 0.9 },
        pressed && { opacity: tokens.interaction.pressedOpacity },
        unavailable && { opacity: tokens.interaction.disabledOpacity },
        size === "large" && {
          minHeight: tokens.dimensions.buttonLarge,
          paddingHorizontal: tokens.spacing.lg,
        },
        style,
        animatedStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        icon && <Icon name={icon} size={18} color={fg} />
      )}
      <Text color={fg} style={typography.button}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function Panel({ style, ...props }: ViewProps) {
  return <View {...props} style={[s.panel, style]} />;
}
export function InteractiveCard({
  children,
  style,
  selected,
  ...props
}: Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
}) {
  const [focused, setFocused] = useState(false),
    [hovered, setHovered] = useState(false);
  return (
    <Pressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? "button"}
      accessibilityState={{ ...props.accessibilityState, selected }}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      onHoverIn={(e) => {
        setHovered(true);
        props.onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        setHovered(false);
        props.onHoverOut?.(e);
      }}
      style={({ pressed }) => [
        s.panel,
        { minHeight: tokens.dimensions.touch },
        style,
        selected && {
          borderColor: colors.primary,
          backgroundColor: colors.primarySoft,
        },
        hovered && !props.disabled && { borderColor: colors.lineStrong },
        focused && {
          borderColor: colors.primaryDark,
          borderWidth: tokens.border.focus,
        },
        pressed && { opacity: tokens.interaction.pressedOpacity },
        props.disabled && { opacity: tokens.interaction.disabledOpacity },
      ]}
    >
      {children}
    </Pressable>
  );
}
export function Field({
  label,
  error,
  helper,
  containerStyle,
  style,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  helper?: string;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const [focus, setFocus] = useState(false);
  const brandFonts = useBrandFonts(),
    hintId = useId();
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  return (
    <View style={[{ gap: 8, minWidth: 0 }, containerStyle]}>
      <Text variant="label" onPress={() => inputRef.current?.focus()}>
        {label}
      </Text>
      <TextInput
        {...props}
        ref={inputRef}
        accessibilityLabel={props.accessibilityLabel ?? label}
        onFocus={(event) => {
          setFocus(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocus(false);
          props.onBlur?.(event);
        }}
        aria-disabled={props.editable === false}
        aria-describedby={error || helper ? hintId : undefined}
        aria-invalid={!!error}
        placeholderTextColor={colors.subtle}
        selectionColor={colors.primary}
        style={[
          s.input,
          {
            borderColor: error
              ? colors.danger
              : focus
                ? colors.primaryDark
                : colors.border,
          },
          style,
          props.editable === false && {
            backgroundColor: colors.backgroundSecondary,
            color: colors.muted,
          },
          !brandFonts && { fontFamily: undefined },
        ]}
      />
      {error ? (
        <Text
          nativeID={hintId}
          variant="caption"
          color={colors.danger}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : helper ? (
        <Text nativeID={hintId} variant="caption" color={colors.muted}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
function tone(t: Tone) {
  return t === "error" || t === "danger"
    ? { bg: colors.dangerSoft, fg: colors.danger }
    : t === "success"
      ? { bg: colors.successSoft, fg: colors.success }
      : t === "neutral"
        ? { bg: colors.backgroundSecondary, fg: colors.muted }
        : { bg: colors.primarySoft, fg: colors.primaryDark };
}
export function Chip({
  label,
  tone: t = "neutral",
}: {
  label: string;
  tone?: Tone;
}) {
  const p = tone(t);
  return (
    <View
      style={{
        backgroundColor: p.bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        alignSelf: "flex-start",
      }}
    >
      <Text
        variant="label"
        color={p.fg}
        style={{ fontSize: 10, letterSpacing: 0.5 }}
      >
        {label}
      </Text>
    </View>
  );
}
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/);
  const initials =
    parts.length > 1
      ? parts[0][0] + parts[parts.length - 1][0]
      : name.slice(0, 2);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.avatar,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: size * 0.32,
          lineHeight: size * 0.5,
        }}
      >
        {initials.toUpperCase() || "?"}
      </Text>
    </View>
  );
}
export function Progress({
  value,
  color = colors.primary,
  label,
}: {
  value: number;
  color?: string;
  label?: string;
}) {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={{
        height: 5,
        backgroundColor: colors.border,
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${v * 100}%`,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
export function Notice({
  message,
  tone: t = "info",
}: {
  message: string;
  tone?: Tone;
}) {
  const p = tone(t);
  return (
    <View
      accessible
      accessibilityRole={t === "error" ? "alert" : undefined}
      accessibilityLiveRegion={t==='error'?'assertive':'polite'}
      style={{
        backgroundColor: p.bg,
        flexDirection: "row",
        gap: 10,
        padding: 14,
        borderRadius: 8,
      }}
    >
      <Icon
        name={
          t === "success"
            ? "checkmark-circle-outline"
            : t === "error"
              ? "alert-circle-outline"
              : "information-circle-outline"
        }
        color={p.fg}
      />
      <Text color={p.fg} style={{ flex: 1, fontSize: 13 }}>
        {message}
      </Text>
    </View>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const { desktop: wide } = useResponsiveLayout();
  return (
    <View
      style={{
        flexDirection: wide ? "row" : "column",
        gap: 20,
        marginBottom: 28,
        alignItems: wide ? "flex-end" : undefined,
      }}
    >
      <View style={{ flex: 1, gap: 10 }}>
        {eyebrow && (
          <Text variant="label" color={colors.primaryDark}>
            {eyebrow}
          </Text>
        )}
        <Text
          accessibilityRole="header"
          variant="display"
          style={wide ? typography.page.desktop : typography.page.mobile}
        >
          {title}
        </Text>
        {description && (
          <Text color={colors.muted} style={{ maxWidth: 620 }}>
            {description}
          </Text>
        )}
      </View>
      {action}
    </View>
  );
}
export function SectionTitle({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}) {
  const { compact } = useResponsiveLayout();
  return (
    <View
      style={{
        flexDirection: compact ? "column" : "row",
        alignItems: compact ? "flex-start" : "center",
        gap: 12,
        marginBottom: 18,
      }}
    >
      <View style={{ flex: compact ? undefined : 1, gap: 4 }}>
        <Text variant="title">{title}</Text>
        {subtitle && <Text color={colors.muted}>{subtitle}</Text>}
      </View>
      {action && (
        <Button
          label={action}
          variant="ghost"
          icon="arrow-forward"
          onPress={onAction}
        />
      )}
    </View>
  );
}
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon = "trophy-outline",
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: IconName;
}) {
  return (
    <Panel style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 12,
          backgroundColor: colors.backgroundSecondary,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}
      >
        <Icon name={icon} size={30} color={colors.muted} />
      </View>
      <Text variant="heading" style={{ textAlign: "center" }}>
        {title}
      </Text>
      <Text color={colors.muted} style={{ textAlign: "center", maxWidth: 390 }}>
        {description}
      </Text>
      {actionLabel && (
        <Button
          label={actionLabel}
          onPress={onAction}
          style={{ marginTop: 8 }}
        />
      )}
    </Panel>
  );
}
export function LoadingState({
  label = "Preparando sua arena…",
}: {
  label?: string;
}) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: tokens.spacing.md,
        padding: tokens.spacing.page,
      }}
    >
      <ActivityIndicator color={colors.primaryDark} />
      <Text color={colors.muted}>{label}</Text>
    </View>
  );
}
export function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel = "Confirmar",
  onConfirm,
  onCancel,
  destructive = false,
}: {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onCancel}
    >
      <View style={s.backdrop}>
        <Panel
          accessibilityViewIsModal
          style={{ width: "100%", maxWidth: 450, gap: 16, padding: 28 }}
        >
          <Icon
            name={
              destructive
                ? "alert-circle-outline"
                : "information-circle-outline"
            }
            size={30}
            color={colors.primaryDark}
          />
          <Text variant="title">{title}</Text>
          <Text color={colors.muted}>{description}</Text>
          <View style={{ gap: 10, marginTop: 10 }}>
            <Button
              label={confirmLabel}
              variant={destructive ? "danger" : "primary"}
              onPress={onConfirm}
            />
            <Button label="Cancelar" variant="outline" onPress={onCancel} />
          </View>
        </Panel>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  button: {
    minHeight: tokens.dimensions.button,
    borderRadius: tokens.radius.md,
    borderWidth: tokens.border.focus,
    paddingHorizontal: 17,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    shadowColor: colors.ink,
    shadowOpacity: tokens.shadow.opacity,
    shadowRadius: tokens.shadow.radius,
    shadowOffset: { width: 0, height: 2 },
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: colors.overlay,
  },
});
