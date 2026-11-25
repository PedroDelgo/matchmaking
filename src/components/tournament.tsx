import React, { useEffect } from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
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
import { Motion } from "./Motion";
import { motion } from "../theme/motion";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { TournamentSummary } from "../features/tournaments/remote/client";
import { useRemoteTournaments } from "../features/tournaments/remote/RemoteProvider";

export const statusLabel = {
  draft: "Em preparação",
  active: "Em andamento",
  completed: "Concluído",
};
export function TournamentCard({
  tournament,
  summary,
}: {
  tournament?: Tournament;
  summary?: TournamentSummary;
}) {
  const t = (tournament ?? summary)!;
  const done = tournament
    ? tournament.matches.filter((m) => m.status === "completed").length
    : summary!.completedMatches;
  const next = tournament?.matches.find((m) => m.status === "ready"),
    count = tournament?.participants.length ?? summary!.participantCount;
  const champion = tournament?.championId
    ? participantLabel(tournament, tournament.championId)
    : summary?.champion;
  const nextNames =
    tournament && next
      ? `${participantLabel(tournament, next.participant1Id)} × ${participantLabel(tournament, next.participant2Id)}`
      : undefined;
  return (
    <InteractiveCard
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${t.name}`}
      accessibilityHint={`${summary ? "Na nuvem" : "Neste dispositivo"}. ${statusLabel[t.status]}, ${count} de ${t.capacity} participantes. ${t.status === "draft" ? "Abrir sala" : t.status === "completed" ? "Ver resultados" : "Continuar disputa"}.`}
      onPress={() =>
        router.push(
          summary
            ? `/tournament/${summary.tournamentId}?source=cloud`
            : `/tournament/${tournament!.id}`,
        )
      }
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
      <Text variant="caption" color={colors.muted} style={{ marginTop: 8 }}>
        {summary ? "Na nuvem" : "Neste dispositivo"}
        {summary
          ? ` · atualizado em ${new Date(summary.updatedAt).toLocaleDateString("pt-BR")}`
          : ""}
      </Text>
      <View style={[s.row, { marginTop: 22, marginBottom: 10 }]}>
        <View style={[s.row, { flexShrink: 1 }]}>
          <Icon name="people-outline" size={15} />
          <Text variant="caption">
            {count}/{t.capacity} participantes
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
          t.status === "draft" ? count / t.capacity : done / (t.capacity - 1)
        }
      />
      <View style={s.cardBottom}>
        <View style={{ flex: 1, gap: tokens.spacing.xs }}>
          <Text variant="caption" numberOfLines={1}>
            {champion
              ? `Campeão: ${champion}`
              : (nextNames ??
                (t.status === "draft"
                  ? "Vamos reunir a galera?"
                  : "Acompanhe a disputa"))}
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
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ id?: string; source?: string }>();
  const remote = useRemoteTournaments(),
    canManage =
      params.source !== "cloud" ||
      remote.details[params.id ?? ""]?.data?.access?.role === "organizer";
  const pressScale = useSharedValue(1);
  const feedback = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.get() }],
  }));
  useEffect(() => () => cancelAnimation(pressScale), [pressScale]);
  return (
    <InteractiveCard
      accessibilityRole="button"
      accessibilityLabel={`Partida ${m.positionIndex + 1}, ${t.rounds[m.roundIndex]?.label}`}
      accessibilityHint={`${participantLabel(t, m.participant1Id)} contra ${participantLabel(t, m.participant2Id)}.${m.status === "completed" ? ` Placar ${m.score1} a ${m.score2}. Vencedor: ${participantLabel(t, m.winnerId)}.` : m.status === "ready" ? (canManage ? " Registrar placar." : " Acompanhar confronto.") : " Aguardando resultados anteriores."}`}
      onPress={() =>
        router.push(
          `/match/${encodeURIComponent(m.id)}?tournamentId=${params.source === "cloud" ? params.id : t.id}${params.source === "cloud" ? "&source=cloud" : ""}`,
        )
      }
      onPressIn={() =>
        pressScale.set(
          reduced
            ? 1
            : withTiming(motion.scale.pressed, {
                duration: motion.duration.micro,
                easing: motion.easing.standard,
              }),
        )
      }
      onPressOut={() =>
        pressScale.set(
          reduced
            ? 1
            : withTiming(1, {
                duration: motion.duration.micro,
                easing: motion.easing.enter,
              }),
        )
      }
      style={[
        s.match,
        compact && { width: 240 },
        m.status === "ready" && { borderColor: colors.primary },
      ]}
    >
      <Animated.View style={feedback}>
        <Motion
          key={`${m.id}-${m.winnerId ?? "pending"}-${m.score1}-${m.score2}`}
        >
          <View style={{ gap: tokens.spacing.compact }}>
            <View style={[s.row, { flexWrap: "wrap" }]}>
              <Text variant="caption">JOGO {m.positionIndex + 1}</Text>
              <Text
                variant="caption"
                color={m.status === "ready" ? colors.primaryDark : colors.muted}
              >
                {m.status === "completed"
                  ? "✓ Encerrado"
                  : m.status === "ready"
                    ? canManage
                      ? "Registrar placar →"
                      : "Acompanhar confronto →"
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
                    compact && {
                      flexDirection: "column",
                      alignItems: "stretch",
                      gap: tokens.spacing.xs,
                    },
                    m.winnerId === id &&
                      id !== null && { backgroundColor: colors.primarySoft },
                    !!m.winnerId &&
                      m.winnerId !== id && { opacity: motion.opacity.subtle },
                  ]}
                >
                  {!compact ? (
                    <Avatar name={p?.displayName ?? "?"} size={30} />
                  ) : null}
                  <Text style={{ flex: compact ? undefined : 1, minWidth: 0 }}>
                    {participantLabel(t, id)}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: tokens.spacing.sm,
                      justifyContent: compact ? "space-between" : undefined,
                    }}
                  >
                    {compact ? (
                      <Text variant="caption" color={colors.muted}>
                        Placar
                      </Text>
                    ) : null}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: tokens.spacing.sm,
                      }}
                    >
                      {m.winnerId === id && !!id && (
                        <Icon
                          name="checkmark"
                          size={16}
                          color={colors.primaryDark}
                        />
                      )}
                      <Text variant="label" style={{ flexShrink: 0 }}>
                        {(i === 0 ? m.score1 : m.score2) ?? "—"}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </Motion>
      </Animated.View>
    </InteractiveCard>
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
  const { source } = useLocalSearchParams<{ source?: string }>();
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
          onPress={() =>
            router.replace(
              `/tournament/${id}/${tab.route}${source === "cloud" ? "?source=cloud" : ""}`,
            )
          }
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
