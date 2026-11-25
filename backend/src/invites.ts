import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { requireRecoverableActor, type AuthenticatedActor } from "./auth";
import { CommandError, exact, object, parseName, uuid } from "./commands";
import { transaction } from "./tournaments";
import { insertParticipant, loadTournament, saveResult } from "./repository";
import { addParticipant } from "../../src/features/tournaments/engine/tournament";
import { canonicalJson } from "../../src/features/tournaments/domain/snapshot";

type Role = "participant" | "viewer";
type Credential = { kind: "token" | "code"; value: string };
type InviteRow = {
  id: string;
  tournament_id: string;
  created_by: string;
  access_role: Role;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  max_uses: number;
  use_count: number;
  checked_at: Date;
};
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function normalizeInviteCode(value: string) {
  return value.toUpperCase().replace(/[ -]/g, "");
}
function credential(input: unknown): Credential {
  const c = object(input);
  exact(c, ["kind", "value"]);
  if (typeof c.value !== "string" || c.value.length > 128)
    throw new CommandError(400, "INVALID_INVITE");
  if (c.kind === "token" && /^[A-Za-z0-9_-]{43}$/.test(c.value))
    return { kind: c.kind, value: c.value };
  const code = normalizeInviteCode(c.value);
  if (
    c.kind === "code" &&
    code.length === 8 &&
    [...code].every((c) => alphabet.includes(c))
  )
    return { kind: c.kind, value: code };
  throw new CommandError(400, "INVALID_INVITE");
}
function id(value: unknown) {
  if (typeof value !== "string" || !uuid.test(value))
    throw new CommandError(400, "INVALID_COMMAND");
  return value.toLowerCase();
}
function base(input: unknown) {
  const c = object(input);
  if (c.commandVersion !== 1)
    throw new CommandError(400, "UNSUPPORTED_COMMAND_VERSION");
  return { c, commandId: id(c.commandId), commandVersion: 1 as const };
}
export function parseAcceptance(input: unknown) {
  const { c, ...b } = base(input);
  exact(c, ["commandId", "commandVersion", "credential", "displayName"]);
  return {
    ...b,
    credential: credential(c.credential),
    ...(c.displayName === undefined
      ? {}
      : { displayName: parseName(c.displayName) }),
  };
}
function parseManagement(input: unknown) {
  const { c, ...b } = base(input);
  exact(c, ["commandId", "commandVersion", "tournamentId", "type", "payload"]);
  const tournamentId = id(c.tournamentId),
    p = object(c.payload);
  if (c.type === "create_invite") {
    exact(p, ["role", "expiresInHours", "maxUses"]);
    if (
      typeof p.role !== "string" ||
      !["participant", "viewer"].includes(p.role) ||
      !Number.isInteger(p.expiresInHours) ||
      Number(p.expiresInHours) < 1 ||
      Number(p.expiresInHours) > 168 ||
      !Number.isInteger(p.maxUses) ||
      Number(p.maxUses) < 1 ||
      Number(p.maxUses) > 100
    )
      throw new CommandError(400, "INVALID_INVITE_OPTIONS");
    return {
      ...b,
      tournamentId,
      type: "create_invite" as const,
      payload: {
        role: p.role as Role,
        expiresInHours: Number(p.expiresInHours),
        maxUses: Number(p.maxUses),
      },
    };
  }
  if (c.type === "revoke_invite") {
    exact(p, ["inviteId"]);
    return {
      ...b,
      tournamentId,
      type: "revoke_invite" as const,
      payload: { inviteId: id(p.inviteId) },
    };
  }
  if (c.type === "remove_member") {
    exact(p, ["userId"]);
    return {
      ...b,
      tournamentId,
      type: "remove_member" as const,
      payload: { userId: id(p.userId) },
    };
  }
  throw new CommandError(400, "UNSUPPORTED_COMMAND");
}
function state(r: InviteRow) {
  return r.revoked_at
    ? "revoked"
    : r.expires_at <= r.checked_at
      ? "expired"
      : r.use_count >= r.max_uses
        ? "exhausted"
        : "active";
}
function summary(r: InviteRow) {
  return {
    id: r.id,
    role: r.access_role,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    maxUses: r.max_uses,
    uses: r.use_count,
    status: state(r),
  };
}
async function root(
  c: PoolClient,
  tournamentId: string,
  actor?: AuthenticatedActor,
) {
  const {
    rows: [r],
  } = await c.query("select * from public.tournaments where id=$1 for update", [
    tournamentId,
  ]);
  if (!r || (actor && r.owner_user_id !== actor.userId))
    throw new CommandError(403, "FORBIDDEN");
  if (r.schema_version !== 1 || r.rules_version !== 1)
    throw new CommandError(409, "UNSUPPORTED_AGGREGATE_VERSION");
  return r;
}
async function member(c: PoolClient, tournamentId: string, userId: string) {
  const {
    rows: [m],
  } = await c.query(
    "select role,participant_id from public.tournament_members where tournament_id=$1 and user_id=$2",
    [tournamentId, userId],
  );
  return m;
}

