import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { AuthenticatedActor } from "../src/auth";
import { createCommandService } from "../src/service";
import { createTournamentService } from "../src/tournaments";
import { createInviteService } from "../src/invites";
import { CommandError } from "../src/commands";
import { asClient } from "./fixtures";

const url = process.env.MATCHMAKING_DATABASE_TEST_URL;
if (!url || !/^\/mm_5a_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
  throw new Error("Disposable DB runner required");
const admin = new Pool({ connectionString: url }),
  pool = new Pool({
    connectionString: process.env.MATCHMAKING_COMMAND_TEST_URL,
  }),
  cloud = createTournamentService(pool),
  execute = createCommandService(pool),
  invitationPepper = randomBytes(32).toString("base64url"),
  invites = createInviteService(pool, {
    pepper: invitationPepper,
    rateLimits: { ip: 10000, actor: 10000, seconds: 60 },
  });
after(async () => {
  await pool.end();
  await admin.end();
});
async function actor(isAnonymous = false) {
  const userId = randomUUID();
  await admin.query("insert into auth.users(id,is_anonymous) values($1,$2)", [
    userId,
    isAnonymous,
  ]);
  return { userId, isAnonymous } as AuthenticatedActor;
}
async function setup() {
  const owner = await actor(),
    operation = {
      commandId: randomUUID(),
      commandVersion: 1,
      type: "create_tournament",
      payload: {
        name: "Copa de sinais privados",
        modality: "Truco",
        capacity: 4,
        format: "single_elimination",
      },
    },
    response = await cloud.operate(owner, operation);
  return { owner, operation, response, tournamentId: response.tournamentId };
}
const management = (tournamentId: string, type: string, payload: unknown) => ({
  commandId: randomUUID(),
  commandVersion: 1,
  tournamentId,
  type,
  payload,
});
const command = (
  response: { tournamentId: string; revision: number },
  type: string,
  payload: unknown,
) => ({
  commandId: randomUUID(),
  commandVersion: 1,
  tournamentId: response.tournamentId,
  expectedRevision: response.revision,
  type,
  payload,
});
async function feed(tournamentId: string) {
  const { rows } = await admin.query(
    "select * from public.tournament_signals where tournament_id=$1 order by sequence",
    [tournamentId],
  );
  return rows;
}
async function head(tournamentId: string) {
  const { rows } = await admin.query(
    "select sequence from matchmaking_private.tournament_sync_heads where tournament_id=$1",
    [tournamentId],
  );
  return Number(rows[0]?.sequence ?? 0);
}
async function visible(userId: string, tournamentId: string) {
  let rows: Record<string, unknown>[] = [];
  await asClient(admin, userId, async (c) => {
    rows = (
      await c.query(
        "select * from public.tournament_signals where tournament_id=$1 order by sequence",
        [tournamentId],
      )
    ).rows;
  });
  return rows;
}
async function issue(
  s: Awaited<ReturnType<typeof setup>>,
  role: "participant" | "viewer" = "viewer",
) {
  const operation = management(s.tournamentId, "create_invite", {
      role,
      expiresInHours: 24,
      maxUses: 10,
    }),
    result = await invites.manage(s.owner, operation);
  if (!("shareUrl" in result) || typeof result.shareUrl !== "string")
    throw new Error("Fresh invitation required");
  return {
    operation,
    result,
    token: new URLSearchParams(new URL(result.shareUrl).hash.slice(1)).get(
      "token",
    )!,
  };
}

test("signal publication is dedicated and INSERT-only, with a minimal fixed payload", async () => {
  const s = await setup(),
    [signal] = await feed(s.tournamentId),
    { rows: publications } = await admin.query(
      "select pubinsert,pubupdate,pubdelete,pubtruncate,puballtables from pg_publication where pubname='supabase_realtime'",
    ),
    { rows: tables } = await admin.query(
      "select schemaname,tablename from pg_publication_tables where pubname='supabase_realtime'",
    );
  assert.deepEqual(publications, [
    {
      pubinsert: true,
      pubupdate: false,
      pubdelete: false,
      pubtruncate: false,
      puballtables: false,
    },
  ]);
  assert.deepEqual(tables, [
    { schemaname: "public", tablename: "tournament_signals" },
  ]);
  assert.deepEqual(Object.keys(signal).sort(), [
    "category",
    "created_at",
    "recipient_user_id",
    "revision",
    "sequence",
    "signal_version",
    "tournament_id",
  ]);
  assert.equal(signal.signal_version, 1);
  assert.equal(signal.category, "competitive");
  assert.equal(Number(signal.revision), 1);
  assert.equal(
    JSON.stringify(signal).includes(s.response.tournament.name),
    false,
  );
});

test("competitive commands produce one signal per committed revision and none on replay or conflict", async () => {
  const s = await setup();
  assert.equal(await head(s.tournamentId), 1);
  await cloud.operate(s.owner, s.operation);
  assert.equal(await head(s.tournamentId), 1);
  const operation = command(s.response, "add_participant", {
      displayName: "Ana",
    }),
    saved = await execute(s.owner, operation);
  assert.equal(saved.revision, 2);
  assert.equal(await head(s.tournamentId), 2);
  assert.deepEqual(await execute(s.owner, operation), saved);
  await assert.rejects(
    execute(
      s.owner,
      command(s.response, "add_participant", { displayName: "Bia" }),
    ),
    (e: unknown) => e instanceof CommandError && e.code === "REVISION_CONFLICT",
  );
  assert.equal(await head(s.tournamentId), 2);
  assert.deepEqual(
    (await feed(s.tournamentId)).map((r) => Number(r.revision)),
    [1, 2],
  );
});

test("a signal and its watermark stay invisible until COMMIT and disappear together on ROLLBACK", async () => {
  const s = await setup(),
    writer = await admin.connect();
  try {
    for (const commit of [false, true]) {
      await writer.query("begin");
      await writer.query(
        "update public.tournaments set revision=2 where id=$1",
        [s.tournamentId],
      );
      await writer.query(
        "insert into matchmaking_private.tournament_events(tournament_id,actor_id,command_id,revision,type,rules_version,details) values($1,$2,$3,2,'add_participant',1,'{}'::jsonb)",
        [s.tournamentId, s.owner.userId, randomUUID()],
      );
      assert.equal(
        Number(
          (
            await writer.query(
              "select sequence from matchmaking_private.tournament_sync_heads where tournament_id=$1",
              [s.tournamentId],
            )
          ).rows[0].sequence,
        ),
        2,
      );
      assert.equal(await head(s.tournamentId), 1);
      assert.equal((await feed(s.tournamentId)).length, 1);
      await writer.query(commit ? "commit" : "rollback");
      assert.equal(await head(s.tournamentId), commit ? 2 : 1);
      assert.equal((await feed(s.tournamentId)).length, commit ? 2 : 1);
    }
  } finally {
    await writer.query("rollback");
    writer.release();
  }
});

test("domain write failure rolls back signal, watermark and membership changes", async () => {
  const s = await setup(),
    fault = createCommandService(pool, {
      afterSave() {
        throw new Error("Injected failure");
      },
    });
  await assert.rejects(
    fault(
      s.owner,
      command(s.response, "add_participant", { displayName: "Ana" }),
    ),
    /Injected failure/,
  );
  assert.equal(await head(s.tournamentId), 1);
  assert.equal((await feed(s.tournamentId)).length, 1);
  assert.equal((await cloud.detail(s.owner, s.tournamentId)).revision, 1);
  const invitation = await issue(s, "participant"),
    guest = await actor(true),
    beforeAdmission = await head(s.tournamentId),
    faultAdmission = createInviteService(pool, {
      pepper: invitationPepper,
      afterSave() {
        throw new Error("Injected admission failure after all writes");
      },
    });
  await assert.rejects(
    faultAdmission.accept(
      guest,
      {
        commandId: randomUUID(),
        commandVersion: 1,
        credential: { kind: "token", value: invitation.token },
        displayName: "Convidado",
      },
      randomUUID(),
    ),
    /Injected admission failure/,
  );
  assert.equal(await head(s.tournamentId), beforeAdmission);
  assert.equal((await feed(s.tournamentId)).length, beforeAdmission);
  assert.equal((await cloud.detail(s.owner, s.tournamentId)).revision, 1);
  const {
    rows: [remaining],
  } = await admin.query(
    `select (select count(*)::int from public.participants where tournament_id=$1) as players,
      (select count(*)::int from public.tournament_members where tournament_id=$1) as members,
      (select use_count from matchmaking_private.tournament_invites where id=$2) as uses`,
    [s.tournamentId, invitation.result.invite.id],
  );
  assert.deepEqual(remaining, { players: 0, members: 0, uses: 0 });
});

test("viewer admission and invite administration signal access without changing competitive revision", async () => {
  const s = await setup(),
    invitation = await issue(s),
    viewer = await actor(true),
    acceptance = {
      commandId: randomUUID(),
      commandVersion: 1,
      credential: { kind: "token", value: invitation.token },
    };
  assert.equal(await head(s.tournamentId), 2);
  await invites.manage(s.owner, invitation.operation);
  assert.equal(await head(s.tournamentId), 2);
  await invites.accept(viewer, acceptance, randomUUID());
  const admittedHead = await head(s.tournamentId);
  assert.equal(admittedHead, 4); // membership insertion and invite use are distinct access changes.
  assert.equal((await cloud.detail(viewer, s.tournamentId)).revision, 1);
  await invites.accept(viewer, acceptance, randomUUID());
  await invites.accept(
    viewer,
    { ...acceptance, commandId: randomUUID() },
    randomUUID(),
  );
  assert.equal(await head(s.tournamentId), admittedHead);
  const revoke = management(s.tournamentId, "revoke_invite", {
    inviteId: invitation.result.invite.id,
  });
  await invites.manage(s.owner, revoke);
  assert.equal(await head(s.tournamentId), admittedHead + 1);
  await invites.manage(s.owner, revoke);
  assert.equal(await head(s.tournamentId), admittedHead + 1);
  const signals = await feed(s.tournamentId);
  assert.equal(signals.filter((r) => r.category === "competitive").length, 1);
  assert.ok(
    signals
      .filter((r) => r.category === "access")
      .every((r) => r.revision === null),
  );
  assert.equal(JSON.stringify(signals).includes(invitation.token), false);
  assert.equal(
    JSON.stringify(signals).includes(invitation.result.code as string),
    false,
  );
});

test("removed member sees only its directed revocation, never later competitive state or another recipient", async () => {
  const s = await setup(),
    invitation = await issue(s),
    viewer = await actor(),
    other = await actor(),
    outsider = await actor();
  for (const account of [viewer, other])
    await invites.accept(
      account,
      {
        commandId: randomUUID(),
        commandVersion: 1,
        credential: { kind: "token", value: invitation.token },
      },
      randomUUID(),
    );
  assert.ok((await visible(viewer.userId, s.tournamentId)).length > 0);
  assert.deepEqual(await visible(outsider.userId, s.tournamentId), []);
  await invites.manage(
    s.owner,
    management(s.tournamentId, "remove_member", { userId: viewer.userId }),
  );
  await execute(
    s.owner,
    command(s.response, "add_participant", { displayName: "Ana" }),
  );
  const revoked = await visible(viewer.userId, s.tournamentId);
  assert.equal(revoked.length, 1);
  assert.equal(revoked[0].category, "access_revoked");
  assert.equal(revoked[0].recipient_user_id, viewer.userId);
  assert.equal(revoked[0].revision, null);
  assert.ok(
    (await visible(other.userId, s.tournamentId)).every(
      (r) => r.recipient_user_id === null,
    ),
  );
  assert.ok(
    (await visible(s.owner.userId, s.tournamentId)).every(
      (r) => r.recipient_user_id === null,
    ),
  );
  await assert.rejects(
    cloud.detail(viewer, s.tournamentId),
    (e: unknown) => e instanceof CommandError && e.code === "FORBIDDEN",
  );
  assert.deepEqual(await visible(outsider.userId, s.tournamentId), []);
});

test("participant admission and downgrade notify access while the existing engine controls competitive revision", async () => {
  const s = await setup(),
    invitation = await issue(s, "participant"),
    guest = await actor(true),
    accepted = await invites.accept(
      guest,
      {
        commandId: randomUUID(),
        commandVersion: 1,
        credential: { kind: "token", value: invitation.token },
        displayName: "Convidado",
      },
      randomUUID(),
    ),
    beforeRemoval = await head(s.tournamentId),
    detail = await cloud.detail(s.owner, s.tournamentId);
  assert.equal(accepted.revision, 2);
  assert.equal(detail.tournament.participants.length, 1);
  await execute(
    s.owner,
    command(detail, "remove_participant", {
      participantId: accepted.participantId,
    }),
  );
  assert.equal(await head(s.tournamentId), beforeRemoval + 2);
  const member = await cloud.detail(guest, s.tournamentId);
  assert.equal(member.access?.role, "viewer");
  assert.equal(member.revision, 3);
  assert.equal(member.tournament.participants.length, 0);
  assert.equal(
    (await feed(s.tournamentId)).filter((r) => r.category === "access_revoked")
      .length,
    0,
  );
  assert.deepEqual(
    (await feed(s.tournamentId))
      .filter((r) => r.category === "competitive")
      .map((r) => Number(r.revision)),
    [1, 2, 3],
  );
});

test("retention bounds each tournament to 256 signals while its watermark remains monotonic", async () => {
  const s = await setup(),
    viewer = await actor();
  await admin.query(
    "insert into public.tournament_members(tournament_id,user_id,role) values($1,$2,'viewer')",
    [s.tournamentId, viewer.userId],
  );
  const before = await head(s.tournamentId),
    c = await admin.connect();
  try {
    await c.query("begin");
    for (let i = 0; i < 270; i++)
      await c.query(
        "update public.tournament_members set role=case when role='viewer' then 'participant' else 'viewer' end where tournament_id=$1 and user_id=$2",
        [s.tournamentId, viewer.userId],
      );
    await c.query("commit");
  } finally {
    await c.query("rollback");
    c.release();
  }
  const signals = await feed(s.tournamentId),
    latest = await head(s.tournamentId);
  assert.equal(signals.length, 256);
  assert.equal(latest, before + 270);
  assert.equal(Number(signals[0].sequence), latest - 255);
  assert.equal(Number(signals.at(-1)!.sequence), latest);
  assert.equal((await cloud.detail(s.owner, s.tournamentId)).revision, 1);
});

test("concurrent commands retain per-tournament ordering and do not leak neighboring tournament signals", async () => {
  const s = await setup(),
    neighbor = await setup(),
    responses = await Promise.allSettled(
      ["Ana", "Bia"].map((displayName) =>
        execute(
          s.owner,
          command(s.response, "add_participant", { displayName }),
        ),
      ),
    );
  assert.equal(responses.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(responses.filter((r) => r.status === "rejected").length, 1);
  assert.equal(await head(s.tournamentId), 2);
  assert.equal(await head(neighbor.tournamentId), 1);
  assert.deepEqual(await visible(s.owner.userId, neighbor.tournamentId), []);
  assert.deepEqual(await visible(neighbor.owner.userId, s.tournamentId), []);
});

test("clients and the command login cannot fabricate, mutate, delete or directly emit notifications", async () => {
  const s = await setup();
  for (const sql of [
    "insert into public.tournament_signals(tournament_id,sequence,category,revision) values($1,2,'competitive',2)",
    "update public.tournament_signals set category='access' where tournament_id=$1",
    "delete from public.tournament_signals where tournament_id=$1",
    "select * from matchmaking_private.tournament_sync_heads where tournament_id=$1",
    "select matchmaking_private.emit_tournament_signal($1,'access')",
  ])
    await assert.rejects(
      asClient(admin, s.owner.userId, async (c) => {
        await c.query(sql, [s.tournamentId]);
      }),
      (e: unknown) =>
        !!e && typeof e === "object" && "code" in e && e.code === "42501",
    );
  const c = await pool.connect();
  try {
    for (const sql of [
      "insert into public.tournament_signals(tournament_id,sequence,category,revision) values($1,2,'competitive',2)",
      "update matchmaking_private.tournament_sync_heads set sequence=99 where tournament_id=$1",
      "select matchmaking_private.emit_tournament_signal($1,'access')",
    ]) {
      await c.query("begin");
      await c.query("set local role matchmaking_command");
      await assert.rejects(
        c.query(sql, [s.tournamentId]),
        (e: unknown) =>
          !!e && typeof e === "object" && "code" in e && e.code === "42501",
      );
      await c.query("rollback");
    }
  } finally {
    await c.query("rollback");
    c.release();
  }
  assert.equal(await head(s.tournamentId), 1);
});

test("signal constraints reject unsafe sequences, unsupported versions and private data on directed revocation", async () => {
  const s = await setup(),
    recipient = await actor(),
    c = await admin.connect();
  try {
    for (const [sql, values] of [
      [
        "update matchmaking_private.tournament_sync_heads set sequence=-1 where tournament_id=$1",
        [s.tournamentId],
      ],
      [
        "update matchmaking_private.tournament_sync_heads set sequence=9007199254740992 where tournament_id=$1",
        [s.tournamentId],
      ],
      [
        "insert into public.tournament_signals(tournament_id,sequence,category) values($1,9007199254740992,'access')",
        [s.tournamentId],
      ],
      [
        "insert into public.tournament_signals(tournament_id,sequence,category,signal_version) values($1,2,'access',2)",
        [s.tournamentId],
      ],
      [
        "insert into public.tournament_signals(tournament_id,sequence,category,revision,recipient_user_id) values($1,2,'access_revoked',2,$2)",
        [s.tournamentId, recipient.userId],
      ],
      [
        "insert into public.tournament_signals(tournament_id,sequence,category,recipient_user_id) values($1,2,'access',$2)",
        [s.tournamentId, recipient.userId],
      ],
      [
        "insert into public.tournament_signals(tournament_id,sequence,category) values($1,2,'competitive')",
        [s.tournamentId],
      ],
    ] as [string, string[]][]) {
      await c.query("begin");
      await assert.rejects(
        c.query(sql, values),
        (e: unknown) =>
          !!e && typeof e === "object" && "code" in e && e.code === "23514",
      );
      await c.query("rollback");
    }
  } finally {
    await c.query("rollback");
    c.release();
  }
  assert.equal(await head(s.tournamentId), 1);
});
