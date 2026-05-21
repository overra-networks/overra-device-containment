import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Edge gate for the admin surface. This is DEFENSE IN DEPTH only — every
 * /api/admin/* route handler still calls requireAdmin() (src/lib/admin-auth.ts)
 * as the authoritative check. This middleware exists so a missing in-handler
 * check can never silently expose an admin page/route.
 *
 * - /api/admin/* → JSON 401 (no session) / 403 (non-admin), preserving API
 *   semantics (never an HTML redirect for an API client).
 * - /admin/*     → redirect to /login when not an admin.
 */
export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const isAdmin = token?.role === "admin";

  if (isAdmin) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/api/admin")) {
    return NextResponse.json(
      { error: token ? "Forbidden" : "Unauthorized" },
      { status: token ? 403 : 401 }
    );
  }

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
