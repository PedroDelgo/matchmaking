import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createAuthenticator, type AuthenticatedActor } from "../src/auth";
import { createCommandService } from "../src/service";
import { CommandError } from "../src/commands";
import {
  recordResult,
  getRanking,
} from "../../src/features/tournaments/engine/tournament";
import { fixture, seed, read, asClient } from "./fixtures";

const url = process.env.MATCHMAKING_DATABASE_TEST_URL;
if (!url || !/^\/mm_5a_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
  throw new Error("Run through backend:test:db; refusing an existing database");
const pool = new Pool({
  connectionString: url,
  max: 8,
  application_name: "matchmaking-5a-proof",
});
const commandPool = new Pool({
  connectionString: process.env.MATCHMAKING_COMMAND_TEST_URL,
  max: 8,
  application_name: "matchmaking-5a-proof",
});
const execute = createCommandService(commandPool);
after(async () => {
  await commandPool.end();
  await pool.end();
});
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
async function actor(): Promise<AuthenticatedActor> {
  const id = randomUUID(),
    keys = await generateKeyPair("ES256");
  const auth = createAuthenticator(
    "http://127.0.0.1/auth/v1",
    createLocalJWKSet({
      keys: [{ ...(await exportJWK(keys.publicKey)), kid: "fixture" }],
    }),
  );
  const jwt = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "fixture" })
    .setSubject(id)
    .setIssuer("http://127.0.0.1/auth/v1")
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(keys.privateKey);
  return auth(`Bearer ${jwt}`);
}
function command(
  tournamentId: string,
  matchId: string,
  expectedRevision = 0,
  type = "record_result",
  score1 = 3,
  score2 = 1,
) {
  return {
    commandId: randomUUID(),
    commandVersion: 1,
    tournamentId,
    expectedRevision,
    type,
    payload: { matchId, score1, score2 },
  };
}
async function counts(id: string) {
  const {
    rows: [r],
  } = await pool.query(
    `select revision,
    (select count(*)::int from matchmaking_private.tournament_events where tournament_id=$1) as events,
    (select count(*)::int from matchmaking_private.command_receipts where tournament_id=$1) as receipts
    from public.tournaments where id=$1`,
    [id],
  );
  return {
    revision: Number(r.revision),
    events: r.events,
    receipts: r.receipts,
  };
}
const code = (expected: string) => (error: unknown) =>
  error instanceof CommandError && error.code === expected;
