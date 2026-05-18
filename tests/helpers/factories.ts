import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

let counter = 0;
function next(): number {
  return ++counter;
}

export interface CreatedUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  plainPassword: string;
}

export async function createUser(overrides: Partial<{ email: string; name: string; password: string; walletAddress: string | null; plan: "free" | "pro" | "enterprise" }> = {}): Promise<CreatedUser> {
  const n = next();
  const plainPassword = overrides.password ?? "password123";
  const passwordHash = await bcrypt.hash(plainPassword, 4);
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `user${n}@example.com`,
      name: overrides.name ?? `User ${n}`,
      passwordHash,
      walletAddress: overrides.walletAddress ?? null,
      plan: overrides.plan ?? "free",
    },
  });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    passwordHash: user.passwordHash,
    plainPassword,
  };
}

export async function createDevice(userId: string, overrides: Partial<{ hostname: string; os: string; walletAuthority: string | null; status: "normal" | "contained" | "offline" | "pending"; agentTokenHash: string | null }> = {}) {
  const n = next();
  return prisma.device.create({
    data: {
      userId,
      name: overrides.hostname ?? `host-${n}`,
      hostname: overrides.hostname ?? `host-${n}`,
      os: overrides.os ?? "linux",
      walletAuthority: "walletAuthority" in overrides ? overrides.walletAuthority ?? null : null,
      status: overrides.status ?? "normal",
      agentTokenHash: "agentTokenHash" in overrides ? overrides.agentTokenHash ?? null : "test-hash",
    },
  });
}

export async function createDownload(userId: string, overrides: Partial<{ platform: "windows" | "macos" | "linux"; downloadToken: string; activated: boolean }> = {}) {
  const n = next();
  return prisma.agentDownload.create({
    data: {
      userId,
      platform: overrides.platform ?? "linux",
      downloadToken: overrides.downloadToken ?? `dl-token-${n}-${Date.now()}`,
      activated: overrides.activated ?? false,
    },
  });
}
