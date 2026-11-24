import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Text, Button, Notice, LoadingState } from "./ui";
import type { useTournament } from "../features/tournaments/useTournament";
export function RemoteTournamentNotice({
  source,
}: {
  source: ReturnType<typeof useTournament>;
}) {
  const [retryError, setRetryError] = useState("");
  if (!source.cloud) return null;
  return (
    <View style={{ gap: 12, marginBottom: 20 }}>
      <Text variant="label">
        Na nuvem{source.tournament ? ` · revisão confirmada` : ""}
      </Text>
      {source.status === "loading" ? <LoadingState /> : null}
      {source.status === "refreshing" ? (
        <Text>Atualizando campeonato…</Text>
      ) : null}
      {source.error ? <Notice tone="error" message={source.error} /> : null}
      {source.status === "unauthorized" && !source.client ? (
        <>
          <Notice message="Entre na sua conta e configure a API para abrir este campeonato." />
          <Button
            label="Entrar na minha conta"
            onPress={() => router.push("/auth/sign-in")}
          />
        </>
      ) : null}
      {["error", "offline", "conflict"].includes(source.status) ? (
        <Button
          label="Atualizar campeonato"
          variant="outline"
          onPress={() => {
            void source.reload()?.catch(() => {});
          }}
        />
      ) : null}
      {source.busy ? <Text>Confirmando no servidor…</Text> : null}
      {retryError ? <Notice tone="error" message={retryError} /> : null}
      {source.pending ? (
        <>
          <Notice message="Há uma tentativa sem confirmação neste aparelho. Repita a tentativa para conferir o resultado original antes de enviar outra alteração." />
          <Button
            label="Repetir tentativa pendente"
            variant="outline"
            disabled={source.busy}
            onPress={() => {
              setRetryError("");
              void source.client
                ?.retryPending(source.id)
                .catch((e) => setRetryError((e as Error).message));
            }}
          />
        </>
      ) : null}
    </View>
  );
}
