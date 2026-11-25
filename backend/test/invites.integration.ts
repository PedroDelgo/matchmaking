import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { setTimeout as delay } from "node:timers/promises";
import { createInviteService } from "../src/invites";
import { createTournamentService } from "../src/tournaments";
import { createCommandService } from "../src/service";
import { CommandError } from "../src/commands";
import type { AuthenticatedActor } from "../src/auth";
import { asClient } from "./fixtures";

const url = process.env.MATCHMAKING_DATABASE_TEST_URL;
if (!url || !/^\/mm_5a_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
  throw new Error("Disposable database required");
const admin = new Pool({ connectionString: url }),
  pool = new Pool({
    connectionString: process.env.MATCHMAKING_COMMAND_TEST_URL,
    application_name: "matchmaking-5d-proof",
  });
after(async () => {
  await pool.end();
  await admin.end();
});
const pepper = randomBytes(32).toString("base64url"),
  options = { pepper, rateLimits: { ip: 10000, actor: 10000, seconds: 60 } },
  invites = createInviteService(pool, options),
  cloud = createTournamentService(pool),
  execute = createCommandService(pool);
const error = (code: string) => (e: unknown) =>
  e instanceof CommandError && e.code === code;
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
    t = await cloud.operate(owner, {
      commandId: randomUUID(),
      commandVersion: 1,
      type: "create_tournament",
      payload: {
        name: "Copa de convites",
        modality: "Truco",
        capacity: 4,
        format: "single_elimination",
      },
    });
  return { owner, tournamentId: t.tournamentId };
}
const management = (tournamentId: string, type: string, payload: unknown) => ({
  commandId: randomUUID(),
  commandVersion: 1,
  tournamentId,
  type,
  payload,
});
async function issue(
  s: Awaited<ReturnType<typeof setup>>,
  role = "participant",
  maxUses = 4,
) {
  const command = management(s.tournamentId, "create_invite", {
      role,
      maxUses,
      expiresInHours: 24,
    }),
    r = await invites.manage(s.owner, command);
  if (
    !("shareUrl" in r) ||
    typeof r.shareUrl !== "string" ||
    !("code" in r) ||
    typeof r.code !== "string"
  )
    throw new Error("Fresh invitation credentials missing");
  const token = new URLSearchParams(new URL(r.shareUrl).hash.slice(1)).get(
    "token",
  )!;
  return { command, id: r.invite.id, token, code: r.code, url: r.shareUrl };
}
const acceptance = (token: string, displayName = "Rival") => ({
  commandId: randomUUID(),
  commandVersion: 1,
  credential: { kind: "token", value: token },
  displayName,
});
async function counts(tournamentId: string) {
  const {
    rows: [r],
  } = await admin.query(
    `select revision,(select count(*)::int from public.participants where tournament_id=t.id) as players,
    (select count(*)::int from public.tournament_members where tournament_id=t.id) as members,
    (select coalesce(sum(use_count),0)::int from matchmaking_private.tournament_invites where tournament_id=t.id) as uses,
    (select count(*)::int from matchmaking_private.invite_receipts where tournament_id=t.id) as receipts,
    (select count(*)::int from matchmaking_private.invite_events where tournament_id=t.id) as events from public.tournaments t where id=$1`,
    [tournamentId],
  );
  return { ...r, revision: Number(r.revision) };
}

test("invitation credentials are random, private, shown once, and management is recoverable-owner only", async () => {
  const s = await setup(),
    i = await issue(s),
    guest = await actor(true),
    outside = await actor();
  assert.ok(
    i.token.length === 43 && i.code.length === 8 && !/[01IO]/.test(i.code),
  );
  const replay = await invites.manage(s.owner, i.command);
  await assert.rejects(
    invites.manage(s.owner, {
      ...i.command,
      payload: { role: { toString: "viewer" }, expiresInHours: 24, maxUses: 1 },
    }),
    error("INVALID_INVITE_OPTIONS"),
  );
  assert.ok(!("shareUrl" in replay) && !("code" in replay));
  assert.equal(
    (
      await admin.query(
        "select count(*)::int as n from matchmaking_private.tournament_invites where tournament_id=$1",
        [s.tournamentId],
      )
    ).rows[0].n,
    1,
  );
  for (const a of [guest, outside])
    await assert.rejects(
      invites.manage(
        a,
        management(s.tournamentId, "create_invite", {
          role: "participant",
          expiresInHours: 24,
          maxUses: 1,
        }),
      ),
      error(a.isAnonymous ? "RECOVERABLE_ACCOUNT_REQUIRED" : "FORBIDDEN"),
    );
  await assert.rejects(
    cloud.operate(guest, {
      ...i.command,
      type: "create_tournament",
      payload: {
        name: "Guest",
        modality: "Truco",
        capacity: 4,
        format: "single_elimination",
      },
    }),
    error("RECOVERABLE_ACCOUNT_REQUIRED"),
  );
  await assert.rejects(
    admin.query(
      "insert into public.tournaments(domain_id,owner_user_id,name,modality,capacity,status) values('forbidden',$1,'Guest','Truco',4,'draft')",
      [guest.userId],
    ),
    (e) => !!e && typeof e === "object" && "code" in e && e.code === "23514",
  );
  const row = (
      await admin.query(
        "select * from matchmaking_private.tournament_invites where id=$1",
        [i.id],
      )
    ).rows[0],
    text = JSON.stringify(row);
  assert.ok(
    !text.includes(i.token) && !text.includes(i.code),
    "Only protected digests may be stored",
  );
  await assert.rejects(
    invites.manage(s.owner, {
      ...i.command,
      payload: { role: "organizer", expiresInHours: 24, maxUses: 1 },
    }),
    error("INVALID_INVITE_OPTIONS"),
  );
});

