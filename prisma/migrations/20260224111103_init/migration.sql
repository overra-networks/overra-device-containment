-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('normal', 'contained', 'offline', 'pending');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('windows', 'macos', 'linux');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('success', 'executed', 'failed', 'pending');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wallet_address" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "agent_version" TEXT NOT NULL DEFAULT 'v0.1',
    "status" "DeviceStatus" NOT NULL DEFAULT 'normal',
    "last_heartbeat" TIMESTAMP(3),
    "agent_token_hash" TEXT,
    "wallet_authority" TEXT,
    "last_authorization" TIMESTAMP(3),
    "network_disabled" BOOLEAN NOT NULL DEFAULT false,
    "sessions_revoked" BOOLEAN NOT NULL DEFAULT false,
    "extensions_frozen" BOOLEAN NOT NULL DEFAULT false,
    "screen_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "containment_configs" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "disable_network" BOOLEAN NOT NULL DEFAULT true,
    "revoke_sessions" BOOLEAN NOT NULL DEFAULT true,
    "freeze_extensions" BOOLEAN NOT NULL DEFAULT true,
    "lock_screen" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "containment_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event" TEXT NOT NULL,
    "result" "AuditResult" NOT NULL DEFAULT 'pending',
    "signature" TEXT,
    "ip_address" TEXT,
    "metadata" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_downloads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v0.1',
    "download_token" TEXT NOT NULL,
    "activated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "containment_configs_device_id_key" ON "containment_configs"("device_id");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_device_id_idx" ON "audit_logs"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_downloads_download_token_key" ON "agent_downloads"("download_token");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "containment_configs" ADD CONSTRAINT "containment_configs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_downloads" ADD CONSTRAINT "agent_downloads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
