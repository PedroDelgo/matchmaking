import React, { useEffect, useState } from "react";
import { Modal, ScrollView, View, useWindowDimensions } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { invitationQr } from "../features/invites/qr";
import { colors } from "../theme/tokens";
import { Button, LoadingState, Notice, Panel, Text } from "./ui";

export function InviteQr({ value }: { value: string }) {
  const [result, setResult] = useState<{
      value: string;
      symbol?: ReturnType<typeof invitationQr>;
    } | null>(null),
    [expanded, setExpanded] = useState(false);
  const symbol = result?.value === value ? result.symbol : undefined,
    failed = result?.value === value && !result.symbol;
  const { width } = useWindowDimensions(),
    insets = useSafeAreaInsets();
  useEffect(() => {
    const task = setTimeout(() => {
      try {
        setResult({ value, symbol: invitationQr(value) });
      } catch {
        setResult({ value });
      }
    }, 0);
    return () => clearTimeout(task);
  }, [value]);
  const draw = (size: number) =>
    symbol ? (
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${symbol.size} ${symbol.size}`}
        accessibilityRole="image"
        accessibilityLabel="QR Code do mesmo link de convite"
        testID="invite-qr"
      >
        <Rect width={symbol.size} height={symbol.size} fill="#FFFFFF" />
        <Path d={symbol.path} fill="#000000" />
      </Svg>
    ) : null;
  if (failed)
    return (
      <Notice
        tone="error"
        message="Não foi possível gerar o QR Code. Use o link ou o código deste convite."
      />
    );
  if (!symbol) return <LoadingState label="Preparando QR Code…" />;
  return (
    <View style={{ alignItems: "center", gap: 12, minWidth: 0 }}>
      {draw(Math.min(224, width - 96))}
      <Text
        variant="caption"
        color={colors.muted}
        style={{ textAlign: "center" }}
      >
        Aponte a câmera de outro aparelho para abrir o mesmo convite.
      </Text>
      <Button
        label="Ampliar QR Code"
        variant="outline"
        icon="expand-outline"
        onPress={() => setExpanded(true)}
      />
      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={() => setExpanded(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.overlay,
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <ScrollView
            style={{ width: "100%", maxWidth: 520, flexGrow: 0 }}
            contentContainerStyle={{ paddingVertical: 12 }}
          >
            <Panel
              accessibilityViewIsModal
              style={{ alignItems: "center", gap: 16, padding: 16 }}
            >
              <Text variant="heading">Convide para a disputa</Text>
              {draw(Math.min(440, width - 64))}
              <Button
                label="Fechar QR Code"
                variant="outline"
                onPress={() => setExpanded(false)}
              />
            </Panel>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
