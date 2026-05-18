import { describe, it, expect, beforeEach, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { POST } from "@/app/api/auth/reset-password/route";
import prisma from "@/lib/prisma";
import { createResetToken } from "@/lib/password-reset";
import { resetDatabase, disconnect } from "../../helpers/db";
import { createUser } from "../../helpers/factories";
import { makeRequest } from "../../helpers/request";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

const baseIp = "10.30.0";

describe("POST /api/auth/reset-password", () => {
  it("updates the password hash and bumps passwordChangedAt when token is valid", async () => {
    const user = await createUser({ email: "alice@example.com" });
    const original = await prisma.user.findUnique({ where: { id: user.id } });
    const rawToken = await createResetToken(user.id);

    // Sleep 5ms so passwordChangedAt actually moves forward.
    await new Promise((r) => setTimeout(r, 5));

    const res = await POST(
      makeRequest("/api/auth/reset-password", {
        method: "POST",
        body: { token: rawToken, password: "newpassword123" },
        ip: `${baseIp}.1`,
      })
    );

    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated!.passwordHash).not.toBe(original!.passwordHash);
    expect(await bcrypt.compare("newpassword123", updated!.passwordHash)).toBe(true);
    expect(updated!.passwordChangedAt.getTime()).toBeGreaterThan(
      original!.passwordChangedAt.getTime()
    );
  });

  it("rejects an unknown or malformed token", async () => {
    const res = await POST(
      makeRequest("/api/auth/reset-password", {
        method: "POST",
        body: { token: "not-a-real-token", password: "newpassword123" },
        ip: `${baseIp}.2`,
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/invalid|expired/i);
  });

  it("rejects a token after it has been used once", async () => {
    const user = await createUser({ email: "bob@example.com" });
    const rawToken = await createResetToken(user.id);

    const first = await POST(
      makeRequest("/api/auth/reset-password", {
        method: "POST",
        body: { token: rawToken, password: "newpassword123" },
        ip: `${baseIp}.3`,
      })
    );
    expect(first.status).toBe(200);

    const replay = await POST(
      makeRequest("/api/auth/reset-password", {
        method: "POST",
        body: { token: rawToken, password: "anotherpassword456" },
        ip: `${baseIp}.4`,
      })
    );
    expect(replay.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const user = await createUser({ email: "carol@example.com" });
    const rawToken = await createResetToken(user.id);

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await POST(
      makeRequest("/api/auth/reset-password", {
        method: "POST",
        body: { token: rawToken, password: "newpassword123" },
        ip: `${baseIp}.5`,
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const user = await createUser({ email: "dave@example.com" });
    const rawToken = await createResetToken(user.id);

    const res = await POST(
      makeRequest("/api/auth/reset-password", {
        method: "POST",
        body: { token: rawToken, password: "short" },
        ip: `${baseIp}.6`,
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/8 characters/i);

    // Token must NOT be consumed by a failed length check — otherwise a typo
    // burns the user's reset link.
    const token = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
    });
    expect(token!.usedAt).toBeNull();
  });

  it("rejects when token or password is missing", async () => {
    const res1 = await POST(
      makeRequest("/api/auth/reset-password", {
        method: "POST",
        body: { password: "newpassword123" },
        ip: `${baseIp}.7`,
      })
    );
    expect(res1.status).toBe(400);

    const res2 = await POST(
      makeRequest("/api/auth/reset-password", {
        method: "POST",
        body: { token: "abc" },
        ip: `${baseIp}.8`,
      })
    );
    expect(res2.status).toBe(400);
  });

  it("deletes other outstanding reset tokens for the user after success", async () => {
    const user = await createUser({ email: "eve@example.com" });
    const tokenA = await createResetToken(user.id);
    await createResetToken(user.id);
    await createResetToken(user.id);

    expect(
      await prisma.passwordResetToken.count({ where: { userId: user.id } })
    ).toBe(3);

    const res = await POST(
      makeRequest("/api/auth/reset-password", {
        method: "POST",
        body: { token: tokenA, password: "newpassword123" },
        ip: `${baseIp}.9`,
      })
    );
    expect(res.status).toBe(200);

    const remaining = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    // Only the consumed token (usedAt set) remains. The other unused ones are deleted.
    expect(remaining).toHaveLength(1);
    expect(remaining[0].usedAt).not.toBeNull();
  });
});
