import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { getAuthClient } from "../../auth/client";
import { getTournamentApiUrl, RemoteTournaments } from "./client";
import { tournamentTransport } from "./transport";

const Context = createContext<RemoteTournaments | null>(null);
export function RemoteTournamentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const retrySession = useRef(auth.retrySession);
  useEffect(() => {
    retrySession.current = auth.retrySession;
  }, [auth.retrySession]);
  const api = getTournamentApiUrl(),
    userId = ["authenticated", "refreshing"].includes(auth.status)
      ? auth.session?.user.id
      : null;
  const client = useMemo(
    () => (api && userId ? new RemoteTournaments(api, userId) : null),
    [api, userId],
  );
  useLayoutEffect(() => {
    client?.setAccessToken(auth.session?.access_token ?? null);
    return () => client?.setAccessToken(null);
  }, [client, auth.session?.access_token]);
  useEffect(() => {
    if (!client) return;
    const sdk = getAuthClient();
    client.configureRealtime(sdk ? tournamentTransport(sdk) : null);
    const available = () =>
      Platform.OS === "web"
        ? (typeof navigator === "undefined" || navigator.onLine !== false) &&
          (typeof document === "undefined" ||
            document.visibilityState !== "hidden")
        : AppState.currentState === "active";
    let live = true,
      suspended = !available(),
      resumeGeneration = 0;
    client.setSyncActive(!suspended);
    const resume = () => {
      if (!available()) {
        resumeGeneration++;
        suspended = true;
        client.setSyncActive(false);
      } else if (suspended) {
        // Auth validation publishes the identity again before subscriptions resume.
        suspended = false;
        const generation = ++resumeGeneration;
        void Promise.resolve(retrySession.current?.())
          .then(() => {
            if (live && generation === resumeGeneration && available())
              client.setSyncActive(true);
          })
          .catch(() => undefined);
      }
    };
    const native =
      Platform.OS !== "web"
        ? AppState.addEventListener("change", resume)
        : null;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("online", resume);
      window.addEventListener("offline", resume);
      document.addEventListener("visibilitychange", resume);
    }
    return () => {
      live = false;
      resumeGeneration++;
      client.setSyncActive(false);
      client.configureRealtime(null);
      native?.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.removeEventListener("online", resume);
        window.removeEventListener("offline", resume);
        document.removeEventListener("visibilitychange", resume);
      }
    };
  }, [client]);
  const live = useRef<RemoteTournaments | null>(null);
  useEffect(() => {
    live.current = client;
    if (client) void client.list();
    return () => {
      live.current = null;
      queueMicrotask(() => {
        if (live.current !== client) client?.dispose();
      });
    };
  }, [client]);
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
const empty = {
  items: [],
  nextCursor: null,
  status: "success" as const,
  details: {},
  busy: false,
  pending: {},
  syncById: {},
};
const noop = () => () => {};
export function useRemoteTournaments() {
  const client = useContext(Context);
  const state = useSyncExternalStore(
    client?.subscribe ?? noop,
    client?.getSnapshot ?? (() => empty),
    () => empty,
  );
  return { client, ...state };
}
