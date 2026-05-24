import { NextRequest, NextResponse } from "next/server";
import { walletNonces } from "@/lib/wallet-nonce";
import { rateLimiter, extractIp } from "@/lib/rate-limit";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function POST(req: NextRequest) {
  try {
    const ip = extractIp(req);
    // 10 nonce requests per minute per IP — prevents nonce flooding.
    const { allowed, retryAfter } = rateLimiter.check(
      `wallet-nonce:${ip}`,
      10,
      60_000
    );
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${retryAfter} seconds.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { address } = body ?? {};

    if (typeof address !== "string" || !ADDRESS_RE.test(address)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const { nonce, message } = walletNonces.issue(address);
    return NextResponse.json({ nonce, message });
  } catch (error) {
    console.error("Wallet nonce error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
