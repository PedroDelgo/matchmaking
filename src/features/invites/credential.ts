import type { InviteCredential } from "../tournaments/remote/client";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const codePattern = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;
// Deliberately memory-only: an invitation survives a voluntary login navigation,
// but is never written to account storage, the local tournament envelope or logs.
let continuation: InviteCredential | null = null;

export function normalizeInvitationCode(value: string) {
  return value.toUpperCase().replace(/[ -]/g, "");
}
export function invitationCode(value: string): InviteCredential {
  const code = normalizeInvitationCode(value);
  if (!codePattern.test(code)) throw new Error("INVALID_INVITE_CODE");
  return { kind: "code", value: code };
}
export function invitationToken(value: unknown): InviteCredential {
  if (typeof value !== "string" || !tokenPattern.test(value))
    throw new Error("INVALID_INVITE");
  return { kind: "token", value };
}
export function rememberInvitation(credential: InviteCredential) {
  continuation = { ...credential };
}
export function pendingInvitation() {
  return continuation ? { ...continuation } : null;
}
export function forgetInvitation() {
  continuation = null;
}
export function invitationFromUrl(value: string): InviteCredential | null {
  const url = new URL(value);
  if (
    !["https:", "http:", "matchmaking:", "exp:", "exps:"].includes(url.protocol)
  )
    return null;
  let path = url.pathname;
  if (url.protocol === "matchmaking:" && !["", "invite"].includes(url.hostname))
    return null;
  if (url.protocol === "matchmaking:" && url.hostname === "invite")
    path = `/invite${path}`;
  if (["exp:", "exps:"].includes(url.protocol))
    path = path.replace(/^\/--(?=\/)/, "");
  const pathToken = /^\/invite\/([^/]+)\/?$/.exec(path);
  if (path !== "/invite" && path !== "/invite/" && !pathToken) return null;
  if (url.username || url.password) throw new Error("INVALID_INVITE");
  if (url.search) throw new Error("INVALID_INVITE");
  if (url.hash) {
    if (pathToken) throw new Error("INVALID_INVITE");
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (
      [...fragment.keys()].some((key) => key !== "token") ||
      fragment.getAll("token").length !== 1
    )
      throw new Error("INVALID_INVITE");
    return invitationToken(fragment.get("token"));
  }
  return pathToken ? invitationToken(decodeURIComponent(pathToken[1])) : null;
}

export function validatedInvitationUrl(value: string): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    privateIp =
      /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
        url.hostname,
      );
  if (
    url.username ||
    url.password ||
    url.pathname !== "/invite" ||
    url.search ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && (loopback || (__DEV__ && privateIp)))) ||
    !invitationFromUrl(value)
  )
    throw new Error("INVALID_INVITE");
  return url.toString();
}
