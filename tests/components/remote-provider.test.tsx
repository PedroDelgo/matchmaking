import React, { StrictMode } from "react";
import { Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import {
  RemoteTournamentProvider,
  useRemoteTournaments,
} from "../../src/features/tournaments/remote/RemoteProvider";
import { useAuth } from "../../src/features/auth/AuthProvider";

jest.mock("../../src/features/auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));
const savedUrl = process.env.EXPO_PUBLIC_MATCHMAKING_API_URL,
  savedFetch = globalThis.fetch;
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
function auth(id: string | null) {
  jest
    .mocked(useAuth)
    .mockReturnValue({
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
});
afterEach(() => {
  globalThis.fetch = savedFetch;
  if (savedUrl === undefined)
    delete process.env.EXPO_PUBLIC_MATCHMAKING_API_URL;
  else process.env.EXPO_PUBLIC_MATCHMAKING_API_URL = savedUrl;
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
