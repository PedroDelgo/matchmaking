import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { router } from "expo-router";
import { Shell } from "../components/Shell";
import {
  Text,
  Panel,
  Button,
  PageHeading,
  Avatar,
  EmptyState,
} from "../components/ui";
import { TournamentTabs, MissingTournament } from "../components/tournament";
import { useTournament } from "../features/tournaments/useTournament";
import { RemoteTournamentNotice } from "../components/RemoteTournamentNotice";
import {
  getRanking,
  getTournamentStats,
} from "../features/tournaments/engine/tournament";
import { colors, fonts } from "../theme/tokens";
import { participantLabel } from "../features/tournaments/domain/labels";
export function StatsScreen() {
  const source = useTournament(),
    { id } = source,
    t = source.tournament;
  const [selected, setSelected] = useState<string | null>(null);
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
  const stats = getTournamentStats(t),
    ranking = getRanking(t),
    player = ranking.find((p) => p.participantId === selected);
  return (
    <Shell>
      <RemoteTournamentNotice source={source} />
      <PageHeading
        eyebrow={`${t.modality} / MATA-MATA`}
        title={t.name}
        description="Cada ponto conta. Acompanhe os números da disputa."
      />
      <TournamentTabs id={id} active="stats" />
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {[
          { n: stats.players, label: "Participantes" },
          {
            n: `${stats.completed}/${stats.expected}`,
            label: "Partidas concluídas",
          },
          { n: stats.totalPoints, label: "Pontos marcados" },
          { n: stats.highestScore, label: "Maior placar individual" },
        ].map((item) => (
          <Panel
            key={item.label}
            style={{ flexGrow: 1, flexBasis: 140, gap: 8 }}
          >
            <Text variant="display" style={{ fontSize: 40, lineHeight: 44 }}>
              {item.n}
            </Text>
            <Text variant="caption" color={colors.muted}>
              {item.label}
            </Text>
          </Panel>
        ))}
      </View>
      {!ranking.length ? (
        <EmptyState
          title="A disputa ainda não começou."
          description="Adicione jogadores para acompanhar suas estatísticas."
          actionLabel="Ir para a sala"
          onAction={() => router.replace(source.href("lobby"))}
        />
      ) : (
        <>
          <Text variant="title" style={{ marginBottom: 16 }}>
            Ranking da disputa
          </Text>
          <Panel style={{ padding: 0, overflow: "hidden" }}>
            <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
              <View style={{ minWidth: 620, flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    backgroundColor: colors.backgroundSecondary,
                  }}
                >
                  <Text variant="label" style={{ width: 40 }}>
                    #
                  </Text>
                  <Text variant="label" style={{ flex: 1, minWidth: 180 }}>
                    Jogador
                  </Text>
                  {["J", "V", "D", "PF", "PS", "Saldo"].map((col) => (
                    <Text
                      key={col}
                      variant="label"
                      style={{ width: 48, textAlign: "right" }}
                    >
                      {col}
                    </Text>
                  ))}
                </View>
                {ranking.map((p) => (
                  <View
                    key={p.participantId}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      backgroundColor:
                        t.championId === p.participantId
                          ? colors.primarySoft
                          : colors.surface,
                    }}
                  >
                    <Text variant="label" style={{ width: 40 }}>
                      {String(p.position).padStart(2, "0")}
                    </Text>
                    <View
                      style={{
                        flex: 1,
                        minWidth: 180,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Avatar name={p.displayName} size={30} />
                      <Button
                        label={`${participantLabel(t, p.participantId)}${p.participantId === t.championId ? " 🏆" : ""}`}
                        variant="ghost"
                        onPress={() => setSelected(p.participantId)}
                        style={{ paddingHorizontal: 0, flexShrink: 1 }}
                      />
                    </View>
                    {[
                      p.played,
                      p.wins,
                      p.losses,
                      p.pointsFor,
                      p.pointsAgainst,
                      p.balance,
                    ].map((v, i) => (
                      <Text
                        key={i}
                        style={{
                          width: 48,
                          textAlign: "right",
                          fontFamily: i === 1 ? fonts.bold : fonts.regular,
                        }}
                      >
                        {v}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </Panel>
          <Text
            variant="caption"
            color={colors.muted}
            style={{ marginTop: 14 }}
          >
            J: jogos · V: vitórias · D: derrotas · PF/PS: pontos
            marcados/sofridos.
          </Text>
          <Text variant="caption" color={colors.muted} style={{ marginTop: 8 }}>
            Classificação estatística: vitórias, saldo, pontos marcados, nome e
            identificador. O campeão é definido pelo chaveamento. Toque no nome
            para ver os detalhes.
          </Text>
          {player && (
            <Panel style={{ marginTop: 24, gap: 16 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text variant="title">
                  {participantLabel(t, player.participantId)}
                </Text>
                <Button
                  label="Fechar detalhes"
                  variant="ghost"
                  onPress={() => setSelected(null)}
                />
              </View>
              <Text>
                {player.wins} vitórias · {player.losses} derrotas ·{" "}
                {Math.round(player.winRate * 100)}% de aproveitamento
              </Text>
              <Text color={colors.muted}>
                {player.pointsFor} pontos marcados · {player.pointsAgainst}{" "}
                sofridos · Saldo {player.balance}
              </Text>
              <Text color={colors.muted}>
                Maior sequência: {player.longestWinStreak} vitória
                {player.longestWinStreak === 1 ? "" : "s"} neste campeonato.
              </Text>
            </Panel>
          )}
        </>
      )}
    </Shell>
  );
}
