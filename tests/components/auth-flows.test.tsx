import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AccountPanel } from "../../src/components/AccountPanel";
import { AuthCallbackScreen, AuthScreen } from "../../src/screens/AuthScreen";
import { ProfileScreen } from "../../src/screens/ProfileScreen";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { emptyDraft, useAppStore } from "../../src/store/useAppStore";
import { tournamentFixture } from "../fixtures/tournaments";

jest.mock("../../src/features/auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));

type Auth = ReturnType<typeof useAuth>;
let auth: Auth;

function session(userId = "11111111-1111-4111-8111-111111111111") {
  return { user: { id: userId, email: "conta@example.test" } } as NonNullable<
    Auth["session"]
  >;
}
function remoteProfile(userId = "11111111-1111-4111-8111-111111111111") {
  return {
    user_id: userId,
    nickname: "Ana remota",
    created_at: "2026-11-23T12:00:00.000Z",
    updated_at: "2026-11-23T12:00:00.000Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  auth = {
    configured: true,
    status: "signedOut",
    session: null,
    profile: null,
    error: null,
    busy: false,
    recoveryReady: false,
    signIn: jest.fn().mockResolvedValue(undefined),
    signUp: jest.fn().mockResolvedValue({ needsConfirmation: true }),
    requestPasswordReset: jest.fn().mockResolvedValue(undefined),
    completeCallback: jest.fn().mockResolvedValue({ recovery: false }),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    signOut: jest.fn().mockResolvedValue(undefined),
    updateNickname: jest.fn().mockResolvedValue(undefined),
    retrySession: jest.fn().mockResolvedValue(undefined),
    clearError: jest.fn(),
  };
  jest.mocked(useAuth).mockReturnValue(auth);
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useAppStore.setState({
    tournaments: [tournamentFixture("completed")],
    profile: { id: "me", nickname: "Pedro" },
    draft: { ...emptyDraft },
    hydrated: true,
    storageError: null,
  });
});

test("login é voluntário e navegação preserva campeonatos e perfil locais", async () => {
  const before = useAppStore.getState();
  const ui = await render(<AuthScreen mode="sign-in" />);
  expect(ui.getByRole("header", { name: "Entre na competição." })).toBeTruthy();
  await fireEvent.press(ui.getByRole("button", { name: "Criar conta" }));
  expect(router.push).toHaveBeenLastCalledWith("/auth/sign-up");
  await fireEvent.press(
    ui.getByRole("button", { name: "Esqueci minha senha" }),
  );
  expect(router.push).toHaveBeenLastCalledWith("/auth/forgot-password");
  await fireEvent.press(
    ui.getByRole("button", { name: "Continuar sem conta" }),
  );
  expect(router.replace).toHaveBeenCalledWith("/");
  expect(useAppStore.getState().tournaments).toBe(before.tournaments);
  expect(useAppStore.getState().profile).toBe(before.profile);
  expect(auth.signIn).not.toHaveBeenCalled();
});

test("login valida campos, protege senha e usa o método real da fronteira", async () => {
  const ui = await render(<AuthScreen mode="sign-in" />);
  await fireEvent.press(ui.getByRole("button", { name: "Entrar" }));
  expect(ui.getByText("Informe um e-mail válido.")).toBeTruthy();
  expect(ui.getByText("Digite sua senha.")).toBeTruthy();
  expect(auth.signIn).not.toHaveBeenCalled();
  expect(ui.getByLabelText("Senha").props.secureTextEntry).toBe(true);
  expect(ui.getByLabelText("E-mail").props.autoComplete).toBe("email");
  await fireEvent.changeText(ui.getByLabelText("E-mail"), " ana@example.test ");
  await fireEvent.changeText(ui.getByLabelText("Senha"), "senha-teste-segura");
  await fireEvent(ui.getByLabelText("Senha"), "submitEditing");
  expect(auth.signIn).toHaveBeenCalledWith(
    "ana@example.test",
    "senha-teste-segura",
  );
  expect(router.replace).toHaveBeenCalledWith("/profile");
});

test("erro sanitizado aparece e estado ocupado impede novo envio", async () => {
  jest
    .mocked(auth.signIn)
    .mockRejectedValue(new Error("E-mail ou senha incorretos."));
  const ui = await render(<AuthScreen mode="sign-in" />);
  await fireEvent.changeText(ui.getByLabelText("E-mail"), "ana@example.test");
  await fireEvent.changeText(ui.getByLabelText("Senha"), "senha-incorreta");
  await fireEvent.press(ui.getByRole("button", { name: "Entrar" }));
  expect(ui.getByText("E-mail ou senha incorretos.")).toBeTruthy();
  expect(router.replace).not.toHaveBeenCalled();
  auth.busy = true;
  await ui.rerender(<AuthScreen mode="sign-in" />);
  expect(ui.getByRole("button", { name: "Entrar" })).toBeDisabled();
  expect(ui.getByLabelText("E-mail").props.editable).toBe(false);
  await fireEvent.press(ui.getByRole("button", { name: "Entrar" }));
  expect(auth.signIn).toHaveBeenCalledTimes(1);
});

