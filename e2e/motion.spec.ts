import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addParticipant,
  createTournament,
} from "../src/features/tournaments/engine/tournament";
import type {
  Tournament,
  TournamentCapacity,
} from "../src/features/tournaments/domain/types";
import { tournamentFixture } from "../tests/fixtures/tournaments";

const storageKey = "matchmaking-local-v1";
function room(capacity: TournamentCapacity) {
  let tournament = createTournament(
    { name: `Abertura com ${capacity}`, modality: "Futebol", capacity },
    `motion-${capacity}`,
  );
  for (let index = 0; index < capacity; index++)
    tournament = addParticipant(
      tournament,
      `Competidor ${String(index + 1).padStart(2, "0")}`,
    );
  return tournament;
}
async function seed(page: Page, tournament: Tournament) {
  await page.addInitScript(
    ({ key, cup }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            state: {
              tournaments: [cup],
              profile: { id: "me", nickname: "Pedro" },
              draft: {
                name: "",
                modality: "Futebol",
                customModality: "",
                capacity: 8,
                step: 0,
              },
            },
          }),
        );
    },
    { key: storageKey, cup: tournament },
  );
}
async function persisted(page: Page): Promise<Tournament> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).state.tournaments[0],
    storageKey,
  );
}
function monitor(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      (message.type() === "warning" &&
        message.text().includes("may be overwritten"))
    )
      errors.push(message.text());
  });
  return errors;
}

async function expectOpaque(target: Locator) {
  // Wait for the actual Modal/card opacity, so evidence does not capture a
  // translucent entrance. This also includes the animated contender children.
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const nodes = [element, ...Array.from(element.querySelectorAll("*"))];
        let ancestor = element.parentElement;
        while (ancestor) {
          nodes.push(ancestor);
          ancestor = ancestor.parentElement;
        }
        return nodes.every(
          (node) => Number(getComputedStyle(node).opacity) >= 1,
        );
      }),
    )
    .toBe(true);
}