test("compiled HTTP service verifies JWKS and commits results/corrections with the restricted PostgreSQL login", async () => {
  const owner = randomUUID(),
    keys = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: "http-proof" };
  const jwks = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => jwks.listen(0, "127.0.0.1", resolve));
  const address = jwks.address();
  assert.ok(address && typeof address !== "string");
  const issuer = `http://127.0.0.1:${address.port}/auth/v1`;
  const jwt = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "http-proof" })
    .setSubject(owner)
    .setIssuer(issuer)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("1m")
    .sign(keys.privateKey);
  const t = fixture(),
    id = await seed(pool, owner, t);
  const child = spawn(process.execPath, ["backend/dist/server.mjs"], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.MATCHMAKING_COMMAND_TEST_URL,
      SUPABASE_AUTH_URL: issuer,
      PORT: "0",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  child.stderr.on("data", (data) => {
    diagnostics += String(data);
  });
  try {
    const origin = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Compiled service startup timed out")),
        5000,
      );
      child.once("error", reject);
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Compiled service exited"));
      });
      child.stdout.on("data", (data) => {
        const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
    });
    let requestIndex = 0;
    const send = (body: unknown, token?: string) => {
      const index = ++requestIndex;
      return fetch(`${origin}/commands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }).catch((error) => {
        throw new Error(
          `HTTP request ${index} failed: ${error.message}; server: ${diagnostics}`,
        );
      });
    };
    const malformed = await new Promise<string>((resolve, reject) => {
      let raw = "";
      const socket = connect(Number(new URL(origin).port), "127.0.0.1", () =>
        socket.end(
          "GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        ),
      );
      socket.setTimeout(5000, () =>
        socket.destroy(new Error("Malformed HTTP probe timed out")),
      );
      socket.on("data", (chunk) => {
        raw += String(chunk);
      });
      socket.once("end", () => resolve(raw));
      socket.once("error", reject);
    });
    assert.match(malformed, /^HTTP\/1\.1 400 /);
    assert.equal((await send({ actorId: owner })).status, 401);
    assert.equal(
      (await send({ ...command(id, t.matches[0].id), actorId: owner }, jwt))
        .status,
      400,
    );
    assert.equal((await send({ padding: "x".repeat(17000) }, jwt)).status, 413);
    const saved = await send(command(id, t.matches[0].id), jwt);
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).revision, 1);
    const corrected = await send(
      command(id, t.matches[0].id, 1, "correct_result", 1, 5),
      jwt,
    );
    assert.equal(corrected.status, 200);
    assert.equal((await corrected.json()).revision, 2);
    assert.equal(
      (await read(pool, id)).matches[0].winnerId,
      t.matches[0].participant2Id,
    );
    assert.deepEqual(await counts(id), { revision: 2, events: 2, receipts: 2 });
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        child.kill();
      });
    await new Promise<void>((resolve, reject) =>
      jwks.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
test("service login has no administrative privileges or inherited table access; SET LOCAL ROLE is restored", async () => {
  const client = await commandPool.connect();
  try {
    const {
      rows: [role],
    } = await client.query(
      "select current_user,rolsuper,rolbypassrls,rolinherit from pg_roles where rolname=current_user",
    );
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolbypassrls, false);
    assert.equal(role.rolinherit, false);
    await assert.rejects(
      client.query("select * from public.tournaments"),
      (e) => (e as { code: string }).code === "42501",
    );
    await client.query("begin");
    await client.query("set local role matchmaking_command");
    assert.equal(
      (await client.query("select current_user")).rows[0].current_user,
      "matchmaking_command",
    );
    await client.query("rollback");
    assert.equal(
      (await client.query("select current_user")).rows[0].current_user,
      role.current_user,
    );
  } finally {
    client.release();
  }
});
async function waitForLock() {
  for (let i = 0; i < 50; i++) {
    const {
      rows: [r],
    } = await pool.query(
      "select count(*)::int n from pg_stat_activity where datname=current_database() and application_name='matchmaking-5a-proof' and wait_event_type='Lock'",
    );
    if (r.n > 0) return;
    await delay(20);
  }
  throw new Error(
    "No independent PostgreSQL connection waited on the row lock",
  );
}
for (const capacity of [4, 8, 16] as const)
  test(`real PostgreSQL: ${capacity} players, every round, champion, ranking and reconstruction`, async () => {
    const owner = await actor();
    let t = fixture(capacity);
    const id = await seed(pool, owner.userId, t);
    assert.deepEqual(plain(await read(pool, id)), plain(t));
    let revision = 0;
    for (const m of t.matches) {
      const response = await execute(owner, command(id, m.id, revision));
      const expected = recordResult(t, m.id, 3, 1);
      // Time is owned by the execution, so compare all rules with its actual completion time.
      expected.completedAt = response.tournament.completedAt;
      assert.deepEqual(plain(response.tournament), plain(expected));
      assert.deepEqual(response.ranking, getRanking(expected));
      t = response.tournament;
      revision++;
      assert.deepEqual(plain(await read(pool, id)), plain(t));
    }
    assert.equal(t.status, "completed");
    assert.equal(t.championId, t.matches.at(-1)!.winnerId);
    assert.deepEqual(await counts(id), {
      revision: capacity - 1,
      events: capacity - 1,
      receipts: capacity - 1,
    });
  });
test("corrections preserve descendants with the same winner, invalidate only the changed path, and remove champion", async () => {
  const owner = await actor(),
    t = fixture(8, true),
    id = await seed(pool, owner.userId, t);
  const m = t.matches[0];
  const same = await execute(
    owner,
    command(id, m.id, 0, "correct_result", 8, 1),
  );
  assert.deepEqual(plain(same.tournament), plain(recordResult(t, m.id, 8, 1)));
  const changed = await execute(
    owner,
    command(id, m.id, 1, "correct_result", 1, 9),
  );
  const expected = recordResult(same.tournament, m.id, 1, 9);
  assert.deepEqual(plain(changed.tournament), plain(expected));
  assert.equal(changed.tournament.championId, undefined);
  assert.equal(changed.tournament.matches[1].score1, t.matches[1].score1);
  assert.deepEqual(changed.ranking, getRanking(expected));
  assert.deepEqual(plain(await read(pool, id)), plain(expected));
  const {
    rows: [event],
  } = await pool.query(
    "select details from matchmaking_private.tournament_events where tournament_id=$1 and revision=2",
    [id],
  );
  assert.equal(event.details.invalidated.length, 2);
});
test("ties use the explicit winner and invalid domain commands leave no receipt/event", async () => {
  const owner = await actor(),
    t = fixture(),
    id = await seed(pool, owner.userId, t),
    c = command(id, t.matches[0].id, 0, "record_result", 2, 2);
  await assert.rejects(
    execute(owner, {
      ...c,
      payload: { ...c.payload, tieBreakWinnerId: "someone-else" },
    }),
    code("INVALID_DOMAIN_COMMAND"),
  );
  assert.deepEqual(await counts(id), { revision: 0, events: 0, receipts: 0 });
  const response = await execute(owner, {
    ...c,
    payload: { ...c.payload, tieBreakWinnerId: t.matches[0].participant2Id },
  });
  assert.equal(
    response.tournament.matches[0].winnerId,
    t.matches[0].participant2Id,
  );
  await assert.rejects(
    execute(owner, command(id, t.matches[0].id, 1)),
    code("USE_CORRECT_RESULT"),
  );
  await assert.rejects(
    execute(owner, command(id, t.matches[1].id, 1, "correct_result")),
    code("RESULT_NOT_RECORDED"),
  );
});
test("idempotent retry after lost committed response precedes revision check; another payload is rejected", async () => {
  const owner = await actor(),
    t = fixture(),
    id = await seed(pool, owner.userId, t),
    c = command(id, t.matches[0].id);
  const response = await execute(owner, c); // Simulated transport timeout: response is lost after real COMMIT.
  await execute(owner, command(id, t.matches[1].id, 1));
  assert.deepEqual(await execute(owner, c), response);
  assert.deepEqual(await counts(id), { revision: 2, events: 2, receipts: 2 });
  await assert.rejects(
    execute(owner, { ...c, payload: { ...c.payload, score1: 5 } }),
    code("IDEMPOTENCY_KEY_REUSED"),
  );
  await pool.query("insert into auth.users(id) values($1)", [randomUUID()]);
  const newOwner = await actor();
  await pool.query("insert into auth.users(id) values($1)", [newOwner.userId]);
  await pool.query(
    "insert into public.profiles(user_id,nickname) values($1,'Novo organizador') on conflict do nothing",
    [newOwner.userId],
  );
  await pool.query(
    "update public.tournaments set owner_user_id=$2 where id=$1",
    [id, newOwner.userId],
  );
  await assert.rejects(execute(owner, c), code("FORBIDDEN"));
});
test("two independent connections on revision 12: one commit, one conflict, with a real row-lock wait", async () => {
  const owner = await actor(),
    t = fixture(),
    id = await seed(pool, owner.userId, t, 12);
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    entered = new Promise<void>((r) => (locked = r));
  const first = createCommandService(commandPool, {
    afterSave: async () => {
      locked();
      await gate;
    },
  })(owner, command(id, t.matches[0].id, 12));
  await entered;
  const second = execute(
    owner,
    command(id, t.matches[0].id, 12, "record_result", 1, 7),
  );
  // Attach rejection handler immediately while the first client holds the lock.
  const conflict = assert.rejects(second, code("REVISION_CONFLICT"));
  try {
    await waitForLock();
  } finally {
    release();
  }
  await first;
  await conflict;
  assert.deepEqual(await counts(id), { revision: 13, events: 1, receipts: 1 });
  assert.equal((await read(pool, id)).matches[0].score1, 3);
});
test("different tournaments do not wait on a global lock, even with identical legacy domain IDs", async () => {
  const owner = await actor(),
    t = fixture(),
    a = await seed(pool, owner.userId, t),
    b = await seed(pool, owner.userId, t);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    held = new Promise<void>((r) => (entered = r));
  const first = createCommandService(commandPool, {
    afterSave: async () => {
      entered();
      await gate;
    },
  })(owner, command(a, t.matches[0].id));
  await held;
  try {
    const second = execute(owner, command(b, t.matches[0].id));
    const result = await Promise.race([
      second,
      delay(1500).then(() => {
        throw new Error("Global lock detected");
      }),
    ]);
    assert.equal(result.revision, 1);
  } finally {
    release();
    await first;
  }
  assert.equal((await counts(a)).revision, 1);
  assert.equal((await counts(b)).revision, 1);
});
test("failure after writing aggregate rolls back matches, champion, revision, events and receipt", async () => {
  const owner = await actor(),
    t = fixture(8, true),
    id = await seed(pool, owner.userId, t);
  const fail = createCommandService(commandPool, {
    afterSave: () => {
      throw new Error("INJECTED_FAILURE");
    },
  });
  const c = command(id, t.matches[0].id, 0, "correct_result", 1, 7);
  await assert.rejects(fail(owner, c), /INJECTED_FAILURE/);
  assert.deepEqual(plain(await read(pool, id)), plain(t));
  assert.deepEqual(await counts(id), { revision: 0, events: 0, receipts: 0 });
  assert.equal((await execute(owner, c)).revision, 1);
});
test("RLS: owner/member/viewer can read; outsiders cannot read any private tournament row", async () => {
  const owner = await actor(),
    member = await actor(),
    viewer = await actor(),
    outside = await actor(),
    t = fixture(),
    id = await seed(pool, owner.userId, t);
  for (const user of [member, viewer]) {
    await pool.query("insert into auth.users(id) values($1)", [user.userId]);
    await pool.query(
      "insert into public.profiles(user_id,nickname) values($1,'Membro') on conflict do nothing",
      [user.userId],
    );
    await pool.query(
      "insert into public.tournament_members(tournament_id,user_id,role) values($1,$2,$3)",
      [id, user.userId, user === member ? "participant" : "viewer"],
    );
  }
  for (const user of [owner, member, viewer, outside]) {
    await asClient(pool, user.userId, async (c) => {
      for (const table of [
        "tournaments",
        "tournament_members",
        "participants",
        "rounds",
        "matches",
      ]) {
        const { rows } = await c.query(
          `select * from public.${table} where ${table === "tournaments" ? "id" : "tournament_id"}=$1`,
          [id],
        );
        assert.equal(rows.length > 0, user !== outside, table);
      }
    });
    if (user !== owner)
      await assert.rejects(
        execute(user, command(id, t.matches[0].id)),
        code("FORBIDDEN"),
      );
    for (const sql of [
      "update public.matches set score1=9 where tournament_id=$1",
      "update public.tournaments set owner_user_id=gen_random_uuid() where id=$1",
      "delete from public.participants where tournament_id=$1",
      "update public.rounds set status='completed' where tournament_id=$1",
      "delete from public.tournament_members where tournament_id=$1",
      "insert into matchmaking_private.command_receipts(tournament_id) values($1)",
    ])
      await assert.rejects(
        asClient(pool, user.userId, async (c) => {
          await c.query(sql, [id]);
        }),
        (e) => (e as { code: string }).code === "42501",
      );
  }
  assert.deepEqual(await counts(id), { revision: 0, events: 0, receipts: 0 });
});
test("database constraints forbid crossed tournament references, unsafe scores and invalid revisions", async () => {
  const owner = await actor(),
    t = fixture(),
    other = fixture(),
    id = await seed(pool, owner.userId, t);
  await seed(pool, owner.userId, other);
  for (const [sql, values, expected] of [
    [
      "update public.matches set participant1_id=$2 where tournament_id=$1 and round_index=0",
      [id, other.participants[0].id],
      "23503",
    ],
    [
      "update public.matches set next_match_id=$2 where tournament_id=$1 and round_index=0",
      [id, other.matches.at(-1)!.id],
      "23503",
    ],
    ["update public.tournaments set revision=-1 where id=$1", [id], "23514"],
    ["update public.tournaments set capacity=5 where id=$1", [id], "23514"],
    [
      "update public.matches set score1=-1 where tournament_id=$1",
      [id],
      "23514",
    ],
    [
      "update public.matches set score1=9007199254740992 where tournament_id=$1",
      [id],
      "23514",
    ],
  ] as const)
    await assert.rejects(
      pool.query(sql, [...values]),
      (e) => (e as { code: string }).code === expected,
    );
  assert.deepEqual(plain(await read(pool, id)), plain(t));
});

test("Auth insertion provisions a neutral profile and self nickname updates normalize whitespace with server timestamps", async () => {
  const userId = randomUUID();
  await pool.query("insert into auth.users(id) values($1)", [userId]);
  const original = (
    await pool.query("select * from public.profiles where user_id=$1", [userId])
  ).rows[0];
  assert.equal(original.nickname, "Competidor");
  assert.ok(original.created_at instanceof Date);
  assert.ok(original.updated_at instanceof Date);
  await asClient(pool, userId, async (client) => {
    const { rows } = await client.query(
      "update public.profiles set nickname=$2 where user_id=$1 returning *",
      [userId, "  Vitória\u00a0\u2009  Silva  "],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].nickname, "Vitória Silva");
    assert.equal(rows[0].user_id, userId);
    assert.equal(
      rows[0].created_at.toISOString(),
      original.created_at.toISOString(),
    );
    assert.ok(rows[0].updated_at.getTime() >= original.updated_at.getTime());
  });
});

test("profile RLS and column grants prevent reading or editing another account and all protected fields", async () => {
  const owner = randomUUID(),
    other = randomUUID();
  await pool.query("insert into auth.users(id) values($1),($2)", [
    owner,
    other,
  ]);
  await asClient(pool, other, async (client) => {
    assert.equal(
      (
        await client.query("select * from public.profiles where user_id=$1", [
          owner,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await client.query(
          "update public.profiles set nickname='Intruso' where user_id=$1",
          [owner],
        )
      ).rowCount,
      0,
    );
    const own = await client.query("select user_id from public.profiles");
    assert.deepEqual(own.rows, [{ user_id: other }]);
  });
  for (const sql of [
    "update public.profiles set user_id=gen_random_uuid() where user_id=$1",
    "update public.profiles set created_at=now() where user_id=$1",
    "update public.profiles set updated_at=now() where user_id=$1",
    "insert into public.profiles(user_id,nickname) values($1,'Intruso')",
    "delete from public.profiles where user_id=$1",
    "select matchmaking_private.create_auth_profile()",
    "select matchmaking_private.validate_profile_write()",
  ]) {
    await assert.rejects(
      asClient(pool, owner, async (client) => {
        await client.query(sql, sql.includes("$1") ? [owner] : []);
      }),
      (error) => (error as { code: string }).code === "42501",
      sql,
    );
  }
  const unchanged = await pool.query(
    "select nickname from public.profiles where user_id=$1",
    [owner],
  );
  assert.equal(unchanged.rows[0].nickname, "Competidor");
});

test("profile validation rejects controls and invisible direction changes while preserving Unicode and codepoint limits", async () => {
  const userId = randomUUID();
  await pool.query("insert into auth.users(id) values($1)", [userId]);
  const forbidden = [
    "\u0001",
    "\t",
    "\n",
    "\r",
    "\u001f",
    "\u007f",
    "\u0085",
    "\u009f",
    "\u00ad",
    "\u200b",
    "\u200c",
    "\u200d",
    "\u200e",
    "\u200f",
    "\u202a",
    "\u202e",
    "\u2060",
    "\u2066",
    "\u2069",
    "\u206f",
    "\ufeff",
  ];
  for (const nickname of [
    "",
    "   ",
    "A",
    "A".repeat(41),
    ...forbidden.map((c) => `Jo${c}ão`),
  ]) {
    await assert.rejects(
      asClient(pool, userId, async (client) => {
        await client.query(
          "update public.profiles set nickname=$2 where user_id=$1",
          [userId, nickname],
        );
      }),
      (error) => (error as { code: string }).code === "23514",
    );
  }
  for (const nickname of ["João", "李明", "⚽️ Campeão", "😀".repeat(40)]) {
    await asClient(pool, userId, async (client) => {
      const result = await client.query(
        "update public.profiles set nickname=$2 where user_id=$1 returning nickname",
        [userId, nickname],
      );
      assert.equal(result.rows[0].nickname, nickname);
    });
  }
});
