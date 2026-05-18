import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { broadcaster } from "@/lib/events";

const SIGNATURE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// POST /api/devices/:id/containment/enter
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const device = await prisma.device.findUnique({
      where: { id },
      include: { containmentConfig: true },
    });

    if (!device || device.userId !== session.user.id)
      return NextResponse.json({ error: "Device not found" }, { status: 404 });

    if (device.status === "contained")
      return NextResponse.json({ error: "Device is already contained" }, { status: 409 });

    const body = await req.json();
    const { signature, message } = body;

    // If device has a wallet authority configured, require a valid, fresh signature
    if (device.walletAuthority) {
      if (!signature || !message) {
        return NextResponse.json(
          { error: "Wallet signature required for this device" },
          { status: 400 }
        );
      }

      // Validate message format to prevent replay attacks.
      // Expected: "Overra Containment Activate: device=<id> ts=<epoch_ms>"
      const msgMatch = (message as string).match(
        /^Overra Containment Activate: device=([a-f0-9-]+) ts=(\d+)$/
      );
      if (!msgMatch || msgMatch[1] !== id) {
        return NextResponse.json(
          { error: "Invalid signature message format" },
          { status: 400 }
        );
      }

      const msgTs = parseInt(msgMatch[2], 10);
      if (Math.abs(Date.now() - msgTs) > SIGNATURE_TTL_MS) {
        return NextResponse.json(
          { error: "Wallet signature has expired, please try again" },
          { status: 400 }
        );
      }

      const recovered = ethers.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== device.walletAuthority.toLowerCase()) {
        return NextResponse.json(
          { error: "Invalid wallet signature" },
          { status: 403 }
        );
      }
    }

    // Update device status and apply containment state flags
    const config = device.containmentConfig;
    const updatedDevice = await prisma.device.update({
      where: { id },
      data: {
        status: "contained",
        lastAuthorization: new Date(),
        networkDisabled: config?.disableNetwork ?? true,
        sessionsRevoked: config?.revokeSessions ?? true,
        extensionsFrozen: config?.freezeExtensions ?? true,
        screenLocked: config?.lockScreen ?? true,
      },
    });

    // Single audit log entry for the operator action.
    // Individual action results are reported by the agent via /api/agent/action/result
    // once it actually executes them — not pre-logged here.
    const log = await prisma.auditLog.create({
      data: {
        deviceId: id,
        userId: session.user.id,
        event: "Containment mode activated",
        result: "success",
        signature: signature || null,
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
        metadata: { wallet: session.user.walletAddress || null },
      },
    });

    // Broadcast SSE events to all portal clients watching this user
    broadcaster.broadcastToUser(session.user.id, "device:status_update", {
      deviceId: id,
      status: "contained",
    });
    broadcaster.broadcastToUser(session.user.id, "log:new_entry", log);

    return NextResponse.json({ device: updatedDevice, log });
  } catch (error) {
    console.error("POST containment/enter error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
