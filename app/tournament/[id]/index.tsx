import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useAppStore } from "../../../src/store/useAppStore";
import { Shell } from "../../../src/components/Shell";
import { MissingTournament } from "../../../src/components/tournament";
export default function TournamentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useAppStore((s) => s.tournaments.find((t) => t.id === id));
  return t ? (
    <Redirect
      href={`/tournament/${id}/${t.status === "draft" ? "lobby" : "bracket"}`}
    />
  ) : (
    <Shell>
      <MissingTournament />
    </Shell>
  );
}
