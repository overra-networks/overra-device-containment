import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large auth token responses
  serverExternalPackages: ["@prisma/client"],
  // NOTE: deliberately NO `env:` passthrough here.
  // Next.js `env` inlines values at BUILD time, which (a) froze NEXTAUTH_URL
  // into the bundle so every domain change needed a full rebuild, and
  // (b) risked leaking NEXTAUTH_SECRET into client bundles. Both vars are
  // server-only and are provided at runtime via systemd EnvironmentFile
  // (deploy/overra-portal.service) / .env.production, read through
  // process.env in server code and by NextAuth. NextAuth's client resolves
  // its base URL from window.location at runtime, so no bake-in is needed.
  // Allow E2E to build to a separate dist dir so it doesn't fight `next dev`
  // for `.next/dev/lock`. Set E2E_DIST_DIR=.next-e2e from playwright.config.ts.
  ...(process.env.E2E_DIST_DIR ? { distDir: process.env.E2E_DIST_DIR } : {}),
};

export default nextConfig;
