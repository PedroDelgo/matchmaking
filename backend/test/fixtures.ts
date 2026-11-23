import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  Tournament,
  TournamentCapacity,
} from "../../src/features/tournaments/domain/types";
import {
  createTournament,
  addParticipant,
  startTournament,
  recordResult,
} from "../../src/features/tournaments/engine/tournament";
import { loadTournament } from "../src/repository";

export function fixture(capacity: TournamentCapacity = 4, completed = false) {
  let t = createTournament(
    { name: "Copa transacional", modality: "Futebol", capacity },
    `cup-${randomUUID()}`,
  );
  for (let i = 0; i < capacity; i++)
    t = addParticipant(t, `Competidor ${i + 1}`);
  t = startTournament(t, () => 0.999);
  if (completed) for (const m of t.matches) t = recordResult(t, m.id, 3, 1);
  return t;
}
// Administrative fixture setup only, never an import/provisioning API.
export async function seed(
  pool: Pool,
  actorId: string,
  t: Tournament,
  revision = 0,
) {
  const id = randomUUID(),
    c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(
      "insert into auth.users(id) values($1) on conflict do nothing",
      [actorId],
    );
    await c.query(
      "insert into public.profiles(user_id,nickname) values($1,'Organizador de teste') on conflict do nothing",
      [actorId],
    );
    await c.query(
      `insert into public.tournaments(id,domain_id,owner_user_id,name,modality,capacity,status,revision,draw_order,champion_id,created_at,started_at,completed_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        t.id,
        actorId,
        t.name,
        t.modality,
        t.capacity,
        t.status,
        revision,
        t.drawOrder,
        t.championId ?? null,
        t.createdAt,
        t.startedAt ?? null,
        t.completedAt ?? null,
      ],
    );
    for (const [i, p] of t.participants.entries())
      await c.query(
        "insert into public.participants(tournament_id,domain_id,display_name,position_index,profile_id,created_at) values($1,$2,$3,$4,$5,$6)",
        [id, p.id, p.displayName, i, p.profileId ?? null, p.createdAt],
      );
    for (const r of t.rounds)
      await c.query(
        "insert into public.rounds(tournament_id,domain_id,round_index,label,status) values($1,$2,$3,$4,$5)",
        [id, r.id, r.index, r.label, r.status],
      );
    for (const m of t.matches)
      await c.query(
        `insert into public.matches(tournament_id,domain_id,round_index,position_index,participant1_id,participant2_id,score1,score2,winner_id,status,next_match_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          m.id,
          m.roundIndex,
          m.positionIndex,
          m.participant1Id,
          m.participant2Id,
          m.score1,
          m.score2,
          m.winnerId,
          m.status,
          m.nextMatchId,
        ],
      );
    await c.query("commit");
    return id;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
export async function read(pool: Pool, id: string) {
  const c = await pool.connect();
  try {
    return await loadTournament(c, id);
  } finally {
    c.release();
  }
}
export async function asClient(
  pool: Pool,
  userId: string,
  run: (c: PoolClient) => Promise<void>,
) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
      userId,
    ]);
    await run(c);
  } finally {
    await c.query("rollback");
    c.release();
  }
}
