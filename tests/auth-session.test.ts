import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import {
  AuthController,
  type RemoteProfile,
} from "../src/features/auth/AuthController";
import { createChunkedSessionStorage } from "../src/features/auth/chunkedStorage";
import { normalizeNickname } from "../src/features/auth/validation";
import { useAppStore } from "../src/store/useAppStore";

// SDK responses are controlled fixtures here. Real GoTrue and database tests are separate.
const session = (id: string): Session => ({
  access_token: `test-access-${id}`,
  refresh_token: `test-refresh-${id}`,
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id,
    aud: "authenticated",
    created_at: "2026-11-23T00:00:00.000Z",
    app_metadata: {},
    user_metadata: {},
  },
});
const profile = (id: string): RemoteProfile => ({
  user_id: id,
  nickname: `Perfil ${id}`,
  created_at: "2026-11-23T00:00:00.000Z",
  updated_at: "2026-11-23T00:00:00.000Z",
});
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup() {
  let handler:
    ((event: AuthChangeEvent, value: Session | null) => void) | undefined;
  let queryUser = "";
  const unsubscribe = jest.fn();
  const profiles = jest.fn(
    async (
      id: string,
    ): Promise<{ data: RemoteProfile | null; error: unknown }> => ({
      data: profile(id),
      error: null,
    }),
  );
  const auth = {
    onAuthStateChange: jest.fn((callback) => {
      handler = callback;
      return { data: { subscription: { unsubscribe } } };
    }),
    getSession: jest.fn(async () => ({
      data: { session: null as Session | null },
      error: null,
    })),
    getUser: jest.fn(async () => ({
      data: { user: session("A").user },
      error: null as unknown,
    })),
    signInWithPassword: jest.fn(async () => ({
      data: { session: session("A") },
      error: null as unknown,
    })),
    signInAnonymously: jest.fn(async () => ({
      data: {
        session: {
          ...session("guest"),
          user: { ...session("guest").user, is_anonymous: true },
        },
      },
      error: null as unknown,
    })),
    signUp: jest.fn(async () => ({
      data: { session: null as Session | null },
      error: null as unknown,
    })),
    signOut: jest.fn(async () => {
      handler?.("SIGNED_OUT", null);
      return { error: null as unknown };
    }),
    exchangeCodeForSession: jest.fn(async () => {
      handler?.("PASSWORD_RECOVERY", session("A"));
      return { data: { session: session("A") }, error: null as unknown };
    }),
    updateUser: jest.fn(async () => ({ error: null as unknown })),
    resetPasswordForEmail: jest.fn(async () => ({ error: null as unknown })),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  };
  const query: {
    select: jest.Mock;
    update: jest.Mock;
    eq: jest.Mock;
    abortSignal: jest.Mock;
    single: jest.Mock;
  } = {
    select: jest.fn(() => query),
    update: jest.fn(() => query),
    eq: jest.fn((_key: string, value: string) => {
      queryUser = value;
      return query;
    }),
    abortSignal: jest.fn(() => query),
    single: jest.fn(() => profiles(queryUser)),
  };
  const client = {
    auth,
    from: jest.fn(() => query),
  } as unknown as SupabaseClient;
  const controller = new AuthController(
    client,
    () => "matchmaking://auth/callback",
  );
  return {
    controller,
    auth,
    profiles,
    query,
    emit: (event: AuthChangeEvent, value: Session | null) =>
      handler?.(event, value),
    unsubscribe,
  };
}

test("convidado só inicia por ação explícita e não carrega perfil recuperável", async () => {
  const s = setup();
  s.controller.start();
  await flush();
  expect(s.auth.signInAnonymously).not.toHaveBeenCalled();
  await s.controller.signInAsGuest();
  await flush();
  expect(s.controller.getSnapshot().session?.user.is_anonymous).toBe(true);
  expect(s.controller.getSnapshot().profile).toBeNull();
  expect(s.profiles).not.toHaveBeenCalled();
  await expect(s.controller.updateNickname("Novo")).rejects.toThrow(
    "Convidados",
  );
  s.controller.stop();
});

test("entrada como convidado não substitui sessão registrada no SDK", async () => {
  const s = setup();
  s.controller.start();
  await flush();
  s.auth.getSession.mockResolvedValue({
    data: { session: session("A") },
    error: null,
  });
  await expect(s.controller.signInAsGuest()).rejects.toThrow("sessão atual");
  expect(s.auth.signInAnonymously).not.toHaveBeenCalled();
  s.controller.stop();
});

