import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/admin-auth";
import prisma from "@/lib/prisma";

// GET /api/admin/devices — all devices across all users (admin only).
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(req.url);
    const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50"),
      100
    );
    const status = url.searchParams.get("status");
    const skip = (page - 1) * limit;

    const where = status ? { status: status as never } : {};

    const [devices, total] = await Promise.all([
      prisma.device.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          hostname: true,
          os: true,
          status: true,
          lastHeartbeat: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.device.count({ where }),
    ]);

    return NextResponse.json({ devices, total, page });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/devices error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