for (const capacity of [4, 8, 16] as const) {
  test(`Match Reveal ${capacity}: a apresentação usa o sorteio salvo e pular mantém cada confronto`, async ({
    page,
  }, info) => {
    const errors = monitor(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const tournament = room(capacity);
    await seed(page, tournament);
    await page.goto(`/tournament/${tournament.id}/lobby`);
    await page
      .getByRole("button", { name: "Sortear confrontos", exact: true })
      .click();
    await expect(
      page.getByText("OS CONFRONTOS ESTÃO CHEGANDO", { exact: true }),
    ).toBeVisible();
    const saved = await persisted(page);
    expect(saved.status).toBe("active");
    expect(new Set(saved.drawOrder).size).toBe(capacity);
    expect(
      saved.matches
        .filter((match) => match.roundIndex === 0)
        .every((match) => match.participant1Id && match.participant2Id),
    ).toBe(true);
    expect(saved.drawOrder).toEqual(
      saved.matches
        .filter((match) => match.roundIndex === 0)
        .flatMap((match) => [match.participant1Id, match.participant2Id]),
    );
    await expectOpaque(page.getByTestId("match-reveal"));
    await page.screenshot({
      path: `.artifacts/stage4-draw-${capacity}-${info.project.name}.png`,
    });
    await page
      .getByRole("button", { name: "Pular animação", exact: true })
      .click();
    await expect(
      page.getByText("O caminho até o troféu", { exact: true }),
    ).toBeVisible();
    expect(await persisted(page)).toEqual(saved);
    await expect(page.getByTestId("match-reveal")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("Match Reveal completa suas fases e abre a chave sem nova ação do organizador", async ({
  page,
}, info) => {
  const errors = monitor(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const tournament = room(4);
  await seed(page, tournament);
  await page.goto(`/tournament/${tournament.id}/lobby`);
  await page
    .getByRole("button", { name: "Sortear confrontos", exact: true })
    .click();
  const saved = await persisted(page);
  await expect(
    page.getByText("OS CONFRONTOS ESTÃO CHEGANDO", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("TODO MUNDO NO JOGO.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("O DESTINO DA DISPUTA.", { exact: true }),
  ).toBeVisible();
  const pairs = page.getByTestId("match-reveal-pairs");
  await expect(pairs.getByTestId(/^revealed-match-/)).toHaveCount(2);
  for (const [index, match] of saved.matches
    .filter((item) => item.roundIndex === 0)
    .entries()) {
    const pair = page.getByTestId(`revealed-match-${index}`);
    for (const id of [match.participant1Id, match.participant2Id])
      await expect(
        pair.getByText(
          saved.participants.find((participant) => participant.id === id)!
            .displayName,
          { exact: true },
        ),
      ).toBeVisible();
  }
  await expectOpaque(pairs);
  await page.screenshot({
    path: `.artifacts/stage4-revealed-${info.project.name}.png`,
  });
  await expect(
    page.getByText("O caminho até o troféu", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/tournament/${tournament.id}/bracket$`),
  );
  expect(await persisted(page)).toEqual(saved);
  await expect(page.getByTestId("match-reveal")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Champion Reveal termina, mantém a final e não repete após compartilhar ou mudar a preferência", async ({
  page,
}, info) => {
  const errors = monitor(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const tournament = tournamentFixture("completed", "motion-champion");
  await seed(page, tournament);
  await page.addInitScript(() => {
    const scope = window as typeof window & {
      shareCalls: number;
      completeShare?: () => void;
    };
    scope.shareCalls = 0;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => {
        scope.shareCalls += 1;
        return new Promise<void>((resolve) => {
          scope.completeShare = resolve;
        });
      },
    });
  });
  await page.goto(`/tournament/${tournament.id}/champion`);
  await expect(page.getByTestId("champion-confetti")).toHaveCount(1);
  await expect(page.getByText("Campeão!", { exact: true })).toBeVisible();
  const final = tournament.matches.find((match) => match.nextMatchId === null)!;
  const champion = tournament.participants.find(
    (participant) => participant.id === tournament.championId,
  )!;
  const result = page.getByTestId("champion-final-result");
  await expect(
    result.getByText(`${final.score1} × ${final.score2}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("champion-reveal")
      .getByText(champion.displayName, { exact: true })
      .first(),
  ).toBeVisible();
  await expect(page.getByTestId("champion-trophy")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: `.artifacts/stage4-champion-${info.project.name}.png`,
  });
  const share = page.getByRole("button", {
    name: "Compartilhar conquista",
    exact: true,
  });
  await share.evaluate((element: HTMLElement) => {
    element.click();
    element.click();
  });
  await expect(share).toBeDisabled();
  expect(
    await page.evaluate(
      () => (window as typeof window & { shareCalls: number }).shareCalls,
    ),
  ).toBe(1);
  await expect(page.getByTestId("champion-confetti")).toHaveCount(0, {
    timeout: 7000,
  });
  await page.evaluate(() =>
    (
      window as typeof window & { completeShare?: () => void }
    ).completeShare?.(),
  );
  await expect(
    page.getByText("Compartilhamento aberto.", { exact: true }),
  ).toBeVisible();
  await expect(share).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Pular celebração", exact: true }),
  ).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    )
    .toBe(true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Let the platform preference event reach React before asserting no replay.
  await page.waitForTimeout(250);
  await expect(page.getByTestId("champion-confetti")).toHaveCount(0);
  await expect(
    result.getByText(`${final.score1} × ${final.score2}`, { exact: true }),
  ).toBeVisible();
  expect(await persisted(page)).toEqual(tournament);
  await page
    .getByRole("button", { name: "Ver todos os resultados", exact: true })
    .click();
  await expect(
    page.getByText("O caminho até o troféu", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("champion-confetti")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("navegar para fora da sala encerra a apresentação e não redireciona depois do prazo", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const tournament = room(16);
  await seed(page, tournament);
  await page.goto(`/tournament/${tournament.id}/lobby`);
  await page
    .getByRole("button", { name: "Sortear confrontos", exact: true })
    .click();
  await expect(page.getByTestId("match-reveal")).toBeVisible();
  const saved = await persisted(page);
  // A programmatic SPA navigation models a deep link or external Router action
  // while the Modal covers the app; it keeps the previous stack screen mounted.
  await page
    .getByRole("button", {
      name: "Abrir perfil de Pedro",
      exact: true,
      includeHidden: true,
    })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page).toHaveURL(/\/profile$/);
  await expect(
    page.getByText("Perfil de competidor", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("match-reveal")).toHaveCount(0);
  // The longest draw lasts 3450ms. Waiting beyond it detects a stale navigation
  // timer that could silently take the user away from their chosen destination.
  await page.waitForTimeout(4000);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByTestId("match-reveal")).toHaveCount(0);
  expect(await persisted(page)).toEqual(saved);
  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`/tournament/${tournament.id}/lobby$`),
  );
  await expect(
    page.getByRole("button", { name: "Sortear confrontos", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("match-reveal")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ver chaveamento", exact: true })
    .click();
  await expect(
    page.getByText("O caminho até o troféu", { exact: true }),
  ).toBeVisible();
  expect(await persisted(page)).toEqual(saved);
  expect(errors).toEqual([]);
});
