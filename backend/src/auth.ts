import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { CommandError, uuid } from "./commands";

declare const authenticated: unique symbol;
export type AuthenticatedActor = {
  readonly userId: string;
  readonly isAnonymous?: boolean;
  readonly [authenticated]: true;
};
export function createAuthenticator(authUrl: string, key?: JWTVerifyGetKey) {
  const issuer = authUrl.replace(/\/$/, "");
  const url = new URL(issuer);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("Auth requires HTTPS outside loopback");
  const jwks =
    key ??
    createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
      timeoutDuration: 5000,
      cacheMaxAge: 600000,
    });
  return async (
    authorization: string | undefined,
  ): Promise<AuthenticatedActor> => {
    if (!authorization?.startsWith("Bearer "))
      throw new CommandError(401, "UNAUTHENTICATED");
    try {
      const { payload } = await jwtVerify(authorization.slice(7), jwks, {
        issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256"],
        requiredClaims: ["sub", "exp", "iat"],
        maxTokenAge: "1h",
        clockTolerance: 5,
      });
      if (
        !payload.sub ||
        !uuid.test(payload.sub) ||
        payload.role !== "authenticated" ||
        (payload.is_anonymous !== undefined &&
          typeof payload.is_anonymous !== "boolean")
      )
        throw new Error("Invalid actor");
      return {
        userId: payload.sub.toLowerCase(),
        isAnonymous: payload.is_anonymous === true,
      } as AuthenticatedActor;
    } catch {
      throw new CommandError(401, "UNAUTHENTICATED");
    }
  };
}

export function requireRecoverableActor(actor: AuthenticatedActor) {
  if (actor.isAnonymous)
    throw new CommandError(403, "RECOVERABLE_ACCOUNT_REQUIRED");
}
