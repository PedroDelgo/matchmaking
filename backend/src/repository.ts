import type { PoolClient } from "pg";
import type {
  Tournament,
  Match,
  Round,
  Participant,
} from "../../src/features/tournaments/domain/types";
import { validateTournament } from "../../src/features/tournaments/domain/validation";

const time = (value: Date | null) => value?.toISOString();
export async function loadTournament(
  client: PoolClient,
  id: string,
): Promise<Tournament> {
  const {
    rows: [t],
  } = await client.query("select * from public.tournaments where id=$1", [id]);
  const { rows: ps } = await client.query(
    "select * from public.participants where tournament_id=$1 order by position_index",
    [id],
  );
  const { rows: rs } = await client.query(
    "select * from public.rounds where tournament_id=$1 order by round_index",
    [id],
  );
  const { rows: ms } = await client.query(
    "select * from public.matches where tournament_id=$1 order by round_index,position_index",
    [id],
  );
  const matches: Match[] = ms.map((m) => ({
    id: m.domain_id,
    tournamentId: t.domain_id,
    roundIndex: m.round_index,
    positionIndex: m.position_index,
    participant1Id: m.participant1_id,
    participant2Id: m.participant2_id,
    score1: m.score1 === null ? null : Number(m.score1),
    score2: m.score2 === null ? null : Number(m.score2),
    winnerId: m.winner_id,
    status: m.status,
    nextMatchId: m.next_match_id,
  }));
  const rounds: Round[] = rs.map((r) => ({
    id: r.domain_id,
    index: r.round_index,
    label: r.label,
    status: r.status,
    matchIds: matches
      .filter((m) => m.roundIndex === r.round_index)
      .map((m) => m.id),
  }));
  const participants: Participant[] = ps.map((p) => ({
    id: p.domain_id,
    displayName: p.display_name,
    createdAt: time(p.created_at)!,
    ...(p.profile_id === null ? {} : { profileId: p.profile_id }),
  }));
  const tournament: Tournament = {
    id: t.domain_id,
    name: t.name,
    modality: t.modality,
    capacity: t.capacity,
    status: t.status,
    participants,
    matches,
    rounds,
    drawOrder: t.draw_order,
    createdAt: time(t.created_at)!,
    ...(t.started_at === null ? {} : { startedAt: time(t.started_at) }),
    ...(t.completed_at === null ? {} : { completedAt: time(t.completed_at) }),
    ...(t.champion_id === null ? {} : { championId: t.champion_id }),
  };
  if (!validateTournament(tournament))
    throw new Error("INVALID_STORED_AGGREGATE");
  return tournament;
}
export async function saveResult(
  client: PoolClient,
  id: string,
  t: Tournament,
  revision: number,
) {
  if (!validateTournament(t)) throw new Error("INVALID_RESULT_AGGREGATE");
  // All queries use this one checked-out client and are awaited sequentially.
  for (const m of t.matches)
    await client.query(
      `update public.matches set participant1_id=$3,participant2_id=$4,score1=$5,score2=$6,winner_id=$7,status=$8
     where tournament_id=$1 and domain_id=$2`,
      [
        id,
        m.id,
        m.participant1Id,
        m.participant2Id,
        m.score1,
        m.score2,
        m.winnerId,
        m.status,
      ],
    );
  for (const r of t.rounds)
    await client.query(
      "update public.rounds set status=$3 where tournament_id=$1 and domain_id=$2",
      [id, r.id, r.status],
    );
  await client.query(
    `update public.tournaments set status=$2,champion_id=$3,completed_at=$4,revision=$5,updated_at=clock_timestamp() where id=$1`,
    [id, t.status, t.championId ?? null, t.completedAt ?? null, revision],
  );
}
