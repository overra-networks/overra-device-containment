import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { ethers } from "ethers";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: null as any },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));

import { POST, DELETE } from "@/app/api/auth/wallet/link/route";
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

async function signLinkMessage(wallet: ethers.BaseWallet, address: string, ts: number): Promise<{ signature: string; message: string }> {
  const message = `Overra Wallet Link: ${address} ts=${ts}`;
  const signature = await wallet.signMessage(message);
  return { signature, message };
}

describe("POST /api/auth/wallet/link", () => {
  it("returns 401 when no session", async () => {
    const wallet = ethers.Wallet.createRandom();
    const { signature, message } = await signLinkMessage(wallet, wallet.address, Date.now());
    const res = await POST(
      makeRequest("/api/auth/wallet/link", {
        method: "POST",
        body: { wallet_address: wallet.address, signature, message },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const user = await createUser();
    sessionState.current = { user: { id: user.id } };
    const res = await POST(
      makeRequest("/api/auth/wallet/link", { method: "POST", body: { wallet_address: "0xabc" } })
    );
    expect(res.status).toBe(400);
  });

  it("rejects malformed message", async () => {
    const user = await createUser();
    sessionState.current = { user: { id: user.id } };
    const wallet = ethers.Wallet.createRandom();
    const message = "not the right format";
    const signature = await wallet.signMessage(message);

    const res = await POST(
      makeRequest("/api/auth/wallet/link", {
        method: "POST",
        body: { wallet_address: wallet.address, signature, message },
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects when message address does not match wallet_address", async () => {
    const user = await createUser();
    sessionState.current = { user: { id: user.id } };
    const wallet = ethers.Wallet.createRandom();
    const other = ethers.Wallet.createRandom();
    const message = `Overra Wallet Link: ${other.address} ts=${Date.now()}`;
    const signature = await wallet.signMessage(message);

    const res = await POST(
      makeRequest("/api/auth/wallet/link", {
        method: "POST",
        body: { wallet_address: wallet.address, signature, message },
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects expired signature (ts older than 5 min)", async () => {
    const user = await createUser();
    sessionState.current = { user: { id: user.id } };
    const wallet = ethers.Wallet.createRandom();
    const oldTs = Date.now() - 10 * 60 * 1000;
    const { signature, message } = await signLinkMessage(wallet, wallet.address, oldTs);

    const res = await POST(
      makeRequest("/api/auth/wallet/link", {
        method: "POST",
        body: { wallet_address: wallet.address, signature, message },
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/expired/i);
  });

  it("rejects signature that doesn't recover to wallet_address", async () => {
    const user = await createUser();
    sessionState.current = { user: { id: user.id } };
    const signer = ethers.Wallet.createRandom();
    const claimed = ethers.Wallet.createRandom();
    const message = `Overra Wallet Link: ${claimed.address} ts=${Date.now()}`;
    const signature = await signer.signMessage(message);

    const res = await POST(
      makeRequest("/api/auth/wallet/link", {
        method: "POST",
        body: { wallet_address: claimed.address, signature, message },
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects wallet already linked to another account (409)", async () => {
    const wallet = ethers.Wallet.createRandom();
    const userA = await createUser({ walletAddress: wallet.address.toLowerCase() });
    const userB = await createUser();
    sessionState.current = { user: { id: userB.id } };

    const { signature, message } = await signLinkMessage(wallet, wallet.address, Date.now());
    const res = await POST(
      makeRequest("/api/auth/wallet/link", {
        method: "POST",
        body: { wallet_address: wallet.address, signature, message },
      })
    );
    expect(res.status).toBe(409);
    void userA;
  });

  it("links wallet to user on valid signature", async () => {
    const user = await createUser();
    sessionState.current = { user: { id: user.id } };
    const wallet = ethers.Wallet.createRandom();
    const { signature, message } = await signLinkMessage(wallet, wallet.address, Date.now());

    const res = await POST(
      makeRequest("/api/auth/wallet/link", {
        method: "POST",
        body: { wallet_address: wallet.address, signature, message },
      })
    );
    expect(res.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.walletAddress).toBe(wallet.address.toLowerCase());
  });
});

describe("DELETE /api/auth/wallet/link", () => {
  it("returns 401 when no session", async () => {
    const res = await DELETE(makeRequest("/api/auth/wallet/link", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });

  it("unlinks the wallet for the current user", async () => {
    const wallet = ethers.Wallet.createRandom();
    const user = await createUser({ walletAddress: wallet.address.toLowerCase() });
    sessionState.current = { user: { id: user.id } };

    const res = await DELETE(makeRequest("/api/auth/wallet/link", { method: "DELETE" }));
    expect(res.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.walletAddress).toBeNull();
  });
});