test("cadastro confirma senha e aguarda confirmação de e-mail sem inventar sessão", async () => {
  const ui = await render(<AuthScreen mode="sign-up" />);
  await fireEvent.changeText(ui.getByLabelText("E-mail"), "ana@example.test");
  await fireEvent.changeText(ui.getByLabelText("Senha"), "123");
  await fireEvent.changeText(ui.getByLabelText("Confirmar senha"), "outra");
  await fireEvent.press(ui.getByRole("button", { name: "Criar conta" }));
  expect(ui.getByText("As senhas precisam ser iguais.")).toBeTruthy();
  expect(auth.signUp).not.toHaveBeenCalled();
  await fireEvent.changeText(ui.getByLabelText("Senha"), "senha-teste-segura");
  await fireEvent.changeText(
    ui.getByLabelText("Confirmar senha"),
    "senha-teste-segura",
  );
  await fireEvent.press(ui.getByRole("button", { name: "Criar conta" }));
  expect(auth.signUp).toHaveBeenCalledWith(
    "ana@example.test",
    "senha-teste-segura",
  );
  expect(
    ui.getByText(/Confira seu e-mail para confirmar a conta/),
  ).toBeTruthy();
  expect(ui.getByLabelText("Senha").props.value).toBe("");
  expect(router.replace).not.toHaveBeenCalled();
});

test("recuperação informa resultado genérico sem enumerar contas", async () => {
  const ui = await render(<AuthScreen mode="forgot-password" />);
  await fireEvent.changeText(ui.getByLabelText("E-mail"), "ana@example.test");
  await fireEvent.press(
    ui.getByRole("button", { name: "Enviar link de recuperação" }),
  );
  expect(auth.requestPasswordReset).toHaveBeenCalledWith("ana@example.test");
  expect(ui.getByText(/Se houver uma conta para este e-mail/)).toBeTruthy();
  expect(router.replace).not.toHaveBeenCalled();
});

test("nova senha exige sessão de recuperação e confirma resultado", async () => {
  auth.session = session();
  auth.status = "authenticated";
  const ui = await render(<AuthScreen mode="reset-password" />);
  expect(ui.queryByLabelText("Nova senha")).toBeNull();
  expect(ui.getByText(/Abra um link de recuperação válido/)).toBeTruthy();
  auth.recoveryReady = true;
  auth.status = "recovering";
  await ui.rerender(<AuthScreen mode="reset-password" />);
  await fireEvent.changeText(
    ui.getByLabelText("Nova senha"),
    "nova-senha-segura",
  );
  await fireEvent.changeText(
    ui.getByLabelText("Confirmar senha"),
    "nova-senha-segura",
  );
  await fireEvent.press(ui.getByRole("button", { name: "Salvar nova senha" }));
  expect(auth.updatePassword).toHaveBeenCalledWith("nova-senha-segura");
  expect(
    ui.getByText("Senha atualizada. Entre novamente com sua nova senha."),
  ).toBeTruthy();
  await fireEvent.press(ui.getByRole("button", { name: "Voltar para entrar" }));
  expect(router.replace).toHaveBeenCalledWith("/auth/sign-in");
});

test("callback valida formato, não mostra erro sensível e troca código uma vez", async () => {
  jest
    .mocked(useLocalSearchParams)
    .mockReturnValue({ code: ["um", "dois"], error: "segredo-nao-exibir" });
  const ui = await render(<AuthCallbackScreen />);
  expect(ui.getByText(/Este link é inválido ou expirou/)).toBeTruthy();
  expect(ui.queryByText(/segredo-nao-exibir/)).toBeNull();
  expect(auth.completeCallback).not.toHaveBeenCalled();
  await ui.unmount();
  jest.mocked(useLocalSearchParams).mockReturnValue({ code: "codigo-unico" });
  jest.mocked(auth.completeCallback).mockResolvedValue({ recovery: true });
  const callback = await render(<AuthCallbackScreen />);
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith("/auth/reset-password"),
  );
  await callback.rerender(<AuthCallbackScreen />);
  expect(auth.completeCallback).toHaveBeenCalledTimes(1);
  expect(auth.completeCallback).toHaveBeenCalledWith("codigo-unico");
});

test("resposta de callback desmontado não retoma navegação", async () => {
  let finish!: (value: { recovery: boolean }) => void;
  jest.mocked(auth.completeCallback).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  jest.mocked(useLocalSearchParams).mockReturnValue({ code: "codigo-unico" });
  const ui = await render(<AuthCallbackScreen />);
  await ui.unmount();
  await act(async () => {
    finish({ recovery: false });
  });
  expect(router.replace).not.toHaveBeenCalled();
});

