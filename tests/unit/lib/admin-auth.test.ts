import { describe, it, expect } from "vitest";
import { assertAdmin, AdminAuthError } from "@/lib/admin-auth";

describe("assertAdmin", () => {
  it("throws 401 when session is null", () => {
    try {
      assertAdmin(null);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AdminAuthError);
      expect((e as AdminAuthError).status).toBe(401);
    }
  });

  it("throws 401 when session has no user id", () => {
    try {
      assertAdmin({ user: { role: "admin" } });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as AdminAuthError).status).toBe(401);
    }
  });

  it("throws 403 when user is authenticated but not an admin", () => {
    try {
      assertAdmin({ user: { id: "u1", role: "user" } });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AdminAuthError);
      expect((e as AdminAuthError).status).toBe(403);
    }
  });

  it("throws 403 when role is missing entirely", () => {
    try {
      assertAdmin({ user: { id: "u1" } });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as AdminAuthError).status).toBe(403);
    }
  });

  it("does not throw for an admin session", () => {
    expect(() =>
      assertAdmin({ user: { id: "u1", role: "admin" } })
    ).not.toThrow();
  });
});
