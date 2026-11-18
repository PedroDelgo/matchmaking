import { test, expect, type Page } from "@playwright/test";
async function persisted(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("matchmaking-local-v1")!).state,
  );
}
async function saveScore(page: Page, a: string, b: string) {
  const scores = page.locator('input[aria-label^="Placar de "]');
  await scores.nth(0).fill(a);
  await scores.nth(1).fill(b);
  await page
    .getByRole("button", { name: "Confirmar resultado", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salvar resultado", exact: true })
    .click();
}
test("cria, sorteia, conclui, recarrega e corrige um campeonato", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes("A text node cannot be a child of a <View>")
    )
      errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByText("Bora competir?", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `.artifacts/home-${testInfo.project.name}.png`,
  });
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((e) => e.clientWidth),
  );
  await page
    .getByRole("button", { name: "Criar campeonato", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByText("Dê um nome ao campeonato.", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByLabel("Nome do campeonato", { exact: true })
    .fill("Copa dos Amigos");
  await page.getByRole("radio", { name: "Videogame", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.screenshot({
    path: `.artifacts/create-${testInfo.project.name}.png`,
  });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Criar campeonato", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Campeonato criado! Agora é hora de reunir a galera.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sortear confrontos", exact: true }),
  ).toBeDisabled();
  for (const name of ["Pedro", "Lucas", "Marina", "Bia"]) {
    await page.getByLabel("Nome ou apelido", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Sortear confrontos", exact: true })
    .click();
  await expect(
    page.getByText("O caminho até o troféu", { exact: true }),
  ).toBeVisible();
  const state = await persisted(page),
    cup = state.tournaments[0];
  expect(new Set(cup.drawOrder).size).toBe(4);
  await page.screenshot({
    path: `.artifacts/bracket-${testInfo.project.name}.png`,
  });
  const first = cup.matches[0];
  await page
    .getByRole("button", { name: "Partida 1, Semifinais", exact: true })
    .click();
  await expect(page.getByText("Confronto 1", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `.artifacts/match-${testInfo.project.name}.png`,
  });
  await saveScore(page, "3", "1");
  await page
    .getByRole("button", { name: "Continuar no chaveamento", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Partida 2, Semifinais", exact: true })
    .click();
  await saveScore(page, "2", "0");
  await page
    .getByRole("button", { name: "Continuar no chaveamento", exact: true })
    .click();
  if (testInfo.project.name !== "desktop")
    await page.getByRole("button", { name: "Final", exact: true }).click();
  await page
    .getByRole("button", { name: "Partida 1, Final", exact: true })
    .click();
  await saveScore(page, "3", "1");
  await expect(page.getByText("Campeão!", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `.artifacts/champion-${testInfo.project.name}.png`,
  });
  const champion = (await persisted(page)).tournaments[0].championId;
  expect(champion).toBe(first.participant1Id);
  await page.reload();
  await expect(page.getByText("Campeão!", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Ver todos os resultados", exact: true })
    .click();
  if (testInfo.project.name !== "desktop")
    await page.getByRole("button", { name: "Semifinais", exact: true }).click();
  await page
    .getByRole("button", { name: "Partida 1, Semifinais", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Corrigir resultado", exact: true })
    .click();
  const scores = page.locator('input[aria-label^="Placar de "]');
  await scores.nth(0).fill("0");
  await scores.nth(1).fill("4");
  await page
    .getByRole("button", { name: "Confirmar resultado", exact: true })
    .click();
  await expect(
    page.getByText("A chave vai mudar", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar e atualizar chave", exact: true })
    .click();
  const corrected = (await persisted(page)).tournaments[0];
  expect(corrected.championId).toBeUndefined();
  expect(corrected.matches.at(-1).winnerId).toBeNull();
  expect(corrected.status).toBe("active");
  await page
    .getByRole("button", { name: "Continuar no chaveamento", exact: true })
    .click();
  await page.getByRole("tab", { name: /Estatísticas/ }).click();
  await expect(
    page.getByText("Ranking da disputa", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `.artifacts/stats-${testInfo.project.name}.png`,
  });
  expect(errors).toEqual([]);
});

test("sorteio de 16 tem animação pulável e ordem persistida", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/tournament/create");
  await page
    .getByLabel("Nome do campeonato", { exact: true })
    .fill("Copa de demonstração");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "16", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Criar campeonato", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", {
      name: "Preencher com participantes de exemplo",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Sortear confrontos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pular animação", exact: true }),
  ).toBeVisible();
  const order = (await persisted(page)).tournaments[0].drawOrder;
  // Capture the presentation after the Modal fade, while card reveals continue.
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `.artifacts/draw-${testInfo.project.name}.png`,
  });
  await page
    .getByRole("button", { name: "Pular animação", exact: true })
    .click();
  await expect(
    page.getByText("O caminho até o troféu", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("O caminho até o troféu", { exact: true }),
  ).toBeVisible();
  expect((await persisted(page)).tournaments[0].drawOrder).toEqual(order);
});
