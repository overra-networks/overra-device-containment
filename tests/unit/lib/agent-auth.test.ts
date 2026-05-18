import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

const findUniqueMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    device: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

import { verifyAgentToken } from "@/lib/agent-auth";

const SECRET = process.env.JWT_SECRET!;

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/test", { headers });
}

function signToken(payload: object, opts: jwt.SignOptions = {}): string {
  return jwt.sign(payload, SECRET, opts);
}

describe("verifyAgentToken", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it("returns null when Authorization header is missing", async () => {
    const result = await verifyAgentToken(makeReq());
    expect(result).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns null when Authorization header lacks Bearer scheme", async () => {
    const token = signToken({ device_id: "d1", user_id: "u1" });
    const result = await verifyAgentToken(makeReq({ authorization: token }));
    expect(result).toBeNull();
  });

  it("returns null when JWT signature is invalid", async () => {
    const bad = jwt.sign({ device_id: "d1", user_id: "u1" }, "wrong-secret");
    const result = await verifyAgentToken(makeReq({ authorization: `Bearer ${bad}` }));
    expect(result).toBeNull();
  });

  it("returns null when JWT is expired", async () => {
    const token = signToken({ device_id: "d1", user_id: "u1" }, { expiresIn: "-1s" });
    const result = await verifyAgentToken(makeReq({ authorization: `Bearer ${token}` }));
    expect(result).toBeNull();
  });

  it("returns null when device does not exist", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const token = signToken({ device_id: "d1", user_id: "u1" });
    const result = await verifyAgentToken(makeReq({ authorization: `Bearer ${token}` }));
    expect(result).toBeNull();
  });

  it("returns null when device.agentTokenHash is null (revoked)", async () => {
    findUniqueMock.mockResolvedValueOnce({ agentTokenHash: null, userId: "u1" });
    const token = signToken({ device_id: "d1", user_id: "u1" });
    const result = await verifyAgentToken(makeReq({ authorization: `Bearer ${token}` }));
    expect(result).toBeNull();
  });

  it("returns null when token user_id does not match device.userId", async () => {
    findUniqueMock.mockResolvedValueOnce({ agentTokenHash: "h", userId: "different-user" });
    const token = signToken({ device_id: "d1", user_id: "u1" });
    const result = await verifyAgentToken(makeReq({ authorization: `Bearer ${token}` }));
    expect(result).toBeNull();
  });

  it("returns the payload when token and device are valid", async () => {
    findUniqueMock.mockResolvedValueOnce({ agentTokenHash: "h", userId: "u1" });
    const token = signToken({ device_id: "d1", user_id: "u1" });
    const result = await verifyAgentToken(makeReq({ authorization: `Bearer ${token}` }));
    expect(result).toEqual({ device_id: "d1", user_id: "u1" });
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "d1" },
      select: { agentTokenHash: true, userId: true },
    });
  });
});