test("token and normalized code preview expose only minimal information and consume no membership, vacancy or use", async () => {
  const s = await setup(),
    i = await issue(s),
    before = await counts(s.tournamentId);
  const a = await invites.preview(
      { kind: "token", value: i.token },
      "preview-a",
    ),
    b = await invites.preview(
      {
        kind: "code",
        value: ` ${i.code.slice(0, 4).toLowerCase()}-${i.code.slice(4).toLowerCase()} `,
      },
      "preview-b",
    );
  assert.deepEqual(a, b);
  assert.ok(
    !("participants" in a) && !("tournamentId" in a) && !("matches" in a),
  );
  assert.deepEqual(await counts(s.tournamentId), before);
  const list = JSON.stringify(
    await invites.list(s.owner, s.tournamentId, "invites"),
  );
  assert.ok(
    !list.includes(i.token) &&
      !list.includes(i.code) &&
      !list.includes("digest"),
  );
});

test("active invitations stay manageable even behind more than one hundred revoked entries", async () => {
  const s = await setup(),
    i = await issue(s);
  await admin.query(
    "update matchmaking_private.tournament_invites set created_at=clock_timestamp()-interval '1 hour' where id=$1",
    [i.id],
  );
  await admin.query(
    `insert into matchmaking_private.tournament_invites(id,tournament_id,created_by,access_role,token_digest,code_digest,expires_at,max_uses,revoked_at)
    select gen_random_uuid(),$1,$2,'viewer',repeat(md5('fixture-token-'||n::text),2),repeat(md5('fixture-code-'||n::text),2),clock_timestamp()+interval '1 day',1,clock_timestamp()
    from generate_series(1,101) n`,
    [s.tournamentId, s.owner.userId],
  );
  const list = await invites.list(s.owner, s.tournamentId, "invites");
  assert.equal(list.items.length, 100);
  assert.ok("id" in list.items[0] && list.items[0].id===i.id);
});

test("bounded member administration remains complete at the explicit 200-access MVP limit", async () => {
  const s = await setup(),
    i = await issue(s, "viewer"),
    a = await actor();
  const ids = (
    await admin.query(
      "insert into auth.users(id) select gen_random_uuid() from generate_series(1,200) returning id",
    )
  ).rows.map((r) => r.id);
  await admin.query(
    "insert into public.tournament_members(tournament_id,user_id,role) select $1,unnest($2::uuid[]),'viewer'",
    [s.tournamentId, ids],
  );
  await assert.rejects(
    invites.accept(a, acceptance(i.token), "member-limit"),
    error("MEMBER_LIMIT_REACHED"),
  );
  const list = await invites.list(s.owner, s.tournamentId, "members");
  assert.equal(list.items.length, 200);
  const existing = await invites.accept(
    { userId: ids[0] } as AuthenticatedActor,
    acceptance(i.token),
    "existing-limit",
  );
  assert.equal(existing.alreadyMember, true);
  assert.equal((await counts(s.tournamentId)).uses, 0);
});

