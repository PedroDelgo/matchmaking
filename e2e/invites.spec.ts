import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHmac, randomUUID } from "node:crypto";
import jsQR from "jsqr";
import { tournamentFixture } from "../tests/fixtures/tournaments";
import type { Tournament } from "../src/features/tournaments/domain/types";

const authUrl = "http://127.0.0.1:54321";
const api = process.env.MATCHMAKING_API_URL;
const publicKey = process.env.MATCHMAKING_AUTH_PUBLIC_KEY;
const serviceKey = process.env.MATCHMAKING_AUTH_SERVICE_KEY;
// No trace, screenshot or video may retain invitation capabilities or account credentials.
test.use({ trace: "off", screenshot: "off", video: "off" });
type Account = { id: string; email: string; password: string; token: string };
type Resources = {
  accounts: Account[];
  guests: Set<string>;
  captures: Promise<void>[];
};
type Invitation = { id: string; shareUrl: string; token: string; code: string };
const button = (page: Page, label: string) =>
  page
    .getByRole("button", { name: label, exact: true })
    .filter({ visible: true });
const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true });
const text = (page: Page, value: string | RegExp) =>
  page
    .getByText(value, { exact: typeof value === "string" })
    .filter({ visible: true });
const resources = (): Resources => ({
  accounts: [],
  guests: new Set(),
  captures: [],
});

