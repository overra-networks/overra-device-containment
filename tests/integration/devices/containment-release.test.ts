import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { ethers } from "ethers";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: null as any },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));

import { POST } from "@/app/api/devices/[id]/containment/release/route";
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

async function signRelease(wallet: ethers.BaseWallet, deviceId: string, ts = Date.now()) {
  const message = `Overra Containment Release: device=${deviceId} ts=${ts}`;
  const signature = await wallet.signMessage(message);
  return { signature, message };
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/devices/[id]/containment/release", () => {
  it("returns 401 without session", async () => {
    const res = await POST(
      makeRequest("/api/devices/x/containment/release", { method: "POST", body: {} }),
      makeParams("x")
    );
    expect(res.status).toBe(401);
  });

  it("returns 409 when device is not currently contained", async () => {
    const user = await createUser();
    const device = await createDevice(user.id, { status: "normal" });
    sessionState.current = { user: { id: user.id } };

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/release`, { method: "POST", body: {} }),
      makeParams(device.id)
    );
    expect(res.status).toBe(409);
  });

  it("releases a contained device without walletAuthority", async () => {
    const user = await createUser();
    const device = await createDevice(user.id, { status: "contained" });
    await prisma.device.update({
      where: { id: device.id },
      data: { networkDisabled: true, screenLocked: true, sessionsRevoked: true, extensionsFrozen: true },
    });
    sessionState.current = { user: { id: user.id } };

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/release`, { method: "POST", body: {} }),
      makeParams(device.id)
    );
    expect(res.status).toBe(200);

    const after = await prisma.device.findUnique({ where: { id: device.id } });
    expect(after!.status).toBe("normal");
    expect(after!.networkDisabled).toBe(false);
    expect(after!.sessionsRevoked).toBe(false);
    expect(after!.extensionsFrozen).toBe(false);
    expect(after!.screenLocked).toBe(false);
  });

  it("requires signature when walletAuthority is set", async () => {
    const authority = ethers.Wallet.createRandom();
    const user = await createUser();
    const device = await createDevice(user.id, { status: "contained", walletAuthority: authority.address });
    sessionState.current = { user: { id: user.id } };

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/release`, { method: "POST", body: {} }),
      makeParams(device.id)
    );
    expect(res.status).toBe(400);
  });

  it("rejects imposter signature (403)", async () => {
    const authority = ethers.Wallet.createRandom();
    const imposter = ethers.Wallet.createRandom();
    const user = await createUser();
    const device = await createDevice(user.id, { status: "contained", walletAuthority: authority.address });
    sessionState.current = { user: { id: user.id } };

    const { signature, message } = await signRelease(imposter, device.id);

    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/release`, {
        method: "POST",
        body: { signature, message },
      }),
      makeParams(device.id)
    );
    expect(res.status).toBe(403);
  });

  it("releases on valid authority signature", async () => {
    const authority = ethers.Wallet.createRandom();
    const user = await createUser();
    const device = await createDevice(user.id, { status: "contained", walletAuthority: authority.address });
    sessionState.current = { user: { id: user.id } };

    const { signature, message } = await signRelease(authority, device.id);
    const res = await POST(
      makeRequest(`/api/devices/${device.id}/containment/release`, {
        method: "POST",
        body: { signature, message },
      }),
      makeParams(device.id)
    );
    expect(res.status).toBe(200);

    const after = await prisma.device.findUnique({ where: { id: device.id } });
    expect(after!.status).toBe("normal");
  });
});
