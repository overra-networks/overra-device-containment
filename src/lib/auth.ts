import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { rateLimiter } from "@/lib/rate-limit";

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

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValid) {
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
