import { config } from "dotenv";
import path from "node:path";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

config({ path: path.resolve(__dirname, "../../.env.test"), override: true, quiet: true });

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

// Cross-tenant target the admin spec CONTAINS (and admin can also delete
// after — order matters: contain test runs before delete test in admin.spec).
export const E2E_ADMIN_TARGET_DEVICE_ID = "11111111-1111-4111-8111-111111111111";

// Dedicated user + device for the owner-delete E2E spec. Kept separate
// from E2E_TEST_USER so the owner-delete login doesn't compete with
// auth.spec/downloads.spec for E2E_TEST_USER's per-email login rate
// limit (5 attempts / 15 min in src/lib/auth.ts).
export const E2E_DELETE_OWNER = {
  email: "e2e-deleter@example.com",
  password: "supersecret",
  name: "E2E Deleter",
};
export const E2E_OWNER_DEVICE_ID = "22222222-2222-4222-8222-222222222222";

// User the admin spec LOCKS. Distinct identity so the lock-rejection
// login attempt doesn't compete with E2E_DEVICE_OWNER's rate-limit
// counter (E2E_DEVICE_OWNER is already used by 3 non-admin admin-spec
// logins).
export const E2E_LOCK_TARGET_USER = {
  email: "e2e-locktarget@example.com",
  password: "supersecret",
  name: "E2E Lock Target",
};

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

    // Dedicated owner-delete user + their device (isolated from
    // E2E_TEST_USER's rate-limit counter).
    const deleterHash = await bcrypt.hash(E2E_DELETE_OWNER.password, 4);
    const deleterId = randomUUID();
    await client.query(
      `INSERT INTO "users" (id, email, password_hash, name, plan, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'free', 'user', NOW(), NOW())`,
      [deleterId, E2E_DELETE_OWNER.email, deleterHash, E2E_DELETE_OWNER.name]
    );
    await client.query(
      `INSERT INTO "devices" (id, user_id, name, hostname, os, agent_version, status, created_at, updated_at)
       VALUES ($1, $2, 'Owner Delete Target', 'owner-delete-host', 'linux', 'v0.1', 'normal', NOW(), NOW())`,
      [E2E_OWNER_DEVICE_ID, deleterId]
    );

    // Lock-target user for the admin-lock spec.
    const lockHash = await bcrypt.hash(E2E_LOCK_TARGET_USER.password, 4);
    await client.query(
      `INSERT INTO "users" (id, email, password_hash, name, plan, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'free', 'user', NOW(), NOW())`,
      [randomUUID(), E2E_LOCK_TARGET_USER.email, lockHash, E2E_LOCK_TARGET_USER.name]
    );
  } finally {
    await client.end();
  }
}

export default globalSetup;
