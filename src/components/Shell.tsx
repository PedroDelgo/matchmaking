import React, { type ReactNode } from "react";
import {
  View,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, Icon, Button, Avatar } from "./ui";
import { colors, tokens } from "../theme/tokens";
import { useAppStore } from "../store/useAppStore";

export function Shell({ children }: { children: ReactNode }) {
  const desktop = useWindowDimensions().width >= 960,
    path = usePathname(),
    insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile),
    error = useAppStore((s) => s.storageError);
  const nav = [
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
  const navItems = (mobile: boolean) =>
    nav.map((item) => {
      const selected =
        item.href === "/"
          ? path === "/"
          : path.startsWith(item.href) ||
            (item.href === "/tournaments" &&
              (path.startsWith("/tournament") || path.startsWith("/match")));
      return (
        <Pressable
          key={item.href}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          onPress={() => router.navigate(item.href)}
          style={({ pressed }) => [
            {
              minHeight: 48,
              flex: mobile ? 1 : undefined,
              paddingHorizontal: 20,
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              borderBottomWidth: selected && !mobile ? 3 : 0,
              borderBottomColor: colors.primary,
              opacity: pressed ? 0.65 : 1,
            },
          ]}
        >
          {mobile && (
            <Icon
              name={item.icon}
              size={21}
              color={selected ? colors.primaryDark : colors.muted}
            />
          )}
          <Text
            variant={mobile ? "caption" : "body"}
            color={selected ? colors.ink : colors.muted}
            style={{
              fontFamily: selected ? "Inter_700Bold" : "Inter_500Medium",
            }}
          >
            {item.label}
          </Text>
        </Pressable>
      );
    });
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingTop: insets.top,
        }}
      >
        <View
          style={[
            s.header,
            { height: desktop ? 88 : 72, paddingHorizontal: desktop ? 40 : 16 },
          ]}
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Matchmaking, início"
            onPress={() => router.navigate("/")}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Image
              source={require("../../assets/brand/logo.png")}
              resizeMode="contain"
              style={{ width: desktop ? 184 : 132, height: 62 }}
            />
          </Pressable>
          {desktop && (
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                height: "100%",
              }}
            >
              {navItems(false)}
            </View>
          )}
          <View
            style={{
              marginLeft: "auto",
              flexDirection: "row",
              gap: desktop ? 16 : 6,
              alignItems: "center",
            }}
          >
            {desktop && (
              <Button
                label="Criar campeonato"
                icon="add"
                onPress={() => router.push("/tournament/create")}
              />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir perfil"
              onPress={() => router.navigate("/profile")}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Avatar name={profile.nickname} />
            </Pressable>
          </View>
        </View>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: tokens.maxWidth,
            alignSelf: "center",
            paddingHorizontal: desktop ? 40 : 16,
            paddingTop: desktop ? 40 : 24,
            paddingBottom: 24,
            flexGrow: 1,
          }}
        >
          <View style={{ flex: 1 }}>{children}</View>
          <View
            style={{
              marginTop: 48,
              paddingTop: 20,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              flexDirection: desktop ? "row" : "column",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Text variant="caption" color={colors.muted}>
              Feito para a disputa. Pensado para os amigos.
            </Text>
            <Text
              variant="caption"
              color={error ? colors.danger : colors.muted}
            >
              {error
                ? "Alterações apenas nesta sessão"
                : "Armazenamento local · Neste dispositivo"}
            </Text>
          </View>
        </View>
      </ScrollView>
      {!desktop && (
        <View
          style={{
            flexDirection: "row",
            paddingTop: 4,
            paddingBottom: Math.max(insets.bottom, 8),
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          {navItems(true)}
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  header: {
    width: "100%",
    maxWidth: tokens.maxWidth,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
});
