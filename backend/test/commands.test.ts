import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { parseCommand, commandHash } from "../src/commands";
import { createAuthenticator } from "../src/auth";

const command = {
  commandId: randomUUID(),
  commandVersion: 1,
  tournamentId: randomUUID(),
  expectedRevision: 0,
  type: "record_result",
  payload: { matchId: "legacy-r1-m1", score1: 3, score2: 1 },
};
test("strict contract and canonical hash ignore property order and UUID case", () => {
  const a = parseCommand(command);
  const b = parseCommand({
    ...command,
    commandId: command.commandId.toUpperCase(),
    payload: { score2: 1, score1: 3, matchId: "legacy-r1-m1" },
  });
  assert.equal(commandHash(a), commandHash(b));
});
test("rejects actor/role injection, unsupported commands, unsafe scores and malformed ties", () => {
  for (const bad of [
    null,
    [],
    { ...command, actorId: randomUUID() },
    { ...command, commandVersion: 2 },
    { ...command, expectedRevision: -1 },
    { ...command, type: "draw_bracket" },
    { ...command, commandId: "legacy-id" },
    ...[NaN, Infinity, 1.5, -1, Number.MAX_SAFE_INTEGER + 1, "3"].map(
      (score1) => ({ ...command, payload: { ...command.payload, score1 } }),
    ),
    { ...command, payload: { ...command.payload, role: "organizer" } },
    { ...command, payload: { ...command.payload, score2: 3 } },
    { ...command, payload: { ...command.payload, tieBreakWinnerId: "p1" } },
  ])
    assert.throws(() => parseCommand(bad));
  assert.equal(
    parseCommand({
      ...command,
      payload: { matchId: "m", score1: 0, score2: 0, tieBreakWinnerId: "p1" },
    }).payload.score1,
    0,
  );
});
test("verifies signature, issuer, audience, expiry, subject and authenticated role", async () => {
  const keys = await generateKeyPair("ES256"),
    user = randomUUID();
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: "test" };
  const auth = createAuthenticator(
    "http://127.0.0.1:54321/auth/v1",
    createLocalJWKSet({ keys: [jwk] }),
  );
  const sign = async (claims: Record<string, unknown> = {}) =>
    new SignJWT({ role: "authenticated", ...claims })
      .setProtectedHeader({ alg: "ES256", kid: "test" })
      .setSubject(user)
      .setIssuer("http://127.0.0.1:54321/auth/v1")
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("1m")
      .sign(keys.privateKey);
  assert.equal((await auth(`Bearer ${await sign()}`)).userId, user);
  await assert.rejects(auth(undefined));
  await assert.rejects(auth(`Bearer ${await sign({ role: "service_role" })}`));
  for (const mutation of [
    { iss: "https://wrong.invalid" },
    { aud: "wrong" },
    { exp: 0 },
    { sub: "not-a-uuid" },
    { iat: Math.floor(Date.now() / 1000) + 600 },
    { exp: undefined },
  ]) {
    const token = await new SignJWT({
      role: "authenticated",
      sub: user,
      iss: "http://127.0.0.1:54321/auth/v1",
      aud: "authenticated",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60,
      ...mutation,
    })
      .setProtectedHeader({ alg: "ES256", kid: "test" })
      .sign(keys.privateKey);
    await assert.rejects(auth(`Bearer ${token}`));
  }
  const other = await generateKeyPair("ES256");
  const forged = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "test" })
    .setSubject(user)
    .setIssuedAt()
    .setExpirationTime("1m")
    .setIssuer("http://127.0.0.1:54321/auth/v1")
    .setAudience("authenticated")
    .sign(other.privateKey);
  await assert.rejects(auth(`Bearer ${forged}`));
});
