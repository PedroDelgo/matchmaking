import type {
  Tournament,
  CreateTournamentInput,
  RankingEntry,
} from "../domain/types";

const required = (value: string, label: string) => {
  const text = value.trim();
  if (!text) throw new Error(`${label} é obrigatório.`);
  if (text.length > 80) throw new Error(`${label} deve ter até 80 caracteres.`);
  return text;
};
const ensureDraft = (t: Tournament) => {
  if (t.status !== "draft")
    throw new Error("Os participantes só podem mudar antes do sorteio.");
};
const clone = (t: Tournament): Tournament => ({
  ...t,
  participants: t.participants.map((p) => ({ ...p })),
  rounds: t.rounds.map((r) => ({ ...r, matchIds: [...r.matchIds] })),
  matches: t.matches.map((m) => ({ ...m })),
  drawOrder: [...t.drawOrder],
});
const matchId = (id: string, r: number, p: number) =>
  `${id}-r${r + 1}-m${p + 1}`;
const label = (count: number) =>
  count === 1
    ? "Final"
    : count === 2
      ? "Semifinais"
      : count === 4
        ? "Quartas de final"
        : "Oitavas de final";
export function shuffle<T>(
  values: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1)
      throw new Error("Sorteador inválido.");
    const j = Math.floor(sample * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createTournament(
  input: CreateTournamentInput,
  id?: string,
): Tournament {
  if (![4, 8, 16].includes(input.capacity))
    throw new Error("Escolha 4, 8 ou 16 participantes.");
  return {
    id:
      id ??
      `cup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    name: required(input.name, "Nome"),
    modality: required(input.modality, "Modalidade"),
    capacity: input.capacity,
    status: "draft",
    participants: [],
    rounds: [],
    matches: [],
    drawOrder: [],
    createdAt: new Date().toISOString(),
  };
}
export function addParticipant(
  t: Tournament,
  name: string,
  profileId?: string,
): Tournament {
  ensureDraft(t);
  if (t.participants.length >= t.capacity)
    throw new Error("Todas as vagas já foram preenchidas.");
  if (profileId && t.participants.some((p) => p.profileId === profileId))
    throw new Error("Seu perfil já está participando.");
  const displayName = required(name, "Nome do participante");
  let suffix = 1;
  while (t.participants.some((p) => p.id === `${t.id}-p${suffix}`)) suffix++;
  const next = clone(t);
  next.participants.push({
    id: `${t.id}-p${suffix}`,
    displayName,
    profileId,
    createdAt: new Date().toISOString(),
  });
  return next;
}
export function removeParticipant(
  t: Tournament,
  participantId: string,
): Tournament {
  ensureDraft(t);
  if (!t.participants.some((p) => p.id === participantId))
    throw new Error("Participante não encontrado.");
  return {
    ...clone(t),
    participants: t.participants.filter((p) => p.id !== participantId),
  };
}
export function startTournament(
  t: Tournament,
  random: () => number = Math.random,
): Tournament {
  ensureDraft(t);
  if (t.participants.length !== t.capacity)
    throw new Error(`Preencha as ${t.capacity} vagas antes de sortear.`);
  if (new Set(t.participants.map((p) => p.id)).size !== t.capacity)
    throw new Error("Os participantes devem ter IDs únicos.");
  const next = clone(t);
  next.drawOrder = shuffle(
    t.participants.map((p) => p.id),
    random,
  );
  next.rounds = [];
  next.matches = [];
  const count = Math.log2(t.capacity);
  for (let r = 0; r < count; r++) {
    const n = t.capacity / 2 ** (r + 1),
      ids: string[] = [];
    for (let p = 0; p < n; p++) {
      const id = matchId(t.id, r, p);
      ids.push(id);
      next.matches.push({
        id,
        tournamentId: t.id,
        roundIndex: r,
        positionIndex: p,
        participant1Id: r === 0 ? next.drawOrder[p * 2] : null,
        participant2Id: r === 0 ? next.drawOrder[p * 2 + 1] : null,
        score1: null,
        score2: null,
        winnerId: null,
        status: r === 0 ? "ready" : "waiting",
        nextMatchId:
          r === count - 1 ? null : matchId(t.id, r + 1, Math.floor(p / 2)),
      });
    }
    next.rounds.push({
      id: `${t.id}-r${r + 1}`,
      index: r,
      label: label(n),
      matchIds: ids,
      status: r === 0 ? "active" : "waiting",
    });
  }
  return {
    ...next,
    status: "active",
    startedAt: new Date().toISOString(),
    completedAt: undefined,
    championId: undefined,
  };
}
function updateStatuses(t: Tournament, previous: Tournament) {
  for (const m of t.matches)
    m.status = m.winnerId
      ? "completed"
      : m.participant1Id && m.participant2Id
        ? "ready"
        : "waiting";
  for (const r of t.rounds) {
    const ms = t.matches.filter((m) => m.roundIndex === r.index);
    r.status = ms.every((m) => m.status === "completed")
      ? "completed"
      : ms.some((m) => m.status !== "waiting")
        ? "active"
        : "waiting";
  }
  const final = t.matches[t.matches.length - 1];
  t.championId = final.winnerId ?? undefined;
  t.status = final.winnerId ? "completed" : "active";
  t.completedAt = final.winnerId
    ? previous.championId === final.winnerId && previous.completedAt
      ? previous.completedAt
      : new Date().toISOString()
    : undefined;
}
export function recordResult(
  t: Tournament,
  id: string,
  score1: number,
  score2: number,
  tieBreakWinnerId?: string,
): Tournament {
  if (t.status === "draft")
    throw new Error("Realize o sorteio antes de registrar resultados.");
  if (![score1, score2].every((s) => Number.isSafeInteger(s) && s >= 0))
    throw new Error("Use placares inteiros não negativos.");
  const original = t.matches.find((m) => m.id === id);
  if (!original) throw new Error("Partida não encontrada.");
  if (!original.participant1Id || !original.participant2Id)
    throw new Error("Aguarde a definição dos dois participantes.");
  let winner: string;
  if (score1 === score2) {
    if (
      tieBreakWinnerId !== original.participant1Id &&
      tieBreakWinnerId !== original.participant2Id
    )
      throw new Error("Selecione o vencedor do desempate.");
    winner = tieBreakWinnerId;
  } else {
    if (tieBreakWinnerId !== undefined)
      throw new Error("O desempate só se aplica a placares iguais.");
    winner =
      score1 > score2 ? original.participant1Id : original.participant2Id;
  }
  const next = clone(t),
    byId = new Map(next.matches.map((m) => [m.id, m]));
  const current = byId.get(id)!;
  current.score1 = score1;
  current.score2 = score2;
  current.winnerId = winner;
  if (original.winnerId !== winner) {
    let source = current,
      advancing: string | null = winner;
    while (source.nextMatchId) {
      const destination = byId.get(source.nextMatchId);
      if (!destination) throw new Error("A chave está inválida.");
      if (source.positionIndex % 2 === 0)
        destination.participant1Id = advancing;
      else destination.participant2Id = advancing;
      destination.score1 = null;
      destination.score2 = null;
      destination.winnerId = null;
      source = destination;
      advancing = null;
    }
  }
  updateStatuses(next, t);
  return next;
}
export function getRanking(t: Tournament): RankingEntry[] {
  const entries = new Map(
    t.participants.map((p) => [
      p.id,
      {
        position: 0,
        participantId: p.id,
        displayName: p.displayName,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        balance: 0,
        winRate: 0,
        longestWinStreak: 0,
      },
    ]),
  );
  const streaks = new Map<string, number>();
  for (const m of [...t.matches].sort(
    (a, b) => a.roundIndex - b.roundIndex || a.positionIndex - b.positionIndex,
  )) {
    if (
      m.status !== "completed" ||
      !m.winnerId ||
      !m.participant1Id ||
      !m.participant2Id ||
      m.score1 === null ||
      m.score2 === null
    )
      continue;
    const a = entries.get(m.participant1Id),
      b = entries.get(m.participant2Id);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.pointsFor += m.score1;
    a.pointsAgainst += m.score2;
    b.pointsFor += m.score2;
    b.pointsAgainst += m.score1;
    const [w, l] = m.winnerId === a.participantId ? [a, b] : [b, a];
    w.wins++;
    l.losses++;
    const streak = (streaks.get(w.participantId) ?? 0) + 1;
    streaks.set(w.participantId, streak);
    streaks.set(l.participantId, 0);
    w.longestWinStreak = Math.max(w.longestWinStreak, streak);
  }
  return [...entries.values()]
    .map((p) => ({
      ...p,
      balance: p.pointsFor - p.pointsAgainst,
      winRate: p.played ? p.wins / p.played : 0,
    }))
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.balance - a.balance ||
        b.pointsFor - a.pointsFor ||
        a.displayName.localeCompare(b.displayName, "pt-BR") ||
        a.participantId.localeCompare(b.participantId),
    )
    .map((p, i) => ({ ...p, position: i + 1 }));
}
export function getTournamentStats(t: Tournament) {
  const completed = t.matches.filter((m) => m.status === "completed");
  return {
    players: t.participants.length,
    expected: t.capacity - 1,
    completed: completed.length,
    totalPoints: completed.reduce(
      (s, m) => s + (m.score1 ?? 0) + (m.score2 ?? 0),
      0,
    ),
    highestScore: completed.length
      ? Math.max(...completed.flatMap((m) => [m.score1 ?? 0, m.score2 ?? 0]))
      : 0,
    champion: t.participants.find((p) => p.id === t.championId),
  };
}
