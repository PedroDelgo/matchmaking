import React from "react";
import { View } from "react-native";
import type { SyncStatus } from "../features/tournaments/remote/realtime";
import { colors } from "../theme/tokens";
import { Icon, Text } from "./ui";

const labels: Record<SyncStatus, string> = {
  connecting: "Conectando",
  connected: "Conectado",
  reconnecting: "Reconectando",
  offline: "Sem conexão",
  updating: "Atualizando",
  "access-ended": "Acesso encerrado",
};

export function ConnectionStatus({ status }: { status: SyncStatus }) {
  const stale = status === "offline" || status === "reconnecting";
  const color =
    status === "connected"
      ? colors.success
      : status === "access-ended"
        ? colors.danger
        : colors.muted;
  return (
    <View
      testID="remote-connection-status"
      accessible
      accessibilityLabel={labels[status]}
      accessibilityLiveRegion="polite"
      style={{ gap: 4, flexShrink: 1 }}
    >
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <Icon
          name={
            status === "access-ended"
              ? "lock-closed-outline"
              : status === "connected"
                ? "cloud-done-outline"
                : stale
                  ? "cloud-offline-outline"
                  : "sync-outline"
          }
          color={color}
          size={16}
        />
        <Text variant="caption" color={color}>
          {labels[status]}
        </Text>
      </View>
      {stale && (
        <Text variant="caption" color={colors.muted}>
          O último estado consultado pode estar desatualizado.
        </Text>
      )}
    </View>
  );
}
