import {
  TournamentRealtime,
  type SyncTransport,
  type TournamentSync,
  type TournamentSignal,
} from "../src/features/tournaments/remote/realtime";

const cup = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const signal = (
  sequence: number,
  category: TournamentSignal["category"] = "competitive",
  recipient: string | null = null,
) => ({
  tournament_id: cup,
  sequence,
  category,
  recipient_user_id: recipient,
  signal_version: 1,
  revision: sequence,
  created_at: "2026-11-26T12:00:00Z",
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function setup() {
  let cursor = 0;
  const channels: {
    receive: (value: unknown) => void;
    status: Parameters<SyncTransport["subscribe"]>[2];
    stop: jest.Mock;
  }[] = [];
  const transport: SyncTransport = {
    subscribe: jest.fn((_id, receive, status) => {
      const stop = jest.fn();
      channels.push({ receive, status, stop });
      return stop;
    }),
  };
  const states = new Map<string, TournamentSync | null>();
  const request = jest.fn(async () => ({ syncSequence: cursor }));
  const revoked = jest.fn();
  const sync = new TournamentRealtime(
    user,
    transport,
    async (id) => {
      const result = await request();
      sync.accepted(id, result.syncSequence);
      return result;
    },
    (id, state) => states.set(id, state),
    revoked,
  );
  return {
    sync,
    channels,
    states,
    request,
    transport,
    revoked,
    cursor: (next: number) => {
      cursor = next;
    },
  };
}
let sync: TournamentRealtime;
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  sync?.dispose();
  jest.clearAllTimers();
  jest.useRealTimers();
});

test("leases compartilham canal e só anunciam conectado após ack e reconciliação", async () => {
  const h = setup();
  sync = h.sync;
  const a = sync.retain(cup),
    b = sync.retain(cup);
  await flush();
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(h.channels).toHaveLength(1);
  expect(h.states.get(cup)?.status).toBe("connecting");
  h.channels[0].status("SUBSCRIBED");
  await jest.advanceTimersByTimeAsync(0);
  expect(h.request).toHaveBeenCalledTimes(2);
  expect(h.states.get(cup)?.status).toBe("connected");
  a();
  a();
  expect(h.channels[0].stop).not.toHaveBeenCalled();
  b();
  expect(h.channels[0].stop).toHaveBeenCalledTimes(1);
  expect(h.states.get(cup)).toBeNull();
});
test("dez eventos próximos fazem um GET; duplicados, antigos e terceiros são ignorados", async () => {
  const h = setup();
  sync = h.sync;
  sync.retain(cup);
  await flush();
  h.channels[0].status("SUBSCRIBED");
  await jest.advanceTimersByTimeAsync(0);
  for (let i = 1; i <= 10; i++)
    h.channels[0].receive(signal(i, i === 8 ? "access" : "competitive"));
  expect(h.states.get(cup)).toMatchObject({
    status: "updating",
    accessSequence: 0,
  });
  h.channels[0].receive(signal(10));
  h.channels[0].receive(signal(9));
  h.channels[0].receive({ ...signal(99), tournament_id: other });
  h.channels[0].receive(signal(100, "access_revoked", other));
  h.cursor(10);
  await jest.advanceTimersByTimeAsync(80);
  expect(h.request).toHaveBeenCalledTimes(3);
  expect(h.revoked).not.toHaveBeenCalled();
  expect(h.states.get(cup)).toMatchObject({
    sequence: 10,
    accessSequence: 10,
    status: "connected",
  });
});
test("mudança durante o GET gera uma reconciliação posterior sem perder a janela inicial", async () => {
  const h = setup();
  sync = h.sync;
  sync.retain(cup);
  await flush();
  let resolve!: (value: { syncSequence: number }) => void;
  h.request.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  h.channels[0].status("SUBSCRIBED");
  await jest.advanceTimersByTimeAsync(0);
  h.channels[0].receive(signal(3));
  h.channels[0].receive(signal(4));
  h.cursor(4);
  resolve({ syncSequence: 2 });
  await flush();
  expect(h.states.get(cup)?.status).toBe("updating");
  await jest.advanceTimersByTimeAsync(80);
  expect(h.request).toHaveBeenCalledTimes(3);
  expect(h.states.get(cup)).toMatchObject({ sequence: 4, status: "connected" });
});

