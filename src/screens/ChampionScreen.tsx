import React, { useEffect, useState } from "react";
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
import { colors } from "../theme/tokens";

function Confetti({ index }: { index: number }) {
  const y = useSharedValue(-50),
    spin = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(
      index * 55,
      withTiming(620, {
        duration: 2100 + index * 60,
        easing: Easing.in(Easing.quad),
      }),
    );
    spin.value = withTiming(index % 2 === 0 ? 360 : -360, { duration: 2800 });
  }, [index, y, spin]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { rotate: `${spin.value}deg` }],
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
    wide = useWindowDimensions().width >= 700;
  const [feedback, setFeedback] = useState(""),
    [shareFallback, setShareFallback] = useState(false);
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
          onAction={() => router.replace(`/tournament/${id}/bracket`)}
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
        {!reduced &&
          Array.from({ length: 24 }, (_, i) => <Confetti key={i} index={i} />)}
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
          style={{ alignItems: "center", gap: 10 }}
        >
          <Text
            variant="display"
            color={colors.primary}
            style={{ fontSize: wide ? 88 : 64, lineHeight: wide ? 92 : 70 }}
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
            flexDirection: "row",
            gap: wide ? 48 : 24,
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
            <View key={item.label} style={{ alignItems: "center", gap: 4 }}>
              <Text
                variant="title"
                color={colors.white}
                style={{ fontSize: 36, lineHeight: 40 }}
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
            onPress={async () => {
              try {
                const result = await shareText(message);
                setFeedback(
                  result === "copied"
                    ? "Texto copiado. Cole onde quiser compartilhar."
                    : result === "shared"
                      ? "Compartilhamento aberto."
                      : "",
                );
              } catch {
                setShareFallback(true);
                setFeedback(
                  "Selecione o texto abaixo para copiar e compartilhar.",
                );
              }
            }}
          />
          <Button
            label="Ver todos os resultados"
            variant="outline"
            style={{ backgroundColor: colors.white }}
            onPress={() => router.replace(`/tournament/${id}/bracket`)}
          />
        </View>
      </View>
      {feedback && (
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
