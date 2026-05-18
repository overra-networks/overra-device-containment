import { describe, it, expect, beforeEach, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { POST } from "@/app/api/agent/heartbeat/route";
import prisma from "@/lib/prisma";
import { resetDatabase, disconnect } from "../../helpers/db";
import { makeRequest } from "../../helpers/request";
import { createUser, createDevice } from "../../helpers/factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

function signAgentJwt(deviceId: string, userId: string): string {
  return jwt.sign({ device_id: deviceId, user_id: userId }, process.env.JWT_SECRET!, { expiresIn: "1h" });
}

describe("POST /api/agent/heartbeat", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await POST(makeRequest("/api/agent/heartbeat", { method: "POST", body: {} }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when JWT signature is invalid", async () => {
    const bad = jwt.sign({ device_id: "x", user_id: "y" }, "wrong-secret");
    const res = await POST(
      makeRequest("/api/agent/heartbeat", {
        method: "POST",
        body: {},
        headers: { authorization: `Bearer ${bad}` },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when device's agentTokenHash is null (revoked)", async () => {
    const user = await createUser();
    const device = await createDevice(user.id, { agentTokenHash: null });
    const token = signAgentJwt(device.id, user.id);

    const res = await POST(
      makeRequest("/api/agent/heartbeat", {
        method: "POST",
        body: {},
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns containment state and updates lastHeartbeat on success", async () => {
    const user = await createUser();
    const device = await createDevice(user.id);
    await prisma.device.update({
      where: { id: device.id },
      data: { status: "contained", networkDisabled: true, screenLocked: true },
    });
    const token = signAgentJwt(device.id, user.id);

    const before = await prisma.device.findUnique({ where: { id: device.id } });
    expect(before!.lastHeartbeat).toBeNull();

    const res = await POST(
      makeRequest("/api/agent/heartbeat", {
        method: "POST",
        body: {},
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      status: string;
      network_disabled: boolean;
      sessions_revoked: boolean;
      extensions_frozen: boolean;
      screen_locked: boolean;
    };
    expect(json.status).toBe("contained");
    expect(json.network_disabled).toBe(true);
    expect(json.screen_locked).toBe(true);
    expect(json.sessions_revoked).toBe(false);
    expect(json.extensions_frozen).toBe(false);

    const after = await prisma.device.findUnique({ where: { id: device.id } });
    expect(after!.lastHeartbeat).not.toBeNull();
  });

  it("returns 401 when token user_id doesn't match device.userId", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const device = await createDevice(userA.id);
    const wrongToken = signAgentJwt(device.id, userB.id);

    const res = await POST(
      makeRequest("/api/agent/heartbeat", {
        method: "POST",
        body: {},
        headers: { authorization: `Bearer ${wrongToken}` },
      })
    );
    expect(res.status).toBe(401);
  });
});
