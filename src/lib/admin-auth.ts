import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * Thrown when an admin-only resource is accessed without sufficient
 * privilege. `status` maps directly to the HTTP status route handlers
 * should return: 401 (not authenticated) or 403 (authenticated, not admin).
 */
export class AdminAuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

type SessionLike = {
  user?: { id?: string | null; role?: string | null } | null;
} | null;

/**
 * Pure authorization check — unit-testable without NextAuth. Throws
 * AdminAuthError(401) if there is no authenticated user, AdminAuthError(403)
 * if the user is authenticated but not an admin. Returns normally only for
 * an admin session.
 */
export function assertAdmin(
  session: SessionLike
): asserts session is { user: { id: string; role: "admin" } } {
  if (!session?.user?.id) {
    throw new AdminAuthError(401, "Unauthorized");
  }
  if (session.user.role !== "admin") {
    throw new AdminAuthError(403, "Forbidden");
  }
}

/**
 * Route-level chokepoint. Resolves the NextAuth session server-side,
 * asserts the token claims admin, then RE-VERIFIES the role against the
 * database. The DB check is authoritative: it closes the stale-token
 * window where a demoted/deleted admin's still-valid 7-day JWT would
 * otherwise retain admin access until expiry. Every /api/admin/* handler
 * MUST call this before anything else. Returns the (admin) session.
 */
export async function requireAdmin() {
  const session = (await getServerSession(authOptions)) as SessionLike;
  assertAdmin(session);

  // Token says admin — confirm it's still true in the DB right now.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (dbUser?.role !== "admin") {
    throw new AdminAuthError(403, "Forbidden");
  }

  return session;
}
