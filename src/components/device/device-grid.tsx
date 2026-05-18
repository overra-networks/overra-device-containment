"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Monitor, Wifi, WifiOff } from "lucide-react";
import { useDeviceStore, DeviceBasic } from "@/store/device-store";
import { useSSE } from "@/hooks/use-sse";
import { formatTimestamp } from "@/lib/utils";

interface DeviceGridProps {
  initialDevices: DeviceBasic[];
}

export function DeviceGrid({ initialDevices }: DeviceGridProps) {
  const { devices, setDevices } = useDeviceStore();
  useSSE();

  useEffect(() => {
    setDevices(initialDevices);
  }, [initialDevices, setDevices]);

  const list = devices.length > 0 ? devices : initialDevices;

  if (list.length === 0) {
    return (
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
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "10px",
            background: "#FFFFFF",
            border: "1px solid #DDE3EA",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "16px",
          }}
        >
          <Monitor style={{ width: "20px", height: "20px", color: "#8A9BAB" }} />
        </div>
        <p style={{ fontSize: "14px", fontWeight: 500, color: "#0E1C29", marginBottom: "6px" }}>
          No endpoints registered
        </p>
        <p style={{ fontSize: "13px", color: "#5A7080", maxWidth: "320px" }}>
          Go to{" "}
          <Link href="/downloads" style={{ color: "#2B5F8A", textDecoration: "none" }}>
            Downloads
          </Link>{" "}
          to generate an installer token and enroll an endpoint.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "14px",
      }}
    >
      {list.map((device) => (
        <DeviceCard key={device.id} device={device} />
      ))}
    </div>
  );
}

const STATUS_COLORS: Record<DeviceBasic["status"], string> = {
  normal: "#2B5F8A",
  contained: "#FF3355",
  offline: "#8A9BAB",
  pending: "#FFA800",
};

const STATUS_BG: Record<DeviceBasic["status"], string> = {
  normal: "rgba(43,95,138,0.08)",
  contained: "rgba(255,51,85,0.08)",
  offline: "rgba(138,155,171,0.15)",
  pending: "rgba(255,168,0,0.08)",
};

function DeviceCard({ device }: { device: DeviceBasic }) {
  const isOnline =
    device.lastHeartbeat &&
    new Date(device.lastHeartbeat) > new Date(Date.now() - 2 * 60 * 1000);

  const statusColor = STATUS_COLORS[device.status];

  return (
    <Link
      href={`/devices/${device.id}`}
      style={{ textDecoration: "none", display: "block" }}
    >
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #DDE3EA",
          borderLeft: `3px solid ${statusColor}`,
          borderRadius: "10px",
          padding: "16px",
          transition: "all 0.15s",
          cursor: "pointer",
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#C4CDD7";
          (e.currentTarget as HTMLElement).style.borderLeftColor = statusColor;
          (e.currentTarget as HTMLElement).style.background = "#FAFAFA";
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#DDE3EA";
          (e.currentTarget as HTMLElement).style.borderLeftColor = statusColor;
          (e.currentTarget as HTMLElement).style.background = "#FFFFFF";
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "#0E1C29",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginBottom: "2px",
              }}
            >
              {device.name}
            </p>
            <p
              style={{
                fontSize: "11px",
                color: "#5A7080",
                fontFamily: "var(--font-mono, monospace)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {device.hostname}
            </p>
          </div>

          {/* Status pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "3px 8px",
              borderRadius: "20px",
              background: STATUS_BG[device.status],
              flexShrink: 0,
              marginLeft: "8px",
            }}
          >
            <div
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: statusColor,
              }}
            />
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: statusColor,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {device.status}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #DDE3EA", marginBottom: "12px" }} />

        {/* Detail rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#8A9BAB" }}>Platform</span>
            <span style={{ fontSize: "11px", color: "#0E1C29" }}>{device.os}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#8A9BAB" }}>Agent</span>
            <span
              style={{
                fontSize: "11px",
                color: "#5A7080",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {device.agentVersion}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              style={{
                fontSize: "11px",
                color: "#8A9BAB",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {isOnline ? (
                <Wifi style={{ width: "10px", height: "10px", color: "#2B5F8A" }} />
              ) : (
                <WifiOff style={{ width: "10px", height: "10px", color: "#8A9BAB" }} />
              )}
              Last seen
            </span>
            <span style={{ fontSize: "11px", color: "#5A7080" }}>
              {device.lastHeartbeat ? formatTimestamp(device.lastHeartbeat) : "Never"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
