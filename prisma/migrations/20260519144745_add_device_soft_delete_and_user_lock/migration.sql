-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locked_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "devices_deleted_at_idx" ON "devices"("deleted_at");