async function account(owned: Resources): Promise<Account> {
  const admin = createClient(authUrl, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `mm-invite-${randomUUID()}@example.test`,
    password = `Invite!${randomUUID()}a9`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(
      "Could not create this invitation proof's temporary account",
    );
  const result = { id: created.data.user.id, email, password, token: "" };
  owned.accounts.push(result);
  const sdk = createClient(authUrl, publicKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const signed = await sdk.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session)
      throw new Error("Real invitation proof Auth login failed");
    result.token = signed.data.session.access_token;
    return result;
  } finally {
    await sdk.auth.dispose();
    await admin.auth.dispose();
  }
}
async function localDatabase() {
  const url = new URL(process.env.MATCHMAKING_TEST_DATABASE_URL!);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "54322" ||
    url.pathname !== "/postgres" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Only the existing local database is allowed for invitation test setup and cleanup",
    );
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  return db;
}
async function cleanup(owned: Resources) {
  await Promise.allSettled(owned.captures);
  const ids = [
    ...new Set([...owned.accounts.map((a) => a.id), ...owned.guests]),
  ];
  if (!ids.length) return;
  const db = await localDatabase();
  try {
    await db.query("begin");
    const { rows } = await db.query(
      "select id from public.tournaments where owner_user_id=any($1::uuid[]) for update",
      [ids],
    );
    const tournaments = rows.map((r) => r.id);
    for (const table of [
      "tournament_imports",
      "operation_receipts",
      "participant_ids",
      "command_receipts",
      "tournament_events",
    ])
      await db.query(
        `delete from matchmaking_private.${table} where tournament_id=any($1::uuid[])`,
        [tournaments],
      );
    // The invitation tables and explicit memberships cascade from these exact owned roots.
    await db.query("delete from public.tournaments where id=any($1::uuid[])", [
      tournaments,
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
    throw new Error("Exact invitation proof database cleanup failed");
  } finally {
    await db.end();
  }
  const admin = createClient(authUrl, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    for (const id of ids) {
      const deleted = await admin.auth.admin.deleteUser(id);
      if (deleted.error)
        throw new Error("Could not remove an exact invitation proof account");
    }
  } finally {
    await admin.auth.dispose();
  }
}
async function safeGoto(page: Page, value: string) {
  try {
    await page.goto(value);
  } catch {
    throw new Error(
      "Invitation navigation failed; sensitive destination omitted",
    );
  }
}
async function login(page: Page, a: Account) {
  try {
    await page.goto("/auth/sign-in");
    await field(page, "E-mail").fill(a.email);
    await field(page, "Senha").fill(a.password);
    await button(page, "Entrar").click();
    await expect(field(page, "Apelido da conta")).toBeVisible();
  } catch {
    throw new Error("Temporary account login UI failed; credentials omitted");
  }
}
async function request(a: Account, path: string, body?: unknown) {
  const result = await fetch(`${api}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${a.token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!result.ok)
    throw new Error(`Invitation proof API returned HTTP ${result.status}`);
  return result.json();
}
async function createTournament(a: Account, name: string) {
  return (
    await request(a, "/tournaments", {
      commandId: randomUUID(),
      commandVersion: 1,
      type: "create_tournament",
      payload: {
        name,
        modality: "Truco",
        capacity: 4,
        format: "single_elimination",
      },
    })
  ).tournamentId as string;
}
const management = (id: string, type: string, payload: unknown) => ({
  commandId: randomUUID(),
  commandVersion: 1,
  tournamentId: id,
  type,
  payload,
});
function invitation(result: {
  invite: { id: string };
  shareUrl: string;
  code: string;
}): Invitation {
  const token = new URLSearchParams(new URL(result.shareUrl).hash.slice(1)).get(
    "token",
  );
  if (!token || token.length !== 43 || result.code.length !== 8)
    throw new Error("Invitation credentials have an unexpected shape");
  return {
    id: result.invite.id,
    shareUrl: result.shareUrl,
    token,
    code: result.code,
  };
}
async function issue(
  a: Account,
  id: string,
  role: "participant" | "viewer" = "participant",
) {
  return invitation(
    await request(
      a,
      "/invites",
      management(id, "create_invite", { role, maxUses: 8, expiresInHours: 24 }),
    ),
  );
}
async function state(a: Account, id: string) {
  return request(a, `/tournaments/${id}`);
}
async function command(a: Account, id: string, type: string, payload: unknown) {
  const current = await state(a, id);
  return request(a, "/commands", {
    commandId: randomUUID(),
    commandVersion: 1,
    tournamentId: id,
    expectedRevision: current.revision,
    type,
    payload,
  });
}
async function uses(a: Account, id: string, inviteId: string) {
  const listed = await request(a, `/tournaments/${id}/invites`);
  return listed.items.find((i: { id: string }) => i.id === inviteId)
    .uses as number;
}
async function newContext(
  browser: Browser,
  page: Page,
  info: TestInfo,
  contexts: BrowserContext[],
  owned: Resources,
) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:8081",
    viewport: page.viewportSize()!,
    reducedMotion: "reduce",
    isMobile: !!info.project.use.isMobile,
    hasTouch: !!info.project.use.hasTouch,
  });
  contexts.push(context);
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
  return context.newPage();
}
async function recordGuest(page: Page, owned: Resources) {
  const identity = await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      try {
        const value = JSON.parse(localStorage.getItem(key)!);
        if (
          value?.user?.is_anonymous === true &&
          typeof value.user.id === "string"
        )
          return value.user.id as string;
      } catch {
        /* Other app keys may contain non-JSON strings. */
      }
    }
    return null;
  });
  if (!identity || !/^[a-f0-9-]{36}$/i.test(identity))
    throw new Error("The real guest Auth identity was not persisted");
  owned.guests.add(identity);
  return identity;
}
async function seedLocal(page: Page) {
  const tournament = tournamentFixture("draft", "local-invitation-proof");
  await page.addInitScript((t: Tournament) => {
    if (!localStorage.getItem("matchmaking-local-v1"))
      localStorage.setItem(
        "matchmaking-local-v1",
        JSON.stringify({
          version: 1,
          state: {
            tournaments: [t],
            profile: { id: "me", nickname: "Competidor local" },
            draft: {
              name: "Rascunho preservado",
              modality: "Truco",
              customModality: "",
              capacity: 8,
              step: 0,
            },
          },
        }),
      );
  }, tournament);
}
const envelope = (page: Page) =>
  page.evaluate(() => localStorage.getItem("matchmaking-local-v1"));
async function preview(page: Page, value: Invitation, name: string) {
  await safeGoto(page, value.shareUrl);
  await expect(text(page, name)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        location.pathname === "/invite" && !location.hash && !location.search,
    ),
  ).toBe(true);
}
async function guest(page: Page, owned: Resources) {
  await button(page, "Continuar como convidado").click();
  await expect(field(page, "Seu apelido na competição")).toBeVisible();
  return recordGuest(page, owned);
}
async function decodeRenderedQr(page: Page) {
  const svg = page.getByTestId("invite-qr").filter({ visible: true }).last();
  await expect(svg).toBeVisible();
  const raster = await svg.evaluate(async (element) => {
    const box = element.getAttribute("viewBox")!.split(" ").map(Number);
    const size = box[2] * 8;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d")!;
    const source = new XMLSerializer().serializeToString(element);
    const url = URL.createObjectURL(
      new Blob([source], { type: "image/svg+xml" }),
    );
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("QR rasterization failed"));
        image.src = url;
      });
      context.drawImage(image, 0, 0, size, size);
      return {
        size,
        data: Array.from(context.getImageData(0, 0, size, size).data),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  return jsQR(new Uint8ClampedArray(raster.data), raster.size, raster.size)
    ?.data;
}
async function issueInUi(
  page: Page,
  a: Account,
  id: string,
  role: "participant" | "viewer",
) {
  await page
    .getByRole("radio", {
      name: role === "participant" ? "Para jogar" : "Para assistir",
      exact: true,
    })
    .filter({ visible: true })
    .click();
  await field(page, "Limite de utilizações").fill("8");
  await button(page, "Criar convite").click();
  await expect(text(page, "Convite pronto para compartilhar")).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:8081",
  });
  await button(page, "Copiar link").click();
  await expect(text(page, "Link copiado.")).toBeVisible();
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
  await button(page, "Copiar código").click();
  const code = await page.evaluate(() => navigator.clipboard.readText());
  const listed = await request(a, `/tournaments/${id}/invites`);
  const result = invitation({ shareUrl, code, invite: listed.items[0] });
  expect((await decodeRenderedQr(page)) === shareUrl).toBe(true);
  await button(page, "Ampliar QR Code").click();
  await expect(button(page, "Fechar QR Code")).toBeVisible();
  expect((await decodeRenderedQr(page)) === shareUrl).toBe(true);
  await button(page, "Fechar QR Code").click();
  return result;
}

test.describe("Convites reais, QR e entrada autorizada", () => {
  test.skip(
    !api ||
      !publicKey ||
      !serviceKey ||
      !process.env.MATCHMAKING_TEST_DATABASE_URL,
    "Use npm run test:auth:e2e",
  );
  test("organizador compartilha QR/link/código; convidado e conta entram sem reivindicar apelidos e acompanham sem editar", async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(180000);
    const owned = resources(),
      contexts: BrowserContext[] = [];
    try {
      const owner = await account(owned),
        player = await account(owned),
        viewer = await account(owned);
      const id = await createTournament(owner, "Sala de convites"),
        repeated = "Rival repetido";
      await command(owner, id, "add_participant", { displayName: repeated });
      await login(page, owner);
      await page.goto(`/tournament/${id}/lobby?source=cloud`);
      const invite = await issueInUi(page, owner, id, "participant");
      const invited = await newContext(browser, page, info, contexts, owned);
      await seedLocal(invited);
      await preview(invited, invite, "Sala de convites");
      const before = await envelope(invited);
      expect(before !== null).toBe(true);
      expect(await uses(owner, id, invite.id)).toBe(0);
      expect((await state(owner, id)).tournament.participants).toHaveLength(1);
      const guestId = await guest(invited, owned);
      expect(await uses(owner, id, invite.id)).toBe(0);
      await field(invited, "Seu apelido na competição").fill(repeated);
      await button(invited, "Entrar na competição").click();
      await expect(
        text(invited, "Entrada confirmada. Você está na competição!"),
      ).toBeVisible();
      await button(invited, "Abrir campeonato").click();
      await expect(text(invited, "2/4 confirmados")).toBeVisible();
      await expect(field(invited, "Nome ou apelido")).toHaveCount(0);
      await expect(button(invited, "Criar convite")).toHaveCount(0);
      await expect(button(invited, "Sortear confrontos")).toBeDisabled();
      await expect(text(page, "1/4 confirmados")).toBeVisible();
      await button(page, "Atualizar acessos").click();
      await expect(text(page, "2/4 confirmados")).toBeVisible();
      const registered = await newContext(browser, page, info, contexts, owned);
      await login(registered, player);
      await registered.goto("/invite");
      await field(registered, "Código do convite").fill(
        `${invite.code.slice(0, 4).toLowerCase()}-${invite.code.slice(4).toLowerCase()}`,
      );
      await button(registered, "Consultar convite").click();
      await expect(text(registered, "Sala de convites")).toBeVisible();
      await field(registered, "Seu apelido na competição").fill(repeated);
      await button(registered, "Entrar na competição").click();
      await expect(button(registered, "Abrir campeonato")).toBeVisible();
      const admitted = await request(owner, `/tournaments/${id}/members`);
      const bound = admitted.items.filter((m: { userId: string }) =>
        [guestId, player.id].includes(m.userId),
      );
      expect(bound).toHaveLength(2);
      expect(
        new Set(bound.map((m: { participantId: string }) => m.participantId))
          .size,
      ).toBe(2);
      expect(
        (await state(owner, id)).tournament.participants.filter(
          (p: { displayName: string }) => p.displayName === repeated,
        ),
      ).toHaveLength(3);
      await button(page, "Atualizar acessos").click();
      await expect(text(page, "3/4 confirmados")).toBeVisible();
      await field(page, "Nome ou apelido").fill("Quarto jogador");
      await button(page, "Adicionar").click();
      await expect(text(page, "4/4 confirmados")).toBeVisible();
      await button(page, "Sortear confrontos").click();
      await expect(text(page, "O caminho até o troféu")).toBeVisible();
      await button(invited, "Atualizar campeonato").click();
      await expect(button(invited, "Ver chaveamento")).toBeVisible();
      await button(invited, "Ver chaveamento").click();
      await expect(text(invited, "O caminho até o troféu")).toBeVisible();
      const started = await state(owner, id);
      await invited.goto(
        `/match/${encodeURIComponent(started.tournament.matches[0].id)}?tournamentId=${id}&source=cloud`,
      );
      await expect(text(invited, "Acompanhe o confronto")).toBeVisible();
      await expect(
        invited
          .locator('input[aria-label^="Placar de "]')
          .filter({ visible: true }),
      ).toHaveCount(0);
      await expect(button(invited, "Confirmar resultado")).toHaveCount(0);
      await page.goto(`/tournament/${id}/lobby?source=cloud`);
      const watching = await issueInUi(page, owner, id, "viewer");
      const spectator = await newContext(browser, page, info, contexts, owned);
      await login(spectator, viewer);
      await preview(spectator, watching, "Sala de convites");
      await expect(field(spectator, "Seu apelido na competição")).toHaveCount(
        0,
      );
      await button(spectator, "Acompanhar campeonato").click();
      await expect(
        text(
          spectator,
          "Acesso confirmado. Você já pode acompanhar a disputa.",
        ),
      ).toBeVisible();
      await button(spectator, "Abrir campeonato").click();
      await expect(text(spectator, "O caminho até o troféu")).toBeVisible();
      expect((await state(owner, id)).tournament.participants).toHaveLength(4);
      expect((await state(owner, id)).revision).toBe(started.revision);
      expect(await envelope(invited)).toBe(before);
      expect(
        await page
          .locator("body")
          .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBe(true);
    } finally {
      await page
        .evaluate(() => navigator.clipboard?.writeText(""))
        .catch(() => {});
      await Promise.all(contexts.map((c) => c.close()));
      await cleanup(owned);
    }
  });
  test("código inválido, revogação, expiração, sala cheia/iniciada e indisponibilidade são explícitos sem consumir entrada", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const owned = resources();
    try {
      const owner = await account(owned),
        id = await createTournament(owner, "Convites indisponíveis");
      await page.goto("/invite");
      await field(page, "Código do convite").fill("ZZZZZZZZ");
      await button(page, "Consultar convite").click();
      await expect(text(page, /Este convite é inválido/)).toBeVisible();
      const revoked = await issue(owner, id);
      await request(
        owner,
        "/invites/revoke",
        management(id, "revoke_invite", { inviteId: revoked.id }),
      );
      await safeGoto(page, revoked.shareUrl);
      await expect(text(page, /Este convite foi revogado/)).toBeVisible();
      const expired = await issue(owner, id);
      const db = await localDatabase();
      try {
        await db.query(
          "update matchmaking_private.tournament_invites set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where id=$1 and tournament_id=$2",
          [expired.id, id],
        );
      } finally {
        await db.end();
      }
      await safeGoto(page, expired.shareUrl);
      await expect(text(page, /Este convite expirou/)).toBeVisible();
      const full = await issue(owner, id);
      for (let n = 0; n < 4; n++)
        await command(owner, id, "add_participant", {
          displayName: `Manual ${n + 1}`,
        });
      await preview(page, full, "Convites indisponíveis");
      await expect(
        text(page, /As vagas para jogar já foram preenchidas/),
      ).toBeVisible();
      await expect(button(page, "Continuar como convidado")).toBeDisabled();
      await command(owner, id, "draw_bracket", {});
      await preview(page, full, "Convites indisponíveis");
      await expect(
        text(page, /A chave já começou e não recebe novos jogadores/),
      ).toBeVisible();
      await expect(button(page, "Continuar como convidado")).toBeDisabled();
      const watch = await issue(owner, id, "viewer");
      await page.route(`${api}/invite-preview`, (route) =>
        route.abort("failed"),
      );
      await safeGoto(page, watch.shareUrl);
      await expect(
        text(page, /Não foi possível consultar o convite/),
      ).toBeVisible();
      await expect(button(page, "Acompanhar campeonato")).toHaveCount(0);
      await page.unroute(`${api}/invite-preview`);
      await button(page, "Consultar novamente").click();
      await expect(text(page, "Convites indisponíveis")).toBeVisible();
      for (const invite of [revoked, expired, full, watch])
        expect(await uses(owner, id, invite.id)).toBe(0);
      expect(
        (await request(owner, `/tournaments/${id}/members`)).items,
      ).toHaveLength(0);
    } finally {
      await cleanup(owned);
    }
  });
  test("entrada offline e resposta perdida retomam a mesma intenção após recarga; troca A/B preserva o envelope local", async ({
    page,
  }) => {
    test.setTimeout(150000);
    const owned = resources();
    try {
      const owner = await account(owned),
        a = await account(owned),
        b = await account(owned);
      const id = await createTournament(owner, "Retomada do convite"),
        invite = await issue(owner, id);
      await seedLocal(page);
      await login(page, a);
      const before = await envelope(page);
      await preview(page, invite, "Retomada do convite");
      await field(page, "Seu apelido na competição").fill("Jogador da conta A");
      await page.context().setOffline(true);
      await button(page, "Entrar na competição").click();
      await expect(text(page, /Sem confirmação do servidor/)).toBeVisible();
      await expect(button(page, "Abrir campeonato")).toHaveCount(0);
      expect((await state(owner, id)).tournament.participants).toHaveLength(0);
      expect(await uses(owner, id, invite.id)).toBe(0);
      await page.context().setOffline(false);
      let lose = true;
      const commands: string[] = [];
      await page.route(`${api}/invite-acceptances`, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        commands.push(route.request().postDataJSON().commandId);
        const actual = await route.fetch();
        if (actual.status() !== 200)
          throw new Error(
            "Real admission did not commit before the interrupted response",
          );
        if (lose) {
          lose = false;
          await route.abort("failed");
        } else await route.fulfill({ response: actual });
      });
      await button(page, "Repetir entrada pendente").click();
      await expect(text(page, /Sem confirmação do servidor/)).toBeVisible();
      await expect(button(page, "Abrir campeonato")).toHaveCount(0);
      expect((await state(owner, id)).tournament.participants).toHaveLength(1);
      expect(await uses(owner, id, invite.id)).toBe(1);
      await page.reload();
      await expect(button(page, "Repetir entrada pendente")).toBeVisible();
      await button(page, "Repetir entrada pendente").click();
      await expect(
        text(page, "Entrada confirmada. Você está na competição!"),
      ).toBeVisible();
      expect(commands).toHaveLength(2);
      expect(commands[0] === commands[1]).toBe(true);
      expect((await state(owner, id)).tournament.participants).toHaveLength(1);
      expect(await uses(owner, id, invite.id)).toBe(1);
      expect(await envelope(page)).toBe(before);
      expect(
        await page.evaluate(
          (secret) =>
            Object.keys(localStorage)
              .filter((k) => k.startsWith("matchmaking-remote-journal-v1:"))
              .every((k) => !localStorage.getItem(k)!.includes(secret)),
          invite.token,
        ),
      ).toBe(true);
      await button(page, "Abrir campeonato").click();
      await expect(text(page, "1/4 confirmados")).toBeVisible();
      await page.goto("/profile");
      await button(page, "Sair da conta").click();
      await login(page, b);
      await page.goto("/tournaments");
      await button(page, "Na nuvem").click();
      await expect(button(page, "Abrir Retomada do convite")).toHaveCount(0);
      await button(page, "Neste dispositivo").click();
      await expect(
        button(
          page,
          `Abrir ${tournamentFixture("draft", "local-invitation-proof").name}`,
        ),
      ).toHaveCount(1);
      expect(await envelope(page)).toBe(before);
      await page.goto(`/tournament/${id}/lobby?source=cloud`);
      await expect(
        text(page, "Sua conta não tem acesso a este campeonato."),
      ).toBeVisible();
      await page.goto("/profile");
      await button(page, "Sair da conta").click();
      await login(page, a);
      await page.goto("/tournaments");
      await button(page, "Na nuvem").click();
      await expect(button(page, "Abrir Retomada do convite")).toHaveCount(1);
      expect(await envelope(page)).toBe(before);
    } finally {
      await page.context().setOffline(false);
      await cleanup(owned);
    }
  });
});
