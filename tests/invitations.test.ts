import { randomBytes } from "node:crypto";
import jsQR from "jsqr";
import {
  forgetInvitation,
  invitationCode,
  invitationFromUrl,
  invitationToken,
  pendingInvitation,
  rememberInvitation,
  validatedInvitationUrl,
} from "../src/features/invites/credential";
import { invitationQr } from "../src/features/invites/qr";
import {
  invitationMessage,
  previewInvitation,
} from "../src/features/invites/client";

const savedUrl = process.env.EXPO_PUBLIC_MATCHMAKING_API_URL,
  savedFetch = globalThis.fetch;
const fixture = {
  name: "Copa de amigos",
  modality: "Futebol",
  format: "single_elimination",
  role: "participant",
  status: "draft",
  availableSlots: 4,
  expiresAt: "2026-11-26T12:00:00.000Z",
  availability: "available",
};
const response = (data: unknown, status = 200) =>
  ({ ok: status < 400, json: async () => data }) as Response;
beforeEach(() => {
  process.env.EXPO_PUBLIC_MATCHMAKING_API_URL = "http://127.0.0.1:8090";
  forgetInvitation();
});
afterEach(() => {
  globalThis.fetch = savedFetch;
  if (savedUrl === undefined)
    delete process.env.EXPO_PUBLIC_MATCHMAKING_API_URL;
  else process.env.EXPO_PUBLIC_MATCHMAKING_API_URL = savedUrl;
  forgetInvitation();
});

test("código humano normaliza espaços/hífens e rejeita caracteres ambíguos; continuação é somente em memória", () => {
  expect(invitationCode(" abcd-2345 ")).toEqual({
    kind: "code",
    value: "ABCD2345",
  });
  for (const value of [
    "ABCD234",
    "ABCD23456",
    "ABCD23O5",
    "ABCD23I5",
    "ABCD2305",
    "ABCD23\n45",
  ])
    expect(() => invitationCode(value)).toThrow("INVALID_INVITE_CODE");
  const capability = invitationToken(randomBytes(32).toString("base64url"));
  rememberInvitation(capability);
  const recovered = pendingInvitation();
  expect(recovered?.value === capability.value).toBe(true);
  if (recovered) recovered.value = "mutated";
  expect(pendingInvitation()?.value === capability.value).toBe(true);
  forgetInvitation();
  expect(pendingInvitation()).toBeNull();
});

test("URLs de convite exigem origem segura e um único token no fragmento; parâmetros extras não são aceitos", () => {
  const token = randomBytes(32).toString("base64url"),
    base = "https://matchmaking.example/invite";
  expect(invitationFromUrl(`${base}#token=${token}`)?.value === token).toBe(
    true,
  );
  expect(invitationFromUrl(`${base}/${token}`)?.value === token).toBe(true);
  expect(
    validatedInvitationUrl(`${base}#token=${token}`) ===
      `${base}#token=${token}`,
  ).toBe(true);
  for (const value of [
    `${base}#token=${token}&token=${token}`,
    `${base}#token=${token}&role=organizer`,
    `${base}?token=${token}`,
    `${base}#token=invalid`,
  ])
    expect(() => invitationFromUrl(value)).toThrow();
  for (const value of [
    `http://matchmaking.example/invite#token=${token}`,
    `https://actor:secret@matchmaking.example/invite#token=${token}`,
    `https://matchmaking.example/another#token=${token}`,
    `${base}/${token}`,
  ])
    expect(() => validatedInvitationUrl(value)).toThrow();
});

test("QR local é decodificado independentemente para o mesmo link e preserva quatro módulos de margem branca", () => {
  const url = `http://127.0.0.1:8081/invite#token=${randomBytes(32).toString("base64url")}`;
  const symbol = invitationQr(url),
    scale = 5,
    width = symbol.size * scale;
  const rgba = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) {
      const dark = symbol.matrix[Math.floor(y / scale)][Math.floor(x / scale)],
        index = (y * width + x) * 4;
      rgba[index] = rgba[index + 1] = rgba[index + 2] = dark ? 0 : 255;
      rgba[index + 3] = 255;
    }
  const decoded = jsQR(rgba, width, width);
  expect(decoded?.data === url).toBe(true);
  expect(symbol.path.includes("token")).toBe(false);
  for (let y = 0; y < symbol.size; y++)
    for (let x = 0; x < symbol.size; x++)
      if (x < 4 || y < 4 || x >= symbol.size - 4 || y >= symbol.size - 4)
        expect(symbol.matrix[y][x]).toBe(false);
});

test("rotas instaladas e Expo Go reconhecem convite frio/quente sem interpretar esquemas ou caminhos alheios", () => {
  const token = randomBytes(32).toString("base64url");
  for (const value of [
    `matchmaking://invite/${token}`,
    `matchmaking:///invite/${token}`,
    `matchmaking://invite#token=${token}`,
    `exp://192.168.1.2:8081/--/invite/${token}`,
    `exp://192.168.1.2:8081/--/invite#token=${token}`,
    `exps://192.168.1.2:8081/--/invite/${token}`,
  ])
    expect(invitationFromUrl(value)?.value === token).toBe(true);
  for (const value of [
    `other://invite/${token}`,
    `matchmaking://another/invite#token=${token}`,
    `https://matchmaking.example/profile#token=${token}`,
    `exp://192.168.1.2:8081/--/profile#token=${token}`,
  ])
    expect(invitationFromUrl(value)).toBeNull();
  expect(() =>
    invitationFromUrl(`matchmaking://invite/${token}#token=${token}`),
  ).toThrow("INVALID_INVITE");
});

test("prévia de link usa GET sem token na URL, sem cache/referrer e com Bearer opcional", async () => {
  const token = randomBytes(32).toString("base64url");
  const request = jest.fn(async () => response(fixture));
  globalThis.fetch = request;
  await previewInvitation(invitationToken(token), "current-session");
  const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("http://127.0.0.1:8090/invite-preview");
  expect(url.includes(token)).toBe(false);
  expect(init.method).toBe("GET");
  expect(init.body).toBeUndefined();
  expect(
    init.headers &&
      (init.headers as Record<string, string>)["X-Invite-Token"] === token,
  ).toBe(true);
  expect(init.headers).toHaveProperty(
    "Authorization",
    "Bearer current-session",
  );
  expect(init).toMatchObject({
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
});

test("prévia por código é POST e erros de servidor/rede são sanitizados; resposta inválida é recusada", async () => {
  const request = jest.fn(async () => response(fixture));
  globalThis.fetch = request;
  await previewInvitation(invitationCode("ABCD-2345"));
  const init = (request.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(init.method).toBe("POST");
  expect(init.body).toBe(JSON.stringify({ kind: "code", value: "ABCD2345" }));
  request.mockResolvedValue(response({ error: "INVITE_REVOKED" }, 410));
  await expect(previewInvitation(invitationCode("ABCD2345"))).rejects.toThrow(
    "INVITE_REVOKED",
  );
  expect(
    invitationMessage(new Error("untrusted database detail")),
  ).not.toContain("database");
  expect(invitationMessage(new Error("INVITE_RATE_LIMITED"))).toContain(
    "Aguarde um minuto",
  );
  request.mockResolvedValue(response({ ...fixture, availableSlots: 17 }));
  await expect(previewInvitation(invitationCode("ABCD2345"))).rejects.toThrow(
    "INVALID_INVITE",
  );
  request.mockRejectedValue(new TypeError("network"));
  await expect(previewInvitation(invitationCode("ABCD2345"))).rejects.toThrow(
    "OFFLINE",
  );
});