test("resposta antiga de entrada anônima não reaparece depois de desmontar", async () => {
  const s = setup(),
    pending = deferred<Awaited<ReturnType<typeof s.auth.signInAnonymously>>>();
  s.auth.signInAnonymously.mockImplementation(() => pending.promise);
  s.controller.start();
  await flush();
  const result = s.controller.signInAsGuest();
  await flush();
  s.controller.stop();
  const guest = {
    ...session("guest"),
    user: { ...session("guest").user, is_anonymous: true },
  };
  s.emit("SIGNED_IN", guest);
  pending.resolve({ data: { session: guest }, error: null });
  await expect(result).rejects.toThrow("interrompida");
  expect(s.controller.getSnapshot().session).toBeNull();
});

test("armazenamento seguro recompõe sessão grande e publica só gerações completas", async () => {
  const values = new Map<string, string>();
  let fail = false;
  let writes = 0;
  const storage = createChunkedSessionStorage({
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      if (fail && ++writes === 2) throw new Error("Device is full");
      expect(new TextEncoder().encode(value).length).toBeLessThan(2048);
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  });
  const oldSession = JSON.stringify({
    access_token: "antigo",
    nickname: "á🏆".repeat(2500),
  });
  await storage.setItem("auth-only", oldSession);
  expect(await storage.getItem("auth-only")).toBe(oldSession);
  fail = true;
  await expect(
    storage.setItem("auth-only", "nova".repeat(2500)),
  ).rejects.toThrow();
  expect(await storage.getItem("auth-only")).toBe(oldSession);
  await storage.removeItem("auth-only");
  expect(values.size).toBe(0);
});

test("sessão incompleta é recusada sem fallback em texto puro", async () => {
  const values = new Map<string, string>();
  const storage = createChunkedSessionStorage({
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  });
  await storage.setItem("auth-only", "secret".repeat(1000));
  const chunk = [...values.keys()].find((key) => key !== "auth-only")!;
  values.delete(chunk);
  await expect(storage.getItem("auth-only")).rejects.toThrow("recuperar");
});

test("hidratação valida sessão persistida no Auth antes de mostrar o perfil", async () => {
  const { controller, auth } = setup();
  const user = deferred<Awaited<ReturnType<typeof auth.getUser>>>();
  auth.getSession.mockResolvedValue({
    data: { session: session("A") },
    error: null,
  });
  auth.getUser.mockReturnValue(user.promise);
  controller.start();
  await flush();
  expect(controller.getSnapshot()).toMatchObject({
    status: "recovering",
    session: null,
    profile: null,
  });
  user.resolve({ data: { user: session("A").user }, error: null });
  await flush();
  expect(controller.getSnapshot()).toMatchObject({
    status: "authenticated",
    profile: { user_id: "A" },
  });
  expect(auth.getUser).toHaveBeenCalledWith("test-access-A");
  controller.stop();
});