export function createInviteService(
  pool: Pool,
  options: {
    pepper?: string;
    baseUrl?: string;
    rateLimits?: { ip: number; actor: number; seconds: number };
    afterSave?: () => void | Promise<void>;
    afterLocks?: () => void | Promise<void>;
  } = {},
) {
  const pepper = options.pepper,
    baseUrl = options.baseUrl ?? "http://127.0.0.1:8081";
  if (pepper && !/^[A-Za-z0-9_-]{43,128}$/.test(pepper))
    throw new Error("Invalid server invitation pepper");
  const url = new URL(baseUrl);
  const local =
    /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
      url.hostname,
    );
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        local &&
        (url.hostname === "localhost" ||
          url.hostname === "127.0.0.1" ||
          process.env.NODE_ENV === "development")
      ))
  )
    throw new Error(
      "Invitation base must be an HTTPS origin or explicit local development origin",
    );
  function requireConfiguration() {
    if (!pepper) throw new CommandError(503, "INVITES_UNAVAILABLE");
  }
  const hmac = (purpose: string, value: string) =>
    createHmac("sha256", pepper!).update(`${purpose}:${value}`).digest("hex");
  function digest(c: Credential) {
    return c.kind === "code"
      ? hmac("invite-code-v1", c.value)
      : createHash("sha256").update(`invite-token-v1:${c.value}`).digest("hex");
  }
  const hash = (input: unknown) =>
    hmac("invite-command-v1", canonicalJson(input));
  async function limit(ip: string, actorId?: string) {
    requireConfiguration();
    const settings = options.rateLimits ?? { ip: 60, actor: 20, seconds: 60 };
    // A separate committed transaction: rejected attempts survive admission rollback.
    const allowed = await transaction(pool, false, async (c) => {
      await c.query(
        "delete from matchmaking_private.invite_rate_limits where bucket in(select bucket from matchmaking_private.invite_rate_limits where resets_at<clock_timestamp()-interval '2 hours' limit 100)",
      );
      let allowed = true;
      for (const [bucket, max] of [
        [hmac("invite-ip-v1", ip.replace(/^::ffff:/, "")), settings.ip],
        ...(actorId
          ? [[hmac("invite-actor-v1", actorId), settings.actor]]
          : []),
      ] as [string, number][]) {
        const {
          rows: [r],
        } = await c.query(
          `insert into matchmaking_private.invite_rate_limits(bucket,attempts,resets_at) values($1,1,clock_timestamp()+make_interval(secs=>$2))
          on conflict(bucket) do update set attempts=case when invite_rate_limits.resets_at<=clock_timestamp() then 1 else least(invite_rate_limits.attempts+1,1000000) end,
          resets_at=case when invite_rate_limits.resets_at<=clock_timestamp() then clock_timestamp()+make_interval(secs=>$2) else invite_rate_limits.resets_at end returning attempts`,
          [bucket, settings.seconds],
        );
        if (r.attempts > max) allowed = false;
      }
      return allowed;
    });
    if (!allowed) throw new CommandError(429, "INVITE_RATE_LIMITED");
  }
  async function find(c: PoolClient, secret: Credential, lock = false) {
    const {
      rows: [r],
    } = await c.query<InviteRow>(
      `select i.*,clock_timestamp() as checked_at from matchmaking_private.tournament_invites i where ${secret.kind === "code" ? "code_digest" : "token_digest"}=$1 ${lock ? "for update" : ""}`,
      [digest(secret)],
    );
    if (!r) throw new CommandError(404, "INVALID_INVITE");
    return r;
  }
  async function receipt(
    c: PoolClient,
    actor: AuthenticatedActor,
    commandId: string,
  ) {
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `invite-operation:${actor.userId}:${commandId}`,
    ]);
    return (
      await c.query(
        "select * from matchmaking_private.invite_receipts where actor_id=$1 and command_id=$2",
        [actor.userId, commandId],
      )
    ).rows[0];
  }
  async function record(
    c: PoolClient,
    actor: AuthenticatedActor,
    commandId: string,
    tournamentId: string,
    type: string,
    payloadHash: string,
    response: unknown,
    details: unknown,
  ) {
    await c.query(
      "insert into matchmaking_private.invite_events(tournament_id,actor_id,command_id,type,details) values($1,$2,$3,$4,$5::jsonb)",
      [tournamentId, actor.userId, commandId, type, JSON.stringify(details)],
    );
    await c.query(
      "insert into matchmaking_private.invite_receipts(actor_id,command_id,tournament_id,payload_hash,response) values($1,$2,$3,$4,$5::jsonb)",
      [
        actor.userId,
        commandId,
        tournamentId,
        payloadHash,
        JSON.stringify(response),
      ],
    );
    await options.afterSave?.();
  }
  return {
    async manage(actor: AuthenticatedActor, input: unknown) {
      requireConfiguration();
      requireRecoverableActor(actor);
      const op = parseManagement(input),
        payloadHash = hash(op);
      return transaction(pool, false, async (c) => {
        const previous = await receipt(c, actor, op.commandId),
          t = await root(c, op.tournamentId, actor);
        if (previous) {
          if (previous.payload_hash !== payloadHash)
            throw new CommandError(409, "IDEMPOTENCY_KEY_REUSED");
          return { ...previous.response, replayed: true };
        }
        if (op.type === "create_invite") {
          if (op.payload.role === "participant" && t.status !== "draft")
            throw new CommandError(409, "TOURNAMENT_STARTED");
          const count = await c.query(
            "select count(*)::int as count from matchmaking_private.tournament_invites where tournament_id=$1 and revoked_at is null and expires_at>clock_timestamp() and use_count<max_uses",
            [op.tournamentId],
          );
          if (count.rows[0].count >= 20)
            throw new CommandError(409, "INVITE_LIMIT_REACHED");
          for (let attempt = 0; attempt < 5; attempt++) {
            const token = randomBytes(32).toString("base64url"),
              code = [...randomBytes(8)].map((v) => alphabet[v & 31]).join("");
            const {
              rows: [r],
            } = await c.query<InviteRow>(
              `insert into matchmaking_private.tournament_invites(id,tournament_id,created_by,access_role,token_digest,code_digest,expires_at,max_uses)
              values($1,$2,$3,$4,$5,$6,clock_timestamp()+make_interval(hours=>$7),$8) on conflict do nothing returning *,clock_timestamp() as checked_at`,
              [
                randomUUID(),
                op.tournamentId,
                actor.userId,
                op.payload.role,
                digest({ kind: "token", value: token }),
                digest({ kind: "code", value: code }),
                op.payload.expiresInHours,
                op.payload.maxUses,
              ],
            );
            if (!r) continue;
            const result = { invite: summary(r) };
            await record(
              c,
              actor,
              op.commandId,
              op.tournamentId,
              op.type,
              payloadHash,
              result,
              { inviteId: r.id, role: r.access_role },
            );
            // Credentials are returned once only. No receipt/event stores them.
            return {
              ...result,
              shareUrl: `${url.origin}/invite#token=${token}`,
              code,
              development: local,
            };
          }
          throw new CommandError(409, "RETRY_SAME_COMMAND");
        }
        if (op.type === "revoke_invite") {
          const {
            rows: [r],
          } = await c.query<InviteRow>(
            "update matchmaking_private.tournament_invites set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=$1 and tournament_id=$2 returning *,clock_timestamp() as checked_at",
            [op.payload.inviteId, op.tournamentId],
          );
          if (!r) throw new CommandError(404, "INVALID_INVITE");
          const result = { invite: summary(r) };
          await record(
            c,
            actor,
            op.commandId,
            op.tournamentId,
            op.type,
            payloadHash,
            result,
            { inviteId: r.id },
          );
          return result;
        }
        const m = await member(c, op.tournamentId, op.payload.userId);
        if (m?.participant_id)
          throw new CommandError(409, "REMOVE_PLAYER_FIRST");
        await c.query(
          "delete from public.tournament_members where tournament_id=$1 and user_id=$2",
          [op.tournamentId, op.payload.userId],
        );
        const result = { removed: !!m };
        await record(
          c,
          actor,
          op.commandId,
          op.tournamentId,
          op.type,
          payloadHash,
          result,
          { userId: op.payload.userId },
        );
        return result;
      });
    },
    async preview(input: unknown, ip: string, actor?: AuthenticatedActor) {
      await limit(ip);
      const secret = credential(input);
      return transaction(pool, true, async (c) => {
        const r = await find(c, secret),
          s = state(r);
        const {
          rows: [t],
        } = await c.query(
          "select owner_user_id,name,modality,capacity,status,(select count(*)::int from public.participants where tournament_id=t.id) as participants from public.tournaments t where id=$1",
          [r.tournament_id],
        );
        const m = actor
            ? await member(c, r.tournament_id, actor.userId)
            : undefined,
          role =
            actor && !actor.isAnonymous && t.owner_user_id === actor.userId
              ? "organizer"
              : m?.role;
        if (!role && s !== "active")
          throw new CommandError(410, `INVITE_${s.toUpperCase()}`);
        return {
          ...(role
            ? { membership: { role, tournamentId: r.tournament_id } }
            : {}),
          name: t.name,
          modality: t.modality,
          format: "single_elimination",
          role: r.access_role,
          status: t.status,
          availableSlots: t.capacity - t.participants,
          expiresAt: r.expires_at.toISOString(),
          availability:
            r.access_role === "participant"
              ? t.status !== "draft"
                ? "started"
                : t.participants >= t.capacity
                  ? "full"
                  : "available"
              : "available",
        };
      });
    },
    async accept(actor: AuthenticatedActor, input: unknown, ip: string) {
      requireConfiguration();
      const op = parseAcceptance(input),
        payloadHash = hash(op);
      await limit(ip, actor.userId);
      return transaction(pool, false, async (c) => {
        const previous = await receipt(c, actor, op.commandId);
        if (previous) {
          const t = await root(c, previous.tournament_id),
            m = await member(c, previous.tournament_id, actor.userId);
          if (t.owner_user_id !== actor.userId && !m)
            throw new CommandError(403, "FORBIDDEN");
          if (previous.payload_hash !== payloadHash)
            throw new CommandError(409, "IDEMPOTENCY_KEY_REUSED");
          return previous.response;
        }
        const found = await find(c, op.credential),
          t = await root(c, found.tournament_id);
        const r = await find(c, op.credential, true);
        await options.afterLocks?.();
        // Recheck the wall clock AFTER lock waits, never the transaction start time.
        r.checked_at = (
          await c.query("select clock_timestamp() as at")
        ).rows[0].at;
        const existing = await member(c, r.tournament_id, actor.userId);
        let role: Role | "organizer" =
            t.owner_user_id === actor.userId ? "organizer" : existing?.role,
          participantId: string | undefined =
            existing?.participant_id ?? undefined,
          revision = Number(t.revision);
        const alreadyMember = !!role;
        if (!alreadyMember) {
          const s = state(r);
          if (s !== "active")
            throw new CommandError(410, `INVITE_${s.toUpperCase()}`);
          const {
            rows: [members],
          } = await c.query(
            "select count(*)::int as count from public.tournament_members where tournament_id=$1",
            [r.tournament_id],
          );
          if (members.count >= 200)
            throw new CommandError(409, "MEMBER_LIMIT_REACHED");
          role = r.access_role;
          if (role === "participant") {
            if (t.status !== "draft")
              throw new CommandError(409, "TOURNAMENT_STARTED");
            const current = await loadTournament(c, r.tournament_id);
            if (current.participants.length >= current.capacity)
              throw new CommandError(409, "TOURNAMENT_FULL");
            if (!op.displayName)
              throw new CommandError(400, "DISPLAY_NAME_REQUIRED");
            const next = addParticipant(current, op.displayName),
              p = next.participants.at(-1)!;
            participantId = p.id = `p-${randomUUID()}`;
            await insertParticipant(
              c,
              r.tournament_id,
              p,
              next.participants.length - 1,
            );
            revision++;
            await saveResult(c, r.tournament_id, next, revision);
            await c.query(
              "insert into matchmaking_private.tournament_events(tournament_id,actor_id,command_id,revision,type,rules_version,details) values($1,$2,$3,$4,'accept_invite',1,$5::jsonb)",
              [
                r.tournament_id,
                actor.userId,
                op.commandId,
                revision,
                JSON.stringify({ participantId, inviteId: r.id }),
              ],
            );
          }
          await c.query(
            "insert into public.tournament_members(tournament_id,user_id,role,participant_id) values($1,$2,$3,$4)",
            [r.tournament_id, actor.userId, role, participantId ?? null],
          );
          await c.query(
            "update matchmaking_private.tournament_invites set use_count=use_count+1 where id=$1",
            [r.id],
          );
        }
        const result = {
          tournamentId: r.tournament_id,
          role,
          participantId,
          revision,
          alreadyMember,
        };
        await record(
          c,
          actor,
          op.commandId,
          r.tournament_id,
          "accept_invite",
          payloadHash,
          result,
          { inviteId: r.id, role, participantId, alreadyMember },
        );
        return result;
      });
    },
    async list(
      actor: AuthenticatedActor,
      tournamentId: string,
      kind: "invites" | "members",
    ) {
      requireConfiguration();
      requireRecoverableActor(actor);
      tournamentId = id(tournamentId);
      return transaction(pool, true, async (c) => {
        const {
          rows: [t],
        } = await c.query(
          "select owner_user_id from public.tournaments where id=$1",
          [tournamentId],
        );
        if (!t || t.owner_user_id !== actor.userId)
          throw new CommandError(403, "FORBIDDEN");
        if (kind === "invites") {
          const { rows } = await c.query<InviteRow>(
            "select id,tournament_id,created_by,access_role,created_at,expires_at,revoked_at,max_uses,use_count,clock_timestamp() as checked_at from matchmaking_private.tournament_invites where tournament_id=$1 order by (revoked_at is null and expires_at>clock_timestamp() and use_count<max_uses) desc,created_at desc,id desc limit 100",
            [tournamentId],
          );
          return { items: rows.map(summary) };
        }
        const { rows } = await c.query(
          "select m.user_id,m.role,m.participant_id,m.created_at,p.display_name from public.tournament_members m left join public.participants p on p.tournament_id=m.tournament_id and p.domain_id=m.participant_id where m.tournament_id=$1 order by m.created_at,m.user_id limit 200",
          [tournamentId],
        );
        return {
          items: rows.map((m) => ({
            userId: m.user_id,
            role: m.role,
            participantId: m.participant_id ?? undefined,
            displayName: m.display_name ?? "Espectador",
            createdAt: m.created_at.toISOString(),
          })),
        };
      });
    },
  };
}
