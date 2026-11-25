import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import * as Linking from "expo-linking";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AuthController,
  signedOutAuthState,
  type AuthState,
} from "./AuthController";
import { getAuthClient, getAuthConfigurationError } from "./client";
import { onSessionStorageError } from "./sessionStorage";

export type { RemoteProfile, AuthState } from "./AuthController";
type AuthActions = Pick<
  AuthController,
  | "signIn"
  | "signInAsGuest"
  | "signUp"
  | "requestPasswordReset"
  | "completeCallback"
  | "updatePassword"
  | "signOut"
  | "updateNickname"
  | "retrySession"
  | "clearError"
>;
type AuthContextValue = AuthState & AuthActions;
const unavailable = async (): Promise<never> => {
  throw new Error(
    "A conexão com sua conta ainda não foi configurada. Você pode continuar sem conta.",
  );
};
const fallback: AuthContextValue = {
  ...signedOutAuthState,
  signIn: unavailable,
  signInAsGuest: unavailable,
  signUp: unavailable,
  requestPasswordReset: unavailable,
  completeCallback: unavailable,
  updatePassword: unavailable,
  signOut: unavailable,
  updateNickname: unavailable,
  retrySession: unavailable,
  clearError: () => undefined,
};
const AuthContext = createContext<AuthContextValue>(fallback);

function callbackUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined")
    return new URL("/auth/callback", window.location.origin).toString();
  // Expo Go uses its exp:// route; custom scheme requires a development/installed build.
  return Linking.createURL("auth/callback");
}

export function AuthProvider({
  children,
  client: suppliedClient,
}: {
  children: ReactNode;
  client?: SupabaseClient | null;
}) {
  const client =
    suppliedClient === undefined ? getAuthClient() : suppliedClient;
  const controller = useMemo(
    () =>
      new AuthController(
        client,
        callbackUrl,
        suppliedClient === undefined ? getAuthConfigurationError() : null,
      ),
    [client, suppliedClient],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    const unsubscribeStorage = onSessionStorageError(
      controller.reportStorageError,
    );
    controller.start();
    let previousState = AppState.currentState;
    if (client && Platform.OS !== "web") {
      if (previousState === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    }
    const subscription =
      client && Platform.OS !== "web"
        ? AppState.addEventListener("change", (next) => {
            if (next === "active" && previousState !== "active") {
              client.auth.startAutoRefresh();
              void controller.retrySession().catch(() => undefined);
            } else if (next !== "active") client.auth.stopAutoRefresh();
            previousState = next;
          })
        : null;
    return () => {
      unsubscribeStorage();
      subscription?.remove();
      if (client && Platform.OS !== "web") client.auth.stopAutoRefresh();
      controller.stop();
    };
  }, [client, controller]);
  const value: AuthContextValue = {
    ...state,
    signIn: controller.signIn,
    signInAsGuest: controller.signInAsGuest,
    signUp: controller.signUp,
    requestPasswordReset: controller.requestPasswordReset,
    completeCallback: controller.completeCallback,
    updatePassword: controller.updatePassword,
    signOut: controller.signOut,
    updateNickname: controller.updateNickname,
    retrySession: controller.retrySession,
    clearError: controller.clearError,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
