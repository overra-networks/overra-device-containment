import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enterContainment, ContainmentError } from "@/lib/containment";

// POST /api/devices/:id/containment/enter — owner-scoped containment.
// Shared logic lives in @/lib/containment (also used by the admin route).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const { device, log } = await enterContainment(id, {
      signature: body.signature,
      message: body.message,
      requireOwnerUserId: session.user.id,
      actorWallet: session.user.walletAddress || null,
      ipAddress:
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        null,
    });

    return NextResponse.json({ device, log });
  } catch (error) {
    if (error instanceof ContainmentError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("POST containment/enter error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
