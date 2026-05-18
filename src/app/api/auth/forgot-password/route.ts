import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimiter, extractIp } from "@/lib/rate-limit";
import { createResetToken } from "@/lib/password-reset";
import { sendPasswordResetEmail } from "@/lib/email";

const GENERIC_RESPONSE = {
  message:
    "If an account with that email exists, we've sent password reset instructions.",
};

export async function POST(req: NextRequest) {
  try {
    const ip = extractIp(req);

    // Per-IP: 5 requests / hour. Per-email: 3 / hour. Both must pass before
    // we look up the user, so neither limiter leaks existence via timing.
    const ipLimit = rateLimiter.check(
      `forgot-password:ip:${ip}`,
      5,
      60 * 60 * 1000
    );
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfter) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawEmail = typeof body.email === "string" ? body.email : "";
    if (!rawEmail) {
      return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
    }

    const email = rawEmail.toLowerCase().trim();

    const emailLimit = rateLimiter.check(
      `forgot-password:email:${email}`,
      3,
      60 * 60 * 1000
    );
    if (!emailLimit.allowed) {
      // Leaking "rate limited on this email" is itself an enumeration signal.
      return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (user) {
      try {
        const rawToken = await createResetToken(user.id, ip);
        const baseUrl =
          process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${rawToken}`;
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (err) {
        // Email send failure must not leak through the response — log it
        // server-side and still return the generic message.
        console.error("Failed to send password reset email:", err);
      }
    }

    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  }
}
