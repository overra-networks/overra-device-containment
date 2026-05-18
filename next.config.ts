import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large auth token responses
  serverExternalPackages: ["@prisma/client"],
  // Env passthrough
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  },
  // Allow E2E to build to a separate dist dir so it doesn't fight `next dev`
  // for `.next/dev/lock`. Set E2E_DIST_DIR=.next-e2e from playwright.config.ts.
  ...(process.env.E2E_DIST_DIR ? { distDir: process.env.E2E_DIST_DIR } : {}),
};

export default nextConfig;
