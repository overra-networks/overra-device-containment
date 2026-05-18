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

async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!/overra_test/i.test(url)) {
    throw new Error("E2E global-setup refused: DATABASE_URL is not a test database");
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(
      `TRUNCATE TABLE "audit_logs", "agent_downloads", "containment_configs", "devices", "users" RESTART IDENTITY CASCADE`
    );

    const passwordHash = await bcrypt.hash(E2E_TEST_USER.password, 4);
    const id = randomUUID();
    await client.query(
      `INSERT INTO "users" (id, email, password_hash, name, plan, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'free', NOW(), NOW())`,
      [id, E2E_TEST_USER.email, passwordHash, E2E_TEST_USER.name]
    );
  } finally {
    await client.end();
  }
}

export default globalSetup;
