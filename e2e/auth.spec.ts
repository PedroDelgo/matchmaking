import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";
import { tournamentFixture } from "../tests/fixtures/tournaments";

const apiUrl = "http://127.0.0.1:54321";
const mailUrl = "http://127.0.0.1:54324";
const publicKey = process.env.MATCHMAKING_AUTH_PUBLIC_KEY;
const serviceKey = process.env.MATCHMAKING_AUTH_SERVICE_KEY;
const databaseUrl = process.env.MATCHMAKING_TEST_DATABASE_URL;
const storageKey = "matchmaking-local-v1";

// Auth requests contain passwords and one-time credentials. Worker options must
// be declared at file scope; no trace or screenshot may persist these flows.
test.use({ trace: "off", screenshot: "off" });

type Resources = {
  emails: string[];
  users: Set<string>;
  messages: Set<string>;
};
type Mail = { ID: string; To?: { Address: string }[] };

function email(resources: Resources) {
  const value = `mm-browser-${randomUUID()}@example.test`;
  resources.emails.push(value);
  return value;
}

function localDatabase() {
  const parsed = new URL(databaseUrl!);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    parsed.port !== "54322" ||
    parsed.pathname !== "/postgres" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("O E2E de Auth requer somente o banco Supabase local.");
  return new Client({ connectionString: databaseUrl });
}

async function cleanup(resources: Resources) {
  const admin = createClient(apiUrl, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // A signup may succeed before the browser can capture its response. Match
  // only the random addresses created by this execution, never unrelated users.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error)
      throw new Error("Falha ao localizar contas temporárias para limpeza.");
    for (const user of data.users)
      if (user.email && resources.emails.includes(user.email))
        resources.users.add(user.id);
    if (data.users.length < 1000) break;
  }
  if (resources.users.size) {
    const database = localDatabase();
    await database.connect();
    try {
      await database.query(
        "delete from public.profiles where user_id = any($1::uuid[])",
        [[...resources.users]],
      );
    } finally {
      await database.end();
    }
    for (const id of resources.users) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error)
        throw new Error("Falha ao remover uma conta temporária de Auth.");
    }
  }
  const response = await fetch(`${mailUrl}/api/v1/messages`);
  if (response.ok) {
    const mailbox = (await response.json()) as { messages: Mail[] };
    for (const message of mailbox.messages)
      if (message.To?.some((to) => resources.emails.includes(to.Address)))
        resources.messages.add(message.ID);
  }
  if (resources.messages.size) {
    const removed = await fetch(`${mailUrl}/api/v1/messages`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ IDs: [...resources.messages] }),
    });
    if (!removed.ok)
      throw new Error("Falha ao remover os e-mails temporários desta execução.");
  }
}

const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true });
const button = (page: Page, label: string) =>
  page
    .getByRole("button", { name: label, exact: true })
    .filter({ visible: true });

async function seedLocalState(page: Page) {
  const tournament = tournamentFixture(
    "completed",
    `auth-local-${randomUUID()}`,
  );
  await page.addInitScript(
    (state) => {
      if (!localStorage.getItem("matchmaking-local-v1"))
        localStorage.setItem(
          "matchmaking-local-v1",
          JSON.stringify({ version: 1, state }),
        );
    },
    {
      tournaments: [tournament],
      profile: { id: "me", nickname: "Competidor local" },
      draft: {
        name: "Rascunho preservado",
        modality: "Futebol",
        customModality: "",
        capacity: 8,
        step: 0,
      },
    },
  );
  await page.goto("/profile");
  await expect(field(page, "Seu apelido")).toHaveValue("Competidor local");
  return page.evaluate((key) => localStorage.getItem(key), storageKey);
}

