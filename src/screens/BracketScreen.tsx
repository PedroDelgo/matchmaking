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
import {
  MatchCard,
  TournamentTabs,
  MissingTournament,
} from "../components/tournament";
import { useAppStore } from "../store/useAppStore";
import { colors, tokens } from "../theme/tokens";
import type { Tournament } from "../features/tournaments/domain/types";

function FullBracket({ t }: { t: Tournament }) {
  const [slotHeight, setSlotHeight] = useState(190);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      contentContainerStyle={{ paddingBottom: 20, paddingRight: 12 }}
      accessibilityLabel="Árvore completa do torneio. Role horizontalmente para ver todas as rodadas."
    >
      <View style={{ flexDirection: "row", gap: 44 }}>
        {t.rounds.map((r, index) => (
          <View key={r.id} style={{ width: 240 }}>
            <View
              style={{
                paddingBottom: 16,
                borderBottomWidth: 2,
                borderBottomColor:
                  index === t.rounds.length - 1
                    ? colors.primary
                    : colors.border,
                marginBottom: 10,
                gap: 4,
              }}
            >
              <Text variant="title" style={{ fontSize: 27 }}>
                {r.label}
              </Text>
              <Text variant="caption" color={colors.muted}>
                {r.matchIds.length}{" "}
                {r.matchIds.length === 1 ? "partida" : "partidas"}
              </Text>
            </View>
            {t.matches
              .filter((m) => m.roundIndex === index)
              .map((m, i) => {
                const height = slotHeight * 2 ** index;
                return (
                  <View key={m.id} style={{ height, justifyContent: "center" }}>
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
                    {index < t.rounds.length - 1 && i % 2 === 0 && (
                      <>
                        <View
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            left: 240,
                            top: height / 2,
                            width: 22,
                            height,
                            borderTopWidth: 1,
                            borderBottomWidth: 1,
                            borderRightWidth: 1,
                            borderColor: colors.lineStrong,
                          }}
                        />
                        <View
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            left: 262,
                            top: height,
                            width: 22,
                            height: 1,
                            backgroundColor: colors.lineStrong,
                          }}
                        />
                      </>
                    )}
                  </View>
                );
              })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
export function BracketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    t = useAppStore((s) => s.tournaments.find((t) => t.id === id));
  const wide = useWindowDimensions().width >= tokens.breakpoints.desktop;
  const [round, setRound] = useState<number | null>(null),
    [overview, setOverview] = useState(false);
  if (!t)
    return (
      <Shell>
        <MissingTournament />
      </Shell>
    );
  const current =
    round ??
    Math.max(
      0,
      t.rounds.findIndex((r) => r.status === "active"),
    );
  const done = t.matches.filter((m) => m.status === "completed").length;
  return (
    <Shell>
      <PageHeading
        eyebrow={`${t.modality} / MATA-MATA`}
        title={t.name}
        description={`${done} de ${t.capacity - 1} partidas concluídas · ${t.participants.length} participantes`}
        action={
          t.championId ? (
            <Button
              label="Ver campeão"
              icon="trophy-outline"
              onPress={() => router.push(`/tournament/${id}/champion`)}
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
          onAction={() => router.replace(`/tournament/${id}/lobby`)}
        />
      ) : (
        <>
          {t.championId && (
            <Panel
              style={{
                backgroundColor: colors.ink,
                borderColor: colors.ink,
                marginBottom: 24,
                flexDirection: "row",
                gap: 16,
                alignItems: "center",
              }}
            >
              <Text variant="title" color={colors.primary} style={{ flex: 1 }}>
                O troféu é de{" "}
                {t.participants.find((p) => p.id === t.championId)?.displayName}
                !
              </Text>
              <Button
                label="Celebrar"
                onPress={() => router.push(`/tournament/${id}/champion`)}
              />
            </Panel>
          )}
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
            {!wide && (
              <Button
                label={overview ? "Por rodada" : "Árvore completa"}
                variant="outline"
                icon="git-network-outline"
                onPress={() => setOverview(!overview)}
              />
            )}
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
                    onPress={() => setRound(i)}
                  />
                ))}
              </ScrollView>
              <View style={{ gap: 14 }}>
                {t.matches
                  .filter((m) => m.roundIndex === current)
                  .map((m) => (
                    <MatchCard key={m.id} match={m} tournament={t} />
                  ))}
              </View>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
                <Button
                  label="Anterior"
                  variant="outline"
                  icon="arrow-back"
                  disabled={current === 0}
                  onPress={() => setRound(current - 1)}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Próxima"
                  variant="outline"
                  icon="arrow-forward"
                  disabled={current === t.rounds.length - 1}
                  onPress={() => setRound(current + 1)}
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
