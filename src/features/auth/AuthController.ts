import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import {
  AuthUserError,
  authErrorMessage,
  normalizeEmail,
  normalizeNickname,
  validatePassword,
} from "./validation";

export type RemoteProfile = {
  user_id: string;
  nickname: string;
  created_at: string;
  updated_at: string;
};
export type AuthState = {
  configured: boolean;
  status:
    | "initializing"
    | "signedOut"
    | "authenticated"
    | "recovering"
    | "refreshing"
    | "expired"
    | "error";
  session: Session | null;
  profile: RemoteProfile | null;
  error: string | null;
  busy: boolean;
  recoveryReady: boolean;
};
export const signedOutAuthState: AuthState = {
  configured: false,
  status: "signedOut",
  session: null,
  profile: null,
  error: null,
  busy: false,
  recoveryReady: false,
};

const profileColumns = "user_id,nickname,created_at,updated_at";
const terminalCodes = new Set([
  "session_not_found",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "user_not_found",
  "bad_jwt",
]);

/** Account state is deliberately separate from the local tournament store. */
export class AuthController {
  private state: AuthState;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private profileRequest: AbortController | null = null;
  private unsubscribeAuth: (() => void) | null = null;
  private running = false;
  private operationPending = false;
  private operationId = 0;
  private sessionInvalidation = 0;
  private suppressSession = false;
  private recoveryEventToken: string | null = null;
  private validation: Promise<void> | null = null;
  private callback: {
    code: string;
    flowId?: string;
    result: Promise<{ recovery: boolean }>;
  } | null = null;

