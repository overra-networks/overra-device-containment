"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useDeviceStore, DeviceBasic, AuditLogEntry } from "@/store/device-store";
import { useSSE } from "@/hooks/use-sse";
import { toast } from "@/hooks/use-toast";
import { truncateAddress } from "@/lib/utils";

interface Props {
  device: DeviceBasic;
  logs: AuditLogEntry[];
  userWalletAddress: string | null;
}

export function AuthorityView({ device: initialDevice, logs: initialLogs, userWalletAddress }: Props) {
  const router = useRouter();
  useSSE();

  const { currentDevice, setCurrentDevice, setLogs, logs } = useDeviceStore();
  const [acting, setActing] = useState(false);

  const device = currentDevice?.id === initialDevice.id ? currentDevice : initialDevice;
  const displayLogs = logs.length > 0 && logs[0]?.deviceId === device.id ? logs : initialLogs;

  useEffect(() => {
    setCurrentDevice(initialDevice);
    setLogs(initialLogs);
    return () => setCurrentDevice(null);
  }, [initialDevice, initialLogs, setCurrentDevice, setLogs]);

  const handleSetWalletAuthority = useCallback(async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/devices/${device.id}/wallet-authority`, { method: "PUT" });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Failed to set wallet authority", variant: "error" });
        return;
      }
      const updated = { ...device, walletAuthority: data.walletAuthority };
      setCurrentDevice(updated);
      useDeviceStore.getState().setDevices(
        useDeviceStore.getState().devices.map((d) =>
          d.id === device.id ? { ...d, walletAuthority: data.walletAuthority } : d
        )
      );
      toast({ title: "Wallet authority set", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Failed to set wallet authority", variant: "error" });
    } finally {
      setActing(false);
    }
  }, [device, setCurrentDevice, router]);

  const handleClearWalletAuthority = useCallback(async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/devices/${device.id}/wallet-authority`, { method: "DELETE" });
      if (!res.ok) {
        toast({ title: "Failed to clear wallet authority", variant: "error" });
        return;
      }
      const updated = { ...device, walletAuthority: null };
      setCurrentDevice(updated);
      useDeviceStore.getState().setDevices(
        useDeviceStore.getState().devices.map((d) =>
          d.id === device.id ? { ...d, walletAuthority: null } : d
        )
      );
      toast({ title: "Wallet authority cleared", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Failed to clear wallet authority", variant: "error" });
    } finally {
      setActing(false);
    }
  }, [device, setCurrentDevice, router]);

  const RESULT_COLORS: Record<string, string> = {
    success: "#00875A",
    executed: "#0E1C29",
    failed: "#FF3355",
    pending: "#FFA800",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Registered Authority */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #DDE3EA",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#0E1C29", marginBottom: "4px" }}>
                Registered Authority
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
              {device.walletAuthority ? (
                <button
                  onClick={handleClearWalletAuthority}
                  disabled={acting}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,51,85,0.3)",
                    background: "transparent",
                    color: "#FF3355",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: acting ? "not-allowed" : "pointer",
                    opacity: acting ? 0.6 : 1,
                    transition: "all 0.15s",
                  }}
                >
                  {acting ? <Loader2 style={{ width: "12px", height: "12px" }} className="animate-spin" /> : null}
                  Remove Authority
                </button>
              ) : userWalletAddress ? (
                <button
                  onClick={handleSetWalletAuthority}
                  disabled={acting}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "none",
                    background: "#0E1C29",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: acting ? "not-allowed" : "pointer",
                    opacity: acting ? 0.6 : 1,
                    transition: "all 0.15s",
                  }}
                >
                  {acting ? <Loader2 style={{ width: "12px", height: "12px" }} className="animate-spin" /> : null}
                  Request Authority Update
                </button>
              ) : null}
              {device.walletAuthority && (
                <span style={{ fontSize: "11px", color: "#8A9BAB", fontFamily: "var(--font-mono, monospace)" }}>
                  Authority update requires wallet signature.
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <AuthRow label="Wallet Address" value={device.walletAuthority ? truncateAddress(device.walletAuthority, 8) : "Not configured"} mono />
            <AuthRow
              label="Date Registered"
              value={device.lastAuthorization
                ? new Date(device.lastAuthorization).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
                : "Never"}
            />
            <AuthRow
              label="Last Verified"
              value={device.lastHeartbeat
                ? new Date(device.lastHeartbeat).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
                : "Never"}
            />
          </div>
        </div>
      </div>

      {/* Authorization Rules */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #DDE3EA",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #DDE3EA", display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="2" stroke="#5A7080" strokeWidth="1.2" />
            <path d="M4 4.5h6M4 7h6M4 9.5h4" stroke="#5A7080" strokeWidth="1" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#0E1C29", letterSpacing: "0.04em" }}>
            Authorization Rules
          </span>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <RuleRow label="Expiration Window" value="60 seconds" />
          <RuleRow label="Nonce Replay Protection" value="Enabled" highlight />
          <RuleRow label="Timestamp Validation" value="Enabled" highlight />
        </div>
      </div>

      {/* State Transition History */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #DDE3EA",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #DDE3EA", display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="2" stroke="#5A7080" strokeWidth="1.2" />
            <path d="M4 4.5h6M4 7h6M4 9.5h4" stroke="#5A7080" strokeWidth="1" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#0E1C29", letterSpacing: "0.04em" }}>
            State Transition History
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #DDE3EA" }}>
              {["Time", "Event", "Result"].map((h) => (
                <th key={h} style={{
                  padding: "8px 20px",
                  textAlign: h === "Result" ? "right" : "left",
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#8A9BAB",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontFamily: "var(--font-mono, monospace)",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayLogs.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: "28px 20px", textAlign: "center", fontSize: "12px", color: "#8A9BAB" }}>
                  No transitions recorded
                </td>
              </tr>
            ) : (
              displayLogs.map((log) => {
                const color = RESULT_COLORS[log.result] ?? "#5A7080";
                return (
                  <tr key={log.id} style={{ borderBottom: "1px solid #DDE3EA" }}>
                    <td style={{ padding: "10px 20px", fontSize: "12px", color: "#5A7080", fontFamily: "var(--font-mono, monospace)", whiteSpace: "nowrap" }}>
                      {new Date(log.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={{ padding: "10px 20px", fontSize: "13px", color: "#0E1C29" }}>{log.event}</td>
                    <td style={{ padding: "10px 20px", textAlign: "right" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color }}>{log.result.charAt(0).toUpperCase() + log.result.slice(1)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuthRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "13px", color: "#5A7080" }}>{label}</span>
      <span style={{ fontSize: "13px", color: "#0E1C29", fontFamily: mono ? "var(--font-mono, monospace)" : undefined }}>
        {value}
      </span>
    </div>
  );
}

function RuleRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "13px", color: "#5A7080" }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 500, color: highlight ? "#0E1C29" : "#0E1C29" }}>{value}</span>
    </div>
  );
}
