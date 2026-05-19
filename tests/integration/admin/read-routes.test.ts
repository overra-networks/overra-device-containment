import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: null as any },
}));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));

import { GET as listDevices } from "@/app/api/admin/devices/route";
import { GET as listAuditLogs } from "@/app/api/admin/audit-logs/route";
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

describe("GET /api/admin/devices", () => {
  it("401 without session", async () => {
    expect((await listDevices(makeRequest("/api/admin/devices"))).status).toBe(401);
  });
  it("403 for non-admin", async () => {
    const u = await createUser({ role: "user" });
    asUser(u.id);
    expect((await listDevices(makeRequest("/api/admin/devices"))).status).toBe(403);
  });
  it("admin sees devices across ALL users with owner info", async () => {
    const admin = await createUser({ email: "a@x.com", role: "admin" });
    const u1 = await createUser({ email: "u1@x.com" });
    const u2 = await createUser({ email: "u2@x.com" });
    await createDevice(u1.id);
    await createDevice(u2.id);
    asAdmin(admin.id);

    const res = await listDevices(makeRequest("/api/admin/devices"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { devices: any[]; total: number };
    expect(json.total).toBe(2);
    expect(json.devices[0]).toHaveProperty("user");
    expect(json.devices[0].user).toHaveProperty("email");
  });
});

describe("GET /api/admin/audit-logs", () => {
  it("403 for non-admin", async () => {
    const u = await createUser({ role: "user" });
    asUser(u.id);
    expect(
      (await listAuditLogs(makeRequest("/api/admin/audit-logs"))).status
    ).toBe(403);
  });
  it("admin sees audit logs across all users, filterable by userId", async () => {
    const admin = await createUser({ email: "a@x.com", role: "admin" });
    const u1 = await createUser({ email: "u1@x.com" });
    const d1 = await createDevice(u1.id);
    await prisma.auditLog.create({
      data: { deviceId: d1.id, userId: u1.id, event: "x", result: "success" },
    });
    asAdmin(admin.id);

    const all = await listAuditLogs(makeRequest("/api/admin/audit-logs"));
    expect(all.status).toBe(200);
    expect(((await all.json()) as { total: number }).total).toBe(1);

    const filtered = await listAuditLogs(
      makeRequest(`/api/admin/audit-logs?userId=${u1.id}`)
    );
    expect(((await filtered.json()) as { total: number }).total).toBe(1);
  });
});
