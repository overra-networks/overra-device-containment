import { randomBytes, createHash } from "crypto";
import prisma from "@/lib/prisma";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export async function createResetToken(
  userId: string,
  ipAddress?: string | null
): Promise<string> {
  const rawToken = generateRawToken();
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      ipAddress: ipAddress ?? null,
    },
  });
  return rawToken;
}

export interface ConsumedToken {
  userId: string;
  tokenId: string;
}

export async function verifyAndConsumeResetToken(
  rawToken: string
): Promise<ConsumedToken | null> {
  if (!rawToken || typeof rawToken !== "string") return null;

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt < now) return null;

  // Atomic single-use: updateMany scoped to usedAt=null returns count===0
  // if another request already consumed the token between our read and write.
  const updated = await prisma.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });

  if (updated.count === 0) return null;

  return { userId: record.userId, tokenId: record.id };
}

export async function invalidateUserResetTokens(userId: string): Promise<void> {
  await prisma.passwordResetToken.deleteMany({
    where: { userId, usedAt: null },
  });
}