async function mailLink(address: string, resources: Resources) {
  let link = "";
  await expect
    .poll(
      async () => {
        const response = await fetch(`${mailUrl}/api/v1/messages`);
        if (!response.ok) return false;
        const mailbox = (await response.json()) as { messages: Mail[] };
        for (const message of mailbox.messages) {
          if (
            resources.messages.has(message.ID) ||
            !message.To?.some((to) => to.Address === address)
          )
            continue;
          const content = await fetch(
            `${mailUrl}/api/v1/message/${encodeURIComponent(message.ID)}`,
          );
          if (!content.ok) continue;
          const data = (await content.json()) as {
            HTML?: string;
            Text?: string;
          };
          const matches =
            `${data.HTML ?? ""}\n${data.Text ?? ""}`.match(
              /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/g,
            ) ?? [];
          for (const match of matches) {
            const candidate = new URL(match.replaceAll("&amp;", "&"));
            if (
              candidate.origin === apiUrl &&
              candidate.pathname === "/auth/v1/verify"
            ) {
              resources.messages.add(message.ID);
              link = candidate.toString();
              return true;
            }
          }
        }
        return false;
      },
      {
        timeout: 20000,
        message:
          "O e-mail local de confirmação/recuperação deve chegar ao Mailpit.",
      },
    )
    .toBe(true);
  return link;
}

async function openLink(page: Page, link: string) {
  try {
    await page.goto(link);
  } catch {
    throw new Error("Não foi possível abrir o link temporário de Auth local.");
  }
}

async function signUp(
  page: Page,
  address: string,
  password: string,
  resources: Resources,
) {
  await page.goto("/auth/sign-up");
  await field(page, "E-mail").fill(address);
  await field(page, "Senha").fill(password);
  await field(page, "Confirmar senha").fill(password);
  const response = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === "/auth/v1/signup" &&
      candidate.request().method() === "POST",
  );
  await button(page, "Criar conta").click();
  const signup = await response;
  if (!signup.ok()) throw new Error("O cadastro no Auth real não foi aceito.");
  const data = await signup.json();
  const id = data.id ?? data.user?.id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    throw new Error("O Auth real não retornou a identidade cadastrada.");
  resources.users.add(id);
  await expect(
    page
      .getByText(/Confira seu e-mail para confirmar a conta/)
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Conta conectada", { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(0);
  await openLink(page, await mailLink(address, resources));
  await expect.poll(() => new URL(page.url()).pathname).toBe("/profile");
  await expect(field(page, "Apelido da conta")).toHaveValue("Competidor");
}

async function signIn(page: Page, address: string, password: string) {
  await page.goto("/auth/sign-in");
  await field(page, "E-mail").fill(address);
  await field(page, "Senha").fill(password);
  await button(page, "Entrar").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/profile");
  await expect(field(page, "Apelido da conta")).toBeVisible();
}

