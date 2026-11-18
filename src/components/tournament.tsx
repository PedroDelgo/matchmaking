import React from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Text, Icon, Avatar, Chip, Progress, Panel } from "./ui";
import type { Tournament, Match } from "../features/tournaments/domain/types";
import { participantLabel } from "../features/tournaments/domain/labels";

export const statusLabel = {
  draft: "Em preparação",
  active: "Em andamento",
  completed: "Finalizado",
};
export function TournamentCard({ tournament: t }: { tournament: Tournament }) {
  const done = t.matches.filter((m) => m.status === "completed").length;
  const next = t.matches.find((m) => m.status === "ready");
  const name = (id: string | null) => participantLabel(t, id);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${t.name}`}
      onPress={() => router.push(`/tournament/${t.id}`)}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}
    >
      <View style={s.cardTop}>
        <View style={s.sport}>
          <Icon name={modalityIcon(t.modality)} size={24} />
        </View>
        <Chip
          label={statusLabel[t.status]}
          tone={t.status === "active" ? "orange" : "neutral"}
        />
      </View>
      <Text variant="heading" style={{ marginTop: 20 }}>
        {t.name}
      </Text>
      <Text variant="caption" style={{ marginTop: 6 }}>
        {t.modality} · Mata-mata
      </Text>
      <View style={[s.row, { marginTop: 22, marginBottom: 10 }]}>
        <View style={s.row}>
          <Icon name="people-outline" size={15} />
          <Text variant="caption">
            {t.participants.length}/{t.capacity} participantes
          </Text>
        </View>
        <Text variant="caption">
          {t.status === "draft"
            ? "Sala aberta"
            : `${done}/${t.capacity - 1} jogos`}
        </Text>
      </View>
      <Progress
        value={
          t.status === "draft"
            ? t.participants.length / t.capacity
            : done / (t.capacity - 1)
        }
      />
      <View style={s.cardBottom}>
        <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
          {t.championId
            ? `Campeão: ${name(t.championId)}`
            : next
              ? `${name(next.participant1Id)} × ${name(next.participant2Id)}`
              : "Vamos reunir a galera?"}
        </Text>
        <Icon name="arrow-forward" size={18} />
      </View>
    </Pressable>
  );
}
export function modalityIcon(
  modality: string,
): React.ComponentProps<typeof Icon>["name"] {
  return (
    (
      {
        Futebol: "football-outline",
        Videogame: "game-controller-outline",
        Basquete: "basketball-outline",
        Vôlei: "tennisball-outline",
        Truco: "copy-outline",
        Xadrez: "extension-puzzle-outline",
      } as const
    )[modality as "Futebol"] ?? "flag-outline"
  );
}
export function MatchCard({
  match: m,
  tournament: t,
  compact = false,
}: {
  match: Match;
  tournament: Tournament;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Partida ${m.positionIndex + 1}, ${t.rounds[m.roundIndex]?.label}`}
      onPress={() => router.push(`/match/${m.id}?tournamentId=${t.id}`)}
      style={({ pressed }) => [
        s.match,
        compact && { width: 240 },
        m.status === "ready" && { borderColor: "#FF6A00" },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={s.row}>
        <Text variant="caption">JOGO {m.positionIndex + 1}</Text>
        <Text
          variant="caption"
          color={m.status === "ready" ? "#C24100" : "#686868"}
        >
          {m.status === "completed"
            ? "✓ Encerrado"
            : m.status === "ready"
              ? "Registrar placar →"
              : "Aguardando"}
        </Text>
      </View>
      {[m.participant1Id, m.participant2Id].map((id, i) => {
        const p = t.participants.find((x) => x.id === id);
        return (
          <View
            key={i}
            style={[
              s.player,
              m.winnerId === id &&
                id !== null && { backgroundColor: "#FFF1E7" },
            ]}
          >
            <Avatar name={p?.displayName ?? "?"} size={30} />
            <Text style={{ flex: 1 }} numberOfLines={1}>
              {participantLabel(t, id)}
            </Text>
            {m.winnerId === id && id && (
              <Icon name="checkmark" size={16} color="#C24100" />
            )}
            <Text variant="label">
              {(i === 0 ? m.score1 : m.score2) ?? "—"}
            </Text>
          </View>
        );
      })}
    </Pressable>
  );
}
export function TournamentTabs({
  id,
  active,
}: {
  id: string;
  active: "lobby" | "bracket" | "stats";
}) {
  const compact = useWindowDimensions().width < 600;
  return (
    <View style={s.tabs}>
      {(
        [
          { label: "Participantes", route: "lobby", icon: "people-outline" },
          {
            label: "Chaveamento",
            route: "bracket",
            icon: "git-network-outline",
          },
          {
            label: "Estatísticas",
            route: "stats",
            icon: "stats-chart-outline",
          },
        ] as const
      ).map((tab) => (
        <Pressable
          key={tab.route}
          accessibilityRole="tab"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: active === tab.route }}
          onPress={() => router.replace(`/tournament/${id}/${tab.route}`)}
          style={[
            s.tab,
            compact && {
              flexDirection: "column",
              gap: 3,
              paddingVertical: 8,
              paddingHorizontal: 2,
            },
            active === tab.route && s.activeTab,
          ]}
        >
          <Icon
            name={tab.icon}
            size={18}
            color={active === tab.route ? "#C24100" : "#686868"}
          />
          <Text
            variant={compact ? "caption" : "label"}
            style={compact ? { fontSize: 11, lineHeight: 16 } : undefined}
            color={active === tab.route ? "#C24100" : "#686868"}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function MissingTournament() {
  return (
    <Panel>
      <Text variant="title">Campeonato não encontrado</Text>
      <Text style={{ marginVertical: 16 }}>
        Ele pode ter sido removido deste dispositivo.
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.replace("/tournaments")}
      >
        <Text color="#C24100">Voltar aos torneios →</Text>
      </Pressable>
    </Panel>
  );
}
export const tournamentStyles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  twoColumns: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
});
const s = StyleSheet.create({
  card: {
    padding: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sport: {
    backgroundColor: "#F5F5F3",
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  cardBottom: {
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    marginTop: 20,
    paddingTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  match: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 10,
    gap: 12,
  },
  player: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: 6,
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
    marginBottom: 28,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: { borderBottomColor: "#FF6A00" },
});
