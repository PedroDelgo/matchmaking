import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, BackHandler, Keyboard, Platform } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Shell } from "../components/Shell";
import {
  Text,
  Button,
  Panel,
  Field,
  Icon,
  Chip,
  Progress,
  Notice,
  ConfirmDialog,
} from "../components/ui";
import { Motion } from "../components/Motion";
import { SelectionCard } from "../components/SelectionCard";
import { useAppStore } from "../store/useAppStore";
import { modalityIcon } from "../components/tournament";
import { colors, fonts } from "../theme/tokens";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useRemoteTournaments } from "../features/tournaments/remote/RemoteProvider";
import { useAuth } from "../features/auth/AuthProvider";
import { getTournamentApiUrl } from "../features/tournaments/remote/client";
import { localStorageAdapter } from "../store/storage";

export function CreateScreen() {
  const { client } = useRemoteTournaments(),
    auth = useAuth();
  const [destination, setDestination] = useState("local"),
    [pendingCreation, setPendingCreation] = useState(false),
    submitting = useRef(false);
  useEffect(() => {
    let active = true;
    if (client)
      void client
        .hasPendingCreation()
        .then((value) => {
          if (active) setPendingCreation(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [client]);
  useEffect(() => {
    let active = true;
    void Promise.resolve(
      localStorageAdapter.getItem("matchmaking-create-destination-v1"),
    )
      .then((value) => {
        if (active && value === "cloud") setDestination("cloud");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const choose = (value: string) => {
    setDestination(value);
    void Promise.resolve(
      localStorageAdapter.setItem("matchmaking-create-destination-v1", value),
    ).catch(() =>
      setError(
        "Não foi possível guardar sua escolha. O rascunho continua disponível.",
      ),
    );
  };
  const draft = useAppStore((s) => s.draft),
    update = useAppStore((s) => s.updateDraft),
    create = useAppStore((s) => s.create),
    reset = useAppStore((s) => s.resetDraft);
  const [error, setError] = useState(""),
    [discard, setDiscard] = useState(false),
    [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const { desktop: wide, compact } = useResponsiveLayout();
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          const step = useAppStore.getState().draft.step;
          if (step === 0) return false;
          setDirection("backward");
          update({ step: step - 1 });
          setError("");
          return true;
        },
      );
      return () => subscription.remove();
    }, [update, setError]),
  );
  const validate = () => {
    if (!draft.name.trim()) return "Dê um nome ao campeonato.";
    if (draft.modality === "Outro" && !draft.customModality.trim())
      return "Digite a modalidade da disputa.";
    return "";
  };
  const next = () => {
    const e = validate();
    setError(e);
    if (!e) {
      Keyboard.dismiss();
      setDirection("forward");
      update({ step: Math.min(2, draft.step + 1) });
    }
  };
  const submit = async () => {
    if (submitting.current) return;
    const e = validate();
    if (e) {
      setError(e);
      setDirection("backward");
      update({ step: 0 });
      return;
    }
    if (destination === "cloud" && !client) {
      setError(
        getTournamentApiUrl()
          ? "Entre na sua conta para continuar. Seu rascunho está salvo."
          : "A API de campeonatos ainda não foi configurada. Seu rascunho está salvo.",
      );
      return;
    }
    if (destination === "cloud" && auth.session?.user.is_anonymous) {
      setError(
        "Criar na nuvem exige uma conta recuperável. Sua sessão de convidado serve para entrar nos campeonatos; você pode criar neste dispositivo sem sair.",
      );
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (destination === "cloud") {
        const result = await client!.create({
          name: draft.name,
          modality:
            draft.modality === "Outro" ? draft.customModality : draft.modality,
          capacity: draft.capacity,
        });
        reset();
        router.replace(
          `/tournament/${result.tournamentId}/lobby?created=1&source=cloud`,
        );
      } else {
        const id = create();
        router.replace(`/tournament/${id}/lobby?created=1`);
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      if (client)
        void client
          .hasPendingCreation()
          .then(setPendingCreation)
          .catch(() => {});
    } finally {
      submitting.current = false;
    }
  };
  return (
    <Shell>
      <View style={{ maxWidth: 920, width: "100%", alignSelf: "center" }}>
        <Button
          label="Voltar"
          icon="arrow-back"
          variant="ghost"
          style={{ alignSelf: "flex-start", marginBottom: 16 }}
          onPress={() => {
            if (draft.step > 0) {
              Keyboard.dismiss();
              setDirection("backward");
              update({ step: draft.step - 1 });
            } else router.navigate("/tournaments");
          }}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <Text variant="label" color={colors.primaryDark}>
            NOVO CAMPEONATO
          </Text>
          <Text variant="caption" color={colors.muted}>
            Etapa {draft.step + 1} de 3
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 32 }}>
          {["Identidade", "Formato", "Revisão"].map((step, i) => (
            <View key={step} style={{ flex: 1, gap: 9 }}>
              <Progress value={draft.step >= i ? 1 : 0} />
              <Text
                variant="caption"
                color={draft.step === i ? colors.ink : colors.muted}
              >
                {i + 1}. {step}
              </Text>
            </View>
          ))}
        </View>
        <Motion key={draft.step} preset="transition" direction={direction}>
          <Text
            variant="display"
            style={{
              fontSize: wide ? 54 : 40,
              lineHeight: wide ? 58 : 44,
              marginBottom: 10,
            }}
          >
            {
              [
                "Qual vai ser a disputa?",
                "Como vai funcionar?",
                "Tudo pronto para começar?",
              ][draft.step]
            }
          </Text>
          <Text color={colors.muted} style={{ marginBottom: 28 }}>
            {
              [
                "Toda grande rivalidade começa com uma ideia.",
                "Escolha o caminho até o pódio.",
                "Confira os detalhes. Depois é só reunir a galera.",
              ][draft.step]
            }
          </Text>
          {draft.step === 0 && (
            <Panel style={{ gap: 28 }}>
              <Field
                label="Nome do campeonato"
                placeholder="Ex.: Copa dos Amigos"
                value={draft.name}
                maxLength={60}
                onChangeText={(name) => {
                  update({ name });
                  setError("");
                }}
                error={error && !draft.name.trim() ? error : undefined}
              />
              <View style={{ gap: 12 }}>
                <Text variant="label">Modalidade</Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
                >
                  {[
                    "Futebol",
                    "Videogame",
                    "Basquete",
                    "Vôlei",
                    "Truco",
                    "Xadrez",
                    "Outro",
                  ].map((modality) => (
                    <SelectionCard
                      key={modality}
                      label={modality}
                      icon={modalityIcon(modality)}
                      selected={draft.modality === modality}
                      onPress={() => {
                        update({ modality });
                        setError("");
                      }}
                      style={{ width: wide ? "23%" : "46%", flexGrow: 1 }}
                    />
                  ))}
                </View>
              </View>
              {draft.modality === "Outro" && (
                <Field
                  label="Qual modalidade?"
                  placeholder="Tênis de mesa, Mario Kart…"
                  value={draft.customModality}
                  onChangeText={(customModality) => update({ customModality })}
                  maxLength={40}
                />
              )}
            </Panel>
          )}
          {draft.step === 1 && (
            <View style={{ gap: 24 }}>
              <Panel
                style={{ borderColor: colors.primary, borderWidth: 2, gap: 12 }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Icon name="git-network-outline" size={28} />
                  <Chip label="Selecionado ✓" tone="orange" />
                </View>
                <Text variant="heading">Mata-mata</Text>
                <Text color={colors.muted}>
                  Eliminação direta. Quem vence avança, até restar um campeão.
                </Text>
                <View
                  accessible
                  accessibilityLabel="Dois confrontos levam à final e a um campeão"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingTop: 8,
                  }}
                >
                  <View style={{ gap: 6 }}>
                    {[0, 1].map((i) => (
                      <View
                        key={i}
                        style={{
                          height: 8,
                          width: 42,
                          backgroundColor: colors.primarySoft,
                          borderLeftWidth: 3,
                          borderLeftColor: colors.primary,
                        }}
                      />
                    ))}
                  </View>
                  <Icon name="chevron-forward" color={colors.muted} size={16} />
                  <View
                    style={{
                      height: 12,
                      width: 42,
                      backgroundColor: colors.primary,
                      borderRadius: 2,
                    }}
                  />
                  <Icon name="chevron-forward" color={colors.muted} size={16} />
                  <Icon name="trophy-outline" color={colors.primaryDark} />
                </View>
              </Panel>
              <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
                {["Pontos corridos", "Fase de grupos"].map((f) => (
                  <Panel
                    key={f}
                    accessibilityState={{ disabled: true }}
                    style={{ flex: 1, gap: 8, opacity: 0.65 }}
                  >
                    <Chip label="Em breve" />
                    <Text variant="heading">{f}</Text>
                    <Text variant="caption">
                      {f === "Pontos corridos"
                        ? "Todos enfrentam todos."
                        : "Grupos seguidos de eliminação."}
                    </Text>
                  </Panel>
                ))}
              </View>
              <Panel style={{ gap: 20 }}>
                <Text variant="heading">Quantas pessoas vão jogar?</Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {([4, 8, 16] as const).map((capacity) => (
                    <Button
                      key={capacity}
                      label={`${capacity}`}
                      variant={
                        draft.capacity === capacity ? "primary" : "outline"
                      }
                      accessibilityState={{
                        selected: draft.capacity === capacity,
                      }}
                      onPress={() => update({ capacity })}
                      style={{ flex: 1 }}
                    />
                  ))}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 16,
                    alignItems: "center",
                    padding: 16,
                    backgroundColor: colors.background,
                    borderRadius: 8,
                  }}
                >
                  <Icon
                    name="trophy-outline"
                    size={28}
                    color={colors.primaryDark}
                  />
                  <View style={{ flex: 1 }}>
                    <Text>
                      {Math.log2(draft.capacity)} rodadas · {draft.capacity - 1}{" "}
                      partidas · 1 campeão
                    </Text>
                    <Text variant="caption" color={colors.muted}>
                      Os confrontos serão sorteados com a sala completa.
                    </Text>
                  </View>
                </View>
              </Panel>
            </View>
          )}
          {draft.step === 2 && (
            <Panel style={{ gap: 24 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 16 }}
              >
                <View
                  style={{
                    padding: 16,
                    backgroundColor: colors.primarySoft,
                    borderRadius: 8,
                  }}
                >
                  <Icon
                    name={modalityIcon(draft.modality)}
                    size={32}
                    color={colors.primaryDark}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="title">{draft.name}</Text>
                  <Text color={colors.muted}>
                    {draft.modality === "Outro"
                      ? draft.customModality
                      : draft.modality}
                  </Text>
                </View>
              </View>
              {[
                ["Formato", "Mata-mata"],
                ["Participantes", `${draft.capacity} vagas`],
                ["Rodadas", `${Math.log2(draft.capacity)}`],
                ["Partidas previstas", `${draft.capacity - 1}`],
              ].map(([a, b]) => (
                <View
                  key={a}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingTop: 16,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text color={colors.muted}>{a}</Text>
                  <Text style={{ fontFamily: fonts.semibold }}>{b}</Text>
                </View>
              ))}
              <View style={{ gap: 12 }}>
                <Text variant="heading">Onde deseja salvar?</Text>
                <View
                  style={{ flexDirection: compact ? "column" : "row", gap: 12 }}
                >
                  <SelectionCard
                    label="Neste dispositivo"
                    icon="phone-portrait-outline"
                    selected={destination === "local"}
                    onPress={() => choose("local")}
                    style={{ flex: 1 }}
                  />
                  <SelectionCard
                    label="Na minha conta"
                    icon="cloud-outline"
                    selected={destination === "cloud"}
                    onPress={() => choose("cloud")}
                    style={{ flex: 1 }}
                  />
                </View>
                <Notice
                  message={
                    destination === "local"
                      ? "O campeonato será salvo neste dispositivo. Sem login e disponível offline."
                      : "O campeonato será salvo no servidor da sua conta e poderá ser aberto em outras sessões. A criação depende de confirmação online."
                  }
                />
                {destination === "cloud" && !auth.session ? (
                  <Button
                    label="Entrar e continuar criação"
                    variant="outline"
                    onPress={() => router.push("/auth/sign-in?returnTo=create")}
                  />
                ) : null}
                {destination === "cloud" && auth.session ? (
                  <Text variant="caption">
                    Conta: {auth.profile?.nickname ?? "Sua conta"}
                  </Text>
                ) : null}
              </View>
            </Panel>
          )}
          {pendingCreation && client ? (
            <View style={{ gap: 12, marginTop: 16 }}>
              <Notice message="Há uma criação sem confirmação. Retome os dados da tentativa anterior para conferir o campeonato antes de criar outro." />
              <Button
                label="Retomar criação pendente"
                variant="outline"
                loading={busy}
                onPress={async () => {
                  if (submitting.current) return;
                  submitting.current = true;
                  setBusy(true);
                  try {
                    const r = await client.retryCreation();
                    reset();
                    router.replace(
                      `/tournament/${r.tournamentId}/lobby?source=cloud`,
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    submitting.current = false;
                    setBusy(false);
                  }
                }}
              />
            </View>
          ) : null}
          {!!error && (
            <View style={{ marginTop: 16 }}>
              <Notice tone="error" message={error} />
            </View>
          )}
          <View
            style={{
              flexDirection: compact ? "column-reverse" : "row",
              gap: 12,
              justifyContent: "space-between",
              marginTop: 24,
            }}
          >
            <Button
              label="Descartar"
              variant="ghost"
              onPress={() => setDiscard(true)}
            />
            {draft.step < 2 ? (
              <Button label="Continuar" icon="arrow-forward" onPress={next} />
            ) : (
              <Button
                label="Criar campeonato"
                icon="add"
                loading={busy}
                onPress={submit}
              />
            )}
          </View>
          <Text
            variant="caption"
            color={colors.muted}
            style={{ marginTop: 16, textAlign: "center" }}
          >
            Rascunho salvo automaticamente. Pode voltar quando quiser.
          </Text>
        </Motion>
      </View>
      <ConfirmDialog
        visible={discard}
        title="Descartar rascunho?"
        description="As informações desta criação serão apagadas."
        confirmLabel="Descartar"
        destructive
        onCancel={() => setDiscard(false)}
        onConfirm={() => {
          reset();
          router.replace("/tournaments");
        }}
      />
    </Shell>
  );
}
