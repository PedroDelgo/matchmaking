import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { AuthenticatedActor } from "./auth";
import { requireRecoverableActor } from "./auth";
import {
  CommandError,
  commandHash,
  exact,
  object,
  parseName,
  uuid,
} from "./commands";
import { insertTournament, loadTournament } from "./repository";
import {
  createTournament,
  getRanking,
  getTournamentStats,
} from "../../src/features/tournaments/engine/tournament";
import {
  canonicalSnapshot,
  parseImportSnapshot,
} from "../../src/features/tournaments/domain/snapshot";
import type {
  Tournament,
  TournamentCapacity,
} from "../../src/features/tournaments/domain/types";
import type { CommandResponse } from "./service";

function uuidValue(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value))
    throw new CommandError(400, "INVALID_COMMAND");
  return value.toLowerCase();
}
function parseOperation(input: unknown) {
  const c = object(input);
  exact(c, ["commandId", "commandVersion", "type", "payload"]);
  const commandId = uuidValue(c.commandId);
  if (c.commandVersion !== 1)
    throw new CommandError(400, "UNSUPPORTED_COMMAND_VERSION");
  const p = object(c.payload);
  if (c.type === "create_tournament") {
    exact(p, ["name", "modality", "capacity", "format"]);
    if (
      ![4, 8, 16].includes(Number(p.capacity)) ||
      typeof p.capacity !== "number" ||
      p.format !== "single_elimination"
    )
      throw new CommandError(400, "INVALID_FORMAT");
    return {
      commandId,
      commandVersion: 1 as const,
      type: "create_tournament" as const,
      payload: {
        name: parseName(p.name),
        modality: parseName(p.modality),
        capacity: p.capacity as TournamentCapacity,
        format: "single_elimination" as const,
      },
    };
  }
  if (c.type === "import_tournament") {
    exact(p, ["installationId", "importId", "snapshotVersion", "snapshot"]);
    if (p.snapshotVersion !== 1)
      throw new CommandError(400, "UNSUPPORTED_SNAPSHOT_VERSION");
    let snapshot: Tournament;
    try {
      snapshot = parseImportSnapshot(p.snapshot);
    } catch {
      throw new CommandError(400, "INVALID_SNAPSHOT");
    }
    return {
      commandId,
      commandVersion: 1 as const,
      type: "import_tournament" as const,
      payload: {
        installationId: uuidValue(p.installationId),
        importId: uuidValue(p.importId),
        snapshotVersion: 1 as const,
        snapshot,
      },
    };
  }
  throw new CommandError(400, "UNSUPPORTED_COMMAND");
}
export function tournamentResponse(
  id: string,
  revision: number,
  tournament: Tournament,
): CommandResponse {
  return JSON.parse(
    JSON.stringify({
      tournamentId: id,
      revision,
      tournament,
      ranking: getRanking(tournament),
      statistics: getTournamentStats(tournament),
    }),
  ) as CommandResponse;
}
export async function transaction<T>(
  pool: Pool,
  readOnly: boolean,
  run: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  let discard = false;
  try {
    await c.query(
      readOnly ? "begin isolation level repeatable read read only" : "begin",
    );
    await c.query("set local role matchmaking_command");
    await c.query("set local lock_timeout='3s'");
    await c.query("set local statement_timeout='5s'");
    const result = await run(c);
    await c.query("commit");
    return result;
  } catch (error) {
    try {
      await c.query("rollback");
    } catch {
      discard = true;
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["55P03", "57014", "40P01", "40001"].includes(String(error.code))
    )
      throw new CommandError(409, "RETRY_SAME_COMMAND");
    throw error;
  } finally {
    c.release(discard);
  }
}
async function authorize(
  c: PoolClient,
  id: string,
  actor: string,
  write = false,
) {
  const {
    rows: [row],
  } = await c.query(
    `select owner_user_id,revision,schema_version,rules_version from public.tournaments where id=$1 ${write ? "for update" : ""}`,
    [id],
  );
  let allowed = row?.owner_user_id === actor;
  if (row && !allowed && !write)
    allowed =
      (
        await c.query(
          "select 1 from public.tournament_members where tournament_id=$1 and user_id=$2",
          [id, actor],
        )
      ).rowCount !== 0;
  if (!row || !allowed) throw new CommandError(403, "FORBIDDEN");
  if (row.schema_version !== 1 || row.rules_version !== 1)
    throw new CommandError(409, "UNSUPPORTED_AGGREGATE_VERSION");
  return Number(row.revision);
}
type Cursor = { at: string; id: string };
function parseCursor(value: string | null): Cursor | undefined {
  if (!value) return undefined;
  try {
    if (value.length > 512) throw new Error();
    const c = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof c.at !== "string" ||
      c.at.length > 40 ||
      !Number.isFinite(Date.parse(c.at)) ||
      !uuid.test(c.id)
    )
      throw new Error();
    return c;
  } catch {
    throw new CommandError(400, "INVALID_CURSOR");
  }
}
export function createTournamentService(
  pool: Pool,
  hooks: {
    afterSave?: () => void | Promise<void>;
    afterAuthorizeRead?: () => void | Promise<void>;
  } = {},
) {
  return {
    async operate(
      actor: AuthenticatedActor,
      input: unknown,
    ): Promise<CommandResponse> {
      requireRecoverableActor(actor);
      const op = parseOperation(input),
        hash = commandHash(op);
      return transaction(pool, false, async (c) => {
        // Lock identities before aggregate creation. Same order for every initial operation.
        await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `operation:${actor.userId}:${op.commandId}`,
        ]);
        const {
          rows: [receipt],
        } = await c.query(
          "select * from matchmaking_private.operation_receipts where actor_id=$1 and command_id=$2",
          [actor.userId, op.commandId],
        );
        if (receipt) {
          await authorize(c, receipt.tournament_id, actor.userId, true);
          if (receipt.payload_hash !== hash)
            throw new CommandError(409, "IDEMPOTENCY_KEY_REUSED");
          return receipt.response as CommandResponse;
        }
        let snapshot: Tournament, importHash: string | undefined;
        if (op.type === "import_tournament") {
          const p = op.payload;
          importHash = createHash("sha256")
            .update(canonicalSnapshot(p.snapshot))
            .digest("hex");
          await c.query(
            "select pg_advisory_xact_lock(hashtextextended($1,0))",
            [`import:${actor.userId}:${p.installationId}:${p.importId}`],
          );
          const {
            rows: [previous],
          } = await c.query(
            "select * from matchmaking_private.tournament_imports where actor_id=$1 and installation_id=$2 and import_id=$3",
            [actor.userId, p.installationId, p.importId],
          );
          if (previous) {
            await authorize(c, previous.tournament_id, actor.userId, true);
            if (previous.snapshot_hash !== importHash)
              throw new CommandError(409, "IMPORT_CONTENT_CHANGED");
            await c.query(
              "insert into matchmaking_private.operation_receipts(actor_id,command_id,payload_hash,tournament_id,response) values($1,$2,$3,$4,$5::jsonb)",
              [
                actor.userId,
                op.commandId,
                hash,
                previous.tournament_id,
                JSON.stringify(previous.response),
              ],
            );
            return previous.response as CommandResponse;
          }
          snapshot = p.snapshot;
        } else snapshot = createTournament(op.payload, `cup-${randomUUID()}`);
        const id = randomUUID();
        await insertTournament(c, id, actor.userId, snapshot);
        const result = tournamentResponse(id, 1, snapshot);
        await c.query(
          "insert into matchmaking_private.tournament_events(tournament_id,actor_id,command_id,revision,type,rules_version,details) values($1,$2,$3,1,$4,1,$5::jsonb)",
          [
            id,
            actor.userId,
            op.commandId,
            op.type,
            JSON.stringify({
              snapshotVersion: 1,
              ...(importHash ? { snapshotHash: importHash } : {}),
            }),
          ],
        );
        await c.query(
          "insert into matchmaking_private.operation_receipts(actor_id,command_id,payload_hash,tournament_id,response) values($1,$2,$3,$4,$5::jsonb)",
          [actor.userId, op.commandId, hash, id, JSON.stringify(result)],
        );
        if (op.type === "import_tournament")
          await c.query(
            "insert into matchmaking_private.tournament_imports(actor_id,installation_id,import_id,snapshot_hash,tournament_id,response) values($1,$2,$3,$4,$5,$6::jsonb)",
            [
              actor.userId,
              op.payload.installationId,
              op.payload.importId,
              importHash,
              id,
              JSON.stringify(result),
            ],
          );
        await hooks.afterSave?.();
        return result;
      });
    },
    async detail(
      actor: AuthenticatedActor,
      id: string,
    ): Promise<CommandResponse> {
      id = uuidValue(id);
      return transaction(pool, true, async (c) => {
        const revision = await authorize(c, id, actor.userId);
        await hooks.afterAuthorizeRead?.();
        const {
          rows: [t],
        } = await c.query(
          "select owner_user_id from public.tournaments where id=$1",
          [id],
        );
        const {
          rows: [member],
        } = await c.query(
          "select role,participant_id from public.tournament_members where tournament_id=$1 and user_id=$2",
          [id, actor.userId],
        );
        return {
          ...tournamentResponse(id, revision, await loadTournament(c, id)),
          access: {
            role:
              t.owner_user_id === actor.userId && !actor.isAnonymous
                ? ("organizer" as const)
                : member?.role,
            participantId: member?.participant_id ?? undefined,
          },
        };
      });
    },
    async list(actor: AuthenticatedActor, params: URLSearchParams) {
      if (
        [...params.keys()].some((k) => !["cursor", "limit"].includes(k)) ||
        params.getAll("cursor").length > 1 ||
        params.getAll("limit").length > 1
      )
        throw new CommandError(400, "INVALID_QUERY");
      const limit = Number(params.get("limit") ?? 20),
        cursor = parseCursor(params.get("cursor"));
      if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        throw new CommandError(400, "INVALID_LIMIT");
      return transaction(pool, true, async (c) => {
        // One bounded summary query. Raw timestamp text preserves PostgreSQL microseconds in the cursor.
        const { rows } = await c.query(
          `select t.id,t.name,t.modality,t.capacity,t.status,t.revision,t.created_at,t.updated_at,t.updated_at::text as cursor_at,
          (select count(*)::int from public.participants p where p.tournament_id=t.id) as participants,
          (select count(*)::int from public.matches m where m.tournament_id=t.id and m.status='completed') as completed_matches,
          (select display_name from public.participants p where p.tournament_id=t.id and p.domain_id=t.champion_id) as champion
          from public.tournaments t where (t.owner_user_id=$1 or exists(select 1 from public.tournament_members mem where mem.tournament_id=t.id and mem.user_id=$1)) and ($2::timestamptz is null or (t.updated_at,t.id)<($2::timestamptz,$3::uuid))
          order by t.updated_at desc,t.id desc limit $4`,
          [actor.userId, cursor?.at ?? null, cursor?.id ?? null, limit + 1],
        );
        const page = rows.slice(0, limit),
          last = page.at(-1);
        return {
          items: page.map((r) => ({
            tournamentId: r.id,
            name: r.name,
            modality: r.modality,
            capacity: r.capacity,
            status: r.status,
            revision: Number(r.revision),
            participantCount: r.participants,
            completedMatches: r.completed_matches,
            totalMatches: r.capacity - 1,
            champion: r.champion ?? undefined,
            createdAt: r.created_at.toISOString(),
            updatedAt: r.updated_at.toISOString(),
          })),
          nextCursor:
            rows.length > limit && last
              ? Buffer.from(
                  JSON.stringify({ at: last.cursor_at, id: last.id }),
                ).toString("base64url")
              : null,
        };
      });
    },
  };
}
