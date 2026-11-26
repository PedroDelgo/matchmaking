import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { exportJWK, generateKeyPair } from "jose";
import { withLocalApi, localInvitePepper } from "./local-api.mjs";

// Local operator tooling only. No values returned by status enter the Expo bundle
// except the two explicitly public EXPO_PUBLIC_ fields below.
const mode = process.argv[2] ?? "start";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const cli = "node_modules/supabase/dist/supabase.js";
const excluded =
  "storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";

function run(file, args, env = process.env, capture = false) {
  const child = spawnSync(process.execPath, [file, ...args], {
    env,
    windowsHide: true,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (child.error || child.status !== 0)
    throw new Error(
      "Local command failed. Check Docker, ports and the Supabase configuration; credentials are not printed.",
    );
  return child.stdout ?? "";
}
function localStatus() {
  const status = JSON.parse(
    run(cli, ["status", "--output", "json"], process.env, true),
  );
  const database = status.DB_URL ? new URL(status.DB_URL) : null;
  if (
    database &&
    (!["postgres:", "postgresql:"].includes(database.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
      database.port !== "54322" ||
      database.pathname !== "/postgres" ||
      database.search ||
      database.hash)
  )
    throw new Error("Refusing a remote database.");
  return status;
}
async function prepareKey() {
  const path = "supabase/signing_keys.json";
  if (!existsSync(path)) {
    const pair = await generateKeyPair("ES256", { extractable: true });
    const key = {
      ...(await exportJWK(pair.privateKey)),
      kid: randomUUID(),
      alg: "ES256",
      use: "sig",
    };
    writeFileSync(path, JSON.stringify([key], null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    process.stdout.write("Created ignored local ES256 signing key.\n");
  }
  const keys = JSON.parse(readFileSync(path, "utf8"));
  if (
    !Array.isArray(keys) ||
    !keys.length ||
    keys.some((key) => key.alg !== "ES256" || !key.d)
  )
    throw new Error(
      "Invalid local signing key file; existing keys were preserved.",
    );
}
function publicEnvironment(status) {
  if (!status.API_URL || !status.PUBLISHABLE_KEY)
    throw new Error("Auth/API are not running. Run npm run auth:local first.");
  const endpoint = new URL(status.API_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))
    throw new Error("This proof accepts a loopback API only.");
  return {
    EXPO_PUBLIC_SUPABASE_URL: status.API_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  };
}
function writePublicExample(status) {
  if (existsSync(".env.local")) {
    process.stdout.write(
      "Existing .env.local preserved. Use .env.example to review the public client settings.\n",
    );
    return;
  }
  const values = publicEnvironment(status);
  writeFileSync(
    ".env.local",
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
  process.stdout.write(
    "Configured ignored .env.local with public API URL/key only.\n",
  );
}

function verifyPublicBundle(status) {
  const secrets = [
    status.SECRET_KEY,
    status.SERVICE_ROLE_KEY,
    status.JWT_SECRET,
    status.DB_URL,
  ];
  for (const key of JSON.parse(
    readFileSync("supabase/signing_keys.json", "utf8"),
  ))
    secrets.push(key.d);
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (/\.(?:js|json|html|map)$/.test(entry.name)) {
        const source = readFileSync(path, "utf8");
        if (
          secrets.some(
            (secret) =>
              typeof secret === "string" &&
              secret.length > 16 &&
              source.includes(secret),
          )
        )
          throw new Error(
            "Private operator data found in the web export; do not distribute it.",
          );
      }
    }
  }
  inspect("dist");
  process.stdout.write(
    "Web export checked: no local operator credentials or signing private key found.\n",
  );
}

try {
  await prepareKey();
  if (mode === "start") {
    process.stdout.write(
      "Starting local Auth, API and Mailpit; existing database volume is preserved.\n",
    );
    run(cli, ["start", "--exclude", excluded], process.env, true);
    let status = localStatus();
    // CLI start may only report the existing DB when it was started with db start.
    if (!status.API_URL) {
      process.stdout.write(
        "Restarting this project's stack with the default data-preserving stop.\n",
      );
      run(cli, ["stop"], process.env, true);
      run(cli, ["start", "--exclude", excluded], process.env, true);
      status = localStatus();
    }
    publicEnvironment(status);
    const health = await fetch(`${status.API_URL}/auth/v1/health`, {
      headers: { apikey: status.PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) throw new Error("Local Auth health check failed.");
    run(cli, ["migration", "up", "--local"], process.env, true);
    writePublicExample(status);
    process.stdout.write(
      `Auth/API: ${status.API_URL}\nMailpit: ${status.MAILPIT_URL}\n`,
    );
  } else if (["test", "e2e", "db", "api", "realtime"].includes(mode)) {
    const status = localStatus();
    const publicEnv = publicEnvironment(status);
    const env = {
      ...process.env,
      ...publicEnv,
      MATCHMAKING_AUTH_PUBLIC_KEY: status.PUBLISHABLE_KEY,
      MATCHMAKING_AUTH_SERVICE_KEY:
        status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
      MATCHMAKING_TEST_DATABASE_URL: status.DB_URL,
      MATCHMAKING_INVITE_PEPPER: localInvitePepper(),
    };
    if (["test", "db", "api", "e2e", "realtime"].includes(mode)) {
      run(
        "node_modules/esbuild/bin/esbuild",
        [
          "backend/src/server.ts",
          "--bundle",
          "--platform=node",
          "--target=node24",
          "--format=esm",
          "--packages=external",
          "--outfile=backend/dist/server.mjs",
        ],
        process.env,
      );
      if (mode === "api")
        await withLocalApi(status, () => {}, { manual: true });
      else if (["test", "db", "realtime"].includes(mode))
        run(
          "node_modules/tsx/dist/cli.mjs",
          mode === "realtime"
            ? ["--test", "backend/test/realtime.auth.integration.ts"]
            : mode === "test"
              ? [
                  "--test",
                  "backend/test/auth.integration.ts",
                  "backend/test/invites.auth.integration.ts",
                ]
              : ["backend/test/run-database.ts"],
          env,
        );
    }
    if (mode === "e2e")
      await withLocalApi(status, async (api) => {
        // Only the test runner needs operator credentials, never the Expo build.
        const buildEnv = {
          ...process.env,
          ...publicEnv,
          EXPO_PUBLIC_MATCHMAKING_API_URL: api,
        };
        for (const name of Object.keys(buildEnv))
          if (
            /^(MATCHMAKING_|DATABASE_URL$|SUPABASE_.*(?:KEY|SECRET|TOKEN|PASSWORD))/.test(
              name,
            )
          )
            delete buildEnv[name];
        run(
          "node_modules/expo/bin/cli",
          ["export", "--platform", "web"],
          buildEnv,
        );
        verifyPublicBundle(status);
        run(
          "node_modules/@playwright/test/cli.js",
          ["test", ...process.argv.slice(3)],
          { ...env, MATCHMAKING_API_URL: api },
        );
      });
  } else throw new Error("Use start, test, db, api, realtime or e2e.");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
