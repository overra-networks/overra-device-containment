"use client";

import Link from "next/link";

interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  adminEmail: string;
  ipAddress: string | null;
  createdAt: string;
}

interface Props {
  logs: AuditRow[];
  total: number;
  currentPage: number;
  pageSize: number;
}

const cell: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "12px",
  color: "#0E1C29",
  borderBottom: "1px solid #EEF1F4",
  textAlign: "left",
  verticalAlign: "top",
};

export function AdminAuditTable({
  logs,
  total,
  currentPage,
  pageSize,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #DDE3EA",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#F7F9FB" }}>
            {["When", "Admin", "Action", "Target", "IP"].map((h) => (
              <th
                key={h}
                style={{
                  ...cell,
                  fontWeight: 600,
                  color: "#5A7080",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 && (
            <tr>
              <td
                colSpan={5}
                style={{ ...cell, textAlign: "center", color: "#5A7080" }}
              >
                No admin actions recorded yet.
              </td>
            </tr>
          )}
          {logs.map((l) => (
            <tr key={l.id}>
              <td style={cell}>
                {new Date(l.createdAt).toLocaleString()}
              </td>
              <td style={cell}>{l.adminEmail}</td>
              <td style={cell}>
                <code
                  style={{
                    fontSize: "11px",
                    color: "#B3122E",
                    fontWeight: 600,
                  }}
                >
                  {l.action}
                </code>
              </td>
              <td style={cell}>
                {l.targetType === "user" ? (
                  <Link
                    href={`/admin/users/${l.targetId}`}
                    style={{ color: "#0E1C29" }}
                  >
                    user:{l.targetId.slice(0, 8)}…
                  </Link>
                ) : (
                  <Link
                    href={`/admin/devices/${l.targetId}`}
                    style={{ color: "#0E1C29" }}
                  >
                    device:{l.targetId.slice(0, 8)}…
                  </Link>
                )}
              </td>
              <td style={{ ...cell, color: "#5A7080" }}>
                {l.ipAddress || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "12px",
          borderTop: "1px solid #DDE3EA",
          fontSize: "12px",
          color: "#5A7080",
        }}
      >
        <span>
          {total} action{total === 1 ? "" : "s"} · page {currentPage}/
          {totalPages}
        </span>
        <span style={{ display: "flex", gap: "8px" }}>
          {currentPage > 1 && (
            <Link
              href={`/admin/audit-logs?page=${currentPage - 1}`}
              style={{ color: "#0E1C29", fontWeight: 600 }}
            >
              ← Prev
            </Link>
          )}
          {currentPage < totalPages && (
            <Link
              href={`/admin/audit-logs?page=${currentPage + 1}`}
              style={{ color: "#0E1C29", fontWeight: 600 }}
            >
              Next →
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}
