import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: null as any },
}));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));

import { PATCH as patchUser } from "@/app/api/admin/users/[id]/route";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
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

const asAdmin = (id: string) =>
  (sessionState.current = { user: { id, role: "admin" } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

// Extract the credentials authorize so we can exercise the locked-account
// rejection directly (NextAuth wraps providers internally).
const credentialsAuthorize = (authOptions.providers[0] as any).options
  .authorize as (creds: { email: string; password: string }) => Promise<any>;

describe("admin user lock", () => {
  describe("PATCH /api/admin/users/[id] with { locked }", () => {
    it("locks a user: sets lockedAt, bumps passwordChangedAt, audits admin.user.lock", async () => {
      const admin = await createUser({ email: "a@x.com", role: "admin" });
      const target = await createUser({ email: "t@x.com" });
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { passwordChangedAt: true },
      });
      asAdmin(admin.id);

      const res = await patchUser(
        makeRequest(`/api/admin/users/${target.id}`, {
          method: "PATCH",
          body: { locked: true },
        }),
        params(target.id)
      );
      expect(res.status).toBe(200);

      const fresh = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      });
      expect(fresh.lockedAt).not.toBeNull();
      expect(fresh.passwordChangedAt.getTime()).toBeGreaterThan(
        before.passwordChangedAt.getTime()
      );

      const audit = await prisma.adminAuditLog.findMany({
        where: { action: "admin.user.lock", targetId: target.id },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].adminUserId).toBe(admin.id);
    });

    it("unlocks a user: clears lockedAt, audits admin.user.unlock", async () => {
      const admin = await createUser({ email: "a@x.com", role: "admin" });
      const target = await createUser({ email: "t@x.com" });
      await prisma.user.update({
        where: { id: target.id },
        data: { lockedAt: new Date() },
      });
      asAdmin(admin.id);

      const res = await patchUser(
        makeRequest(`/api/admin/users/${target.id}`, {
          method: "PATCH",
          body: { locked: false },
        }),
        params(target.id)
      );
      expect(res.status).toBe(200);

      const fresh = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      });
      expect(fresh.lockedAt).toBeNull();

      const audit = await prisma.adminAuditLog.findMany({
        where: { action: "admin.user.unlock", targetId: target.id },
      });
      expect(audit).toHaveLength(1);
    });

    it("rejects self-lock with 400 (admin lockout guard)", async () => {
      const admin = await createUser({ email: "a@x.com", role: "admin" });
      asAdmin(admin.id);

      const res = await patchUser(
        makeRequest(`/api/admin/users/${admin.id}`, {
          method: "PATCH",
          body: { locked: true },
        }),
        params(admin.id)
      );
      expect(res.status).toBe(400);

      const fresh = await prisma.user.findUniqueOrThrow({
        where: { id: admin.id },
      });
      expect(fresh.lockedAt).toBeNull();
    });
  });

  describe("authorize() with a locked user", () => {
    it("rejects login for a locked user without leaking the locked state", async () => {
      const target = await createUser({
        email: "locked@x.com",
        password: "Sup3rS3cret!",
      });
      await prisma.user.update({
        where: { id: target.id },
        data: { lockedAt: new Date() },
      });

      await expect(
        credentialsAuthorize({
          email: "locked@x.com",
          password: "Sup3rS3cret!",
        })
      ).rejects.toThrow(/invalid email or password/i);
    });

    it("permits login for an UNlocked user with correct creds (control)", async () => {
      const target = await createUser({
        email: "ok@x.com",
        password: "Sup3rS3cret!",
      });
      const result = await credentialsAuthorize({
        email: "ok@x.com",
        password: "Sup3rS3cret!",
      });
      expect(result?.id).toBe(target.id);
    });
  });
});
