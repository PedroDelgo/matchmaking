import React from "react";
import { AppState, Text, type AppStateStatus } from "react-native";
import { act, render } from "@testing-library/react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthProvider, useAuth } from "../../src/features/auth/AuthProvider";
import { onSessionStorageError } from "../../src/features/auth/sessionStorage";

jest.mock("../../src/features/auth/client", () => ({
  getAuthClient: () => null,
  getAuthConfigurationError: () => null,
}));
jest.mock("../../src/features/auth/sessionStorage", () => ({
  onSessionStorageError: jest.fn(() => jest.fn()),
}));
jest.mock("expo-linking", () => ({
  createURL: () => "matchmaking://auth/callback",
}));

test("provider iniciado em background só renova em foreground e remove todos os listeners", async () => {
  const previousState = AppState.currentState;
  AppState.currentState = "background";
  const remove = jest.fn(),
    unsubscribe = jest.fn();
  let change!: (state: AppStateStatus) => void;
  const listener = jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event, callback) => {
      change = callback;
      return { remove };
    });
  const auth = {
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe } },
    })),
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  };
  function State() {
    return <Text>{useAuth().status}</Text>;
  }
  try {
    const ui = await render(
      <AuthProvider client={{ auth } as unknown as SupabaseClient}>
        <State />
      </AuthProvider>,
    );
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    await act(async () => change("active"));
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.getSession).toHaveBeenCalledTimes(2);
    await act(async () => change("background"));
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
    await ui.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    const offStorage = jest.mocked(onSessionStorageError).mock.results[0].value;
    expect(offStorage).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(3);
  } finally {
    AppState.currentState = previousState;
    listener.mockRestore();
  }
});
