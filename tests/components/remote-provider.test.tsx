import React, { StrictMode, useEffect } from "react";
import { AppState, Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import {
  RemoteTournamentProvider,
  useRemoteTournaments,
} from "../../src/features/tournaments/remote/RemoteProvider";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { getAuthClient } from "../../src/features/auth/client";
import { tournamentFixture } from "../fixtures/tournaments";
import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("../../src/features/auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));
jest.mock("../../src/features/auth/client", () => ({
  getAuthClient: jest.fn(() => null),
}));
const savedUrl = process.env.EXPO_PUBLIC_MATCHMAKING_API_URL,
  savedFetch = globalThis.fetch;
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const savedAppState = AppState.currentState;
function auth(id: string | null) {
  jest.mocked(useAuth).mockReturnValue({
    status: id ? "authenticated" : "signedOut",
    session: id ? { user: { id }, access_token: `token-${id}` } : null,
  } as ReturnType<typeof useAuth>);
}
function State() {
  const remote = useRemoteTournaments();
  return <Text>{remote.items.map((t) => t.name).join(",") || "vazio"}</Text>;
}
function tree() {
  return (
    <StrictMode>
      <RemoteTournamentProvider>
        <State />
      </RemoteTournamentProvider>
    </StrictMode>
  );
}
beforeEach(() => {
  process.env.EXPO_PUBLIC_MATCHMAKING_API_URL = "http://127.0.0.1:8090";
  jest.mocked(getAuthClient).mockReturnValue(null);
  AppState.currentState = "active";
});
afterEach(() => {
  AppState.currentState = savedAppState;
  globalThis.fetch = savedFetch;
  if (savedUrl === undefined)
    delete process.env.EXPO_PUBLIC_MATCHMAKING_API_URL;
  else process.env.EXPO_PUBLIC_MATCHMAKING_API_URL = savedUrl;
});

test("canal privado mantém uma lease e encerra A antes de abrir B", async () => {
  const channels: {
    receive?: (payload: unknown) => void;
    status?: (value: string) => void;
    owner: string;
    closed: boolean;
  }[] = [];
  type Channel = {
    topic: string;
    on: (
      _event: string,
      filter: { table: string },
      callback: (payload: unknown) => void,
    ) => Channel;
    subscribe: (callback: (value: string) => void) => Channel;
    entry: (typeof channels)[number];
    unsubscribe: () => Promise<string>;
    teardown: () => void;
  };
  let liveChannels: Channel[] = [];
  let owner = a;
  const sdk = {
    channel: jest.fn((_topic: string, options: unknown) => {
      expect(options).toMatchObject({
        config: { private: true, postgres_changes_options: { wait: true } },
      });
      const entry = { owner, closed: false } as (typeof channels)[number];
      channels.push(entry);
      const channel: Channel = {
        topic: `realtime:${_topic}`,
        on: jest.fn(
          (
            _event: string,
            filter: { table: string },
            callback: typeof entry.receive,
          ) => {
            expect(filter.table).toBe("tournament_signals");
            entry.receive = callback;
            return channel;
          },
        ),
        subscribe: jest.fn((callback: typeof entry.status) => {
          entry.status = callback;
          return channel;
        }),
        entry,
        unsubscribe: jest.fn(async () => "ok"),
        teardown: jest.fn(),
      };
      liveChannels.push(channel);
      return channel;
    }),
    getChannels: jest.fn(() => liveChannels),
    removeChannel: jest.fn(async (channel: Channel) => {
      channel.entry.closed = true;
      liveChannels = liveChannels.filter((current) => current !== channel);
      return "ok";
    }),
  };
  jest.mocked(getAuthClient).mockReturnValue(sdk as unknown as SupabaseClient);
  function Active() {
    const { client, syncById } = useRemoteTournaments();
    useEffect(() => client?.retainTournament(a), [client]);
    return <Text>{syncById[a]?.status ?? "empty"}</Text>;
  }
  function activeTree() {
    return (
      <RemoteTournamentProvider>
        <Active />
      </RemoteTournamentProvider>
    );
  }
  globalThis.fetch = jest.fn(
    async (url: unknown) =>
      ({
        ok: true,
        json: async () =>
          String(url).includes("?")
            ? { items: [], nextCursor: null }
            : {
                tournamentId: a,
                revision: 1,
                syncSequence: 0,
                tournament: tournamentFixture("draft"),
              },
      }) as Response,
  );
  auth(a);
  const ui = await render(activeTree());
  await waitFor(() => expect(channels).toHaveLength(1));
  await act(async () => {
    channels[0].status?.("SUBSCRIBED");
  });
  await waitFor(() => expect(ui.getByText("connected")).toBeTruthy());
  await ui.rerender(activeTree());
  expect(channels).toHaveLength(1);
  owner = b;
  auth(b);
  await ui.rerender(activeTree());
  await waitFor(() => expect(channels).toHaveLength(2));
  expect(channels[0].closed).toBe(true);
  expect(channels[1].owner).toBe(b);
  await act(async () => {
    channels[0].status?.("SUBSCRIBED");
  });
  expect(ui.queryByText("connected")).toBeNull();
  auth(null);
  await ui.rerender(activeTree());
  expect(channels[1].closed).toBe(true);
  expect(ui.getByText("empty")).toBeTruthy();
  await ui.unmount();
});
test("remontagem de efeitos mantém transporte ativo, deduplica a lista e logout esconde o cache", async () => {
  auth(a);
  const request = jest.fn(
    async () =>
      ({
        ok: true,
        json: async () => ({
          items: [{ tournamentId: a, name: "Conta A" }],
          nextCursor: null,
        }),
      }) as Response,
  );
  globalThis.fetch = request;
  const ui = await render(tree());
  await waitFor(() => expect(ui.getByText("Conta A")).toBeTruthy());
  expect(request).toHaveBeenCalledTimes(1);
  auth(null);
  await ui.rerender(tree());
  expect(ui.queryByText("Conta A")).toBeNull();
  expect(ui.getByText("vazio")).toBeTruthy();
  await ui.unmount();
});
test("troca A/B publica somente a nova identidade mesmo quando a resposta A chega depois", async () => {
  let resolveA!: (response: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    resolveA = resolve;
  });
  globalThis.fetch = jest.fn(async (_url: unknown, init?: RequestInit) =>
    String((init?.headers as Record<string, string>).Authorization).includes(a)
      ? delayed
      : ({
          ok: true,
          json: async () => ({
            items: [{ tournamentId: b, name: "Conta B" }],
            nextCursor: null,
          }),
        } as Response),
  );
  auth(a);
  const ui = await render(tree());
  auth(b);
  await ui.rerender(tree());
  await waitFor(() => expect(ui.getByText("Conta B")).toBeTruthy());
  await act(async () => {
    resolveA({
      ok: true,
      json: async () => ({
        items: [{ tournamentId: a, name: "Conta A" }],
        nextCursor: null,
      }),
    } as Response);
    await Promise.resolve();
  });
  expect(ui.queryByText("Conta A")).toBeNull();
  expect(ui.getByText("Conta B")).toBeTruthy();
  await ui.unmount();
});
