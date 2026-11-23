import { createServer } from "node:http";
import { Pool } from "pg";
import { createAuthenticator } from "./auth";
import { CommandError } from "./commands";
import { createCommandService } from "./service";

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
const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST" || request.url !== "/commands") {
    response.writeHead(404).end('{"error":"NOT_FOUND"}');
    return;
  }
  try {
    const actor = await authenticate(request.headers.authorization); // network/JWKS before acquiring a DB connection
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 16384) throw new CommandError(413, "PAYLOAD_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    let command: unknown;
    try {
      command = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new CommandError(400, "INVALID_JSON");
    }
    const result = await execute(actor, command);
    response.writeHead(200).end(JSON.stringify(result));
  } catch (error) {
    const known = error instanceof CommandError;
    response
      .writeHead(known ? error.status : 500)
      .end(JSON.stringify({ error: known ? error.code : "INTERNAL_ERROR" }));
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT ?? 8090), "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string")
    process.stdout.write(
      `Matchmaking commands listening on http://127.0.0.1:${address.port}\n`,
    );
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () =>
    server.close(() => {
      void pool.end();
    }),
  );
