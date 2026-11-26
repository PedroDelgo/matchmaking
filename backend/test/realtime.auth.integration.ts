import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  createClient,
  type RealtimeChannel,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { Pool } from "pg";
import type { Tournament } from "../../src/features/tournaments/domain/types";

// This proof intentionally uses the existing local Auth/PostgreSQL/Realtime.
// No credentials or capability-bearing responses enter logs or assertion diffs.
const authUrl = "http://127.0.0.1:54321";
const publicKey = process.env.MATCHMAKING_AUTH_PUBLIC_KEY;
const serviceKey = process.env.MATCHMAKING_AUTH_SERVICE_KEY;
const databaseUrl = process.env.MATCHMAKING_TEST_DATABASE_URL;
if (!publicKey || !serviceKey || !databaseUrl)
  throw new Error(
    "Run the Realtime proof with the project's local Auth runner",
  );
const target = new URL(databaseUrl);
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.port !== "54322" ||
  target.pathname !== "/postgres" ||
  target.search ||
  target.hash
)
  throw new Error(
    "The Realtime proof accepts only the existing local database",
  );

type Signal = {
  tournament_id: string;
  sequence: number;
  signal_version: 1;
  category: "competitive" | "access" | "access_revoked";
  revision: number | null;
  recipient_user_id: string | null;
  created_at: string;
};
type Identity = { sdk: SupabaseClient; session: Session };
type Watched = {
  channel: RealtimeChannel;
  signals: Signal[];
  states: string[];
  invalid: string[];
  system: { extension: string; status: string; message: string }[];
};
type Json = Record<string, unknown>;

async function until(
  check: () => boolean | Promise<boolean>,
  label: string,
  ms = 10000,
) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(40);
  }
  assert.fail(`Timed out: ${label}`);
}

