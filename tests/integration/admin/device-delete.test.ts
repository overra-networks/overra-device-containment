import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: null as any },
}));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));

import { DELETE as adminDelete } from "@/app/api/admin/devices/[id]/route";
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

describe("DELETE /api/admin/devices/[id] (admin cross-tenant)", () => {
  it("401 without session", async () => {
    const res = await adminDelete(
      makeRequest("/x", { method: "DELETE" }),
      params("x")
    );
    expect(res.status).toBe(401);
  });

  it("403 for a non-admin (escalation guard)", async () => {
    const owner = await createUser({ email: "o@x.com" });
    const dev = await createDevice(owner.id);
    const attacker = await createUser({ email: "a@x.com", role: "user" });
    asUser(attacker.id);

    const res = await adminDelete(
      makeRequest(`/${dev.id}`, { method: "DELETE" }),
      params(dev.id)
    );
    expect(res.status).toBe(403);
    const fresh = await prisma.device.findUnique({ where: { id: dev.id } });
    expect(fresh?.deletedAt).toBeNull();
  });

  it("admin soft-deletes another user's device, audits it, preserves audit_logs", async () => {
    const admin = await createUser({ email: "a@x.com", role: "admin" });
    const owner = await createUser({ email: "o@x.com" });
    const dev = await createDevice(owner.id, { agentTokenHash: "h" } as never);
    await prisma.auditLog.create({
      data: { deviceId: dev.id, userId: owner.id, event: "x", result: "success" },
    });
    asAdmin(admin.id);

    const res = await adminDelete(
      makeRequest(`/${dev.id}`, { method: "DELETE" }),
      params(dev.id)
    );
    expect(res.status).toBe(200);

    const fresh = await prisma.device.findUnique({ where: { id: dev.id } });
    expect(fresh).not.toBeNull();
    expect(fresh?.deletedAt).not.toBeNull();
    expect(fresh?.agentTokenHash).toBeNull();

    // Forensic audit on the device survives.
    const devLogs = await prisma.auditLog.findMany({
      where: { deviceId: dev.id },
    });
    expect(devLogs).toHaveLength(1);

    // Admin trail captures the privileged actor + owner context.
    const adminLog = await prisma.adminAuditLog.findMany({
      where: { action: "admin.device.delete", targetId: dev.id },
    });
    expect(adminLog).toHaveLength(1);
    expect(adminLog[0].adminUserId).toBe(admin.id);
    expect((adminLog[0].metadata as { ownerEmail?: string }).ownerEmail).toBe(
      "o@x.com"
    );
  });

  it("404 for an already-soft-deleted device", async () => {
    const admin = await createUser({ email: "a@x.com", role: "admin" });
    const owner = await createUser({ email: "o@x.com" });
    const dev = await createDevice(owner.id);
    await prisma.device.update({
      where: { id: dev.id },
      data: { deletedAt: new Date() },
    });
    asAdmin(admin.id);

    const res = await adminDelete(
      makeRequest(`/${dev.id}`, { method: "DELETE" }),
      params(dev.id)
    );
    expect(res.status).toBe(404);
  });
});
