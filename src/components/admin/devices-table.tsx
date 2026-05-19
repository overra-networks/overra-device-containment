"use client";

import Link from "next/link";

interface DeviceRow {
  id: string;
  name: string;
  hostname: string;
  status: string;
  lastHeartbeat: string | null;
  ownerEmail: string;
  ownerId: string;
}

interface Props {
  devices: DeviceRow[];
  total: number;
  currentPage: number;
  pageSize: number;
  status: string;
}

const cell: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "13px",
  color: "#0E1C29",
  borderBottom: "1px solid #EEF1F4",
  textAlign: "left",
};

const STATUSES = ["", "normal", "contained", "offline", "pending"];

export function AdminDevicesTable({
  devices,
  total,
  currentPage,
  pageSize,
  status,
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
      <div
        style={{
          padding: "12px",
          borderBottom: "1px solid #DDE3EA",
          display: "flex",
          gap: "6px",
          flexWrap: "wrap",
        }}
      >
        {STATUSES.map((s) => (
          <Link
            key={s || "all"}
            href={`/admin/devices${s ? `?status=${s}` : ""}`}
            style={{
              fontSize: "12px",
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: "999px",
              textDecoration: "none",
              color: status === s ? "#FFFFFF" : "#5A7080",
              background: status === s ? "#0E1C29" : "rgba(90,112,128,0.1)",
            }}
          >
            {s || "all"}
          </Link>
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#F7F9FB" }}>
            {["Device", "Owner", "Status", "Last seen", ""].map((h) => (
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
          {devices.length === 0 && (
            <tr>
              <td
                colSpan={5}
                style={{ ...cell, textAlign: "center", color: "#5A7080" }}
              >
                No devices.
              </td>
            </tr>
          )}
          {devices.map((d) => (
            <tr key={d.id}>
              <td style={cell}>
                {d.name}
                <span style={{ color: "#5A7080" }}> · {d.hostname}</span>
              </td>
              <td style={cell}>
                <Link
                  href={`/admin/users/${d.ownerId}`}
                  style={{ color: "#5A7080" }}
                >
                  {d.ownerEmail}
                </Link>
              </td>
              <td style={cell}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    color:
                      d.status === "contained" ? "#B3122E" : "#5A7080",
                    background:
                      d.status === "contained"
                        ? "#FFF0F2"
                        : "rgba(90,112,128,0.1)",
                  }}
                >
                  {d.status}
                </span>
              </td>
              <td style={cell}>
                {d.lastHeartbeat
                  ? new Date(d.lastHeartbeat).toLocaleString()
                  : "—"}
              </td>
              <td style={cell}>
                <Link
                  href={`/admin/devices/${d.id}`}
                  style={{ color: "#0E1C29", fontWeight: 600 }}
                >
                  Manage
                </Link>
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
          {total} device{total === 1 ? "" : "s"} · page {currentPage}/
          {totalPages}
        </span>
        <span style={{ display: "flex", gap: "8px" }}>
          {currentPage > 1 && (
            <Link
              href={`/admin/devices?page=${currentPage - 1}${
                status ? `&status=${status}` : ""
              }`}
              style={{ color: "#0E1C29", fontWeight: 600 }}
            >
              ← Prev
            </Link>
          )}
          {currentPage < totalPages && (
            <Link
              href={`/admin/devices?page=${currentPage + 1}${
                status ? `&status=${status}` : ""
              }`}
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
