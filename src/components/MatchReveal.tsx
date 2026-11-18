import React, { useEffect } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeInDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type {
  Participant,
  Tournament,
} from "../features/tournaments/domain/types";
import { useCompetitionSequence } from "../hooks/useCompetitionSequence";
import { getDrawSequence, motion } from "../theme/motion";
import { colors, tokens } from "../theme/tokens";
import { Avatar, Button, Text } from "./ui";

function Entrant({
  participant,
  index,
  compact,
  shuffling,
  reduced,
}: {
  participant: Participant;
  index: number;
  compact: boolean;
  shuffling: boolean;
  reduced: boolean;
}) {
  const offset = useSharedValue(0);
  useEffect(() => {
    if (!shuffling || reduced) {
      offset.set(0);
      return;
    }
    const direction = index % 2 === 0 ? 1 : -1;
    const duration = motion.draw.shuffling / 3;
    offset.set(
      withSequence(
        withTiming(direction * motion.distance.shuffle, {
          duration,
          easing: motion.easing.standard,
        }),
        withTiming(-direction * motion.distance.shuffle, {
          duration,
          easing: motion.easing.standard,
        }),
        withTiming(0, { duration, easing: motion.easing.enter }),
      ),
    );
    return () => cancelAnimation(offset);
  }, [index, offset, reduced, shuffling]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.get() },
      {
        scale:
          1 -
          (Math.abs(offset.get()) / motion.distance.shuffle) *
            (motion.scale.selected - 1),
      },
    ],
  }));
  return (
    <Animated.View
      entering={
        reduced ? undefined : FadeInDown.duration(motion.duration.transition)
      }
      style={{ width: compact ? "25%" : "50%" }}
    >
      <Animated.View
        accessible
        accessibilityLabel={`Participante ${index + 1}: ${participant.displayName}`}
        style={[styles.entrant, { width: "100%" }, animatedStyle]}
      >
        <View style={styles.avatarRing}>
          <Avatar name={participant.displayName} size={compact ? 40 : 64} />
        </View>
        <Text
          variant="caption"
          color={colors.white}
          numberOfLines={2}
          style={{ textAlign: "center" }}
        >
          {participant.displayName}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function MatchPair({
  first,
  second,
  index,
  capacity,
  reduced,
}: {
  first: Participant | undefined;
  second: Participant | undefined;
  index: number;
  capacity: Tournament["capacity"];
  reduced: boolean;
}) {
  const delay =
    index *
    (capacity === 4 ? motion.duration.selection : tokens.motion.stagger);
  return (
    <Animated.View
      testID={`revealed-match-${index}`}
      entering={
        reduced
          ? undefined
          : FadeInDown.duration(motion.duration.transition).delay(delay)
      }
      style={styles.match}
    >
      <Text
        variant="label"
        color={colors.inverseSecondary}
        style={{ marginBottom: tokens.spacing.compact }}
      >
        CONFRONTO {String(index + 1).padStart(2, "0")}
      </Text>
      <View style={styles.pair}>
        <Contender participant={first} delay={delay} reduced={reduced} />
        <Animated.View
          entering={
            reduced
              ? undefined
              : ZoomIn.duration(motion.duration.transition).delay(delay)
          }
        >
          <Text variant="title" color={colors.primary} style={styles.versus}>
            VS
          </Text>
        </Animated.View>
        <Contender
          participant={second}
          delay={delay}
          reduced={reduced}
          reverse
        />
      </View>
    </Animated.View>
  );
}

function Contender({
  participant,
  delay,
  reduced,
  reverse = false,
}: {
  participant: Participant | undefined;
  delay: number;
  reduced: boolean;
  reverse?: boolean;
}) {
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    progress.set(
      reduced
        ? 1
        : withDelay(
            delay,
            withTiming(1, {
              duration: motion.duration.competition,
              easing: motion.easing.enter,
            }),
          ),
    );
    return () => cancelAnimation(progress);
  }, [delay, progress, reduced]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [
      {
        translateX:
          (1 - progress.get()) *
          motion.distance.confrontation *
          (reverse ? 1 : -1),
      },
      {
        scale: motion.scale.impact + (1 - motion.scale.impact) * progress.get(),
      },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.contender,
        { alignItems: reverse ? "flex-end" : "flex-start" },
        animatedStyle,
      ]}
    >
      <Avatar name={participant?.displayName ?? "?"} size={36} />
      <Text
        color={colors.white}
        style={{ textAlign: reverse ? "right" : "left", flexShrink: 1 }}
      >
        {participant?.displayName ?? "Participante indisponível"}
      </Text>
    </Animated.View>
  );
}

