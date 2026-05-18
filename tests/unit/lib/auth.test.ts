import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueMock = vi.fn();
const bcryptCompareMock = vi.fn();
const rateLimitCheckMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => bcryptCompareMock(...args),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: {
    check: (...args: unknown[]) => rateLimitCheckMock(...args),
  },
}));

import { authOptions } from "@/lib/auth";

interface AuthorizeFn {
  (credentials: Record<string, string> | undefined): Promise<unknown>;
}

const authorize: AuthorizeFn = (authOptions.providers[0] as any).options.authorize;
const jwtCb = authOptions.callbacks!.jwt!;
const sessionCb = authOptions.callbacks!.session!;

const seedPasswordChangedAt = new Date("2026-01-01T00:00:00.000Z");
const seedUser = {
  id: "user-1",
  email: "alice@example.com",
  name: "Alice",
  passwordHash: "hashed",
  walletAddress: null,
  plan: "free",
  passwordChangedAt: seedPasswordChangedAt,
};

describe("credentials.authorize", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    bcryptCompareMock.mockReset();
    rateLimitCheckMock.mockReset();
    rateLimitCheckMock.mockReturnValue({ allowed: true });
  });

  it("throws when credentials are missing", async () => {
    await expect(authorize(undefined)).rejects.toThrow(/Email and password are required/);
    await expect(authorize({ email: "", password: "" })).rejects.toThrow(/Email and password are required/);
    await expect(authorize({ email: "a@b.c", password: "" })).rejects.toThrow(/Email and password are required/);
  });

  it("throws when rate limit blocks the attempt", async () => {
    rateLimitCheckMock.mockReturnValueOnce({ allowed: false, retryAfter: 42 });
    await expect(
      authorize({ email: "alice@example.com", password: "pw" })
    ).rejects.toThrow(/Too many login attempts. Try again in 42 seconds/);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("rate-limit key is per-email and lowercased", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    await expect(
      authorize({ email: "ALICE@EXAMPLE.COM", password: "pw" })
    ).rejects.toThrow();
    expect(rateLimitCheckMock).toHaveBeenCalledWith("login:alice@example.com", 5, 15 * 60 * 1000);
  });

  it("throws when user is not found", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    await expect(
      authorize({ email: "alice@example.com", password: "pw" })
    ).rejects.toThrow(/Invalid email or password/);
  });

  it("throws when password does not match", async () => {
    findUniqueMock.mockResolvedValueOnce(seedUser);
    bcryptCompareMock.mockResolvedValueOnce(false);
    await expect(
      authorize({ email: "alice@example.com", password: "wrong" })
    ).rejects.toThrow(/Invalid email or password/);
  });

  it("returns the user shape on success (no password hash leaked)", async () => {
    findUniqueMock.mockResolvedValueOnce(seedUser);
    bcryptCompareMock.mockResolvedValueOnce(true);
    const result = await authorize({ email: "alice@example.com", password: "pw" });
    expect(result).toEqual({
      id: "user-1",
      email: "alice@example.com",
      name: "Alice",
      walletAddress: null,
      plan: "free",
      passwordChangedAt: seedPasswordChangedAt.getTime(),
    });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("looks up user by lowercased email", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    await expect(
      authorize({ email: "ALICE@EXAMPLE.COM", password: "pw" })
    ).rejects.toThrow();
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { email: "alice@example.com" } });
  });
});

describe("jwt callback", () => {
  it("copies user fields onto token on initial sign-in", async () => {
    const token = {} as any;
    const user = {
      id: "u1",
      email: "alice@example.com",
      name: "Alice",
      walletAddress: "0xabc",
      plan: "pro",
    } as any;
    const result = await jwtCb({ token, user, account: null } as any);
    expect(result.id).toBe("u1");
    expect(result.email).toBe("alice@example.com");
    expect(result.walletAddress).toBe("0xabc");
    expect(result.plan).toBe("pro");
  });

  it("preserves token when no user is supplied (subsequent calls)", async () => {
    const token = { id: "u1", email: "alice@example.com" } as any;
    const result = await jwtCb({ token, account: null } as any);
    expect(result).toEqual(token);
  });

  it("applies wallet update on session-update trigger", async () => {
    const token = { id: "u1", walletAddress: null } as any;
    const session = { walletAddress: "0xnew" };
    const result = await jwtCb({ token, trigger: "update", session, account: null } as any);
    expect(result.walletAddress).toBe("0xnew");
  });

  it("applies name update on session-update trigger", async () => {
    const token = { id: "u1", name: "Old" } as any;
    const session = { name: "New" };
    const result = await jwtCb({ token, trigger: "update", session, account: null } as any);
    expect(result.name).toBe("New");
  });
});

describe("session callback", () => {
  it("copies token fields onto session.user", async () => {
    const session = { user: { email: "alice@example.com" } } as any;
    const token = { id: "u1", walletAddress: "0xabc", plan: "pro" } as any;
    const result = await sessionCb({ session, token } as any);
    expect((result.user as any).id).toBe("u1");
    expect((result.user as any).walletAddress).toBe("0xabc");
    expect((result.user as any).plan).toBe("pro");
  });
});
