import { createServer } from "node:http";
import { Pool } from "pg";
import { createAuthenticator } from "./auth";
import { CommandError } from "./commands";
import { createCommandService } from "./service";
import { createTournamentService } from "./tournaments";
import { createInviteService } from "./invites";

const databaseUrl = process.env.DATABASE_URL,
  authUrl = process.env.SUPABASE_AUTH_URL;
if (!databaseUrl || !authUrl)
  throw new Error("Set server-only DATABASE_URL and SUPABASE_AUTH_URL");
const authenticate = createAuthenticator(authUrl);
const pool = new Pool({
  connectionString: databaseUrl,
  max: 8,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
});
pool.on("error", () =>
  process.stderr.write("Idle database connection failed\n"),
);
const execute = createCommandService(pool);
const tournaments = createTournamentService(pool);
const invites = createInviteService(pool, {
  pepper: process.env.MATCHMAKING_INVITE_PEPPER,
  baseUrl: process.env.MATCHMAKING_INVITE_BASE_URL,
});
const origins = (
  process.env.CORS_ORIGINS ?? "http://localhost:8081,http://127.0.0.1:8081"
).split(",");
if (
  origins.some((o) => {
    try {
      return (
        new URL(o).origin !== o ||
        (!o.startsWith("https://") &&
          !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o))
      );
    } catch {
      return true;
    }
  })
)
  throw new Error(
    "CORS_ORIGINS must contain explicit HTTPS or loopback origins",
  );
const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  const origin = request.headers.origin;
  if (origin && !origins.includes(origin)) {
    response.writeHead(403).end('{"error":"ORIGIN_FORBIDDEN"}');
    return;
  }
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Invite-Token",
    );
    response.writeHead(204).end();
    return;
  }
  let url: URL;
  try {
    url = new URL(request.url ?? "/", "http://127.0.0.1");
  } catch {
    response.writeHead(400).end('{"error":"INVALID_URL"}');
    return;
  }
  const detail = /^\/tournaments\/([a-f0-9-]+)$/i.exec(url.pathname),
    administration = /^\/tournaments\/([a-f0-9-]+)\/(invites|members)$/i.exec(
      url.pathname,
    ),
    preview =
      url.pathname === "/invite-preview" &&
      !url.search &&
      ["GET", "POST"].includes(request.method ?? "");
  const isRead =
    request.method === "GET" &&
    (url.pathname === "/tournaments" || detail || administration);
  const isWrite =
    request.method === "POST" &&
    [
      "/commands",
      "/tournaments",
      "/tournament-imports",
      "/invites",
      "/invites/revoke",
      "/members/remove",
      "/invite-acceptances",
    ].includes(url.pathname) &&
    !url.search;
  if (!isRead && !isWrite && !preview) {
    response.writeHead(404).end('{"error":"NOT_FOUND"}');
    return;
  }
  try {
    const ip = request.socket.remoteAddress ?? "unknown"; // Forwarded headers are untrusted.
    if (preview && request.method === "GET") {
      const previewActor = request.headers.authorization
        ? await authenticate(request.headers.authorization)
        : undefined;
      const result = await invites.preview(
        { kind: "token", value: request.headers["x-invite-token"] },
        ip,
        previewActor,
      );
      response.writeHead(200).end(JSON.stringify(result));
      return;
    }
    const actor =
      preview && !request.headers.authorization
        ? undefined
        : await authenticate(request.headers.authorization); // network/JWKS before acquiring a DB connection
    if (isRead) {
      const result = administration
        ? await invites.list(
            actor!,
            administration[1],
            administration[2] as "invites" | "members",
          )
        : detail
          ? await tournaments.detail(actor!, detail[1])
          : await tournaments.list(actor!, url.searchParams);
      response.writeHead(200).end(JSON.stringify(result));
      return;
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > (url.pathname === "/tournament-imports" ? 262144 : 16384))
        throw new CommandError(413, "PAYLOAD_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    let command: unknown;
    try {
      command = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new CommandError(400, "INVALID_JSON");
    }
    if (
      preview ||
      url.pathname === "/invite-acceptances" ||
      ["/invites", "/invites/revoke", "/members/remove"].includes(url.pathname)
    ) {
      if (!preview && url.pathname !== "/invite-acceptances") {
        const expected = {
          "/invites": "create_invite",
          "/invites/revoke": "revoke_invite",
          "/members/remove": "remove_member",
        }[url.pathname];
        if (
          !command ||
          typeof command !== "object" ||
          !("type" in command) ||
          command.type !== expected
        )
          throw new CommandError(400, "UNSUPPORTED_COMMAND");
      }
      const result = preview
        ? await invites.preview(command, ip, actor)
        : url.pathname === "/invite-acceptances"
          ? await invites.accept(actor!, command, ip)
          : await invites.manage(actor!, command);
      response.writeHead(200).end(JSON.stringify(result));
      return;
    }
    if (url.pathname !== "/commands") {
      const type =
        command && typeof command === "object" && "type" in command
          ? command.type
          : null;
      if (
        type !==
        (url.pathname === "/tournaments"
          ? "create_tournament"
          : "import_tournament")
      )
        throw new CommandError(400, "UNSUPPORTED_COMMAND");
    }
    const result =
      url.pathname === "/commands"
        ? await execute(actor!, command)
        : await tournaments.operate(actor!, command);
    response.writeHead(200).end(JSON.stringify(result));
  } catch (error) {
    const known = error instanceof CommandError;
    if (known && error.status === 429) response.setHeader("Retry-After", "60");
    response
      .writeHead(known ? error.status : 500)
      .end(JSON.stringify({ error: known ? error.code : "INTERNAL_ERROR" }));
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
const host = process.env.MATCHMAKING_DEV_HOST ?? "127.0.0.1";
if (
  host !== "127.0.0.1" &&
  (process.env.NODE_ENV !== "development" ||
    !/^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
      host,
    ))
)
  throw new Error(
    "Use loopback or an explicit private development IPv4 address",
  );
server.listen(Number(process.env.PORT ?? 8090), host, () => {
  const address = server.address();
  if (address && typeof address !== "string")
    process.stdout.write(
      `Matchmaking commands listening on http://${host}:${address.port}\n`,
    );
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () =>
    server.close(() => {
      void pool.end();
    }),
  );
