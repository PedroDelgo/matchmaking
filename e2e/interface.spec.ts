import { test, expect } from "@playwright/test";
import { tournamentFixture } from "../tests/fixtures/tournaments";

test("Home vazia, entrada por código e navegação principal funcionam", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByText("Seu primeiro campeonato começa aqui.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar campeonato", exact: true }).last(),
  ).toHaveCSS("background-color", "rgb(255, 106, 0)");
  await expect(
    page.getByRole("tab", { name: "Início", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Entrar com código", exact: true })
    .click();
  await expect(
    page.getByLabel("Código do convite", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Torneios", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Torneios", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Perfil", exact: true }).click();
  await expect(
    page.getByText("Perfil de competidor", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Início", exact: true }).click();
  const logo = page
    .getByRole("link", { name: "Matchmaking, início", exact: true })
    .locator("img");
  await expect(logo).toBeVisible();
  expect(
    await logo.evaluate(
      (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.fonts.check('16px "Inter_400Regular"') &&
          document.fonts.check('32px "BarlowCondensed_800ExtraBold"'),
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: `.artifacts/stage2-empty-${info.project.name}.png`,
  });
  const create = page
    .getByRole("button", { name: "Criar campeonato", exact: true })
    .first();
  await create.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByLabel("Nome do campeonato", { exact: true }),
  ).toBeVisible();
});

test("dados locais alimentam cards, filtros e perfil, sem números fictícios", async ({
  page,
}, info) => {
  const tournaments = [
    tournamentFixture("draft"),
    tournamentFixture("active"),
    tournamentFixture("completed"),
  ];
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
      profile: { id: "me", nickname: "Pedro" },
      draft: {
        name: "",
        modality: "Futebol",
        customModality: "",
        capacity: 8,
        step: 0,
      },
    },
  );
  await page.goto("/");
  for (const t of tournaments)
    await expect(
      page.getByRole("button", { name: `Abrir ${t.name}`, exact: true }),
    ).toBeVisible();
  await expect(page.getByText("Campeão: Ana", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `.artifacts/stage2-data-${info.project.name}.png`,
  });
  await page
    .getByRole("button", { name: "Abrir Copa de sábado", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `.artifacts/stage2-cards-${info.project.name}.png`,
  });
  if (info.project.name === "desktop" || info.project.name === "tablet") {
    const first = await page
        .getByRole("button", { name: "Abrir Copa de sábado", exact: true })
        .boundingBox(),
      second = await page
        .getByRole("button", { name: "Abrir Liga dos amigos", exact: true })
        .boundingBox();
    expect(second!.x).toBeGreaterThan(first!.x);
    expect(Math.abs(second!.y - first!.y)).toBeLessThan(3);
  }
  await page.getByRole("button", { name: "Ver todos", exact: true }).click();
  await page.getByRole("button", { name: "Concluídos", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Abrir Desafio da praça", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir Copa de sábado", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Buscar campeonato", { exact: true })
    .fill("inexistente");
  await expect(
    page.getByText("Nenhum campeonato por aqui.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Abrir Copa de sábado", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Perfil", exact: true }).click();
  await expect(
    page.getByText("2 partidas disputadas · 100% de aproveitamento", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Seu apelido", { exact: true }).fill("Pedrão");
  await page
    .getByRole("button", { name: "Salvar perfil", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Seu apelido", { exact: true })).toHaveValue(
    "Pedrão",
  );
  await page.getByRole("tab", { name: "Torneios", exact: true }).click();
  await page
    .getByRole("button", { name: "Abrir Liga dos amigos", exact: true })
    .click();
  await expect(
    page.getByText("O caminho até o troféu", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Torneios", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("matchmaking-local-v1")!).state
          .tournaments.length,
    ),
  ).toBe(3);
});

test("falha das fontes libera Home legível com fallback", async ({ page }) => {
  await page.route(/\/assets\/.*\.(ttf|otf)(\?.*)?$/, (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByText(
      "Não foi possível carregar as fontes. Estamos usando as fontes do dispositivo.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Bora competir?", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Criar campeonato", exact: true })
    .first()
    .click();
  await expect(
    page.getByLabel("Nome do campeonato", { exact: true }),
  ).toBeVisible();
});
