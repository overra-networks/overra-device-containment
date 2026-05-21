import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/devices/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const device = await prisma.device.findFirst({
      where: { id, deletedAt: null },
      include: {
        containmentConfig: true,
        auditLogs: {
          orderBy: { timestamp: "desc" },
          take: 50,
        },
      },
    });

    if (!device || device.userId !== session.user.id) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    return NextResponse.json({ device });
  } catch (error) {
    console.error("GET /api/devices/:id error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/devices/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const device = await prisma.device.findFirst({
      where: { id, deletedAt: null },
    });
    if (!device || device.userId !== session.user.id) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    // Soft-delete: preserve audit_logs / containment_configs. Null the
    // agentTokenHash so the installed agent fails its next heartbeat
    // (matches the documented per-device revocation mechanism).
    await prisma.device.update({
      where: { id },
      data: { deletedAt: new Date(), agentTokenHash: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/devices/:id error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
