import React, { type ReactNode, useCallback, useEffect } from "react";
import { View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { Button, Icon, Text } from "./ui";
import { useCompetitionSequence } from "../hooks/useCompetitionSequence";
import { useMotionPreference } from "../hooks/useReducedMotion";
import { championSequence, motion } from "../theme/motion";
import { colors, tokens } from "../theme/tokens";
import type { RankingEntry } from "../features/tournaments/domain/types";

export interface ChampionFinalResult {
  name1: string;
  name2: string;
  score1: number;
  score2: number;
}

const confettiCount = 24;
const celebrationStartsAt = championSequence
  .filter((step) => step.phase !== "celebrating")
  .reduce((total, step) => total + step.duration, 0);

function Confetti({ index }: { index: number }) {
  const y = useSharedValue(-50),
    spin = useSharedValue(0);
  useEffect(() => {
    y.set(
      withDelay(
        celebrationStartsAt + index * 30,
        withTiming(900, {
          duration: 1600 + index * 20,
          easing: motion.easing.exit,
        }),
      ),
    );
    spin.set(
      withDelay(
        celebrationStartsAt,
        withTiming(index % 2 === 0 ? 240 : -240, {
          duration: motion.duration.competition * 2,
        }),
      ),
    );
    return () => {
      cancelAnimation(y);
      cancelAnimation(spin);
    };
  }, [index, y, spin]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() }, { rotate: `${spin.get()}deg` }],
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: `${(index * 37) % 100}%`,
          width: index % 2 === 0 ? 6 : 9,
          height: 13,
          backgroundColor: index % 3 === 0 ? colors.white : colors.primary,
          opacity: 0.8,
        },
        style,
      ]}
    />
  );
}

function RevealContent({
  animate,
  children,
}: {
  animate: boolean;
  children: ReactNode;
}) {
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate)
      progress.set(
        withTiming(1, {
          duration: motion.duration.competition,
          easing: motion.easing.enter,
        }),
      );
    else {
      cancelAnimation(progress);
      progress.set(1);
    }
    return () => cancelAnimation(progress);
  }, [animate, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * motion.distance.enter }],
  }));
  return (
    <Animated.View
      style={[{ width: "100%", alignItems: "center", gap: 10 }, style]}
    >
      {children}
    </Animated.View>
  );
}

function Trophy({ animate }: { animate: boolean }) {
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate)
      progress.set(
        withTiming(1, {
          duration: motion.duration.competition,
          easing: motion.easing.impact,
        }),
      );
    else {
      cancelAnimation(progress);
      progress.set(1);
    }
    return () => cancelAnimation(progress);
  }, [animate, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [
      {
        scale: motion.scale.impact + (1 - motion.scale.impact) * progress.get(),
      },
      { rotate: `${-6 * (1 - progress.get())}deg` },
    ],
  }));
  return (
    <Animated.View
      testID="champion-trophy"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: 104,
          height: 104,
          backgroundColor: colors.primary,
          borderRadius: tokens.radius.md,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Icon name="trophy-outline" size={72} />
    </Animated.View>
  );
}

