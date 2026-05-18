import { describe, it, expect, beforeEach, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { POST } from "@/app/api/agent/authenticate/route";
import prisma from "@/lib/prisma";
import { resetDatabase, disconnect } from "../../helpers/db";
import { makeRequest } from "../../helpers/request";
import { createUser, createDownload } from "../../helpers/factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

const baseIp = "10.20.0";

describe("POST /api/agent/authenticate", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await POST(
      makeRequest("/api/agent/authenticate", {
        method: "POST",
        body: { download_token: "x" },
        ip: `${baseIp}.1`,
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 for unknown download token", async () => {
    const res = await POST(
      makeRequest("/api/agent/authenticate", {
        method: "POST",
        body: { download_token: "does-not-exist", hostname: "host", os: "linux" },
        ip: `${baseIp}.2`,
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for already-activated download token (one-time use)", async () => {
    const user = await createUser();
    const dl = await createDownload(user.id, { activated: true });

    const res = await POST(
      makeRequest("/api/agent/authenticate", {
        method: "POST",
        body: { download_token: dl.downloadToken, hostname: "host", os: "linux" },
        ip: `${baseIp}.3`,
      })
    );
    expect(res.status).toBe(401);
  });

  it("creates a device, marks download activated, and returns an agent JWT on success", async () => {
    const user = await createUser();
    const dl = await createDownload(user.id, { platform: "linux" });

    const res = await POST(
      makeRequest("/api/agent/authenticate", {
        method: "POST",
        body: { download_token: dl.downloadToken, hostname: "alice-mbp", os: "linux", agent_version: "v0.2" },
        ip: `${baseIp}.4`,
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { agent_token: string; device_id: string; user_id: string };
    expect(json.user_id).toBe(user.id);
    expect(json.device_id).toMatch(/^[0-9a-f-]{36}$/);

    const decoded = jwt.verify(json.agent_token, process.env.JWT_SECRET!) as { device_id: string; user_id: string };
    expect(decoded.device_id).toBe(json.device_id);
    expect(decoded.user_id).toBe(user.id);

    const device = await prisma.device.findUnique({ where: { id: json.device_id } });
    expect(device).not.toBeNull();
    expect(device!.hostname).toBe("alice-mbp");
    expect(device!.agentVersion).toBe("v0.2");
    expect(device!.agentTokenHash).not.toBeNull();
    expect(device!.lastHeartbeat).not.toBeNull();

    const dlAfter = await prisma.agentDownload.findUnique({ where: { id: dl.id } });
    expect(dlAfter!.activated).toBe(true);

    const auditCount = await prisma.auditLog.count({ where: { deviceId: json.device_id } });
    expect(auditCount).toBe(1);
  });

  it("rotates the agent token hash when re-installing on a known hostname", async () => {
    const user = await createUser();
    const dl1 = await createDownload(user.id);
    const r1 = await POST(
      makeRequest("/api/agent/authenticate", {
        method: "POST",
        body: { download_token: dl1.downloadToken, hostname: "reused-host", os: "linux" },
        ip: `${baseIp}.5`,
      })
    );
    expect(r1.status).toBe(200);
    const { device_id } = (await r1.json()) as { device_id: string };
    const firstHash = (await prisma.device.findUnique({ where: { id: device_id } }))!.agentTokenHash;

    const dl2 = await createDownload(user.id);
    const r2 = await POST(
      makeRequest("/api/agent/authenticate", {
        method: "POST",
        body: { download_token: dl2.downloadToken, hostname: "reused-host", os: "linux" },
        ip: `${baseIp}.6`,
      })
    );
    expect(r2.status).toBe(200);
    const { device_id: device_id2 } = (await r2.json()) as { device_id: string };
    expect(device_id2).toBe(device_id);

    const secondHash = (await prisma.device.findUnique({ where: { id: device_id } }))!.agentTokenHash;
    expect(secondHash).not.toBe(firstHash);
  });

  it("rate-limits to 10 attempts per IP per 15 minutes", async () => {
    const ip = `${baseIp}.99`;
    for (let i = 0; i < 10; i++) {
      const res = await POST(
        makeRequest("/api/agent/authenticate", {
          method: "POST",
          body: { download_token: `bogus-${i}`, hostname: "h", os: "linux" },
          ip,
        })
      );
      expect([401, 400]).toContain(res.status);
    }
    const blocked = await POST(
      makeRequest("/api/agent/authenticate", {
        method: "POST",
        body: { download_token: "bogus-final", hostname: "h", os: "linux" },
        ip,
      })
    );
    expect(blocked.status).toBe(429);
  });
});
