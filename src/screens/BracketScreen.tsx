import React, { useState } from "react";
import { View, ScrollView, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Shell } from "../components/Shell";
import {
  Text,
  Button,
  Panel,
  PageHeading,
  Chip,
  EmptyState,
} from "../components/ui";
import { Motion } from "../components/Motion";
import {
  MatchCard,
  TournamentTabs,
  MissingTournament,
} from "../components/tournament";
import { useTournament } from "../features/tournaments/useTournament";
import { RemoteTournamentNotice } from "../components/RemoteTournamentNotice";
import { ImportTournament } from "../components/ImportTournament";
import { colors, tokens } from "../theme/tokens";
import type { Match, Tournament } from "../features/tournaments/domain/types";

const bracketWidth = 240;
const bracketGap = 44;

function BracketConnection({
  source,
  target,
  slotHeight,
  championId,
}: {
  source: Match;
  target: Match;
  slotHeight: number;
  championId?: string;
}) {
  const sourceY =
    (source.positionIndex + 0.5) * slotHeight * 2 ** source.roundIndex;
  const targetY =
    (target.positionIndex + 0.5) * slotHeight * 2 ** target.roundIndex;
  const advancing =
    !!source.winnerId &&
    [target.participant1Id, target.participant2Id].includes(source.winnerId);
  const highlighted =
    advancing && (!championId || source.winnerId === championId);
  const color = highlighted ? colors.primary : colors.lineStrong;
  return (
    <View
      testID={`bracket-edge-${source.id}-${target.id}`}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        left: bracketWidth,
        top: 0,
        width: bracketGap,
        height: Math.max(sourceY, targetY) + 2,
      }}
    >
      <View
        style={{
          position: "absolute",
          left: 0,
          top: sourceY,
          width: bracketGap / 2,
          height: highlighted ? 2 : 1,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: bracketGap / 2,
          top: Math.min(sourceY, targetY),
          width: highlighted ? 2 : 1,
          height: Math.abs(targetY - sourceY),
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: bracketGap / 2,
          top: targetY,
          width: bracketGap / 2,
          height: highlighted ? 2 : 1,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function FullBracket({ t }: { t: Tournament }) {
  const [slotHeight, setSlotHeight] = useState(190);
  const [headerHeight, setHeaderHeight] = useState(98);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      contentContainerStyle={{ paddingBottom: 20, paddingRight: 12 }}
      accessibilityLabel="Árvore completa do torneio. Role horizontalmente para ver todas as rodadas."
    >
      <View style={{ flexDirection: "row", gap: bracketGap }}>
        {t.rounds.map((r, index) => {
          const matches = r.matchIds
            .map((id) => t.matches.find((m) => m.id === id))
            .filter((m): m is Match => !!m)
            .sort((a, b) => a.positionIndex - b.positionIndex);
          return (
            <View key={r.id} style={{ width: bracketWidth }}>
              <View
                onLayout={(event) =>
                  setHeaderHeight((previous) =>
                    Math.max(
                      previous,
                      Math.ceil(event.nativeEvent.layout.height),
                    ),
                  )
                }
                style={{
                  minHeight: headerHeight,
                  paddingBottom: 16,
                  borderBottomWidth: 2,
                  borderBottomColor:
                    r.status === "active" ? colors.primary : colors.border,
                  marginBottom: 10,
                  gap: 4,
                  justifyContent: "flex-end",
                }}
              >
                <Text
                  variant="label"
                  color={
                    r.status === "active" ? colors.primaryDark : colors.muted
                  }
                >
                  {r.status === "active"
                    ? "Em disputa"
                    : r.status === "completed"
                      ? "Concluída"
                      : "A seguir"}
                </Text>
                <Text variant="title" style={{ fontSize: 27 }}>
                  {r.label}
                </Text>
                <Text variant="caption" color={colors.muted}>
                  {r.matchIds.length}{" "}
                  {r.matchIds.length === 1 ? "partida" : "partidas"}
                </Text>
              </View>
              <View>
                {matches.map((m) => (
                  <View
                    key={m.id}
                    style={{
                      height: slotHeight * 2 ** index,
                      justifyContent: "center",
                    }}
                  >
                    <View
                      onLayout={(event) =>
                        setSlotHeight((previous) =>
                          Math.max(
                            previous,
                            Math.ceil(event.nativeEvent.layout.height) + 16,
                          ),
                        )
                      }
                    >
                      <MatchCard match={m} tournament={t} compact />
                    </View>
                  </View>
                ))}
                {matches.map((m) => {
                  const target = t.matches.find(
                    (candidate) => candidate.id === m.nextMatchId,
                  );
                  return target ? (
                    <BracketConnection
                      key={m.id}
                      source={m}
                      target={target}
                      slotHeight={slotHeight}
                      championId={t.championId}
                    />
                  ) : null;
                })}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

export function BracketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const source = useTournament(),
    t = source.tournament;
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= tokens.breakpoints.desktop && fontScale < 1.4;
  const [selection, setSelection] = useState<{
    tournamentId: string;
    round: number;
  } | null>(null);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [overview, setOverview] = useState(false);
  if (!t)
    return (
      <Shell>
        {source.cloud ? (
          <RemoteTournamentNotice source={source} />
        ) : (
          <MissingTournament />
        )}
      </Shell>
    );

  const activeRound = t.rounds.findIndex((r) => r.status === "active");
  const defaultRound =
    activeRound >= 0 ? activeRound : Math.max(0, t.rounds.length - 1);
  const current =
    selection?.tournamentId === t.id
      ? Math.min(selection.round, Math.max(0, t.rounds.length - 1))
      : defaultRound;
  const selectedRound = t.rounds[current];
  const selectRound = (index: number) => {
    setDirection(index < current ? "backward" : "forward");
    setSelection({ tournamentId: t.id, round: index });
  };
  const done = t.matches.filter((m) => m.status === "completed").length;
  return (
    <Shell>
      <RemoteTournamentNotice source={source} />
      {!source.cloud ? (
        <ImportTournament
          key={`${t.id}:${source.client?.userId ?? "signed-out"}`}
          tournament={t}
        />
      ) : null}
      <PageHeading
        eyebrow={`${t.modality} / MATA-MATA`}
        title={t.name}
        description={`${done} de ${t.capacity - 1} partidas concluídas · ${t.participants.length} participantes`}
        action={
          t.championId ? (
            <Button
              label="Ver campeão"
              icon="trophy-outline"
              onPress={() => router.push(source.href("champion"))}
            />
          ) : (
            <Chip
              label={
                t.status === "draft"
                  ? "Em preparação"
                  : "A disputa está valendo"
              }
              tone="orange"
            />
          )
        }
      />
      <TournamentTabs id={id} active="bracket" />
      {t.status === "draft" ? (
        <EmptyState
          title="A chave ainda vai ganhar vida."
          description="Complete a sala e sorteie os confrontos para começar."
          actionLabel="Ir para a sala"
          onAction={() => router.replace(source.href("lobby"))}
        />
      ) : (
        <>
          {t.championId ? (
            <Panel
              style={{
                backgroundColor: colors.ink,
                borderColor: colors.ink,
                marginBottom: 24,
                flexDirection: width < 400 ? "column" : "row",
                gap: 16,
                alignItems: "center",
              }}
            >
              <Text
                variant="title"
                color={colors.primary}
                style={{ flex: width < 400 ? undefined : 1 }}
              >
                O troféu é de{" "}
                {t.participants.find((p) => p.id === t.championId)?.displayName}
                !
              </Text>
              <Button
                label="Celebrar"
                onPress={() => router.push(source.href("champion"))}
              />
            </Panel>
          ) : activeRound >= 0 ? (
            <View
              style={{
                borderLeftWidth: tokens.border.emphasis,
                borderLeftColor: colors.primary,
                padding: tokens.spacing.md,
                marginBottom: tokens.spacing.lg,
                backgroundColor: colors.primarySoft,
                gap: tokens.spacing.xs,
              }}
            >
              <Text variant="label" color={colors.primaryDark}>
                Rodada em disputa
              </Text>
              <Text variant="heading">{t.rounds[activeRound].label}</Text>
              <Text variant="caption" color={colors.muted}>
                {
                  t.matches.filter(
                    (m) =>
                      m.roundIndex === activeRound && m.status === "completed",
                  ).length
                }
                {" de "}
                {t.rounds[activeRound].matchIds.length} partidas concluídas
                nesta rodada.
              </Text>
            </View>
          ) : null}
          <View
            style={{
              flexDirection: wide ? "row" : "column",
              justifyContent: "space-between",
              alignItems: wide ? "center" : "flex-start",
              gap: 10,
              marginBottom: 22,
            }}
          >
            <Text variant="title">O caminho até o troféu</Text>
            {!wide ? (
              <Button
                label={overview ? "Por rodada" : "Árvore completa"}
                variant="outline"
                icon="git-network-outline"
                onPress={() => setOverview(!overview)}
              />
            ) : null}
          </View>
          {wide || overview ? (
            <FullBracket t={t} />
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 20 }}
                contentContainerStyle={{ gap: 8 }}
              >
                {t.rounds.map((r, i) => (
                  <Button
                    key={r.id}
                    label={r.label}
                    variant={current === i ? "secondary" : "outline"}
                    accessibilityState={{ selected: current === i }}
                    onPress={() => selectRound(i)}
                  />
                ))}
              </ScrollView>
              {activeRound >= 0 && current !== activeRound ? (
                <Button
                  label="Ir para rodada em disputa"
                  variant="ghost"
                  icon="locate-outline"
                  onPress={() => selectRound(activeRound)}
                  style={{
                    alignSelf: "flex-start",
                    marginBottom: tokens.spacing.md,
                  }}
                />
              ) : null}
              <Motion
                key={`${t.id}-round-${current}`}
                preset="transition"
                direction={direction}
              >
                <View style={{ gap: tokens.spacing.md }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: tokens.spacing.sm,
                      flexWrap: "wrap",
                    }}
                  >
                    <Text variant="title" style={{ flexShrink: 1 }}>
                      {selectedRound?.label}
                    </Text>
                    <Chip
                      label={
                        selectedRound?.status === "active"
                          ? "Em disputa"
                          : selectedRound?.status === "completed"
                            ? "Concluída"
                            : "A seguir"
                      }
                      tone={
                        selectedRound?.status === "active"
                          ? "orange"
                          : "neutral"
                      }
                    />
                  </View>
                  {t.matches
                    .filter((m) => m.roundIndex === current)
                    .sort((a, b) => a.positionIndex - b.positionIndex)
                    .map((m) => (
                      <MatchCard key={m.id} match={m} tournament={t} />
                    ))}
                </View>
              </Motion>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
                <Button
                  label="Anterior"
                  variant="outline"
                  icon="arrow-back"
                  disabled={current === 0}
                  onPress={() => selectRound(current - 1)}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Próxima"
                  variant="outline"
                  icon="arrow-forward"
                  disabled={current === t.rounds.length - 1}
                  onPress={() => selectRound(current + 1)}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          )}
          <Text
            variant="caption"
            color={colors.muted}
            style={{ marginTop: 20 }}
          >
            Toque em um confronto para registrar ou revisar o resultado.
          </Text>
        </>
      )}
    </Shell>
  );
}
