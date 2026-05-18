import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const SIGNATURE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { wallet_address, signature, message } = body;

    if (!wallet_address || !signature || !message) {
      return NextResponse.json(
        { error: "wallet_address, signature, and message are required" },
        { status: 400 }
      );
    }

    // Validate message format to prevent replay attacks.
    // Expected: "Overra Wallet Link: <address> ts=<epoch_ms>"
    const msgMatch = (message as string).match(
      /^Overra Wallet Link: (0x[a-fA-F0-9]+) ts=(\d+)$/
    );
    if (!msgMatch || msgMatch[1].toLowerCase() !== wallet_address.toLowerCase()) {
      return NextResponse.json(
        { error: "Invalid signature message format" },
        { status: 400 }
      );
    }

    const msgTs = parseInt(msgMatch[2], 10);
    if (Math.abs(Date.now() - msgTs) > SIGNATURE_TTL_MS) {
      return NextResponse.json(
        { error: "Wallet signature has expired, please try again" },
        { status: 400 }
      );
    }

    // Verify the signature
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== wallet_address.toLowerCase()) {
      return NextResponse.json(
        { error: "Signature verification failed" },
        { status: 400 }
      );
    }

    // Check if wallet is already linked to another account
    const existing = await prisma.user.findFirst({
      where: {
        walletAddress: wallet_address.toLowerCase(),
        id: { not: session.user.id },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Wallet is already linked to another account" },
        { status: 409 }
      );
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { walletAddress: wallet_address.toLowerCase() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Wallet link error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { walletAddress: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Wallet unlink error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
