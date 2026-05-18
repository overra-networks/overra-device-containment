import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { broadcaster } from "@/lib/events";

const SIGNATURE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// POST /api/devices/:id/containment/release
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const device = await prisma.device.findUnique({ where: { id } });

    if (!device || device.userId !== session.user.id)
      return NextResponse.json({ error: "Device not found" }, { status: 404 });

    if (device.status !== "contained")
      return NextResponse.json({ error: "Device is not in containment" }, { status: 409 });

    const body = await req.json();
    const { signature, message } = body;

    // Require wallet signature to release (if configured)
    if (device.walletAuthority) {
      if (!signature || !message) {
        return NextResponse.json(
          { error: "Wallet signature required to release containment" },
          { status: 400 }
        );
      }

      // Validate message format to prevent replay attacks.
      // Expected: "Overra Containment Release: device=<id> ts=<epoch_ms>"
      const msgMatch = (message as string).match(
        /^Overra Containment Release: device=([a-f0-9-]+) ts=(\d+)$/
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

    const updatedDevice = await prisma.device.update({
      where: { id },
      data: {
        status: "normal",
        networkDisabled: false,
        sessionsRevoked: false,
        extensionsFrozen: false,
        screenLocked: false,
        lastAuthorization: new Date(),
      },
    });

    const log = await prisma.auditLog.create({
      data: {
        deviceId: id,
        userId: session.user.id,
        event: "Containment mode released",
        result: "success",
        signature: signature || null,
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
        metadata: { wallet: session.user.walletAddress || null },
      },
    });

    broadcaster.broadcastToUser(session.user.id, "device:status_update", {
      deviceId: id,
      status: "normal",
    });
    broadcaster.broadcastToUser(session.user.id, "log:new_entry", log);

    return NextResponse.json({ device: updatedDevice, log });
  } catch (error) {
    console.error("POST containment/release error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
