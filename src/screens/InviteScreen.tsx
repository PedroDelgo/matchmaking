import React, { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Platform, View } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { Shell } from "../components/Shell";
import {
  Button,
  Field,
  LoadingState,
  Notice,
  PageHeading,
  Panel,
  Text,
} from "../components/ui";
import { statusLabel } from "../components/tournament";
import { useAuth } from "../features/auth/AuthProvider";
import { useRemoteTournaments } from "../features/tournaments/remote/RemoteProvider";
import type {
  AdmissionResult,
  InviteCredential,
} from "../features/tournaments/remote/client";
import {
  forgetInvitation,
  invitationCode,
  invitationFromUrl,
  invitationToken,
  pendingInvitation,
  rememberInvitation,
} from "../features/invites/credential";
import {
  invitationMessage,
  previewInvitation,
  type InvitationPreview,
} from "../features/invites/client";
import { colors } from "../theme/tokens";

function capture(pathToken?: string | string[]) {
  try {
    let credential: InviteCredential | null = null;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const current = window.location.href;
      // Remove the capability before network requests, navigation or user actions.
      if (window.location.hash || window.location.search || pathToken)
        window.history.replaceState(window.history.state, "", "/invite");
      credential = invitationFromUrl(current);
    }
    if (pathToken !== undefined) credential = invitationToken(pathToken);
    if (credential) rememberInvitation(credential);
    return { credential: credential ?? pendingInvitation(), error: "" };
  } catch {
    forgetInvitation();
    return {
      credential: null,
      error: invitationMessage(new Error("INVALID_INVITE")),
    };
  }
}

