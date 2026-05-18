import prisma from "@/lib/prisma";

const TABLES_IN_TRUNCATE_ORDER = [
  "audit_logs",
  "agent_downloads",
  "containment_configs",
  "devices",
  "password_reset_tokens",
  "users",
] as const;

export async function resetDatabase(): Promise<void> {
  if (!/overra_test/i.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("resetDatabase() refused: DATABASE_URL is not a test database");
  }

  const tableList = TABLES_IN_TRUNCATE_ORDER.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
