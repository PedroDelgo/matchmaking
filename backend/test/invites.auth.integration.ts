import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { Pool } from "pg";
import { createAuthenticator } from "../src/auth";
import { fixture } from "./fixtures";

// This proof uses the real local Auth, JWKS, compiled HTTP server and PostgREST.
// Credentials stay in process memory and are never included in assertion diffs.
const authApi = "http://127.0.0.1:54321";
const issuer = `${authApi}/auth/v1`;
const publicKey = process.env.MATCHMAKING_AUTH_PUBLIC_KEY;
const serviceKey = process.env.MATCHMAKING_AUTH_SERVICE_KEY;
const databaseUrl = process.env.MATCHMAKING_TEST_DATABASE_URL;
if (!publicKey || !serviceKey || !databaseUrl)
  throw new Error(
    "The invitation Auth proof requires local Auth keys and a local test database URL",
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
    "The invitation Auth proof refuses remote databases and connection overrides",
  );

type Json = Record<string, unknown>;
type Invite = { id: string; token: string; code: string };
function succeeds(error: { code?: string } | null, operation: string) {
  assert.ok(!error, `${operation} failed (${error?.code ?? "transport"})`);
}
async function payload(
  response: Response,
  expected: number,
  operation: string,
) {
  assert.equal(
    response.status,
    expected,
    `${operation}: unexpected HTTP status`,
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  return (await response.json()) as Json;
}

test(
  "real anonymous Auth admits explicit invite members without granting organizer authority",
  { timeout: 180_000 },
  async (context) => {
    const run = randomUUID();
    const users = new Set<string>();
    const clients: SupabaseClient[] = [];
    const operator = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 5000,
    });
    const admin = createClient(authApi, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const pepper = randomBytes(32).toString("base64url");
    const bucket = (purpose: string, value: string) =>
      createHmac("sha256", pepper).update(`${purpose}:${value}`).digest("hex");
    const login = `mm_5d_role_${randomBytes(12).toString("hex")}`;
    const password = randomBytes(32).toString("base64url");
    let roleCreated = false;
    let child: ChildProcess | undefined;
    let origin = "";
    let tournamentId = "";
    let owner!: Session,
      player!: Session,
      viewer!: Session,
      guest!: Session,
      outsider!: Session;
    let ownerSdk!: SupabaseClient,
      guestSdk!: SupabaseClient,
      outsiderSdk!: SupabaseClient;
    let participantInvite!: Invite, viewerInvite!: Invite;
    let guestParticipantId = "";
    const acceptanceId = randomUUID();
    const guestStorage = new Map<string, string>();
    function sdk(name: string, storage = new Map<string, string>()) {
      const client = createClient(authApi, publicKey!, {
        auth: {
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `mm-5d-proof-${run}-${name}`,
          storage: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => {
              storage.set(key, value);
            },
            removeItem: (key) => {
              storage.delete(key);
            },
          },
        },
      });
      clients.push(client);
      return client;
    }
    async function registered(name: string) {
      const email = `mm-5d-${run}-${name}@example.test`;
      const secret = `Mm!5D-${randomUUID()}`;
      const created = await admin.auth.admin.createUser({
        email,
        password: secret,
        email_confirm: true,
      });
      succeeds(created.error, "Create proof account");
      assert.ok(created.data.user?.id, "The proof account was not created");
      users.add(created.data.user.id);
      const client = sdk(name);
      const signedIn = await client.auth.signInWithPassword({
        email,
        password: secret,
      });
      succeeds(signedIn.error, "Proof account login");
      assert.ok(signedIn.data.session, "The proof account has no session");
      return { client, session: signedIn.data.session };
    }
    async function anonymous(name: string, storage?: Map<string, string>) {
      const client = sdk(name, storage);
      const signedIn = await client.auth.signInAnonymously();
      succeeds(signedIn.error, "Anonymous Auth login");
      assert.ok(
        signedIn.data.session && signedIn.data.user?.is_anonymous,
        "Auth did not create an anonymous session",
      );
      users.add(signedIn.data.session.user.id);
      return { client, session: signedIn.data.session };
    }
    async function stopServer() {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = new Promise<void>((resolve) =>
          child!.once("exit", () => resolve()),
        );
        child.kill();
        await exited;
      }
      child = undefined;
    }
    async function startServer() {
      const serviceUrl = new URL(databaseUrl!);
      serviceUrl.username = login;
      serviceUrl.password = password;
      child = spawn(process.execPath, ["backend/dist/server.mjs"], {
        env: {
          ...process.env,
          DATABASE_URL: serviceUrl.toString(),
          SUPABASE_AUTH_URL: issuer,
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
        const timeout = setTimeout(
          () =>
            reject(new Error("The invitation HTTP proof server did not start")),
          5000,
        );
        server.once("error", () => {
          clearTimeout(timeout);
          reject(new Error("The invitation HTTP proof server could not start"));
        });
        server.once("exit", () => {
          clearTimeout(timeout);
          reject(new Error("The invitation HTTP proof server exited"));
        });
        server.stdout!.on("data", (data) => {
          const found = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
          if (found) {
            clearTimeout(timeout);
            resolve(found[0]);
          }
        });
        // A driver failure may contain a connection URL; never forward child diagnostics.
        server.stderr!.resume();
      });
    }
    function request(
      path: string,
      session?: Session,
      body?: unknown,
      headers: Record<string, string> = {},
    ) {
      return fetch(`${origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    }
    const management = (type: string, body: unknown) => ({
      commandId: randomUUID(),
      commandVersion: 1,
      tournamentId,
      type,
      payload: body,
    });
    async function issue(role: "participant" | "viewer") {
      const result = await payload(
        await request(
          "/invites",
          owner,
          management("create_invite", { role, expiresInHours: 24, maxUses: 4 }),
        ),
        200,
        "Issue invitation",
      );
      assert.ok(
        typeof result.shareUrl === "string" && typeof result.code === "string",
        "New invitation credentials are missing",
      );
      const token = new URLSearchParams(
        new URL(result.shareUrl).hash.slice(1),
      ).get("token");
      assert.ok(
        token && token.length === 43 && result.code.length === 8,
        "Unexpected invitation credential shape",
      );
      return {
        id: (result.invite as Json).id as string,
        token,
        code: result.code,
      };
    }
    async function counts() {
      const {
        rows: [row],
      } = await operator.query(
        `select revision,(select count(*)::int from public.participants where tournament_id=t.id) as players,
      (select count(*)::int from public.tournament_members where tournament_id=t.id) as members,
      (select coalesce(sum(use_count),0)::int from matchmaking_private.tournament_invites where tournament_id=t.id) as uses
      from public.tournaments t where id=$1`,
        [tournamentId],
      );
      return { ...row, revision: Number(row.revision) };
    }
    const guestAcceptance = () => ({
      commandId: acceptanceId,
      commandVersion: 1,
      credential: { kind: "token", value: participantInvite.token },
      displayName: "Mesmo nome",
    });
    try {
      await context.test(
        "real anonymous claims, JWKS verification, persisted restoration and refresh preserve guest identity",
        async () => {
          const a = await registered("owner");
          owner = a.session;
          ownerSdk = a.client;
          player = (await registered("player")).session;
          viewer = (await registered("viewer")).session;
          const g = await anonymous("guest", guestStorage);
          guest = g.session;
          guestSdk = g.client;
          const o = await anonymous("outside");
          outsider = o.session;
          outsiderSdk = o.client;
          const claims = decodeJwt(guest.access_token);
          assert.equal(decodeProtectedHeader(guest.access_token).alg, "ES256");
          assert.equal(claims.iss, issuer);
          assert.equal(claims.aud, "authenticated");
          assert.equal(claims.role, "authenticated");
          assert.equal(claims.sub, guest.user.id);
          assert.equal(claims.is_anonymous, true);
          const authenticate = createAuthenticator(issuer);
          const verified = await authenticate(`Bearer ${guest.access_token}`);
          assert.equal(verified.userId, guest.user.id);
          assert.equal(verified.isAnonymous, true);
          assert.equal(
            (await authenticate(`Bearer ${owner.access_token}`)).isAnonymous,
            false,
          );
          const restored = sdk("guest", guestStorage);
          const session = await restored.auth.getSession();
          succeeds(session.error, "Guest session restoration");
          assert.equal(session.data.session?.user.id, guest.user.id);
          assert.equal(
            (await restored.auth.getUser()).data.user?.is_anonymous,
            true,
          );
          const refreshed = await guestSdk.auth.refreshSession();
          succeeds(refreshed.error, "Guest session refresh");
          assert.ok(
            refreshed.data.session,
            "Guest refresh returned no session",
          );
          assert.ok(
            refreshed.data.session.refresh_token !== guest.refresh_token,
            "Guest refresh token did not rotate",
          );
          guest = refreshed.data.session;
          assert.equal(guest.user.id, verified.userId);
          assert.equal(decodeJwt(guest.access_token).is_anonymous, true);
          await operator.query(
            `create role ${login} login noinherit nosuperuser nobypassrls password '${password}'`,
          );
          roleCreated = true;
          await operator.query(
            `grant matchmaking_command to ${login} with admin false, inherit false, set true`,
          );
          await startServer();
          const created = await payload(
            await request("/tournaments", owner, {
              commandId: randomUUID(),
              commandVersion: 1,
              type: "create_tournament",
              payload: {
                name: "Copa de convidados",
                modality: "Truco",
                capacity: 4,
                format: "single_elimination",
              },
            }),
            200,
            "Create invitation proof tournament",
          );
          assert.ok(
            typeof created.tournamentId === "string",
            "The tournament ID is missing",
          );
          tournamentId = created.tournamentId;
          participantInvite = await issue("participant");
          viewerInvite = await issue("viewer");
        },
      );
      await context.test(
        "unauthenticated GET and code previews expose minimal information and consume no vacancy, membership or use",
        async () => {
          assert.ok(
            tournamentId && participantInvite,
            "Invitation setup failed",
          );
          const before = await counts();
          const preview = await payload(
            await request("/invite-preview", undefined, undefined, {
              "X-Invite-Token": participantInvite.token,
            }),
            200,
            "Public token preview",
          );
          assert.equal(preview.name, "Copa de convidados");
          assert.equal(preview.role, "participant");
          assert.equal(preview.availableSlots, 4);
          assert.ok(
            !("tournamentId" in preview) &&
              !("participants" in preview) &&
              !("matches" in preview),
            "Public preview exposed private aggregate fields",
          );
          const codePreview = await payload(
            await request("/invite-preview", undefined, {
              kind: "code",
              value: `${participantInvite.code.slice(0, 4).toLowerCase()}-${participantInvite.code.slice(4).toLowerCase()}`,
            }),
            200,
            "Public normalized code preview",
          );
          assert.equal(codePreview.name, preview.name);
          assert.equal(codePreview.availableSlots, preview.availableSlots);
          assert.deepEqual(await counts(), before);
          assert.equal(
            (await request(`/tournaments/${tournamentId}`)).status,
            401,
          );
          assert.equal(
            (await request(`/tournaments/${tournamentId}`, outsider)).status,
            403,
          );
          const noMember = await outsiderSdk
            .from("tournaments")
            .select("id")
            .eq("id", tournamentId);
          succeeds(noMember.error, "Outsider RLS read");
          assert.equal(noMember.data?.length, 0);
          const saved = await operator.query(
            "select to_jsonb(i)::text as value from matchmaking_private.tournament_invites i where tournament_id=$1",
            [tournamentId],
          );
          for (const row of saved.rows)
            for (const invitation of [participantInvite, viewerInvite])
              assert.ok(
                !row.value.includes(invitation.token) &&
                  !row.value.includes(invitation.code),
                "An invitation persisted a plaintext credential",
              );
        },
      );
      await context.test(
        "anonymous token and registered code admissions bind separate explicit participant IDs despite equal names",
        async () => {
          const first = await payload(
            await request("/invite-acceptances", guest, guestAcceptance()),
            200,
            "Anonymous token admission",
          );
          assert.equal(first.role, "participant");
          assert.equal(first.alreadyMember, false);
          assert.ok(
            typeof first.participantId === "string",
            "Guest admission did not bind a competitive participant",
          );
          guestParticipantId = first.participantId;
          const replay = await payload(
            await request("/invite-acceptances", guest, guestAcceptance()),
            200,
            "Anonymous admission replay",
          );
          assert.equal(replay.participantId, guestParticipantId);
          const second = await payload(
            await request("/invite-acceptances", player, {
              commandId: randomUUID(),
              commandVersion: 1,
              credential: {
                kind: "code",
                value: participantInvite.code.toLowerCase(),
              },
              displayName: "Mesmo nome",
            }),
            200,
            "Registered code admission",
          );
          assert.equal(second.role, "participant");
          assert.ok(
            second.participantId !== guestParticipantId,
            "An equal display name claimed another identity",
          );
          const detail = await payload(
            await request(`/tournaments/${tournamentId}`, guest),
            200,
            "Guest authorized detail",
          );
          assert.equal((detail.access as Json).role, "participant");
          assert.equal(
            (detail.access as Json).participantId,
            guestParticipantId,
          );
          const players = (detail.tournament as Json).participants as Json[];
          assert.equal(players.length, 2);
          assert.ok(players.every((p) => p.displayName === "Mesmo nome"));
          const persisted = await counts();
          assert.deepEqual(persisted, {
            revision: 3,
            players: 2,
            members: 2,
            uses: 2,
          });
          const list = await payload(
            await request("/tournaments", guest),
            200,
            "Guest member list",
          );
          assert.ok(
            (list.items as Json[]).some(
              (item) => item.tournamentId === tournamentId,
            ),
          );
          const read = await guestSdk
            .from("tournaments")
            .select("id")
            .eq("id", tournamentId);
          succeeds(read.error, "Guest admitted PostgREST read");
          assert.equal(read.data?.length, 1);
          const audit = await operator.query(
            "select details::text as value from matchmaking_private.invite_events where tournament_id=$1 union all select response::text from matchmaking_private.invite_receipts where tournament_id=$1",
            [tournamentId],
          );
          assert.ok(
            audit.rows.every(
              (r) =>
                !r.value.includes(participantInvite.token) &&
                !r.value.includes(participantInvite.code),
            ),
            "Invitation audit persisted a plaintext credential",
          );
        },
      );
      await context.test(
        "guests cannot own, import, edit profiles, administer invites or write competitive data; registered viewers only read",
        async () => {
          const before = await counts();
          const accepted = await payload(
            await request("/invite-acceptances", viewer, {
              commandId: randomUUID(),
              commandVersion: 1,
              credential: { kind: "code", value: viewerInvite.code },
            }),
            200,
            "Registered viewer admission",
          );
          assert.equal(accepted.role, "viewer");
          assert.ok(!("participantId" in accepted));
          const afterViewer = await counts();
          assert.equal(afterViewer.revision, before.revision);
          assert.equal(afterViewer.players, before.players);
          assert.equal(afterViewer.members, 3);
          const detail = await payload(
            await request(`/tournaments/${tournamentId}`, viewer),
            200,
            "Registered viewer detail",
          );
          assert.equal((detail.access as Json).role, "viewer");
          const creation = {
            commandId: randomUUID(),
            commandVersion: 1,
            type: "create_tournament",
            payload: {
              name: "Forbidden guest",
              modality: "Truco",
              capacity: 4,
              format: "single_elimination",
            },
          };
          const commands: [string, unknown][] = [
            ["/tournaments", creation],
            [
              "/tournament-imports",
              {
                commandId: randomUUID(),
                commandVersion: 1,
                type: "import_tournament",
                payload: {
                  installationId: randomUUID(),
                  importId: randomUUID(),
                  snapshotVersion: 1,
                  snapshot: fixture(),
                },
              },
            ],
            [
              "/commands",
              {
                commandId: randomUUID(),
                commandVersion: 1,
                tournamentId,
                expectedRevision: afterViewer.revision,
                type: "add_participant",
                payload: { displayName: "Forbidden" },
              },
            ],
            [
              "/invites",
              management("create_invite", {
                role: "viewer",
                maxUses: 1,
                expiresInHours: 1,
              }),
            ],
            [
              "/invites/revoke",
              management("revoke_invite", { inviteId: viewerInvite.id }),
            ],
          ];
          for (const [path, command] of commands) {
            const denied = await payload(
              await request(path, guest, command),
              403,
              "Guest forbidden operation",
            );
            assert.equal(denied.error, "RECOVERABLE_ACCOUNT_REQUIRED");
          }
          for (const [path, command] of commands.slice(2))
            assert.equal(
              (await request(path, viewer, command)).status,
              403,
              "A registered viewer obtained organizer authority",
            );
          for (const session of [guest, viewer])
            assert.equal(
              (await request(`/tournaments/${tournamentId}/invites`, session))
                .status,
              403,
            );
          const ownProfile = await guestSdk
            .from("profiles")
            .select("nickname")
            .eq("user_id", guest.user.id)
            .single();
          succeeds(ownProfile.error, "Guest own profile read");
          const profileWrite = await guestSdk
            .from("profiles")
            .update({ nickname: "Forbidden guest" })
            .eq("user_id", guest.user.id)
            .select("nickname");
          assert.ok(
            profileWrite.error || profileWrite.data?.length === 0,
            "An anonymous account edited its persistent profile",
          );
          const protectedWrite = await guestSdk
            .from("profiles")
            .update({ user_id: owner.user.id })
            .eq("user_id", guest.user.id);
          assert.ok(
            protectedWrite.error,
            "An anonymous account changed a protected profile field",
          );
          const directMember = await guestSdk
            .from("tournament_members")
            .insert({
              tournament_id: tournamentId,
              user_id: outsider.user.id,
              role: "viewer",
            });
          assert.ok(
            directMember.error,
            "A guest directly granted membership through PostgREST",
          );
          const directScore = await guestSdk.from("participants").insert({
            tournament_id: tournamentId,
            domain_id: `injected-${run}`,
            display_name: "Injected",
            position_index: 2,
          });
          assert.ok(
            directScore.error,
            "A guest directly edited competitive structure through PostgREST",
          );
          const directOwner = await guestSdk
            .from("tournaments")
            .update({ owner_user_id: guest.user.id })
            .eq("id", tournamentId);
          assert.ok(
            directOwner.error,
            "A guest directly changed tournament ownership",
          );
          const profileAfter = await guestSdk
            .from("profiles")
            .select("nickname")
            .eq("user_id", guest.user.id)
            .single();
          succeeds(profileAfter.error, "Guest unchanged profile verification");
          assert.equal(profileAfter.data?.nickname, ownProfile.data?.nickname);
          const ownership = await operator.query(
            "select owner_user_id,(select count(*)::int from public.tournaments where owner_user_id=$2) as guest_owned from public.tournaments where id=$1",
            [tournamentId, guest.user.id],
          );
          assert.equal(ownership.rows[0].owner_user_id, owner.user.id);
          assert.equal(ownership.rows[0].guest_owned, 0);
          assert.deepEqual(await counts(), afterViewer);
          assert.equal(
            (await ownerSdk.auth.getUser()).data.user?.is_anonymous,
            false,
          );
        },
      );
      await context.test(
        "revoking an invitation preserves admitted access, while explicit member removal prevents replay from restoring it",
        async () => {
          await payload(
            await request(
              "/invites/revoke",
              owner,
              management("revoke_invite", { inviteId: participantInvite.id }),
            ),
            200,
            "Revoke participant invitation",
          );
          const revoked = await payload(
            await request("/invite-preview", undefined, undefined, {
              "X-Invite-Token": participantInvite.token,
            }),
            410,
            "Revoked public preview",
          );
          assert.equal(revoked.error, "INVITE_REVOKED");
          const admitted = await payload(
            await request("/invite-preview", guest, undefined, {
              "X-Invite-Token": participantInvite.token,
            }),
            200,
            "Authenticated revoked preview for an admitted member",
          );
          assert.equal((admitted.membership as Json).role, "participant");
          assert.equal(
            (admitted.membership as Json).tournamentId,
            tournamentId,
          );
          await payload(
            await request(`/tournaments/${tournamentId}`, guest),
            200,
            "Revocation preserves admitted guest",
          );
          const replayed = await payload(
            await request("/invite-acceptances", guest, guestAcceptance()),
            200,
            "Replay after revocation",
          );
          assert.equal(replayed.participantId, guestParticipantId);
          const latest = await counts();
          await payload(
            await request("/commands", owner, {
              commandId: randomUUID(),
              commandVersion: 1,
              tournamentId,
              expectedRevision: latest.revision,
              type: "remove_participant",
              payload: { participantId: guestParticipantId },
            }),
            200,
            "Remove bound participant",
          );
          const downgraded = await payload(
            await request(`/tournaments/${tournamentId}`, guest),
            200,
            "Removed participant retains viewer membership",
          );
          assert.equal((downgraded.access as Json).role, "viewer");
          await payload(
            await request(
              "/members/remove",
              owner,
              management("remove_member", { userId: guest.user.id }),
            ),
            200,
            "Explicitly remove guest membership",
          );
          assert.equal(
            (await request(`/tournaments/${tournamentId}`, guest)).status,
            403,
          );
          const deniedReplay = await payload(
            await request("/invite-acceptances", guest, guestAcceptance()),
            403,
            "Removed membership replay",
          );
          assert.equal(deniedReplay.error, "FORBIDDEN");
          const newIdentity = await anonymous("new-device");
          assert.ok(newIdentity.session.user.id !== guest.user.id);
          assert.equal(
            (await request(`/tournaments/${tournamentId}`, newIdentity.session))
              .status,
            403,
          );
          const empty = await newIdentity.client
            .from("tournaments")
            .select("id")
            .eq("id", tournamentId);
          succeeds(empty.error, "New guest RLS filtering");
          assert.equal(empty.data?.length, 0);
        },
      );
      await context.test(
        "HTTP abuse limits persist rejected IP attempts across server restart and ignore forwarded-IP spoofing",
        async () => {
          // Last: the real production defaults intentionally block every later request from this proof IP.
          const ipBucket = bucket("invite-ip-v1", "127.0.0.1");
          const found = await operator.query(
            "select attempts from matchmaking_private.invite_rate_limits where bucket=$1",
            [ipBucket],
          );
          const used = found.rows[0]?.attempts ?? 0;
          assert.ok(
            used < 60,
            "The functional proof exhausted its isolated IP budget",
          );
          for (let n = used; n < 60; n++)
            assert.equal(
              (
                await request(
                  "/invite-preview",
                  undefined,
                  { kind: "code", value: "ZZZZZZZZ" },
                  { "X-Forwarded-For": `192.0.2.${n + 1}` },
                )
              ).status,
              404,
            );
          const limited = await request("/invite-preview", undefined, {
            kind: "code",
            value: "ZZZZZZZZ",
          });
          const rejected = await payload(
            limited,
            429,
            "Persisted IP rate limit",
          );
          assert.equal(rejected.error, "INVITE_RATE_LIMITED");
          assert.equal(limited.headers.get("retry-after"), "60");
          await stopServer();
          await startServer();
          assert.equal(
            (
              await request("/invite-preview", undefined, {
                kind: "code",
                value: "ZZZZZZZZ",
              })
            ).status,
            429,
            "Server restart reset the database-backed abuse budget",
          );
          const saved = await operator.query(
            "select attempts from matchmaking_private.invite_rate_limits where bucket=$1",
            [ipBucket],
          );
          assert.equal(saved.rows[0].attempts, 62);
          assert.equal((await counts()).uses, 3);
        },
      );
    } finally {
      await stopServer();
      await Promise.all(clients.map((client) => client.auth.dispose()));
      try {
        // Only this random owner's exact roots are eligible for cleanup, including a lost setup response.
        const roots = owner
          ? (
              await operator.query(
                "select id from public.tournaments where owner_user_id=$1",
                [owner.user.id],
              )
            ).rows
          : [];
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
        const buckets = [
          bucket("invite-ip-v1", "127.0.0.1"),
          ...[...users].map((id) => bucket("invite-actor-v1", id)),
        ];
        await operator.query(
          "delete from matchmaking_private.invite_rate_limits where bucket=any($1::text[])",
          [buckets],
        );
        for (const userId of users) {
          await operator.query("delete from public.profiles where user_id=$1", [
            userId,
          ]);
          const removed = await admin.auth.admin.deleteUser(userId);
          succeeds(removed.error, "Invitation proof account cleanup");
        }
        if (roleCreated) await operator.query(`drop role ${login}`);
      } finally {
        await admin.auth.dispose();
        await operator.end();
      }
    }
  },
);
