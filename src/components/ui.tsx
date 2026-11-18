import React, { type ReactNode, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  type PressableProps,
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
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, fonts } from "../theme/tokens";
import { useReducedMotion } from "../hooks/useReducedMotion";
export type IconName = keyof typeof Ionicons.glyphMap;
type Variant = "display" | "title" | "heading" | "body" | "label" | "caption";
type Tone =
  "neutral" | "info" | "orange" | "success" | "warning" | "danger" | "error";
const textStyles: Record<Variant, TextStyle> = {
  display: {
    fontFamily: fonts.display,
    fontSize: 52,
    lineHeight: 54,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 36,
    textTransform: "uppercase",
  },
  heading: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 17,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 19 },
};
export function Text({
  variant = "body",
  color = colors.ink,
  style,
  ...props
}: TextProps & { variant?: Variant; color?: string }) {
  return (
    <NativeText {...props} style={[textStyles[variant], { color }, style]} />
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
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
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
  ...props
}: ButtonProps) {
  const [focused, setFocused] = useState(false);
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "secondary"
        ? colors.ink
        : variant === "danger"
          ? colors.danger
          : "transparent";
  const fg =
    variant === "secondary" || variant === "danger" ? colors.white : colors.ink;
  return (
    <Pressable
      {...props}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityState={{
        disabled: !!disabled || !!loading,
        busy: !!loading,
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: bg,
          borderColor: focused
            ? colors.primaryDark
            : variant === "outline"
              ? colors.border
              : bg,
        },
        pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
        (disabled || loading) && { opacity: 0.42 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        icon && <Icon name={icon} size={18} color={fg} />
      )}
      <Text
        color={fg}
        style={{ fontFamily: fonts.semibold, fontSize: 13, lineHeight: 21 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Panel({ style, ...props }: ViewProps) {
  return <View {...props} style={[s.panel, style]} />;
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
  return (
    <View style={[{ gap: 8, minWidth: 0 }, containerStyle]}>
      <Text variant="label">{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
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
        ]}
      />
      {error ? (
        <Text variant="caption" color={colors.danger} accessibilityRole="alert">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" color={colors.muted}>
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
        ? { bg: colors.background, fg: colors.muted }
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
        backgroundColor: "#EEEEEB",
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
export function Progress({ value }: { value: number }) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <View
      accessibilityRole="progressbar"
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
          backgroundColor: colors.primary,
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
      accessibilityRole={t === "error" ? "alert" : undefined}
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
  const wide = useWindowDimensions().width >= 960;
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
          style={{ fontSize: wide ? 58 : 42, lineHeight: wide ? 62 : 46 }}
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
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 18,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
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
          backgroundColor: colors.background,
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
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 2,
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
    borderRadius: 12,
    padding: 24,
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
    backgroundColor: "rgba(15,15,15,0.6)",
  },
});
