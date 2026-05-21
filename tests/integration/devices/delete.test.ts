import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: null as any },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));

import { DELETE, GET } from "@/app/api/devices/[id]/route";
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

const asUser = (id: string) =>
  (sessionState.current = { user: { id, role: "user" } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("DELETE /api/devices/[id] (owner soft-delete)", () => {
  it("returns 401 without a session", async () => {
    const res = await DELETE(
      makeRequest("/api/devices/x", { method: "DELETE" }),
      params("x")
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the device belongs to another user (ownership guard)", async () => {
    const owner = await createUser({ email: "o@x.com" });
    const dev = await createDevice(owner.id);
    const attacker = await createUser({ email: "a@x.com" });
    asUser(attacker.id);

    const res = await DELETE(
      makeRequest(`/api/devices/${dev.id}`, { method: "DELETE" }),
      params(dev.id)
    );
    expect(res.status).toBe(404);
    const fresh = await prisma.device.findUnique({ where: { id: dev.id } });
    expect(fresh?.deletedAt).toBeNull();
  });

  it("soft-deletes the device, nulls agentTokenHash, preserves audit_logs", async () => {
    const owner = await createUser({ email: "o@x.com" });
    const dev = await createDevice(owner.id, { agentTokenHash: "h" } as never);
    await prisma.auditLog.create({
      data: { deviceId: dev.id, userId: owner.id, event: "x", result: "success" },
    });
    asUser(owner.id);

    const res = await DELETE(
      makeRequest(`/api/devices/${dev.id}`, { method: "DELETE" }),
      params(dev.id)
    );
    expect(res.status).toBe(200);

    // Row still exists but soft-deleted.
    const fresh = await prisma.device.findUnique({ where: { id: dev.id } });
    expect(fresh).not.toBeNull();
    expect(fresh?.deletedAt).not.toBeNull();
    expect(fresh?.agentTokenHash).toBeNull();

    // Forensic audit trail preserved.
    const logs = await prisma.auditLog.findMany({
      where: { deviceId: dev.id },
    });
    expect(logs).toHaveLength(1);
  });

  it("GET returns 404 for a soft-deleted device (treated as gone)", async () => {
    const owner = await createUser({ email: "o@x.com" });
    const dev = await createDevice(owner.id);
    await prisma.device.update({
      where: { id: dev.id },
      data: { deletedAt: new Date() },
    });
    asUser(owner.id);

    const res = await GET(
      makeRequest(`/api/devices/${dev.id}`),
      params(dev.id)
    );
    expect(res.status).toBe(404);
  });
});
