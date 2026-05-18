import NextAuth from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      walletAddress: string | null;
      plan: string;
    };
  }
  interface User {
    id: string;
    email: string;
    name: string;
    walletAddress: string | null;
    plan: string;
    passwordChangedAt: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    walletAddress: string | null;
    plan: string;
    passwordChangedAt: number;
  }
}
