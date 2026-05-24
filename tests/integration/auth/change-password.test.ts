import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: null as any },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));

import { POST } from "@/app/api/auth/change-password/route";
import prisma from "@/lib/prisma";
import { createResetToken } from "@/lib/password-reset";
import { resetDatabase, disconnect } from "../../helpers/db";
import { makeRequest } from "../../helpers/request";
import { createUser } from "../../helpers/factories";

beforeEach(async () => {
  await resetDatabase();
  sessionState.current = null;
});

afterAll(async () => {
  await disconnect();
});

const baseIp = "10.40.0";

function setSessionFor(userId: string) {
  sessionState.current = { user: { id: userId } };
}

describe("POST /api/auth/change-password", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await POST(
      makeRequest("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: "password123", newPassword: "newpassword123" },
        ip: `${baseIp}.1`,
      })
    );
    expect(res.status).toBe(401);
  });

  it("updates the password hash and bumps passwordChangedAt when current password is correct", async () => {
    const user = await createUser({ email: "bob@example.com", password: "password123" });
    setSessionFor(user.id);
    const before = await prisma.user.findUnique({ where: { id: user.id } });

    await new Promise((r) => setTimeout(r, 5));

    const res = await POST(
      makeRequest("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: "password123", newPassword: "newpassword456" },
        ip: `${baseIp}.2`,
      })
    );

    expect(res.status).toBe(200);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after!.passwordHash).not.toBe(before!.passwordHash);
    expect(await bcrypt.compare("newpassword456", after!.passwordHash!)).toBe(true);
    expect(after!.passwordChangedAt.getTime()).toBeGreaterThan(
      before!.passwordChangedAt.getTime()
    );
  });

  it("rejects with 400 when current password is incorrect (hash unchanged)", async () => {
    const user = await createUser({ email: "carol@example.com", password: "password123" });
    setSessionFor(user.id);
    const before = await prisma.user.findUnique({ where: { id: user.id } });

    const res = await POST(
      makeRequest("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: "wrong-password", newPassword: "newpassword456" },
        ip: `${baseIp}.3`,
      })
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/current password/i);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after!.passwordHash).toBe(before!.passwordHash);
    expect(after!.passwordChangedAt.getTime()).toBe(before!.passwordChangedAt.getTime());
  });

  it("rejects with 400 when new password is shorter than 8 chars", async () => {
    const user = await createUser({ email: "dave@example.com", password: "password123" });
    setSessionFor(user.id);

    const res = await POST(
      makeRequest("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: "password123", newPassword: "short" },
        ip: `${baseIp}.4`,
      })
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/8 characters/i);
  });

  it("rejects with 400 when new password equals current password", async () => {
    const user = await createUser({ email: "erin@example.com", password: "password123" });
    setSessionFor(user.id);

    const res = await POST(
      makeRequest("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: "password123", newPassword: "password123" },
        ip: `${baseIp}.5`,
      })
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/different/i);
  });

  it("rejects with 400 when fields are missing or non-string", async () => {
    const user = await createUser({ email: "frank@example.com" });
    setSessionFor(user.id);

    const res = await POST(
      makeRequest("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: "password123" },
        ip: `${baseIp}.6`,
      })
    );
    expect(res.status).toBe(400);
  });

  it("rate-limits after too many attempts from the same user", async () => {
    const user = await createUser({ email: "gina@example.com", password: "password123" });
    setSessionFor(user.id);

    // 5 wrong-password attempts to exhaust the per-user budget
    for (let i = 0; i < 5; i++) {
      await POST(
        makeRequest("/api/auth/change-password", {
          method: "POST",
          body: { currentPassword: "wrong", newPassword: "newpassword456" },
          ip: `${baseIp}.7.${i}`,
        })
      );
    }

    const res = await POST(
      makeRequest("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: "password123", newPassword: "newpassword456" },
        ip: `${baseIp}.7.last`,
      })
    );

    expect(res.status).toBe(429);
  });

  it("invalidates pending reset tokens for the user when password is changed", async () => {
    const user = await createUser({ email: "hank@example.com", password: "password123" });
    setSessionFor(user.id);

    await createResetToken(user.id);
    await createResetToken(user.id);

    const before = await prisma.passwordResetToken.count({
      where: { userId: user.id, usedAt: null },
    });
    expect(before).toBe(2);

    const res = await POST(
      makeRequest("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: "password123", newPassword: "newpassword456" },
        ip: `${baseIp}.8`,
      })
    );
    expect(res.status).toBe(200);

    const after = await prisma.passwordResetToken.count({
      where: { userId: user.id, usedAt: null },
    });
    expect(after).toBe(0);
  });
});
