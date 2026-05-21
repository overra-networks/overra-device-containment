import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

export interface AgentPayload {
  device_id: string;
  user_id: string;
}

/**
 * Verifies the Bearer JWT on an agent request and confirms the device still
 * has an active token in the database. Setting `agentTokenHash` to null in
 * the DB is how a specific device's access is revoked without rotating
 * JWT_SECRET for every other agent.
 */
export async function verifyAgentToken(req: NextRequest): Promise<AgentPayload | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AgentPayload;

    // DB check: device must exist, userId must match, token must not be revoked.
    // A null agentTokenHash means the device was explicitly revoked.
    const device = await prisma.device.findFirst({
      where: { id: payload.device_id, deletedAt: null },
      select: { agentTokenHash: true, userId: true },
    });

    if (!device || !device.agentTokenHash) return null;
    if (device.userId !== payload.user_id) return null;

    return { device_id: payload.device_id, user_id: payload.user_id };
  } catch {
    return null;
  }
}
