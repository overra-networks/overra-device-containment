import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: null as any },
}));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));

import { POST as adminEnter } from "@/app/api/admin/devices/[id]/containment/enter/route";
import { POST as adminRelease } from "@/app/api/admin/devices/[id]/containment/release/route";
import { PUT as adminConfig } from "@/app/api/admin/devices/[id]/containment/config/route";
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

describe("admin cross-tenant containment", () => {
  it("401 without session", async () => {
    const res = await adminEnter(
      makeRequest("/x", { method: "POST", body: {} }),
      params("x")
    );
    expect(res.status).toBe(401);
  });

  it("403 for a non-admin acting on another user's device (escalation guard)", async () => {
    const owner = await createUser({ email: "o@x.com" });
    const dev = await createDevice(owner.id);
    const attacker = await createUser({ email: "att@x.com", role: "user" });
    asUser(attacker.id);

    const res = await adminEnter(
      makeRequest(`/${dev.id}`, { method: "POST", body: {} }),
      params(dev.id)
    );
    expect(res.status).toBe(403);
    const fresh = await prisma.device.findUnique({ where: { id: dev.id } });
    expect(fresh?.status).not.toBe("contained");
  });

  it("admin contains ANOTHER user's device and it is audited", async () => {
    const admin = await createUser({ email: "a@x.com", role: "admin" });
    const owner = await createUser({ email: "o@x.com" });
    const dev = await createDevice(owner.id);
    asAdmin(admin.id);

    const res = await adminEnter(
      makeRequest(`/${dev.id}`, { method: "POST", body: {} }),
      params(dev.id)
    );
    expect(res.status).toBe(200);
    const fresh = await prisma.device.findUnique({ where: { id: dev.id } });
    expect(fresh?.status).toBe("contained");

    // Device's own trail stays attributed to the OWNER.
    const devLog = await prisma.auditLog.findFirst({
      where: { deviceId: dev.id },
    });
    expect(devLog?.userId).toBe(owner.id);

    // Privileged actor captured in the admin trail.
    const adminLog = await prisma.adminAuditLog.findMany({
      where: { action: "admin.containment.enter", targetId: dev.id },
    });
    expect(adminLog).toHaveLength(1);
    expect(adminLog[0].adminUserId).toBe(admin.id);
  });

  it("admin releases another user's contained device (audited)", async () => {
    const admin = await createUser({ email: "a@x.com", role: "admin" });
    const owner = await createUser({ email: "o@x.com" });
    const dev = await createDevice(owner.id, { status: "contained" });
    asAdmin(admin.id);

    const res = await adminRelease(
      makeRequest(`/${dev.id}`, { method: "POST", body: {} }),
      params(dev.id)
    );
    expect(res.status).toBe(200);
    expect(
      (await prisma.device.findUnique({ where: { id: dev.id } }))?.status
    ).toBe("normal");
    expect(
      await prisma.adminAuditLog.findMany({
        where: { action: "admin.containment.release", targetId: dev.id },
      })
    ).toHaveLength(1);
  });

  it("admin updates containment config on another user's device (audited)", async () => {
    const admin = await createUser({ email: "a@x.com", role: "admin" });
    const owner = await createUser({ email: "o@x.com" });
    const dev = await createDevice(owner.id);
    asAdmin(admin.id);

    const res = await adminConfig(
      makeRequest(`/${dev.id}`, {
        method: "PUT",
        body: { disable_network: false },
      }),
      params(dev.id)
    );
    expect(res.status).toBe(200);
    const cfg = await prisma.containmentConfig.findUnique({
      where: { deviceId: dev.id },
    });
    expect(cfg?.disableNetwork).toBe(false);
    expect(
      await prisma.adminAuditLog.findMany({
        where: { action: "admin.containment.config", targetId: dev.id },
      })
    ).toHaveLength(1);
  });
});
