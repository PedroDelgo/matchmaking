import React, { useRef, useState } from "react";
import { View, TextInput, useWindowDimensions, Keyboard } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Shell } from "../components/Shell";
import { Motion } from "../components/Motion";
import {
  Text,
  Button,
  Panel,
  Avatar,
  PageHeading,
  Notice,
  ConfirmDialog,
  EmptyState,
} from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { colors, fonts, tokens } from "../theme/tokens";
import { participantLabel } from "../features/tournaments/domain/labels";
import { useTournament } from "../features/tournaments/useTournament";
import { RemoteTournamentNotice } from "../components/RemoteTournamentNotice";
import type { Tournament } from "../features/tournaments/domain/types";

function ScoreControl({
  name,
  value,
  onChange,
  expanded,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  expanded: boolean;
}) {
  const number = Number(value),
    change = (d: number) =>
      onChange(
        String(
          Math.max(
            0,
            Math.min(999999, (Number.isFinite(number) ? number : 0) + d),
          ),
        ),
      );
  return (
    <View
      style={{
        gap: 22,
        alignItems: "center",
        flex: expanded ? undefined : 1,
        minWidth: 0,
        width: expanded ? "100%" : undefined,
      }}
    >
      <Avatar name={name} size={64} />
      <Text variant="heading" style={{ textAlign: "center" }}>
        {name}
      </Text>
      <TextInput
        accessibilityLabel={`Placar de ${name}`}
        keyboardType="number-pad"
        inputMode="numeric"
        value={value}
        onChangeText={onChange}
        maxLength={6}
        selectTextOnFocus
        style={{
          width: "100%",
          maxWidth: 240,
          textAlign: "center",
          fontFamily: fonts.display,
          fontSize: value.length > 4 ? 36 : value.length > 3 ? 52 : 72,
          lineHeight: 84,
          color: colors.ink,
          borderBottomWidth: 2,
          borderBottomColor: colors.border,
          padding: 8,
        }}
      />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Button
          label="−"
          accessibilityLabel={`Diminuir pontos de ${name}`}
          variant="outline"
          disabled={number <= 0}
          onPress={() => change(-1)}
          style={{ minWidth: 48 }}
        />
        <Button
          label="+"
          accessibilityLabel={`Aumentar pontos de ${name}`}
          variant="outline"
          onPress={() => change(1)}
          style={{ minWidth: 48 }}
        />
      </View>
    </View>
  );
}
export function MatchScreen() {
  const { id, tournamentId } = useLocalSearchParams<{
    id: string;
    tournamentId: string;
  }>();
  const local = useAppStore((s) =>
    s.tournaments.find(
      (t) => t.id === tournamentId || t.matches.some((m) => m.id === id),
    ),
  );
  const source = useTournament(tournamentId ?? local?.id),
    t = source.tournament;
  if (!t)
    return (
      <Shell>
        {source.cloud ? (
          <RemoteTournamentNotice source={source} />
        ) : (
          <EmptyState
            title="Essa partida não está disponível."
            description="Ela pode ter sido removida ou o campeonato não existe neste dispositivo."
            actionLabel="Ver meus torneios"
            onAction={() => router.replace("/tournaments")}
          />
        )}
      </Shell>
    );
  return (
    <MatchContent
      key={`${source.cloud ? source.client?.userId : "local"}:${source.id}:${id}`}
      t={t}
      id={id}
      source={source}
    />
  );
}
function MatchContent({
  t,
  id,
  source,
}: {
  t: Tournament;
  id: string;
  source: ReturnType<typeof useTournament>;
}) {
  const m = t.matches.find((m) => m.id === id),
    submitting = useRef(false);
  const [a, setA] = useState(String(m?.score1 ?? 0)),
    [b, setB] = useState(String(m?.score2 ?? 0)),
    [tie, setTie] = useState<string | undefined>(
      m?.score1 === m?.score2 ? (m?.winnerId ?? undefined) : undefined,
    ),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [editing, setEditing] = useState(false),
    [saved, setSaved] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 700 && fontScale < 1.4,
    stacked = width < 360 || fontScale >= 1.4;
  if (!t || !m)
    return (
      <Shell>
        <EmptyState
          title="Essa partida não está disponível."
          description="Ela pode ter sido removida ou o campeonato não existe neste dispositivo."
          actionLabel="Ver meus torneios"
          onAction={() => router.replace("/tournaments")}
        />
      </Shell>
    );
  const p1 = t.participants.find((p) => p.id === m.participant1Id),
    p2 = t.participants.find((p) => p.id === m.participant2Id);
  const locked = m.status === "completed" && !editing;
  const isFinal =
    m.nextMatchId === null && m.roundIndex === t.rounds.length - 1;
  const hasDownstream = (() => {
    let next = m.nextMatchId;
    while (next) {
      const match = t.matches.find((m) => m.id === next);
      if (match?.winnerId) return true;
      next = match?.nextMatchId ?? null;
    }
    return false;
  })();
  const predicted =
    Number(a) === Number(b)
      ? tie
      : Number(a) > Number(b)
        ? m.participant1Id
        : m.participant2Id;
  const changedWinner = !!m.winnerId && predicted !== m.winnerId;
  if (!source.canManage)
    return (
      <Shell>
        <RemoteTournamentNotice source={source} />
        <PageHeading
          eyebrow={t.name}
          title="Acompanhe o confronto"
          description="Somente o organizador registra e corrige os resultados."
        />
        <Panel style={{ gap: 20 }}>
          <Text variant="heading">
            {participantLabel(t, m.participant1Id)} ×{" "}
            {participantLabel(t, m.participant2Id)}
          </Text>
          <Text variant="display">
            {m.score1 ?? "—"} × {m.score2 ?? "—"}
          </Text>
          <Notice
            message={
              m.status === "completed"
                ? `${participantLabel(t, m.winnerId)} venceu.`
                : "Aguardando o resultado confirmado pelo organizador."
            }
          />
          <Button
            label="Atualizar resultado"
            variant="outline"
            onPress={() => void source.reload()?.catch(() => {})}
          />
          <Button
            label="Voltar ao chaveamento"
            onPress={() => router.dismissTo(source.href("bracket"))}
          />
        </Panel>
      </Shell>
    );
  const validate = () => {
    if (
      !/^\d+$/.test(a) ||
      !/^\d+$/.test(b) ||
      !Number.isSafeInteger(Number(a)) ||
      !Number.isSafeInteger(Number(b))
    )
      return "Use placares inteiros não negativos.";
    if (Number(a) === Number(b) && !tie)
      return "Selecione quem venceu o desempate.";
    return "";
  };
  const save = async () => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const updated = await source.score(
        m.id,
        Number(a),
        Number(b),
        Number(a) === Number(b) ? tie : undefined,
      );
      setConfirm(false);
      setEditing(false);
      setError("");
      setSaved(true);
      if (
        updated.status === "completed" &&
        m.roundIndex === t.rounds.length - 1
      )
        router.replace(source.href("champion"));
    } catch (e) {
      setError((e as Error).message);
      setConfirm(false);
    } finally {
      submitting.current = false;
    }
  };
  return (
    <Shell>
      <RemoteTournamentNotice source={source} />
      <View style={{ maxWidth: 820, width: "100%", alignSelf: "center" }}>
        <Button
          label="Voltar ao chaveamento"
          variant="ghost"
          icon="arrow-back"
          style={{ alignSelf: "flex-start", marginBottom: 20 }}
          onPress={() => router.dismissTo(source.href("bracket"))}
        />
        <PageHeading
          eyebrow={`${t.name} / ${t.rounds[m.roundIndex]?.label}`}
          title={`Confronto ${m.positionIndex + 1}`}
          description={
            locked
              ? "Resultado registrado. Revise os números ou acompanhe a próxima rodada."
              : "Aqui, cada ponto muda a história."
          }
        />
        {isFinal ? (
          <Motion
            key={`${t.id}-final-${m.participant1Id}-${m.participant2Id}`}
            preset="competition"
            style={{ marginBottom: tokens.spacing.lg }}
          >
            <Panel
              style={{
                backgroundColor: colors.ink,
                borderColor: colors.ink,
                borderTopColor: colors.primary,
                borderTopWidth: tokens.border.emphasis,
                gap: tokens.spacing.compact,
                padding: wide ? tokens.spacing.xl : tokens.spacing.lg,
              }}
            >
              <Text variant="label" color={colors.primary}>
                {locked
                  ? "Decisão encerrada"
                  : p1 && p2
                    ? "Vale o título"
                    : "A decisão está chegando"}
              </Text>
              <Text
                variant="display"
                color={colors.white}
                style={{ fontSize: wide ? 64 : 48, lineHeight: wide ? 68 : 52 }}
              >
                GRANDE FINAL
              </Text>
              <View
                style={{
                  flexDirection: stacked ? "column" : "row",
                  alignItems: stacked ? "flex-start" : "center",
                  gap: tokens.spacing.compact,
                }}
              >
                <Text
                  variant="heading"
                  color={colors.white}
                  style={{ flex: stacked ? undefined : 1 }}
                >
                  {participantLabel(t, m.participant1Id)}
                </Text>
                <Text variant="label" color={colors.primary}>
                  VS
                </Text>
                <Text
                  variant="heading"
                  color={colors.white}
                  style={{ flex: stacked ? undefined : 1 }}
                >
                  {participantLabel(t, m.participant2Id)}
                </Text>
              </View>
              <Text variant="caption" color={colors.inverseMuted}>
                {locked
                  ? "A decisão está registrada. A revisão do resultado continua disponível abaixo."
                  : p1 && p2
                    ? "Os finalistas estão definidos. Registre o placar para decidir o campeão."
                    : "Os vencedores das semifinais ocuparão estes lugares."}
              </Text>
            </Panel>
          </Motion>
        ) : null}
        {!p1 || !p2 ? (
          <EmptyState
            title="Os rivais ainda estão a caminho."
            description="Conclua as partidas anteriores para definir este confronto."
            actionLabel="Ver chaveamento"
            onAction={() => router.dismissTo(source.href("bracket"))}
          />
        ) : (
          <>
            <Panel style={{ padding: wide ? 36 : 16, gap: 28 }}>
              <View
                style={{
                  flexDirection: stacked ? "column" : "row",
                  gap: stacked ? 24 : wide ? 24 : 4,
                  alignItems: "center",
                }}
              >
                {locked ? (
                  <>
                    <View
                      style={{
                        flex: stacked ? undefined : 1,
                        gap: 20,
                        alignItems: "center",
                        minWidth: 0,
                        width: stacked ? "100%" : undefined,
                      }}
                    >
                      <Avatar name={participantLabel(t, p1.id)} size={64} />
                      <Text
                        variant="heading"
                        style={{ textAlign: "center", width: "100%" }}
                      >
                        {participantLabel(t, p1.id)}
                      </Text>
                      <Text
                        variant="display"
                        style={{
                          fontSize: String(m.score1).length > 3 ? 40 : 76,
                          lineHeight: 84,
                          maxWidth: "100%",
                        }}
                      >
                        {m.score1}
                      </Text>
                    </View>
                    <Text variant="title" color={colors.muted}>
                      ×
                    </Text>
                    <View
                      style={{
                        flex: stacked ? undefined : 1,
                        gap: 20,
                        alignItems: "center",
                        minWidth: 0,
                        width: stacked ? "100%" : undefined,
                      }}
                    >
                      <Avatar name={participantLabel(t, p2.id)} size={64} />
                      <Text
                        variant="heading"
                        style={{ textAlign: "center", width: "100%" }}
                      >
                        {participantLabel(t, p2.id)}
                      </Text>
                      <Text
                        variant="display"
                        style={{
                          fontSize: String(m.score2).length > 3 ? 40 : 76,
                          lineHeight: 84,
                          maxWidth: "100%",
                        }}
                      >
                        {m.score2}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <ScoreControl
                      expanded={stacked}
                      name={participantLabel(t, p1.id)}
                      value={a}
                      onChange={(v) => {
                        setA(v);
                        setError("");
                        setSaved(false);
                      }}
                    />
                    <Text variant="title" color={colors.muted}>
                      ×
                    </Text>
                    <ScoreControl
                      expanded={stacked}
                      name={participantLabel(t, p2.id)}
                      value={b}
                      onChange={(v) => {
                        setB(v);
                        setError("");
                        setSaved(false);
                      }}
                    />
                  </>
                )}
              </View>
              {!locked && Number(a) === Number(b) && (
                <View
                  style={{
                    gap: 12,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    paddingTop: 24,
                  }}
                >
                  <Text variant="heading">Quem venceu o desempate?</Text>
                  <Text color={colors.muted}>
                    Resolva o desempate conforme a regra do seu jogo e escolha
                    quem avança.
                  </Text>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    {[p1, p2].map((p) => (
                      <Button
                        key={p.id}
                        label={`${tie === p.id ? "✓ " : ""}${participantLabel(t, p.id)}`}
                        variant={tie === p.id ? "primary" : "outline"}
                        accessibilityState={{ selected: tie === p.id }}
                        onPress={() => setTie(p.id)}
                        style={{ flex: 1 }}
                      />
                    ))}
                  </View>
                </View>
              )}
              {locked ? (
                <Motion
                  key={`${m.winnerId}-${m.score1}-${m.score2}`}
                  preset="transition"
                >
                  <Notice
                    tone="success"
                    message={`${participantLabel(t, m.winnerId)} venceu${m.score1 === m.score2 ? " no desempate" : ""}.`}
                  />
                </Motion>
              ) : null}
              {!!error && <Notice tone="error" message={error} />}
              {saved && (
                <Notice
                  tone="success"
                  message="Resultado salvo. O chaveamento e as estatísticas foram atualizados."
                />
              )}
              {locked ? (
                <View style={{ gap: 12 }}>
                  <Button
                    label="Continuar no chaveamento"
                    icon="arrow-forward"
                    onPress={() => router.dismissTo(source.href("bracket"))}
                  />
                  <Button
                    label="Corrigir resultado"
                    variant="outline"
                    onPress={() => {
                      setA(String(m.score1));
                      setB(String(m.score2));
                      setTie(
                        m.score1 === m.score2
                          ? (m.winnerId ?? undefined)
                          : undefined,
                      );
                      setEditing(true);
                      setSaved(false);
                    }}
                  />
                </View>
              ) : (
                <>
                  <Button
                    label="Confirmar resultado"
                    disabled={source.busy}
                    icon="checkmark"
                    onPress={() => {
                      const e = validate();
                      setError(e);
                      if (!e) {
                        Keyboard.dismiss();
                        setConfirm(true);
                      }
                    }}
                  />
                  {editing && (
                    <Button
                      label="Cancelar edição"
                      variant="ghost"
                      onPress={() => {
                        setEditing(false);
                        setError("");
                      }}
                    />
                  )}
                </>
              )}
            </Panel>
            <Text
              variant="caption"
              color={colors.muted}
              style={{ marginTop: 16, textAlign: "center" }}
            >
              {source.cloud
                ? "Placar na nuvem. O resultado só é salvo após a confirmação do servidor."
                : "Placar local. Nenhum resultado é publicado automaticamente."}
            </Text>
          </>
        )}
        <ConfirmDialog
          visible={confirm}
          title={
            hasDownstream && changedWinner
              ? "A chave vai mudar"
              : "Confirmar resultado?"
          }
          description={`${participantLabel(t, p1?.id)} ${a} × ${b} ${participantLabel(t, p2?.id)}.${Number(a) === Number(b) ? ` Vencedor do desempate: ${participantLabel(t, tie)}.` : ""}${hasDownstream && changedWinner ? " A troca do vencedor apagará os resultados posteriores que dependem deste confronto e poderá remover o campeão." : ""}`}
          confirmLabel={
            hasDownstream && changedWinner
              ? "Confirmar e atualizar chave"
              : "Salvar resultado"
          }
          destructive={hasDownstream && changedWinner}
          onCancel={() => setConfirm(false)}
          onConfirm={save}
        />
      </View>
    </Shell>
  );
}
