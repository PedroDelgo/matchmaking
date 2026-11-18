import React, { useEffect, useState } from "react";
import { View, Modal, ScrollView, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeInDown,
  SlideInLeft,
  SlideInRight,
} from "react-native-reanimated";
import { Shell } from "../components/Shell";
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
import { useReducedMotion } from "../hooks/useReducedMotion";
import { colors } from "../theme/tokens";

export function LobbyScreen() {
  const { id, created } = useLocalSearchParams<{
    id: string;
    created?: string;
  }>();
  const t = useAppStore((s) => s.tournaments.find((t) => t.id === id)),
    profile = useAppStore((s) => s.profile);
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    [removeId, setRemoveId] = useState<string | null>(null),
    [deleting, setDeleting] = useState(false),
    [drawing, setDrawing] = useState(false);
  const wide = useWindowDimensions().width >= 960,
    reduced = useReducedMotion();
  useEffect(() => {
    if (!drawing) return;
    const timeout = setTimeout(() => {
      setDrawing(false);
      router.replace(`/tournament/${id}/bracket`);
    }, 2600);
    return () => clearTimeout(timeout);
  }, [drawing, id]);
  if (!t)
    return (
      <Shell>
        <MissingTournament />
      </Shell>
    );
  const full = t.participants.length === t.capacity,
    hasProfile = t.participants.some((p) => p.profileId === profile.id);
  const duplicate =
    name.trim() &&
    t.participants.some(
      (p) =>
        p.displayName.toLocaleLowerCase("pt-BR") ===
        name.trim().toLocaleLowerCase("pt-BR"),
    );
  const add = (n: string, profileId?: string) => {
    try {
      useAppStore.getState().add(id, n, profileId);
      setName("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const start = () => {
    try {
      useAppStore.getState().start(id);
      if (reduced) router.replace(`/tournament/${id}/bracket`);
      else setDrawing(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Shell>
      <PageHeading
        eyebrow={`${t.modality} / MATA-MATA`}
        title={t.name}
        description={`${t.capacity} vagas · Organizador: ${profile.nickname}`}
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
              <Text variant="label">
                {t.participants.length}/{t.capacity} confirmados
              </Text>
            </View>
            <Progress value={t.participants.length / t.capacity} />
            {t.status === "draft" && (
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
                    editable={!full}
                    containerStyle={{ flex: 1 }}
                  />
                  <Button
                    label="Adicionar"
                    icon="add"
                    disabled={full}
                    onPress={() => add(name)}
                  />
                </View>
                {duplicate && (
                  <Notice message="Esse apelido já está na sala. Você pode adicionar outro jogador com o mesmo nome; cada um terá sua própria identificação." />
                )}
                {!!error && <Notice tone="error" message={error} />}
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
              </>
            )}
            <View style={{ gap: 8 }}>
              {Array.from({ length: t.capacity }, (_, i) => {
                const p = t.participants[i];
                return (
                  <View
                    key={p?.id ?? `slot-${i}`}
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
                      <Avatar name={p.displayName} />
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
                          {p.profileId === profile.id ? "Você · " : ""}Jogador{" "}
                          {i + 1}
                        </Text>
                      )}
                    </View>
                    {p && t.status === "draft" && (
                      <Button
                        label="Remover"
                        variant="ghost"
                        accessibilityLabel={`Remover ${p.displayName}, jogador ${i + 1}`}
                        onPress={() => setRemoveId(p.id)}
                        style={{ paddingHorizontal: 6 }}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          </Panel>
          {t.status === "draft" && (
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
              disabled={t.status === "draft" && !full}
              onPress={() =>
                t.status === "draft"
                  ? start()
                  : router.push(`/tournament/${id}/bracket`)
              }
            />
            {t.status === "draft" && !full && (
              <Text variant="caption" color={colors.muted}>
                Faltam {t.capacity - t.participants.length} participantes para
                começar.
              </Text>
            )}
          </Panel>
          <Panel style={{ gap: 16 }}>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text variant="heading">Convide a galera</Text>
              <Chip label="Em breve" />
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-around",
                paddingVertical: 8,
              }}
            >
              {[
                { icon: "link-outline" as const, label: "Link" },
                { icon: "qr-code-outline" as const, label: "QR Code" },
                { icon: "keypad-outline" as const, label: "Código" },
              ].map((item) => (
                <View
                  key={item.label}
                  accessibilityState={{ disabled: true }}
                  style={{ alignItems: "center", gap: 8 }}
                >
                  <Icon name={item.icon} size={24} color={colors.muted} />
                  <Text variant="caption" color={colors.muted}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
            <Text variant="caption" color={colors.muted}>
              Nesta versão, os participantes são adicionados por você, neste
              dispositivo.
            </Text>
          </Panel>
          <Button
            label="Excluir campeonato"
            variant="ghost"
            icon="trash-outline"
            onPress={() => setDeleting(true)}
          />
        </View>
      </View>
      <ConfirmDialog
        visible={!!removeId}
        title="Remover participante?"
        description="A vaga ficará disponível para outro jogador."
        confirmLabel="Remover"
        destructive
        onCancel={() => setRemoveId(null)}
        onConfirm={() => {
          if (removeId) useAppStore.getState().remove(id, removeId);
          setRemoveId(null);
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
      <Modal
        visible={drawing}
        animationType={reduced ? "none" : "fade"}
        onRequestClose={() => {
          setDrawing(false);
          router.replace(`/tournament/${id}/bracket`);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.ink,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            gap: 24,
          }}
        >
          <Text variant="label" color={colors.primary}>
            AGORA É PRA VALER
          </Text>
          <Text
            variant="display"
            color={colors.white}
            style={{ textAlign: "center" }}
          >
            O destino da disputa.
          </Text>
          <Text color="#BFBFBF" style={{ textAlign: "center" }}>
            Os confrontos estão definidos. Que vença o melhor.
          </Text>
          <ScrollView
            style={{ width: "100%", maxWidth: 460, maxHeight: 320 }}
            contentContainerStyle={{ gap: 12 }}
          >
            {t.matches
              .filter((m) => m.roundIndex === 0)
              .map((m, i) => (
                <Animated.View
                  key={m.id}
                  entering={
                    reduced
                      ? undefined
                      : FadeInDown.delay(i * 250).duration(400)
                  }
                  style={{
                    padding: 18,
                    backgroundColor: "#292929",
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Animated.View
                    entering={
                      reduced
                        ? undefined
                        : SlideInLeft.delay(i * 180).duration(450)
                    }
                    style={{ flex: 1 }}
                  >
                    <Text color="white">
                      {
                        t.participants.find((p) => p.id === m.participant1Id)
                          ?.displayName
                      }
                    </Text>
                  </Animated.View>
                  <Text variant="title" color={colors.primary}>
                    ×
                  </Text>
                  <Animated.View
                    entering={
                      reduced
                        ? undefined
                        : SlideInRight.delay(i * 180).duration(450)
                    }
                    style={{ flex: 1 }}
                  >
                    <Text color="white" style={{ textAlign: "right" }}>
                      {
                        t.participants.find((p) => p.id === m.participant2Id)
                          ?.displayName
                      }
                    </Text>
                  </Animated.View>
                </Animated.View>
              ))}
          </ScrollView>
          <Button
            label="Pular animação"
            variant="primary"
            onPress={() => {
              setDrawing(false);
              router.replace(`/tournament/${id}/bracket`);
            }}
          />
        </View>
      </Modal>
    </Shell>
  );
}
