import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAgentToken } from "@/lib/agent-auth";
import { broadcaster } from "@/lib/events";

// POST /api/agent/action/result
// Agent reports execution result of a containment action
export async function POST(req: NextRequest) {
  try {
    const payload = await verifyAgentToken(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, result, error: agentError, metadata } = body;

    if (!action || !result) {
      return NextResponse.json(
        { error: "action and result are required" },
        { status: 400 }
      );
    }

    const device = await prisma.device.findFirst({
      where: { id: payload.device_id, deletedAt: null },
    });
    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const log = await prisma.auditLog.create({
      data: {
        deviceId: payload.device_id,
        userId: payload.user_id,
        event: action,
        result: result as any,
        ipAddress: req.headers.get("x-forwarded-for") || null,
        metadata: metadata
          ? { ...metadata, ...(agentError && { error: agentError }) }
          : agentError
          ? { error: agentError }
          : null,
      },
    });

    broadcaster.broadcastToUser(payload.user_id, "log:new_entry", log);

    return NextResponse.json({ success: true, log_id: log.id });
  } catch (error) {
    console.error("POST /api/agent/action/result error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
