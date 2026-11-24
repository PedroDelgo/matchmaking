import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { Pool } from "pg";
import { createAuthenticator } from "../src/auth";
import { fixture, seed } from "./fixtures";

// Real local Auth/PostgREST/Mailpit, with no remote fallback or generated JWTs.
const api = "http://127.0.0.1:54321";
const mailpit = "http://127.0.0.1:54324";
const issuer = `${api}/auth/v1`;
const callback = "http://localhost:8081/auth/callback";
const publicKey = process.env.MATCHMAKING_AUTH_PUBLIC_KEY;
const serviceKey = process.env.MATCHMAKING_AUTH_SERVICE_KEY;
const databaseUrl = process.env.MATCHMAKING_TEST_DATABASE_URL;
if (!publicKey || !serviceKey || !databaseUrl)
  throw new Error(
    "Set local MATCHMAKING_AUTH_PUBLIC_KEY, MATCHMAKING_AUTH_SERVICE_KEY and MATCHMAKING_TEST_DATABASE_URL",
  );
const target = new URL(databaseUrl);
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.search ||
  target.hash ||
  target.pathname !== "/postgres" ||
  target.port !== "54322"
)
  throw new Error(
    "Real Auth proof requires the existing local Supabase postgres database without connection overrides",
  );

type Stored = Map<string, string>;
type Mail = { ID: string; To: { Address: string }[] };
function succeeds(error: { code?: string } | null, operation: string) {
  assert.ok(!error, `${operation} failed (${error?.code ?? "transport"})`);
}

