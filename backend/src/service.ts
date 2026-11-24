import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type { AuthenticatedActor } from "./auth";
import { CommandError, commandHash, parseCommand } from "./commands";
import {
  loadTournament,
  saveResult,
  saveParticipants,
  insertBracket,
} from "./repository";
import {
  recordResult,
  getRanking,
  getTournamentStats,
  addParticipant,
  removeParticipant,
  startTournament,
} from "../../src/features/tournaments/engine/tournament";
import type { Tournament } from "../../src/features/tournaments/domain/types";
import { parseImportSnapshot } from "../../src/features/tournaments/domain/snapshot";

export type CommandResponse = {
  tournamentId: string;
  revision: number;
  tournament: Tournament;
  ranking: ReturnType<typeof getRanking>;
  statistics: ReturnType<typeof getTournamentStats>;
};
// Hook is injected only by integration tests; HTTP cannot select faults or actors.
export function createCommandService(
  pool: Pool,
  hooks: { afterSave?: () => void | Promise<void> } = {},
) {
  return async (
    actor: AuthenticatedActor,
    input: unknown,
  ): Promise<CommandResponse> => {
    const command = parseCommand(input),
      hash = commandHash(command);
    const client = await pool.connect();
    let discard = false;
    try {
      await client.query("begin");
      await client.query("set local role matchmaking_command");
      await client.query("set local lock_timeout = '3s'");
      await client.query("set local statement_timeout = '5s'");
      const {
        rows: [row],
      } = await client.query(
        "select owner_user_id,revision,schema_version,rules_version from public.tournaments where id=$1 for update",
        [command.tournamentId],
      );
      // Same response for unknown/unauthorized IDs. No client-supplied role is used.
      if (!row || row.owner_user_id !== actor.userId)
        throw new CommandError(403, "FORBIDDEN");
      if (row.schema_version !== 1 || row.rules_version !== 1)
        throw new CommandError(409, "UNSUPPORTED_AGGREGATE_VERSION");
      const {
        rows: [receipt],
      } = await client.query(
        "select command_version,payload_hash,response from matchmaking_private.command_receipts where tournament_id=$1 and actor_id=$2 and command_id=$3",
        [command.tournamentId, actor.userId, command.commandId],
      );
      if (receipt) {
        if (
          receipt.command_version !== command.commandVersion ||
          receipt.payload_hash !== hash
        )
          throw new CommandError(409, "IDEMPOTENCY_KEY_REUSED");
        await client.query("commit");
        return receipt.response as CommandResponse;
      }
      if (Number(row.revision) !== command.expectedRevision)
        throw new CommandError(409, "REVISION_CONFLICT");
      const current = await loadTournament(client, command.tournamentId);
      const matchId =
        "matchId" in command.payload ? command.payload.matchId : undefined;
      const before = current.matches.find((m) => m.id === matchId);
      let next: Tournament;
      try {
        if (command.type === "add_participant") {
          next = addParticipant(current, command.payload.displayName);
          // Keep the shared engine's rules; allocate remote identity independently of local suffixes.
          next.participants[next.participants.length - 1].id =
            `p-${randomUUID()}`;
        } else if (command.type === "remove_participant")
          next = removeParticipant(current, command.payload.participantId);
        else if (command.type === "draw_bracket")
          next = startTournament(current);
        else {
          if (!before) throw new CommandError(422, "MATCH_NOT_FOUND");
          if (command.type === "record_result" && before.status === "completed")
            throw new CommandError(409, "USE_CORRECT_RESULT");
          if (
            command.type === "correct_result" &&
            before.status !== "completed"
          )
            throw new CommandError(409, "RESULT_NOT_RECORDED");
          const p = command.payload;
          next = recordResult(
            current,
            p.matchId,
            p.score1,
            p.score2,
            p.tieBreakWinnerId,
          );
        }
      } catch (error) {
        if (error instanceof CommandError) throw error;
        throw new CommandError(422, "INVALID_DOMAIN_COMMAND");
      }
      const revision = Number(row.revision) + 1;
      try {
        parseImportSnapshot(next);
      } catch {
        throw new CommandError(422, "INVALID_AGGREGATE");
      }
      if (
        command.type === "add_participant" ||
        command.type === "remove_participant"
      )
        await saveParticipants(client, command.tournamentId, current, next);
      if (command.type === "draw_bracket")
        await insertBracket(client, command.tournamentId, next);
      await saveResult(client, command.tournamentId, next, revision);
      await hooks.afterSave?.();
      const response: CommandResponse = {
        tournamentId: command.tournamentId,
        revision,
        tournament: next,
        ranking: getRanking(next),
        statistics: getTournamentStats(next),
      };
      const invalidated = current.matches
        .filter(
          (m) =>
            m.status === "completed" &&
            next.matches.find((n) => n.id === m.id)?.status !== "completed",
        )
        .map((m) => m.id);
      await client.query(
        `insert into matchmaking_private.tournament_events(tournament_id,actor_id,command_id,revision,type,rules_version,details) values($1,$2,$3,$4,$5,1,$6::jsonb)`,
        [
          command.tournamentId,
          actor.userId,
          command.commandId,
          revision,
          command.type,
          JSON.stringify({
            before,
            after: before
              ? next.matches.find((m) => m.id === before.id)
              : undefined,
            payload: command.payload,
            invalidated,
          }),
        ],
      );
      await client.query(
        `insert into matchmaking_private.command_receipts(tournament_id,actor_id,command_id,command_version,payload_hash,revision,response) values($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [
          command.tournamentId,
          actor.userId,
          command.commandId,
          1,
          hash,
          revision,
          JSON.stringify(response),
        ],
      );
      await client.query("commit");
      return JSON.parse(JSON.stringify(response)) as CommandResponse;
    } catch (error) {
      try {
        await client.query("rollback");
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
      client.release(discard);
    }
  };
}
