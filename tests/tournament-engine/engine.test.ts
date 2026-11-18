import {
  addParticipant,
  createTournament,
  startTournament,
  recordResult,
  getRanking,
  removeParticipant,
  shuffle,
  getTournamentStats,
} from "../../src/features/tournaments/engine/tournament";
import type {
  Tournament,
  TournamentCapacity,
} from "../../src/features/tournaments/domain/types";

const keepOrder = () => 0.99999;
function draft(capacity: TournamentCapacity = 4) {
  let t = createTournament(
    { name: "Copa", modality: "Truco", capacity },
    "test",
  );
  for (let i = 0; i < capacity; i++) t = addParticipant(t, `Jogador ${i + 1}`);
  return t;
}
const ready = (capacity: TournamentCapacity = 4) =>
  startTournament(draft(capacity), keepOrder);
function finish(t: Tournament) {
  let next = t;
  for (const m of t.matches) next = recordResult(next, m.id, 3, 1);
  return next;
}

describe("Mata-mata", () => {
  test.each([4, 8, 16] as const)(
    "gera, avança e finaliza %i jogadores sem duplicação",
    (capacity) => {
      const original = draft(capacity),
        snapshot = JSON.stringify(original),
        t = startTournament(original, keepOrder);
      expect(JSON.stringify(original)).toBe(snapshot);
      expect(t.rounds).toHaveLength(Math.log2(capacity));
      expect(t.matches).toHaveLength(capacity - 1);
      const first = t.matches.filter((m) => m.roundIndex === 0),
        ids = first.flatMap((m) => [m.participant1Id, m.participant2Id]);
      expect(new Set(ids).size).toBe(capacity);
      expect(ids).toEqual(t.drawOrder);
      for (const m of first)
        expect(m.participant1Id).not.toBe(m.participant2Id);
      let current = t;
      for (const m of t.matches) {
        const before = current.matches.find((x) => x.id === m.id)!;
        current = recordResult(current, m.id, 3, 1);
        if (m.nextMatchId) {
          const next = current.matches.find((x) => x.id === m.nextMatchId)!;
          expect(
            m.positionIndex % 2 === 0
              ? next.participant1Id
              : next.participant2Id,
          ).toBe(before.participant1Id);
          expect(
            m.positionIndex % 2 === 0
              ? next.participant1Id
              : next.participant2Id,
          ).not.toBe(before.participant2Id);
        }
      }
      expect(current.status).toBe("completed");
      expect(current.championId).toBe(current.drawOrder[0]);
      expect(current.matches.at(-1)?.winnerId).toBe(current.championId);
      expect(current.rounds.every((r) => r.status === "completed")).toBe(true);
      expect(current.completedAt).toBeDefined();
    },
  );
  test("Fisher-Yates usa limites corretos e preserva entrada", () => {
    const input = ["a", "b", "c", "d"];
    expect(shuffle(input, () => 0)).toEqual(["b", "c", "d", "a"]);
    expect(input).toEqual(["a", "b", "c", "d"]);
    expect(() => shuffle(input, () => 1)).toThrow();
    expect(() => shuffle(input, () => NaN)).toThrow();
  });
  test("valida criação, capacidade, perfil e participantes", () => {
    expect(() =>
      createTournament({ name: " ", modality: "Truco", capacity: 4 }),
    ).toThrow();
    expect(() =>
      createTournament({ name: "Copa", modality: " ", capacity: 4 }),
    ).toThrow();
    const t = createTournament({
      name: "Copa",
      modality: "Truco",
      capacity: 4,
    });
    expect(() => startTournament(t)).toThrow();
    expect(() => addParticipant(t, " ")).toThrow();
    const p = addParticipant(addParticipant(t, "Ana", "my-id"), "Ana");
    expect(p.participants[0].id).not.toBe(p.participants[1].id);
    expect(() => addParticipant(p, "Outro", "my-id")).toThrow();
    expect(
      removeParticipant(p, p.participants[0].id).participants,
    ).toHaveLength(1);
    expect(p.participants).toHaveLength(2);
    expect(() => addParticipant(draft(), "Extra")).toThrow();
    expect(() => startTournament(ready())).toThrow();
    expect(() => removeParticipant(ready(), "x")).toThrow();
  });
  test.each([-1, 1.5, Infinity, NaN])("rejeita placar inválido %s", (score) => {
    const t = ready();
    expect(() => recordResult(t, t.matches[0].id, score, 0)).toThrow();
  });
  test("empate exige desempate válido e jogo futuro não pode ser concluído", () => {
    const t = ready(),
      m = t.matches[0];
    expect(() => recordResult(t, m.id, 2, 2)).toThrow();
    expect(() => recordResult(t, m.id, 2, 2, "fora")).toThrow();
    expect(() => recordResult(t, t.matches.at(-1)!.id, 1, 0)).toThrow();
    const next = recordResult(t, m.id, 2, 2, m.participant2Id!);
    expect(next.matches[0].winnerId).toBe(m.participant2Id);
    expect(
      getRanking(next).find((p) => p.participantId === m.participant2Id),
    ).toMatchObject({ wins: 1, balance: 0 });
  });
  test.each([8, 16] as const)(
    "corrigir vencedor em %i invalida descendentes e preserva irmãos",
    (capacity) => {
      const t = finish(ready(capacity)),
        snapshot = JSON.stringify(t),
        first = t.matches[0],
        corrected = recordResult(t, first.id, 0, 2);
      expect(JSON.stringify(t)).toBe(snapshot);
      const affected = new Set<string>();
      let id = first.nextMatchId;
      while (id) {
        affected.add(id);
        id = t.matches.find((m) => m.id === id)!.nextMatchId;
      }
      for (const m of corrected.matches)
        if (affected.has(m.id))
          expect(m).toMatchObject({
            score1: null,
            score2: null,
            winnerId: null,
          });
        else if (m.id !== first.id)
          expect(m).toEqual(t.matches.find((x) => x.id === m.id));
      expect(corrected.championId).toBeUndefined();
      expect(corrected.status).toBe("active");
      expect(corrected.completedAt).toBeUndefined();
      expect(
        corrected.matches.find((m) => m.id === first.nextMatchId)
          ?.participant1Id,
      ).toBe(first.participant2Id);
      const refinalized = corrected.matches.reduce(
        (next, m) => (m.winnerId ? next : recordResult(next, m.id, 3, 1)),
        corrected,
      );
      expect(refinalized.status).toBe("completed");
      expect(refinalized.championId).toBe(first.participant2Id);
    },
  );
  test("mesmo vencedor preserva resultados posteriores, campeão e data", () => {
    const t = finish(ready(8)),
      next = recordResult(t, t.matches[0].id, 9, 0);
    expect(next.matches.slice(1)).toEqual(t.matches.slice(1));
    expect(next.completedAt).toBe(t.completedAt);
    expect(next.championId).toBe(t.championId);
    expect(getTournamentStats(next).totalPoints).toBe(
      getTournamentStats(t).totalPoints + 5,
    );
  });
  test("estatísticas ignoram jogos futuros, recalculam correções e possuem ordem estável", () => {
    const t = ready(),
      m = t.matches[0],
      a = recordResult(t, m.id, 2, 0),
      b = recordResult(a, m.id, 0, 4);
    expect(getRanking(t).reduce((n, p) => n + p.played, 0)).toBe(0);
    expect(
      getRanking(b).find((p) => p.participantId === m.participant2Id),
    ).toMatchObject({
      wins: 1,
      pointsFor: 4,
      balance: 4,
      longestWinStreak: 1,
      winRate: 1,
    });
    expect(getRanking(b).reduce((n, p) => n + p.wins, 0)).toBe(1);
    expect(getRanking(b).reduce((n, p) => n + p.played, 0)).toBe(2);
    expect(getRanking(b)).toEqual(getRanking(b));
    const final = finish(ready());
    expect(
      getRanking(final).find((p) => p.participantId === final.championId)
        ?.longestWinStreak,
    ).toBe(2);
  });
});