test("anonymous participant is explicitly bound, equal names never claim an existing slot, and members only read", async () => {
  const s = await setup(),
    i = await issue(s),
    guest = await actor(true),
    other = await actor();
  const initial = await cloud.detail(s.owner, s.tournamentId);
  await execute(s.owner, {
    commandId: randomUUID(),
    commandVersion: 1,
    tournamentId: s.tournamentId,
    expectedRevision: initial.revision,
    type: "add_participant",
    payload: { displayName: "Rival" },
  });
  const result = await invites.accept(guest, acceptance(i.token), "guest-bind");
  assert.equal(result.role, "participant");
  assert.equal(result.revision, 3);
  const detail = await cloud.detail(guest, s.tournamentId);
  assert.equal(detail.tournament.participants.length, 2);
  assert.equal(detail.access?.role, "participant");
  assert.equal(detail.access?.participantId, result.participantId);
  assert.notEqual(detail.tournament.participants[0].id, result.participantId);
  assert.equal(
    (await cloud.list(guest, new URLSearchParams())).items.length,
    1,
  );
  await assert.rejects(cloud.detail(other, s.tournamentId), error("FORBIDDEN"));
  for (const type of ["add_participant", "draw_bracket", "record_result"])
    await assert.rejects(
      execute(guest, {
        commandId: randomUUID(),
        commandVersion: 1,
        tournamentId: s.tournamentId,
        expectedRevision: 3,
        type,
        payload: {},
      }),
      error("RECOVERABLE_ACCOUNT_REQUIRED"),
    );
  for (const type of ["create_invite", "revoke_invite"])
    await assert.rejects(
      invites.manage(
        guest,
        management(
          s.tournamentId,
          type,
          type === "create_invite"
            ? { role: "viewer", maxUses: 1, expiresInHours: 1 }
            : { inviteId: i.id },
        ),
      ),
      error("RECOVERABLE_ACCOUNT_REQUIRED"),
    );
});

test("acceptance replay survives lost response, invitation revocation and revision advance without extra use or role change", async () => {
  const s = await setup(),
    i = await issue(s),
    a = await actor(),
    op = acceptance(i.token),
    first = await invites.accept(a, op, "replay");
  await invites.manage(
    s.owner,
    management(s.tournamentId, "revoke_invite", { inviteId: i.id }),
  );
  const latest = await cloud.detail(s.owner, s.tournamentId);
  await execute(s.owner, {
    commandId: randomUUID(),
    commandVersion: 1,
    tournamentId: s.tournamentId,
    expectedRevision: latest.revision,
    type: "add_participant",
    payload: { displayName: "Outro" },
  });
  const before = await counts(s.tournamentId);
  assert.deepEqual(
    await invites.accept(a, op, "replay"),
    JSON.parse(JSON.stringify(first)),
  );
  assert.deepEqual(await counts(s.tournamentId), before);
  await assert.rejects(
    invites.accept(a, { ...op, displayName: "Mudou" }, "replay"),
    error("IDEMPOTENCY_KEY_REUSED"),
  );
  const again = await invites.accept(a, acceptance(i.token), "replay");
  assert.equal(again.alreadyMember, true);
  assert.equal((await counts(s.tournamentId)).uses, 1);
});

