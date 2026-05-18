"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Wifi, Users, Puzzle, Monitor, Loader2, CheckSquare, Square } from "lucide-react";
import { useDeviceStore, DeviceBasic, AuditLogEntry } from "@/store/device-store";
import { useSSE } from "@/hooks/use-sse";
import { toast } from "@/hooks/use-toast";
import { truncateAddress } from "@/lib/utils";

interface Props {
  device: DeviceBasic & { containmentConfig: DeviceBasic["containmentConfig"] };
  logs: AuditLogEntry[];
}

const RESULT_COLORS: Record<string, string> = {
  success: "#00875A",
  executed: "#0E1C29",
  failed: "#FF3355",
  pending: "#FFA800",
  "Containment Activated": "#0E1C29",
  Received: "#FFA800",
  Completed: "#0E1C29",
};

export function ContainmentView({ device: initialDevice, logs: initialLogs }: Props) {
  const router = useRouter();
  useSSE();

  const { currentDevice, setCurrentDevice, setLogs, logs } = useDeviceStore();
  const [acting, setActing] = useState(false);
  const [configSaving, setConfigSaving] = useState<string | null>(null);

  const device = currentDevice?.id === initialDevice.id ? currentDevice : initialDevice;
  const displayLogs = logs.length > 0 && logs[0]?.deviceId === device.id ? logs : initialLogs;

  useEffect(() => {
    setCurrentDevice(initialDevice);
    setLogs(initialLogs);
    return () => setCurrentDevice(null);
  }, [initialDevice, initialLogs, setCurrentDevice, setLogs]);

  const config = device.containmentConfig ?? {
    disableNetwork: true,
    revokeSessions: true,
    freezeExtensions: true,
    lockScreen: true,
  };

  const isContained = device.status === "contained";

  const handleContainmentAction = useCallback(
    async (action: "enter" | "release") => {
      setActing(true);
      try {
        const message = `Overra Containment ${action === "enter" ? "Activate" : "Release"}: device=${device.id} ts=${Date.now()}`;
        let signature: string | undefined;

        if (device.walletAuthority && typeof window !== "undefined" && (window as any).ethereum) {
          try {
            const accounts: string[] = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
            if (accounts[0]?.toLowerCase() !== device.walletAuthority.toLowerCase()) {
              toast({ title: "Wrong wallet", description: `Connect wallet ${truncateAddress(device.walletAuthority)} to authorize`, variant: "error" });
              return;
            }
            signature = await (window as any).ethereum.request({ method: "personal_sign", params: [message, accounts[0]] });
            toast({ title: "Wallet signature verified", variant: "success" });
          } catch {
            toast({ title: "Wallet signature required", description: "Please approve the signature in MetaMask", variant: "error" });
            return;
          }
        }

        const res = await fetch(`/api/devices/${device.id}/containment/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(signature ? { signature, message } : {}),
        });

        const data = await res.json();
        if (!res.ok) {
          toast({ title: data.error || "Action failed", variant: "error" });
          return;
        }

        const newStatus = action === "enter" ? "contained" : "normal";
        useDeviceStore.getState().updateDeviceStatus(device.id, newStatus);
        setCurrentDevice({ ...device, status: newStatus });
        toast({ title: action === "enter" ? "Containment activated" : "Containment released", variant: "success" });
        router.refresh();
      } catch {
        toast({ title: "Unexpected error", variant: "error" });
      } finally {
        setActing(false);
      }
    },
    [device, router, setCurrentDevice]
  );

  const handleToggle = useCallback(
    async (field: keyof NonNullable<DeviceBasic["containmentConfig"]>, value: boolean) => {
      setConfigSaving(field);
      try {
        const res = await fetch(`/api/devices/${device.id}/containment/config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [snakeCase(field)]: value }),
        });
        if (!res.ok) throw new Error();
        useDeviceStore.getState().updateConfig(device.id, { [field]: value });
      } catch {
        toast({ title: "Failed to save configuration", variant: "error" });
      } finally {
        setConfigSaving(null);
      }
    },
    [device.id]
  );

  const configItems = [
    { field: "disableNetwork" as const, icon: Wifi, label: "Disable Network Interfaces", checked: config.disableNetwork },
    { field: "revokeSessions" as const, icon: Users, label: "Revoke Active Sessions", checked: config.revokeSessions },
    { field: "freezeExtensions" as const, icon: Puzzle, label: "Freeze Critical Applications", checked: config.freezeExtensions },
    { field: "lockScreen" as const, icon: Monitor, label: "Lock System", checked: config.lockScreen },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Containment Action */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #DDE3EA",
          borderRadius: "10px",
          padding: "28px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <button
          onClick={() => handleContainmentAction(isContained ? "release" : "enter")}
          disabled={acting}
          style={{
            width: "340px",
            height: "52px",
            borderRadius: "8px",
            border: "none",
            cursor: acting ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            background: isContained ? "rgba(255,51,85,0.15)" : "#0E1C29",
            color: isContained ? "#FF3355" : "#ffffff",
            opacity: acting ? 0.6 : 1,
            transition: "all 0.15s",
          }}
        >
          {acting ? (
            <>
              <Loader2 style={{ width: "16px", height: "16px" }} className="animate-spin" />
              {isContained ? "Releasing..." : "Activating..."}
            </>
          ) : isContained ? (
            "RELEASE CONTAINMENT MODE"
          ) : (
            "ENTER CONTAINMENT MODE"
          )}
        </button>
        <p style={{ fontSize: "12px", color: "#5A7080", fontFamily: "var(--font-mono, monospace)" }}>
          {device.walletAuthority
            ? "Containment requires wallet signature verification."
            : "No wallet authority — action executes without cryptographic verification."}
        </p>
      </div>

      {/* Containment Configuration */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #DDE3EA",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #DDE3EA",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke="#5A7080" strokeWidth="1.2" />
            <path d="M4.5 7l1.8 1.8L9.5 5.2" stroke="#5A7080" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#0E1C29", letterSpacing: "0.04em" }}>
            Containment Configuration
          </span>
        </div>
        <div style={{ padding: "8px 0" }}>
          {configItems.map(({ field, icon: Icon, label, checked }) => (
            <div
              key={field}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "12px 20px",
                borderBottom: "1px solid #F5F5F5",
                cursor: "pointer",
              }}
              onClick={() => handleToggle(field, !checked)}
            >
              {configSaving === field ? (
                <Loader2 style={{ width: "16px", height: "16px", color: "#0E1C29", flexShrink: 0 }} className="animate-spin" />
              ) : checked ? (
                <CheckSquare style={{ width: "16px", height: "16px", color: "#0E1C29", flexShrink: 0 }} />
              ) : (
                <Square style={{ width: "16px", height: "16px", color: "#8A9BAB", flexShrink: 0 }} />
              )}
              <Icon style={{ width: "14px", height: "14px", color: "#5A7080", flexShrink: 0 }} />
              <span style={{ fontSize: "13px", color: checked ? "#0E1C29" : "#5A7080", fontWeight: 500 }}>
                {label}
              </span>
            </div>
          ))}
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
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #DDE3EA",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
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
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 600, color }}>
                        <span
                          style={{
                            width: "5px",
                            height: "5px",
                            borderRadius: "50%",
                            background: color,
                            display: "inline-block",
                            flexShrink: 0,
                          }}
                        />
                        {log.result.charAt(0).toUpperCase() + log.result.slice(1)}
                      </span>
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

function snakeCase(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toLowerCase();
}
