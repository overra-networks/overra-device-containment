"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Monitor, ScrollText, ArrowLeft, LogOut, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { useSidebar } from "@/components/layout/sidebar-context";

const nav = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/devices", label: "Devices", icon: Monitor },
  { href: "/admin/audit-logs", label: "Admin Audit", icon: ScrollText },
];

export function AdminNav() {
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const closeOnNav = () => setOpen(false);

  return (
    <>
      <div
        className={`app-sidebar-backdrop${open ? " is-open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside
        className={`app-sidebar${open ? " is-open" : ""}`}
        style={{
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #DDE3EA",
          background: "#FFFFFF",
        }}
      >
      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid #DDE3EA",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#FF3355",
          }}
        >
          ADMIN CONSOLE
        </span>
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          style={{
            display: open ? "inline-flex" : "none",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            border: "1px solid #DDE3EA",
            borderRadius: 6,
            background: "transparent",
            color: "#5A7080",
            cursor: "pointer",
          }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      <nav
        style={{
          flex: 1,
          padding: "10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {nav.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={closeOnNav}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 10px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 500,
                textDecoration: "none",
                color: active ? "#0E1C29" : "#5A7080",
                background: active ? "rgba(14,28,41,0.09)" : "transparent",
                borderLeft: active
                  ? "2px solid #0E1C29"
                  : "2px solid transparent",
              }}
            >
              <Icon style={{ width: "14px", height: "14px", flexShrink: 0 }} />
              {label}
            </Link>
          );
        })}

        <div style={{ margin: "8px 0", borderTop: "1px solid #DDE3EA" }} />

        <Link
          href="/overview"
          onClick={closeOnNav}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "9px 10px",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 500,
            textDecoration: "none",
            color: "#5A7080",
            borderLeft: "2px solid transparent",
          }}
        >
          <ArrowLeft style={{ width: "14px", height: "14px" }} />
          Back to app
        </Link>
      </nav>

      <div style={{ padding: "4px 8px 12px", flexShrink: 0 }}>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            gap: "10px",
            padding: "9px 10px",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 500,
            color: "#5A7080",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <LogOut style={{ width: "14px", height: "14px" }} />
          Sign Out
        </button>
      </div>
    </aside>
    </>
  );
}
