import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/devices — list all devices for authenticated user
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const devices = await prisma.device.findMany({
      where: { userId: session.user.id, deletedAt: null },
      include: {
        containmentConfig: true,
        _count: { select: { auditLogs: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ devices });
  } catch (error) {
    console.error("GET /api/devices error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
