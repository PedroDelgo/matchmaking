import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addParticipant,
  createTournament,
  startTournament,
} from "../src/features/tournaments/engine/tournament";
import type {
  Match,
  Tournament,
  TournamentCapacity,
} from "../src/features/tournaments/domain/types";

const storageKey = "matchmaking-local-v1";
const longName = "Alexandre Maximiliano de Souza Rodrigues";
const initialDraft = {
  name: "Próxima edição em rascunho",
  modality: "Videogame",
  customModality: "",
  capacity: 16 as const,
  step: 1,
};

type SavedState = {
  tournaments: Tournament[];
  profile: { id: string; nickname: string };
  draft: {
    name: string;
    modality: string;
    customModality: string;
    capacity: TournamentCapacity;
    step: number;
  };
};

// Only the initial setup uses fixtures. Every result and subsequent change is
// entered through the interface; reads below inspect the real persisted state.
function fixtures(capacity: 8 | 16) {
  let cup = createTournament(
    { name: `Homologação com ${capacity}`, modality: "Futebol", capacity },
    `stability-${capacity}`,
  );
  for (let i = 0; i < capacity; i++)
    cup = addParticipant(
      cup,
      i === 0 ? longName : `Competidor ${String(i + 1).padStart(2, "0")}`,
      i === 0 ? "me" : undefined,
    );
  cup = startTournament(cup, () => 0.999);
  let parallel = createTournament(
    { name: "Copa paralela", modality: "Xadrez", capacity: 4 },
    `parallel-${capacity}`,
  );
  for (const name of ["Ana", "Bruno"])
    parallel = addParticipant(parallel, name);
  return { cup, parallel };
}

async function readState(page: Page): Promise<SavedState> {
  return page.evaluate((key) => {
    const stored = localStorage.getItem(key);
    if (!stored) throw new Error("O estado local não foi persistido.");
    return JSON.parse(stored).state;
  }, storageKey);
}

async function readCup(page: Page, id: string): Promise<Tournament> {
  const cup = (await readState(page)).tournaments.find((t) => t.id === id);
  if (!cup) throw new Error(`Campeonato ${id} não encontrado.`);
  return cup;
}

