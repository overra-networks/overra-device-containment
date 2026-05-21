import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateContainmentConfig, ContainmentError } from "@/lib/containment";

// PUT /api/devices/:id/containment/config — owner-scoped config toggles.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const config = await updateContainmentConfig(id, body, session.user.id);

    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof ContainmentError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("PUT containment/config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
