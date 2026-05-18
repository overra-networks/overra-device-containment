import { SocialLinks } from "@/components/layout/social-links";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F5F5F5",
        backgroundImage: "radial-gradient(circle, #D8E2EA 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        position: "relative",
      }}
    >
      {/* Top gradient line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "1px",
          background:
            "linear-gradient(90deg, transparent 0%, #0E1C29 40%, #1A3460 60%, transparent 100%)",
        }}
      />
      {children}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 0,
          right: 0,
        }}
      >
        <SocialLinks variant="auth" />
      </div>
    </div>
  );
}
