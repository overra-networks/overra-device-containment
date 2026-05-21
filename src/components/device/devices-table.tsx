"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useDeviceStore, DeviceBasic } from "@/store/device-store";
import { useSSE } from "@/hooks/use-sse";

interface Props {
  devices: DeviceBasic[];
  currentPage: number;
  totalPages: number;
  q: string;
}

const STATUS_COLORS: Record<DeviceBasic["status"], string> = {
  normal: "#00875A",
  contained: "#FF3355",
  offline: "#8A9BAB",
  pending: "#FFA800",
};

export function DevicesTable({ devices, currentPage, totalPages, q }: Props) {
  const router = useRouter();
  const { devices: storeDevices, setDevices } = useDeviceStore();
  useSSE();

  useEffect(() => {
    setDevices(devices);
  }, [devices, setDevices]);

  // Merge real-time updates from store
  const list = devices.map((d) => {
    const live = storeDevices.find((s) => s.id === d.id);
    return live ?? d;
  });

  function isOnline(device: DeviceBasic) {
    return (
      device.lastHeartbeat != null &&
      new Date(device.lastHeartbeat) > new Date(Date.now() - 2 * 60 * 1000)
    );
  }

  function handleRowClick(device: DeviceBasic) {
    useDeviceStore.getState().setCurrentDevice(device);
    router.push(`/overview?device=${device.id}`);
  }

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #DDE3EA",
        borderRadius: "10px",
        overflow: "hidden",
      }}
    >
      {/* Search bar */}
      <div
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid #DDE3EA",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <form method="get" action="/devices">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #DDE3EA",
              background: "#FFFFFF",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="5" cy="5" r="4" stroke="#8A9BAB" strokeWidth="1.2" />
              <path d="M8 8l2.5 2.5" stroke="#8A9BAB" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search..."
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "12px",
                color: "#0E1C29",
                width: "160px",
              }}
            />
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="table-scroll">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #DDE3EA" }}>
            {["Device Name", "Status", "Last Heartbeat", "Integrity Check", ""].map((h) => (
              <th
                key={h}
                style={{
                  padding: "10px 20px",
                  textAlign: "left",
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
          {list.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: "48px 20px", textAlign: "center", fontSize: "13px", color: "#8A9BAB" }}>
                {q ? "No devices match your search" : "No endpoints registered"}
              </td>
            </tr>
          ) : (
            list.map((device) => {
              const color = STATUS_COLORS[device.status];
              const online = isOnline(device);
              const heartbeatStr = device.lastHeartbeat
                ? formatRelative(new Date(device.lastHeartbeat))
                : "Never";

              return (
                <tr
                  key={device.id}
                  onClick={() => handleRowClick(device)}
                  style={{
                    borderBottom: "1px solid #DDE3EA",
                    cursor: "pointer",
                    transition: "background 0.12s",
                  }}
                  onMouseOver={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(14,28,41,0.03)";
                  }}
                  onMouseOut={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <td style={{ padding: "12px 20px" }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "#0E1C29", marginBottom: "2px" }}>
                      {device.name}
                    </p>
                    <p style={{ fontSize: "11px", color: "#5A7080", fontFamily: "var(--font-mono, monospace)" }}>
                      {device.hostname}
                    </p>
                  </td>
                  <td style={{ padding: "12px 20px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color,
                      }}
                    >
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      {device.status.charAt(0).toUpperCase() + device.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#5A7080" }}>
                    {heartbeatStr}
                  </td>
                  <td style={{ padding: "12px 20px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "12px",
                        fontWeight: 500,
                        color: online ? "#00875A" : "#FFA800",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path
                          d="M6.5 1.5L7.8 4.3L11 4.8L8.75 7L9.35 10.2L6.5 8.75L3.65 10.2L4.25 7L2 4.8L5.2 4.3L6.5 1.5Z"
                          stroke="currentColor"
                          strokeWidth="1"
                          fill="none"
                        />
                      </svg>
                      {online ? "Secure" : "Monitoring"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", textAlign: "right" }}>
                    <ChevronRight style={{ width: "14px", height: "14px", color: "#8A9BAB" }} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>

      {/* Pagination */}
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid #DDE3EA",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: "12px", color: "#8A9BAB" }}>
          Page {currentPage} of {totalPages}
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          {currentPage > 1 && (
            <a href={`/devices?page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`} style={paginationBtnStyle}>
              Previous
            </a>
          )}
          {currentPage < totalPages && (
            <a href={`/devices?page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`} style={paginationBtnStyle}>
              Next
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const paginationBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 12px",
  borderRadius: "6px",
  border: "1px solid #DDE3EA",
  background: "transparent",
  color: "#5A7080",
  fontSize: "12px",
  textDecoration: "none",
};

function formatRelative(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
