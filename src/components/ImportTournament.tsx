import React, { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { Tournament } from "../features/tournaments/domain/types";
import { useRemoteTournaments } from "../features/tournaments/remote/RemoteProvider";
import { remoteMessage } from "../features/tournaments/remote/client";
import { Button, Text, Panel, ConfirmDialog, Notice } from "./ui";
import { statusLabel } from "./tournament";

export function ImportTournament({
  tournament: t,
}: {
  tournament: Tournament;
}) {
  const { client } = useRemoteTournaments();
  const [review, setReview] = useState(false),
    [newCopy, setNewCopy] = useState(false),
    [changed, setChanged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [remoteId, setRemoteId] = useState("");
  const submitting = useRef(false);
  const confirm = async () => {
    if (submitting.current || !client) return;
    submitting.current = true;
    setBusy(true);
    setReview(false);
    setError("");
    setRemoteId("");
    try {
      const r = await client.import(t, newCopy);
      setRemoteId(r.tournamentId);
      setChanged(false);
    } catch (e) {
      const code = (e as Error).message;
      setError(code === "NEW_COPY_REQUIRED" ? remoteMessage(code) : code);
      setChanged(
        code === "NEW_COPY_REQUIRED" ||
          code === remoteMessage("IMPORT_CONTENT_CHANGED"),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
      setNewCopy(false);
    }
  };
  const champion = t.participants.find(
    (p) => p.id === t.championId,
  )?.displayName;
  return (
    <Panel style={{ gap: 12, marginBottom: 24 }}>
      <Text variant="label">Neste dispositivo</Text>
      <Text variant="heading">Sua disputa, guardada na sua conta</Text>
      <Text>
        Vamos criar uma cópia deste campeonato na sua conta. O original
        continuará salvo neste dispositivo.
      </Text>
      {error ? <Notice tone="error" message={error} /> : null}
      {remoteId ? (
        <>
          <Notice
            tone="success"
            message="Cópia salva e conferida. O original continua neste dispositivo."
          />
          <Button
            label="Abrir cópia na nuvem"
            variant="outline"
            onPress={() => router.push(`/tournament/${remoteId}?source=cloud`)}
          />
        </>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button
          label="Salvar na minha conta"
          variant="outline"
          icon="cloud-upload-outline"
          loading={busy}
          onPress={() => {
            setNewCopy(false);
            setReview(true);
          }}
        />
        {changed ? (
          <Button
            label="Criar uma nova cópia"
            onPress={() => {
              setNewCopy(true);
              setReview(true);
            }}
          />
        ) : null}
      </View>
      <ConfirmDialog
        visible={review}
        title={newCopy ? "Salvar uma nova cópia?" : "Salvar na minha conta?"}
        description={`${t.name} · ${t.modality}\n${t.participants.length}/${t.capacity} participantes · ${statusLabel[t.status]}\n${t.matches.filter((m) => m.status === "completed").length}/${t.capacity - 1} partidas concluídas${champion ? `\nCampeão: ${champion}` : ""}\n\nVamos criar uma cópia deste campeonato na sua conta. O original continuará salvo neste dispositivo.${newCopy ? " A cópia anterior na nuvem também será preservada." : ""}${!client ? " Entre na sua conta para continuar; depois confirme a importação novamente." : ""}`}
        confirmLabel={client ? "Confirmar cópia" : "Entrar na minha conta"}
        onCancel={() => setReview(false)}
        onConfirm={() =>
          client
            ? void confirm()
            : (setReview(false), router.push("/auth/sign-in"))
        }
      />
    </Panel>
  );
}
