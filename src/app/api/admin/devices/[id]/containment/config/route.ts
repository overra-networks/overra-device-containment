import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/admin-auth";
import { recordAdminAction, clientIp } from "@/lib/admin-audit";
import { updateContainmentConfig, ContainmentError } from "@/lib/containment";

// PUT /api/admin/devices/:id/containment/config — cross-tenant (admin).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const config = await updateContainmentConfig(id, body);

    await recordAdminAction({
      adminUserId: session.user.id,
      action: "admin.containment.config",
      targetType: "device",
      targetId: id,
      metadata: { changed: body },
      ipAddress: clientIp(req),
    });

    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof AdminAuthError || error instanceof ContainmentError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("PUT /api/admin/.../containment/config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