export function InviteScreen({
  pathToken,
}: { pathToken?: string | string[] } = {}) {
  const auth = useAuth();
  return (
    <InviteScreenBody
      key={`${auth.session?.user.id ?? "signed-out"}|${pathToken ?? ""}`}
      pathToken={pathToken}
    />
  );
}
function InviteScreenBody({ pathToken }: { pathToken?: string | string[] }) {
  const auth = useAuth(),
    remote = useRemoteTournaments(),
    incomingUrl = Linking.useURL();
  const [initial] = useState(() => capture(pathToken));
  const [credential, setCredential] = useState<InviteCredential | null>(
      initial.credential,
    ),
    [code, setCode] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [preview, setPreview] = useState<InvitationPreview | null>(null),
    [accepted, setAccepted] = useState<AdmissionResult | null>(null),
    [error, setError] = useState(initial.error),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [previewEpoch, setPreviewEpoch] = useState(0);
  const live = useRef(true),
    operation = useRef(false),
    identity = useRef(auth.session?.user.id),
    generation = useRef(0),
    lastNativeUrl = useRef<string | null>(null);
  const signedIn =
    !!auth.session && ["authenticated", "refreshing"].includes(auth.status);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onIncomingUrl = () => {
      const next = capture();
      setAccepted(null);
      setDisplayName("");
      setPreview(null);
      setError(next.error);
      if (next.credential) {
        setCredential(next.credential);
        setLoading(true);
        setPreviewEpoch((epoch) => epoch + 1);
      } else {
        setCredential(null);
        setLoading(false);
      }
    };
    window.addEventListener("hashchange", onIncomingUrl);
    window.addEventListener("popstate", onIncomingUrl);
    return () => {
      window.removeEventListener("hashchange", onIncomingUrl);
      window.removeEventListener("popstate", onIncomingUrl);
    };
  }, []);
  useEffect(() => {
    if (
      Platform.OS === "web" ||
      !incomingUrl ||
      incomingUrl === lastNativeUrl.current
    )
      return;
    lastNativeUrl.current = incomingUrl;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const next = invitationFromUrl(incomingUrl);
        if (next) {
          rememberInvitation(next);
          setCredential((previous) =>
            previous?.kind === next.kind && previous.value === next.value
              ? previous
              : next,
          );
          setAccepted(null);
          setError("");
        }
      } catch {
        setError(invitationMessage(new Error("INVALID_INVITE")));
      }
    });
    return () => {
      active = false;
    };
  }, [incomingUrl]);
  useEffect(() => {
    if (!credential) return;
    const controller = new AbortController();
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setPreview(null);
      setError("");
      return previewInvitation(
        credential,
        signedIn ? auth.session?.access_token : undefined,
        controller.signal,
      )
        .then((result) => {
          if (active) setPreview(result);
        })
        .catch((reason) => {
          if (active) setError(invitationMessage(reason));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [credential, auth.session?.access_token, signedIn, previewEpoch]);
  const checkPending = useCallback(async () => {
    if (!remote.client) return;
    try {
      const value = await remote.client.hasPendingAcceptance();
      if (live.current && identity.current === remote.client.userId)
        setPending(value);
    } catch {
      if (live.current)
        setError(
          "Não foi possível consultar uma entrada anterior. Verifique o armazenamento antes de tentar novamente.",
        );
    }
  }, [remote.client]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void checkPending();
    });
    return () => {
      active = false;
    };
  }, [checkPending]);
  const consult = () => {
    if (busy || loading) return;
    try {
      const next = invitationCode(code);
      Keyboard.dismiss();
      rememberInvitation(next);
      setCredential(next);
      setPreview(null);
      setLoading(true);
      setAccepted(null);
      setError("");
      setPreviewEpoch((value) => value + 1);
    } catch (reason) {
      setError(invitationMessage(reason));
    }
  };
  const guest = async () => {
    if (operation.current || auth.session || auth.busy) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      await auth.signInAsGuest();
    } catch {
      if (live.current)
        setError(
          "Não foi possível iniciar uma sessão de convidado. Verifique a conexão e tente novamente.",
        );
    } finally {
      operation.current = false;
      if (live.current) setBusy(false);
    }
  };
  const accept = async (retry = false) => {
    const client = remote.client;
    if (operation.current || !client || (!retry && !credential)) return;
    if (
      !retry &&
      preview?.role === "participant" &&
      !preview.membership &&
      (!displayName.trim() || displayName.trim().length > 80)
    ) {
      setError(
        "Escolha um apelido de até 80 caracteres para entrar na competição.",
      );
      return;
    }
    operation.current = true;
    setBusy(true);
    setError("");
    const currentGeneration = generation.current;
    try {
      Keyboard.dismiss();
      const result = retry
        ? await client.retryAcceptance()
        : await client.acceptInvitation(
            credential!,
            preview?.role === "participant" && !preview.membership
              ? displayName.trim()
              : undefined,
          );
      if (
        !live.current ||
        currentGeneration !== generation.current ||
        identity.current !== client.userId
      )
        return;
      forgetInvitation();
      setCredential(null);
      setPreview(null);
      setCode("");
      setAccepted(result);
    } catch (reason) {
      if (live.current && currentGeneration === generation.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível confirmar a entrada. Tente novamente.",
        );
    } finally {
      operation.current = false;
      if (live.current && currentGeneration === generation.current) {
        setBusy(false);
        await checkPending();
      }
    }
  };
  const open = (id: string) => router.push(`/tournament/${id}?source=cloud`);
  const initializing = auth.status === "initializing";
  const full = preview?.availability === "full" && !preview.membership;
  const started = preview?.availability === "started" && !preview.membership;
  return (
    <Shell>
      <PageHeading
        eyebrow="ENTRE NA DISPUTA"
        title="Seu lugar na próxima competição."
        description="Recebeu um convite? Confira a disputa e escolha como entrar."
      />
      <View
        style={{ width: "100%", maxWidth: 620, alignSelf: "center", gap: 20 }}
      >
        {error ? <Notice tone="error" message={error} /> : null}
        {accepted ? (
          <Panel style={{ gap: 16 }}>
            <Notice
              tone="success"
              message={
                accepted.alreadyMember
                  ? accepted.role === "viewer"
                    ? "Você já acompanha este campeonato."
                    : "Você já participa deste campeonato."
                  : accepted.role === "viewer"
                    ? "Acesso confirmado. Você já pode acompanhar a disputa."
                    : "Entrada confirmada. Você está na competição!"
              }
            />
            {accepted.refreshPending ? (
              <Notice message="Sua entrada foi confirmada. A atualização do campeonato está pendente; abra e atualize quando a conexão voltar." />
            ) : null}
            {accepted.journalPending ? (
              <Notice message="O servidor confirmou sua entrada. Repita a tentativa pendente para concluir o registro local." />
            ) : null}
            <Button
              label="Abrir campeonato"
              icon="arrow-forward"
              onPress={() => open(accepted.tournamentId)}
            />
          </Panel>
        ) : null}
        {pending ? (
          <Panel style={{ gap: 12 }}>
            <Text variant="heading">Sua entrada ficou pendente?</Text>
            <Text color={colors.muted}>
              Repita a tentativa original para consultar a confirmação, sem
              criar outro jogador nem usar o convite duas vezes.
            </Text>
            <Button
              label="Repetir entrada pendente"
              loading={busy}
              onPress={() => void accept(true)}
            />
          </Panel>
        ) : null}
        {!accepted ? (
          <Panel style={{ gap: 16 }}>
            <Text variant="heading">Entrar com código</Text>
            <Field
              label="Código do convite"
              placeholder="ABCD 2345…"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              maxLength={20}
              editable={!busy && !loading}
              returnKeyType="go"
              onSubmitEditing={consult}
              helper="Digite os oito caracteres. Espaços e hífens são opcionais."
            />
            <Button
              label="Consultar convite"
              variant={credential ? "outline" : "primary"}
              icon="arrow-forward"
              loading={loading && credential?.kind === "code"}
              disabled={busy || (loading && credential?.kind !== "code")}
              onPress={consult}
            />
          </Panel>
        ) : null}
        {loading && credential?.kind === "token" ? (
          <LoadingState label="Conferindo convite…" />
        ) : null}
        {credential && !loading && !preview ? (
          <Button
            label="Consultar novamente"
            variant="outline"
            icon="refresh-outline"
            onPress={() => setPreviewEpoch((value) => value + 1)}
          />
        ) : null}
        {preview ? (
          <Panel style={{ gap: 18 }}>
            <View style={{ gap: 8 }}>
              <Text variant="label" color={colors.primaryDark}>
                {preview.role === "participant"
                  ? "VOCÊ FOI CONVIDADO PARA JOGAR"
                  : "VOCÊ FOI CONVIDADO PARA ASSISTIR"}
              </Text>
              <Text variant="title">{preview.name}</Text>
              <Text color={colors.muted}>
                {preview.modality} · Eliminatória simples
              </Text>
              <Text>{statusLabel[preview.status]}</Text>
              {preview.role === "participant" ? (
                <Text>
                  {preview.availableSlots}{" "}
                  {preview.availableSlots === 1
                    ? "vaga disponível"
                    : "vagas disponíveis"}
                </Text>
              ) : (
                <Text>Acompanhar não ocupa uma vaga na chave.</Text>
              )}
              <Text variant="caption" color={colors.muted}>
                Convite válido até{" "}
                {new Date(preview.expiresAt).toLocaleString("pt-BR")}
              </Text>
            </View>
            {preview.membership ? (
              <>
                <Notice
                  tone="success"
                  message={
                    preview.membership.role === "viewer"
                      ? "Você já é espectador desta disputa."
                      : preview.membership.role === "organizer"
                        ? "Você organiza esta disputa."
                        : "Você já participa desta disputa."
                  }
                />
                <Button
                  label="Abrir campeonato"
                  icon="arrow-forward"
                  onPress={() => open(preview.membership!.tournamentId)}
                />
              </>
            ) : (
              <>
                {full ? (
                  <Notice message="As vagas para jogar já foram preenchidas. Peça um convite para assistir ao organizador." />
                ) : null}
                {started ? (
                  <Notice message="A chave já começou e não recebe novos jogadores. Você pode pedir um convite para assistir." />
                ) : null}
                {initializing ? (
                  <LoadingState label="Conferindo sua sessão…" />
                ) : signedIn ? (
                  <>
                    <Notice
                      message={
                        auth.session?.user.is_anonymous
                          ? "Você está em uma sessão de convidado deste navegador ou instalação. Sair, apagar os dados ou desinstalar pode fazer você perder o acesso; essa sessão não tem recuperação por e-mail."
                          : "Sua sessão atual será usada para entrar. Seus campeonatos locais continuam neste dispositivo."
                      }
                    />
                    {preview.role === "participant" ? (
                      <Field
                        label="Seu apelido na competição"
                        value={displayName}
                        onChangeText={setDisplayName}
                        autoComplete="nickname"
                        autoCorrect={false}
                        maxLength={80}
                        editable={!busy && !pending && !full && !started}
                        helper="Um apelido igual ao de outro jogador não transfere a vaga dele para você."
                        returnKeyType="go"
                        onSubmitEditing={() =>
                          !full && !started && !pending && void accept()
                        }
                      />
                    ) : null}
                    <Button
                      label={
                        preview.role === "participant"
                          ? "Entrar na competição"
                          : "Acompanhar campeonato"
                      }
                      icon={
                        preview.role === "participant"
                          ? "game-controller-outline"
                          : "eye-outline"
                      }
                      loading={busy}
                      disabled={
                        !!full || !!started || pending || !remote.client
                      }
                      onPress={() => void accept()}
                    />
                  </>
                ) : auth.session ? (
                  <>
                    <Notice message="Sua identidade precisa ser validada antes da entrada. Vamos preservar a sessão atual." />
                    <Button
                      label="Validar sessão"
                      loading={auth.busy}
                      onPress={() =>
                        void auth.retrySession().catch(() => {
                          if (live.current)
                            setError(
                              "Não foi possível validar sua sessão. Verifique a conexão ou entre novamente pelo perfil.",
                            );
                        })
                      }
                    />
                  </>
                ) : (
                  <>
                    <Text color={colors.muted}>
                      Você pode usar sua conta ou criar uma sessão de convidado
                      para este navegador ou instalação. A entrada só será
                      confirmada na próxima ação.
                    </Text>
                    <Button
                      label="Continuar como convidado"
                      loading={busy || auth.busy}
                      disabled={!auth.configured || !!full || !!started}
                      onPress={() => void guest()}
                    />
                    <Button
                      label="Entrar com minha conta"
                      variant="outline"
                      disabled={busy}
                      onPress={() =>
                        router.push("/auth/sign-in?returnTo=invite")
                      }
                    />
                    <Text variant="caption" color={colors.muted}>
                      Convidados não possuem recuperação de conta por e-mail.
                      Mantenha os dados deste navegador ou instalação para
                      voltar.
                    </Text>
                  </>
                )}
                <Text variant="caption" color={colors.muted}>
                  Somente o organizador altera a chave e registra resultados.
                  Abrir ou consultar este convite não consome uma utilização.
                </Text>
              </>
            )}
          </Panel>
        ) : null}
        <Button
          label="Voltar aos meus torneios"
          variant="ghost"
          onPress={() => router.navigate("/tournaments")}
        />
      </View>
    </Shell>
  );
}
