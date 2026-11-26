import {
  RemoteTournaments,
  remoteMessage,
  getTournamentApiUrl,
} from "../src/features/tournaments/remote/client";
import { createJournal } from "../src/features/tournaments/remote/journal";
import { tournamentFixture } from "./fixtures/tournaments";
import {
  recordResult,
  addParticipant,
} from "../src/features/tournaments/engine/tournament";
import {
  canonicalSnapshot,
  parseImportSnapshot,
} from "../src/features/tournaments/domain/snapshot";
import type { StateStorage } from "zustand/middleware";
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));

const id = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222";
function setup(scope = "a") {
  const disk = new Map<string, string>();
  let n = 10;
  const storage: StateStorage = {
    getItem: async (k) => disk.get(k) ?? null,
    setItem: async (k, v) => {
      disk.set(k, v);
    },
    removeItem: async (k) => {
      disk.delete(k);
    },
  };
  const journal = createJournal(
    scope,
    storage,
    () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`,
  );
  return { disk, storage, journal };
}
const response = (data: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    json: async () => JSON.parse(JSON.stringify(data)),
  }) as Response;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
};

test("GET antigo com erro não restaura revisão anterior a um comando confirmado", async () => {
  const { journal } = setup(),
    old = deferred<Response>();
  const original = tournamentFixture("draft"),
    latest = addParticipant(original, "Nova entrada");
  let reads = 0;
  const request = jest.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST")
      return response({ tournamentId: id, revision: 3, tournament: latest });
    if (String(url).includes("?"))
      return response({ items: [], nextCursor: null });
    if (++reads === 2) return old.promise;
    return response({ tournamentId: id, revision: 1, tournament: original });
  });
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  await client.detail(id);
  const stale = client.detail(id, true).catch(() => {});
  const saving = client.mutate(id, "add_participant", {
    displayName: "Nova entrada",
  });
  for (
    let i = 0;
    i < 25 && client.getSnapshot().details[id].data?.revision !== 3;
    i++
  )
    await Promise.resolve();
  expect(client.getSnapshot().details[id].data?.revision).toBe(3);
  old.resolve(response({ error: "TEMPORARY_FAILURE" }, 503));
  await stale;
  await saving;
  expect(client.getSnapshot().details[id].data?.revision).toBe(3);
  expect(
    client.getSnapshot().details[id].data?.tournament.participants,
  ).toHaveLength(1);
  client.dispose();
});

test("revogação bloqueia respostas HTTP antigas e só releitura nova restaura acesso", async () => {
  const { journal } = setup(),
    delayed = deferred<Response>();
  const snapshot = {
    tournamentId: id,
    revision: 1,
    syncSequence: 8,
    tournament: tournamentFixture("draft"),
  };
  let reads = 0;
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    jest.fn(async () => (++reads === 1 ? delayed.promise : response(snapshot))),
    journal,
  );
  const old = client.detail(id);
  client.invalidateAccess(id);
  delayed.resolve(response(snapshot));
  await expect(old).rejects.toThrow("não tem acesso");
  expect(client.getSnapshot().details[id].data).toBeUndefined();
  await client.detail(id, true);
  expect(client.getSnapshot().details[id].data?.revision).toBe(1);
  client.dispose();
});

test("snapshot de acesso antigo na mesma revisão não substitui cursor mais recente", async () => {
  const { journal } = setup();
  let cursor = 8;
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    jest.fn(async () =>
      response({
        tournamentId: id,
        revision: 1,
        syncSequence: cursor,
        access: { role: cursor === 8 ? "viewer" : "participant" },
        tournament: tournamentFixture("draft"),
      }),
    ),
    journal,
  );
  await client.detail(id);
  cursor = 7;
  await client.detail(id, true);
  expect(client.getSnapshot().details[id].data).toMatchObject({
    syncSequence: 8,
    access: { role: "viewer" },
  });
  client.dispose();
});

test("edição mantém a revisão informada mesmo quando cache recebeu revisão superior", async () => {
  const { journal } = setup();
  let sent: Record<string, unknown> | undefined;
  const snapshot = {
    tournamentId: id,
    revision: 12,
    tournament: tournamentFixture("active"),
  };
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    jest.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") sent = JSON.parse(init.body as string);
      return response(snapshot);
    }),
    journal,
  );
  await client.detail(id);
  await client.mutate(
    id,
    "record_result",
    { matchId: snapshot.tournament.matches[0].id, score1: 3, score2: 1 },
    9,
  );
  expect(sent?.expectedRevision).toBe(9);
  client.dispose();
});

test.each([false, true])(
  "revogação durante journal com falha=%s não restaura snapshot por fallback",
  async (fail) => {
    const { journal } = setup(),
      finishing = deferred<void>();
    const snapshot = {
      tournamentId: id,
      revision: 1,
      tournament: tournamentFixture("draft"),
    };
    journal.finish = jest.fn(async () => {
      await finishing.promise;
      if (fail) throw new Error("disk unavailable");
    });
    const client = new RemoteTournaments(
      "http://127.0.0.1:8090",
      user,
      () => "token",
      jest.fn(async () => response(snapshot)),
      journal,
    );
    await client.detail(id);
    const saving = client.mutate(id, "rename_tournament", {
      name: "Nova copa",
    });
    for (
      let i = 0;
      i < 30 && !jest.mocked(journal.finish).mock.calls.length;
      i++
    )
      await Promise.resolve();
    expect(journal.finish).toHaveBeenCalledTimes(1);
    client.invalidateAccess(id);
    finishing.resolve();
    await expect(saving).rejects.toThrow("não tem acesso");
    expect(client.getSnapshot().details[id]).toMatchObject({
      status: "unauthorized",
      data: undefined,
    });
    client.dispose();
  },
);

test("journal persiste o envelope exato antes do envio, serializa cliques e isola contas sem tocar o envelope local", async () => {
  const { storage, disk, journal } = setup();
  disk.set("matchmaking-local-v1", "original");
  const payload = {
    type: "record_result",
    expectedRevision: 12,
    payload: { score1: 3, score2: 1 },
  };
  const [a, b] = await Promise.all([
    journal.prepare("m", "same", payload),
    journal.prepare("m", "same", { ...payload, expectedRevision: 99 }),
  ]);
  expect(a).toEqual(b);
  expect(a.payload).toEqual(payload);
  await expect(journal.prepare("m", "different", payload)).rejects.toThrow(
    "PENDING_OPERATION",
  );
  const other = createJournal("b", storage, () => user);
  expect(await other.peek("m")).toBeUndefined();
  await journal.finish("m", a.id, id);
  expect((await journal.peek("m"))?.state).toBe("confirmed");
  await expect(journal.finish("m", user, id)).rejects.toThrow(
    "JOURNAL_UNAVAILABLE",
  );
  expect(disk.get("matchmaking-local-v1")).toBe("original");
});
test("falha ou corrupção do journal bloqueia POST antes de a operação alcançar o servidor", async () => {
  const { storage, disk, journal } = setup(),
    request = jest.fn();
  storage.setItem = async () => {
    throw new Error("disk full");
  };
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  await expect(
    client.create({ name: "Copa", modality: "Truco", capacity: 4 }),
  ).rejects.toThrow("guardar a tentativa");
  expect(request).not.toHaveBeenCalled();
  storage.setItem = async (k, v) => {
    disk.set(k, v);
  };
  disk.set([...disk.keys()][0] ?? "matchmaking-remote-journal-v1:a", "null");
  await expect(
    client.create({ name: "Copa", modality: "Truco", capacity: 4 }),
  ).rejects.toThrow("guardar a tentativa");
  expect(request).not.toHaveBeenCalled();
});
test("leituras concorrentes são deduplicadas e resposta após logout não publica dados", async () => {
  const { journal } = setup(),
    pending = deferred<Response>(),
    request = jest.fn(() => pending.promise),
    client = new RemoteTournaments(
      "http://127.0.0.1:8090",
      user,
      () => "token",
      request,
      journal,
    );
  const a = client.detail(id),
    b = client.detail(id);
  expect(a).toBe(b);
  expect(request).toHaveBeenCalledTimes(1);
  const listener = jest.fn();
  client.subscribe(listener);
  client.dispose();
  pending.resolve(
    response({
      tournamentId: id,
      revision: 1,
      tournament: tournamentFixture("draft"),
    }),
  );
  await expect(a).rejects.toThrow("Entre na sua conta");
  expect(listener).not.toHaveBeenCalled();
  expect(client.getSnapshot().details[id]).toBeUndefined();
});
test("resposta perdida após commit retoma record_result inteiro mesmo com partida concluída e recibo antigo", async () => {
  const { journal } = setup();
  const original = tournamentFixture("active"),
    match = original.matches[0];
  let current = { tournamentId: id, revision: 1, tournament: original };
  let committed: typeof current | undefined,
    lost = true;
  const posts: unknown[] = [];
  const request = jest.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      posts.push(body);
      if (!committed) {
        current = {
          ...current,
          revision: 2,
          tournament: recordResult(current.tournament, match.id, 3, 1),
        };
        committed = current;
      }
      if (lost) {
        lost = false;
        throw new Error("response lost after commit");
      }
      return response(committed);
    }
    return response(current);
  }) as typeof fetch;
  const first = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  await first.detail(id);
  await expect(
    first.mutate(id, "record_result", {
      matchId: match.id,
      score1: 3,
      score2: 1,
    }),
  ).rejects.toThrow("Sem confirmação");
  expect(first.getSnapshot().details[id].data?.revision).toBe(1);
  first.dispose();
  current = {
    ...current,
    revision: 3,
    tournament: recordResult(
      current.tournament,
      current.tournament.matches[1].id,
      2,
      0,
    ),
  };
  const reopened = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  await reopened.detail(id);
  await reopened.retryPending(id);
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  expect(posts[0]).toMatchObject({
    type: "record_result",
    expectedRevision: 1,
  });
  expect(reopened.getSnapshot().details[id].data?.revision).toBe(3);
  expect(reopened.getSnapshot().pending[id]).toBe(false);
});
test("conflito real de revisão relê sem reaplicar; retry_same_command conserva a pendência", async () => {
  const { journal } = setup();
  const t = tournamentFixture("draft");
  let revision = 1,
    error = "REVISION_CONFLICT";
  const request = jest.fn(async (_url: unknown, init?: RequestInit) =>
    init?.method === "POST"
      ? response({ error }, 409)
      : response({ tournamentId: id, revision, tournament: t }),
  );
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  await client.detail(id);
  revision = 2;
  await expect(
    client.mutate(id, "add_participant", { displayName: "Ana" }),
  ).rejects.toThrow("revise sua intenção");
  expect(client.getSnapshot().details[id]).toMatchObject({
    status: "conflict",
    data: { revision: 2 },
  });
  expect(
    request.mock.calls.filter(([, i]) => i?.method === "POST"),
  ).toHaveLength(1);
  expect(client.getSnapshot().pending[id]).toBe(false);
  error = "RETRY_SAME_COMMAND";
  await expect(
    client.mutate(id, "add_participant", { displayName: "Ana" }),
  ).rejects.toThrow("mesma intenção");
  expect(client.getSnapshot().pending[id]).toBe(true);
});
test("importação verifica leitura canônica antes do sucesso, repete IDs e pede nova cópia para conteúdo alterado", async () => {
  const { journal, disk } = setup();
  const t = tournamentFixture("completed"),
    original = canonicalSnapshot(t);
  disk.set("matchmaking-local-v1", original);
  const posts: Record<string, unknown>[] = [];
  const request = jest.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(init.body as string));
      return response({ tournamentId: id, revision: 1, tournament: t });
    }
    return String(url).includes("/tournaments?")
      ? response({ items: [], nextCursor: null })
      : response({ tournamentId: id, revision: 1, tournament: t });
  });
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  await client.import(t);
  await client.import(t);
  expect(posts[0]).toEqual(posts[1]);
  await expect(client.import({ ...t, name: "Mudou" })).rejects.toThrow(
    "NEW_COPY_REQUIRED",
  );
  expect(posts).toHaveLength(2);
  expect(canonicalSnapshot(t)).toBe(original);
  expect(disk.get("matchmaking-local-v1")).toBe(original);
});
test("snapshot remoto divergente não anuncia sucesso de importação e autorização perdida oculta detalhes", async () => {
  const { journal } = setup();
  const t = tournamentFixture("draft");
  let denied = false;
  const request = jest.fn(async (url: unknown, init?: RequestInit) =>
    denied
      ? response({ error: "FORBIDDEN" }, 403)
      : String(url).includes("/tournaments?")
        ? response({ items: [], nextCursor: null })
        : response({
            tournamentId: id,
            revision: 1,
            tournament:
              init?.method === "POST" ? t : addParticipant(t, "Diferente"),
          }),
  );
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  await expect(client.import(t)).rejects.toThrow("não corresponde");
  denied = true;
  await expect(client.detail(id, true)).rejects.toThrow("não tem acesso");
  expect(client.getSnapshot().details[id]).toMatchObject({
    status: "unauthorized",
    data: undefined,
  });
});
test("contrato de importação preserva Unicode, datas e ordenação e rejeita autoridade e referências cruzadas", () => {
  const t = tournamentFixture("completed");
  expect(parseImportSnapshot(t)).toEqual(t);
  for (const bad of [
    { ...t, actor: user },
    { ...t, startedAt: "bad" },
    { ...t, participants: t.participants.map((p) => ({ ...p, owner: user })) },
    { ...t, matches: t.matches.map((m) => ({ ...m, tournamentId: "other" })) },
  ])
    expect(() => parseImportSnapshot(bad)).toThrow("INVALID_SNAPSHOT");
  expect(canonicalSnapshot({ ...t, name: "Cópá 🏆" })).toContain("Cópá 🏆");
});
test("API pública recusa credenciais, caminhos e HTTP remoto", () => {
  const saved = process.env.EXPO_PUBLIC_MATCHMAKING_API_URL;
  try {
    for (const url of [
      "http://public.example",
      "https://user:password@example.test",
      "https://example.test/private",
      "https://example.test?token=secret",
    ]) {
      process.env.EXPO_PUBLIC_MATCHMAKING_API_URL = url;
      expect(getTournamentApiUrl()).toBeNull();
    }
    process.env.EXPO_PUBLIC_MATCHMAKING_API_URL = "http://127.0.0.1:8090";
    expect(getTournamentApiUrl()).toBe("http://127.0.0.1:8090");
    expect(remoteMessage("OFFLINE")).toContain("Sem confirmação");
  } finally {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_MATCHMAKING_API_URL;
    else process.env.EXPO_PUBLIC_MATCHMAKING_API_URL = saved;
  }
});
test("transporte padrão preserva o contexto global exigido pelo fetch do navegador", async () => {
  const original = globalThis.fetch,
    { journal } = setup();
  globalThis.fetch = jest.fn(function (this: unknown) {
    expect(this).toBe(globalThis);
    return Promise.resolve(response({ items: [], nextCursor: null }));
  });
  try {
    const client = new RemoteTournaments(
      "http://127.0.0.1:8090",
      user,
      () => "token",
      undefined,
      journal,
    );
    await client.list();
    expect(client.getSnapshot().status).toBe("success");
  } finally {
    globalThis.fetch = original;
  }
});
test("commit confirmado com releitura offline mantém o snapshot confirmado e não pede novo envio", async () => {
  const { journal } = setup(),
    t = tournamentFixture("draft");
  let committed = false;
  const request = jest.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      committed = true;
      return response({
        tournamentId: id,
        revision: 2,
        tournament: addParticipant(t, "Ana"),
      });
    }
    if (committed) throw new Error("read offline");
    return response({ tournamentId: id, revision: 1, tournament: t });
  });
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  await client.detail(id);
  const confirmed = await client.mutate(id, "add_participant", {
    displayName: "Ana",
  });
  expect(confirmed.revision).toBe(2);
  expect(client.getSnapshot().details[id]).toMatchObject({
    status: "offline",
    data: { revision: 2 },
    error: remoteMessage("COMMITTED_REFRESH_PENDING"),
  });
  expect(client.getSnapshot().pending[id]).toBe(false);
  expect(
    request.mock.calls.filter(([, i]) => i?.method === "POST"),
  ).toHaveLength(1);
});
test("lista iniciada antes de um commit não substitui os resumos atualizados", async () => {
  const { journal } = setup(),
    old = deferred<Response>(),
    t = tournamentFixture("draft");
  let listCalls = 0,
    revision = 1;
  const request = jest.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url).includes("/tournaments?")) {
      listCalls++;
      return listCalls === 1
        ? old.promise
        : response({
            items: [{ tournamentId: id, name: "Resumo atual" }],
            nextCursor: null,
          });
    }
    if (init?.method === "POST") revision = 2;
    return response({ tournamentId: id, revision, tournament: t });
  });
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  const stale = client.list();
  await client.detail(id);
  await client.mutate(id, "draw_bracket", {});
  old.resolve(response({ items: [], nextCursor: null }));
  await stale;
  expect(client.getSnapshot().items.map((i) => i.name)).toEqual([
    "Resumo atual",
  ]);
});
test("criação com resposta perdida pode ser retomada sem o formulário reconstruir o comando", async () => {
  const { journal } = setup(),
    t = tournamentFixture("draft"),
    posts: unknown[] = [];
  let lost = true;
  const request = jest.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(init.body as string));
      if (lost) {
        lost = false;
        throw new Error("committed response lost");
      }
    }
    return String(url).includes("/tournaments?")
      ? response({ items: [], nextCursor: null })
      : response({ tournamentId: id, revision: 1, tournament: t });
  });
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  await expect(
    client.create({ name: "Original", modality: "Truco", capacity: 4 }),
  ).rejects.toThrow("Sem confirmação");
  expect(await client.hasPendingCreation()).toBe(true);
  const restored = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  expect((await restored.retryCreation()).tournamentId).toBe(id);
  expect(posts[1]).toEqual(posts[0]);
  expect(await restored.hasPendingCreation()).toBe(false);
});
test("rejeição definitiva não prende o formulário em uma intenção inválida nem reaplica automaticamente", async () => {
  const { journal } = setup(),
    t = tournamentFixture("draft"),
    posts: Record<string, unknown>[] = [];
  const request = jest.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      posts.push(body);
      if (!body.payload.displayName)
        return response({ error: "INVALID_NAME" }, 400);
      return response({
        tournamentId: id,
        revision: 2,
        tournament: addParticipant(t, "Ana"),
      });
    }
    return String(url).includes("/tournaments?")
      ? response({ items: [], nextCursor: null })
      : response({ tournamentId: id, revision: 1, tournament: t });
  });
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "token",
    request,
    journal,
  );
  await client.detail(id);
  await expect(
    client.mutate(id, "add_participant", { displayName: "" }),
  ).rejects.toThrow("sem deixar o campo vazio");
  expect(client.getSnapshot().pending[id]).toBe(false);
  expect(posts).toHaveLength(1);
  await client.mutate(id, "add_participant", { displayName: "Ana" });
  expect(posts).toHaveLength(2);
  expect(posts[0].commandId).not.toBe(posts[1].commandId);
});

const inviteCredential = () => ({
  kind: "token" as const,
  value: Array.from(
    { length: 43 },
    (_, n) => "abcdefghijklmnopqrstuvwxyz"[n % 26],
  ).join(""),
});
const admissionResult = () => ({
  tournamentId: id,
  revision: 2,
  role: "participant" as const,
  participantId: "p-member",
  alreadyMember: false,
});
test("admissão guarda a intenção antes do POST e retoma resposta perdida com o mesmo comando após recarga", async () => {
  const { journal, disk } = setup(),
    posts: unknown[] = [];
  disk.set("matchmaking-local-v1", "original");
  let lost = true;
  const request = jest.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      expect((await journal.peek("invite-admission"))?.state).toBe("pending");
      posts.push(JSON.parse(init.body as string));
      if (lost) {
        lost = false;
        throw new Error("lost after commit");
      }
      return response(admissionResult());
    }
    return String(url).includes("/tournaments?")
      ? response({ items: [], nextCursor: null })
      : response({
          tournamentId: id,
          revision: 2,
          tournament: tournamentFixture("draft"),
          access: { role: "participant", participantId: "p-member" },
        });
  });
  const a = new RemoteTournaments(
      "http://127.0.0.1:8090",
      user,
      () => "session",
      request,
      journal,
    ),
    credential = inviteCredential();
  await expect(a.acceptInvitation(credential, "Rival")).rejects.toThrow(
    "Sem confirmação",
  );
  expect(await a.hasPendingAcceptance()).toBe(true);
  const restored = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "session",
    request,
    journal,
  );
  expect((await restored.retryAcceptance()).role).toBe("participant");
  expect(JSON.stringify(posts[0]) === JSON.stringify(posts[1])).toBe(true);
  expect(await restored.hasPendingAcceptance()).toBe(false);
  expect([...disk.values()].some((v) => v.includes(credential.value))).toBe(
    false,
  );
  expect(disk.get("matchmaking-local-v1")).toBe("original");
});

test("admissão confirmada permanece confirmada se a releitura ficar offline", async () => {
  const { journal } = setup(),
    request = jest.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return response(admissionResult());
      throw new Error("offline after commit");
    }),
    client = new RemoteTournaments(
      "http://127.0.0.1:8090",
      user,
      () => "session",
      request,
      journal,
    );
  const result = await client.acceptInvitation(inviteCredential(), "Rival");
  expect(result.tournamentId).toBe(id);
  expect(result.refreshPending).toBe(true);
  expect(await client.hasPendingAcceptance()).toBe(false);
  expect(
    request.mock.calls.filter(([, init]) => init?.method === "POST"),
  ).toHaveLength(1);
});

test("falha do journal bloqueia a aceitação antes de qualquer POST", async () => {
  const { storage, journal } = setup(),
    request = jest.fn();
  storage.setItem = async () => {
    throw new Error("disk full");
  };
  const client = new RemoteTournaments(
    "http://127.0.0.1:8090",
    user,
    () => "session",
    request,
    journal,
  );
  await expect(
    client.acceptInvitation(inviteCredential(), "Rival"),
  ).rejects.toThrow("guardar a tentativa");
  expect(request).not.toHaveBeenCalled();
});

test("convite definitivamente recusado remove o segredo pendente sem disparar outra aceitação", async () => {
  const { journal, disk } = setup(),
    credential = inviteCredential(),
    request = jest.fn(async () => response({ error: "INVITE_REVOKED" }, 410)),
    client = new RemoteTournaments(
      "http://127.0.0.1:8090",
      user,
      () => "session",
      request,
      journal,
    );
  await expect(client.acceptInvitation(credential, "Rival")).rejects.toThrow(
    "revogado",
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(await client.hasPendingAcceptance()).toBe(false);
  expect([...disk.values()].some((v) => v.includes(credential.value))).toBe(
    false,
  );
});

test("resposta tardia da admissão A não publica depois de logout nem envia intenção na conta B", async () => {
  const { journal, storage } = setup(),
    pending = deferred<Response>(),
    request = jest.fn(() => pending.promise),
    a = new RemoteTournaments(
      "http://127.0.0.1:8090",
      user,
      () => "session-a",
      request,
      journal,
    );
  const operation = a.acceptInvitation(inviteCredential(), "Rival");
  for (let n = 0; n < 20 && !request.mock.calls.length; n++)
    await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(1);
  const listener = jest.fn();
  a.subscribe(listener);
  a.dispose();
  const b = new RemoteTournaments(
    "http://127.0.0.1:8090",
    id,
    () => "session-b",
    jest.fn(),
    createJournal("b", storage, () => id),
  );
  expect(await b.hasPendingAcceptance()).toBe(false);
  expect(b.getSnapshot().items).toHaveLength(0);
  pending.resolve(response(admissionResult()));
  await expect(operation).rejects.toThrow("Entre na sua conta");
  expect(listener).not.toHaveBeenCalled();
  expect(await a.hasPendingAcceptance()).toBe(true);
});

test("emissão com resposta perdida repete o comando e não persiste credenciais retornadas pelo servidor", async () => {
  const { journal, disk } = setup(),
    posts: unknown[] = [];
  let lost = true;
  const request = jest.fn(async (_url: unknown, init?: RequestInit) => {
      posts.push(JSON.parse(init?.body as string));
      if (lost) {
        lost = false;
        throw new Error("committed response lost");
      }
      return response({
        replayed: true,
        invite: { id, role: "participant", status: "active" },
      });
    }),
    client = new RemoteTournaments(
      "http://127.0.0.1:8090",
      user,
      () => "session",
      request,
      journal,
    );
  await expect(
    client.manageInvitation(id, "create_invite", {
      role: "participant",
      expiresInHours: 24,
      maxUses: 4,
    }),
  ).rejects.toThrow("Sem confirmação");
  expect(await client.hasPendingInvitationManagement(id)).toBe(true);
  expect((await client.retryInvitationManagement(id)).replayed).toBe(true);
  expect(JSON.stringify(posts[0]) === JSON.stringify(posts[1])).toBe(true);
  expect(await client.hasPendingInvitationManagement(id)).toBe(false);
  expect([...disk.values()].some((v) => v.includes("shareUrl"))).toBe(false);
});
