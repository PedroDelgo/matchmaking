import React from "react";
import { AppState, Text, type AppStateStatus } from "react-native";
import { act, render } from "@testing-library/react-native";
import { RemoteTournamentProvider } from "../../src/features/tournaments/remote/RemoteProvider";
import { RemoteTournaments } from "../../src/features/tournaments/remote/client";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { signedOutAuthState } from "../../src/features/auth/AuthController";

jest.mock("../../src/features/auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));
jest.mock("../../src/features/auth/client", () => ({
  getAuthClient: () => null,
}));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));

const savedUrl = process.env.EXPO_PUBLIC_MATCHMAKING_API_URL;
const savedFetch = globalThis.fetch;
const savedAppState = AppState.currentState;
const user = "22222222-2222-4222-8222-222222222222";
const pending = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  process.env.EXPO_PUBLIC_MATCHMAKING_API_URL = "http://127.0.0.1:8090";
  AppState.currentState = "active";
  globalThis.fetch = jest.fn(
    async () =>
      ({
        ok: true,
        json: async () => ({ items: [], nextCursor: null }),
      }) as Response,
  );
});
afterEach(() => {
  jest.restoreAllMocks();
  AppState.currentState = savedAppState;
  globalThis.fetch = savedFetch;
  if (savedUrl === undefined)
    delete process.env.EXPO_PUBLIC_MATCHMAKING_API_URL;
  else process.env.EXPO_PUBLIC_MATCHMAKING_API_URL = savedUrl;
});

async function mount(retrySession: jest.Mock<Promise<void>, []>) {
  jest.mocked(useAuth).mockReturnValue({
    ...signedOutAuthState,
    status: "authenticated",
    session: {
      user: {
        id: user,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "2026-11-26T12:00:00Z",
      },
      access_token: "test-token",
      refresh_token: "test-refresh",
      expires_in: 3600,
      token_type: "bearer",
    },
    retrySession,
    signIn: jest.fn(),
    signInAsGuest: jest.fn(),
    signUp: jest.fn(),
    requestPasswordReset: jest.fn(),
    completeCallback: jest.fn(),
    updatePassword: jest.fn(),
    signOut: jest.fn(),
    updateNickname: jest.fn(),
    clearError: jest.fn(),
  });
  let onChange!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event, callback) => {
      onChange = callback;
      return { remove };
    });
  const activation = jest.spyOn(RemoteTournaments.prototype, "setSyncActive");
  const ui = await render(
    <RemoteTournamentProvider>
      <Text>Campeonato remoto</Text>
    </RemoteTournamentProvider>,
  );
  activation.mockClear();
  const transition = async (state: AppStateStatus) =>
    act(async () => {
      AppState.currentState = state;
      onChange(state);
      await flush();
    });
  return { ui, activation, transition, remove };
}

test("Auth pendente não reativa sincronização se o aplicativo voltar ao background", async () => {
  const validation = pending();
  const retrySession = jest
    .fn<Promise<void>, []>()
    .mockReturnValueOnce(validation.promise)
    .mockResolvedValue(undefined);
  const { ui, activation, transition, remove } = await mount(retrySession);
  await transition("background");
  await transition("active");
  expect(retrySession).toHaveBeenCalledTimes(1);
  expect(activation.mock.calls.some(([active]) => active)).toBe(false);
  await transition("background");
  await act(async () => {
    validation.resolve();
    await flush();
  });
  expect(activation.mock.calls.some(([active]) => active)).toBe(false);
  expect(activation).toHaveBeenLastCalledWith(false);
  // A later genuine foreground transition can validate and resume normally.
  await transition("active");
  expect(retrySession).toHaveBeenCalledTimes(2);
  expect(activation.mock.calls.filter(([active]) => active)).toHaveLength(1);
  await ui.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

test("validação antiga não reativa outra vez após uma retomada mais recente", async () => {
  const old = pending(),
    latest = pending();
  const retrySession = jest
    .fn<Promise<void>, []>()
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(latest.promise);
  const { ui, activation, transition } = await mount(retrySession);
  await transition("background");
  await transition("active");
  await transition("background");
  await transition("active");
  await act(async () => {
    latest.resolve();
    await flush();
  });
  expect(activation.mock.calls.filter(([active]) => active)).toHaveLength(1);
  await act(async () => {
    old.resolve();
    await flush();
  });
  expect(activation.mock.calls.filter(([active]) => active)).toHaveLength(1);
  await ui.unmount();
});