test(
  "real authenticated Realtime signals reconcile confirmed tournament changes",
  { timeout: 240000 },
  async (context) => {
    const run = randomUUID();
    const users = new Set<string>();
    const clients: SupabaseClient[] = [];
    const watchers: Watched[] = [];
    const operator = new Pool({
      connectionString: databaseUrl,
      max: 4,
      connectionTimeoutMillis: 5000,
    });
    const admin = createClient(authUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = `mm_5e_role_${randomBytes(12).toString("hex")}`;
    const password = randomBytes(32).toString("base64url");
    const pepper = randomBytes(32).toString("base64url");
    let roleCreated = false;
    let child: ChildProcess | undefined;
    let origin = "";
    let tournamentId = "";
    let owner!: Identity;
    let player!: Identity,
      viewer!: Identity,
      guest!: Identity,
      outsider!: Identity;
    let ownerWatch!: Watched,
      playerWatch!: Watched,
      viewerWatch!: Watched,
      guestWatch!: Watched;
    let outsiderWatch!: Watched;

    async function registered(name: string): Promise<Identity> {
      const email = `mm-realtime-${run}-${name}@example.test`;
      const secret = `Realtime!${randomUUID()}`;
      const created = await admin.auth.admin.createUser({
        email,
        password: secret,
        email_confirm: true,
      });
      assert.ok(
        !created.error && created.data.user,
        "Could not create exact Realtime proof account",
      );
      users.add(created.data.user.id);
      const sdk = createClient(authUrl, publicKey!, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      clients.push(sdk);
      const signed = await sdk.auth.signInWithPassword({
        email,
        password: secret,
      });
      assert.ok(
        !signed.error && signed.data.session,
        "Real Realtime proof login failed",
      );
      await sdk.realtime.setAuth(signed.data.session.access_token);
      return { sdk, session: signed.data.session };
    }
    async function request(path: string, identity = owner, body?: unknown) {
      const response = await fetch(`${origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${identity.session.access_token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(
        response.status,
        200,
        "Unexpected Realtime proof HTTP status",
      );
      return (await response.json()) as Json;
    }
    async function snapshot(identity = owner, id = tournamentId) {
      const value = await request(`/tournaments/${id}`, identity);
      return value as {
        tournament: Tournament;
        revision: number;
        syncSequence: number;
      };
    }
    async function command(type: string, payload: unknown) {
      const current = await snapshot();
      return request("/commands", owner, {
        commandId: randomUUID(),
        commandVersion: 1,
        tournamentId,
        expectedRevision: current.revision,
        type,
        payload,
      });
    }
    async function issued(role: "participant" | "viewer") {
      const value = await request("/invites", owner, {
        commandId: randomUUID(),
        commandVersion: 1,
        tournamentId,
        type: "create_invite",
        payload: { role, expiresInHours: 24, maxUses: 16 },
      });
      assert.ok(
        typeof value.code === "string",
        "Fresh invitation missing its credential",
      );
      return value.code;
    }
    async function watch(
      identity: Identity,
      id = tournamentId,
      privateTopic = true,
    ) {
      const watched: Watched = {
        channel: undefined as unknown as RealtimeChannel,
        signals: [],
        states: [],
        invalid: [],
        system: [],
      };
      const allowed = [
        "tournament_id",
        "sequence",
        "signal_version",
        "category",
        "revision",
        "recipient_user_id",
        "created_at",
      ];
      watched.channel = identity.sdk
        .channel(`tournament:${id}`, {
          config: {
            private: privateTopic,
            postgres_changes_options: { wait: true },
          },
        })
        .on("system", {}, (message) => {
          watched.system.push({
            extension: message.extension,
            status: message.status,
            message: message.message,
          });
        })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tournament_signals",
            filter: `tournament_id=eq.${id}`,
          },
          (payload) => {
            const value = payload.new as Record<string, unknown>;
            if (
              Object.keys(value).some((key) => !allowed.includes(key)) ||
              value.tournament_id !== id ||
              value.signal_version !== 1 ||
              !Number.isSafeInteger(value.sequence) ||
              Number(value.sequence) < 1 ||
              !["competitive", "access", "access_revoked"].includes(
                String(value.category),
              ) ||
              !(
                value.revision === null || Number.isSafeInteger(value.revision)
              ) ||
              !(
                value.recipient_user_id === null ||
                typeof value.recipient_user_id === "string"
              ) ||
              typeof value.created_at !== "string"
            )
              watched.invalid.push("Invalid or excessive signal payload");
            else watched.signals.push(value as Signal);
          },
        )
        .subscribe((status) => watched.states.push(status));
      watchers.push(watched);
      return watched;
    }
    try {
      await context.test(
        "real ES256 Auth joins a private WebSocket and receives a committed RLS-authorized signal",
        async () => {
          owner = await registered("owner");
          assert.equal(
            decodeProtectedHeader(owner.session.access_token).alg,
            "ES256",
          );
          assert.equal(
            decodeJwt(owner.session.access_token).sub,
            owner.session.user.id,
          );
          await operator.query(
            `create role ${login} login noinherit nosuperuser nobypassrls password '${password}'`,
          );
          roleCreated = true;
          await operator.query(
            `grant matchmaking_command to ${login} with admin false, inherit false, set true`,
          );
          const serviceUrl = new URL(databaseUrl!);
          serviceUrl.username = login;
          serviceUrl.password = password;
          child = spawn(process.execPath, ["backend/dist/server.mjs"], {
            env: {
              ...process.env,
              DATABASE_URL: serviceUrl.toString(),
              SUPABASE_AUTH_URL: `${authUrl}/auth/v1`,
              PORT: "0",
              MATCHMAKING_DEV_HOST: "127.0.0.1",
              MATCHMAKING_INVITE_PEPPER: pepper,
              MATCHMAKING_INVITE_BASE_URL: "http://127.0.0.1:8081",
            },
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          });
          const server = child;
          origin = await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(
              () =>
                reject(new Error("Realtime proof HTTP server did not start")),
              10000,
            );
            const fail = () => {
              clearTimeout(timer);
              reject(new Error("Realtime proof HTTP server unavailable"));
            };
            server.once("error", fail);
            server.once("exit", fail);
            server.stdout!.on("data", (data) => {
              const found = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
              if (found) {
                clearTimeout(timer);
                resolve(found[0]);
              }
            });
            server.stderr!.resume();
          });
          const created = await request("/tournaments", owner, {
            commandId: randomUUID(),
            commandVersion: 1,
            type: "create_tournament",
            payload: {
              name: "Realtime proof",
              modality: "Truco",
              capacity: 4,
              format: "single_elimination",
            },
          });
          assert.equal(typeof created.tournamentId, "string");
          tournamentId = created.tournamentId as string;
          const observed = await watch(owner);
          ownerWatch = observed;
          await until(
            () => observed.states.includes("SUBSCRIBED"),
            "ES256 private subscription acknowledgement",
          );
          const current = await request(`/tournaments/${tournamentId}`);
          await request("/commands", owner, {
            commandId: randomUUID(),
            commandVersion: 1,
            tournamentId,
            expectedRevision: current.revision,
            type: "add_participant",
            payload: { displayName: "Confirmed player" },
          });
          await until(
            () =>
              observed.signals.some(
                (signal) => signal.category === "competitive",
              ),
            "committed competitive signal over real WebSocket",
          );
          assert.deepEqual(observed.invalid, []);
          const detail = await request(`/tournaments/${tournamentId}`);
          assert.ok(
            Number.isSafeInteger(detail.syncSequence),
            "Snapshot must expose a safe reconciliation sequence",
          );
        },
      );
      await context.test(
        "independent registered and anonymous members receive authorized signals while an outsider cannot join or read",
        async () => {
          player = await registered("player");
          viewer = await registered("viewer");
          outsider = await registered("outsider");
          const sdk = createClient(authUrl, publicKey!, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          });
          clients.push(sdk);
          const anonymous = await sdk.auth.signInAnonymously();
          assert.ok(
            !anonymous.error &&
              anonymous.data.session &&
              anonymous.data.user?.is_anonymous,
            "Real anonymous Auth login failed",
          );
          users.add(anonymous.data.session.user.id);
          guest = { sdk, session: anonymous.data.session };
          await sdk.realtime.setAuth(guest.session.access_token);
          assert.equal(
            decodeJwt(guest.session.access_token).is_anonymous,
            true,
          );
          const participantCode = await issued("participant"),
            viewerCode = await issued("viewer");
          for (const [identity, code, name] of [
            [player, participantCode, "Registered player"],
            [guest, participantCode, "Anonymous player"],
            [viewer, viewerCode, undefined],
          ] as const)
            await request("/invite-acceptances", identity, {
              commandId: randomUUID(),
              commandVersion: 1,
              credential: { kind: "code", value: code },
              ...(name ? { displayName: name } : {}),
            });
          playerWatch = await watch(player);
          viewerWatch = await watch(viewer);
          guestWatch = await watch(guest);
          for (const w of [playerWatch, viewerWatch, guestWatch])
            await until(
              () => w.states.includes("SUBSCRIBED"),
              "independent member subscription acknowledgement",
            );
          const forbiddenJoin = await watch(outsider);
          await until(
            () =>
              forbiddenJoin.states.includes("CHANNEL_ERROR") ||
              forbiddenJoin.states.includes("SUBSCRIBED"),
            "outsider private subscription decision",
          );
          assert.ok(
            forbiddenJoin.states.includes("CHANNEL_ERROR"),
            "An outsider joined the authorized private tournament topic",
          );
          await outsider.sdk.removeChannel(forbiddenJoin.channel);
          const read = await outsider.sdk
            .from("tournament_signals")
            .select("sequence")
            .eq("tournament_id", tournamentId);
          assert.ok(
            !read.error && read.data?.length === 0,
            "Signal RLS exposed tournament metadata to an outsider",
          );
          const write = await outsider.sdk.from("tournament_signals").insert({
            tournament_id: tournamentId,
            sequence: 999,
            category: "access",
            signal_version: 1,
          });
          assert.ok(write.error, "A client inserted a trusted signal");
          // A malicious client bypassing private-topic negotiation still faces row RLS.
          outsiderWatch = await watch(outsider, tournamentId, false);
          await until(
            () => outsiderWatch.states.includes("SUBSCRIBED"),
            "public-transport RLS adversarial subscription acknowledgement",
          );
          await command("add_participant", { displayName: "Fourth player" });
          const head = (await snapshot()).syncSequence;
          for (const w of [ownerWatch, playerWatch, viewerWatch, guestWatch])
            await until(
              () => w.signals.some((s) => s.sequence === head),
              "authorized independent subscriber delivery",
            );
          assert.equal(
            outsiderWatch.signals.length,
            0,
            "An outsider received a private signal through public transport",
          );
        },
      );
      await context.test(
        "a transaction emits only after COMMIT and ROLLBACK changes neither feed nor durable watermark",
        async () => {
          const before = await snapshot();
          const client = await operator.connect();
          try {
            await client.query("begin");
            // Administrative minimal access marker exercises the exact production
            // emitter inside a held transaction; competitive trigger delivery was
            // independently proved through the restricted HTTP command above.
            await client.query(
              "select matchmaking_private.emit_tournament_signal($1,'access')",
              [tournamentId],
            );
            await delay(300);
            assert.ok(
              !ownerWatch.signals.some((s) => s.sequence > before.syncSequence),
              "A transaction leaked a signal before COMMIT",
            );
            assert.equal((await snapshot()).syncSequence, before.syncSequence);
            await client.query("commit");
            await until(
              () =>
                ownerWatch.signals.some(
                  (s) => s.sequence === before.syncSequence + 1,
                ),
              "held transaction signal after COMMIT",
            );
            const committed = await snapshot();
            assert.equal(
              committed.revision,
              before.revision,
              "Access signals changed competitive revision",
            );
            await client.query("begin");
            await client.query(
              "select matchmaking_private.emit_tournament_signal($1,'access')",
              [tournamentId],
            );
            await client.query("rollback");
            await delay(300);
            assert.equal(
              (await snapshot()).syncSequence,
              committed.syncSequence,
            );
            assert.ok(
              !ownerWatch.signals.some(
                (s) => s.sequence > committed.syncSequence,
              ),
              "A rolled-back transaction emitted a signal",
            );
          } finally {
            await client.query("rollback");
            client.release();
          }
        },
      );
      await context.test(
        "INSERT-only retention does not leak DELETE or wildcard events to an external WebSocket subscriber",
        async () => {
          const created = await request("/tournaments", owner, {
            commandId: randomUUID(),
            commandVersion: 1,
            type: "create_tournament",
            payload: {
              name: "Isolated retention proof",
              modality: "Truco",
              capacity: 4,
              format: "single_elimination",
            },
          });
          const id = created.tournamentId as string;
          const types: string[] = [],
            unauthorizedTypes: string[] = [];
          let acknowledged = false,
            unauthorizedAcknowledged = false;
          let receivedHead = 0;
          owner.sdk
            .channel(`tournament:${id}`, {
              config: {
                private: true,
                postgres_changes_options: { wait: true },
              },
            })
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "tournament_signals",
                filter: `tournament_id=eq.${id}`,
              },
              (payload) => {
                types.push(payload.eventType);
                if (payload.eventType === "INSERT")
                  receivedHead = Math.max(
                    receivedHead,
                    Number(payload.new.sequence),
                  );
              },
            )
            .subscribe((value) => {
              if (value === "SUBSCRIBED") acknowledged = true;
            });
          // Arbitrary public topic and wildcard table listener deliberately
          // model a hostile client rather than our private-channel adapter.
          outsider.sdk
            .channel(`untrusted:${randomUUID()}`, {
              config: {
                private: false,
                postgres_changes_options: { wait: true },
              },
            })
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "tournament_signals" },
              (payload) => unauthorizedTypes.push(payload.eventType),
            )
            .subscribe((value) => {
              if (value === "SUBSCRIBED") unauthorizedAcknowledged = true;
            });
          await until(
            () => acknowledged && unauthorizedAcknowledged,
            "authorized and malicious wildcard subscription acknowledgement",
          );
          const unrelatedBefore = ownerWatch.signals.length;
          await operator.query(
            "select matchmaking_private.emit_tournament_signal($1,'access') from generate_series(1,260)",
            [id],
          );
          const head = (await snapshot(owner, id)).syncSequence;
          await until(
            () => receivedHead === head,
            "last signal after actual feed retention pruning",
            15000,
          );
          await delay(250);
          const retained = await operator.query(
            "select count(*)::int as rows from public.tournament_signals where tournament_id=$1",
            [id],
          );
          assert.equal(retained.rows[0].rows, 256);
          // Postgres Changes rechecks rows under RLS. INSERTs already pruned in
          // the same commit need not be delivered; the final durable watermark
          // above is the reconciliation barrier, never a promised event count.
          assert.ok(
            types.length > 0,
            "No authorized retention marker was delivered",
          );
          assert.ok(
            types.every((type) => type === "INSERT"),
            "Retention published DELETE/UPDATE metadata over the wildcard subscription",
          );
          assert.equal(
            unauthorizedTypes.length,
            0,
            "A wildcard external listener received private signal or retention metadata",
          );
          assert.equal(
            ownerWatch.signals.length,
            unrelatedBefore,
            "An isolated tournament affected a different tournament's filtered subscription",
          );
        },
      );
      await context.test(
        "draw, results, champion and final corrections converge; idempotent replay emits no duplicate signal",
        async () => {
          await command("draw_bracket", {});
          let current = await snapshot();
          const drawn = current.tournament.drawOrder.join(",");
          for (const identity of [player, viewer, guest])
            assert.equal(
              (await snapshot(identity)).tournament.drawOrder.join(","),
              drawn,
            );
          for (const match of current.tournament.matches) {
            await command("record_result", {
              matchId: match.id,
              score1: 3,
              score2: 1,
            });
            current = await snapshot();
            for (const w of [playerWatch, viewerWatch, guestWatch])
              await until(
                () =>
                  w.signals.some((s) => s.sequence === current.syncSequence),
                "confirmed result signal across members",
              );
          }
          assert.equal(current.tournament.status, "completed");
          const final = current.tournament.matches.find(
            (m) => m.nextMatchId === null,
          )!;
          const correction = {
            commandId: randomUUID(),
            commandVersion: 1,
            tournamentId,
            expectedRevision: current.revision,
            type: "correct_result",
            payload: { matchId: final.id, score1: 1, score2: 7 },
          };
          const previousChampion = current.tournament.championId;
          await request("/commands", owner, correction);
          const corrected = await snapshot();
          assert.ok(
            corrected.tournament.championId &&
              corrected.tournament.championId !== previousChampion,
          );
          for (const w of [ownerWatch, playerWatch, viewerWatch, guestWatch])
            await until(
              () =>
                w.signals.some((s) => s.sequence === corrected.syncSequence),
              "corrected champion signal",
            );
          for (const identity of [player, viewer, guest])
            assert.equal(
              (await snapshot(identity)).tournament.championId,
              corrected.tournament.championId,
            );
          const beforeReplay = ownerWatch.signals.length;
          await request("/commands", owner, correction);
          await delay(250);
          assert.equal((await snapshot()).syncSequence, corrected.syncSequence);
          assert.equal(
            ownerWatch.signals.length,
            beforeReplay,
            "Replay emitted another competitive signal",
          );
          const first = corrected.tournament.matches[0];
          await command("correct_result", {
            matchId: first.id,
            score1: 1,
            score2: 5,
          });
          const invalidated = await snapshot();
          assert.equal(invalidated.tournament.status, "active");
          assert.equal(invalidated.tournament.championId, undefined);
          assert.equal(
            invalidated.tournament.matches.find((m) => m.id === final.id)
              ?.winnerId,
            null,
          );
        },
      );
      await context.test(
        "removing an already-connected member sends its own invalidation and blocks future tournament signals and reads",
        async () => {
          await request("/members/remove", owner, {
            commandId: randomUUID(),
            commandVersion: 1,
            tournamentId,
            type: "remove_member",
            payload: { userId: viewer.session.user.id },
          });
          await until(
            () =>
              viewerWatch.signals.some(
                (s) =>
                  s.category === "access_revoked" &&
                  s.recipient_user_id === viewer.session.user.id,
              ),
            "targeted revocation after membership removal",
          );
          const denied = await fetch(`${origin}/tournaments/${tournamentId}`, {
            headers: { Authorization: `Bearer ${viewer.session.access_token}` },
            signal: AbortSignal.timeout(10000),
          });
          assert.equal(denied.status, 403);
          const revokedHead = (await snapshot()).syncSequence;
          await until(
            () => ownerWatch.signals.some((s) => s.sequence === revokedHead),
            "owner membership update",
          );
          for (const w of [ownerWatch, playerWatch, guestWatch])
            assert.ok(
              !w.signals.some((s) => s.category === "access_revoked"),
              "A user received another identity's targeted invalidation",
            );
          const current = await snapshot(),
            match = current.tournament.matches.find(
              (m) => m.status === "ready",
            )!;
          await command("record_result", {
            matchId: match.id,
            score1: 4,
            score2: 2,
          });
          const nextHead = (await snapshot()).syncSequence;
          await until(
            () => ownerWatch.signals.some((s) => s.sequence === nextHead),
            "post-removal competitive signal for organizer",
          );
          await delay(200);
          assert.ok(
            !viewerWatch.signals.some((s) => s.sequence > revokedHead),
            "A removed member received subsequent tournament signals",
          );
          assert.equal(outsiderWatch.signals.length, 0);
          await viewer.sdk.removeChannel(viewerWatch.channel);
          const freshDenied = await watch(viewer);
          await until(
            () =>
              freshDenied.states.includes("CHANNEL_ERROR") ||
              freshDenied.states.includes("SUBSCRIBED"),
            "removed member private rejoin decision",
          );
          assert.ok(
            freshDenied.states.includes("CHANNEL_ERROR"),
            "A removed member rejoined a private channel",
          );
        },
      );
      await context.test(
        "closed channels stay closed and a new subscription reconciles updates missed while disconnected",
        async () => {
          await guest.sdk.removeChannel(guestWatch.channel);
          await guest.sdk.realtime.disconnect();
          const before = guestWatch.signals.length;
          const client = await operator.connect();
          try {
            await client.query(
              "select matchmaking_private.emit_tournament_signal($1,'access')",
              [tournamentId],
            );
          } finally {
            client.release();
          }
          const latest = await snapshot();
          await until(
            () =>
              ownerWatch.signals.some(
                (s) => s.sequence === latest.syncSequence,
              ),
            "change during disconnected subscriber",
          );
          assert.equal(
            guestWatch.signals.length,
            before,
            "An unsubscribed channel received another event",
          );
          guestWatch = await watch(guest);
          await until(
            () => guestWatch.states.includes("SUBSCRIBED"),
            "reconnected anonymous subscription",
          );
          const reconciled = await snapshot(guest);
          assert.equal(reconciled.syncSequence, latest.syncSequence);
          assert.equal(
            reconciled.tournament.drawOrder.join(","),
            latest.tournament.drawOrder.join(","),
          );
          const refreshed = await player.sdk.auth.refreshSession();
          assert.ok(
            !refreshed.error && refreshed.data.session,
            "Real member token refresh failed",
          );
          player.session = refreshed.data.session;
          await player.sdk.realtime.setAuth(player.session.access_token);
          await operator.query(
            "select matchmaking_private.emit_tournament_signal($1,'access')",
            [tournamentId],
          );
          const head = (await snapshot()).syncSequence;
          await until(
            () => playerWatch.signals.some((s) => s.sequence === head),
            "signal after real refreshed JWT",
          );
          await until(
            () => guestWatch.signals.some((s) => s.sequence === head),
            "signal after anonymous resubscription",
          );
        },
      );
      await context.test(
        "isolated Realtime service failure closes sockets and a fresh subscription reconciles durable state",
        async () => {
          assert.equal(
            process.env.MATCHMAKING_TEST_REALTIME_RESTART,
            "1",
            "Set MATCHMAKING_TEST_REALTIME_RESTART=1 to authorize the required isolated local service restart proof",
          );
          const container = "supabase_realtime_matchmaking";
          const docker = (args: string[]) => {
            const result = spawnSync("docker", args, {
              encoding: "utf8",
              windowsHide: true,
              timeout: 30000,
            });
            assert.ok(
              !result.error && result.status === 0,
              "The exact local Realtime container command failed",
            );
            return result.stdout.trim();
          };
          const inspected = JSON.parse(
            docker(["inspect", "--format", "{{json .Name}}", container]),
          );
          assert.equal(
            inspected,
            `/${container}`,
            "Refusing to restart a different container",
          );
          const stateStart = ownerWatch.states.length;
          let stopped = false;
          try {
            stopped = true;
            docker(["stop", "--time", "5", container]);
            await until(
              () =>
                ownerWatch.states
                  .slice(stateStart)
                  .some((s) =>
                    ["CLOSED", "CHANNEL_ERROR", "TIMED_OUT"].includes(s),
                  ),
              "real service failure channel status",
            );
            await operator.query(
              "select matchmaking_private.emit_tournament_signal($1,'access')",
              [tournamentId],
            );
            const persisted = await snapshot();
            docker(["start", container]);
            stopped = false;
            await until(
              () =>
                docker([
                  "inspect",
                  "--format",
                  "{{.State.Health.Status}}",
                  container,
                ]) === "healthy",
              "isolated Realtime service recovery",
              30000,
            );
            await owner.sdk.removeChannel(ownerWatch.channel);
            ownerWatch = await watch(owner);
            await until(
              () => ownerWatch.states.includes("SUBSCRIBED"),
              "private subscription after service restart",
              20000,
            );
            assert.equal(
              (await snapshot()).syncSequence,
              persisted.syncSequence,
            );
            await operator.query(
              "select matchmaking_private.emit_tournament_signal($1,'access')",
              [tournamentId],
            );
            const head = (await snapshot()).syncSequence;
            await until(
              () => ownerWatch.signals.some((s) => s.sequence === head),
              "new signal after actual service restart",
            );
          } finally {
            if (stopped) docker(["start", container]);
          }
          for (const w of watchers) assert.deepEqual(w.invalid, []);
        },
      );
    } finally {
      for (const sdk of clients) {
        await sdk.removeAllChannels();
        await sdk.realtime.disconnect();
        await sdk.auth.dispose();
      }
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = new Promise<void>((resolve) =>
          child!.once("exit", () => resolve()),
        );
        child.kill();
        await exited;
      }
      try {
        if (owner) {
          const roots = (
            await operator.query(
              "select id from public.tournaments where owner_user_id=$1",
              [owner.session.user.id],
            )
          ).rows;
          for (const root of roots) {
            for (const table of [
              "tournament_imports",
              "operation_receipts",
              "participant_ids",
              "command_receipts",
              "tournament_events",
            ])
              await operator.query(
                `delete from matchmaking_private.${table} where tournament_id=$1`,
                [root.id],
              );
            await operator.query("delete from public.tournaments where id=$1", [
              root.id,
            ]);
          }
        }
        for (const id of users) {
          await operator.query("delete from public.profiles where user_id=$1", [
            id,
          ]);
          const deleted = await admin.auth.admin.deleteUser(id);
          assert.ok(
            !deleted.error,
            "Exact Realtime proof account cleanup failed",
          );
        }
        const buckets = [
          createHmac("sha256", pepper)
            .update("invite-ip-v1:127.0.0.1")
            .digest("hex"),
          ...[...users].map((id) =>
            createHmac("sha256", pepper)
              .update(`invite-actor-v1:${id}`)
              .digest("hex"),
          ),
        ];
        await operator.query(
          "delete from matchmaking_private.invite_rate_limits where bucket=any($1::text[])",
          [buckets],
        );
        if (roleCreated) await operator.query(`drop role ${login}`);
      } finally {
        await admin.auth.dispose();
        await operator.end();
      }
    }
  },
);
