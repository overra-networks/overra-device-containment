#!/usr/bin/env node
// Seeds the test DB with one user + one device, signs a long-lived agent JWT,
// and prints { api_url, agent_token, device_id, user_id, database_url } on
// stdout for the Go contract test to consume.
//
// Refuses to run unless DATABASE_URL points at a database whose name contains
// "overra_test" — identical guard to tests/setup.ts.

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
// quiet: true suppresses dotenv v17's "tip" banner — it would otherwise be
// written to stdout and corrupt the single JSON line this script prints.
config({ path: path.resolve(here, "../../.env.test"), override: true, quiet: true });

const dbUrl = process.env.DATABASE_URL ?? "";
const jwtSecret = process.env.JWT_SECRET ?? "";
const apiPort = process.env.E2E_PORT ?? "3001";
const apiUrl = process.env.OVERRA_API_URL ?? `http://localhost:${apiPort}/api`;

if (!/overra_test/i.test(dbUrl)) {
  console.error("seed.mjs refused: DATABASE_URL must contain 'overra_test'");
  process.exit(1);
}
if (jwtSecret.length < 32) {
  console.error("seed.mjs refused: JWT_SECRET missing or too short (need >=32 chars)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

try {
  // Wipe everything so a re-run starts from a known state.
  await client.query(
    `TRUNCATE TABLE "audit_logs", "agent_downloads", "containment_configs", "devices", "users" RESTART IDENTITY CASCADE`
  );

  const userId = randomUUID();
  const deviceId = randomUUID();
  const passwordHash = await bcrypt.hash("contract-test-pw", 4);

  await client.query(
    `INSERT INTO "users" (id, email, password_hash, name, plan, created_at, updated_at)
     VALUES ($1, 'contract@example.com', $2, 'Contract Test', 'free', NOW(), NOW())`,
    [userId, passwordHash]
  );

  // agent_token_hash is non-null so verifyAgentToken's revocation check passes.
  // The exact value doesn't matter — the JWT signature is what authenticates
  // the agent; the hash is only consulted to detect "this device was revoked".
  await client.query(
    `INSERT INTO "devices" (
       id, user_id, name, hostname, os, agent_version, status,
       network_disabled, sessions_revoked, extensions_frozen, screen_locked,
       agent_token_hash, created_at, updated_at
     ) VALUES (
       $1, $2, 'contract-host', 'contract-host', 'linux', 'v0.1', 'normal',
       false, false, false, false,
       'contract-test-hash', NOW(), NOW()
     )`,
    [deviceId, userId]
  );

  const agentToken = jwt.sign(
    { device_id: deviceId, user_id: userId },
    jwtSecret,
    { expiresIn: "1h" }
  );

  process.stdout.write(
    JSON.stringify({
      api_url: apiUrl,
      agent_token: agentToken,
      device_id: deviceId,
      user_id: userId,
      database_url: dbUrl,
    }) + "\n"
  );
} finally {
  await client.end();
}