  constructor(
    private readonly client: SupabaseClient | null,
    private readonly redirectTo: () => string,
    configurationError: string | null = null,
  ) {
    this.state = {
      ...signedOutAuthState,
      configured: !!client,
      status: client ? "initializing" : "signedOut",
      error: configurationError,
    };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private patch(update: Partial<AuthState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener());
  }
  private clearAccount() {
    this.epoch++;
    this.profileRequest?.abort();
    this.profileRequest = null;
    this.patch({ session: null, profile: null, recoveryReady: false });
  }
  private requireClient() {
    if (!this.client)
      throw new AuthUserError(
        "A conexão com sua conta ainda não foi configurada. Você pode continuar sem conta.",
      );
    return this.client;
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (!this.client) return;
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      // Do not await Auth SDK calls while its internal event lock is held.
      if (event === "INITIAL_SESSION") return;
      if (event === "PASSWORD_RECOVERY" && !this.suppressSession)
        this.recoveryEventToken = session?.access_token ?? null;
      if (event === "SIGNED_OUT") {
        this.sessionInvalidation++;
        this.clearAccount();
        this.patch({ status: "signedOut" });
        return;
      }
      const eventEpoch = this.epoch;
      queueMicrotask(() => {
        if (
          !this.running ||
          this.suppressSession ||
          !session ||
          this.validation ||
          eventEpoch !== this.epoch
        )
          return;
        this.acceptSession(session, event);
      });
    });
    this.unsubscribeAuth = () => data.subscription.unsubscribe();
    void this.retrySession().catch(() => undefined);
  }

  stop() {
    this.running = false;
    this.sessionInvalidation++;
    this.operationId++;
    this.operationPending = false;
    this.patch({ busy: false });
    this.epoch++;
    this.validation = null;
    this.profileRequest?.abort();
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
  }

  reportStorageError = (message: string) => {
    this.sessionInvalidation++;
    this.suppressSession = true;
    this.clearAccount();
    this.patch({ status: "error", error: message });
  };

  private acceptSession(session: Session, event?: AuthChangeEvent) {
    if (!this.running || this.suppressSession) return;
    const changed = session.user.id !== this.state.session?.user.id;
    if (changed) this.clearAccount();
    const recoveryReady =
      event === "PASSWORD_RECOVERY" || (!changed && this.state.recoveryReady);
    this.patch({
      session,
      status: recoveryReady ? "recovering" : "authenticated",
      recoveryReady,
    });
    if (changed || !this.state.profile) void this.loadProfile(session.user.id);
  }

  private async loadProfile(userId: string) {
    const client = this.client;
    if (!client) return;
    this.profileRequest?.abort();
    const abort = new AbortController();
    this.profileRequest = abort;
    const epoch = this.epoch;
    try {
      const { data, error } = await client
        .from("profiles")
        .select(profileColumns)
        .eq("user_id", userId)
        .abortSignal(abort.signal)
        .single();
      if (
        epoch !== this.epoch ||
        abort.signal.aborted ||
        this.state.session?.user.id !== userId
      )
        return;
      if (error || !data || data.user_id !== userId) {
        this.patch({
          error: "Não foi possível carregar seu perfil. Tente novamente.",
          profile: null,
        });
        return;
      }
      this.patch({ profile: data as RemoteProfile });
    } catch {
      if (epoch === this.epoch && !abort.signal.aborted)
        this.patch({
          error: "Não foi possível carregar seu perfil. Tente novamente.",
          profile: null,
        });
    }
  }

  retrySession = (): Promise<void> => {
    if (this.validation) return this.validation;
    const run = async () => {
      const client = this.requireClient();
      const recoveryUser = this.state.recoveryReady
        ? this.state.session?.user.id
        : null;
      const refreshing = !!this.state.session && !recoveryUser;
      this.suppressSession = false;
      this.clearAccount();
      const epoch = this.epoch;
      this.patch({
        status: refreshing ? "refreshing" : "recovering",
        error: null,
      });
      try {
        const { data, error } = await client.auth.getSession();
        if (epoch !== this.epoch || this.suppressSession) return;
        if (error) throw error;
        if (!data.session) {
          this.patch({ status: "signedOut" });
          return;
        }
        const verified = await client.auth.getUser(data.session.access_token);
        if (epoch !== this.epoch || this.suppressSession) return;
        if (verified.error) throw verified.error;
        if (
          !verified.data.user ||
          verified.data.user.id !== data.session.user.id
        )
          throw { code: "session_not_found" };
        this.acceptSession(
          { ...data.session, user: verified.data.user },
          recoveryUser === verified.data.user.id
            ? "PASSWORD_RECOVERY"
            : undefined,
        );
      } catch (error) {
        if (epoch !== this.epoch || this.suppressSession) return;
        this.clearAccount();
        this.patch({ status: "error", error: authErrorMessage(error) });
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "";
        if (terminalCodes.has(code)) {
          const operationId = this.operationId;
          await client.auth.signOut({ scope: "local" }).catch(() => undefined);
          if (
            this.running &&
            operationId === this.operationId &&
            !this.state.session
          )
            this.patch({ status: "expired", error: authErrorMessage(error) });
        }
      }
    };
    const validation = run().finally(() => {
      if (this.validation === validation) this.validation = null;
    });
    this.validation = validation;
    return validation;
  };

  private async operation<T>(run: () => Promise<T>): Promise<T> {
    if (this.operationPending)
      throw new AuthUserError("Aguarde a operação atual terminar.");
    this.operationPending = true;
    const operationId = ++this.operationId;
    this.patch({ busy: true, error: null });
    try {
      return await run();
    } catch (error) {
      // Our own validation errors are safe; SDK errors must be sanitized.
      const message =
        error instanceof AuthUserError
          ? error.message
          : this.state.status === "error" &&
              this.suppressSession &&
              this.state.error
            ? this.state.error
            : authErrorMessage(error);
      if (operationId === this.operationId) this.patch({ error: message });
      throw new AuthUserError(message);
    } finally {
      if (operationId === this.operationId) {
        this.operationPending = false;
        this.patch({ busy: false });
      }
    }
  }

  signIn = (email: string, password: string) =>
    this.operation(async () => {
      const client = this.requireClient();
      const credentials = { email: normalizeEmail(email), password };
      if (!password || password.length > 128)
        throw new AuthUserError("Informe sua senha.");
      this.suppressSession = false;
      this.clearAccount();
      const invalidation = this.sessionInvalidation;
      const { data, error } = await client.auth.signInWithPassword(credentials);
      if (!this.running || invalidation !== this.sessionInvalidation)
        throw new AuthUserError(
          "A operação foi interrompida. Tente novamente.",
        );
      if (error) throw error;
      if (!data.session)
        throw new AuthUserError(
          "Não foi possível iniciar a sessão. Tente novamente.",
        );
      this.acceptSession(data.session);
    });

  signUp = (email: string, password: string) =>
    this.operation(async () => {
      const client = this.requireClient();
      this.suppressSession = false;
      const invalidation = this.sessionInvalidation;
      const { data, error } = await client.auth.signUp({
        email: normalizeEmail(email),
        password: validatePassword(password),
        options: { emailRedirectTo: this.redirectTo() },
      });
      if (!this.running || invalidation !== this.sessionInvalidation)
        throw new AuthUserError(
          "A operação foi interrompida. Tente novamente.",
        );
      if (error) throw error;
      if (data.session) this.acceptSession(data.session);
      return { needsConfirmation: !data.session };
    });

  requestPasswordReset = (email: string) =>
    this.operation(async () => {
      const { error } = await this.requireClient().auth.resetPasswordForEmail(
        normalizeEmail(email),
        { redirectTo: this.redirectTo() },
      );
      if (error) throw error;
    });

  completeCallback = (
    code: string,
    flowId?: string,
  ): Promise<{ recovery: boolean }> => {
    // Child route effects can run before the provider's mounting effect.
    this.start();
    if (this.callback?.code === code && this.callback.flowId === flowId)
      return this.callback.result;
    const result = this.operation(async () => {
      if (!/^[A-Za-z0-9._~-]{8,2048}$/.test(code))
        throw new AuthUserError(
          "Este link é inválido. Solicite um novo e-mail.",
        );
      this.suppressSession = false;
      this.clearAccount();
      this.recoveryEventToken = null;
      const invalidation = this.sessionInvalidation;
      const { data, error } =
        await this.requireClient().auth.exchangeCodeForSession(
          code,
          flowId ? { flowId } : undefined,
        );
      if (!this.running || invalidation !== this.sessionInvalidation)
        throw new AuthUserError(
          "A operação foi interrompida. Solicite outro link.",
        );
      if (error) throw error;
      if (!data.session)
        throw new AuthUserError(
          "Este link expirou ou já foi usado. Solicite um novo e-mail.",
        );
      const recovery = this.recoveryEventToken === data.session.access_token;
      this.recoveryEventToken = null;
      this.acceptSession(
        data.session,
        recovery ? "PASSWORD_RECOVERY" : "SIGNED_IN",
      );
      return { recovery };
    });
    this.callback = { code, flowId, result };
    return result;
  };

  updatePassword = (password: string) =>
    this.operation(async () => {
      if (!this.state.recoveryReady || !this.state.session)
        throw new AuthUserError(
          "Abra um link de recuperação válido antes de definir a senha.",
        );
      const invalidation = this.sessionInvalidation;
      const { error } = await this.requireClient().auth.updateUser({
        password: validatePassword(password),
      });
      if (!this.running || invalidation !== this.sessionInvalidation)
        throw new AuthUserError(
          "A operação foi interrompida. Entre novamente.",
        );
      if (error) throw error;
      await this.finishLocalSignOut();
    });

  private async finishLocalSignOut() {
    this.suppressSession = true;
    this.clearAccount();
    this.patch({ status: "signedOut" });
    try {
      const { error } = await this.requireClient().auth.signOut({
        scope: "local",
      });
      if (error) throw error;
    } catch {
      if (this.state.status === "error" && this.state.error)
        throw new AuthUserError(this.state.error);
      throw new AuthUserError(
        "Você saiu deste dispositivo. Não foi possível confirmar a revogação no servidor. Confira sua conexão.",
      );
    }
  }

  signOut = () => this.operation(() => this.finishLocalSignOut());

  updateNickname = (nickname: string) =>
    this.operation(async () => {
      const client = this.requireClient();
      const userId = this.state.session?.user.id;
      if (!userId)
        throw new AuthUserError("Entre na sua conta para editar o perfil.");
      const epoch = this.epoch;
      this.profileRequest?.abort();
      const { data, error } = await client
        .from("profiles")
        .update({ nickname: normalizeNickname(nickname) })
        .eq("user_id", userId)
        .select(profileColumns)
        .single();
      if (epoch !== this.epoch || this.state.session?.user.id !== userId)
        return;
      if (error || !data || data.user_id !== userId)
        throw new AuthUserError(
          "Não foi possível salvar seu perfil. Tente novamente.",
        );
      this.patch({ profile: data as RemoteProfile });
    });

  clearError = () => this.patch({ error: null });
}
