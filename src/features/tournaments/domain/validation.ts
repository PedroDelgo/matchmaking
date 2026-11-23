import type { Tournament } from "./types";

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

// Shared validation of the canonical aggregate; no platform or store dependency.
export function validateTournament(t: unknown): t is Tournament {
  if (
    !isObject(t) ||
    typeof t.id !== "string" ||
    typeof t.name !== "string" ||
    typeof t.modality !== "string" ||
    ![4, 8, 16].includes(t.capacity as number) ||
    !["draft", "active", "completed"].includes(String(t.status)) ||
    !Array.isArray(t.participants) ||
    !Array.isArray(t.rounds) ||
    !Array.isArray(t.matches) ||
    !Array.isArray(t.drawOrder) ||
    typeof t.createdAt !== "string"
  )
    return false;
  if (t.participants.length > Number(t.capacity)) return false;
  const ids = new Set<string>();
  for (const p of t.participants) {
    if (
      !isObject(p) ||
      typeof p.id !== "string" ||
      typeof p.displayName !== "string" ||
      typeof p.createdAt !== "string" ||
      ids.has(p.id)
    )
      return false;
    ids.add(p.id);
  }
  if (
    t.status !== "draft" &&
    (t.matches.length !== Number(t.capacity) - 1 ||
      t.rounds.length !== Math.log2(Number(t.capacity)))
  )
    return false;
  if (
    !t.rounds.every(
      (r) =>
        isObject(r) &&
        typeof r.id === "string" &&
        typeof r.label === "string" &&
        Number.isInteger(r.index) &&
        Array.isArray(r.matchIds),
    )
  )
    return false;
  const validMatches = t.matches.every(
    (m) =>
      isObject(m) &&
      typeof m.id === "string" &&
      Number.isInteger(m.roundIndex) &&
      Number.isInteger(m.positionIndex) &&
      ["waiting", "ready", "completed"].includes(String(m.status)) &&
      [m.participant1Id, m.participant2Id, m.winnerId].every(
        (x) => x === null || (typeof x === "string" && ids.has(x)),
      ) &&
      [m.score1, m.score2].every(
        (x) =>
          x === null ||
          (typeof x === "number" && Number.isSafeInteger(x) && x >= 0),
      ),
  );
  if (!validMatches) return false;
  const cup = t as unknown as Tournament;
  if (cup.status === "draft")
    return (
      cup.matches.length === 0 &&
      cup.rounds.length === 0 &&
      cup.drawOrder.length === 0 &&
      !cup.championId
    );
  if (
    cup.participants.length !== cup.capacity ||
    cup.drawOrder.length !== cup.capacity ||
    new Set(cup.drawOrder).size !== cup.capacity ||
    !cup.drawOrder.every((id) => ids.has(id))
  )
    return false;
  if (new Set(cup.matches.map((m) => m.id)).size !== cup.matches.length)
    return false;
  let offset = 0;
  for (let ri = 0; ri < cup.rounds.length; ri++) {
    const round = cup.rounds[ri],
      count = cup.capacity / 2 ** (ri + 1);
    if (round.index !== ri || round.matchIds.length !== count) return false;
    const matches = cup.matches.slice(offset, offset + count);
    for (let pi = 0; pi < count; pi++) {
      const m = matches[pi];
      if (
        m.id !== round.matchIds[pi] ||
        m.tournamentId !== cup.id ||
        m.roundIndex !== ri ||
        m.positionIndex !== pi ||
        (m.participant1Id !== null && m.participant1Id === m.participant2Id)
      )
        return false;
      const expectedNext =
        ri === cup.rounds.length - 1
          ? null
          : cup.rounds[ri + 1].matchIds[Math.floor(pi / 2)];
      if (m.nextMatchId !== expectedNext) return false;
      if (
        ri === 0 &&
        (m.participant1Id !== cup.drawOrder[pi * 2] ||
          m.participant2Id !== cup.drawOrder[pi * 2 + 1])
      )
        return false;
      if (ri > 0) {
        const source = cup.matches.filter((x) => x.roundIndex === ri - 1);
        if (
          m.participant1Id !== source[pi * 2].winnerId ||
          m.participant2Id !== source[pi * 2 + 1].winnerId
        )
          return false;
      }
      if (m.status === "completed") {
        if (
          !m.participant1Id ||
          !m.participant2Id ||
          m.score1 === null ||
          m.score2 === null ||
          (m.winnerId !== m.participant1Id && m.winnerId !== m.participant2Id)
        )
          return false;
        if (
          m.score1 !== m.score2 &&
          m.winnerId !==
            (m.score1 > m.score2 ? m.participant1Id : m.participant2Id)
        )
          return false;
      } else if (
        m.winnerId !== null ||
        m.score1 !== null ||
        m.score2 !== null ||
        m.status !==
          (m.participant1Id && m.participant2Id ? "ready" : "waiting")
      )
        return false;
    }
    const status = matches.every((m) => m.status === "completed")
      ? "completed"
      : matches.some((m) => m.status !== "waiting")
        ? "active"
        : "waiting";
    if (round.status !== status) return false;
    offset += count;
  }
  const final = cup.matches[cup.matches.length - 1];
  return (
    (cup.championId ?? null) === final.winnerId &&
    (cup.status === "completed") === !!final.winnerId &&
    !!cup.completedAt === !!final.winnerId
  );
}