/** Presentation of already-persisted matches. This component never performs a draw. */
export function MatchReveal({
  tournament,
  reduced,
  ready = true,
  onComplete,
}: {
  tournament: Tournament;
  reduced: boolean;
  ready?: boolean;
  onComplete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const sequence = useCompetitionSequence({
    runKey: tournament.id,
    steps: getDrawSequence(tournament.capacity),
    reduced,
    ready,
    onComplete,
  });
  const showingMatches =
    sequence.phase === "revealing" ||
    sequence.phase === "holding" ||
    sequence.phase === "completed";
  const matches = tournament.matches
    .filter((match) => match.roundIndex === 0)
    .sort((a, b) => a.positionIndex - b.positionIndex);
  const compact = tournament.capacity > 4;
  const twoColumns = width >= tokens.breakpoints.tablet && fontScale < 1.6;
  const title = showingMatches
    ? "O DESTINO DA DISPUTA."
    : sequence.phase === "shuffling"
      ? "TODO MUNDO NO JOGO."
      : "OS CONFRONTOS ESTÃO CHEGANDO";
  return (
    <Modal
      visible
      animationType={reduced ? "none" : "fade"}
      onRequestClose={sequence.cancel}
    >
      <View testID="match-reveal" style={styles.screen}>
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.diagonal}
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingTop: tokens.spacing.lg + insets.top,
            paddingLeft: tokens.spacing.lg + insets.left,
            paddingRight: tokens.spacing.lg + insets.right,
            paddingBottom: tokens.spacing.lg,
          }}
        >
          <View style={styles.content}>
            <View style={styles.kicker}>
              <View style={styles.rule} />
              <Text variant="label" color={colors.primary}>
                SORTEIO OFICIAL / {String(tournament.capacity).padStart(2, "0")}{" "}
                JOGADORES
              </Text>
            </View>
            <Text
              variant="display"
              color={colors.white}
              accessibilityLiveRegion="polite"
              style={{
                fontSize: width < 360 ? 40 : 52,
                lineHeight: width < 360 ? 42 : 54,
                maxWidth: 620,
              }}
            >
              {title}
            </Text>
            <Text color={colors.inverseSecondary} style={{ maxWidth: 520 }}>
              {showingMatches
                ? "Os confrontos estão definidos. Que vença o melhor."
                : tournament.name}
            </Text>
            {showingMatches ? (
              <View testID="match-reveal-pairs" style={styles.matches}>
                {matches.map((match, index) => (
                  <View
                    key={match.id}
                    style={{ width: twoColumns ? "48.5%" : "100%" }}
                  >
                    <MatchPair
                      first={tournament.participants.find(
                        (p) => p.id === match.participant1Id,
                      )}
                      second={tournament.participants.find(
                        (p) => p.id === match.participant2Id,
                      )}
                      index={index}
                      capacity={tournament.capacity}
                      reduced={reduced}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <View testID="match-reveal-entrants" style={styles.entrants}>
                {tournament.participants.map((participant, index) => (
                  <Entrant
                    key={participant.id}
                    participant={participant}
                    index={index}
                    compact={compact}
                    shuffling={sequence.phase === "shuffling"}
                    reduced={reduced}
                  />
                ))}
              </View>
            )}
            <View style={styles.phaseRow}>
              {["preparing", "shuffling", "revealing"].map((phase, index) => (
                <View
                  key={phase}
                  style={[
                    styles.phaseMark,
                    {
                      backgroundColor:
                        phase === sequence.phase ||
                        sequence.phase === "completed" ||
                        sequence.phase === "holding"
                          ? colors.primary
                          : colors.inverseBorder,
                    },
                  ]}
                >
                  <Text
                    variant="label"
                    color={
                      phase === sequence.phase ||
                      sequence.phase === "completed" ||
                      sequence.phase === "holding"
                        ? colors.ink
                        : colors.inverseSecondary
                    }
                  >
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                </View>
              ))}
              <Text
                variant="caption"
                color={colors.inverseSecondary}
                style={{ flex: 1 }}
              >
                {showingMatches
                  ? "Confrontos definidos"
                  : sequence.phase === "shuffling"
                    ? "Preparando os pares"
                    : "A disputa vai começar"}
              </Text>
            </View>
          </View>
        </ScrollView>
        <View
          style={[
            styles.footer,
            {
              paddingBottom: tokens.spacing.lg + insets.bottom,
              paddingLeft: tokens.spacing.lg + insets.left,
              paddingRight: tokens.spacing.lg + insets.right,
            },
          ]}
        >
          <Button
            label={
              sequence.phase === "completed" || sequence.phase === "holding"
                ? "Ver chaveamento"
                : "Pular animação"
            }
            icon="arrow-forward"
            onPress={sequence.skip}
            style={{ width: "100%", maxWidth: 720 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, overflow: "hidden" },
  diagonal: {
    position: "absolute",
    right: -120,
    top: -100,
    width: 220,
    height: "130%",
    backgroundColor: colors.inverseSurface,
    transform: [{ skewX: "-12deg" }],
  },
  content: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 920,
    gap: tokens.spacing.lg,
  },
  kicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    flexWrap: "wrap",
  },
  rule: { width: 28, height: 3, backgroundColor: colors.primary },
  entrants: {
    flexDirection: "row",
    flexWrap: "wrap",
    maxWidth: 620,
    alignSelf: "center",
    width: "100%",
    paddingVertical: tokens.spacing.sm,
  },
  entrant: {
    alignItems: "center",
    gap: tokens.spacing.sm,
    padding: tokens.spacing.xs,
    minHeight: 108,
  },
  avatarRing: {
    padding: 4,
    borderWidth: 1,
    borderColor: colors.inverseBorder,
    borderRadius: tokens.radius.full,
  },
  matches: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: tokens.spacing.compact,
  },
  match: {
    padding: tokens.spacing.md,
    backgroundColor: colors.inverseSurface,
    borderWidth: 1,
    borderColor: colors.inverseBorder,
    borderLeftColor: colors.primary,
    borderLeftWidth: tokens.border.emphasis,
    borderRadius: tokens.radius.sm,
  },
  pair: { flexDirection: "row", alignItems: "center", gap: tokens.spacing.sm },
  contender: {
    flex: 1,
    gap: tokens.spacing.sm,
    alignItems: "flex-start",
    minWidth: 0,
  },
  versus: {
    fontSize: 34,
    lineHeight: 36,
    paddingHorizontal: tokens.spacing.xs,
  },
  phaseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  phaseMark: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ skewX: "-8deg" }],
  },
  footer: {
    alignItems: "center",
    paddingTop: tokens.spacing.compact,
    backgroundColor: colors.ink,
  },
});