async function openMatch(page: Page, match: Match, cup: Tournament) {
  await expect(
    page.getByText("O caminho até o troféu", { exact: true }),
  ).toBeVisible();
  const round = cup.rounds[match.roundIndex].label;
  const selector = page.getByRole("button", { name: round, exact: true });
  if (await selector.count()) await selector.click();
  await page
    .getByRole("button", {
      name: `Partida ${match.positionIndex + 1}, ${round}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByText(`Confronto ${match.positionIndex + 1}`, { exact: true }),
  ).toBeVisible();
}

async function fillScore(page: Page, score1: string, score2: string) {
  const inputs = page.locator('input[aria-label^="Placar de "]');
  await inputs.nth(0).fill(score1);
  await inputs.nth(1).fill(score2);
  await page
    .getByRole("button", { name: "Confirmar resultado", exact: true })
    .click();
}

async function returnToBracket(page: Page) {
  await page
    .getByRole("button", { name: "Continuar no chaveamento", exact: true })
    .click();
  await expect(
    page.getByText("O caminho até o troféu", { exact: true }),
  ).toBeVisible();
}

async function expectWithinViewport(page: Page, target: Locator) {
  // Router keeps the previous screen mounted behind a pushed match screen.
  target = target.filter({ visible: true });
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const width = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  expect(
    await target.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  expect(
    await page
      .locator("body")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
}

for (const capacity of [8, 16] as const) {
  test(`${capacity} participantes: rodadas, recargas e isolamento${capacity === 8 ? ", com correção invalidando a final" : ""}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      // Includes development-only React Native Web text-node diagnostics.
      if (message.type() === "error") errors.push(message.text());
    });
    const { cup, parallel } = fixtures(capacity);
    expect(longName).toHaveLength(40);
    await page.addInitScript(
      ({ key, state }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify({ version: 1, state }));
      },
      {
        key: storageKey,
        state: {
          tournaments: [cup, parallel],
          profile: { id: "me", nickname: longName },
          draft: initialDraft,
        },
      },
    );
    await page.goto(`/tournament/${cup.id}/bracket`);
    await expect(
      page.getByText(
        `0 de ${capacity - 1} partidas concluídas · ${capacity} participantes`,
        {
          exact: true,
        },
      ),
    ).toBeVisible();

    for (const [index, match] of cup.matches.entries()) {
      await openMatch(page, match, cup);
      await fillScore(page, index === 0 ? "999999" : "3", "1");
      await page
        .getByRole("button", { name: "Salvar resultado", exact: true })
        .click();
      await expect
        .poll(async () => (await readCup(page, cup.id)).matches[index].winnerId)
        .not.toBeNull();
      const saved = await readCup(page, cup.id);
      const current = saved.matches[index];
      expect(current.status).toBe("completed");
      expect(current.winnerId).toBe(current.participant1Id);
      expect(current.score1).toBe(index === 0 ? 999999 : 3);
      expect(current.score2).toBe(1);
      if (current.nextMatchId) {
        const next = saved.matches.find((m) => m.id === current.nextMatchId)!;
        expect(
          current.positionIndex % 2 === 0
            ? next.participant1Id
            : next.participant2Id,
        ).toBe(current.winnerId);
        expect(next.status).toBe(
          next.participant1Id && next.participant2Id ? "ready" : "waiting",
        );
        await returnToBracket(page);
      }
      if (index === 1) {
        // A reload while most of the bracket is still unfinished must keep the
        // draw order, scores, propagation, unrelated cup, and creation draft.
        const beforeReload = await readState(page);
        await page.reload();
        await expect(
          page.getByText("O caminho até o troféu", { exact: true }),
        ).toBeVisible();
        expect(await readState(page)).toEqual(beforeReload);
        expect(beforeReload.draft).toEqual(initialDraft);
        expect(
          beforeReload.tournaments.find((t) => t.id === parallel.id),
        ).toEqual(parallel);
      }
      if (index === 0) {
        // Reopen the saved high score to exercise the read-only score layout.
        await openMatch(page, match, cup);
        await expectWithinViewport(
          page,
          page.getByText("999999", { exact: true }),
        );
        await expectWithinViewport(
          page,
          page.getByText(longName, { exact: true }),
        );
        await page.screenshot({
          path: `.artifacts/stage3-score-${capacity}-${info.project.name}.png`,
        });
        await returnToBracket(page);
      }
    }

    await expect(page.getByText("Campeão!", { exact: true })).toBeVisible();
    await expectWithinViewport(page, page.getByText(longName, { exact: true }));
    await expect(
      page.getByText(String(999999 + 3 * (Math.log2(capacity) - 1)), {
        exact: true,
      }),
    ).toBeVisible();
    const completed = await readCup(page, cup.id);
    expect(completed.status).toBe("completed");
    expect(completed.championId).toBe(cup.participants[0].id);
    expect(completed.drawOrder).toEqual(cup.drawOrder);
    expect(completed.matches.every((m) => m.status === "completed")).toBe(true);
    expect(completed.rounds.every((r) => r.status === "completed")).toBe(true);
    await page.screenshot({
      path: `.artifacts/stage3-champion-${capacity}-${info.project.name}.png`,
    });
    await page.reload();
    await expect(page.getByText("Campeão!", { exact: true })).toBeVisible();
    expect(await readCup(page, cup.id)).toEqual(completed);

    await page
      .getByRole("button", { name: "Ver todos os resultados", exact: true })
      .click();
    await page.getByRole("tab", { name: "Estatísticas", exact: true }).click();
    await expect(
      page.getByText("Ranking da disputa", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`${capacity - 1}/${capacity - 1}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(String(1000000 + (capacity - 2) * 4), { exact: true }),
    ).toBeVisible();

    // Mutating another tournament must not change the completed bracket, while
    // a separate in-progress creation draft remains available after reloads.
    await page.getByRole("tab", { name: "Torneios", exact: true }).click();
    await page
      .getByRole("button", { name: `Abrir ${parallel.name}`, exact: true })
      .click();
    await expect(
      page.getByText("2/4 confirmados", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Nome ou apelido", { exact: true }).fill("Isabela");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(
      page.getByText("3/4 confirmados", { exact: true }),
    ).toBeVisible();
    const updatedParallel = await readCup(page, parallel.id);
    expect(updatedParallel.status).toBe("draft");
    expect(updatedParallel.participants.map((p) => p.displayName)).toEqual([
      "Ana",
      "Bruno",
      "Isabela",
    ]);
    expect(await readCup(page, cup.id)).toEqual(completed);
    expect((await readState(page)).draft).toEqual(initialDraft);
    await page.getByRole("tab", { name: "Torneios", exact: true }).click();
    await page
      .getByRole("button", { name: "Criar campeonato", exact: true })
      .first()
      .click();
    await expect(
      page.getByText("Como vai funcionar?", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "16", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    await expect(
      page.getByLabel("Nome do campeonato", { exact: true }),
    ).toHaveValue(initialDraft.name);
    await page.reload();
    await expect(
      page.getByLabel("Nome do campeonato", { exact: true }),
    ).toHaveValue(initialDraft.name);
    expect(await readCup(page, cup.id)).toEqual(completed);
    expect(await readCup(page, parallel.id)).toEqual(updatedParallel);

    if (capacity === 8) {
      await page.getByRole("tab", { name: "Torneios", exact: true }).click();
      await page
        .getByRole("button", { name: `Abrir ${cup.name}`, exact: true })
        .click();
      const first = completed.matches[0];
      await openMatch(page, first, completed);
      await page
        .getByRole("button", { name: "Corrigir resultado", exact: true })
        .click();
      await fillScore(page, "0", "999999");
      await expect(
        page.getByText("A chave vai mudar", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      expect(await readCup(page, cup.id)).toEqual(completed);
      await page
        .getByRole("button", { name: "Confirmar resultado", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Confirmar e atualizar chave",
          exact: true,
        })
        .click();
      await expect
        .poll(async () => (await readCup(page, cup.id)).status)
        .toBe("active");
      const corrected = await readCup(page, cup.id);
      expect(corrected.championId).toBeUndefined();
      expect(corrected.completedAt).toBeUndefined();
      expect(corrected.matches[0].winnerId).toBe(first.participant2Id);
      const invalidated = new Set<string>();
      let nextId = first.nextMatchId;
      while (nextId) {
        invalidated.add(nextId);
        const next = corrected.matches.find((m) => m.id === nextId)!;
        expect(next.winnerId).toBeNull();
        expect(next.score1).toBeNull();
        expect(next.score2).toBeNull();
        nextId = next.nextMatchId;
      }
      expect(invalidated.size).toBe(2);
      for (const match of corrected.matches)
        if (match.id !== first.id && !invalidated.has(match.id))
          expect(match).toEqual(
            completed.matches.find((m) => m.id === match.id),
          );
      await returnToBracket(page);
      await expect(
        page.getByRole("button", { name: "Ver campeão", exact: true }),
      ).toHaveCount(0);
      await page.reload();
      await expect(
        page.getByText("O caminho até o troféu", { exact: true }),
      ).toBeVisible();
      expect(await readCup(page, cup.id)).toEqual(corrected);
      expect(await readCup(page, parallel.id)).toEqual(updatedParallel);
      expect((await readState(page)).draft).toEqual({
        ...initialDraft,
        step: 0,
      });
    }
    expect(errors).toEqual([]);
  });
}
