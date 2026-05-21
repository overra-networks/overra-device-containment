import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PUT /api/devices/:id/wallet-authority
// Sets the device's walletAuthority to the operator's currently linked wallet.
// The device will then require an EIP-191 signature from that wallet to
// enter or release containment.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const device = await prisma.device.findFirst({
      where: { id, deletedAt: null },
    });
    if (!device || device.userId !== session.user.id)
      return NextResponse.json({ error: "Device not found" }, { status: 404 });

    const userWallet = (session.user as any).walletAddress as string | null;
    if (!userWallet) {
      return NextResponse.json(
        { error: "Link a wallet to your account in Settings before setting wallet authority" },
        { status: 400 }
      );
    }

    const updated = await prisma.device.update({
      where: { id },
      data: { walletAuthority: userWallet },
    });

    return NextResponse.json({ walletAuthority: updated.walletAuthority });
  } catch (error) {
    console.error("PUT /api/devices/:id/wallet-authority error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/devices/:id/wallet-authority
// Clears the wallet authority so containment no longer requires a signature.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const device = await prisma.device.findFirst({
      where: { id, deletedAt: null },
    });
    if (!device || device.userId !== session.user.id)
      return NextResponse.json({ error: "Device not found" }, { status: 404 });

    await prisma.device.update({
      where: { id },
      data: { walletAuthority: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/devices/:id/wallet-authority error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
