import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { ethers } from "ethers";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: null as any },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));

import { POST } from "@/app/api/devices/[id]/containment/enter/route";
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

async function signEnter(wallet: ethers.BaseWallet, deviceId: string, ts = Date.now()) {
  const message = `Overra Containment Activate: device=${deviceId} ts=${ts}`;
  const signature = await wallet.signMessage(message);
  return { signature, message };
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/devices/[id]/containment/enter", () => {
  it("returns 401 without session", async () => {
    const res = await POST(
      makeRequest("/api/devices/x/containment/enter", { method: "POST", body: {} }),
      makeParams("x")
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when device is not owned by session user", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const device = await createDevice(userA.id);
    sessionState.current = { user: { id: userB.id } };

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/enter`, { method: "POST", body: {} }),
      makeParams(device.id)
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when device is already contained", async () => {
    const user = await createUser();
    const device = await createDevice(user.id, { status: "contained" });
    sessionState.current = { user: { id: user.id } };

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/enter`, { method: "POST", body: {} }),
      makeParams(device.id)
    );
    expect(res.status).toBe(409);
  });

  it("contains a device without walletAuthority and no signature needed", async () => {
    const user = await createUser();
    const device = await createDevice(user.id);
    sessionState.current = { user: { id: user.id } };

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/enter`, { method: "POST", body: {} }),
      makeParams(device.id)
    );
    expect(res.status).toBe(200);

    const after = await prisma.device.findUnique({ where: { id: device.id } });
    expect(after!.status).toBe("contained");
    expect(after!.networkDisabled).toBe(true);
    expect(after!.screenLocked).toBe(true);
    expect(after!.lastAuthorization).not.toBeNull();

    const log = await prisma.auditLog.findFirst({ where: { deviceId: device.id } });
    expect(log).not.toBeNull();
    expect(log!.event).toMatch(/Containment mode activated/);
  });

  it("requires signature when walletAuthority is set (400 if absent)", async () => {
    const authority = ethers.Wallet.createRandom();
    const user = await createUser();
    const device = await createDevice(user.id, { walletAuthority: authority.address });
    sessionState.current = { user: { id: user.id } };

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/enter`, { method: "POST", body: {} }),
      makeParams(device.id)
    );
    expect(res.status).toBe(400);
  });

  it("rejects when message device id doesn't match route param", async () => {
    const authority = ethers.Wallet.createRandom();
    const user = await createUser();
    const device = await createDevice(user.id, { walletAuthority: authority.address });
    sessionState.current = { user: { id: user.id } };

    const wrongId = "00000000-0000-0000-0000-000000000000";
    const { signature, message } = await signEnter(authority, wrongId);

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/enter`, {
        method: "POST",
        body: { signature, message },
      }),
      makeParams(device.id)
    );
    expect(res.status).toBe(400);
  });

  it("rejects expired signature (>5 min old)", async () => {
    const authority = ethers.Wallet.createRandom();
    const user = await createUser();
    const device = await createDevice(user.id, { walletAuthority: authority.address });
    sessionState.current = { user: { id: user.id } };

    const oldTs = Date.now() - 10 * 60 * 1000;
    const { signature, message } = await signEnter(authority, device.id, oldTs);

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/enter`, {
        method: "POST",
        body: { signature, message },
      }),
      makeParams(device.id)
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/expired/i);
  });

  it("rejects signature from a non-authority wallet (403)", async () => {
    const authority = ethers.Wallet.createRandom();
    const imposter = ethers.Wallet.createRandom();
    const user = await createUser();
    const device = await createDevice(user.id, { walletAuthority: authority.address });
    sessionState.current = { user: { id: user.id } };

    const { signature, message } = await signEnter(imposter, device.id);

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/enter`, {
        method: "POST",
        body: { signature, message },
      }),
      makeParams(device.id)
    );
    expect(res.status).toBe(403);
  });

  it("contains the device on valid authority signature", async () => {
    const authority = ethers.Wallet.createRandom();
    const user = await createUser();
    const device = await createDevice(user.id, { walletAuthority: authority.address });
    sessionState.current = { user: { id: user.id } };

    const { signature, message } = await signEnter(authority, device.id);

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/enter`, {
        method: "POST",
        body: { signature, message },
      }),
      makeParams(device.id)
    );
    expect(res.status).toBe(200);

    const after = await prisma.device.findUnique({ where: { id: device.id } });
    expect(after!.status).toBe("contained");
  });
});
