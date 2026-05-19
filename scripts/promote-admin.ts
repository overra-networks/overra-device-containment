/**
 * Offline admin-promotion seed. There is NO self-service path to become an
 * admin (no API, no UI) — this script is the only way, by design.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/promote-admin.ts user@example.com
 *   DATABASE_URL="postgresql://..." npx tsx scripts/promote-admin.ts user@example.com --demote
 *
 * Zero-dependency fallback (locked-down box, no npx/tsx):
 *   psql "$DATABASE_URL" -c "UPDATE users SET role='admin' WHERE email='user@example.com';"
 */
import prisma from "../src/lib/prisma";

async function main() {
  const email = process.argv[2]?.toLowerCase();
  const demote = process.argv.includes("--demote");

  if (!email || !email.includes("@")) {
    console.error("Usage: npx tsx scripts/promote-admin.ts <email> [--demote]");
    process.exit(1);
  }

  const role = demote ? "user" : "admin";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  if (existing.role === role) {
    console.log(`${email} is already '${role}'. No change.`);
    return;
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { role },
  });

  console.log(
    `${email}: role '${existing.role}' -> '${updated.role}' (id=${updated.id})`
  );
}

main()
  .catch((err) => {
    console.error("promote-admin failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
