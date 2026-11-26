import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  Tournament,
  TournamentCapacity,
} from "../src/features/tournaments/domain/types";
import { tournamentFixture } from "../tests/fixtures/tournaments";

// Independent browser contexts use real Auth, API, PostgreSQL and WebSockets.
// Never persist credentials, invitation capabilities or private snapshots in traces.
test.use({ trace: "off", screenshot: "off", video: "off" });
const authUrl = "http://127.0.0.1:54321";
const api = process.env.MATCHMAKING_API_URL;
const publicKey = process.env.MATCHMAKING_AUTH_PUBLIC_KEY;
const serviceKey = process.env.MATCHMAKING_AUTH_SERVICE_KEY;
type Account = { id: string; email: string; password: string; token: string };
type Owned = {
  accounts: Account[];
  guests: Set<string>;
  contexts: BrowserContext[];
  captures: Promise<void>[];
  runtimeErrors: number;
};
type Snapshot = {
  tournament: Tournament;
  revision: number;
  syncSequence: number;
  access: { role: string };
};
type Invitation = { shareUrl: string; code: string };
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).filter({ visible: true });
const field = (page: Page, name: string) =>
  page.getByLabel(name, { exact: true }).filter({ visible: true });
const text = (page: Page, value: string | RegExp) =>
  page
    .getByText(value, { exact: typeof value === "string" })
    .filter({ visible: true });
const status = (page: Page) =>
  page.getByTestId("remote-connection-status").filter({ visible: true });
const connected = async (page: Page) =>
  expect(status(page)).toHaveAttribute("aria-label", "Conectado", {
    timeout: 15000,
  });
function watchRuntime(page: Page, owned: Owned) {
  page.on("pageerror", () => {
    owned.runtimeErrors++;
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes("Unexpected text node")
    )
      owned.runtimeErrors++;
  });
}

