import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../features/auth/AuthProvider";
import {
  Avatar,
  Button,
  Chip,
  Field,
  LoadingState,
  Notice,
  Panel,
  Text,
} from "./ui";
import { colors } from "../theme/tokens";

export function AccountPanel() {
  const auth = useAuth();
  return <AccountContent key={auth.session?.user.id ?? "local"} auth={auth} />;
}

function AccountContent({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [nickname, setNickname] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const working = pending || auth.busy;
  async function act(action: () => Promise<void>, save = false) {
    if (working || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    setSaved(false);
    auth.clearError();
    try {
      await action();
      if (mounted.current && save) {
        setNickname(null);
        setSaved(true);
      }
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível concluir. Tente novamente.",
        );
    } finally {
      if (mounted.current) {
        submitting.current = false;
        setPending(false);
      }
    }
  }

  return (
    <Panel style={{ gap: 20, marginBottom: 24 }}>
      <Text variant="title">Sua conta Matchmaking</Text>
      {auth.status === "initializing" ||
      auth.status === "recovering" ||
      auth.status === "refreshing" ? (
        <LoadingState label="Verificando sua sessão…" />
      ) : auth.session ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Avatar
              name={
                auth.session.user.is_anonymous
                  ? "Convidado"
                  : (auth.profile?.nickname ?? "Competidor")
              }
              size={56}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="heading">
                {auth.session.user.is_anonymous
                  ? "Convidado"
                  : (auth.profile?.nickname ?? "Sua conta")}
              </Text>
              {auth.session.user.email ? (
                <Text color={colors.muted}>{auth.session.user.email}</Text>
              ) : null}
              <Chip
                label={
                  auth.session.user.is_anonymous
                    ? "Sessão de convidado"
                    : "Conta conectada"
                }
                tone="success"
              />
            </View>
          </View>
          {auth.session.user.is_anonymous && (
            <Notice message="Esta identidade existe apenas nesta instalação. Ao sair, limpar os dados ou trocar de aparelho, você perde o acesso como este convidado. Campeonatos locais permanecem independentes." />
          )}
          {auth.profile ? (
            <>
              <Field
                label="Apelido da conta"
                value={nickname ?? auth.profile.nickname}
                maxLength={40}
                editable={!working}
                helper="De 2 a 40 caracteres. Este apelido pertence à sua conta."
                onChangeText={(value) => {
                  setNickname(value);
                  setSaved(false);
                  setError("");
                  auth.clearError();
                }}
              />
              <Button
                label="Salvar apelido da conta"
                icon="checkmark"
                loading={working}
                onPress={() =>
                  act(
                    () =>
                      auth.updateNickname(nickname ?? auth.profile!.nickname),
                    true,
                  )
                }
              />
            </>
          ) : (
            <Button
              label="Carregar perfil da conta"
              variant="outline"
              loading={working}
              onPress={() => act(auth.retrySession)}
            />
          )}
          {saved ? (
            <Notice tone="success" message="Apelido da conta atualizado." />
          ) : null}
          {error || auth.error ? (
            <Notice tone="error" message={error || auth.error!} />
          ) : null}
          <Notice message="Seus campeonatos e estatísticas continuam neste dispositivo. Eles ainda não são enviados para sua conta." />
          <Button
            label="Sair da conta"
            variant="outline"
            disabled={working}
            onPress={() => act(auth.signOut)}
          />
        </>
      ) : (
        <>
          <Text color={colors.muted}>
            Entre para manter seu perfil em uma conta. Você também pode
            organizar todos os seus campeonatos sem cadastro.
          </Text>
          {!auth.configured ? (
            <Notice message="As contas estão indisponíveis neste ambiente. Seus campeonatos locais continuam disponíveis." />
          ) : null}
          {auth.error ? <Notice tone="error" message={auth.error} /> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <Button
              label="Entrar"
              onPress={() => router.push("/auth/sign-in")}
            />
            <Button
              label="Criar conta"
              variant="outline"
              onPress={() => router.push("/auth/sign-up")}
            />
          </View>
        </>
      )}
    </Panel>
  );
}
