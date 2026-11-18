import React, { type ReactNode, useState } from "react";
import { View, ScrollView, Image, Pressable, StyleSheet } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, Icon, Button, Avatar } from "./ui";
import { colors, fonts, tokens } from "../theme/tokens";
import { useAppStore } from "../store/useAppStore";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";

const destinations = [
  { label: "Início", href: "/" as const, icon: "home-outline" as const },
  {
    label: "Torneios",
    href: "/tournaments" as const,
    icon: "trophy-outline" as const,
  },
  {
    label: "Perfil",
    href: "/profile" as const,
    icon: "person-outline" as const,
  },
];

export function AppNavigation({
  placement,
}: {
  placement: "header" | "bottom";
}) {
  const path = usePathname();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Navegação principal"
      style={placement === "header" ? s.desktopNav : s.mobileNav}
    >
      {destinations.map((item) => {
        const active =
          item.href === "/"
            ? path === "/"
            : item.href === "/tournaments"
              ? path.startsWith("/tournament") || path.startsWith("/match")
              : path.startsWith("/profile");
        return (
          <NavigationItem
            key={item.href}
            item={item}
            active={active}
            mobile={placement === "bottom"}
          />
        );
      })}
    </View>
  );
}
function NavigationItem({
  item,
  active,
  mobile,
}: {
  item: (typeof destinations)[number];
  active: boolean;
  mobile: boolean;
}) {
  const [focused, setFocused] = useState(false),
    [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      aria-selected={active}
      onPress={() => router.navigate(item.href)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        s.navItem,
        mobile && s.navMobile,
        hovered && { backgroundColor: colors.backgroundSecondary },
        focused && { borderColor: colors.primaryDark },
        pressed && { opacity: tokens.interaction.pressedOpacity },
      ]}
    >
      {mobile && (
        <Icon
          name={item.icon}
          size={tokens.icon.md}
          color={active ? colors.primaryDark : colors.muted}
        />
      )}
      <Text
        variant={mobile ? "caption" : "body"}
        color={active ? colors.primaryDark : colors.muted}
        style={{ fontFamily: active ? fonts.bold : fonts.medium }}
      >
        {item.label}
      </Text>
      {active && (
        <View
          pointerEvents="none"
          style={[s.activeMarker, mobile ? { top: 0 } : { bottom: 0 }]}
        />
      )}
    </Pressable>
  );
}

export function AppHeader() {
  const { desktop, padding } = useResponsiveLayout(),
    insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[s.headerSurface, { paddingTop: insets.top }]}>
      <View
        style={[
          s.header,
          {
            height: desktop
              ? tokens.dimensions.header
              : tokens.dimensions.headerMobile,
            paddingLeft: padding + insets.left,
            paddingRight: padding + insets.right,
          },
        ]}
      >
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Matchmaking, início"
          onPress={() => router.navigate("/")}
          style={s.logoLink}
        >
          <Image
            source={require("../../assets/brand/logo.png")}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessible={false}
            style={{ width: desktop ? 184 : 132, height: desktop ? 62 : 45 }}
          />
        </Pressable>
        {desktop && <AppNavigation placement="header" />}
        <View style={s.headerActions}>
          {desktop && (
            <Button
              label="Criar campeonato"
              icon="add"
              onPress={() => router.push("/tournament/create")}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={"Abrir perfil de " + profile.nickname}
            onPress={() => router.navigate("/profile")}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={({ pressed }) => [
              s.profileButton,
              focused && { borderColor: colors.primaryDark },
              pressed && { opacity: tokens.interaction.pressedOpacity },
            ]}
          >
            <Avatar name={profile.nickname} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function ScreenContainer({ children }: { children: ReactNode }) {
  const { desktop, padding } = useResponsiveLayout(),
    insets = useSafeAreaInsets(),
    error = useAppStore((s) => s.storageError);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View
        style={[
          s.content,
          {
            paddingLeft: padding + insets.left,
            paddingRight: padding + insets.right,
            paddingTop: desktop ? tokens.spacing.page : tokens.spacing.lg,
          },
        ]}
      >
        <View style={{ flex: 1 }}>{children}</View>
        <View style={[s.footer, { flexDirection: desktop ? "row" : "column" }]}>
          <Text variant="caption" color={colors.muted}>
            Feito para a disputa. Pensado para os amigos.
          </Text>
          <Text variant="caption" color={error ? colors.danger : colors.muted}>
            {error
              ? "Alterações apenas nesta sessão"
              : "Armazenamento local · Neste dispositivo"}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { desktop } = useResponsiveLayout(),
    insets = useSafeAreaInsets();
  return (
    <View style={s.root}>
      <AppHeader />
      <ScreenContainer>{children}</ScreenContainer>
      {!desktop && (
        <View
          style={[
            s.bottomSurface,
            {
              paddingBottom: Math.max(insets.bottom, tokens.spacing.sm),
              paddingLeft: insets.left,
              paddingRight: insets.right,
            },
          ]}
        >
          <AppNavigation placement="bottom" />
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headerSurface: {
    backgroundColor: colors.surface,
    borderBottomWidth: tokens.border.thin,
    borderBottomColor: colors.border,
  },
  header: {
    width: "100%",
    maxWidth: tokens.maxWidth,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.md,
  },
  logoLink: { minHeight: tokens.dimensions.touch, justifyContent: "center" },
  desktopNav: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    gap: tokens.spacing.sm,
  },
  mobileNav: { flexDirection: "row", width: "100%" },
  navItem: {
    minHeight: tokens.dimensions.button,
    paddingHorizontal: tokens.spacing.section,
    paddingVertical: tokens.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing.xs,
    borderWidth: tokens.border.focus,
    borderColor: colors.transparent,
    borderRadius: tokens.radius.sm,
  },
  navMobile: { flex: 1, paddingVertical: tokens.spacing.sm },
  activeMarker: {
    position: "absolute",
    width: 20,
    height: tokens.border.emphasis,
    borderRadius: tokens.radius.full,
    backgroundColor: colors.primary,
  },
  headerActions: {
    marginLeft: "auto",
    flexDirection: "row",
    gap: tokens.spacing.md,
    alignItems: "center",
  },
  profileButton: {
    width: tokens.dimensions.button,
    height: tokens.dimensions.button,
    borderWidth: tokens.border.focus,
    borderColor: colors.transparent,
    borderRadius: tokens.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: tokens.maxWidth,
    alignSelf: "center",
    paddingBottom: tokens.spacing.lg,
    flexGrow: 1,
  },
  footer: {
    marginTop: tokens.spacing.xxl,
    paddingTop: tokens.spacing.section,
    borderTopWidth: tokens.border.thin,
    borderTopColor: colors.border,
    justifyContent: "space-between",
    gap: tokens.spacing.sm,
  },
  bottomSurface: {
    backgroundColor: colors.surface,
    borderTopWidth: tokens.border.thin,
    borderTopColor: colors.border,
    paddingTop: tokens.spacing.xs,
  },
});