test("last competitive vacancy is serialized across different invitations without exceeding capacity", async () => {
  const s = await setup(),
    i = await issue(s),
    j = await issue(s),
    a = await actor(),
    b = await actor();
  for (let n = 0; n < 3; n++) {
    const t = await cloud.detail(s.owner, s.tournamentId);
    await execute(s.owner, {
      commandId: randomUUID(),
      commandVersion: 1,
      tournamentId: s.tournamentId,
      expectedRevision: t.revision,
      type: "add_participant",
      payload: { displayName: `Manual ${n}` },
    });
  }
  const results = await Promise.allSettled([
    invites.accept(a, acceptance(i.token), "last-slot-a"),
    invites.accept(b, acceptance(j.token), "last-slot-b"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(
    results.some(
      (r) => r.status === "rejected" && error("TOURNAMENT_FULL")(r.reason),
    ),
  );
  const c = await counts(s.tournamentId);
  assert.equal(c.players, 4);
  assert.equal(c.members, 1);
  assert.equal(c.uses, 1);
});

test("last invitation use, simultaneous repeated identity and independent tournaments remain correct", async () => {
  const s = await setup(),
    i = await issue(s, "viewer", 1),
    a = await actor(),
    b = await actor();
  const results = await Promise.allSettled([
    invites.accept(a, acceptance(i.token), "last-use-a"),
    invites.accept(b, acceptance(i.token), "last-use-b"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(
    results.some(
      (r) => r.status === "rejected" && error("INVITE_EXHAUSTED")(r.reason),
    ),
  );
  const c = await counts(s.tournamentId);
  assert.equal(c.players, 0);
  assert.equal(c.members, 1);
  assert.equal(c.uses, 1);
  assert.equal(c.revision, 1);
  const second = await setup(),
    j = await issue(second),
    k = await issue(second),
    same = await actor();
  await Promise.all([
    invites.accept(same, acceptance(j.token), "same-a"),
    invites.accept(same, acceptance(k.token), "same-b"),
  ]);
  const d = await counts(second.tournamentId);
  assert.equal(d.players, 1);
  assert.equal(d.members, 1);
  assert.equal(d.uses, 1);
});

test("started tournaments reject new players but admit viewers without changing bracket or revision", async () => {
  const s = await setup(),
    play = await issue(s),
    watch = await issue(s, "viewer"),
    guest = await actor(true),
    viewer = await actor();
  for (let n = 0; n < 4; n++) {
    const t = await cloud.detail(s.owner, s.tournamentId);
    await execute(s.owner, {
      commandId: randomUUID(),
      commandVersion: 1,
      tournamentId: s.tournamentId,
      expectedRevision: t.revision,
      type: "add_participant",
      payload: { displayName: `P ${n}` },
    });
  }
  let t = await cloud.detail(s.owner, s.tournamentId);
  await execute(s.owner, {
    commandId: randomUUID(),
    commandVersion: 1,
    tournamentId: s.tournamentId,
    expectedRevision: t.revision,
    type: "draw_bracket",
    payload: {},
  });
  t = await cloud.detail(s.owner, s.tournamentId);
  await assert.rejects(
    invites.accept(guest, acceptance(play.token), "started-player"),
    error("TOURNAMENT_STARTED"),
  );
  const result = await invites.accept(
    viewer,
    acceptance(watch.token),
    "started-viewer",
  );
  assert.equal(result.role, "viewer");
  const latest = await cloud.detail(viewer, s.tournamentId);
  assert.equal(latest.revision, t.revision);
  assert.deepEqual(latest.tournament, t.tournament);
  await assert.rejects(
    execute(viewer, {
      commandId: randomUUID(),
      commandVersion: 1,
      tournamentId: s.tournamentId,
      expectedRevision: t.revision,
      type: "draw_bracket",
      payload: {},
    }),
    error("FORBIDDEN"),
  );
  await assert.rejects(
    invites.manage(
      viewer,
      management(s.tournamentId, "revoke_invite", { inviteId: watch.id }),
    ),
    error("FORBIDDEN"),
  );
});

test("expired, revoked and invalid credentials are refused; revocation preserves admitted members", async () => {
  const s = await setup(),
    i = await issue(s, "viewer"),
    j = await issue(s),
    a = await actor(),
    b = await actor();
  await invites.accept(a, acceptance(i.token), "revoked-member");
  await invites.manage(
    s.owner,
    management(s.tournamentId, "revoke_invite", { inviteId: i.id }),
  );
  await assert.rejects(
    invites.preview({ kind: "token", value: i.token }, "revoked-preview"),
    error("INVITE_REVOKED"),
  );
  await assert.rejects(
    invites.accept(b, acceptance(i.token), "revoked-other"),
    error("INVITE_REVOKED"),
  );
  await cloud.detail(a, s.tournamentId);
  await admin.query(
    "update matchmaking_private.tournament_invites set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where id=$1",
    [j.id],
  );
  await assert.rejects(
    invites.accept(b, acceptance(j.token), "expired"),
    error("INVITE_EXPIRED"),
  );
  await assert.rejects(
    invites.preview(
      { kind: "token", value: randomBytes(32).toString("base64url") },
      "invalid-token",
    ),
    error("INVALID_INVITE"),
  );
  await assert.rejects(
    invites.preview({ kind: "code", value: "ZZZZZZZZ" }, "invalid-code"),
    error("INVALID_INVITE"),
  );
});

test("expiry is checked after aggregate lock wait, and fault injection rolls back every admission write", async () => {
  const s = await setup(),
    i = await issue(s),
    a = await actor();
  const blocked = await admin.connect();
  await blocked.query("begin");
  await blocked.query(
    "select id from public.tournaments where id=$1 for update",
    [s.tournamentId],
  );
  const pending = invites.accept(a, acceptance(i.token), "expiry-wait");
  let observed = false;
  for (let n = 0; n < 100; n++) {
    const {
      rows: [r],
    } = await admin.query(
      "select exists(select 1 from pg_stat_activity where application_name='matchmaking-5d-proof' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0) as waiting",
    );
    if (r.waiting) {
      observed = true;
      break;
    }
    await delay(5);
  }
  // Expire while the competing transaction cannot hold the aggregate lock.
  await blocked.query(
    "update matchmaking_private.tournament_invites set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where id=$1",
    [i.id],
  );
  await blocked.query("commit");
  blocked.release();
  await assert.rejects(pending, error("INVITE_EXPIRED"));
  assert.ok(observed, "Admission never reached the real aggregate-lock wait");
  const j = await issue(s),
    before = await counts(s.tournamentId),
    fault = createInviteService(pool, {
      ...options,
      afterSave() {
        throw new Error("INJECTED_ROLLBACK");
      },
    });
  await assert.rejects(
    fault.accept(a, acceptance(j.token), "rollback"),
    /INJECTED_ROLLBACK/,
  );
  assert.deepEqual(await counts(s.tournamentId), before);
  const reserved = (
    await admin.query(
      "select count(*)::int as n from matchmaking_private.participant_ids where tournament_id=$1",
      [s.tournamentId],
    )
  ).rows[0].n;
  assert.equal(reserved, 0);
});

test("rate limits commit invalid attempts independently of admission rollback and are shared across identities by IP", async () => {
  const limited = createInviteService(pool, {
      pepper: randomBytes(32).toString("base64url"),
      rateLimits: { ip: 2, actor: 1, seconds: 60 },
    }),
    s = await setup(),
    a = await actor(),
    b = await actor();
  for (let n = 0; n < 2; n++)
    await assert.rejects(
      limited.preview({ kind: "code", value: "ZZZZZZZZ" }, "abuse-ip"),
      error("INVALID_INVITE"),
    );
  await assert.rejects(
    limited.preview({ kind: "code", value: "ZZZZZZZZ" }, "abuse-ip"),
    error("INVITE_RATE_LIMITED"),
  );
  await assert.rejects(
    limited.accept(
      a,
      acceptance(randomBytes(32).toString("base64url")),
      "abuse-admit",
    ),
    error("INVALID_INVITE"),
  );
  await assert.rejects(
    limited.accept(
      b,
      acceptance(randomBytes(32).toString("base64url")),
      "abuse-admit",
    ),
    error("INVALID_INVITE"),
  );
  await assert.rejects(
    limited.accept(
      await actor(),
      acceptance(randomBytes(32).toString("base64url")),
      "abuse-admit",
    ),
    error("INVITE_RATE_LIMITED"),
  );
  assert.equal((await counts(s.tournamentId)).members, 0);
});

test("RLS denies guest profile writes/direct membership, composite binding crosses no tournaments, and removed access cannot replay admission", async () => {
  const s = await setup(),
    i = await issue(s),
    a = await actor(true),
    op = acceptance(i.token),
    joined = await invites.accept(a, op, "rls-guest"),
    outside = await actor();
  await asClient(admin, a.userId, async (c) => {
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: a.userId, is_anonymous: true }),
    ]);
    assert.equal(
      (
        await c.query("select id from public.tournaments where id=$1", [
          s.tournamentId,
        ])
      ).rowCount,
      1,
    );
    assert.equal(
      (
        await c.query(
          "update public.profiles set nickname='Forbidden' where user_id=$1",
          [a.userId],
        )
      ).rowCount,
      0,
    );
  });
  await asClient(admin, outside.userId, async (c) => {
    assert.equal(
      (
        await c.query("select id from public.tournaments where id=$1", [
          s.tournamentId,
        ])
      ).rowCount,
      0,
    );
  });
  await asClient(admin, a.userId, async (c) => {
    await assert.rejects(
      c.query(
        "insert into public.tournament_members(tournament_id,user_id,role) values($1,$2,'viewer')",
        [s.tournamentId, outside.userId],
      ),
    );
  });
  const other = await setup();
  await assert.rejects(
    admin.query(
      "insert into public.tournament_members(tournament_id,user_id,role,participant_id) values($1,$2,'participant',$3)",
      [other.tournamentId, outside.userId, joined.participantId],
    ),
  );
  let t = await cloud.detail(s.owner, s.tournamentId);
  await execute(s.owner, {
    commandId: randomUUID(),
    commandVersion: 1,
    tournamentId: s.tournamentId,
    expectedRevision: t.revision,
    type: "remove_participant",
    payload: { participantId: joined.participantId },
  });
  assert.equal((await cloud.detail(a, s.tournamentId)).access?.role, "viewer");
  await invites.manage(
    s.owner,
    management(s.tournamentId, "remove_member", { userId: a.userId }),
  );
  await assert.rejects(cloud.detail(a, s.tournamentId), error("FORBIDDEN"));
  await assert.rejects(
    invites.accept(a, op, "removed-replay"),
    error("FORBIDDEN"),
  );
});
