import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { rateLimiter, extractIp } from "@/lib/rate-limit";

// POST /api/agent/authenticate
// Called by the agent during installation with the download token
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { download_token, hostname, os, agent_version } = body;

    // 10 attempts per IP per 15 minutes — limits token enumeration
    const { allowed, retryAfter } = rateLimiter.check(
      `agent-auth:${extractIp(req)}`,
      10,
      15 * 60 * 1000
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many authentication attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    if (!download_token || !hostname || !os) {
      return NextResponse.json(
        { error: "download_token, hostname, and os are required" },
        { status: 400 }
      );
    }

    // Find the agent download record
    const download = await prisma.agentDownload.findUnique({
      where: { downloadToken: download_token },
      include: { user: true },
    });

    if (!download) {
      return NextResponse.json(
        { error: "Invalid or expired download token" },
        { status: 401 }
      );
    }

    // Enforce one-time use
    if (download.activated) {
      return NextResponse.json(
        { error: "Download token has already been used" },
        { status: 401 }
      );
    }

    // Generate a fresh token hash for this installation
    const rawToken = uuidv4();
    const tokenHash = await bcrypt.hash(rawToken, 10);

    // Register or update device atomically — prevents the race condition where
    // two concurrent requests both see no existing device and both try to create one.
    const device = await prisma.$transaction(async (tx) => {
      const existing = await tx.device.findFirst({
        where: { userId: download.userId, hostname },
      });

      if (existing) {
        // Re-installation on the same host: rotate the token hash so the old
        // JWT (which we can no longer reach) stops working on next DB check.
        return tx.device.update({
          where: { id: existing.id },
          data: {
            agentTokenHash: tokenHash,
            agentVersion: agent_version || "v0.1",
            lastHeartbeat: new Date(),
            status: "normal",
          },
        });
      }

      return tx.device.create({
        data: {
          userId: download.userId,
          name: hostname,
          hostname,
          os,
          agentVersion: agent_version || "v0.1",
          agentTokenHash: tokenHash,
          status: "normal",
          lastHeartbeat: new Date(),
        },
      });
    });

    // Mark download token as activated only after the device is registered
    await prisma.agentDownload.update({
      where: { id: download.id },
      data: { activated: true },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        deviceId: device.id,
        userId: download.userId,
        event: "Agent authenticated and registered",
        result: "success",
        ipAddress: req.headers.get("x-forwarded-for") || null,
      },
    });

    // Sign a JWT for the agent.
    // raw_token is intentionally NOT included in the payload — JWTs are
    // base64-encoded (not encrypted). The DB's agentTokenHash is the
    // revocation mechanism: null it out to block this device.
    const agentJwt = jwt.sign(
      { device_id: device.id, user_id: download.userId },
      process.env.JWT_SECRET!,
      { expiresIn: "365d" }
    );

    return NextResponse.json({
      agent_token: agentJwt,
      device_id: device.id,
      user_id: download.userId,
    });
  } catch (error) {
    console.error("POST /api/agent/authenticate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
