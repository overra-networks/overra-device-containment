"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "./sidebar-context";

export function MobileNavToggle() {
  const { setOpen } = useSidebar();
  return (
    <button
      type="button"
      aria-label="Open navigation"
      className="mobile-nav-toggle"
      onClick={() => setOpen(true)}
    >
      <Menu style={{ width: 20, height: 20 }} />
    </button>
  );
}