async function account(owned: Owned): Promise<Account> {
  const admin = createClient(authUrl, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `mm-live-${randomUUID()}@example.test`,
    password = `Live!${randomUUID()}a9`;
  const sdk = createClient(authUrl, publicKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error(
        "Could not create an exact Realtime browser proof account",
      );
    const a: Account = { id: created.data.user.id, email, password, token: "" };
    owned.accounts.push(a);
    const signed = await sdk.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session)
      throw new Error("Real Realtime browser proof login failed");
    a.token = signed.data.session.access_token;
    return a;
  } finally {
    await sdk.auth.dispose();
    await admin.auth.dispose();
  }
}
async function database() {
  const parsed = new URL(process.env.MATCHMAKING_TEST_DATABASE_URL!);
  if (
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    parsed.port !== "54322" ||
    parsed.pathname !== "/postgres" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      "Realtime browser cleanup requires only the existing local database",
    );
  const db = new Client({ connectionString: parsed.toString() });
  await db.connect();
  return db;
}
async function cleanup(owned: Owned) {
  await Promise.all(owned.contexts.map((c) => c.close()));
  await Promise.allSettled(owned.captures);
  const ids = [
    ...new Set([...owned.accounts.map((a) => a.id), ...owned.guests]),
  ];
  if (!ids.length) return;
  const db = await database();
  try {
    await db.query("begin");
    const roots = (
      await db.query(
        "select id from public.tournaments where owner_user_id=any($1::uuid[]) for update",
        [ids],
      )
    ).rows.map((r) => r.id);
    for (const table of [
      "tournament_imports",
      "operation_receipts",
      "participant_ids",
      "command_receipts",
      "tournament_events",
    ])
      await db.query(
        `delete from matchmaking_private.${table} where tournament_id=any($1::uuid[])`,
        [roots],
      );
    await db.query("delete from public.tournaments where id=any($1::uuid[])", [
      roots,
    ]);
    await db.query(
      "delete from public.profiles where user_id=any($1::uuid[])",
      [ids],
    );
    const pepper = process.env.MATCHMAKING_INVITE_PEPPER;
    if (pepper) {
      const buckets = ids.map((id) =>
        createHmac("sha256", pepper)
          .update(`invite-actor-v1:${id}`)
          .digest("hex"),
      );
      await db.query(
        "delete from matchmaking_private.invite_rate_limits where bucket=any($1::text[])",
        [buckets],
      );
    }
    await db.query("commit");
  } catch {
    await db.query("rollback");
    throw new Error("Exact Realtime browser resources could not be removed");
  } finally {
    await db.end();
  }
  const admin = createClient(authUrl, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    for (const id of ids) {
      const removed = await admin.auth.admin.deleteUser(id);
      if (removed.error)
        throw new Error("Exact Realtime browser account cleanup failed");
    }
  } finally {
    await admin.auth.dispose();
  }
}
async function request(a: Account, path: string, body?: unknown) {
  const response = await fetch(`${api}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${a.token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      `Realtime browser proof API returned HTTP ${response.status}`,
    );
  return response.json();
}
async function detail(a: Account, id: string): Promise<Snapshot> {
  return request(a, `/tournaments/${id}`);
}
async function command(a: Account, id: string, type: string, payload: unknown) {
  const current = await detail(a, id);
  return request(a, "/commands", {
    commandId: randomUUID(),
    commandVersion: 1,
    tournamentId: id,
    expectedRevision: current.revision,
    type,
    payload,
  });
}
async function invitation(
  a: Account,
  id: string,
  role: "participant" | "viewer",
): Promise<Invitation> {
  return request(a, "/invites", {
    commandId: randomUUID(),
    commandVersion: 1,
    tournamentId: id,
    type: "create_invite",
    payload: { role, expiresInHours: 24, maxUses: 16 },
  });
}
async function login(page: Page, a: Account) {
  try {
    await page.goto("/auth/sign-in");
    await field(page, "E-mail").fill(a.email);
    await field(page, "Senha").fill(a.password);
    await button(page, "Entrar").click();
    await expect(field(page, "Apelido da conta")).toBeVisible();
  } catch {
    throw new Error("Realtime proof account login failed; credentials omitted");
  }
}
async function another(
  browser: Browser,
  original: Page,
  info: TestInfo,
  owned: Owned,
) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:8081",
    viewport: original.viewportSize()!,
    reducedMotion: "reduce",
    isMobile: !!info.project.use.isMobile,
    hasTouch: !!info.project.use.hasTouch,
  });
  owned.contexts.push(context);
  context.on("response", (response) => {
    if (!response.url().startsWith(`${authUrl}/auth/v1/`)) return;
    const capture = response
      .json()
      .then((body) => {
        if (
          body?.user?.is_anonymous === true &&
          typeof body.user.id === "string"
        )
          owned.guests.add(body.user.id);
        else if (body?.is_anonymous === true && typeof body.id === "string")
          owned.guests.add(body.id);
      })
      .catch(() => {});
    owned.captures.push(capture);
  });
  const page = await context.newPage();
  watchRuntime(page, owned);
  return page;
}
async function seedLocal(page: Page) {
  await page.addInitScript(
    (t: Tournament) => {
      if (!localStorage.getItem("matchmaking-local-v1"))
        localStorage.setItem(
          "matchmaking-local-v1",
          JSON.stringify({
            version: 1,
            state: {
              tournaments: [t],
              profile: { id: "me", nickname: "Competidor local" },
              draft: {
                name: "Rascunho local preservado",
                modality: "Truco",
                customModality: "",
                capacity: 8,
                step: 0,
              },
            },
          }),
        );
    },
    tournamentFixture("completed", "realtime-local-preserved"),
  );
}
const envelope = (page: Page) =>
  page.evaluate(() => localStorage.getItem("matchmaking-local-v1"));
function snapshots(page: Page, id: string, owned: Owned) {
  let latest: Snapshot | undefined;
  let count = 0;
  let signals = 0;
  page.on("websocket", (socket) => {
    // Inspect only the frame's event name; never retain its JWT or private payload.
    socket.on("framereceived", (frame) => {
      try {
        const message = JSON.parse(String(frame.payload));
        const event = Array.isArray(message) ? message[3] : message?.event;
        if (event === "postgres_changes") signals++;
      } catch {
        /* Non-JSON protocol frames are irrelevant. */
      }
    });
  });
  page.on("response", (response) => {
    if (
      response.request().method() !== "GET" ||
      response.url() !== `${api}/tournaments/${id}` ||
      !response.ok()
    )
      return;
    const capture = response
      .json()
      .then((body) => {
        latest = body;
        count++;
      })
      .catch(() => {});
    owned.captures.push(capture);
  });
  return {
    get latest() {
      return latest;
    },
    get count() {
      return count;
    },
    get signals() {
      return signals;
    },
  };
}
async function joinGuest(page: Page, invite: Invitation, name: string) {
  try {
    await page.goto(invite.shareUrl);
  } catch {
    throw new Error(
      "Realtime invitation navigation failed; capability omitted",
    );
  }
  await button(page, "Continuar como convidado").click();
  await field(page, "Seu apelido na competição").fill(name);
  await button(page, "Entrar na competição").click();
  await expect(button(page, "Abrir campeonato")).toBeVisible();
  await button(page, "Abrir campeonato").click();
}
async function joinViewer(page: Page, a: Account, invite: Invitation) {
  await login(page, a);
  try {
    await page.goto(invite.shareUrl);
  } catch {
    throw new Error("Realtime viewer navigation failed; capability omitted");
  }
  await button(page, "Acompanhar campeonato").click();
  await button(page, "Abrir campeonato").click();
}
async function save(page: Page, score1 = "3", score2 = "1") {
  const scores = page
    .locator('input[aria-label^="Placar de "]')
    .filter({ visible: true });
  await scores.nth(0).fill(score1);
  await scores.nth(1).fill(score2);
  await button(page, "Confirmar resultado").click();
  await button(page, "Salvar resultado").click();
}
const matchPath = (id: string, match: string) =>
  `/match/${encodeURIComponent(match)}?tournamentId=${id}&source=cloud`;

test.describe("Sincronização Realtime real entre sessões independentes", () => {
  test.skip(
    !api ||
      !publicKey ||
      !serviceKey ||
      !process.env.MATCHMAKING_TEST_DATABASE_URL,
    "Use npm run test:auth:e2e with the real local Realtime stack",
  );
  for (const capacity of [
    4, 8, 16,
  ] as const satisfies readonly TournamentCapacity[]) {
    test(`${capacity}: admissão, chave e resultado chegam automaticamente sem Atualizar`, async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(210000);
      const owned: Owned = {
        accounts: [],
        guests: new Set(),
        contexts: [],
        captures: [],
        runtimeErrors: 0,
      };
      watchRuntime(page, owned);
      try {
        const owner = await account(owned);
        const id = (
          await request(owner, "/tournaments", {
            commandId: randomUUID(),
            commandVersion: 1,
            type: "create_tournament",
            payload: {
              name: `Copa Realtime ${capacity}`,
              modality: "Truco",
              capacity,
              format: "single_elimination",
            },
          })
        ).tournamentId as string;
        await seedLocal(page);
        await login(page, owner);
        await page.goto(`/tournament/${id}/lobby?source=cloud`);
        await connected(page);
        const ownerEnvelope = await envelope(page);
        const playerInvite = await invitation(owner, id, "participant");
        const invited = await another(browser, page, info, owned);
        await seedLocal(invited);
        const memberSnapshots = snapshots(invited, id, owned);
        await joinGuest(invited, playerInvite, "Amigo ao vivo");
        await connected(invited);
        const guestEnvelope = await envelope(invited);
        await expect(text(page, `1/${capacity} confirmados`)).toBeVisible({
          timeout: 15000,
        });
        await expect(
          text(page, "1 jogadores vinculados · 0 espectadores"),
        ).toBeVisible();
        const playersBefore = memberSnapshots.count;
        for (let i = 2; i <= capacity; i++)
          await command(owner, id, "add_participant", {
            displayName: `Rival ao vivo ${i}`,
          });
        await expect(
          text(invited, `${capacity}/${capacity} confirmados`),
        ).toBeVisible({ timeout: 15000 });
        await expect(button(page, "Sortear confrontos")).toBeEnabled();
        expect(memberSnapshots.count > playersBefore).toBe(true);
        expect((await detail(owner, id)).tournament.status).toBe("draft");
        await button(page, "Sortear confrontos").click();
        await expect(text(page, "O caminho até o troféu")).toBeVisible();
        await expect(button(invited, "Ver chaveamento")).toBeVisible({
          timeout: 15000,
        });
        const drawn = await detail(owner, id);
        await expect
          .poll(
            () =>
              memberSnapshots.latest?.tournament.drawOrder.join(",") ===
              drawn.tournament.drawOrder.join(","),
            { timeout: 15000 },
          )
          .toBe(true);
        await button(invited, "Ver chaveamento").click();
        await connected(invited);
        const first = drawn.tournament.matches[0];
        await invited.goto(matchPath(id, first.id));
        await connected(invited);
        await expect(
          text(invited, "Aguardando o resultado confirmado pelo organizador."),
        ).toBeVisible();
        await page.goto(matchPath(id, first.id));
        await save(page);
        await expect(text(invited, "3 × 1")).toBeVisible({ timeout: 15000 });
        expect(memberSnapshots.signals > 0).toBe(true);
        expect(await envelope(invited)).toBe(guestEnvelope);
        expect(await envelope(page)).toBe(ownerEnvelope);
        if (capacity === 4) {
          const watcher = await account(owned);
          const spectator = await another(browser, page, info, owned);
          const viewerSnapshots = snapshots(spectator, id, owned);
          await joinViewer(
            spectator,
            watcher,
            await invitation(owner, id, "viewer"),
          );
          await connected(spectator);
          const next = drawn.tournament.matches[1];
          await page.goto(matchPath(id, next.id));
          await save(page);
          const prepared = await detail(owner, id),
            final = prepared.tournament.matches.find(
              (m) => m.nextMatchId === null,
            )!;
          await invited.goto(`/tournament/${id}/champion?source=cloud`);
          await spectator.goto(`/tournament/${id}/champion?source=cloud`);
          await expect(
            text(invited, "O troféu ainda está em jogo."),
          ).toBeVisible();
          await expect(
            text(spectator, "O troféu ainda está em jogo."),
          ).toBeVisible();
          await connected(invited);
          await connected(spectator);
          await page.goto(matchPath(id, final.id));
          await save(page, "7", "2");
          await expect(text(invited, "Campeão!")).toBeVisible({
            timeout: 15000,
          });
          await expect(text(spectator, "Campeão!")).toBeVisible({
            timeout: 15000,
          });
          const completed = await detail(owner, id);
          await expect
            .poll(
              () =>
                viewerSnapshots.latest?.tournament.championId ===
                completed.tournament.championId,
              { timeout: 15000 },
            )
            .toBe(true);
          await command(owner, id, "correct_result", {
            matchId: final.id,
            score1: 1,
            score2: 8,
          });
          const correctedFinal = await detail(owner, id);
          expect(
            correctedFinal.tournament.championId !==
              completed.tournament.championId,
          ).toBe(true);
          await expect
            .poll(
              () =>
                viewerSnapshots.latest?.tournament.championId ===
                  correctedFinal.tournament.championId &&
                memberSnapshots.latest?.tournament.championId ===
                  correctedFinal.tournament.championId,
              { timeout: 15000 },
            )
            .toBe(true);
          const championName = correctedFinal.tournament.participants.find(
            (p) => p.id === correctedFinal.tournament.championId,
          )!.displayName;
          await expect(
            invited
              .getByTestId("champion-reveal")
              .filter({ visible: true })
              .getByText(championName, { exact: true })
              .first(),
          ).toBeVisible();
          // Correcting a semifinal invalidates its descendant final on every client.
          await command(owner, id, "correct_result", {
            matchId: first.id,
            score1: 1,
            score2: 9,
          });
          await expect(
            text(invited, "O troféu ainda está em jogo."),
          ).toBeVisible({ timeout: 15000 });
          await expect(
            text(spectator, "O troféu ainda está em jogo."),
          ).toBeVisible({ timeout: 15000 });
          expect(await envelope(invited)).toBe(guestEnvelope);
        }
        expect(owned.runtimeErrors).toBe(0);
      } finally {
        await cleanup(owned);
      }
    });
  }

  test("espectador reconcilia após offline e perde acesso sem conservar snapshot privado; troca A/B preserva local", async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(180000);
    const owned: Owned = {
      accounts: [],
      guests: new Set(),
      contexts: [],
      captures: [],
      runtimeErrors: 0,
    };
    try {
      const owner = await account(owned),
        viewer = await account(owned),
        other = await account(owned);
      const id = (
        await request(owner, "/tournaments", {
          commandId: randomUUID(),
          commandVersion: 1,
          type: "create_tournament",
          payload: {
            name: "Acesso Realtime protegido",
            modality: "Truco",
            capacity: 4,
            format: "single_elimination",
          },
        })
      ).tournamentId as string;
      const watching = await another(browser, page, info, owned);
      await seedLocal(watching);
      const observed = snapshots(watching, id, owned);
      await joinViewer(watching, viewer, await invitation(owner, id, "viewer"));
      await connected(watching);
      const localBefore = await envelope(watching);
      await watching.context().setOffline(true);
      await expect(status(watching)).toContainText("Sem conexão", {
        timeout: 15000,
      });
      await command(owner, id, "add_participant", {
        displayName: "Mudança durante queda",
      });
      await watching.context().setOffline(false);
      await connected(watching);
      await expect(text(watching, "1/4 confirmados")).toBeVisible({
        timeout: 15000,
      });
      await expect
        .poll(() => observed.latest?.tournament.participants.length, {
          timeout: 15000,
        })
        .toBe(1);
      await request(owner, "/members/remove", {
        commandId: randomUUID(),
        commandVersion: 1,
        tournamentId: id,
        type: "remove_member",
        payload: { userId: viewer.id },
      });
      await expect(text(watching, "Acesso encerrado")).toBeVisible({
        timeout: 15000,
      });
      await expect(text(watching, "Acesso Realtime protegido")).toHaveCount(0);
      await expect(text(watching, "Mudança durante queda")).toHaveCount(0);
      const forbidden = await fetch(`${api}/tournaments/${id}`, {
        headers: { Authorization: `Bearer ${viewer.token}` },
      });
      expect(forbidden.status).toBe(403);
      await command(owner, id, "add_participant", {
        displayName: "Privado depois da remoção",
      });
      await expect(text(watching, "Privado depois da remoção")).toHaveCount(0);
      expect(await envelope(watching)).toBe(localBefore);
      expect(owned.runtimeErrors).toBe(0);
      await watching.goto("/profile");
      await button(watching, "Sair da conta").click();
      await login(watching, other);
      await watching.goto(`/tournament/${id}/lobby?source=cloud`);
      await expect(text(watching, "Acesso Realtime protegido")).toHaveCount(0);
      await expect(text(watching, "Privado depois da remoção")).toHaveCount(0);
      expect(await envelope(watching)).toBe(localBefore);
    } finally {
      await cleanup(owned);
    }
  });
});
