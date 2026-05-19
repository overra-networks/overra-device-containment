import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/admin-auth";
import prisma from "@/lib/prisma";

// GET /api/admin/audit-logs — global device audit trail (admin only),
// paginated, optionally filtered by userId / deviceId.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(req.url);
    const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50"),
      100
    );
    const userId = url.searchParams.get("userId") || undefined;
    const deviceId = url.searchParams.get("deviceId") || undefined;
    const skip = (page - 1) * limit;

    const where = {
      ...(userId ? { userId } : {}),
      ...(deviceId ? { deviceId } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip,
        take: limit,
        include: {
          device: { select: { id: true, name: true } },
          user: { select: { id: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, page });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/audit-logs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
