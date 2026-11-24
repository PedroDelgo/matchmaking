import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useAuth } from "../../auth/AuthProvider";
import { getTournamentApiUrl, RemoteTournaments } from "./client";

const Context = createContext<RemoteTournaments | null>(null);
export function RemoteTournamentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useAuth();
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
