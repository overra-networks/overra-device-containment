import { config } from "dotenv";
import path from "node:path";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

config({ path: path.resolve(__dirname, "../../.env.test"), override: true });

export const E2E_TEST_USER = {
  email: "e2e@example.com",
  password: "supersecret",
  name: "E2E User",
};

export const E2E_ADMIN_USER = {
  email: "e2e-admin@example.com",
  password: "supersecret",
  name: "E2E Admin",
};

// Dedicated "victim" user that owns the target device the admin spec
// contains. Kept separate from E2E_TEST_USER so the admin containment
// test cannot pollute the downloads/auth specs' fixtures.
export const E2E_DEVICE_OWNER = {
  email: "e2e-owner@example.com",
  password: "supersecret",
  name: "E2E Owner",
};

export const E2E_ADMIN_TARGET_DEVICE_ID = "11111111-1111-4111-8111-111111111111";

async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!/overra_test/i.test(url)) {
    throw new Error("E2E global-setup refused: DATABASE_URL is not a test database");
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(
      `TRUNCATE TABLE "admin_audit_logs", "audit_logs", "agent_downloads", "containment_configs", "devices", "users" RESTART IDENTITY CASCADE`
    );

    const passwordHash = await bcrypt.hash(E2E_TEST_USER.password, 4);
    const userId = randomUUID();
    await client.query(
      `INSERT INTO "users" (id, email, password_hash, name, plan, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'free', 'user', NOW(), NOW())`,
      [userId, E2E_TEST_USER.email, passwordHash, E2E_TEST_USER.name]
    );

    const adminHash = await bcrypt.hash(E2E_ADMIN_USER.password, 4);
    await client.query(
      `INSERT INTO "users" (id, email, password_hash, name, plan, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'enterprise', 'admin', NOW(), NOW())`,
      [randomUUID(), E2E_ADMIN_USER.email, adminHash, E2E_ADMIN_USER.name]
    );

    // Separate owner so admin-spec mutations don't leak into other specs.
    const ownerHash = await bcrypt.hash(E2E_DEVICE_OWNER.password, 4);
    const ownerId = randomUUID();
    await client.query(
      `INSERT INTO "users" (id, email, password_hash, name, plan, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'free', 'user', NOW(), NOW())`,
      [ownerId, E2E_DEVICE_OWNER.email, ownerHash, E2E_DEVICE_OWNER.name]
    );

    await client.query(
      `INSERT INTO "devices" (id, user_id, name, hostname, os, agent_version, status, created_at, updated_at)
       VALUES ($1, $2, 'E2E Target', 'e2e-host', 'linux', 'v0.1', 'normal', NOW(), NOW())`,
      [E2E_ADMIN_TARGET_DEVICE_ID, ownerId]
    );
  } finally {
    await client.end();
  }
}

export default globalSetup;
