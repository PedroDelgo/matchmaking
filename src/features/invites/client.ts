import { getTournamentApiUrl } from "../tournaments/remote/client";
import type { InviteCredential } from "../tournaments/remote/client";

export type InvitationPreview = {
  name: string;
  modality: string;
  format: "single_elimination";
  role: "participant" | "viewer";
  status: "draft" | "active" | "completed";
  availableSlots: number;
  expiresAt: string;
  availability: "available" | "full" | "started";
  membership?: {
    role: "organizer" | "participant" | "viewer";
    tournamentId: string;
  };
};
export function invitationMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return (
    (
      {
        INVALID_INVITE:
          "Este convite é inválido. Confira o link ou peça um novo convite ao organizador.",
        INVALID_INVITE_CODE: "Digite os oito caracteres do código de convite.",
        INVITE_EXPIRED:
          "Este convite expirou. Peça um novo convite ao organizador.",
        INVITE_REVOKED:
          "Este convite foi revogado. Quem já entrou mantém seu acesso.",
        INVITE_EXHAUSTED:
          "Todas as utilizações deste convite foram usadas. Peça outro ao organizador.",
        TOURNAMENT_FULL: "As vagas para jogar já foram preenchidas.",
        TOURNAMENT_STARTED:
          "A disputa já começou. Novos jogadores não podem entrar nesta chave.",
        INVITE_RATE_LIMITED:
          "Muitas tentativas em pouco tempo. Aguarde um minuto antes de tentar novamente.",
        INVITES_UNAVAILABLE:
          "Os convites estão indisponíveis no momento. Tente novamente mais tarde.",
        UNAUTHORIZED: "Valide sua sessão para confirmar a entrada.",
        OFFLINE:
          "Não foi possível consultar o convite. Verifique a conexão e tente novamente.",
        API_UNAVAILABLE:
          "A conexão de campeonatos online ainda não está configurada. Os torneios locais continuam disponíveis.",
      } as Record<string, string>
    )[code] ??
    "Não foi possível concluir esta ação. Revise os dados e tente novamente."
  );
}

export async function previewInvitation(
  credential: InviteCredential,
  accessToken?: string,
  signal?: AbortSignal,
): Promise<InvitationPreview> {
  const api = getTournamentApiUrl();
  if (!api) throw new Error("API_UNAVAILABLE");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await globalThis.fetch(`${api}/invite-preview`, {
      method: credential.kind === "token" ? "GET" : "POST",
      headers: {
        ...(credential.kind === "token"
          ? { "X-Invite-Token": credential.value }
          : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(credential.kind === "code"
        ? { body: JSON.stringify(credential) }
        : {}),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const code =
        body && typeof body === "object" && "error" in body
          ? String(body.error)
          : "INVALID_INVITE";
      throw new Error(code);
    }
    const p = body as InvitationPreview;
    if (
      !p ||
      typeof p.name !== "string" ||
      p.name.length > 160 ||
      typeof p.modality !== "string" ||
      p.modality.length > 160 ||
      p.format !== "single_elimination" ||
      !["participant", "viewer"].includes(p.role) ||
      !["draft", "active", "completed"].includes(p.status) ||
      !["available", "full", "started"].includes(p.availability) ||
      !Number.isInteger(p.availableSlots) ||
      p.availableSlots < 0 ||
      p.availableSlots > 16 ||
      !Number.isFinite(Date.parse(p.expiresAt)) ||
      (p.membership &&
        (!["organizer", "participant", "viewer"].includes(p.membership.role) ||
          !/^[a-f0-9-]{36}$/i.test(p.membership.tournamentId)))
    )
      throw new Error("INVALID_INVITE");
    return p;
  } catch (error) {
    if (error instanceof TypeError || controller.signal.aborted)
      throw new Error("OFFLINE");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
