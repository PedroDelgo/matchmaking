import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { AuthenticatedActor } from "../src/auth";
import { createTournamentService } from "../src/tournaments";
import { createCommandService } from "../src/service";
import { CommandError } from "../src/commands";
import { fixture, read, asClient } from "./fixtures";
import {
  canonicalSnapshot,
  parseImportSnapshot,
} from "../../src/features/tournaments/domain/snapshot";
import {
  createTournament,
  addParticipant,
  recordResult,
} from "../../src/features/tournaments/engine/tournament";
import type { TournamentCapacity } from "../../src/features/tournaments/domain/types";

const url = process.env.MATCHMAKING_DATABASE_TEST_URL;
if (!url || !/^\/mm_5a_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
  throw new Error("Disposable DB runner required");
const admin = new Pool({ connectionString: url }),
  pool = new Pool({
    connectionString: process.env.MATCHMAKING_COMMAND_TEST_URL,
  });
after(async () => {
  await pool.end();
  await admin.end();
});
const cloud = createTournamentService(pool),
  execute = createCommandService(pool);
async function actor() {
  const userId = randomUUID();
  await admin.query("insert into auth.users(id) values($1)", [userId]);
  return { userId } as AuthenticatedActor;
}
const create = (capacity: TournamentCapacity = 4) => ({
  commandId: randomUUID(),
  commandVersion: 1,
  type: "create_tournament",
  payload: {
    name: "Copa na nuvem",
    modality: "Futebol",
    capacity,
    format: "single_elimination",
  },
});
const importOp = (snapshot: unknown) => ({
  commandId: randomUUID(),
  commandVersion: 1,
  type: "import_tournament",
  payload: {
    installationId: randomUUID(),
    importId: randomUUID(),
    snapshotVersion: 1,
    snapshot,
  },
});
const code = (name: string) => (e: unknown) =>
  e instanceof CommandError && e.code === name;
const command = (
  r: { tournamentId: string; revision: number },
  type: string,
  payload: unknown,
) => ({
  commandId: randomUUID(),
  commandVersion: 1,
  tournamentId: r.tournamentId,
  expectedRevision: r.revision,
  type,
  payload,
});

test("creation is atomic, strict, actor owned, concurrent and idempotent across later revisions", async () => {
  const a = await actor(),
    op = create();
  const [first, repeat] = await Promise.all([
    cloud.operate(a, op),
    cloud.operate(a, op),
  ]);
  assert.deepEqual(first, repeat);
  assert.equal(first.revision, 1);
  assert.notEqual(first.tournamentId, first.tournament.id);
  const next = await execute(
    a,
    command(first, "add_participant", { displayName: "Ana" }),
  );
  assert.deepEqual(await cloud.operate(a, op), first);
  assert.equal(
    (await cloud.detail(a, first.tournamentId)).revision,
    next.revision,
  );
  await assert.rejects(
    cloud.operate(a, { ...op, payload: { ...op.payload, name: "Outra" } }),
    code("IDEMPOTENCY_KEY_REUSED"),
  );
  for (const bad of [
    { ...op, owner_user_id: a.userId },
    { ...op, payload: { ...op.payload, capacity: 5 } },
    { ...op, payload: { ...op.payload, owner_user_id: a.userId } },
  ])
    await assert.rejects(cloud.operate(a, bad));
  const {
    rows: [row],
  } = await admin.query(
    "select owner_user_id from public.tournaments where id=$1",
    [first.tournamentId],
  );
  assert.equal(row.owner_user_id, a.userId);
});
test("authorized detail and bounded summary list isolate accounts; pagination preserves timestamp microseconds", async () => {
  const a = await actor(),
    b = await actor(),
    ids: string[] = [];
  for (let i = 0; i < 3; i++)
    ids.push((await cloud.operate(a, create())).tournamentId);
  await admin.query(
    "update public.tournaments set updated_at='2026-01-01 00:00:00.000123+00' where id=any($1::uuid[])",
    [ids],
  );
  const found: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await cloud.list(
      a,
      new URLSearchParams({ limit: "1", ...(cursor ? { cursor } : {}) }),
    );
    found.push(...page.items.map((i) => i.tournamentId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(new Set(found).size, 3);
  assert.deepEqual(new Set(found), new Set(ids));
  assert.equal((await cloud.list(b, new URLSearchParams())).items.length, 0);
  await assert.rejects(cloud.detail(b, ids[0]), code("FORBIDDEN"));
  await assert.rejects(
    execute(
      b,
      command({ tournamentId: ids[0], revision: 1 }, "draw_bracket", {}),
    ),
    code("FORBIDDEN"),
  );
  await assert.rejects(
    cloud.list(a, new URLSearchParams({ limit: "51" })),
    code("INVALID_LIMIT"),
  );
});
test("remote lifecycle for 4/8/16 reuses engine, reserves removed IDs, draws once and restores confirmed champion", async () => {
  const a = await actor();
  for (const capacity of [4, 8, 16] as const) {
    let r = await cloud.operate(a, create(capacity));
    for (let i = 0; i < capacity; i++)
      r = await execute(
        a,
        command(r, "add_participant", {
          displayName: i < 2 ? "Nome repetido" : `Pessoa ${i}`,
        }),
      );
    const removed = r.tournament.participants[1].id;
    r = await execute(
      a,
      command(r, "remove_participant", { participantId: removed }),
    );
    r = await execute(
      a,
      command(r, "add_participant", { displayName: "Substituto" }),
    );
    assert.ok(!r.tournament.participants.some((p) => p.id === removed));
    const draw = command(r, "draw_bracket", {});
    r = await execute(a, draw);
    assert.deepEqual(await execute(a, draw), r);
    await assert.rejects(
      execute(a, command(r, "draw_bracket", {})),
      code("INVALID_DOMAIN_COMMAND"),
    );
    await assert.rejects(
      execute(
        a,
        command(r, "remove_participant", {
          participantId: r.tournament.participants[0].id,
        }),
      ),
      code("INVALID_DOMAIN_COMMAND"),
    );
    for (const match of r.tournament.matches)
      r = await execute(
        a,
        command(r, "record_result", {
          matchId: match.id,
          score1: 3,
          score2: 1,
        }),
      );
    assert.equal(r.tournament.status, "completed");
    assert.deepEqual(
      (await cloud.detail(a, r.tournamentId)).tournament,
      r.tournament,
    );
    assert.deepEqual(await read(admin, r.tournamentId), r.tournament);
    const reserved = await admin.query(
      "select domain_id from matchmaking_private.participant_ids where tournament_id=$1",
      [r.tournamentId],
    );
    assert.equal(reserved.rowCount, capacity + 1);
    assert.ok(reserved.rows.some((p) => p.domain_id === removed));
    const final = r.tournament.matches.at(-1)!;
    r = await execute(
      a,
      command(r, "correct_result", { matchId: final.id, score1: 0, score2: 2 }),
    );
    assert.equal(r.tournament.championId, final.participant2Id);
  }
});
test("import preserves empty/partial draft, active and completed snapshots, legacy IDs and historical dates", async () => {
  const a = await actor(),
    empty = createTournament(
      { name: "Legado", modality: "Truco", capacity: 4 },
      "legacy",
    );
  const snapshots = [
    empty,
    addParticipant(empty, "Nome repetido"),
    fixture(4),
    fixture(8, true),
    fixture(16, true),
  ];
  const partial = fixture(4);
  snapshots.push(recordResult(partial, partial.matches[0].id, 2, 1));
  for (const t of snapshots) {
    const op = importOp(t),
      r = await cloud.operate(a, op);
    assert.equal(
      canonicalSnapshot((await cloud.detail(a, r.tournamentId)).tournament),
      canonicalSnapshot(t),
    );
    assert.deepEqual(await cloud.operate(a, op), r);
    assert.deepEqual(
      await cloud.operate(a, { ...op, commandId: randomUUID() }),
      r,
    );
    await assert.rejects(
      cloud.operate(a, {
        ...op,
        commandId: randomUUID(),
        payload: { ...op.payload, snapshot: { ...t, name: "Alterado" } },
      }),
      code("IMPORT_CONTENT_CHANGED"),
    );
    assert.notEqual(
      (
        await cloud.operate(a, {
          ...op,
          commandId: randomUUID(),
          payload: { ...op.payload, installationId: randomUUID() },
        })
      ).tournamentId,
      r.tournamentId,
    );
  }
});
test("same import identity is serialized across different commands and rollback removes every initial write", async () => {
  const a = await actor(),
    op = importOp(fixture(16, true));
  const [one, two] = await Promise.all([
    cloud.operate(a, op),
    cloud.operate(a, { ...op, commandId: randomUUID() }),
  ]);
  assert.equal(one.tournamentId, two.tournamentId);
  const bad = importOp(fixture());
  await assert.rejects(
    createTournamentService(pool, {
      afterSave: () => {
        throw new Error("injected");
      },
    }).operate(a, bad),
    /injected/,
  );
  const {
    rows: [row],
  } = await admin.query(
    `select (select count(*)::int from matchmaking_private.operation_receipts where actor_id=$1) as receipts,(select count(*)::int from public.tournaments where owner_user_id=$1) as tournaments`,
    [a.userId],
  );
  assert.deepEqual(row, { receipts: 2, tournaments: 1 });
  assert.ok(await cloud.operate(a, bad));
});
test("strict snapshots reject cross references, unknown fields, malformed dates/statuses and unsafe scores", async () => {
  const a = await actor(),
    t = fixture(4, true);
  const bad = [
    { ...t, owner_user_id: a.userId },
    { ...t, createdAt: "invalid" },
    { ...t, rounds: t.rounds.map((r) => ({ ...r, id: "duplicate" })) },
    {
      ...t,
      matches: t.matches.map((m, i) =>
        i ? m : { ...m, tournamentId: "another" },
      ),
    },
    {
      ...t,
      matches: t.matches.map((m, i) =>
        i ? m : { ...m, score1: Number.MAX_SAFE_INTEGER + 1 },
      ),
    },
  ];
  for (const snapshot of bad) {
    assert.throws(() => parseImportSnapshot(snapshot));
    await assert.rejects(
      cloud.operate(a, importOp(snapshot)),
      code("INVALID_SNAPSHOT"),
    );
  }
});
test("replays reauthorize current ownership and private metadata/direct competitive writes remain inaccessible", async () => {
  const a = await actor(),
    b = await actor(),
    op = importOp(fixture());
  const r = await cloud.operate(a, op);
  await admin.query(
    "update public.tournaments set owner_user_id=$2 where id=$1",
    [r.tournamentId, b.userId],
  );
  await assert.rejects(cloud.operate(a, op), code("FORBIDDEN"));
  await assert.rejects(
    cloud.operate(a, { ...op, commandId: randomUUID() }),
    code("FORBIDDEN"),
  );
  for (const sql of [
    "select * from matchmaking_private.tournament_imports",
    "select * from matchmaking_private.operation_receipts",
    "insert into public.participants(tournament_id,domain_id,display_name,position_index) values('" +
      r.tournamentId +
      "','injected','X',0)",
  ])
    await assert.rejects(
      asClient(admin, b.userId, async (c) => {
        await c.query(sql);
      }),
      /permission denied/,
    );
});