async function signOut(page: Page) {
  await button(page, "Sair da conta").click();
  await expect(
    page
      .getByText("Conta conectada", { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(0);
  await expect(button(page, "Entrar")).toBeVisible();
}

test.describe("Supabase Auth real no navegador", () => {
  test.skip(
    !publicKey || !serviceKey || !databaseUrl,
    "Requer MATCHMAKING_AUTH_PUBLIC_KEY, MATCHMAKING_AUTH_SERVICE_KEY e MATCHMAKING_TEST_DATABASE_URL locais; mocks não substituem esta integração.",
  );

  test("cadastro confirmado, perfil, persistência, reentrada e isolamento A/B preservam campeonatos locais", async ({
    page,
  }) => {
    test.setTimeout(150000);
    const resources: Resources = {
      emails: [],
      users: new Set(),
      messages: new Set(),
    };
    let pageErrors = 0;
    page.on("pageerror", () => {
      pageErrors++;
    });
    try {
      const before = await seedLocalState(page);
      const accountA = email(resources),
        accountB = email(resources);
      const password = `Teste-${randomUUID()}-Aa1!`;
      await signUp(page, accountA, password, resources);
      await field(page, "Apelido da conta").fill("Conta Alfa");
      await button(page, "Salvar apelido da conta").click();
      await expect(
        page
          .getByText("Apelido da conta atualizado.", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      await page.reload();
      await expect(field(page, "Apelido da conta")).toHaveValue("Conta Alfa");
      await expect(
        page.getByText("Sua trajetória local", { exact: true }),
      ).toBeVisible();
      await signOut(page);
      await signIn(page, accountA, password);
      await expect(field(page, "Apelido da conta")).toHaveValue("Conta Alfa");
      await signOut(page);
      await signUp(page, accountB, password, resources);
      await expect(field(page, "Apelido da conta")).toHaveValue("Competidor");
      await expect(
        page.getByText("Conta Alfa", { exact: true }).filter({ visible: true }),
      ).toHaveCount(0);
      await field(page, "Apelido da conta").fill("Conta Beta");
      await button(page, "Salvar apelido da conta").click();
      await expect(
        page
          .getByText("Apelido da conta atualizado.", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      await signOut(page);
      await signIn(page, accountA, password);
      await expect(field(page, "Apelido da conta")).toHaveValue("Conta Alfa");
      expect(
        await page.evaluate((key) => localStorage.getItem(key), storageKey),
      ).toBe(before);
      expect(pageErrors).toBe(0);
    } finally {
      await cleanup(resources);
    }
  });

  test("recuperação real troca a senha, rejeita reutilização e mantém criação sem conta", async ({
    page,
  }) => {
    test.setTimeout(150000);
    const resources: Resources = {
      emails: [],
      users: new Set(),
      messages: new Set(),
    };
    let pageErrors = 0;
    page.on("pageerror", () => {
      pageErrors++;
    });
    try {
      const before = await seedLocalState(page);
      const address = email(resources);
      const oldPassword = `Anterior-${randomUUID()}-Aa1!`,
        newPassword = `Nova-${randomUUID()}-Aa1!`;
      await signUp(page, address, oldPassword, resources);
      await signOut(page);
      await page.goto("/auth/sign-in");
      await button(page, "Esqueci minha senha").click();
      await field(page, "E-mail").fill(address);
      await button(page, "Enviar link de recuperação").click();
      await expect(
        page
          .getByText(/Se houver uma conta para este e-mail/)
          .filter({ visible: true }),
      ).toBeVisible();
      const recoveryLink = await mailLink(address, resources);
      await openLink(page, recoveryLink);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/auth/reset-password");
      await field(page, "Nova senha").fill(newPassword);
      await field(page, "Confirmar senha").fill(newPassword);
      await button(page, "Salvar nova senha").click();
      await expect(
        page
          .getByText("Senha atualizada. Entre novamente com sua nova senha.", {
            exact: true,
          })
          .filter({ visible: true }),
      ).toBeVisible();
      await button(page, "Voltar para entrar").click();
      await field(page, "E-mail").fill(address);
      await field(page, "Senha").fill(oldPassword);
      await button(page, "Entrar").click();
      await expect(
        page
          .getByText("E-mail ou senha incorretos.", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      await field(page, "Senha").fill(newPassword);
      await button(page, "Entrar").click();
      await expect.poll(() => new URL(page.url()).pathname).toBe("/profile");
      await signOut(page);
      await openLink(page, recoveryLink);
      await expect(
        page
          .getByText(
            /Este link é inválido ou expirou|Não foi possível validar este link/,
          )
          .filter({ visible: true }),
      ).toBeVisible();
      await expect(field(page, "Nova senha")).toHaveCount(0);
      await button(page, "Continuar sem conta").click();
      expect(
        await page.evaluate((key) => localStorage.getItem(key), storageKey),
      ).toBe(before);
      await page.goto("/tournament/create");
      await field(page, "Nome do campeonato").fill("Copa local sem conta");
      await button(page, "Continuar").click();
      await button(page, "4").click();
      await button(page, "Continuar").click();
      await button(page, "Criar campeonato").last().click();
      await expect(
        page.getByText("Campeonato criado! Agora é hora de reunir a galera.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            (key) =>
              JSON.parse(localStorage.getItem(key)!).state.tournaments.length,
            storageKey,
          ),
        )
        .toBe(2);
      expect(pageErrors).toBe(0);
    } finally {
      await cleanup(resources);
    }
  });
});
