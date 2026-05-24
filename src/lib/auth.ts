import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { ethers } from "ethers";
import prisma from "@/lib/prisma";
import { rateLimiter } from "@/lib/rate-limit";
import { walletNonces } from "@/lib/wallet-nonce";

const WALLET_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function formatWalletName(address: string): string {
  return `Wallet ${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        // 5 attempts per email per 15 minutes — prevents per-account brute force
        const { allowed, retryAfter } = rateLimiter.check(
          `login:${credentials.email.toLowerCase()}`,
          5,
          15 * 60 * 1000
        );
        if (!allowed) {
          throw new Error(
            `Too many login attempts. Try again in ${retryAfter} seconds.`
          );
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user) {
          throw new Error("Invalid email or password");
        }

        // Wallet-only accounts have no passwordHash. Reject with the
        // SAME generic error to avoid leaking which accounts exist
        // without a password (anti-enumeration, matches the locked
        // account rule below).
        if (!user.passwordHash) {
          throw new Error("Invalid email or password");
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValid) {
          throw new Error("Invalid email or password");
        }

        // Locked accounts are rejected with the SAME generic error as
        // bad credentials — never leak the locked state to the login
        // form (no account-status enumeration). Admins manage the
        // locked flag via /api/admin/users/[id] PATCH.
        if (user.lockedAt) {
          throw new Error("Invalid email or password");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          walletAddress: user.walletAddress,
          plan: user.plan,
          role: user.role,
          passwordChangedAt: user.passwordChangedAt.getTime(),
        };
      },
    }),
    CredentialsProvider({
      id: "wallet",
      name: "MetaMask Wallet",
      credentials: {
        address: { label: "Address", type: "text" },
        signature: { label: "Signature", type: "text" },
        nonce: { label: "Nonce", type: "text" },
      },
      async authorize(credentials) {
        const address = credentials?.address;
        const signature = credentials?.signature;
        const nonce = credentials?.nonce;

        if (
          typeof address !== "string" ||
          typeof signature !== "string" ||
          typeof nonce !== "string" ||
          !WALLET_ADDRESS_RE.test(address)
        ) {
          throw new Error("Invalid wallet sign-in request");
        }

        const normalized = address.toLowerCase();

        // 5 attempts per wallet per 15 minutes — mirrors email login window.
        const { allowed, retryAfter } = rateLimiter.check(
          `login:wallet:${normalized}`,
          5,
          15 * 60 * 1000
        );
        if (!allowed) {
          throw new Error(
            `Too many login attempts. Try again in ${retryAfter} seconds.`
          );
        }

        // Single-use nonce consumption. Returns the exact message that
        // was issued, or null if the nonce is wrong/expired/missing.
        const message = walletNonces.consume(normalized, nonce);
        if (!message) {
          throw new Error("Invalid or expired login challenge");
        }

        // Recover the signer from the EIP-191 signature.
        let recovered: string;
        try {
          recovered = ethers.verifyMessage(message, signature);
        } catch {
          throw new Error("Signature verification failed");
        }
        if (recovered.toLowerCase() !== normalized) {
          throw new Error("Signature verification failed");
        }

        // Find-or-create. Wallet-only accounts have no email/password.
        let user = await prisma.user.findUnique({
          where: { walletAddress: normalized },
        });
        if (!user) {
          user = await prisma.user.create({
            data: {
              walletAddress: normalized,
              name: formatWalletName(normalized),
              email: null,
              passwordHash: null,
              plan: "free",
              role: "user",
            },
          });
        }

        // Locked accounts: same generic error as bad sig (anti-enumeration,
        // matches email-provider rule).
        if (user.lockedAt) {
          throw new Error("Signature verification failed");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          walletAddress: user.walletAddress,
          plan: user.plan,
          role: user.role,
          passwordChangedAt: user.passwordChangedAt.getTime(),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.walletAddress = (user as any).walletAddress;
        token.plan = (user as any).plan;
        token.role = (user as any).role;
        token.passwordChangedAt = (user as any).passwordChangedAt;
        return token;
      }

      // Handle session update (wallet linking etc.)
      if (trigger === "update" && session) {
        if (session.walletAddress !== undefined) {
          token.walletAddress = session.walletAddress;
        }
        if (session.name) {
          token.name = session.name;
        }
        return token;
      }

      // Token refresh path: invalidate if password was changed after this
      // token was issued. Forces re-login after password reset.
      if (token.id && typeof token.passwordChangedAt === "number") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { passwordChangedAt: true },
        });
        if (!dbUser || dbUser.passwordChangedAt.getTime() > token.passwordChangedAt) {
          (token as any).invalidated = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if ((token as any).invalidated) {
        // Returning a session with no user fields makes callers reading
        // session.user.id treat the request as unauthenticated.
        return { ...session, user: undefined as any };
      }
      if (token && session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).walletAddress = token.walletAddress as string | null;
        (session.user as any).plan = token.plan as string;
        (session.user as any).role = token.role as string;
      }
      return session;
    },
  },
};
