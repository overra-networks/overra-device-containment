import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
 * Route-level chokepoint. Resolves the NextAuth session server-side and
 * asserts admin. Every /api/admin/* handler MUST call this before doing
 * anything else. Returns the (admin) session for convenience.
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  assertAdmin(session as SessionLike);
  return session!;
}
