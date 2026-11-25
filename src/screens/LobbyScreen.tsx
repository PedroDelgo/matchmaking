import React, { useCallback, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeInDown,
  LinearTransition,
  ZoomIn,
} from "react-native-reanimated";
import { Shell } from "../components/Shell";
import { MatchReveal } from "../components/MatchReveal";
import {
  Text,
  Button,
  Panel,
  Field,
  Avatar,
  PageHeading,
  Progress,
  Notice,
  Chip,
  Icon,
  ConfirmDialog,
} from "../components/ui";
import { TournamentTabs, MissingTournament } from "../components/tournament";
import { useAppStore } from "../store/useAppStore";
import { useMotionPreference } from "../hooks/useReducedMotion";
import { motion } from "../theme/motion";
import { colors, tokens } from "../theme/tokens";
import { useTournament } from "../features/tournaments/useTournament";
import { RemoteTournamentNotice } from "../components/RemoteTournamentNotice";
import { ImportTournament } from "../components/ImportTournament";
import { useAuth } from "../features/auth/AuthProvider";
import { InviteManager } from "../components/InviteManager";

export function LobbyScreen() {
  const { id, created } = useLocalSearchParams<{
    id: string;
    created?: string;
  }>();
  const source = useTournament(),
    t = source.tournament,
    auth = useAuth();
  const localProfile = useAppStore((s) => s.profile),
    profile = source.cloud
      ? { id: "", nickname: auth.profile?.nickname ?? "Sua conta" }
      : localProfile;
  const operationRef = useRef(false),
    suffix = source.cloud ? "?source=cloud" : "";
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    [removeId, setRemoveId] = useState<string | null>(null),
    [deleting, setDeleting] = useState(false),
    [drawing, setDrawing] = useState(false);
  const wide = useWindowDimensions().width >= tokens.breakpoints.desktop,
    { reduced, ready } = useMotionPreference();
  const drawingRef = useRef(false);
  useFocusEffect(
    useCallback(
      () => () => {
        // Router may keep this screen mounted underneath another route. Losing
        // focus closes presentation only; the already-saved draw stays intact.
        drawingRef.current = false;
        setDrawing(false);
      },
      [],
    ),
  );
  const finishDrawing = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setDrawing(false);
    router.replace(`/tournament/${id}/bracket${suffix}`);
  }, [id, suffix]);
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
  const full = t.participants.length === t.capacity,
    hasProfile = t.participants.some((p) => p.profileId === profile.id);
  const duplicate =
    !!name.trim() &&
    t.participants.some(
      (p) =>
        p.displayName.toLocaleLowerCase("pt-BR") ===
        name.trim().toLocaleLowerCase("pt-BR"),
    );
  const add = async (n: string, profileId?: string) => {
    if (operationRef.current) return;
    operationRef.current = true;
    try {
      await source.add(n, profileId);
      setName("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      operationRef.current = false;
    }
  };
  const start = async () => {
    // Read the current store as well as the ref: reduced motion may finish
    // synchronously before a second activation of the previous render arrives.
    const current = source.cloud
      ? t
      : useAppStore.getState().tournaments.find((item) => item.id === id);
    if (drawingRef.current || current?.status !== "draft") return;
    drawingRef.current = true;
    try {
      await source.start();
      if (ready && reduced) finishDrawing();
      else setDrawing(true);
    } catch (e) {
      drawingRef.current = false;
      setError((e as Error).message);
    }
  };
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
        description={
          source.cloud
            ? `${t.capacity} vagas · ${source.canManage ? "Você organiza" : source.access?.role === "participant" ? "Você participa" : "Você acompanha"}`
            : `${t.capacity} vagas · Organizador: ${profile.nickname}`
        }
        action={
          <Chip
            label={
              t.status === "draft"
                ? full
                  ? "Sala completa"
                  : "Aguardando participantes"
                : t.status === "completed"
                  ? "Finalizado"
                  : "Torneio iniciado"
            }
            tone="orange"
          />
        }
      />
      <TournamentTabs id={id} active="lobby" />
      {created === "1" && t.status === "draft" && (
        <View style={{ marginBottom: 20 }}>
          <Notice
            tone="success"
            message="Campeonato criado! Agora é hora de reunir a galera."
          />
        </View>
      )}
      <View style={{ flexDirection: wide ? "row" : "column", gap: 24 }}>
        <View style={{ flex: 1, gap: 20 }}>
          <Panel style={{ gap: 16 }}>
            <View
              style={{
                flexDirection: wide ? "row" : "column",
                justifyContent: "space-between",
                alignItems: wide ? "center" : "flex-start",
                gap: 8,
              }}
            >
              <Text variant="title">A galera da disputa</Text>
              <Text variant="label" accessibilityLiveRegion="polite">
                {t.participants.length}/{t.capacity} confirmados
              </Text>
            </View>
            <Progress
              value={t.participants.length / t.capacity}
              label={`${t.participants.length} de ${t.capacity} participantes confirmados`}
            />
            {full && t.status === "draft" && (
              <Animated.View
                entering={
                  reduced
                    ? undefined
                    : FadeInDown.duration(motion.duration.transition)
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: tokens.spacing.compact,
                  padding: tokens.spacing.compact,
                  backgroundColor: colors.primarySoft,
                  borderLeftWidth: tokens.border.emphasis,
                  borderLeftColor: colors.primary,
                  borderRadius: tokens.radius.sm,
                }}
              >
                <Icon
                  name="checkmark-circle-outline"
                  size={24}
                  color={colors.primaryDark}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="heading">Todo mundo confirmado.</Text>
                  <Text variant="caption" color={colors.muted}>
                    {source.canManage
                      ? "A sala está pronta. Você decide quando sortear."
                      : "A sala está pronta. Aguarde o sorteio do organizador."}
                  </Text>
                </View>
              </Animated.View>
            )}
            {t.status === "draft" && source.canManage && (
              <>
                <View
                  style={{
                    flexDirection: wide ? "row" : "column",
                    gap: 12,
                    alignItems: wide ? "flex-end" : undefined,
                  }}
                >
                  <Field
                    label="Nome ou apelido"
                    value={name}
                    maxLength={40}
                    placeholder="Quem vai jogar?"
                    onChangeText={(n) => {
                      setName(n);
                      setError("");
                    }}
                    onSubmitEditing={() => add(name)}
                    editable={!full && !source.busy}
                    containerStyle={{ flex: 1 }}
                  />
                  <Button
                    label="Adicionar"
                    icon="add"
                    disabled={full || source.busy}
                    onPress={() => add(name)}
                  />
                </View>
                {duplicate && (
                  <Notice message="Esse apelido já está na sala. Você pode adicionar outro jogador com o mesmo nome; cada um terá sua própria identificação." />
                )}
                {!!error && <Notice tone="error" message={error} />}
                {!source.cloud ? (
                  <Button
                    label={
                      hasProfile
                        ? "Você está na disputa ✓"
                        : "Eu também vou jogar"
                    }
                    variant="outline"
                    icon="person-add-outline"
                    disabled={hasProfile || full}
                    onPress={() => add(profile.nickname, profile.id)}
                  />
                ) : null}
              </>
            )}
            <View style={{ gap: 8 }}>
              {Array.from({ length: t.capacity }, (_, i) => {
                const p = t.participants[i];
                return (
                  <Animated.View
                    key={p?.id ?? `slot-${i}`}
                    entering={
                      p && !reduced
                        ? FadeInDown.duration(motion.duration.selection)
                        : undefined
                    }
                    layout={
                      reduced
                        ? undefined
                        : LinearTransition.duration(motion.duration.selection)
                    }
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      borderWidth: 1,
                      borderStyle: p ? "solid" : "dashed",
                      borderColor: colors.border,
                      borderRadius: 8,
                      minHeight: 60,
                      backgroundColor: p ? colors.surface : colors.background,
                    }}
                  >
                    {p ? (
                      <Animated.View
                        entering={
                          reduced
                            ? undefined
                            : ZoomIn.duration(motion.duration.selection)
                        }
                      >
                        <Avatar name={p.displayName} />
                      </Animated.View>
                    ) : (
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text color={colors.muted}>
                          {String(i + 1).padStart(2, "0")}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text color={p ? colors.ink : colors.muted}>
                        {p?.displayName ?? "Vaga esperando um rival"}
                      </Text>
                      {p && (
                        <Text variant="caption" color={colors.muted}>
                          {(
                            source.cloud
                              ? source.access?.participantId === p.id
                              : p.profileId === profile.id
                          )
                            ? "Você · "
                            : ""}
                          Jogador {i + 1}
                        </Text>
                      )}
                    </View>
                    {p && t.status === "draft" && source.canManage && (
                      <Button
                        label="Remover"
                        variant="ghost"
                        accessibilityLabel={`Remover ${p.displayName}, jogador ${i + 1}`}
                        onPress={() => setRemoveId(p.id)}
                        style={{ paddingHorizontal: 6 }}
                      />
                    )}
                  </Animated.View>
                );
              })}
            </View>
          </Panel>
          {t.status === "draft" && !source.cloud && (
            <Panel style={{ gap: 12 }}>
              <Chip label="Ferramenta de demonstração" />
              <Text color={colors.muted}>
                Quer testar o fluxo? Preencha as vagas restantes com nomes de
                exemplo.
              </Text>
              <Button
                label="Preencher com participantes de exemplo"
                variant="outline"
                disabled={full}
                onPress={() => {
                  try {
                    useAppStore.getState().fillExamples(id);
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            </Panel>
          )}
        </View>
        <View style={{ width: wide ? 320 : undefined, gap: 20 }}>
          <Panel
            style={{
              gap: 18,
              borderTopWidth: 3,
              borderTopColor: colors.primary,
            }}
          >
            <Icon name="git-network-outline" size={30} />
            <Text variant="title">Quem enfrenta quem?</Text>
            <Text color={colors.muted}>
              {t.status === "draft"
                ? "Complete a sala e deixe o sorteio definir os confrontos. Daqui até o troféu, vale cada ponto."
                : "Os confrontos já foram sorteados e estão salvos. A disputa continua no chaveamento."}
            </Text>
            <Text variant="caption" color={colors.muted}>
              {Math.log2(t.capacity)} rodadas · {t.capacity - 1} partidas
            </Text>
            <Button
              label={
                t.status === "draft" ? "Sortear confrontos" : "Ver chaveamento"
              }
              icon="shuffle"
              disabled={
                source.busy ||
                (t.status === "draft" && (!full || !source.canManage))
              }
              onPress={() =>
                t.status === "draft"
                  ? start()
                  : router.push(source.href("bracket"))
              }
            />
            {t.status === "draft" && !full && (
              <Text variant="caption" color={colors.muted}>
                Faltam {t.capacity - t.participants.length} participantes para
                começar.
              </Text>
            )}
          </Panel>
          {source.cloud ? (
            <InviteManager
              key={`${source.id}:${source.client?.userId}`}
              tournamentId={source.id}
              canManage={source.canManage}
              status={t.status}
            />
          ) : (
            <Panel style={{ gap: 16 }}>
              <Text variant="heading">Convide a galera</Text>
              <Chip label="Campeonato local" />
              <Text color={colors.muted}>
                Para convidar amigos por link, código ou QR, salve uma cópia na
                sua conta. O original continua neste dispositivo.
              </Text>
            </Panel>
          )}
          {!source.cloud ? (
            <Button
              label="Excluir campeonato"
              variant="ghost"
              icon="trash-outline"
              onPress={() => setDeleting(true)}
            />
          ) : null}
        </View>
      </View>
      <ConfirmDialog
        visible={!!removeId}
        title="Remover participante?"
        description="A vaga ficará disponível para outro jogador."
        confirmLabel="Remover"
        destructive
        onCancel={() => setRemoveId(null)}
        onConfirm={async () => {
          if (operationRef.current) return;
          operationRef.current = true;
          try {
            if (removeId) await source.remove(removeId);
            setRemoveId(null);
            setError("");
          } catch (e) {
            setError((e as Error).message);
            setRemoveId(null);
          } finally {
            operationRef.current = false;
          }
        }}
      />
      <ConfirmDialog
        visible={deleting}
        title="Excluir campeonato?"
        description="O campeonato e todos os seus resultados serão apagados deste dispositivo. Essa ação não pode ser desfeita."
        confirmLabel="Excluir campeonato"
        destructive
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          useAppStore.getState().deleteTournament(id);
          router.replace("/tournaments");
        }}
      />
      {drawing && (
        <MatchReveal
          tournament={t}
          reduced={reduced}
          ready={ready}
          onComplete={finishDrawing}
        />
      )}
    </Shell>
  );
}