test("GET deduplicado anterior ao sinal não consome a invalidação mais recente", async () => {
  const h = setup();
  sync = h.sync;
  h.cursor(1);
  sync.retain(cup);
  await flush();
  h.channels[0].status("SUBSCRIBED");
  await jest.advanceTimersByTimeAsync(0);
  h.request.mockResolvedValueOnce({ syncSequence: 1 });
  h.channels[0].receive(signal(2));
  await jest.advanceTimersByTimeAsync(80);
  expect(h.states.get(cup)).toMatchObject({ sequence: 2, status: "updating" });
  h.cursor(2);
  await jest.advanceTimersByTimeAsync(80);
  expect(h.request).toHaveBeenCalledTimes(4);
  expect(h.states.get(cup)).toMatchObject({
    sequence: 2,
    accessSequence: 2,
    status: "connected",
  });
});
test("revogação dirigida encerra imediatamente; leitura autorizada posterior torna aviso antigo inofensivo", async () => {
  const h = setup();
  sync = h.sync;
  h.cursor(10);
  sync.retain(cup);
  await flush();
  h.channels[0].receive(signal(9, "access_revoked", user));
  expect(h.revoked).not.toHaveBeenCalled();
  h.channels[0].receive(signal(11, "access_revoked", user));
  expect(h.revoked).toHaveBeenCalledWith(cup);
  expect(h.channels[0].stop).toHaveBeenCalledTimes(1);
  expect(h.states.get(cup)?.status).toBe("access-ended");
  h.channels[0].receive(signal(12));
  await jest.advanceTimersByTimeAsync(30000);
  expect(h.request).toHaveBeenCalledTimes(1);
});
test("background cancela listeners/timers; retorno refaz leitura, assinatura e reconciliação", async () => {
  const h = setup();
  sync = h.sync;
  sync.retain(cup);
  await flush();
  h.channels[0].receive(signal(1));
  sync.setActive(false);
  await jest.advanceTimersByTimeAsync(500);
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(h.states.get(cup)?.status).toBe("offline");
  h.cursor(7);
  sync.setActive(true);
  await flush();
  expect(h.channels).toHaveLength(2);
  h.channels[1].status("SUBSCRIBED");
  await jest.advanceTimersByTimeAsync(0);
  expect(h.states.get(cup)).toMatchObject({ sequence: 7, status: "connected" });
  sync.refresh();
  await jest.advanceTimersByTimeAsync(80);
  expect(h.channels).toHaveLength(2);
  expect(h.request).toHaveBeenCalledTimes(4);
});
test("erro de canal reconecta com backoff; callbacks antigos não entram na nova conexão", async () => {
  const h = setup();
  sync = h.sync;
  sync.retain(cup);
  await flush();
  h.channels[0].status("CHANNEL_ERROR");
  expect(h.states.get(cup)?.status).toBe("reconnecting");
  h.channels[0].receive(signal(50));
  await jest.advanceTimersByTimeAsync(1000);
  expect(h.channels).toHaveLength(2);
  h.channels[1].status("SUBSCRIBED");
  await jest.advanceTimersByTimeAsync(0);
  expect(h.states.get(cup)).toMatchObject({ sequence: 0, status: "connected" });
});

test("renovação de sessão revalida um 401 anterior e só reinscreve após GET autorizado", async () => {
  const h = setup();
  sync = h.sync;
  sync.retain(cup);
  await flush();
  h.channels[0].status("SUBSCRIBED");
  await jest.advanceTimersByTimeAsync(0);
  h.request.mockRejectedValueOnce({ status: 401 });
  sync.refresh();
  await jest.advanceTimersByTimeAsync(80);
  expect(h.states.get(cup)?.status).toBe("access-ended");
  expect(h.channels[0].stop).toHaveBeenCalledTimes(1);
  // Auth has now renewed the same identity. A fresh GET must precede any join.
  h.cursor(7);
  sync.refresh();
  await flush();
  expect(h.channels).toHaveLength(2);
  expect(h.states.get(cup)?.status).not.toBe("connected");
  h.channels[1].status("SUBSCRIBED");
  await jest.advanceTimersByTimeAsync(0);
  expect(h.states.get(cup)).toMatchObject({ sequence: 7, status: "connected" });
  h.channels[0].receive(signal(99));
  expect(h.states.get(cup)?.sequence).toBe(7);
});

test("retorno ao foreground revalida acesso encerrado sem reinscrever membro ainda removido", async () => {
  const h = setup();
  sync = h.sync;
  h.request.mockRejectedValueOnce({ status: 403 });
  sync.retain(cup);
  await flush();
  expect(h.states.get(cup)?.status).toBe("access-ended");
  expect(h.channels).toHaveLength(0);
  sync.setActive(false);
  h.request.mockRejectedValueOnce({ status: 403 });
  sync.setActive(true);
  await flush();
  expect(h.request).toHaveBeenCalledTimes(2);
  expect(h.states.get(cup)?.status).toBe("access-ended");
  expect(h.channels).toHaveLength(0);
});
test("negação da API não abre canal e liberação durante GET impede assinatura tardia", async () => {
  const h = setup();
  sync = h.sync;
  h.request.mockRejectedValueOnce({ status: 403 });
  sync.retain(cup);
  await flush();
  expect(h.channels).toHaveLength(0);
  expect(h.revoked).toHaveBeenCalledWith(cup);
  expect(h.states.get(cup)?.status).toBe("access-ended");
  let resolve!: (value: { syncSequence: number }) => void;
  h.request.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const release = sync.retain(other);
  release();
  resolve({ syncSequence: 1 });
  await flush();
  expect(h.channels).toHaveLength(0);
});
test("sinais malformados não provocam requisições nem aceitam payload como snapshot", async () => {
  const h = setup();
  sync = h.sync;
  sync.retain(cup);
  await flush();
  for (const invalid of [
    null,
    {},
    { ...signal(1), signal_version: 2 },
    signal(Number.MAX_SAFE_INTEGER + 1),
    { ...signal(1), revision: -1 },
    {
      ...signal(1),
      category: "snapshot",
      tournament: { championId: "forged" },
    },
  ])
    h.channels[0].receive(invalid);
  await jest.advanceTimersByTimeAsync(100);
  expect(h.request).toHaveBeenCalledTimes(1);
});
