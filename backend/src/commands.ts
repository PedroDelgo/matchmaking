import { createHash } from "node:crypto";

export class CommandError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Base<T extends string, P> = {
  commandId: string;
  commandVersion: 1;
  tournamentId: string;
  expectedRevision: number;
  type: T;
  payload: P;
};
export type ScorePayload = {
  matchId: string;
  score1: number;
  score2: number;
  tieBreakWinnerId?: string;
};
export type ResultCommand = Base<
  "record_result" | "correct_result",
  ScorePayload
>;
export type TournamentCommand =
  | ResultCommand
  | Base<"add_participant", { displayName: string }>
  | Base<"remove_participant", { participantId: string }>
  | Base<"draw_bracket", Record<string, never>>;

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CommandError(400, "INVALID_COMMAND");
  return value as Record<string, unknown>;
}
export function exact(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).some((field) => !fields.includes(field)))
    throw new CommandError(400, "UNEXPECTED_FIELD");
}
function id(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}
export function parseCommand(value: unknown): TournamentCommand {
  const c = object(value);
  exact(c, [
    "commandId",
    "commandVersion",
    "tournamentId",
    "expectedRevision",
    "type",
    "payload",
  ]);
  if (
    typeof c.commandId !== "string" ||
    !uuid.test(c.commandId) ||
    typeof c.tournamentId !== "string" ||
    !uuid.test(c.tournamentId) ||
    c.commandVersion !== 1 ||
    !Number.isSafeInteger(c.expectedRevision) ||
    Number(c.expectedRevision) < 0 ||
    Number(c.expectedRevision) >= Number.MAX_SAFE_INTEGER
  )
    throw new CommandError(400, "INVALID_COMMAND");
  const p = object(c.payload);
  const base = {
    commandId: c.commandId.toLowerCase(),
    commandVersion: 1 as const,
    tournamentId: c.tournamentId.toLowerCase(),
    expectedRevision: Number(c.expectedRevision),
  };
  if (c.type === "add_participant") {
    exact(p, ["displayName"]);
    return {
      ...base,
      type: c.type,
      payload: { displayName: parseName(p.displayName) },
    };
  }
  if (c.type === "remove_participant") {
    exact(p, ["participantId"]);
    if (!id(p.participantId))
      throw new CommandError(400, "INVALID_PARTICIPANT");
    return {
      ...base,
      type: c.type,
      payload: { participantId: p.participantId },
    };
  }
  if (c.type === "draw_bracket") {
    exact(p, []);
    return { ...base, type: c.type, payload: {} };
  }
  if (c.type !== "record_result" && c.type !== "correct_result")
    throw new CommandError(400, "UNSUPPORTED_COMMAND");
  exact(p, ["matchId", "score1", "score2", "tieBreakWinnerId"]);
  if (
    !id(p.matchId) ||
    ![p.score1, p.score2].every(
      (s) => typeof s === "number" && Number.isSafeInteger(s) && s >= 0,
    ) ||
    (p.tieBreakWinnerId !== undefined && !id(p.tieBreakWinnerId)) ||
    (p.score1 === p.score2) !== (p.tieBreakWinnerId !== undefined)
  )
    throw new CommandError(400, "INVALID_RESULT");
  // Explicit ordering is the canonical representation; rejects actor/role fields.
  return {
    commandId: c.commandId.toLowerCase(),
    commandVersion: 1,
    tournamentId: c.tournamentId.toLowerCase(),
    expectedRevision: Number(c.expectedRevision),
    type: c.type,
    payload: {
      matchId: p.matchId,
      score1: p.score1 as number,
      score2: p.score2 as number,
      ...(p.tieBreakWinnerId === undefined
        ? {}
        : { tieBreakWinnerId: p.tieBreakWinnerId as string }),
    },
  };
}
export function parseName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Array.from(value.trim()).length > 80 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(value)
  )
    throw new CommandError(400, "INVALID_NAME");
  return value.trim();
}
export function commandHash(command: unknown) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}
