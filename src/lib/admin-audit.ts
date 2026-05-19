import prisma from "@/lib/prisma";

export type AdminActionTarget = "user" | "device";

/**
 * Records a privileged admin action to the dedicated admin_audit_logs
 * trail. Every /api/admin/* mutation MUST call this. `action` is a
 * dotted verb like "admin.user.delete" / "admin.containment.enter".
 */
export async function recordAdminAction(params: {
  adminUserId: string;
  action: string;
  targetType: AdminActionTarget;
  targetId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  return prisma.adminAuditLog.create({
    data: {
      adminUserId: params.adminUserId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: (params.metadata ?? undefined) as never,
      ipAddress: params.ipAddress ?? null,
    },
  });
}

/** Best-effort client IP from proxy headers (mirrors existing routes). */
export function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    null
  );
}
