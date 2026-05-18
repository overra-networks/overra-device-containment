"use client";

import { useRouter } from "next/navigation";
import { Search, RefreshCw, User } from "lucide-react";

export function PageHeader({ title }: { title: string }) {
  const router = useRouter();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "4px",
      }}
    >
      <h1 style={{ fontSize: "18px", fontWeight: 600, color: "#0E1C29", letterSpacing: "0.01em" }}>
        {title}
      </h1>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {[
          { icon: Search, label: "Search" },
          { icon: RefreshCw, label: "Refresh", onClick: () => router.refresh() },
          { icon: User, label: "Account" },
        ].map(({ icon: Icon, label, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            title={label}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              border: "1px solid #DDE3EA",
              background: "transparent",
              color: "#5A7080",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#0E1C29";
              (e.currentTarget as HTMLElement).style.borderColor = "#C4CDD7";
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#5A7080";
              (e.currentTarget as HTMLElement).style.borderColor = "#DDE3EA";
            }}
          >
            <Icon style={{ width: "14px", height: "14px" }} />
          </button>
        ))}
      </div>
    </div>
  );
}
