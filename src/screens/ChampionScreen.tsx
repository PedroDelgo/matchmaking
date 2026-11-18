import React, { useEffect, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeInDown,
  ZoomIn,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { Shell } from "../components/Shell";
import {
  Text,
  Button,
  Panel,
  Icon,
  EmptyState,
  Notice,
} from "../components/ui";
import { MissingTournament } from "../components/tournament";
import { useAppStore } from "../store/useAppStore";
import { getRanking } from "../features/tournaments/engine/tournament";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { shareText } from "../utils/share";
import { colors, tokens } from "../theme/tokens";

const confettiCount = 24;
// The final particle finishes after 4,745 ms. Remove the decorative layer too.
const celebrationDuration = 5000;

function Confetti({ index }: { index: number }) {
  const y = useSharedValue(-50),
    spin = useSharedValue(0);
  useEffect(() => {
    y.set(
      withDelay(
        index * 55,
        withTiming(620, {
          duration: 2100 + index * 60,
          easing: Easing.in(Easing.quad),
        }),
      ),
    );
    spin.set(withTiming(index % 2 === 0 ? 360 : -360, { duration: 2800 }));
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
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: `${(index * 37) % 100}%`,
          width: 6,
          height: 13,
          backgroundColor: index % 3 === 0 ? colors.white : colors.primary,
          opacity: 0.8,
        },
        style,
      ]}
    />
  );
}
export function ChampionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    t = useAppStore((s) => s.tournaments.find((t) => t.id === id));
  const reduced = useReducedMotion(),
    { width, fontScale } = useWindowDimensions(),
    wide = width >= tokens.breakpoints.tablet && fontScale < 1.6;
  const [feedback, setFeedback] = useState(""),
    [shareFallback, setShareFallback] = useState(false),
    [sharing, setSharing] = useState(false),
    [finishedCelebration, setFinishedCelebration] = useState<string | null>(
      null,
    );
  const celebrationKey = t?.championId ? `${t.id}:${t.championId}` : null;
  const sharingRef = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (reduced || !celebrationKey) return;
    const timeout = setTimeout(
      () => setFinishedCelebration(celebrationKey),
      celebrationDuration,
    );
    return () => clearTimeout(timeout);
  }, [reduced, celebrationKey]);
  if (!t)
    return (
      <Shell>
        <MissingTournament />
      </Shell>
    );
  const champion = t.participants.find((p) => p.id === t.championId),
    entry = getRanking(t).find((p) => p.participantId === t.championId);
  if (!champion || !entry)
    return (
      <Shell>
        <EmptyState
          title="O troféu ainda está em jogo."
          description="Conclua a final para descobrir quem leva esse campeonato."
          actionLabel="Ver chaveamento"
          onAction={() => router.dismissTo(`/tournament/${id}/bracket`)}
        />
      </Shell>
    );
  const message = `${champion.displayName} venceu ${t.name} no Matchmaking! ${entry.wins} vitórias e ${entry.pointsFor} pontos na disputa de ${t.modality}.`;
  return (
    <Shell>
      <View
        style={{
          backgroundColor: colors.ink,
          borderRadius: 16,
          overflow: "hidden",
          padding: wide ? 52 : 24,
          alignItems: "center",
          gap: 22,
          minHeight: 620,
        }}
      >
        {!reduced && finishedCelebration !== celebrationKey && (
          <View
            testID="champion-confetti"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            }}
          >
            {Array.from({ length: confettiCount }, (_, i) => (
              <Confetti key={i} index={i} />
            ))}
          </View>
        )}
        <Text variant="label" color={colors.primary}>
          A RESENHA TEM UM NOME NO TOPO.
        </Text>
        <Animated.View
          entering={reduced ? undefined : ZoomIn.duration(450)}
          style={{
            marginTop: 12,
            width: 120,
            height: 128,
            backgroundColor: colors.primary,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ rotate: "-6deg" }],
          }}
        >
          <Icon name="trophy-outline" size={80} />
        </Animated.View>
        <Animated.View
          entering={reduced ? undefined : FadeInDown.delay(200).duration(400)}
          style={{ alignItems: "center", gap: 10, width: "100%" }}
        >
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
            style={{
              fontSize: wide ? 64 : 44,
              lineHeight: wide ? 70 : 50,
              textAlign: "center",
              width: "100%",
            }}
          >
            {champion.displayName}
          </Text>
          <Text color={colors.inverseMuted} style={{ textAlign: "center" }}>
            {t.name} · {t.modality}
          </Text>
        </Animated.View>
        <View
          style={{
            flexDirection: wide ? "row" : "column",
            flexWrap: "wrap",
            gap: wide ? 32 : 20,
            paddingVertical: 24,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: colors.inverseBorder,
            width: "100%",
            maxWidth: 500,
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
                flexShrink: 1,
              }}
            >
              <Text
                variant="title"
                color={colors.white}
                style={{ fontSize: 36, lineHeight: 44, textAlign: "center" }}
              >
                {item.n}
              </Text>
              <Text variant="caption" color={colors.inverseMuted}>
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
        <View style={{ gap: 12, width: "100%", maxWidth: 360 }}>
          <Button
            label="Compartilhar conquista"
            icon="share-social-outline"
            loading={sharing}
            onPress={async () => {
              if (sharingRef.current) return;
              sharingRef.current = true;
              setSharing(true);
              setShareFallback(false);
              setFeedback("");
              try {
                const result = await shareText(message);
                if (!mounted.current) return;
                setFeedback(
                  result === "copied"
                    ? "Texto copiado. Cole onde quiser compartilhar."
                    : result === "shared"
                      ? "Compartilhamento aberto."
                      : "",
                );
              } catch {
                if (!mounted.current) return;
                setShareFallback(true);
                setFeedback(
                  "Selecione o texto abaixo para copiar e compartilhar.",
                );
              } finally {
                sharingRef.current = false;
                if (mounted.current) setSharing(false);
              }
            }}
          />
          <Button
            label="Ver todos os resultados"
            variant="outline"
            style={{ backgroundColor: colors.white }}
            onPress={() => router.dismissTo(`/tournament/${id}/bracket`)}
          />
        </View>
      </View>
      {!!feedback && (
        <View style={{ marginTop: 16 }}>
          <Notice message={feedback} />
        </View>
      )}
      {shareFallback && (
        <Panel style={{ marginTop: 16 }}>
          <Text selectable>{message}</Text>
        </Panel>
      )}
    </Shell>
  );
}
