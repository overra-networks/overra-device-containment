import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PUT /api/devices/:id/containment/config — update toggles
export async function PUT(
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

    const body = await req.json();
    const {
      disable_network,
      revoke_sessions,
      freeze_extensions,
      lock_screen,
    } = body;

    const config = await prisma.containmentConfig.upsert({
      where: { deviceId: id },
      create: {
        deviceId: id,
        disableNetwork: disable_network ?? true,
        revokeSessions: revoke_sessions ?? true,
        freezeExtensions: freeze_extensions ?? true,
        lockScreen: lock_screen ?? true,
      },
      update: {
        ...(disable_network !== undefined && { disableNetwork: disable_network }),
        ...(revoke_sessions !== undefined && { revokeSessions: revoke_sessions }),
        ...(freeze_extensions !== undefined && { freezeExtensions: freeze_extensions }),
        ...(lock_screen !== undefined && { lockScreen: lock_screen }),
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    console.error("PUT containment/config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
