import React, { useEffect } from "react";
import { View } from "react-native";
import { Stack, ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { BarlowCondensed_800ExtraBold } from "@expo-google-fonts/barlow-condensed/800ExtraBold";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAppStore, hydrateApp } from "../src/store/useAppStore";
import { Text, Button, Notice, LoadingState } from "../src/components/ui";
import { useReducedMotion } from "../src/hooks/useReducedMotion";
import { colors, tokens } from "../src/theme/tokens";
import { FontContext } from "../src/theme/FontContext";

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <FontContext.Provider value={false}>
      <View
        style={{
          flex: 1,
          padding: 32,
          justifyContent: "center",
          gap: 20,
          backgroundColor: colors.background,
        }}
      >
        <Text variant="title">Vamos tentar de novo?</Text>
        <Text>
          Não foi possível abrir esta tela. Seus campeonatos continuam
          armazenados no dispositivo.
        </Text>
        <Button label="Tentar novamente" onPress={retry} />
      </View>
    </FontContext.Provider>
  );
}
export default function RootLayout() {
  const reduced = useReducedMotion();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    BarlowCondensed_800ExtraBold,
  });
  const hydrated = useAppStore((s) => s.hydrated),
    storageError = useAppStore((s) => s.storageError);
  useEffect(() => hydrateApp(), []);
  return (
    <SafeAreaProvider>
      <FontContext.Provider value={fontsLoaded}>
        <StatusBar style="dark" />
        {storageError && <Notice tone="error" message={storageError} />}
        {fontError && (
          <Notice message="Não foi possível carregar as fontes. Estamos usando as fontes do dispositivo." />
        )}
        {(!fontsLoaded && !fontError) || !hydrated ? (
          <View
            style={{
              flex: 1,
              backgroundColor: colors.background,
              justifyContent: "center",
            }}
          >
            <LoadingState />
          </View>
        ) : (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: reduced ? "none" : "fade",
              animationDuration: tokens.motion.navigation,
            }}
          />
        )}
      </FontContext.Provider>
    </SafeAreaProvider>
  );
}