test(
  "real local Supabase Auth, email PKCE, sessions, private profiles and password recovery",
  { timeout: 120_000 },
  async (context) => {
    const run = randomUUID();
    const users = new Set<string>();
    const messages = new Set<string>();
    const lastEmail = new Map<string, number>();
    const clients: SupabaseClient[] = [];
    const operator = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 5000,
    });
    const admin = createClient(api, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    clients.push(admin);
    function client(name: string, stored: Stored = new Map()) {
      const sdk = createClient(api, publicKey!, {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `mm-5b-proof-${run}-${name}`,
          storage: {
            getItem: (key) => stored.get(key) ?? null,
            setItem: (key, value) => {
              stored.set(key, value);
            },
            removeItem: (key) => {
              stored.delete(key);
            },
          },
        },
      });
      clients.push(sdk);
      return sdk;
    }
    async function mailFor(email: string) {
      const until = Date.now() + 15_000;
      while (Date.now() < until) {
        const response = await fetch(`${mailpit}/api/v1/messages?limit=100`, {
          signal: AbortSignal.timeout(5000),
        });
        assert.ok(response.ok, "Mailpit message listing unavailable");
        const mailbox = (await response.json()) as { messages: Mail[] };
        const message = mailbox.messages.find(
          (item) =>
            !messages.has(item.ID) &&
            item.To.some((to) => to.Address.toLowerCase() === email),
        );
        if (message) {
          messages.add(message.ID);
          lastEmail.set(email, Date.now());
          const detail = await fetch(
            `${mailpit}/api/v1/message/${encodeURIComponent(message.ID)}`,
            { signal: AbortSignal.timeout(5000) },
          );
          assert.ok(detail.ok, "Mailpit message unavailable");
          const content = (await detail.json()) as { HTML: string };
          const links = [
            ...content.HTML.matchAll(/href=["']([^"']+)["']/g),
          ].map((match) => match[1].replaceAll("&amp;", "&"));
          const link = links.find((value) => {
            try {
              const url = new URL(value);
              return url.origin === api && url.pathname === "/auth/v1/verify";
            } catch {
              return false;
            }
          });
          assert.ok(
            link,
            "Email did not contain the expected local Auth verification link",
          );
          return link;
        }
        await delay(200);
      }
      throw new Error(
        "Local Auth email was not captured by Mailpit within 15 seconds",
      );
    }
    async function consume(link: string) {
      const result = await fetch(link, {
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      assert.ok(
        [302, 303].includes(result.status),
        "Auth verification did not redirect",
      );
      const location = result.headers.get("location");
      assert.ok(location, "Auth verification callback missing");
      const url = new URL(location);
      assert.ok(
        url.origin === new URL(callback).origin &&
          url.pathname === "/auth/callback",
        "Unexpected Auth callback origin/path",
      );
      return url;
    }
    async function exchange(sdk: SupabaseClient, url: URL) {
      const code = url.searchParams.get("code");
      assert.ok(
        code && !url.searchParams.has("error"),
        "Auth callback did not contain a valid PKCE code",
      );
      const flowId = url.searchParams.get("sb_flow_id");
      const result = await sdk.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      succeeds(result.error, "PKCE exchange");
      assert.ok(
        result.data.session,
        "PKCE exchange did not create a real session",
      );
      return { code, session: result.data.session };
    }
    const emailA = `mm-5b-${run}-a@example.test`;
    const emailB = `mm-5b-${run}-b@example.test`;
    const passwordA = `Mm!5B-${randomUUID()}`;
    const passwordB = `Mm!5B-${randomUUID()}`;
    const changedPassword = `Mm!5B-new-${randomUUID()}`;
    const storageA: Stored = new Map();
    const accountA = client("a", storageA);
    const accountB = client("b");
    let idA = "",
      idB = "";
    try {
      await context.test(
        "signup requires captured email confirmation and rejects login before confirmation",
        async () => {
          for (const [sdk, email, password] of [
            [accountA, emailA, passwordA],
            [accountB, emailB, passwordB],
          ] as const) {
            const result = await sdk.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: callback,
                data: {
                  nickname: "Local must not claim remote profile",
                  user_id: randomUUID(),
                  role: "organizer",
                },
              },
            });
            succeeds(result.error, "Signup");
            assert.ok(
              result.data.user?.id,
              "Signup did not return an account ID",
            );
            users.add(result.data.user.id);
            assert.ok(
              result.data.session === null,
              "Signup unexpectedly authenticated before email confirmation",
            );
            if (sdk === accountA) idA = result.data.user.id;
            else idB = result.data.user.id;
            const denied = await sdk.auth.signInWithPassword({
              email,
              password,
            });
            assert.ok(
              denied.error && denied.data.session === null,
              "Unconfirmed account unexpectedly signed in",
            );
            const link = await mailFor(email);
            const confirmed = await exchange(sdk, await consume(link));
            assert.equal(confirmed.session.user.id, result.data.user.id);
            const reused = await sdk.auth.exchangeCodeForSession(
              confirmed.code,
            );
            assert.ok(reused.error, "A consumed PKCE code was accepted twice");
            const reusedLink = await consume(link);
            assert.ok(
              !reusedLink.searchParams.has("code") &&
                (reusedLink.searchParams.has("error") ||
                  reusedLink.hash.includes("error")),
              "A confirmation link was accepted twice",
            );
          }
        },
      );
      await context.test(
        "password login, persisted SDK session, refresh and 5A JWT verification use the real account identity",
        async () => {
          assert.ok(idA && idB, "Signup prerequisite failed");
          const wrong = await client("wrong-password").auth.signInWithPassword({
            email: emailA,
            password: `${passwordA}-wrong`,
          });
          assert.ok(
            wrong.error && wrong.data.session === null,
            "Incorrect password authenticated",
          );
          const signedIn = await accountA.auth.signInWithPassword({
            email: emailA,
            password: passwordA,
          });
          succeeds(signedIn.error, "Password login");
          assert.ok(
            signedIn.data.session,
            "Password login did not create a session",
          );
          const restored = client("a", storageA);
          const recovered = await restored.auth.getSession();
          succeeds(recovered.error, "Session restoration");
          assert.equal(recovered.data.session?.user.id, idA);
          const verified = await restored.auth.getUser();
          succeeds(verified.error, "Remote session verification");
          assert.equal(verified.data.user?.id, idA);
          const refreshed = await accountA.auth.refreshSession();
          succeeds(refreshed.error, "Session refresh");
          assert.ok(refreshed.data.session, "Refresh did not return a session");
          assert.ok(
            refreshed.data.session.refresh_token !==
              signedIn.data.session.refresh_token,
            "Refresh token did not rotate",
          );
          const token = refreshed.data.session.access_token;
          assert.equal(decodeProtectedHeader(token).alg, "ES256");
          const claims = decodeJwt(token);
          assert.equal(claims.iss, issuer);
          assert.equal(claims.sub, idA);
          assert.equal(claims.role, "authenticated");
          assert.equal(claims.aud, "authenticated");
          const authenticate = createAuthenticator(issuer);
          assert.equal((await authenticate(`Bearer ${token}`)).userId, idA);
          const [header, payload, signature] = token.split(".");
          const invalid = `${header}.${payload}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
          await assert.rejects(
            authenticate(`Bearer ${invalid}`),
            /UNAUTHENTICATED/,
          );
          await assert.rejects(authenticate(undefined), /UNAUTHENTICATED/);
        },
      );
      await context.test(
        "expired persisted SDK session automatically refreshes with a real rotated token",
        async () => {
          const key = `mm-5b-proof-${run}-a`;
          const saved = JSON.parse(storageA.get(key)!);
          const previousRefresh = saved.refresh_token;
          // Move only the SDK's expiry metadata into the past; Auth signs every new token.
          saved.expires_at = Math.floor(Date.now() / 1000) - 30;
          storageA.set(key, JSON.stringify(saved));
          const restored = client("a", storageA);
          const refreshed = await restored.auth.getSession();
          succeeds(
            refreshed.error,
            "Automatic refresh of expired stored session",
          );
          assert.ok(
            refreshed.data.session,
            "Expired stored session did not renew",
          );
          assert.equal(refreshed.data.session.user.id, idA);
          assert.ok(
            refreshed.data.session.refresh_token !== previousRefresh,
            "Automatic refresh did not rotate the token",
          );
          const verified = await restored.auth.getUser();
          succeeds(verified.error, "Automatically refreshed user verification");
          assert.equal(verified.data.user?.id, idA);
          // Keep the main proof client on the current refresh generation.
          const current = await accountA.auth.setSession(
            refreshed.data.session,
          );
          succeeds(current.error, "Adopt refreshed session");
        },
      );
      await context.test(
        "real Auth token reaches compiled cloud API and commands with restricted PostgreSQL and owner authorization",
        async () => {
          const login = `mm_5b_role_${randomUUID().replaceAll("-", "")}`;
          const password = randomUUID();
          let roleCreated = false;
          let tournamentId: string | undefined;
          let child: ReturnType<typeof spawn> | undefined;
          const cloudIds: string[] = [];
          try {
            await operator.query(
              `create role ${login} login noinherit nosuperuser nobypassrls password '${password}'`,
            );
            roleCreated = true;
            await operator.query(
              `grant matchmaking_command to ${login} with admin false, inherit false, set true`,
            );
            const tournament = fixture();
            tournamentId = await seed(operator, idA, tournament);
            const serviceUrl = new URL(databaseUrl!);
            serviceUrl.username = login;
            serviceUrl.password = password;
            child = spawn(process.execPath, ["backend/dist/server.mjs"], {
              env: {
                ...process.env,
                DATABASE_URL: serviceUrl.toString(),
                SUPABASE_AUTH_URL: issuer,
                PORT: "0",
              },
              windowsHide: true,
              stdio: ["ignore", "pipe", "pipe"],
            });
            const server = child;
            const origin = await new Promise<string>((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error("Local command server did not start")),
                5000,
              );
              server.once("error", () => {
                clearTimeout(timeout);
                reject(new Error("Local command server could not start"));
              });
              server.once("exit", () => {
                clearTimeout(timeout);
                reject(new Error("Local command server exited"));
              });
              server.stdout!.on("data", (data) => {
                const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
                if (match) {
                  clearTimeout(timeout);
                  resolve(match[0]);
                }
              });
              // Do not print diagnostics that might include connection credentials.
              server.stderr!.resume();
            });
            const command = {
              commandId: randomUUID(),
              commandVersion: 1,
              tournamentId,
              expectedRevision: 0,
              type: "record_result",
              payload: {
                matchId: tournament.matches[0].id,
                score1: 3,
                score2: 1,
              },
            };
            const send = (token: string) =>
              fetch(`${origin}/commands`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(command),
                signal: AbortSignal.timeout(10000),
              });
            const owner = (await accountA.auth.getSession()).data.session!;
            const outsider = (await accountB.auth.getSession()).data.session!;
            assert.equal((await send(outsider.access_token)).status, 403);
            assert.equal((await send("invalid-token")).status, 401);
            const applied = await send(owner.access_token);
            assert.equal(applied.status, 200);
            assert.equal((await applied.json()).revision, 1);
            const replay = await send(owner.access_token);
            assert.equal(replay.status, 200);
            assert.equal((await replay.json()).revision, 1);
            const persisted = await operator.query(
              "select revision from public.tournaments where id=$1",
              [tournamentId],
            );
            assert.equal(Number(persisted.rows[0].revision), 1);
            const api = (
              path: string,
              token: string,
              body?: unknown,
              originHeader?: string,
            ) =>
              fetch(`${origin}${path}`, {
                method: body === undefined ? "GET" : "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  ...(body === undefined
                    ? {}
                    : { "Content-Type": "application/json" }),
                  ...(originHeader ? { Origin: originHeader } : {}),
                },
                body: body === undefined ? undefined : JSON.stringify(body),
              });
            const creation = {
              commandId: randomUUID(),
              commandVersion: 1,
              type: "create_tournament",
              payload: {
                name: "Auth cloud proof",
                modality: "Truco",
                capacity: 4,
                format: "single_elimination",
              },
            };
            assert.equal(
              (await api("/tournaments", "invalid", creation)).status,
              401,
            );
            assert.equal(
              (
                await api("/tournaments", owner.access_token, {
                  ...creation,
                  owner_user_id: idB,
                })
              ).status,
              400,
            );
            assert.equal(
              (
                await api("/tournaments", owner.access_token, {
                  ...creation,
                  payload: { ...creation.payload, capacity: 5 },
                })
              ).status,
              400,
            );
            assert.equal(
              (
                await api(
                  "/tournaments",
                  owner.access_token,
                  creation,
                  "https://external.invalid",
                )
              ).status,
              403,
            );
            const created = await api(
              "/tournaments",
              owner.access_token,
              creation,
              "http://127.0.0.1:8081",
            );
            assert.equal(created.status, 200);
            assert.equal(
              created.headers.get("access-control-allow-origin"),
              "http://127.0.0.1:8081",
            );
            const cloud = await created.json();
            cloudIds.push(cloud.tournamentId);
            assert.equal(
              (
                await (
                  await api("/tournaments", owner.access_token, creation)
                ).json()
              ).tournamentId,
              cloud.tournamentId,
            );
            assert.equal(
              (
                await api(
                  `/tournaments/${cloud.tournamentId}`,
                  outsider.access_token,
                )
              ).status,
              403,
            );
            const list = await (
              await api("/tournaments?limit=20", owner.access_token)
            ).json();
            assert.ok(
              list.items.some(
                (t: { tournamentId: string }) =>
                  t.tournamentId === cloud.tournamentId,
              ),
            );
            const outsideList = await (
              await api("/tournaments", outsider.access_token)
            ).json();
            assert.ok(
              !outsideList.items.some(
                (t: { tournamentId: string }) =>
                  t.tournamentId === cloud.tournamentId,
              ),
            );
            const added = await api("/commands", owner.access_token, {
              commandId: randomUUID(),
              commandVersion: 1,
              tournamentId: cloud.tournamentId,
              expectedRevision: 1,
              type: "add_participant",
              payload: { displayName: "Pessoa real" },
            });
            assert.equal(added.status, 200);
            const imported = await api(
              "/tournament-imports",
              owner.access_token,
              {
                commandId: randomUUID(),
                commandVersion: 1,
                type: "import_tournament",
                payload: {
                  installationId: randomUUID(),
                  importId: randomUUID(),
                  snapshotVersion: 1,
                  snapshot: tournament,
                },
              },
            );
            assert.equal(imported.status, 200);
            const copy = await imported.json();
            cloudIds.push(copy.tournamentId);
            assert.deepEqual(
              (
                await (
                  await api(
                    `/tournaments/${copy.tournamentId}`,
                    owner.access_token,
                  )
                ).json()
              ).tournament,
              JSON.parse(JSON.stringify(tournament)),
            );
            const direct = await accountA
              .from("participants")
              .insert({
                tournament_id: cloud.tournamentId,
                domain_id: "injected",
                display_name: "Injected",
                position_index: 1,
              });
            assert.ok(direct.error, "Data API allowed competitive writes");
          } finally {
            if (child && child.exitCode === null) {
              const exited = new Promise<void>((resolve) =>
                child!.once("exit", () => resolve()),
              );
              child.kill();
              await exited;
            }
            if (tournamentId) {
              await operator.query(
                "delete from matchmaking_private.command_receipts where tournament_id=$1",
                [tournamentId],
              );
              await operator.query(
                "delete from matchmaking_private.tournament_events where tournament_id=$1",
                [tournamentId],
              );
              await operator.query(
                "delete from public.tournaments where id=$1",
                [tournamentId],
              );
            }
            for (const id of cloudIds) {
              for (const table of [
                "tournament_imports",
                "operation_receipts",
                "participant_ids",
                "command_receipts",
                "tournament_events",
              ])
                await operator.query(
                  `delete from matchmaking_private.${table} where tournament_id=$1`,
                  [id],
                );
              await operator.query(
                "delete from public.tournaments where id=$1",
                [id],
              );
            }
            if (roleCreated) await operator.query(`drop role ${login}`);
          }
        },
      );
      await context.test(
        "real authenticated PostgREST enforces self profile access, validation and protected columns",
        async () => {
          const anonymous = client("no-session");
          const hidden = await anonymous
            .from("profiles")
            .select("user_id,nickname");
          assert.ok(
            hidden.error || hidden.data?.length === 0,
            "Unauthenticated request exposed profiles",
          );
          for (const [sdk, id] of [
            [accountA, idA],
            [accountB, idB],
          ] as const) {
            const result = await sdk
              .from("profiles")
              .select("user_id,nickname,created_at,updated_at")
              .single();
            succeeds(result.error, "Own profile read");
            assert.equal(result.data?.user_id, id);
            assert.equal(result.data?.nickname, "Competidor");
          }
          const update = await accountA
            .from("profiles")
            .update({ nickname: "  Atleta\u00a0  A  " })
            .eq("user_id", idA)
            .select("user_id,nickname,created_at,updated_at")
            .single();
          succeeds(update.error, "Own profile update");
          assert.equal(update.data?.nickname, "Atleta A");
          for (const invalid of [
            "A",
            "A".repeat(41),
            "A\u200bB",
            "A\u202eB",
            "A\nB",
          ]) {
            const result = await accountA
              .from("profiles")
              .update({ nickname: invalid })
              .eq("user_id", idA);
            assert.ok(result.error, "Invalid nickname was accepted");
          }
          const foreignRead = await accountB
            .from("profiles")
            .select("user_id,nickname")
            .eq("user_id", idA);
          succeeds(foreignRead.error, "Foreign profile filtered read");
          assert.ok(
            foreignRead.data?.length === 0,
            "Another account's private profile was exposed",
          );
          const foreignWrite = await accountB
            .from("profiles")
            .update({ nickname: "Intruso" })
            .eq("user_id", idA)
            .select("user_id");
          succeeds(foreignWrite.error, "Foreign profile filtered update");
          assert.ok(
            foreignWrite.data?.length === 0,
            "Another account's profile was edited",
          );
          for (const patch of [
            { user_id: idB },
            { created_at: new Date().toISOString() },
            { updated_at: new Date().toISOString() },
          ]) {
            const result = await accountA
              .from("profiles")
              .update(patch)
              .eq("user_id", idA);
            assert.ok(result.error, "Protected profile field was editable");
          }
          const insert = await accountA
            .from("profiles")
            .insert({ user_id: idA, nickname: "Intruso" });
          assert.ok(
            insert.error,
            "Client profile provisioning was unexpectedly allowed",
          );
          const tournament = await accountA.from("tournaments").insert({
            id: randomUUID(),
            domain_id: "unauthorized",
            owner_user_id: idA,
            name: "Copa",
            modality: "Futebol",
            capacity: 4,
            status: "draft",
          });
          assert.ok(
            tournament.error,
            "Account profile privileges leaked tournament write access",
          );
          const unchanged = await accountA
            .from("profiles")
            .select("nickname")
            .eq("user_id", idA)
            .single();
          succeeds(unchanged.error, "Profile isolation verification");
          assert.equal(unchanged.data?.nickname, "Atleta A");
        },
      );
      await context.test(
        "local logout clears persisted session and the Auth server rejects its refresh token",
        async () => {
          const session = await accountA.auth.getSession();
          assert.ok(
            session.data.session,
            "Logout prerequisite session missing",
          );
          const refreshToken = session.data.session.refresh_token;
          const accessToken = session.data.session.access_token;
          const result = await accountA.auth.signOut({ scope: "local" });
          succeeds(result.error, "Logout");
          assert.ok(
            (await accountA.auth.getSession()).data.session === null,
            "Logout retained SDK session",
          );
          const restored = client("a", storageA);
          assert.ok(
            (await restored.auth.getSession()).data.session === null,
            "Logout retained persisted session",
          );
          const rejected = await client("revoked-refresh").auth.refreshSession({
            refresh_token: refreshToken,
          });
          assert.ok(
            rejected.error && rejected.data.session === null,
            "Logged-out refresh token was accepted",
          );
          // The 5A verifier checks JWT cryptography, not online session revocation.
          assert.equal(
            (await createAuthenticator(issuer)(`Bearer ${accessToken}`)).userId,
            idA,
          );
          assert.equal((await accountB.auth.getUser()).data.user?.id, idB);
        },
      );
      await context.test(
        "password recovery consumes captured email and PKCE once, emits PASSWORD_RECOVERY and changes the real password",
        async () => {
          const recovery = client("recovery");
          const events: string[] = [];
          const subscription = recovery.auth.onAuthStateChange((event) => {
            events.push(event);
          });
          try {
            // Respect the configured local 1s per-address email limit.
            const pause = (lastEmail.get(emailA) ?? 0) + 1100 - Date.now();
            if (pause > 0) await delay(pause);
            const request = await recovery.auth.resetPasswordForEmail(emailA, {
              redirectTo: callback,
            });
            succeeds(request.error, "Password recovery request");
            const link = await mailFor(emailA);
            const confirmed = await exchange(recovery, await consume(link));
            assert.equal(confirmed.session.user.id, idA);
            assert.ok(
              events.includes("PASSWORD_RECOVERY"),
              "PKCE exchange did not emit PASSWORD_RECOVERY",
            );
            const update = await recovery.auth.updateUser({
              password: changedPassword,
            });
            succeeds(update.error, "Recovered password update");
            const reused = await recovery.auth.exchangeCodeForSession(
              confirmed.code,
            );
            assert.ok(reused.error, "Recovery PKCE code was accepted twice");
            const reusedLink = await consume(link);
            assert.ok(
              !reusedLink.searchParams.has("code") &&
                (reusedLink.searchParams.has("error") ||
                  reusedLink.hash.includes("error")),
              "Recovery email link was accepted twice",
            );
            const oldPassword = await client(
              "old-password",
            ).auth.signInWithPassword({ email: emailA, password: passwordA });
            assert.ok(
              oldPassword.error && oldPassword.data.session === null,
              "Previous password remained valid after recovery",
            );
            const newPassword = await client(
              "new-password",
            ).auth.signInWithPassword({
              email: emailA,
              password: changedPassword,
            });
            succeeds(newPassword.error, "Recovered password login");
            assert.equal(newPassword.data.user?.id, idA);
            assert.ok(
              newPassword.data.session,
              "Recovered password did not authenticate",
            );
          } finally {
            subscription.data.subscription.unsubscribe();
          }
        },
      );
    } finally {
      await Promise.all(clients.map((sdk) => sdk.auth.dispose()));
      try {
        for (const userId of users) {
          await operator.query("delete from public.profiles where user_id=$1", [
            userId,
          ]);
          const result = await admin.auth.admin.deleteUser(userId);
          succeeds(result.error, "Test account cleanup");
        }
        if (messages.size) {
          const result = await fetch(`${mailpit}/api/v1/messages`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ IDs: [...messages] }),
            signal: AbortSignal.timeout(5000),
          });
          assert.ok(result.ok, "Test email cleanup failed");
        }
      } finally {
        await operator.end();
      }
    }
  },
);
