-- AlterTable: support wallet-only accounts (email + password become optional)
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex: enforce one account per wallet at the DB level.
-- Postgres allows multiple NULLs in a plain UNIQUE index, so email-only
-- accounts (wallet_address IS NULL) coexist fine.
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");
