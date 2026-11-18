import React from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import {
  Text,
  Icon,
  Avatar,
  Chip,
  Progress,
  Panel,
  InteractiveCard,
} from "./ui";
import { colors, tokens } from "../theme/tokens";
import type { Tournament, Match } from "../features/tournaments/domain/types";
import { participantLabel } from "../features/tournaments/domain/labels";

export const statusLabel = {
  draft: "Em preparação",
  active: "Em andamento",
  completed: "Concluído",
};
export function TournamentCard({ tournament: t }: { tournament: Tournament }) {
  const done = t.matches.filter((m) => m.status === "completed").length;
  const next = t.matches.find((m) => m.status === "ready");
  const name = (id: string | null) => participantLabel(t, id);
  return (
    <InteractiveCard
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${t.name}`}
      accessibilityHint={`${statusLabel[t.status]}, ${t.participants.length} de ${t.capacity} participantes. ${t.status === "draft" ? "Abrir sala" : t.status === "completed" ? "Ver resultados" : "Continuar disputa"}.`}
      onPress={() => router.push(`/tournament/${t.id}`)}
      style={[
        s.card,
        {
          borderTopWidth: tokens.border.emphasis,
          borderTopColor:
            t.status === "active"
              ? colors.primary
              : t.status === "completed"
                ? colors.ink
                : colors.border,
        },
      ]}
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
      <Text
        variant="heading"
        style={{ marginTop: tokens.spacing.section }}
        numberOfLines={2}
      >
        {t.name}
      </Text>
      <Text
        variant="caption"
        color={colors.muted}
        style={{ marginTop: tokens.spacing.xs }}
      >
        {t.modality} · Mata-mata
      </Text>
      <View style={[s.row, { marginTop: 22, marginBottom: 10 }]}>
        <View style={[s.row, { flexShrink: 1 }]}>
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
        label={
          t.status === "draft"
            ? "Ocupação das vagas"
            : "Progresso do campeonato"
        }
        color={t.status === "completed" ? colors.ink : colors.primary}
        value={
          t.status === "draft"
            ? t.participants.length / t.capacity
            : done / (t.capacity - 1)
        }
      />
      <View style={s.cardBottom}>
        <View style={{ flex: 1, gap: tokens.spacing.xs }}>
          <Text variant="caption" numberOfLines={1}>
            {t.championId
              ? `Campeão: ${name(t.championId)}`
              : next
                ? `${name(next.participant1Id)} × ${name(next.participant2Id)}`
                : "Vamos reunir a galera?"}
          </Text>
          <Text
            variant="label"
            color={t.status === "active" ? colors.primaryDark : colors.muted}
          >
            {t.status === "draft"
              ? "Abrir sala"
              : t.status === "completed"
                ? "Ver resultados"
                : "Continuar disputa"}
          </Text>
        </View>
        <Icon
          name={t.status === "completed" ? "trophy-outline" : "arrow-forward"}
          size={18}
        />
      </View>
    </InteractiveCard>
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
      accessibilityHint={`${participantLabel(t, m.participant1Id)} contra ${participantLabel(t, m.participant2Id)}.${m.status === "completed" ? ` Placar ${m.score1} a ${m.score2}. Vencedor: ${participantLabel(t, m.winnerId)}.` : m.status === "ready" ? " Registrar placar." : " Aguardando resultados anteriores."}`}
      onPress={() => router.push(`/match/${m.id}?tournamentId=${t.id}`)}
      style={({ pressed }) => [
        s.match,
        compact && { width: 240 },
        m.status === "ready" && { borderColor: colors.primary },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[s.row, { flexWrap: "wrap" }]}>
        <Text variant="caption">JOGO {m.positionIndex + 1}</Text>
        <Text
          variant="caption"
          color={m.status === "ready" ? colors.primaryDark : colors.muted}
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
                id !== null && { backgroundColor: colors.primarySoft },
            ]}
          >
            <Avatar name={p?.displayName ?? "?"} size={30} />
            <Text style={{ flex: 1, minWidth: 0 }}>
              {participantLabel(t, id)}
            </Text>
            {m.winnerId === id && id && (
              <Icon name="checkmark" size={16} color={colors.primaryDark} />
            )}
            <Text variant="label" style={{ flexShrink: 0 }}>
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
  const compact = useWindowDimensions().width < tokens.breakpoints.compact;
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
          aria-selected={active === tab.route}
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
            color={active === tab.route ? colors.primaryDark : colors.muted}
          />
          <Text
            variant={compact ? "caption" : "label"}
            style={compact ? { fontSize: 11, lineHeight: 16 } : undefined}
            color={active === tab.route ? colors.primaryDark : colors.muted}
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
        <Text color={colors.primaryDark}>Voltar aos torneios →</Text>
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
    flex: 1,
    padding: tokens.spacing.lg,
    backgroundColor: colors.white,
    borderWidth: tokens.border.thin,
    borderColor: colors.border,
    borderRadius: tokens.radius.lg,
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
    backgroundColor: colors.backgroundSecondary,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  cardBottom: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 20,
    paddingTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  match: {
    backgroundColor: colors.white,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderBottomColor: colors.border,
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
    borderBottomColor: colors.transparent,
  },
  activeTab: { borderBottomColor: colors.primary },
});
