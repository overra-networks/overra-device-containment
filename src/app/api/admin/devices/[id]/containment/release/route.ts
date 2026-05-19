import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/admin-auth";
import { recordAdminAction, clientIp } from "@/lib/admin-audit";
import { releaseContainment, ContainmentError } from "@/lib/containment";

// POST /api/admin/devices/:id/containment/release — cross-tenant (admin).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const { device, log } = await releaseContainment(id, {
      signature: body.signature,
      message: body.message,
      actorWallet: null,
      ipAddress: clientIp(req),
    });

    await recordAdminAction({
      adminUserId: session.user.id,
      action: "admin.containment.release",
      targetType: "device",
      targetId: id,
      ipAddress: clientIp(req),
    });

    return NextResponse.json({ device, log });
  } catch (error) {
    if (error instanceof AdminAuthError || error instanceof ContainmentError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("POST /api/admin/.../containment/release error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