test("logout e conta B ignoram perfil atrasado da conta A e preservam dados locais", async () => {
  const { controller, auth, profiles, unsubscribe } = setup();
  const localBefore = JSON.stringify({
    tournaments: useAppStore.getState().tournaments,
    profile: useAppStore.getState().profile,
    draft: useAppStore.getState().draft,
  });
  const late = deferred<{ data: RemoteProfile; error: null }>();
  profiles.mockImplementation((id) =>
    id === "A"
      ? late.promise
      : Promise.resolve({ data: profile(id), error: null }),
  );
  controller.start();
  await flush();
  await controller.signIn("a@example.test", "valid-password");
  expect(controller.getSnapshot().session?.user.id).toBe("A");
  await controller.signOut();
  expect(controller.getSnapshot()).toMatchObject({
    status: "signedOut",
    session: null,
    profile: null,
  });
  auth.signInWithPassword.mockResolvedValue({
    data: { session: session("B") },
    error: null,
  });
  await controller.signIn("b@example.test", "valid-password");
  await flush();
  late.resolve({ data: profile("A"), error: null });
  await flush();
  expect(controller.getSnapshot()).toMatchObject({
    session: { user: { id: "B" } },
    profile: { user_id: "B" },
  });
  expect(
    JSON.stringify({
      tournaments: useAppStore.getState().tournaments,
      profile: useAppStore.getState().profile,
      draft: useAppStore.getState().draft,
    }),
  ).toBe(localBefore);
  expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  controller.stop();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test("cadastro pendente e credenciais recusadas não inventam sessão", async () => {
  const { controller, auth } = setup();
  controller.start();
  await flush();
  await expect(
    controller.signUp(" a@example.test ", "valid-password"),
  ).resolves.toEqual({ needsConfirmation: true });
  expect(controller.getSnapshot().session).toBeNull();
  expect(auth.signUp).toHaveBeenCalledWith(
    expect.objectContaining({
      email: "a@example.test",
      options: { emailRedirectTo: "matchmaking://auth/callback" },
    }),
  );
  auth.signInWithPassword.mockResolvedValue({
    data: { session: null as unknown as Session },
    error: {
      code: "email_not_confirmed",
      message: "internal private response",
    },
  });
  await expect(
    controller.signIn("a@example.test", "valid-password"),
  ).rejects.toThrow("Confirme seu e-mail");
  expect(controller.getSnapshot().session).toBeNull();
  auth.signInWithPassword.mockResolvedValue({
    data: { session: null as unknown as Session },
    error: { code: "invalid_credentials" },
  });
  await expect(
    controller.signIn("a@example.test", "wrong-password"),
  ).rejects.toThrow("E-mail ou senha incorretos");
  controller.stop();
});

test("revogação, falha de rede e falha segura de armazenamento ocultam dados remotos", async () => {
  const { controller, auth } = setup();
  controller.start();
  await flush();
  await controller.signIn("a@example.test", "valid-password");
  await flush();
  auth.getSession.mockResolvedValue({
    data: { session: session("A") },
    error: null,
  });
  auth.getUser.mockResolvedValue({
    data: { user: session("A").user },
    error: { code: "session_not_found" },
  });
  await controller.retrySession();
  expect(controller.getSnapshot().profile).toBeNull();
  expect(auth.signOut).toHaveBeenCalled();
  auth.getUser.mockRejectedValue(
    new TypeError("private network address with credentials"),
  );
  await controller.retrySession();
  expect(controller.getSnapshot()).toMatchObject({
    status: "error",
    profile: null,
    session: null,
  });
  expect(controller.getSnapshot().error).not.toContain("private");
  controller.reportStorageError("Armazenamento seguro indisponível.");
  expect(controller.getSnapshot()).toMatchObject({
    status: "error",
    session: null,
    error: "Armazenamento seguro indisponível.",
  });
  controller.stop();
});

test("refresh concorrente é deduplicado e token novo atualiza sessão", async () => {
  const { controller, auth, emit } = setup();
  controller.start();
  await flush();
  await controller.signIn("a@example.test", "valid-password");
  await flush();
  auth.getSession.mockResolvedValue({
    data: { session: session("A") },
    error: null,
  });
  const pending = deferred<Awaited<ReturnType<typeof auth.getUser>>>();
  auth.getUser.mockReturnValue(pending.promise);
  const first = controller.retrySession();
  const second = controller.retrySession();
  expect(first).toBe(second);
  await flush();
  pending.resolve({ data: { user: session("A").user }, error: null });
  await first;
  emit("TOKEN_REFRESHED", { ...session("A"), access_token: "test-refreshed" });
  await flush();
  expect(controller.getSnapshot().session?.access_token).toBe("test-refreshed");
  controller.stop();
});

test("recuperação exige evento real do SDK e link é trocado uma única vez", async () => {
  const { controller, auth } = setup();
  controller.start();
  await flush();
  await expect(controller.updatePassword("new-password")).rejects.toThrow(
    "link de recuperação",
  );
  await controller.requestPasswordReset("a@example.test");
  const one = controller.completeCallback("test-code-recovery");
  const two = controller.completeCallback("test-code-recovery");
  expect(one).toBe(two);
  await expect(one).resolves.toEqual({ recovery: true });
  expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().recoveryReady).toBe(true);
  await controller.updatePassword("new-password");
  expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
  expect(controller.getSnapshot()).toMatchObject({
    status: "signedOut",
    recoveryReady: false,
  });
  controller.stop();
});

test("perfil edita só nickname validado, sem transferir identidade local", async () => {
  expect(normalizeNickname("  José   🏆  ")).toBe("José 🏆");
  for (const nickname of ["a", " ", "A\u200bB", "A\u202eB", "a".repeat(41)])
    expect(() => normalizeNickname(nickname)).toThrow();
  const { controller, query } = setup();
  controller.start();
  await flush();
  await controller.signIn("a@example.test", "valid-password");
  await flush();
  await controller.updateNickname("  Meu   apelido ");
  expect(query.update).toHaveBeenCalledWith({ nickname: "Meu apelido" });
  expect(query.eq).toHaveBeenLastCalledWith("user_id", "A");
  controller.stop();
});

test("callback a frio instala listener antes da troca e remount cancela hidratação antiga", async () => {
  const cold = setup();
  await expect(
    cold.controller.completeCallback("test-cold-recovery"),
  ).resolves.toEqual({ recovery: true });
  expect(cold.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  expect(cold.controller.getSnapshot().recoveryReady).toBe(true);
  cold.controller.stop();

  const { controller, auth } = setup();
  const old = deferred<Awaited<ReturnType<typeof auth.getSession>>>();
  auth.getSession.mockReturnValueOnce(old.promise);
  controller.start();
  controller.stop();
  controller.start();
  await flush();
  expect(controller.getSnapshot().status).toBe("signedOut");
  old.resolve({ data: { session: session("A") }, error: null });
  await flush();
  expect(controller.getSnapshot()).toMatchObject({
    status: "signedOut",
    session: null,
    profile: null,
  });
  controller.stop();
});

test("logout offline limpa a conta e informa revogação não confirmada", async () => {
  const { controller, auth } = setup();
  controller.start();
  await flush();
  await controller.signIn("a@example.test", "valid-password");
  await flush();
  auth.signOut.mockResolvedValue({
    error: { code: "unexpected_failure", message: "internal address" },
  });
  await expect(controller.signOut()).rejects.toThrow(
    "Você saiu deste dispositivo",
  );
  expect(controller.getSnapshot()).toMatchObject({
    status: "signedOut",
    session: null,
    profile: null,
  });
  expect(controller.getSnapshot().error).not.toContain("internal");
  auth.signOut.mockResolvedValue({ error: null });
  await controller.signIn("a@example.test", "valid-password");
  await flush();
  expect(controller.getSnapshot()).toMatchObject({
    status: "authenticated",
    profile: { user_id: "A" },
  });
  controller.stop();
});

test("login e erro atrasados após desmontagem não restauram conta nem substituem estado novo", async () => {
  const { controller, auth } = setup();
  controller.start();
  await flush();
  const late = deferred<Awaited<ReturnType<typeof auth.signInWithPassword>>>();
  auth.signInWithPassword.mockReturnValueOnce(late.promise);
  const pending = controller.signIn("a@example.test", "valid-password");
  controller.stop();
  controller.start();
  await flush();
  late.resolve({ data: { session: session("A") }, error: null });
  await expect(pending).rejects.toThrow("interrompida");
  expect(controller.getSnapshot()).toMatchObject({
    session: null,
    profile: null,
    busy: false,
  });
  controller.stop();
});

test("logout externo invalida login pendente e sessão expirada tem estado próprio", async () => {
  const { controller, auth, emit } = setup();
  controller.start();
  await flush();
  const late = deferred<Awaited<ReturnType<typeof auth.signInWithPassword>>>();
  auth.signInWithPassword.mockReturnValueOnce(late.promise);
  const pending = controller.signIn("a@example.test", "valid-password");
  emit("SIGNED_OUT", null);
  late.resolve({ data: { session: session("A") }, error: null });
  await expect(pending).rejects.toThrow("interrompida");
  expect(controller.getSnapshot()).toMatchObject({
    status: "signedOut",
    session: null,
  });
  auth.getSession.mockResolvedValue({
    data: { session: session("A") },
    error: null,
  });
  auth.getUser.mockResolvedValue({
    data: { user: session("A").user },
    error: { code: "session_not_found" },
  });
  await controller.retrySession();
  expect(controller.getSnapshot()).toMatchObject({
    status: "expired",
    session: null,
    profile: null,
  });
  controller.stop();
});

test("callback encaminha o identificador PKCE ao SDK para isolar fluxos simultâneos", async () => {
  const { controller, auth } = setup();
  await controller.completeCallback("test-pkce-code", "test-flow-id");
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("test-pkce-code", {
    flowId: "test-flow-id",
  });
  controller.stop();
});

test("remount mantém chamada física serializada e ignora SIGNED_IN atrasado antes da resposta", async () => {
  const { controller, auth, emit } = setup();
  controller.start();
  await flush();
  const late = deferred<Awaited<ReturnType<typeof auth.signInWithPassword>>>();
  auth.signInWithPassword.mockImplementationOnce(async () => {
    const result = await late.promise;
    // Match the SDK ordering: persist/notify, then resolve the HTTP operation.
    emit("SIGNED_IN", result.data.session);
    return result;
  });
  const first = controller.signIn("a@example.test", "valid-password");
  controller.stop();
  controller.start();
  await flush();
  await expect(
    controller.signIn("b@example.test", "valid-password"),
  ).rejects.toThrow("Aguarde");
  expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
  late.resolve({ data: { session: session("A") }, error: null });
  await expect(first).rejects.toThrow("interrompida");
  await flush();
  expect(controller.getSnapshot()).toMatchObject({
    session: null,
    profile: null,
    busy: false,
  });
  auth.signInWithPassword.mockResolvedValue({
    data: { session: session("B") },
    error: null,
  });
  await controller.signIn("b@example.test", "valid-password");
  await flush();
  expect(controller.getSnapshot().session?.user.id).toBe("B");
  controller.stop();
});
