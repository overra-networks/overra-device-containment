import { describe, it, expect, beforeEach, vi } from "vitest";

const sessionState: { current: unknown } = { current: null };
const findUniqueMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
  },
}));

import { requireAdmin, AdminAuthError } from "@/lib/admin-auth";

beforeEach(() => {
  sessionState.current = null;
  findUniqueMock.mockReset();
});

describe("requireAdmin (DB-authoritative)", () => {
  it("throws 401 when there is no session (no DB hit)", async () => {
    sessionState.current = null;
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("throws 403 when token claims admin but DB row is now 'user' (stale token after demotion)", async () => {
    sessionState.current = { user: { id: "u1", role: "admin" } };
    findUniqueMock.mockResolvedValue({ role: "user" });
    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminAuthError);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when the user no longer exists (deleted)", async () => {
    sessionState.current = { user: { id: "u1", role: "admin" } };
    findUniqueMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });

  it("resolves when token AND current DB role are both admin", async () => {
    sessionState.current = { user: { id: "u1", role: "admin" } };
    findUniqueMock.mockResolvedValue({ role: "admin" });
    await expect(requireAdmin()).resolves.toMatchObject({
      user: { id: "u1" },
    });
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { role: true },
    });
  });
});
