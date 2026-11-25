import { useCallback } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAppStore } from "../../store/useAppStore";
import { useRemoteTournaments } from "./remote/RemoteProvider";

export function useTournament(explicitId?: string) {
  const params = useLocalSearchParams<{ id: string; source?: string }>(),
    id = explicitId ?? params.id,
    cloud = params.source === "cloud";
  const local = useAppStore((s) => s.tournaments.find((t) => t.id === id)),
    remote = useRemoteTournaments();
  const client = remote.client;
  useFocusEffect(
    useCallback(() => {
      if (cloud && client && id) void client.detail(id, true).catch(() => {});
    }, [cloud, client, id]),
  );
  const detail = remote.details[id as keyof typeof remote.details];
  const tournament = cloud ? detail?.data?.tournament : local;
  return {
    tournament,
    cloud,
    access: cloud ? detail?.data?.access : undefined,
    canManage: !cloud || detail?.data?.access?.role === "organizer",
    id,
    client,
    busy: cloud && remote.busy,
    pending: cloud && remote.pending[id as keyof typeof remote.pending],
    status: cloud
      ? (detail?.status ?? (client ? "loading" : "unauthorized"))
      : "success",
    error: detail?.error,
    href: (tab: string) =>
      `/tournament/${encodeURIComponent(id)}/${tab}${cloud ? "?source=cloud" : ""}`,
    reload: () => client?.detail(id, true),
    async add(name: string, profileId?: string) {
      if (cloud)
        return (
          await client!.mutate(id, "add_participant", { displayName: name })
        ).tournament;
      useAppStore.getState().add(id, name, profileId);
      return useAppStore.getState().tournaments.find((t) => t.id === id)!;
    },
    async remove(participantId: string) {
      if (cloud)
        return (
          await client!.mutate(id, "remove_participant", { participantId })
        ).tournament;
      useAppStore.getState().remove(id, participantId);
      return useAppStore.getState().tournaments.find((t) => t.id === id)!;
    },
    async start() {
      if (cloud)
        return (await client!.mutate(id, "draw_bracket", {})).tournament;
      useAppStore.getState().start(id);
      return useAppStore.getState().tournaments.find((t) => t.id === id)!;
    },
    async score(
      matchId: string,
      score1: number,
      score2: number,
      tieBreakWinnerId?: string,
    ) {
      if (cloud) {
        const m = tournament?.matches.find((m) => m.id === matchId);
        return (
          await client!.mutate(
            id,
            m?.status === "completed" ? "correct_result" : "record_result",
            {
              matchId,
              score1,
              score2,
              ...(tieBreakWinnerId ? { tieBreakWinnerId } : {}),
            },
          )
        ).tournament;
      }
      useAppStore
        .getState()
        .score(id, matchId, score1, score2, tieBreakWinnerId);
      return useAppStore.getState().tournaments.find((t) => t.id === id)!;
    },
  };
}
