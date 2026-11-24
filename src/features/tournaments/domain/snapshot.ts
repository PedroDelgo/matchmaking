import type { Tournament } from "./types";
import { validateTournament } from "./validation";

const controls = /[\u0000-\u001f\u007f-\u009f]/;
function invalid(): never {
  throw new Error("INVALID_SNAPSHOT");
}
function object(
  value: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid();
  const result = value as Record<string, unknown>;
  if (
    required.some((k) => !Object.hasOwn(result, k)) ||
    Reflect.ownKeys(result).some(
      (k) =>
        typeof k !== "string" ||
        ![...required, ...optional].includes(k) ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(result, k)!, "value"),
    )
  )
    invalid();
  return result;
}
function array(value: unknown, max: number): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    invalid();
  for (let i = 0; i < value.length; i++)
    if (
      !Object.hasOwn(value, i) ||
      !Object.hasOwn(
        Object.getOwnPropertyDescriptor(value, String(i))!,
        "value",
      )
    )
      invalid();
  return value;
}
function text(
  value: unknown,
  max = 200,
  trim = false,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.length ||
    Array.from(value).length > max ||
    controls.test(value) ||
    (trim && value !== value.trim())
  )
    invalid();
}
function time(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid();
  return Date.parse(value);
}
function integer(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    invalid();
}
/** Strict transfer contract; the legacy local validator and envelope stay unchanged. */
export function parseImportSnapshot(value: unknown): Tournament {
  try {
    const t = object(
      value,
      [
        "id",
        "name",
        "modality",
        "capacity",
        "status",
        "participants",
        "rounds",
        "matches",
        "drawOrder",
        "createdAt",
      ],
      ["startedAt", "completedAt", "championId"],
    );
    text(t.id);
    text(t.name, 80, true);
    text(t.modality, 80, true);
    const created = time(t.createdAt),
      started = t.startedAt === undefined ? undefined : time(t.startedAt),
      completed = t.completedAt === undefined ? undefined : time(t.completedAt);
    if (
      (started !== undefined && started < created) ||
      (completed !== undefined &&
        (started === undefined || completed < started))
    )
      invalid();
    if (
      t.status === "draft"
        ? started !== undefined ||
          completed !== undefined ||
          t.championId !== undefined
        : started === undefined ||
          (t.status === "active"
            ? completed !== undefined || t.championId !== undefined
            : completed === undefined || t.championId === undefined)
    )
      invalid();
    if (t.championId !== undefined) text(t.championId);
    for (const item of array(t.participants, 16)) {
      const p = object(item, ["id", "displayName", "createdAt"], ["profileId"]);
      text(p.id);
      text(p.displayName, 80, true);
      if (p.profileId !== undefined) text(p.profileId);
      if (
        time(p.createdAt) < created ||
        (started !== undefined && time(p.createdAt) > started)
      )
        invalid();
    }
    const roundIds = new Set<string>();
    for (const item of array(t.rounds, 4)) {
      const r = object(item, ["id", "index", "label", "matchIds", "status"]);
      text(r.id);
      text(r.label, 80, true);
      integer(r.index);
      if (
        roundIds.has(r.id) ||
        !["waiting", "active", "completed"].includes(String(r.status))
      )
        invalid();
      roundIds.add(r.id);
      for (const id of array(r.matchIds, 15)) text(id);
    }
    let totalPoints = 0;
    for (const item of array(t.matches, 15)) {
      const m = object(item, [
        "id",
        "tournamentId",
        "roundIndex",
        "positionIndex",
        "participant1Id",
        "participant2Id",
        "score1",
        "score2",
        "winnerId",
        "status",
        "nextMatchId",
      ]);
      text(m.id);
      text(m.tournamentId);
      integer(m.roundIndex);
      integer(m.positionIndex);
      for (const k of [
        "participant1Id",
        "participant2Id",
        "winnerId",
        "nextMatchId",
      ])
        if (m[k] !== null) text(m[k]);
      for (const k of ["score1", "score2"])
        if (m[k] !== null) {
          integer(m[k]);
          const score = m[k] as number;
          if (score > Number.MAX_SAFE_INTEGER - totalPoints) invalid();
          totalPoints += score;
        }
    }
    for (const id of array(t.drawOrder, 16)) text(id);
    if (!validateTournament(t)) invalid();
    return JSON.parse(canonicalSnapshot(t)) as Tournament;
  } catch {
    return invalid();
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
/** Object keys sorted, arrays preserved. This representation is versioned by the import contract. */
export function canonicalSnapshot(tournament: Tournament): string {
  return JSON.stringify(canonical(tournament));
}
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}
