import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: null as any },
}));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));

import { GET as listUsers } from "@/app/api/admin/users/route";
import {
  GET as getUser,
  PATCH as patchUser,
  DELETE as deleteUser,
} from "@/app/api/admin/users/[id]/route";
import prisma from "@/lib/prisma";
import { resetDatabase, disconnect } from "../../helpers/db";
import { makeRequest } from "../../helpers/request";
import { createUser, createDevice } from "../../helpers/factories";

beforeEach(async () => {
  await resetDatabase();
  sessionState.current = null;
});
afterAll(async () => {
  await disconnect();
});

const asAdmin = (id: string) =>
  (sessionState.current = { user: { id, role: "admin" } });
const asUser = (id: string) =>
  (sessionState.current = { user: { id, role: "user" } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/admin/users", () => {
  it("401 without a session", async () => {
    const res = await listUsers(makeRequest("/api/admin/users"));
    expect(res.status).toBe(401);
  });

  it("403 for an authenticated non-admin", async () => {
    const u = await createUser({ role: "user" });
    asUser(u.id);
    const res = await listUsers(makeRequest("/api/admin/users"));
    expect(res.status).toBe(403);
  });

  it("200 for an admin and lists ALL users (cross-tenant)", async () => {
    const admin = await createUser({ email: "admin@x.com", role: "admin" });
    await createUser({ email: "alice@x.com" });
    await createUser({ email: "bob@x.com" });
    asAdmin(admin.id);

    const res = await listUsers(makeRequest("/api/admin/users"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { users: any[]; total: number };
    expect(json.total).toBe(3);
    expect(json.users).toHaveLength(3);
    expect(json.users[0]).not.toHaveProperty("passwordHash");
  });

  it("supports email search", async () => {
    const admin = await createUser({ email: "admin@x.com", role: "admin" });
    await createUser({ email: "needle@x.com" });
    asAdmin(admin.id);
    const res = await listUsers(
      makeRequest("/api/admin/users?search=needle")
    );
    const json = (await res.json()) as { total: number };
    expect(json.total).toBe(1);
  });
});

describe("GET/PATCH/DELETE /api/admin/users/[id]", () => {
  it("GET 403 for non-admin", async () => {
    const u = await createUser({ role: "user" });
    asUser(u.id);
    const res = await getUser(
      makeRequest(`/api/admin/users/${u.id}`),
      params(u.id)
    );
    expect(res.status).toBe(403);
  });

  it("PATCH updates plan + role and writes an admin audit log", async () => {
    const admin = await createUser({ email: "a@x.com", role: "admin" });
    const target = await createUser({ email: "t@x.com" });
    asAdmin(admin.id);

    const res = await patchUser(
      makeRequest(`/api/admin/users/${target.id}`, {
        method: "PATCH",
        body: { plan: "pro", role: "admin" },
      }),
      params(target.id)
    );
    expect(res.status).toBe(200);
    const fresh = await prisma.user.findUnique({ where: { id: target.id } });
    expect(fresh?.plan).toBe("pro");
    expect(fresh?.role).toBe("admin");

    const audit = await prisma.adminAuditLog.findMany({
      where: { action: "admin.user.update", targetId: target.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].adminUserId).toBe(admin.id);
  });

  it("DELETE removes the user (cascading devices) and audits it", async () => {
    const admin = await createUser({ email: "a@x.com", role: "admin" });
    const target = await createUser({ email: "t@x.com" });
    await createDevice(target.id);
    asAdmin(admin.id);

    const res = await deleteUser(
      makeRequest(`/api/admin/users/${target.id}`, { method: "DELETE" }),
      params(target.id)
    );
    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(
      await prisma.device.findMany({ where: { userId: target.id } })
    ).toHaveLength(0);
    const audit = await prisma.adminAuditLog.findMany({
      where: { action: "admin.user.delete", targetId: target.id },
    });
    expect(audit).toHaveLength(1);
  });

  it("DELETE 403 for non-admin (privilege-escalation guard)", async () => {
    const victim = await createUser({ email: "v@x.com" });
    const attacker = await createUser({ email: "att@x.com", role: "user" });
    asUser(attacker.id);
    const res = await deleteUser(
      makeRequest(`/api/admin/users/${victim.id}`, { method: "DELETE" }),
      params(victim.id)
    );
    expect(res.status).toBe(403);
    expect(
      await prisma.user.findUnique({ where: { id: victim.id } })
    ).not.toBeNull();
  });
});
