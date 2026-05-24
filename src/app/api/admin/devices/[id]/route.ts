import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/admin-auth";
import { recordAdminAction, clientIp } from "@/lib/admin-audit";
import prisma from "@/lib/prisma";

// DELETE /api/admin/devices/:id — admin soft-deletes ANY user's device.
// Behavior matches the owner DELETE: deletedAt set, agentTokenHash nulled
// (existing per-device revocation kills the agent on next heartbeat),
// audit_logs preserved. Cross-tenant by design (no requireOwnerUserId).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const device = await prisma.device.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        user: { select: { email: true, walletAddress: true } },
      },
    });
    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    await prisma.device.update({
      where: { id },
      data: { deletedAt: new Date(), agentTokenHash: null },
    });

    await recordAdminAction({
      adminUserId: session.user.id,
      action: "admin.device.delete",
      targetType: "device",
      targetId: id,
      // For wallet-only owners email is null. We log both fields so the
      // audit row identifies the owner regardless of account type.
      metadata: {
        ownerEmail: device.user.email,
        ownerWallet: device.user.walletAddress,
      },
      ipAddress: clientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("DELETE /api/admin/devices/:id error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
