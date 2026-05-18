import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn<(to: string, resetUrl: string) => Promise<void>>(
    async () => undefined
  ),
}));
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: sendMock,
}));

import { POST } from "@/app/api/auth/forgot-password/route";
import prisma from "@/lib/prisma";
import { resetDatabase, disconnect } from "../../helpers/db";
import { createUser } from "../../helpers/factories";
import { makeRequest } from "../../helpers/request";

beforeEach(async () => {
  await resetDatabase();
  sendMock.mockClear();
});

afterAll(async () => {
  await disconnect();
});

const baseIp = "10.20.0";

describe("POST /api/auth/forgot-password", () => {
  it("returns 200 with generic message for existing email and creates a reset token", async () => {
    const user = await createUser({ email: "alice@example.com" });

    const res = await POST(
      makeRequest("/api/auth/forgot-password", {
        method: "POST",
        body: { email: "alice@example.com" },
        ip: `${baseIp}.1`,
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { message: string };
    expect(json.message).toMatch(/if an account/i);

    const tokens = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(tokens).toHaveLength(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [to, url] = sendMock.mock.calls[0];
    expect(to).toBe("alice@example.com");
    expect(url).toMatch(/\/reset-password\?token=[0-9a-f]{64}$/);
  });

  it("returns identical 200 for a non-existent email (no enumeration)", async () => {
    const res = await POST(
      makeRequest("/api/auth/forgot-password", {
        method: "POST",
        body: { email: "ghost@example.com" },
        ip: `${baseIp}.2`,
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { message: string };
    expect(json.message).toMatch(/if an account/i);

    const tokens = await prisma.passwordResetToken.findMany({});
    expect(tokens).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("lowercases the email before lookup", async () => {
    const user = await createUser({ email: "mixed@example.com" });

    const res = await POST(
      makeRequest("/api/auth/forgot-password", {
        method: "POST",
        body: { email: "  MIXED@Example.COM  " },
        ip: `${baseIp}.3`,
      })
    );
    expect(res.status).toBe(200);

    const tokens = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(tokens).toHaveLength(1);
  });

  it("returns generic 200 when the email field is missing", async () => {
    const res = await POST(
      makeRequest("/api/auth/forgot-password", {
        method: "POST",
        body: {},
        ip: `${baseIp}.4`,
      })
    );
    expect(res.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rate-limits to 5 requests per IP per hour", async () => {
    const ip = `${baseIp}.99`;
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        makeRequest("/api/auth/forgot-password", {
          method: "POST",
          body: { email: `user${i}@rl.com` },
          ip,
        })
      );
      expect(res.status).toBe(200);
    }
    const blocked = await POST(
      makeRequest("/api/auth/forgot-password", {
        method: "POST",
        body: { email: "user99@rl.com" },
        ip,
      })
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeDefined();
  });

  it("does not surface email-send failures to the client", async () => {
    await createUser({ email: "send-fail@example.com" });
    sendMock.mockRejectedValueOnce(new Error("boom"));

    const res = await POST(
      makeRequest("/api/auth/forgot-password", {
        method: "POST",
        body: { email: "send-fail@example.com" },
        ip: `${baseIp}.50`,
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { message: string };
    expect(json.message).toMatch(/if an account/i);
  });
});
