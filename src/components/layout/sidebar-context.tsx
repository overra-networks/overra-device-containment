"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface SidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  // Outside a provider (e.g. server render before hydration), behave as
  // a closed, no-op drawer so the desktop layout still renders.
  if (!ctx) return { open: false, setOpen: () => undefined };
  return ctx;
}
