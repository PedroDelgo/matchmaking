import React from "react";
import { View } from "react-native";
import { Button, Notice, Text } from "./ui";
import { useRemoteTournaments } from "../features/tournaments/remote/RemoteProvider";
export function CloudListNotice() {
  const remote = useRemoteTournaments();
  if (!remote.client) return null;
  return (
    <View style={{ gap: 12, marginBottom: 20 }}>
      {remote.status !== "loading" ? (
        <Text variant="caption">
          {remote.items.length} campeonatos da conta carregados
          {remote.nextCursor ? " · há mais resultados" : ""}.
        </Text>
      ) : null}
      {remote.status === "loading" ? (
        <Text>Buscando campeonatos na nuvem…</Text>
      ) : null}
      {remote.status === "refreshing" ? (
        <Text>Atualizando campeonatos na nuvem…</Text>
      ) : null}
      {remote.error ? <Notice tone="error" message={remote.error} /> : null}
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        <Button
          label="Atualizar nuvem"
          variant="ghost"
          disabled={["loading", "refreshing"].includes(remote.status)}
          onPress={() => {
            void remote.client?.list();
          }}
        />
        {remote.nextCursor ? (
          <Button
            label="Carregar mais da nuvem"
            variant="outline"
            disabled={["loading", "refreshing"].includes(remote.status)}
            onPress={() => {
              void remote.client?.list(true);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
