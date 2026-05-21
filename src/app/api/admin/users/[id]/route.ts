import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/admin-auth";
import { recordAdminAction, clientIp } from "@/lib/admin-audit";
import prisma from "@/lib/prisma";

const PLANS = ["free", "pro", "enterprise"] as const;
const ROLES = ["user", "admin"] as const;

function authErr(error: unknown, ctx: string) {
  if (error instanceof AdminAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`${ctx} error:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// GET /api/admin/users/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        role: true,
        walletAddress: true,
        createdAt: true,
        updatedAt: true,
        devices: {
          select: { id: true, name: true, status: true, lastHeartbeat: true },
        },
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (error) {
    return authErr(error, "GET /api/admin/users/:id");
  }
}

// PATCH /api/admin/users/:id — update name, plan, role.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const data: { name?: string; plan?: string; role?: string } = {};
    const lockChange = typeof body.locked === "boolean" ? body.locked : null;

    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (body.plan !== undefined) {
      if (!PLANS.includes(body.plan)) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }
      data.plan = body.plan;
    }
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      // Lockout guard: an admin cannot demote themselves here.
      if (id === session.user.id && body.role !== "admin") {
        return NextResponse.json(
          { error: "You cannot remove your own admin role" },
          { status: 400 }
        );
      }
      data.role = body.role;
    }
    if (lockChange === true && id === session.user.id) {
      return NextResponse.json(
        { error: "You cannot lock your own account" },
        { status: 400 }
      );
    }

    if (Object.keys(data).length === 0 && lockChange === null) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Handle lock/unlock as a dedicated mutation + audit row. Bumping
    // passwordChangedAt is the documented mechanism for invalidating all
    // outstanding JWTs for this user (jwt callback DB-checks it).
    if (lockChange !== null) {
      await prisma.user.update({
        where: { id },
        data: {
          lockedAt: lockChange ? new Date() : null,
          passwordChangedAt: new Date(),
        },
      });
      await recordAdminAction({
        adminUserId: session.user.id,
        action: lockChange ? "admin.user.lock" : "admin.user.unlock",
        targetType: "user",
        targetId: id,
        metadata: { email: existing.email },
        ipAddress: clientIp(req),
      });
    }

    // No other fields → return early with the post-lock state.
    if (Object.keys(data).length === 0) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id },
        select: { id: true, email: true, name: true, plan: true, role: true },
      });
      return NextResponse.json({ user });
    }

    const user = await prisma.user.update({
      where: { id },
      // `data` values are allowlist-validated above; the cast works around
      // Prisma 7's stricter enum input typing (documented project-wide).
      data: data as never,
      select: { id: true, email: true, name: true, plan: true, role: true },
    });

    await recordAdminAction({
      adminUserId: session.user.id,
      action: "admin.user.update",
      targetType: "user",
      targetId: id,
      metadata: { changed: data },
      ipAddress: clientIp(req),
    });

    return NextResponse.json({ user });
  } catch (error) {
    return authErr(error, "PATCH /api/admin/users/:id");
  }
}

// DELETE /api/admin/users/:id — removes user (devices/logs cascade).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    if (id === session.user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.user.delete({ where: { id } });

    await recordAdminAction({
      adminUserId: session.user.id,
      action: "admin.user.delete",
      targetType: "user",
      targetId: id,
      metadata: { email: existing.email },
      ipAddress: clientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return authErr(error, "DELETE /api/admin/users/:id");
  }
}
