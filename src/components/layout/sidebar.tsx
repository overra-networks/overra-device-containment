"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, Shield, Key, ScrollText, Monitor, Settings, LogOut, FileText, Lock, ShieldCheck, Download } from "lucide-react";
import { signOut } from "next-auth/react";
import { BrandMark } from "@/components/layout/brand-mark";
import { SocialLinks } from "@/components/layout/social-links";

const mainNav = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/containment", label: "Containment", icon: Shield },
  { href: "/authority", label: "Authority", icon: Key },
  { href: "/audit-logs", label: "Audit Logs", icon: ScrollText },
  { href: "/devices", label: "Devices", icon: Monitor },
  { href: "/downloads", label: "Downloads", icon: Download },
];

const disabledNav = [
  { label: "Policies", icon: FileText },
  { label: "Security Model", icon: ShieldCheck },
  { label: "Documentation", icon: Lock },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deviceId = searchParams.get("device");

  function navHref(base: string) {
    const needsDevice = ["/overview", "/containment", "/authority"].includes(base);
    if (needsDevice && deviceId) return `${base}?device=${deviceId}`;
    return base;
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside
      style={{
        width: "220px",
        minWidth: "220px",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #DDE3EA",
        background: "#FFFFFF",
        zIndex: 40,
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: "16px 18px 14px",
          borderBottom: "1px solid #DDE3EA",
          flexShrink: 0,
        }}
      >
        <BrandMark variant="sidebar" />
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          padding: "10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          overflowY: "auto",
        }}
      >
        {mainNav.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={navHref(href)}
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
                borderLeft: active ? "2px solid #0E1C29" : "2px solid transparent",
                transition: "all 0.15s",
              }}
            >
              <Icon style={{ width: "14px", height: "14px", flexShrink: 0, color: active ? "#0E1C29" : "#5A7080" }} />
              {label}
            </Link>
          );
        })}

        {/* Divider */}
        <div style={{ margin: "8px 0", borderTop: "1px solid #DDE3EA" }} />

        {/* Disabled nav items */}
        {disabledNav.map(({ label, icon: Icon }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "9px 10px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#C4CDD7",
              borderLeft: "2px solid transparent",
              cursor: "not-allowed",
              opacity: 0.5,
            }}
          >
            <Icon style={{ width: "14px", height: "14px", flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </nav>

      {/* Settings */}
      <div style={{ padding: "4px 8px 0", flexShrink: 0, borderTop: "1px solid #DDE3EA" }}>
        <Link
          href="/settings"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "9px 10px",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 500,
            textDecoration: "none",
            color: isActive("/settings") ? "#0E1C29" : "#5A7080",
            background: isActive("/settings") ? "rgba(14,28,41,0.09)" : "transparent",
            borderLeft: isActive("/settings") ? "2px solid #0E1C29" : "2px solid transparent",
            transition: "all 0.15s",
          }}
        >
          <Settings style={{ width: "14px", height: "14px", flexShrink: 0, color: isActive("/settings") ? "#0E1C29" : "#5A7080" }} />
          Settings
        </Link>
      </div>

      {/* Sign out */}
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
            borderLeft: "2px solid transparent",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseOver={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#FF3355";
            (e.currentTarget as HTMLElement).style.background = "rgba(255,51,85,0.06)";
            (e.currentTarget as HTMLElement).style.borderLeft = "2px solid #FF3355";
          }}
          onMouseOut={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#5A7080";
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.borderLeft = "2px solid transparent";
          }}
        >
          <LogOut style={{ width: "14px", height: "14px", flexShrink: 0 }} />
          Sign Out
        </button>
      </div>

      <div style={{ flexShrink: 0, borderTop: "1px solid #DDE3EA" }}>
        <SocialLinks variant="sidebar" />
      </div>
    </aside>
  );
}
