import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAgentToken } from "@/lib/agent-auth";
import { broadcaster } from "@/lib/events";

// POST /api/agent/heartbeat
// Called periodically by the installed agent
export async function POST(req: NextRequest) {
  try {
    const payload = await verifyAgentToken(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { status_report } = body; // Optional runtime status from the agent

    const device = await prisma.device.findFirst({
      where: { id: payload.device_id, deletedAt: null },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const updatedDevice = await prisma.device.update({
      where: { id: payload.device_id },
      data: { lastHeartbeat: new Date() },
    });

    // Notify portal listeners about heartbeat
    broadcaster.broadcastToUser(payload.user_id, "device:heartbeat", {
      deviceId: payload.device_id,
      lastHeartbeat: updatedDevice.lastHeartbeat,
    });

    // Return current containment state so agent can enforce it
    return NextResponse.json({
      status: device.status,
      network_disabled: device.networkDisabled,
      sessions_revoked: device.sessionsRevoked,
      extensions_frozen: device.extensionsFrozen,
      screen_locked: device.screenLocked,
    });
  } catch (error) {
    console.error("POST /api/agent/heartbeat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
