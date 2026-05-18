import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import {
  createResetToken,
  verifyAndConsumeResetToken,
  invalidateUserResetTokens,
  generateRawToken,
} from "@/lib/password-reset";
import { resetDatabase, disconnect } from "../../helpers/db";
import { createUser } from "../../helpers/factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

describe("password-reset lib", () => {
  it("generates 64-character hex tokens with sufficient entropy", () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).toHaveLength(64);
    expect(b).toHaveLength(64);
    expect(a).not.toBe(b);
    expect(/^[0-9a-f]+$/.test(a)).toBe(true);
  });

  it("stores sha256(token) in DB, never the raw token", async () => {
    const user = await createUser({ email: "alice@example.com" });
    const rawToken = await createResetToken(user.id, "1.2.3.4");

    const records = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(records).toHaveLength(1);
    expect(records[0].tokenHash).toBe(sha256Hex(rawToken));
    expect(records[0].tokenHash).not.toBe(rawToken);
    expect(records[0].ipAddress).toBe("1.2.3.4");
  });

  it("sets a 1-hour expiry", async () => {
    const user = await createUser({ email: "bob@example.com" });
    const before = Date.now();
    await createResetToken(user.id);

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
    });
    const ttl = record!.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(59 * 60 * 1000);
    expect(ttl).toBeLessThan(61 * 60 * 1000);
  });

  it("verifies a valid token and marks it used", async () => {
    const user = await createUser({ email: "carol@example.com" });
    const rawToken = await createResetToken(user.id);

    const consumed = await verifyAndConsumeResetToken(rawToken);
    expect(consumed).not.toBeNull();
    expect(consumed!.userId).toBe(user.id);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(rawToken) },
    });
    expect(record!.usedAt).not.toBeNull();
  });

  it("rejects a token that was already used (single-use)", async () => {
    const user = await createUser({ email: "dave@example.com" });
    const rawToken = await createResetToken(user.id);

    const first = await verifyAndConsumeResetToken(rawToken);
    expect(first).not.toBeNull();

    const second = await verifyAndConsumeResetToken(rawToken);
    expect(second).toBeNull();
  });

  it("rejects an expired token", async () => {
    const user = await createUser({ email: "eve@example.com" });
    const rawToken = await createResetToken(user.id);

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await verifyAndConsumeResetToken(rawToken);
    expect(result).toBeNull();
  });

  it("rejects an unknown token", async () => {
    const result = await verifyAndConsumeResetToken("not-a-real-token");
    expect(result).toBeNull();
  });

  it("rejects empty / non-string token input safely", async () => {
    expect(await verifyAndConsumeResetToken("")).toBeNull();
    expect(await verifyAndConsumeResetToken(undefined as unknown as string)).toBeNull();
  });

  it("invalidateUserResetTokens deletes only unused tokens for that user", async () => {
    const userA = await createUser({ email: "a@example.com" });
    const userB = await createUser({ email: "b@example.com" });

    const tokenA1 = await createResetToken(userA.id);
    await createResetToken(userA.id);
    const tokenB = await createResetToken(userB.id);

    // Consume one of A's tokens so it has usedAt set
    await verifyAndConsumeResetToken(tokenA1);

    await invalidateUserResetTokens(userA.id);

    const remainingA = await prisma.passwordResetToken.findMany({
      where: { userId: userA.id },
    });
    const remainingB = await prisma.passwordResetToken.findMany({
      where: { userId: userB.id },
    });

    // The consumed token survives (has usedAt). The other unused one is deleted.
    expect(remainingA).toHaveLength(1);
    expect(remainingA[0].usedAt).not.toBeNull();
    expect(remainingB).toHaveLength(1);
    expect(remainingB[0].tokenHash).toBe(sha256Hex(tokenB));
  });
});
