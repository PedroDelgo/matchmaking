import React, { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
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
import { useAuth } from "../features/auth/AuthProvider";
import { normalizeEmail, validatePassword } from "../features/auth/validation";
import { colors } from "../theme/tokens";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password";

const copy: Record<
  AuthMode,
  { title: string; description: string; action: string }
> = {
  "sign-in": {
    title: "Entre na competição.",
    description: "Sua conta, pronta para a próxima disputa.",
    action: "Entrar",
  },
  "sign-up": {
    title: "Crie sua conta.",
    description: "Crie sua conta e prepare-se para disputar.",
    action: "Criar conta",
  },
  "forgot-password": {
    title: "De volta ao jogo.",
    description: "Receba um link para recuperar o acesso à sua conta.",
    action: "Enviar link de recuperação",
  },
  "reset-password": {
    title: "Uma nova senha.",
    description: "Escolha uma senha para voltar à sua conta.",
    action: "Salvar nova senha",
  },
};

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  const submitting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const recovering = mode === "reset-password";
  const hasEmail = !recovering;
  const hasPassword = mode !== "forgot-password";
  const confirmsPassword = mode === "sign-up" || recovering;
  const working = pending || auth.busy;
  const initializing =
    auth.status === "initializing" ||
    auth.status === "refreshing" ||
    (auth.status === "recovering" && !auth.recoveryReady);
  const recoveryBlocked = recovering && !auth.recoveryReady;
  const alreadySignedIn =
    !!auth.session && !recovering && mode !== "forgot-password";
  const resetFeedback = () => {
    setError("");
    setSuccess("");
    auth.clearError();
  };

  async function submit() {
    if (submitting.current || auth.busy || !auth.configured || recoveryBlocked)
      return;
    resetFeedback();
    const errors: Record<string, string> = {};
    let normalizedEmail = email.trim();
    if (hasEmail) {
      try {
        normalizedEmail = normalizeEmail(email);
      } catch (reason) {
        errors.email = (reason as Error).message;
      }
    }
    if (hasPassword && !password) errors.password = "Digite sua senha.";
    else if (confirmsPassword) {
      try {
        validatePassword(password);
      } catch (reason) {
        errors.password = (reason as Error).message;
      }
    }
    if (confirmsPassword && confirmation !== password)
      errors.confirmation = "As senhas precisam ser iguais.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    submitting.current = true;
    setPending(true);
    Keyboard.dismiss();
    try {
      if (mode === "sign-in") {
        await auth.signIn(normalizedEmail, password);
        if (mounted.current) router.replace("/profile");
      } else if (mode === "sign-up") {
        const result = await auth.signUp(normalizedEmail, password);
        if (mounted.current) {
          setPassword("");
          setConfirmation("");
          if (result.needsConfirmation)
            setSuccess(
              "Confira seu e-mail para confirmar a conta. Depois, volte para entrar.",
            );
          else router.replace("/profile");
        }
      } else if (mode === "forgot-password") {
        await auth.requestPasswordReset(normalizedEmail);
        if (mounted.current)
          setSuccess(
            "Se houver uma conta para este e-mail, você receberá um link para criar uma nova senha.",
          );
      } else {
        await auth.updatePassword(password);
        if (mounted.current) {
          setPassword("");
          setConfirmation("");
          setSuccess("Senha atualizada. Entre novamente com sua nova senha.");
        }
      }
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível concluir. Tente novamente.",
        );
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <Shell>
      <View style={{ width: "100%", maxWidth: 560, alignSelf: "center" }}>
        <PageHeading
          eyebrow="SUA CONTA MATCHMAKING"
          title={copy[mode].title}
          description={copy[mode].description}
        />
        <Panel style={{ gap: 20 }}>
          {!auth.configured ? (
            <Notice message="As contas estão indisponíveis neste ambiente. Você pode continuar com seus campeonatos neste dispositivo." />
          ) : initializing ? (
            <LoadingState label="Verificando sua sessão…" />
          ) : alreadySignedIn ? (
            <>
              <Notice tone="success" message="Sua conta já está conectada." />
              <Button
                label="Abrir meu perfil"
                onPress={() => router.replace("/profile")}
              />
            </>
          ) : recoveryBlocked && !success ? (
            <>
              <Notice
                tone="error"
                message="Abra um link de recuperação válido para escolher sua nova senha. Se ele expirou, solicite outro."
              />
              <Button
                label="Solicitar novo link"
                onPress={() => router.replace("/auth/forgot-password")}
              />
            </>
          ) : (
            <>
              {hasEmail ? (
                <Field
                  label="E-mail"
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setFieldErrors((current) => ({ ...current, email: "" }));
                    resetFeedback();
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType={hasPassword ? "next" : "send"}
                  onSubmitEditing={hasPassword ? undefined : submit}
                  maxLength={254}
                  editable={!working}
                  error={fieldErrors.email}
                />
              ) : null}
              {hasPassword ? (
                <Field
                  label={recovering ? "Nova senha" : "Senha"}
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setFieldErrors((current) => ({ ...current, password: "" }));
                    resetFeedback();
                  }}
                  secureTextEntry
                  returnKeyType={confirmsPassword ? "next" : "go"}
                  onSubmitEditing={confirmsPassword ? undefined : submit}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={
                    confirmsPassword ? "new-password" : "current-password"
                  }
                  textContentType={
                    confirmsPassword ? "newPassword" : "password"
                  }
                  helper={
                    confirmsPassword
                      ? "Use uma senha com 10 a 128 caracteres."
                      : undefined
                  }
                  maxLength={confirmsPassword ? 128 : undefined}
                  editable={!working}
                  error={fieldErrors.password}
                />
              ) : null}
              {confirmsPassword ? (
                <Field
                  label="Confirmar senha"
                  value={confirmation}
                  onChangeText={(value) => {
                    setConfirmation(value);
                    setFieldErrors((current) => ({
                      ...current,
                      confirmation: "",
                    }));
                    resetFeedback();
                  }}
                  secureTextEntry
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  maxLength={128}
                  editable={!working}
                  error={fieldErrors.confirmation}
                />
              ) : null}
              {error || auth.error ? (
                <Notice tone="error" message={error || auth.error!} />
              ) : null}
              {success ? <Notice tone="success" message={success} /> : null}
              {!success || (!recovering && mode !== "sign-up") ? (
                <Button
                  label={copy[mode].action}
                  loading={working}
                  onPress={submit}
                />
              ) : null}
              {mode === "sign-in" ? (
                <>
                  <Button
                    label="Esqueci minha senha"
                    variant="ghost"
                    onPress={() => router.push("/auth/forgot-password")}
                    disabled={working}
                  />
                  <Button
                    label="Criar conta"
                    variant="outline"
                    onPress={() => router.push("/auth/sign-up")}
                    disabled={working}
                  />
                </>
              ) : (
                <Button
                  label="Voltar para entrar"
                  variant="outline"
                  onPress={() => router.replace("/auth/sign-in")}
                  disabled={working}
                />
              )}
            </>
          )}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 20,
              gap: 8,
            }}
          >
            <Button
              label="Continuar sem conta"
              variant="ghost"
              onPress={() => router.replace("/")}
              disabled={working}
            />
            <Text
              variant="caption"
              color={colors.muted}
              style={{ textAlign: "center" }}
            >
              Seus campeonatos continuam neste dispositivo. Criar uma conta não
              envia seu histórico para a nuvem.
            </Text>
          </View>
        </Panel>
      </View>
    </Shell>
  );
}

