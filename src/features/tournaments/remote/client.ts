import type { Tournament, CreateTournamentInput } from "../domain/types";
import {
  canonicalSnapshot,
  canonicalJson,
  parseImportSnapshot,
} from "../domain/snapshot";
import { createJournal } from "./journal";

export type RemoteStatus =
  | "loading"
  | "success"
  | "error"
  | "unauthorized"
  | "conflict"
  | "offline"
  | "refreshing";
export type RemoteSnapshot = {
  tournamentId: string;
  revision: number;
  tournament: Tournament;
};
export type TournamentSummary = {
  tournamentId: string;
  name: string;
  modality: string;
  capacity: 4 | 8 | 16;
  status: Tournament["status"];
  revision: number;
  participantCount: number;
  completedMatches: number;
  totalMatches: number;
  champion?: string;
  createdAt: string;
  updatedAt: string;
};
type Detail = { data?: RemoteSnapshot; status: RemoteStatus; error?: string };
type State = {
  items: TournamentSummary[];
  nextCursor: string | null;
  status: RemoteStatus;
  error?: string;
  details: Record<string, Detail>;
  busy: boolean;
  pending: Record<string, boolean>;
};
export class RemoteError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(remoteMessage(code));
  }
}
export function remoteMessage(code: string): string {
  return (
    (
      {
        REVISION_CONFLICT:
          "Este campeonato foi atualizado. Carregamos a versão recente; revise sua intenção e confirme novamente.",
        RETRY_SAME_COMMAND:
          "A operação não foi confirmada. Tente novamente com a mesma intenção.",
        IDEMPOTENCY_KEY_REUSED:
          "Esta tentativa pertence a outra operação. Atualize a tela e revise os dados.",
        NEW_COPY_REQUIRED:
          "O original mudou desde a importação. Confirme uma nova cópia para preservar a anterior.",
        IMPORT_CONTENT_CHANGED:
          "O original mudou. Confirme uma nova cópia; a anterior será preservada.",
        PENDING_OPERATION:
          "Existe uma tentativa sem confirmação. Repita os mesmos dados antes de iniciar outra operação.",
        UNAUTHORIZED:
          "Entre na sua conta novamente para consultar os campeonatos na nuvem.",
        FORBIDDEN: "Sua conta não tem acesso a este campeonato.",
        OFFLINE:
          "Sem confirmação do servidor. Verifique a conexão e tente novamente; seus dados locais continuam disponíveis.",
        IMPORT_MISMATCH:
          "A cópia remota não corresponde ao original. O original foi preservado; consulte a cópia antes de continuar.",
        JOURNAL_UNAVAILABLE:
          "Não foi possível guardar a tentativa com segurança. Verifique o armazenamento e tente novamente.",
        INVALID_SNAPSHOT:
          "Este campeonato local não passou na validação de importação.",
        INVALID_NAME:
          "Use um nome de até 80 caracteres, sem deixar o campo vazio.",
        INVALID_DOMAIN_COMMAND:
          "Esta ação não é permitida no estado atual do campeonato. Atualizamos os dados para você revisar.",
        INVALID_RESULT:
          "Revise os placares e o vencedor do desempate antes de confirmar.",
        INVALID_AGGREGATE:
          "Não foi possível salvar esses valores com segurança. Revise os placares.",
        COMMITTED_REFRESH_PENDING:
          "O servidor confirmou a operação. A atualização da tela está pendente; tente atualizar o campeonato.",
        COMMITTED_JOURNAL_PENDING:
          "O servidor confirmou a operação. Não conseguimos concluir o registro da tentativa; repita a tentativa para conferir com segurança.",
        IMPORT_VERIFICATION_PENDING:
          "O servidor confirmou a cópia. A conferência está pendente; tente salvar novamente para retomar a mesma importação. O original continua neste dispositivo.",
      } as Record<string, string>
    )[code] ??
    "Não foi possível concluir esta operação. Revise os dados e tente novamente."
  );
}
export function getTournamentApiUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_MATCHMAKING_API_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw),
      local = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname),
      privateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        u.hostname,
      );
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/" ||
      !(
        u.protocol === "https:" ||
        (u.protocol === "http:" && (local || (__DEV__ && privateIp)))
      )
    )
      return null;
    return u.origin;
  } catch {
    return null;
  }
}
export class RemoteTournaments {
  private state: State = {
    items: [],
    nextCursor: null,
    status: "loading",
    details: {},
    busy: false,
    pending: {},
  };
  private listeners = new Set<() => void>();
  private abort = new AbortController();
  private pending = new Map<string, Promise<unknown>>();
  private journal: ReturnType<typeof createJournal>;
  private accessToken: string | null = null;
  private listGeneration = 0;
  setAccessToken(token: string | null) {
    this.accessToken = token;
  }
  constructor(
    readonly apiUrl: string,
    readonly userId: string,
    private token: () => string | null = () => this.accessToken,
    private request: typeof fetch = (input, init) =>
      globalThis.fetch(input, init),
    journal?: ReturnType<typeof createJournal>,
  ) {
    this.journal = journal ?? createJournal(`${apiUrl}|${userId}`);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  dispose() {
    this.abort.abort();
    this.accessToken = null;
    this.state = {
      items: [],
      nextCursor: null,
      status: "unauthorized",
      details: {},
      busy: false,
      pending: {},
    };
    this.pending.clear();
    this.listeners.clear();
  }
  private publish(next: Partial<State>) {
    if (!this.abort.signal.aborted) {
      this.state = { ...this.state, ...next };
      this.listeners.forEach((l) => l());
    }
  }
  private dedup<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const promise = run().finally(() => {
      if (this.pending.get(key) === promise) this.pending.delete(key);
    });
    this.pending.set(key, promise);
    return promise;
  }
  private async http<T>(path: string, body?: unknown): Promise<T> {
    const token = this.token();
    if (!token || this.abort.signal.aborted)
      throw new RemoteError("UNAUTHORIZED", 401);
    const controller = new AbortController(),
      cancel = () => controller.abort();
    this.abort.signal.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, 15000);
    try {
      const response = await this.request(`${this.apiUrl}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new RemoteError(
          response.status === 401 ? "UNAUTHORIZED" : data.error,
          response.status,
        );
      if (!this.token() || this.abort.signal.aborted)
        throw new RemoteError("UNAUTHORIZED", 401);
      return data as T;
    } catch (e) {
      if (e instanceof RemoteError) throw e;
      throw new RemoteError("OFFLINE");
    } finally {
      clearTimeout(timeout);
      this.abort.signal.removeEventListener("abort", cancel);
    }
  }
  private failure(error: unknown): { status: RemoteStatus; error: string } {
    const e =
      error instanceof RemoteError
        ? error
        : new RemoteError(
            error instanceof Error &&
              [
                "NEW_COPY_REQUIRED",
                "PENDING_OPERATION",
                "INVALID_SNAPSHOT",
              ].includes(error.message)
              ? error.message
              : "JOURNAL_UNAVAILABLE",
          );
    return {
      status:
        e.status === 401 || e.status === 403
          ? "unauthorized"
          : e.code === "REVISION_CONFLICT"
            ? "conflict"
            : e.code === "OFFLINE"
              ? "offline"
              : "error",
      error: e.message,
    };
  }
  list(append = false): Promise<void> {
    const generation = this.listGeneration;
    return this.dedup(`list:${generation}`, async () => {
      this.publish({
        status: this.state.items.length ? "refreshing" : "loading",
        error: undefined,
      });
      try {
        const cursor = append ? this.state.nextCursor : null;
        const page = await this.http<{
          items: TournamentSummary[];
          nextCursor: string | null;
        }>(
          `/tournaments?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (generation !== this.listGeneration) return;
        const byId = new Map(
          (append ? this.state.items : []).map((t) => [t.tournamentId, t]),
        );
        page.items.forEach((t) => byId.set(t.tournamentId, t));
        this.publish({
          items: [...byId.values()],
          nextCursor: page.nextCursor,
          status: "success",
          error: undefined,
        });
      } catch (e) {
        if (generation !== this.listGeneration) return;
        const f = this.failure(e);
        this.publish({
          ...f,
          ...(f.status === "unauthorized" ? { items: [], details: {} } : {}),
        });
      }
    });
  }
  detail(id: string, force = false): Promise<RemoteSnapshot> {
    if (!force && this.state.details[id]?.data)
      return Promise.resolve(this.state.details[id].data!);
    return this.dedup(`detail:${id}`, async () => {
      void this.journal
        .peek(`mutation:${id}`)
        .then((e) =>
          this.publish({
            pending: { ...this.state.pending, [id]: e?.state === "pending" },
          }),
        )
        .catch(() => {});
      const previous = this.state.details[id];
      this.publish({
        details: {
          ...this.state.details,
          [id]: {
            data: previous?.data,
            status: previous?.data ? "refreshing" : "loading",
          },
        },
      });
      try {
        const result = await this.http<RemoteSnapshot>(
          `/tournaments/${encodeURIComponent(id)}`,
        );
        if (
          result.tournamentId !== id ||
          !Number.isSafeInteger(result.revision)
        )
          throw new RemoteError("INVALID_SNAPSHOT");
        parseImportSnapshot(result.tournament);
        this.accept(result);
        return this.state.details[id]?.data ?? result;
      } catch (e) {
        const f = this.failure(e);
        this.publish({
          details: {
            ...this.state.details,
            [id]: {
              data: f.status === "unauthorized" ? undefined : previous?.data,
              ...f,
            },
          },
        });
        throw e;
      }
    });
  }
  private accept(r: RemoteSnapshot) {
    const old = this.state.details[r.tournamentId]?.data;
    if (old && old.revision > r.revision) return;
    this.publish({
      details: {
        ...this.state.details,
        [r.tournamentId]: { data: r, status: "success" },
      },
    });
  }
  private async operation(
    key: string,
    intent: string,
    payload: unknown,
    path: string,
    options: { keepConfirmed?: boolean; newCopy?: boolean } = {},
  ): Promise<RemoteSnapshot> {
    if (this.state.busy) throw new RemoteError("PENDING_OPERATION");
    this.publish({ busy: true });
    let sentId: string | undefined;
    try {
      const e = await this.journal.prepare(key, intent, payload, options);
      sentId = e.id;
      this.publish({
        pending: {
          ...this.state.pending,
          [key.replace(/^mutation:/, "")]: true,
        },
      });
      const r = await this.http<RemoteSnapshot>(path, {
        ...(e.payload as object),
        commandId: e.id,
      });
      try {
        if (
          !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(
            r.tournamentId,
          ) ||
          !Number.isSafeInteger(r.revision) ||
          r.revision < 0
        )
          throw new Error();
        parseImportSnapshot(r.tournament);
      } catch {
        throw new RemoteError("INVALID_SNAPSHOT");
      }
      this.accept(r);
      try {
        await this.journal.finish(key, e.id, r.tournamentId);
      } catch {
        this.publish({
          details: {
            ...this.state.details,
            [r.tournamentId]: {
              data: this.state.details[r.tournamentId]?.data ?? r,
              status: "error",
              error: remoteMessage("COMMITTED_JOURNAL_PENDING"),
            },
          },
        });
        return this.state.details[r.tournamentId]?.data ?? r;
      }
      this.publish({
        pending: {
          ...this.state.pending,
          [key.replace(/^mutation:/, "")]: false,
        },
      });
      this.listGeneration++;
      void this.list();
      if (path === "/tournament-imports") return r;
      try {
        return await this.detail(r.tournamentId, true);
      } catch {
        this.publish({
          details: {
            ...this.state.details,
            [r.tournamentId]: {
              ...this.state.details[r.tournamentId],
              status: "offline",
              error: remoteMessage("COMMITTED_REFRESH_PENDING"),
            },
          },
        });
        return this.state.details[r.tournamentId]?.data ?? r;
      }
    } catch (e) {
      if (
        sentId &&
        e instanceof RemoteError &&
        ([400, 422].includes(e.status) ||
          (e.status === 409 &&
            !["REVISION_CONFLICT", "RETRY_SAME_COMMAND"].includes(e.code)))
      ) {
        try {
          await this.journal.reject(key, sentId);
        } catch {
          throw new RemoteError("JOURNAL_UNAVAILABLE");
        }
        const id = key.replace(/^mutation:/, "");
        this.publish({ pending: { ...this.state.pending, [id]: false } });
        if (key.startsWith("mutation:"))
          await this.detail(id, true).catch(() => {});
      }
      const failure = this.failure(e);
      if (e instanceof RemoteError) throw e;
      throw new Error(failure.error);
    } finally {
      this.publish({ busy: false });
    }
  }
  create(input: CreateTournamentInput) {
    const payload = {
      commandVersion: 1,
      type: "create_tournament",
      payload: { ...input, format: "single_elimination" },
    };
    return this.operation(
      "create",
      JSON.stringify(input),
      payload,
      "/tournaments",
    );
  }
  async hasPendingCreation() {
    const entry = await this.journal.peek("create");
    return entry?.state === "pending";
  }
  async retryCreation() {
    const entry = await this.journal.peek("create");
    if (!entry) throw new RemoteError("PENDING_OPERATION");
    return this.operation(
      "create",
      entry.intent,
      entry.payload,
      "/tournaments",
      { keepConfirmed: true },
    );
  }
  async import(t: Tournament, newCopy = false) {
    let snapshot: Tournament;
    try {
      snapshot = parseImportSnapshot(t);
    } catch {
      throw new RemoteError("INVALID_SNAPSHOT");
    }
    const installationId = await this.journal.installationId(),
      intent = canonicalSnapshot(snapshot),
      key = `import:${t.id}`;
    // importId is reserved durably by a separate entry before the command is prepared.
    const reservation = await this.journal.prepare(
      `${key}:identity`,
      intent,
      {},
      { keepConfirmed: true, newCopy },
    );
    const payload = {
      commandVersion: 1,
      type: "import_tournament",
      payload: {
        installationId,
        importId: reservation.id,
        snapshotVersion: 1,
        snapshot,
      },
    };
    const r = await this.operation(
      key,
      intent,
      payload,
      "/tournament-imports",
      { keepConfirmed: true, newCopy },
    );
    let confirmed: RemoteSnapshot;
    try {
      confirmed = await this.detail(r.tournamentId, true);
    } catch {
      throw new RemoteError("IMPORT_VERIFICATION_PENDING");
    }
    if (canonicalSnapshot(confirmed.tournament) !== intent)
      throw new RemoteError("IMPORT_MISMATCH");
    return confirmed;
  }
  async mutate(id: string, type: string, payload: unknown) {
    const current = this.state.details[id]?.data;
    if (!current) throw new RemoteError("INVALID_SNAPSHOT");
    const key = `mutation:${id}`;
    try {
      return await this.operation(
        key,
        canonicalJson({ type, payload }),
        {
          commandVersion: 1,
          tournamentId: id,
          expectedRevision: current.revision,
          type,
          payload,
        },
        "/commands",
      );
    } catch (e) {
      if (e instanceof RemoteError && e.code === "REVISION_CONFLICT") {
        const entry = await this.journal.prepare(
          key,
          canonicalJson({ type, payload }),
          {},
          {},
        );
        await this.journal.reject(key, entry.id);
        this.publish({ pending: { ...this.state.pending, [id]: false } });
        await this.detail(id, true).catch(() => {});
        this.publish({
          details: {
            ...this.state.details,
            [id]: {
              ...this.state.details[id],
              status: "conflict",
              error: e.message,
            },
          },
        });
      }
      throw e;
    }
  }
  async retryPending(id: string) {
    const key = `mutation:${id}`,
      entry = await this.journal.peek(key);
    if (!entry || entry.state !== "pending") return this.detail(id, true);
    try {
      return await this.operation(
        key,
        entry.intent,
        entry.payload,
        "/commands",
      );
    } catch (e) {
      if (e instanceof RemoteError && e.code === "REVISION_CONFLICT") {
        await this.journal.reject(key, entry.id);
        this.publish({ pending: { ...this.state.pending, [id]: false } });
        await this.detail(id, true).catch(() => {});
        this.publish({
          details: {
            ...this.state.details,
            [id]: {
              ...this.state.details[id],
              status: "conflict",
              error: e.message,
            },
          },
        });
      }
      throw e;
    }
  }
}
