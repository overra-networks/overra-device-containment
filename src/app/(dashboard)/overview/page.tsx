import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { formatTimestamp, truncateAddress } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ device?: string }>;
}

export default async function OverviewPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { device: deviceId } = await searchParams;

  // If a device ID is provided, verify it belongs to the user
  let device = null;
  if (deviceId) {
    device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        auditLogs: { orderBy: { timestamp: "desc" }, take: 5 },
      },
    });
    if (!device || device.userId !== session.user.id) notFound();
  } else {
    // Default to the most recently created device
    const first = await prisma.device.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        auditLogs: { orderBy: { timestamp: "desc" }, take: 5 },
      },
    });
    device = first;
  }

  const isContained = device?.status === "contained";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <PageHeader title="Overview" />

      {!device ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 20px",
            textAlign: "center",
            border: "1px dashed #DDE3EA",
            borderRadius: "12px",
          }}
        >
          <p style={{ fontSize: "14px", fontWeight: 500, color: "#0E1C29", marginBottom: "6px" }}>
            No endpoints registered
          </p>
          <p style={{ fontSize: "13px", color: "#5A7080" }}>
            Go to <Link href="/devices" style={{ color: "#0E1C29", textDecoration: "none" }}>Devices</Link> to
            enroll an endpoint, or visit <Link href="/downloads" style={{ color: "#0E1C29", textDecoration: "none" }}>Downloads</Link> to get the installer.
          </p>
        </div>
      ) : (
        <>
          {/* System Status Card */}
          <div
            style={{
              background: "#FFFFFF",
              border: `1px solid ${isContained ? "rgba(255,51,85,0.3)" : "rgba(0,135,90,0.3)"}`,
              borderRadius: "10px",
              padding: "20px 24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: isContained ? "#FF3355" : "#00875A",
                    boxShadow: `0 0 8px ${isContained ? "rgba(255,51,85,0.6)" : "rgba(0,135,90,0.5)"}`,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#5A7080",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    SYSTEM STATUS:{" "}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontFamily: "var(--font-mono, monospace)",
                      color: isContained ? "#FF3355" : "#00875A",
                    }}
                  >
                    {device.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "#5A7080" }}>System Integrity:</span>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.5 1L8.2 4.5L12 5.1L9.25 7.8L9.9 11.6L6.5 9.8L3.1 11.6L3.75 7.8L1 5.1L4.8 4.5L6.5 1Z"
                      stroke="#00875A" strokeWidth="1" fill="none" />
                    <path d="M4.5 6.5L5.8 7.8L8.5 5" stroke="#00875A" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: "12px", color: "#00875A", fontWeight: 500 }}>Secure</span>
                </div>
              </div>
            </div>

            {/* Device metadata */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px 32px",
                marginTop: "18px",
                paddingTop: "18px",
                borderTop: "1px solid #DDE3EA",
              }}
            >
              <MetaRow label="Registered Wallet" value={device.walletAuthority ? truncateAddress(device.walletAuthority, 6) : "—"} />
              <MetaRow label="System Integrity" value="Verified" highlight />
              <MetaRow label="Device ID" value={device.id.slice(0, 14) + "..."} mono />
              <MetaRow label="Agent Version" value={device.agentVersion} mono />
              <MetaRow label="Last Authorization" value={device.lastAuthorization ? formatTimestamp(device.lastAuthorization as unknown as string) : "Never"} />
            </div>
          </div>

          {/* Two-column: Wallet Authority + Recent Activity */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "16px" }}>
            {/* Wallet Authority */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #DDE3EA",
                borderRadius: "10px",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #DDE3EA", display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1" y="1" width="11" height="11" rx="2" stroke="#5A7080" strokeWidth="1.2" />
                  <path d="M4 6.5h5M4 4.5h5M4 8.5h3" stroke="#5A7080" strokeWidth="1" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#0E1C29", letterSpacing: "0.04em" }}>
                  Wallet Authority
                </span>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <AuthRow label="Address" value={device.walletAuthority ? truncateAddress(device.walletAuthority, 6) : "Not set"} />
                <AuthRow label="Authority Verified" value={device.walletAuthority ? "Yes" : "No"} highlight={!!device.walletAuthority} />
                <AuthRow label="Nonce System" value="Active" highlight />
                <AuthRow label="Replay Protection" value="Enabled" highlight />
              </div>
            </div>

            {/* Recent Activity */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #DDE3EA",
                borderRadius: "10px",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #DDE3EA", display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1" y="1" width="11" height="11" rx="2" stroke="#5A7080" strokeWidth="1.2" />
                  <path d="M4 4.5h5M4 6.5h5M4 8.5h3" stroke="#5A7080" strokeWidth="1" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#0E1C29", letterSpacing: "0.04em" }}>
                  Recent Activity
                </span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #DDE3EA" }}>
                    {["Time", "Event", "Result"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 20px",
                          textAlign: h === "Result" ? "right" : "left",
                          fontSize: "10px",
                          fontWeight: 600,
                          color: "#8A9BAB",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {device.auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: "24px 20px", textAlign: "center", fontSize: "12px", color: "#8A9BAB" }}>
                        No recent activity
                      </td>
                    </tr>
                  ) : (
                    device.auditLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid #DDE3EA" }}>
                        <td style={{ padding: "9px 20px", fontSize: "12px", color: "#5A7080", fontFamily: "var(--font-mono, monospace)", whiteSpace: "nowrap" }}>
                          {new Date(log.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={{ padding: "9px 20px", fontSize: "13px", color: "#0E1C29" }}>{log.event}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right" }}>
                          <ResultBadge result={log.result} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetaRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <span style={{ fontSize: "11px", color: "#8A9BAB" }}>{label}</span>
      <span
        style={{
          fontSize: "13px",
          color: highlight ? "#00875A" : "#0E1C29",
          fontFamily: mono ? "var(--font-mono, monospace)" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function AuthRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "12px", color: "#5A7080" }}>{label}</span>
      <span style={{ fontSize: "12px", color: highlight ? "#00875A" : "#0E1C29", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

const RESULT_COLORS: Record<string, string> = {
  success: "#00875A",
  executed: "#0E1C29",
  failed: "#FF3355",
  pending: "#FFA800",
};

function ResultBadge({ result }: { result: string }) {
  const color = RESULT_COLORS[result] ?? "#5A7080";
  const label = result.charAt(0).toUpperCase() + result.slice(1);
  return (
    <span style={{ fontSize: "12px", fontWeight: 600, color }}>
      {label}
    </span>
  );
}
