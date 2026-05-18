import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { rateLimiter, extractIp } from "@/lib/rate-limit";
import {
  verifyAndConsumeResetToken,
  invalidateUserResetTokens,
} from "@/lib/password-reset";

export async function POST(req: NextRequest) {
  try {
    const { allowed, retryAfter } = rateLimiter.check(
      `reset-password:${extractIp(req)}`,
      10,
      60 * 60 * 1000
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const consumed = await verifyAndConsumeResetToken(token);
    if (!consumed) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    // Bump passwordChangedAt so existing JWT sessions are invalidated on
    // their next refresh (see jwt callback in src/lib/auth.ts).
    await prisma.user.update({
      where: { id: consumed.userId },
      data: {
        passwordHash,
        passwordChangedAt: now,
      },
    });

    // Invalidate any other outstanding reset tokens for this user. The
    // consumed one is already marked usedAt by verifyAndConsumeResetToken.
    await invalidateUserResetTokens(consumed.userId);

    return NextResponse.json(
      { message: "Password updated. You can now sign in." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
