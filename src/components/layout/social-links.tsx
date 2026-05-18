"use client";

import { Globe } from "lucide-react";

interface SocialLinksProps {
  variant?: "sidebar" | "auth";
}

const links = [
  { label: "Website", href: "https://overra.network/", icon: "globe" as const },
  { label: "X", href: "https://x.com/overranetwork", icon: "x" as const },
  { label: "Telegram", href: "https://t.me/overraportal", icon: "telegram" as const },
];

function IconFor({ name }: { name: "globe" | "x" | "telegram" }) {
  const size = 14;
  if (name === "globe") {
    return <Globe style={{ width: size, height: size }} />;
  }
  if (name === "x") {
    // X (formerly Twitter) brand glyph — no lucide-react equivalent.
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.965 6.817H1.68l7.73-8.835L1.254 2.25h6.83l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  // Telegram paper-plane glyph.
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  );
}

export function SocialLinks({ variant = "sidebar" }: SocialLinksProps) {
  const isAuth = variant === "auth";
  const baseColor = isAuth ? "#5A7080" : "#8A9BAB";
  const hoverColor = "#0E1C29";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: isAuth ? "16px" : "10px",
        padding: isAuth ? "12px 0 0" : "8px 8px 12px",
      }}
    >
      {links.map(({ label, href, icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={label}
          aria-label={label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            borderRadius: "6px",
            color: baseColor,
            textDecoration: "none",
            transition: "color 0.15s, background 0.15s",
          }}
          onMouseOver={(e) => {
            (e.currentTarget as HTMLElement).style.color = hoverColor;
            (e.currentTarget as HTMLElement).style.background =
              "rgba(14,28,41,0.06)";
          }}
          onMouseOut={(e) => {
            (e.currentTarget as HTMLElement).style.color = baseColor;
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          <IconFor name={icon} />
        </a>
      ))}
    </div>
  );
}
