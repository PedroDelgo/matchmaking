import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Pool } from "pg";

const connectionString = process.env.MATCHMAKING_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "Set MATCHMAKING_TEST_DATABASE_URL (loopback admin; no remote database is accepted)",
  );
const url = new URL(connectionString);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  throw new Error("Database tests require loopback");
const name = `mm_5a_test_${randomBytes(8).toString("hex")}`;
if (
  url.search ||
  url.hash ||
  !["postgres:", "postgresql:"].includes(url.protocol)
)
  throw new Error(
    "Connection overrides are not allowed in the database test URL",
  );
const login = `mm_5a_role_${randomBytes(8).toString("hex")}`;
const password = randomBytes(32).toString("hex");
const admin = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 5000,
});
let created = false;
let loginCreated = false;
try {
  await admin.query(`create database ${name}`);
  created = true;
  url.pathname = `/${name}`;
  const target = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    await target.query(await readFile("supabase/tests/bootstrap.sql", "utf8"));
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await target.query(await readFile(`supabase/migrations/${file}`, "utf8"));
    await target.query(await readFile("supabase/tests/access.sql", "utf8"));
    await target.query(
      `create role ${login} login noinherit nosuperuser nobypassrls password '${password}'`,
    );
    loginCreated = true;
    await target.query(
      `grant matchmaking_command to ${login} with admin false, inherit false, set true`,
    );
    console.log(
      "Migrations and SQL access assertions passed on disposable PostgreSQL database.",
    );
  } finally {
    await target.end();
  }
  const commandUrl = new URL(url);
  commandUrl.username = login;
  commandUrl.password = password;
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--test",
        "backend/test/database.integration.ts",
        "backend/test/cloud.integration.ts",
        "backend/test/invites.integration.ts",
      ],
      {
        env: {
          ...process.env,
          MATCHMAKING_DATABASE_TEST_URL: url.toString(),
          MATCHMAKING_COMMAND_TEST_URL: commandUrl.toString(),
        },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally {
  // Name is generated in this process and created above; no existing DB is reset/dropped.
  if (created) await admin.query(`drop database ${name} with (force)`);
  if (loginCreated) await admin.query(`drop role ${login}`);
  await admin.end();
}
