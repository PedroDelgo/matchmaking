import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Pool } from "pg";

export function localInvitePepper() {
  const path = "backend/.invite-pepper";
  if (!existsSync(path))
    writeFileSync(path, randomBytes(32).toString("base64url"), {
      flag: "wx",
      mode: 0o600,
    });
  const value = readFileSync(path, "utf8").trim();
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(value))
    throw new Error("Invalid ignored local invitation pepper");
  return value;
}

/** Local operator bootstrap. The restricted credential exists only in memory. */
export async function withLocalApi(status, run, { manual = false } = {}) {
  const database = new URL(status.DB_URL);
  if (
    !["127.0.0.1", "localhost"].includes(database.hostname) ||
    database.port !== "54322" ||
    database.pathname !== "/postgres" ||
    database.search ||
    database.hash
  )
    throw new Error(
      "Local API bootstrap requires the local PostgreSQL instance",
    );
  const admin = new Pool({ connectionString: database.toString(), max: 1 }),
    login = `mm_5c_api_${randomBytes(8).toString("hex")}`,
    password = randomBytes(32).toString("hex");
  let created = false,
    child;
  try {
    await admin.query(
      `create role ${login} login noinherit nosuperuser nobypassrls password '${password}'`,
    );
    created = true;
    await admin.query(
      `grant matchmaking_command to ${login} with admin false, inherit false, set true`,
    );
    database.username = login;
    database.password = password;
    child = spawn(process.execPath, ["backend/dist/server.mjs"], {
      env: {
        ...process.env,
        DATABASE_URL: database.toString(),
        SUPABASE_AUTH_URL: `${status.API_URL}/auth/v1`,
        MATCHMAKING_INVITE_PEPPER: localInvitePepper(),
        PORT: manual ? (process.env.PORT ?? "8090") : "0",
        NODE_ENV: manual ? "development" : "test",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const server = child;
    const api = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Local API startup timed out")),
        10000,
      );
      const fail = () => {
        clearTimeout(timer);
        reject(
          new Error(
            "Local API could not start; check the selected address and port",
          ),
        );
      };
      server.once("error", fail);
      server.once("exit", fail);
      server.stdout.on("data", (chunk) => {
        const match = String(chunk).match(/http:\/\/[\d.]+:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      // Child diagnostics may contain connection data. Surface only generic errors.
      server.stderr.resume();
    });
    if (manual) {
      process.stdout.write(
        `Tournament API: ${api}\nUse EXPO_PUBLIC_MATCHMAKING_API_URL=${api} in the ignored client environment.\nThe temporary server login is removed when this command stops.\n`,
      );
      await new Promise((resolve) => {
        const stop = () => server.kill();
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
        server.once("exit", () => {
          process.removeListener("SIGINT", stop);
          process.removeListener("SIGTERM", stop);
          resolve();
        });
      });
    } else await run(api);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exit = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exit;
    }
    if (created) await admin.query(`drop role ${login}`);
    await admin.end();
  }
}
