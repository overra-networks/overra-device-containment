"use client";

import { SessionProvider } from "next-auth/react";
import { ToastContainer } from "@/components/layout/toast-container";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <ToastContainer />
    </SessionProvider>
  );
}