export function AuthCallbackScreen() {
  const {
    code,
    sb_flow_id: flowId,
    error: callbackError,
  } = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    sb_flow_id?: string | string[];
  }>();
  const auth = useAuth();
  const started = useRef<string | null>(null);
  const requestEpoch = useRef(0);
  const mounted = useRef(true);
  const [error, setError] = useState("");
  const completeCallback = auth.completeCallback;
  const invalid =
    !!callbackError ||
    typeof code !== "string" ||
    !code ||
    code.length > 2048 ||
    (flowId !== undefined &&
      (typeof flowId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(flowId)));
  const visibleError = invalid
    ? "Este link é inválido ou expirou. Solicite outro e tente novamente."
    : error;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const callbackKey =
      typeof code === "string" ? `${code}:${flowId ?? ""}` : "invalid";
    if (started.current === callbackKey) return;
    started.current = callbackKey;
    const request = ++requestEpoch.current;
    // Keep one-time credentials out of the browser's visible URL and history.
    if (Platform.OS === "web" && typeof window !== "undefined")
      window.history.replaceState(null, "", window.location.pathname);
    if (invalid || typeof code !== "string") return;
    void (
      typeof flowId === "string"
        ? completeCallback(code, flowId)
        : completeCallback(code)
    )
      .then((result) => {
        if (mounted.current && request === requestEpoch.current)
          router.replace(result.recovery ? "/auth/reset-password" : "/profile");
      })
      .catch(() => {
        if (mounted.current && request === requestEpoch.current)
          setError(
            "Não foi possível validar este link. Ele pode ter expirado ou já ter sido usado. Solicite outro.",
          );
      });
  }, [code, flowId, completeCallback, invalid]);
  return (
    <Shell>
      <View style={{ width: "100%", maxWidth: 560, alignSelf: "center" }}>
        <PageHeading
          eyebrow="SUA CONTA MATCHMAKING"
          title="De volta à arena."
        />
        <Panel style={{ gap: 20 }}>
          {visibleError ? (
            <>
              <Notice tone="error" message={visibleError} />
              <Button
                label="Solicitar novo link de recuperação"
                onPress={() => router.replace("/auth/forgot-password")}
              />
              <Button
                label="Voltar para entrar"
                variant="outline"
                onPress={() => router.replace("/auth/sign-in")}
              />
            </>
          ) : (
            <LoadingState label="Validando seu link…" />
          )}
          <Button
            label="Continuar sem conta"
            variant="ghost"
            onPress={() => router.replace("/")}
          />
        </Panel>
      </View>
    </Shell>
  );
}