test("callback preserva sb_flow_id e rejeita identificadores ambíguos", async () => {
  jest
    .mocked(useLocalSearchParams)
    .mockReturnValue({ code: "codigo-unico", sb_flow_id: "test-flow-id" });
  const ui = await render(<AuthCallbackScreen />);
  await waitFor(() =>
    expect(auth.completeCallback).toHaveBeenCalledWith(
      "codigo-unico",
      "test-flow-id",
    ),
  );
  await ui.unmount();
  jest.mocked(auth.completeCallback).mockClear();
  jest
    .mocked(useLocalSearchParams)
    .mockReturnValue({
      code: "codigo-unico",
      sb_flow_id: ["flow-one", "flow-two"],
    });
  const invalid = await render(<AuthCallbackScreen />);
  expect(invalid.getByText(/Este link é inválido ou expirou/)).toBeTruthy();
  expect(auth.completeCallback).not.toHaveBeenCalled();
});

test("novo código na mesma rota invalida a resposta do link anterior", async () => {
  let finishOld!: (value: { recovery: boolean }) => void;
  jest
    .mocked(auth.completeCallback)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
    )
    .mockResolvedValueOnce({ recovery: true });
  jest
    .mocked(useLocalSearchParams)
    .mockReturnValue({ code: "codigo-anterior" });
  const ui = await render(<AuthCallbackScreen />);
  jest.mocked(useLocalSearchParams).mockReturnValue({ code: "codigo-novo" });
  await ui.rerender(<AuthCallbackScreen />);
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith("/auth/reset-password"),
  );
  await act(async () => {
    finishOld({ recovery: false });
  });
  expect(auth.completeCallback).toHaveBeenCalledTimes(2);
  expect(router.replace).toHaveBeenCalledTimes(1);
});

test("sem configuração ou durante hidratação, conta não bloqueia acesso local", async () => {
  auth.configured = false;
  const ui = await render(<AuthScreen mode="sign-in" />);
  expect(ui.getByText(/As contas estão indisponíveis/)).toBeTruthy();
  expect(ui.queryByLabelText("Senha")).toBeNull();
  await fireEvent.press(
    ui.getByRole("button", { name: "Continuar sem conta" }),
  );
  expect(router.replace).toHaveBeenCalledWith("/");
  auth.configured = true;
  auth.status = "initializing";
  await ui.rerender(<AccountPanel />);
  expect(
    ui.getByRole("progressbar", { name: "Verificando sua sessão…" }),
  ).toBeTruthy();
  expect(ui.queryByText("Conta conectada")).toBeNull();
});

test("perfil autenticado edita conta, mantém identidade e estatísticas locais e sai", async () => {
  auth.status = "authenticated";
  auth.session = session();
  auth.profile = remoteProfile();
  const before = useAppStore.getState();
  const ui = await render(<ProfileScreen />);
  expect(ui.getByText("Conta conectada")).toBeTruthy();
  expect(ui.getByText("conta@example.test")).toBeTruthy();
  expect(ui.getByText("Sua trajetória local")).toBeTruthy();
  expect(
    ui.getByText("2 partidas disputadas · 100% de aproveitamento"),
  ).toBeTruthy();
  expect(ui.getByLabelText("Seu apelido").props.value).toBe("Pedro");
  await fireEvent.changeText(
    ui.getByLabelText("Apelido da conta"),
    "Ana da conta",
  );
  await fireEvent.press(
    ui.getByRole("button", { name: "Salvar apelido da conta" }),
  );
  expect(auth.updateNickname).toHaveBeenCalledWith("Ana da conta");
  expect(ui.getByText("Apelido da conta atualizado.")).toBeTruthy();
  await fireEvent.press(ui.getByRole("button", { name: "Sair da conta" }));
  expect(auth.signOut).toHaveBeenCalledTimes(1);
  expect(useAppStore.getState().tournaments).toBe(before.tournaments);
  expect(useAppStore.getState().profile).toBe(before.profile);
});

test("troca de conta remove apelido editado e feedback da conta anterior", async () => {
  auth.status = "authenticated";
  auth.session = session();
  auth.profile = remoteProfile();
  const ui = await render(<AccountPanel />);
  await fireEvent.changeText(
    ui.getByLabelText("Apelido da conta"),
    "Rascunho de A",
  );
  const otherId = "22222222-2222-4222-8222-222222222222";
  auth = {
    ...auth,
    session: session(otherId),
    profile: { ...remoteProfile(otherId), nickname: "Bia" },
  };
  jest.mocked(useAuth).mockReturnValue(auth);
  await ui.rerender(<AccountPanel />);
  expect(ui.getByLabelText("Apelido da conta").props.value).toBe("Bia");
  expect(ui.queryByText("Rascunho de A")).toBeNull();
});
