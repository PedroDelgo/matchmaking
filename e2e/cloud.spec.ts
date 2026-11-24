import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { tournamentFixture } from "../tests/fixtures/tournaments";
import { canonicalSnapshot } from "../src/features/tournaments/domain/snapshot";
import type {
  Tournament,
  TournamentCapacity,
} from "../src/features/tournaments/domain/types";

const authUrl = "http://127.0.0.1:54321",
  api = process.env.MATCHMAKING_API_URL,
  publicKey = process.env.MATCHMAKING_AUTH_PUBLIC_KEY,
  serviceKey = process.env.MATCHMAKING_AUTH_SERVICE_KEY;
test.use({ trace: "off", screenshot: "off" });
type Account = { id: string; email: string; password: string; token: string };
const button = (page: Page, label: string) =>
  page
    .getByRole("button", { name: label, exact: true })
    .filter({ visible: true });
const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true });
async function account(resources: Account[]): Promise<Account> {
  const admin = createClient(authUrl, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    email = `mm-cloud-${randomUUID()}@example.test`,
    password = `Cloud!${randomUUID()}a9`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error("Could not create this proof's temporary account");
  const result = { id: created.data.user.id, email, password, token: "" };
  resources.push(result);
  const sdk = createClient(authUrl, publicKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    signed = await sdk.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session)
    throw new Error("Real Auth login failed");
  result.token = signed.data.session.access_token;
  return result;
}
async function cleanup(accounts: Account[]) {
  if (!accounts.length) return;
  const url = new URL(process.env.MATCHMAKING_TEST_DATABASE_URL!);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "54322" ||
    url.pathname !== "/postgres" ||
    url.search ||
    url.hash
  )
    throw new Error("Only local cleanup is allowed");
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    const ids = accounts.map((a) => a.id);
    await db.query("begin");
    await db.query(
      "select user_id from public.profiles where user_id=any($1::uuid[]) for update",
      [ids],
    );
    const { rows } = await db.query(
        "select id from public.tournaments where owner_user_id=any($1::uuid[]) for update",
        [ids],
      ),
      tournaments = rows.map((r) => r.id);
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
    await db.query("delete from public.tournaments where id=any($1::uuid[])", [
      tournaments,
    ]);
    await db.query(
      "delete from public.profiles where user_id=any($1::uuid[])",
      [ids],
    );
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    await db.end();
  }
  const admin = createClient(authUrl, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const a of accounts) {
    const { error } = await admin.auth.admin.deleteUser(a.id);
    if (error)
      throw new Error("Could not remove this proof's temporary account");
  }
}
async function login(page: Page, a: Account) {
  await page.goto("/auth/sign-in");
  await field(page, "E-mail").fill(a.email);
  await field(page, "Senha").fill(a.password);
  await button(page, "Entrar").click();
  await expect(field(page, "Apelido da conta")).toBeVisible();
}
async function request(a: Account, path: string, body?: unknown) {
  const r = await fetch(`${api}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${a.token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Proof API returned ${r.status}`);
  return r.json();
}
async function createOnline(
  page: Page,
  a: Account,
  capacity: TournamentCapacity,
  name: string,
) {
  await page.goto("/tournament/create");
  await field(page, "Nome do campeonato").fill(name);
  await button(page, "Continuar").click();
  await button(page, String(capacity)).click();
  await button(page, "Continuar").click();
  await page
    .getByRole("radio", { name: "Na minha conta", exact: true })
    .click();
  await button(page, "Criar campeonato").last().click();
  await expect(page).toHaveURL(
    /\/tournament\/[a-f0-9-]+\/lobby\?created=1&source=cloud/,
  );
  await expect(
    page.getByText(name, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const id = /\/tournament\/([^/]+)/.exec(new URL(page.url()).pathname)![1];
  const result = await request(a, `/tournaments/${id}`);
  expect(result.tournament.name).toBe(name);
  return id;
}
async function seedLocal(page: Page, tournaments: Tournament[]) {
  await page.addInitScript(
    (state) => {
      if (!localStorage.getItem("matchmaking-local-v1"))
        localStorage.setItem(
          "matchmaking-local-v1",
          JSON.stringify({ version: 1, state }),
        );
    },
    {
      tournaments,
      profile: { id: "me", nickname: "Competidor local" },
      draft: {
        name: "Rascunho local",
        modality: "Truco",
        customModality: "",
        capacity: 8,
        step: 0,
      },
    },
  );
}
async function envelope(page: Page) {
  return page.evaluate(() => localStorage.getItem("matchmaking-local-v1"));
}
async function save(page: Page, a = "3", b = "1") {
  const scores = page
    .locator('input[aria-label^="Placar de "]')
    .filter({ visible: true });
  await scores.nth(0).fill(a);
  await scores.nth(1).fill(b);
  await button(page, "Confirmar resultado").click();
  await button(page, "Salvar resultado").click();
}
async function openMatch(page: Page, id: string, t: Tournament, index: number) {
  await page.goto(`/tournament/${id}/bracket?source=cloud`);
  const m = t.matches[index],
    round = t.rounds[m.roundIndex].label;
  const roundButton = button(page, round);
  if (await roundButton.count()) await roundButton.click();
  await button(page, `Partida ${m.positionIndex + 1}, ${round}`).click();
  await expect(page).toHaveURL(/source=cloud/);
  await expect(
    page
      .locator('input[aria-label^="Placar de "]')
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}

test.describe("Campeonatos na nuvem com Auth, HTTP e PostgreSQL reais", () => {
  test.skip(
    !api ||
      !publicKey ||
      !serviceKey ||
      !process.env.MATCHMAKING_TEST_DATABASE_URL,
    "Use npm run test:auth:e2e",
  );
  for (const capacity of [4, 8, 16] as const)
    test(`${capacity}: cria pela UI, participantes, sorteio, campeão, estatísticas e outra sessão`, async ({
      page,
      browser,
    }) => {
      test.setTimeout(180000);
      const accounts: Account[] = [];
      let second: BrowserContext | undefined;
      try {
        const a = await account(accounts);
        await login(page, a);
        const id = await createOnline(page, a, capacity, `Nuvem ${capacity}`);
        await expect(
          page
            .getByText("Na nuvem · confirmação pelo servidor", { exact: true })
            .filter({ visible: true }),
        ).toBeVisible();
        if (capacity === 4) {
          await button(page, "Adicionar").click();
          await expect(
            page
              .getByText(
                "Use um nome de até 80 caracteres, sem deixar o campo vazio.",
                { exact: true },
              )
              .filter({ visible: true }),
          ).toBeVisible();
          expect(
            (await request(a, `/tournaments/${id}`)).tournament.participants,
          ).toHaveLength(0);
        }
        for (let i = 1; i <= capacity; i++) {
          await field(page, "Nome ou apelido").fill(`Rival ${i}`);
          await button(page, "Adicionar").click();
          await expect(
            page
              .getByText(`${i}/${capacity} confirmados`, { exact: true })
              .filter({ visible: true }),
          ).toBeVisible();
        }
        await button(page, "Remover Rival 2, jogador 2").click();
        await button(page, "Remover").click();
        await expect(
          page
            .getByText(`${capacity - 1}/${capacity} confirmados`, {
              exact: true,
            })
            .filter({ visible: true }),
        ).toBeVisible();
        await field(page, "Nome ou apelido").fill("Substituto");
        await button(page, "Adicionar").click();
        await expect(
          page
            .getByText(`${capacity}/${capacity} confirmados`, { exact: true })
            .filter({ visible: true }),
        ).toBeVisible();
        await button(page, "Sortear confrontos").click();
        await expect(
          page
            .getByText("O caminho até o troféu", { exact: true })
            .filter({ visible: true }),
        ).toBeVisible();
        let remote = await request(a, `/tournaments/${id}`),
          draw = [...remote.tournament.drawOrder];
        for (let i = 0; i < capacity - 1; i++) {
          await openMatch(page, id, remote.tournament, i);
          await save(page);
          if (i < capacity - 2)
            await expect(
              button(page, "Continuar no chaveamento"),
            ).toBeVisible();
          else
            await expect(
              page
                .getByText("Campeão!", { exact: true })
                .filter({ visible: true }),
            ).toBeVisible();
          remote = await request(a, `/tournaments/${id}`);
        }
        expect(remote.tournament.status).toBe("completed");
        expect(remote.tournament.drawOrder).toEqual(draw);
        expect(remote.tournament.championId).toBe(draw[0]);
        await page.reload();
        await expect(
          page.getByText("Campeão!", { exact: true }).filter({ visible: true }),
        ).toBeVisible();
        await page.goto(`/tournament/${id}/stats?source=cloud`);
        await expect(
          page
            .getByText("Ranking da disputa", { exact: true })
            .filter({ visible: true }),
        ).toBeVisible();
        await page.goto("/tournaments");
        await button(page, "Na nuvem").click();
        await expect(button(page, `Abrir Nuvem ${capacity}`)).toHaveCount(1);
        await button(page, `Abrir Nuvem ${capacity}`).click();
        await expect(page).toHaveURL(
          new RegExp(`/tournament/${id}/bracket\\?source=cloud`),
        );
        second = await browser.newContext({
          baseURL: "http://127.0.0.1:8081",
          viewport: page.viewportSize()!,
          reducedMotion: "reduce",
        });
        const other = await second.newPage();
        await login(other, a);
        await other.goto("/tournaments");
        await expect(button(other, `Abrir Nuvem ${capacity}`)).toHaveCount(1);
        await button(other, `Abrir Nuvem ${capacity}`).click();
        await expect(
          other
            .getByText("O caminho até o troféu", { exact: true })
            .filter({ visible: true }),
        ).toBeVisible();
        expect(
          await page
            .locator("body")
            .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
        ).toBe(true);
      } finally {
        await second?.close();
        await cleanup(accounts);
      }
    });
  test("importa draft/andamento/concluído, confere cópias, retoma resposta perdida e preserva original byte a byte", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const accounts: Account[] = [];
    const snapshots = [
      tournamentFixture("draft", "legacy-empty"),
      tournamentFixture("active", "legacy-active"),
      tournamentFixture("completed", "legacy-completed"),
    ];
    try {
      const a = await account(accounts);
      await seedLocal(page, snapshots);
      await login(page, a);
      const before = await envelope(page);
      let lose = true;
      await page.route(`${api}/tournament-imports`, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        const actual = await route.fetch();
        expect(actual.status()).toBe(200);
        if (lose) {
          lose = false;
          await route.abort("failed");
        } else await route.fulfill({ response: actual });
      });
      for (const [i, t] of snapshots.entries()) {
        await page.goto(
          `/tournament/${t.id}/${t.status === "draft" ? "lobby" : "bracket"}`,
        );
        await button(page, "Salvar na minha conta").click();
        await expect(
          page
            .getByText(/Vamos criar uma cópia/)
            .filter({ visible: true })
            .last(),
        ).toBeVisible();
        await button(page, "Confirmar cópia").click();
        if (i === 0) {
          await expect(
            page
              .getByText(/Sem confirmação do servidor/)
              .filter({ visible: true }),
          ).toBeVisible();
          await page.reload();
          await button(page, "Salvar na minha conta").click();
          await button(page, "Confirmar cópia").click();
        }
        await expect(
          page
            .getByText(
              "Cópia salva e conferida. O original continua neste dispositivo.",
              { exact: true },
            )
            .filter({ visible: true }),
        ).toBeVisible();
        await button(page, "Salvar na minha conta").click();
        await button(page, "Confirmar cópia").click();
        await expect(button(page, "Abrir cópia na nuvem")).toBeVisible();
        expect(await envelope(page)).toBe(before);
      }
      const list = await request(a, "/tournaments");
      expect(list.items).toHaveLength(3);
      for (const summary of list.items) {
        const detail = await request(a, `/tournaments/${summary.tournamentId}`);
        const original = snapshots.find((t) => t.id === detail.tournament.id)!;
        expect(canonicalSnapshot(detail.tournament)).toBe(
          canonicalSnapshot(original),
        );
      }
      await page.goto("/tournaments");
      await button(page, "Neste dispositivo").click();
      for (const t of snapshots)
        await expect(button(page, `Abrir ${t.name}`)).toHaveCount(1);
      await button(page, "Na nuvem").click();
      for (const t of snapshots)
        await expect(button(page, `Abrir ${t.name}`)).toHaveCount(1);
      expect(await envelope(page)).toBe(before);
    } finally {
      await cleanup(accounts);
    }
  });
  test("conflito entre clientes, falha offline e retomada exata não simulam confirmação", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120000);
    const accounts: Account[] = [];
    let second: BrowserContext | undefined;
    try {
      const a = await account(accounts);
      await login(page, a);
      const id = await createOnline(page, a, 4, "Concorrência real");
      second = await browser.newContext({
        baseURL: "http://127.0.0.1:8081",
        viewport: page.viewportSize()!,
        reducedMotion: "reduce",
      });
      const other = await second.newPage();
      await login(other, a);
      await other.goto(`/tournament/${id}/lobby?source=cloud`);
      await expect(field(other, "Nome ou apelido")).toBeVisible();
      await field(page, "Nome ou apelido").fill("Primeiro");
      await button(page, "Adicionar").click();
      await expect(
        page
          .getByText("1/4 confirmados", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      await field(other, "Nome ou apelido").fill("Segundo");
      await button(other, "Adicionar").click();
      await expect(
        other
          .getByText(/revise sua intenção e confirme novamente/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      expect(
        (await request(a, `/tournaments/${id}`)).tournament.participants,
      ).toHaveLength(1);
      await button(other, "Adicionar").click();
      await expect(
        other
          .getByText("2/4 confirmados", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      let lose = true;
      await other.route(`${api}/commands`, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        const actual = await route.fetch();
        expect(actual.status()).toBe(200);
        if (lose) {
          lose = false;
          await route.abort("failed");
        } else await route.fulfill({ response: actual });
      });
      await field(other, "Nome ou apelido").fill("Terceiro");
      await button(other, "Adicionar").click();
      await expect(
        other
          .getByText(/Sem confirmação do servidor/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      await expect(
        other
          .getByText("2/4 confirmados", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      expect(
        (await request(a, `/tournaments/${id}`)).tournament.participants,
      ).toHaveLength(3);
      await other.reload();
      await expect(button(other, "Repetir tentativa pendente")).toBeVisible();
      await button(other, "Repetir tentativa pendente").click();
      await expect(button(other, "Repetir tentativa pendente")).toHaveCount(0);
      await expect(
        other
          .getByText("3/4 confirmados", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      await other.unroute(`${api}/commands`);
      await second.setOffline(true);
      await field(other, "Nome ou apelido").fill("Offline");
      await button(other, "Adicionar").click();
      await expect(
        other
          .getByText(/Sem confirmação do servidor/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      await expect(
        other
          .getByText("3/4 confirmados", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      await second.setOffline(false);
      await button(other, "Repetir tentativa pendente").click();
      await expect(
        other
          .getByText("4/4 confirmados", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      const final = await request(a, `/tournaments/${id}`);
      expect(final.revision).toBe(5);
      expect(final.tournament.participants).toHaveLength(4);
    } finally {
      await second?.close();
      await cleanup(accounts);
    }
  });
  test("seleção nuvem preserva rascunho no login e troca A/B limpa cards sem tocar dados locais", async ({
    page,
  }) => {
    test.setTimeout(90000);
    const accounts: Account[] = [];
    try {
      const a = await account(accounts),
        b = await account(accounts);
      const local = tournamentFixture("draft", "local-identity");
      await seedLocal(page, [local]);
      await page.goto("/tournament/create");
      await field(page, "Nome do campeonato").fill("Rascunho da conta");
      await button(page, "Continuar").click();
      await button(page, "4").click();
      await button(page, "Continuar").click();
      await page
        .getByRole("radio", { name: "Na minha conta", exact: true })
        .click();
      await button(page, "Entrar e continuar criação").click();
      await field(page, "E-mail").fill(a.email);
      await field(page, "Senha").fill(a.password);
      await button(page, "Entrar").click();
      await expect(page).toHaveURL(/\/tournament\/create$/);
      await expect(
        page
          .getByText("Rascunho da conta", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      expect((await request(a, "/tournaments")).items).toHaveLength(0);
      let loseCreation = true;
      await page.route(`${api}/tournaments`, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        const actual = await route.fetch();
        expect(actual.status()).toBe(200);
        if (loseCreation) {
          loseCreation = false;
          await route.abort("failed");
        } else await route.fulfill({ response: actual });
      });
      await button(page, "Criar campeonato").last().click();
      await expect(
        page.getByText(/Sem confirmação do servidor/).filter({ visible: true }),
      ).toBeVisible();
      await page.reload();
      await button(page, "Retomar criação pendente").click();
      await expect(page).toHaveURL(/source=cloud/);
      expect((await request(a, "/tournaments")).items).toHaveLength(1);
      const before = await envelope(page);
      await page.goto("/profile");
      await button(page, "Sair da conta").click();
      await login(page, b);
      await page.goto("/tournaments");
      await button(page, "Na nuvem").click();
      await expect(button(page, "Abrir Rascunho da conta")).toHaveCount(0);
      await button(page, "Neste dispositivo").click();
      await expect(button(page, `Abrir ${local.name}`)).toHaveCount(1);
      expect(await envelope(page)).toBe(before);
      await page.goto("/profile");
      await button(page, "Sair da conta").click();
      await login(page, a);
      await page.goto("/tournaments");
      await button(page, "Na nuvem").click();
      await expect(button(page, "Abrir Rascunho da conta")).toHaveCount(1);
      expect(await envelope(page)).toBe(before);
    } finally {
      await cleanup(accounts);
    }
  });
});
