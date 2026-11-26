import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import type { RemoteTournaments } from "../features/tournaments/remote/client";

// Lists have no Realtime channel. Returning from a cup reconciles their summaries.
export function useRemoteListRefresh(
  client: Pick<RemoteTournaments, "list"> | null,
) {
  useFocusEffect(
    useCallback(() => {
      if (client) void client.list();
    }, [client]),
  );
}