export function ChampionReveal({
  runKey,
  championName,
  tournamentName,
  modality,
  entry,
  finalResult,
  actions,
}: {
  runKey: string;
  championName: string;
  tournamentName: string;
  modality: string;
  entry: RankingEntry;
  finalResult: ChampionFinalResult | null;
  actions: ReactNode;
}) {
  const { reduced, ready } = useMotionPreference();
  const { phase, skip, cancel } = useCompetitionSequence({
    runKey,
    steps: championSequence,
    reduced,
    ready,
  });
  useFocusEffect(useCallback(() => () => cancel(), [cancel]));
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= tokens.breakpoints.tablet && fontScale < 1.6;
  const largeText = fontScale >= 1.6;
  const terminal = ["completed", "skipped", "cancelled"].includes(phase);
  const running = ready && !reduced && !terminal && phase !== "idle";
  const revealed =
    (ready && reduced) || terminal || !["idle", "preparing"].includes(phase);
  const trophyVisible =
    (ready && reduced) || terminal || ["trophy", "celebrating"].includes(phase);

  return (
    <View
      testID="champion-reveal"
      style={{
        backgroundColor: colors.ink,
        borderRadius: tokens.radius.hero,
        overflow: "hidden",
        padding: wide ? tokens.spacing.xxl : tokens.spacing.lg,
        alignItems: "center",
        gap: tokens.spacing.lg,
      }}
    >
      {running && (
        <View
          testID="champion-confetti"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
        >
          {Array.from({ length: confettiCount }, (_, i) => (
            <Confetti key={i} index={i} />
          ))}
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          width: "100%",
        }}
      >
        <View
          style={{
            width: 26,
            height: 4,
            backgroundColor: colors.primary,
            transform: [{ skewX: "-18deg" }],
          }}
        />
        <Text variant="label" color={colors.inverseMuted} style={{ flex: 1 }}>
          RESULTADO OFICIAL
        </Text>
      </View>
      {running && (
        <Button
          label="Pular celebração"
          variant="outline"
          style={{ backgroundColor: colors.white, alignSelf: "center" }}
          onPress={skip}
        />
      )}
      <View
        style={{
          alignItems: "center",
          gap: 20,
          minHeight: 306,
          width: "100%",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            minHeight: 104,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {trophyVisible ? (
            <Trophy animate={running} />
          ) : (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ gap: 8, transform: [{ skewX: "-18deg" }] }}
            >
              <View
                style={{
                  width: 88,
                  height: 12,
                  backgroundColor: colors.primary,
                }}
              />
              <View
                style={{
                  width: 56,
                  height: 12,
                  backgroundColor: colors.white,
                  marginLeft: 32,
                }}
              />
            </View>
          )}
        </View>
        {revealed ? (
          <RevealContent animate={running}>
            <Text
              variant="display"
              color={colors.primary}
              style={{
                fontSize: wide ? 88 : 64,
                lineHeight: wide ? 92 : 70,
                textAlign: "center",
                maxWidth: "100%",
              }}
            >
              Campeão!
            </Text>
            <Text
              variant="display"
              color={colors.white}
              accessibilityLiveRegion="polite"
              style={{
                fontSize: wide ? 64 : 44,
                lineHeight: wide ? 70 : 50,
                textAlign: "center",
                width: "100%",
              }}
            >
              {championName}
            </Text>
          </RevealContent>
        ) : (
          <View style={{ gap: 10, alignItems: "center" }}>
            <Text
              variant="display"
              color={colors.white}
              style={{
                fontSize: wide ? 58 : 42,
                lineHeight: wide ? 64 : 48,
                textAlign: "center",
              }}
            >
              A disputa tem um nome no topo.
            </Text>
            <Text color={colors.inverseMuted}>Resultado confirmado.</Text>
          </View>
        )}
        <Text color={colors.inverseMuted} style={{ textAlign: "center" }}>
          {tournamentName} · {modality}
        </Text>
      </View>
      {revealed && (
        <>
          {finalResult !== null && (
            <View
              testID="champion-final-result"
              style={{
                backgroundColor: colors.inverseSurface,
                padding: tokens.spacing.lg,
                borderRadius: tokens.radius.md,
                gap: 12,
                width: "100%",
                maxWidth: 560,
              }}
            >
              <Text
                variant="label"
                color={colors.inverseMuted}
                style={{ textAlign: "center" }}
              >
                RESULTADO DA FINAL
              </Text>
              <Text
                variant="display"
                color={colors.white}
                accessibilityLabel={`Placar da final: ${finalResult.name1} ${finalResult.score1}, ${finalResult.name2} ${finalResult.score2}`}
                style={{
                  fontSize: largeText
                    ? 24
                    : String(finalResult.score1).length > 5 ||
                        String(finalResult.score2).length > 5
                      ? 32
                      : 44,
                  lineHeight: 50,
                  textAlign: "center",
                }}
              >
                {`${finalResult.score1} × ${finalResult.score2}`}
              </Text>
              <View
                style={{ flexDirection: largeText ? "column" : "row", gap: 16 }}
              >
                {[finalResult.name1, finalResult.name2].map((name, index) => (
                  <Text
                    key={index}
                    color={colors.white}
                    style={{
                      flex: largeText ? undefined : 1,
                      minWidth: 0,
                      textAlign: "center",
                    }}
                  >
                    {name}
                  </Text>
                ))}
              </View>
              {finalResult.score1 === finalResult.score2 && (
                <Text
                  variant="caption"
                  color={colors.inverseMuted}
                  style={{ textAlign: "center" }}
                >
                  {`Desempate vencido por ${championName}.`}
                </Text>
              )}
            </View>
          )}
          <View
            style={{
              flexDirection: largeText ? "column" : "row",
              flexWrap: "wrap",
              gap: 16,
              paddingVertical: 20,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.inverseBorder,
              width: "100%",
              maxWidth: 560,
              justifyContent: "center",
            }}
          >
            {[
              { n: entry.wins, label: "Vitórias" },
              { n: entry.pointsFor, label: "Pontos" },
              {
                n: `${Math.round(entry.winRate * 100)}%`,
                label: "Aproveitamento",
              },
            ].map((item) => (
              <View
                key={item.label}
                style={{
                  alignItems: "center",
                  gap: 4,
                  minWidth: 0,
                  flex: largeText ? undefined : 1,
                }}
              >
                <Text
                  variant="title"
                  color={colors.white}
                  style={{
                    fontSize: String(item.n).length > 6 ? 24 : 32,
                    lineHeight: 40,
                    textAlign: "center",
                  }}
                >
                  {item.n}
                </Text>
                <Text
                  variant="caption"
                  color={colors.inverseMuted}
                  style={{ textAlign: "center" }}
                >
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
          <Text
            color={colors.inverseMuted}
            style={{ textAlign: "center", maxWidth: 420 }}
          >
            A disputa acaba. A história fica. Até o próximo campeonato!
          </Text>
        </>
      )}
      <View style={{ gap: 12, width: "100%", maxWidth: 360 }}>{actions}</View>
    </View>
  );
}
