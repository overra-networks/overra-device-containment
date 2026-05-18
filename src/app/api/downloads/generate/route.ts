import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { rateLimiter } from "@/lib/rate-limit";

// POST /api/downloads/generate
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 20 tokens per user per hour — prevents token flooding
    const { allowed, retryAfter } = rateLimiter.check(
      `downloads:${session.user.id}`,
      20,
      60 * 60 * 1000
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many tokens generated. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await req.json();
    const { platform } = body;

    if (!["windows", "macos", "linux"].includes(platform)) {
      return NextResponse.json(
        { error: "platform must be windows, macos, or linux" },
        { status: 400 }
      );
    }

    const token = uuidv4();
    const download = await prisma.agentDownload.create({
      data: {
        userId: session.user.id,
        platform: platform as any,
        downloadToken: token,
      },
    });

    const downloadUrl = `${process.env.NEXTAUTH_URL}/api/downloads/${token}`;

    return NextResponse.json({ download_url: downloadUrl, token, id: download.id });
  } catch (error) {
    console.error("POST /api/downloads/generate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/downloads/generate — list existing downloads for user
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const downloads = await prisma.agentDownload.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ downloads });
  } catch (error) {
    console.error("GET /api/downloads/generate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
