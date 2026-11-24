import React from "react";
import { Redirect } from "expo-router";
import { useTournament } from "../../../src/features/tournaments/useTournament";
import { RemoteTournamentNotice } from "../../../src/components/RemoteTournamentNotice";
import { Shell } from "../../../src/components/Shell";
import { MissingTournament } from "../../../src/components/tournament";
export default function TournamentRoute() {
  const source = useTournament(),
    t = source.tournament;
  return t ? (
    <Redirect href={source.href(t.status === "draft" ? "lobby" : "bracket")} />
  ) : (
    <Shell>
      {source.cloud ? (
        <RemoteTournamentNotice source={source} />
      ) : (
        <MissingTournament />
      )}
    </Shell>
  );
}
