"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Wifi,
  Users,
  Puzzle,
  Monitor,
  Shield,
  ShieldAlert,
  Loader2,
  ChevronLeft,
  CheckCircle2,
  PlayCircle,
  XCircle,
  Clock,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { useDeviceStore, DeviceBasic, AuditLogEntry } from "@/store/device-store";
import { useSSE } from "@/hooks/use-sse";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { truncateAddress, formatTimeOnly, formatTimestamp } from "@/lib/utils";
import Link from "next/link";

interface Props {
  device: DeviceBasic & {
    containmentConfig: DeviceBasic["containmentConfig"];
  };
  logs: AuditLogEntry[];
}

export function DeviceDetailView({ device: initialDevice, logs: initialLogs }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  useSSE();

  const { currentDevice, setCurrentDevice, setLogs, logs } = useDeviceStore();
  const [acting, setActing] = useState(false);
  const [configSaving, setConfigSaving] = useState<string | null>(null);
  const [walletActing, setWalletActing] = useState(false);

  const device = currentDevice ?? initialDevice;

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

  const handleToggle = useCallback(
    async (field: keyof typeof config, value: boolean) => {
      setConfigSaving(field);
      try {
        const res = await fetch(
          `/api/devices/${device.id}/containment/config`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [snakeCase(field)]: value }),
          }
        );
        if (!res.ok) throw new Error("Failed to save config");
        useDeviceStore.getState().updateConfig(device.id, { [field]: value });
      } catch {
        toast({ title: "Failed to save configuration", variant: "error" });
      } finally {
        setConfigSaving(null);
      }
    },
    [device.id]
  );

  const handleContainmentAction = useCallback(
    async (action: "enter" | "release") => {
      setActing(true);
      try {
        const message = `Overra Containment ${action === "enter" ? "Activate" : "Release"}: device=${device.id} ts=${Date.now()}`;
        let signature: string | undefined;

        if (device.walletAuthority && typeof window !== "undefined" && (window as any).ethereum) {
          try {
            const accounts: string[] = await (window as any).ethereum.request({
              method: "eth_requestAccounts",
            });

            if (accounts[0]?.toLowerCase() !== device.walletAuthority.toLowerCase()) {
              toast({
                title: "Wrong wallet",
                description: `Connect wallet ${truncateAddress(device.walletAuthority)} to authorize`,
                variant: "error",
              });
              return;
            }

            signature = await (window as any).ethereum.request({
              method: "personal_sign",
              params: [message, accounts[0]],
            });

            toast({ title: "Wallet signature verified", variant: "success" });
          } catch {
            toast({
              title: "Wallet signature required",
              description: "Please approve the signature in MetaMask",
              variant: "error",
            });
            return;
          }
        }

        const res = await fetch(
          `/api/devices/${device.id}/containment/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(signature ? { signature, message } : {}),
          }
        );

        const data = await res.json();
        if (!res.ok) {
          toast({ title: data.error || "Action failed", variant: "error" });
          return;
        }

        const newStatus = action === "enter" ? "contained" : "normal";
        useDeviceStore.getState().updateDeviceStatus(device.id, newStatus);
        setCurrentDevice({ ...device, status: newStatus });

        toast({
          title: action === "enter" ? "Containment activated" : "Containment released",
          variant: "success",
        });

        router.refresh();
      } catch {
        toast({ title: "Unexpected error", variant: "error" });
      } finally {
        setActing(false);
      }
    },
    [device, router, setCurrentDevice]
  );

  const handleSetWalletAuthority = useCallback(async () => {
    setWalletActing(true);
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
    } catch {
      toast({ title: "Failed to set wallet authority", variant: "error" });
    } finally {
      setWalletActing(false);
    }
  }, [device, setCurrentDevice]);

  const handleClearWalletAuthority = useCallback(async () => {
    setWalletActing(true);
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
    } catch {
      toast({ title: "Failed to clear wallet authority", variant: "error" });
    } finally {
      setWalletActing(false);
    }
  }, [device, setCurrentDevice]);

  const isContained = device.status === "contained";
  const displayLogs = logs.length > 0 ? logs : initialLogs;
  const statusColor = isContained ? "#FF3355" : "#2B5F8A";
  const userWallet = (session?.user as any)?.walletAddress as string | null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Link
          href="/dashboard"
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
            textDecoration: "none",
            flexShrink: 0,
            transition: "all 0.15s",
          }}
        >
          <ChevronLeft style={{ width: "16px", height: "16px" }} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ fontSize: "18px", fontWeight: 600, color: "#0E1C29" }}>
              {device.name}
            </h1>
            {/* Inline status indicator */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 8px",
                borderRadius: "20px",
                background: isContained ? "rgba(255,51,85,0.1)" : "rgba(43,95,138,0.08)",
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
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {device.status}
              </span>
            </div>
          </div>
          <p
            style={{
              fontSize: "12px",
              color: "#5A7080",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {device.hostname}
          </p>
        </div>

        {device.walletAuthority && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 10px",
              borderRadius: "6px",
              background: "#FFFFFF",
              border: "1px solid #DDE3EA",
            }}
          >
            <span
              style={{
                fontSize: "9px",
                color: "#8A9BAB",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              wallet
            </span>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono, monospace)",
                color: "#5A7080",
              }}
            >
              {truncateAddress(device.walletAuthority, 4)}
            </span>
          </div>
        )}
      </div>

      {/* Two-column grid: Status + Config */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Device Status card */}
        <Card
          style={{
            borderColor: isContained ? "rgba(255,51,85,0.3)" : "rgba(43,95,138,0.2)",
            background: isContained
              ? "linear-gradient(180deg, rgba(255,51,85,0.04) 0%, #FFFFFF 60%)"
              : "linear-gradient(180deg, rgba(43,95,138,0.03) 0%, #FFFFFF 60%)",
          }}
        >
          <CardHeader>
            <CardTitle>Device Status</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Status focal point */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "24px 16px 20px",
              }}
            >
              {/* Concentric rings */}
              <div style={{ position: "relative", marginBottom: "16px" }}>
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "50%",
                    border: `1px solid ${isContained ? "rgba(255,51,85,0.25)" : "rgba(43,95,138,0.2)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      background: isContained ? "rgba(255,51,85,0.12)" : "rgba(43,95,138,0.08)",
                      border: `1px solid ${isContained ? "rgba(255,51,85,0.4)" : "rgba(43,95,138,0.3)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        background: statusColor,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontFamily: "var(--font-display, sans-serif)",
                  fontSize: "24px",
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  color: statusColor,
                  marginBottom: "2px",
                }}
              >
                {device.status.toUpperCase()}
              </div>
              <div
                style={{
                  fontSize: "9px",
                  color: "#8A9BAB",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                Current State
              </div>
            </div>

            {/* Info rows */}
            <div style={{ borderTop: "1px solid #DDE3EA", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Wallet Authority — interactive row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "24px" }}>
                <span style={{ fontSize: "12px", color: "#8A9BAB" }}>Wallet Authority</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {device.walletAuthority ? (
                    <>
                      <span style={{ fontSize: "12px", color: "#5A7080", fontFamily: "var(--font-mono, monospace)" }}>
                        {truncateAddress(device.walletAuthority, 4)}
                      </span>
                      <button
                        onClick={handleClearWalletAuthority}
                        disabled={walletActing}
                        title="Remove wallet authority"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "2px 7px",
                          borderRadius: "4px",
                          border: "1px solid rgba(255,51,85,0.3)",
                          background: "transparent",
                          color: "#FF3355",
                          fontSize: "10px",
                          fontWeight: 500,
                          cursor: walletActing ? "not-allowed" : "pointer",
                          opacity: walletActing ? 0.6 : 1,
                        }}
                      >
                        {walletActing ? (
                          <Loader2 style={{ width: "10px", height: "10px" }} className="animate-spin" />
                        ) : (
                          <ShieldOff style={{ width: "10px", height: "10px" }} />
                        )}
                        Remove
                      </button>
                    </>
                  ) : userWallet ? (
                    <button
                      onClick={handleSetWalletAuthority}
                      disabled={walletActing}
                      title={`Set ${truncateAddress(userWallet, 4)} as authority`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 7px",
                        borderRadius: "4px",
                        border: "1px solid rgba(14,28,41,0.22)",
                        background: "transparent",
                        color: "#0E1C29",
                        fontSize: "10px",
                        fontWeight: 500,
                        cursor: walletActing ? "not-allowed" : "pointer",
                        opacity: walletActing ? 0.6 : 1,
                      }}
                    >
                      {walletActing ? (
                        <Loader2 style={{ width: "10px", height: "10px" }} className="animate-spin" />
                      ) : (
                        <ShieldCheck style={{ width: "10px", height: "10px" }} />
                      )}
                      Set wallet
                    </button>
                  ) : (
                    <span style={{ fontSize: "11px", color: "#8A9BAB", fontStyle: "italic" }}>
                      Link wallet in Settings
                    </span>
                  )}
                </div>
              </div>

              <InfoRow
                label="Last Authorization"
                value={device.lastAuthorization ? formatTimestamp(device.lastAuthorization) : "Never"}
              />
              <InfoRow label="Agent Version" value={device.agentVersion} mono />
            </div>
          </CardContent>
        </Card>

        {/* Containment Configuration card */}
        <Card>
          <CardHeader>
            <CardTitle>Containment Configuration</CardTitle>
          </CardHeader>
          <CardContent style={{ paddingTop: "4px" }}>
            <ConfigToggle
              icon={<Wifi style={{ width: "14px", height: "14px" }} />}
              label="Disable Network"
              description="Terminates all network connectivity"
              checked={config.disableNetwork}
              onChange={(v) => handleToggle("disableNetwork", v)}
              saving={configSaving === "disableNetwork"}
            />
            <ConfigToggle
              icon={<Users style={{ width: "14px", height: "14px" }} />}
              label="Revoke Sessions"
              description="Invalidates all authenticated sessions"
              checked={config.revokeSessions}
              onChange={(v) => handleToggle("revokeSessions", v)}
              saving={configSaving === "revokeSessions"}
            />
            <ConfigToggle
              icon={<Puzzle style={{ width: "14px", height: "14px" }} />}
              label="Freeze Extensions"
              description="Suspends browser extension activity"
              checked={config.freezeExtensions}
              onChange={(v) => handleToggle("freezeExtensions", v)}
              saving={configSaving === "freezeExtensions"}
            />
            <ConfigToggle
              icon={<Monitor style={{ width: "14px", height: "14px" }} />}
              label="Lock Screen"
              description="Activates system screen lock"
              checked={config.lockScreen}
              onChange={(v) => handleToggle("lockScreen", v)}
              saving={configSaving === "lockScreen"}
            />
          </CardContent>
        </Card>
      </div>

      {/* Containment Control */}
      <Card>
        <CardHeader>
          <CardTitle>Containment Control</CardTitle>
        </CardHeader>
        <CardContent style={{ paddingBottom: "24px" }}>
          <button
            onClick={() => handleContainmentAction(isContained ? "release" : "enter")}
            disabled={acting}
            style={{
              width: "100%",
              height: "58px",
              borderRadius: "10px",
              border: isContained ? "1px solid #DDE3EA" : "none",
              cursor: acting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              fontFamily: "var(--font-display, sans-serif)",
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: isContained ? "transparent" : "#FF3355",
              color: isContained ? "#0E1C29" : "#ffffff",
              opacity: acting ? 0.6 : 1,
              transition: "all 0.15s",
            }}
            onMouseOver={(e) => {
              if (!acting) {
                if (isContained) {
                  (e.currentTarget as HTMLElement).style.background = "#FFFFFF";
                  (e.currentTarget as HTMLElement).style.borderColor = "#C4CDD7";
                } else {
                  (e.currentTarget as HTMLElement).style.background = "#E8263C";
                }
              }
            }}
            onMouseOut={(e) => {
              if (!acting) {
                if (isContained) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.borderColor = "#DDE3EA";
                } else {
                  (e.currentTarget as HTMLElement).style.background = "#FF3355";
                }
              }
            }}
          >
            {acting ? (
              <>
                <Loader2 style={{ width: "18px", height: "18px" }} className="animate-spin" />
                {isContained ? "Releasing..." : "Containing..."}
              </>
            ) : isContained ? (
              <>
                <Shield style={{ width: "18px", height: "18px" }} />
                Release Containment
              </>
            ) : (
              <>
                <ShieldAlert style={{ width: "18px", height: "18px" }} />
                Initiate Containment
              </>
            )}
          </button>
          <p
            style={{
              textAlign: "center",
              marginTop: "10px",
              fontSize: "11px",
              color: "#8A9BAB",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {device.walletAuthority
              ? "Requires EIP-191 wallet signature"
              : "No wallet authority — action will execute without cryptographic verification"}
          </p>
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle>Authorization & Enforcement Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #DDE3EA" }}>
                  <th style={{ textAlign: "left", padding: "10px 20px", fontSize: "10px", fontWeight: 600, color: "#8A9BAB", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono, monospace)" }}>
                    Timestamp
                  </th>
                  <th style={{ textAlign: "left", padding: "10px 20px", fontSize: "10px", fontWeight: 600, color: "#8A9BAB", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono, monospace)" }}>
                    Event
                  </th>
                  <th style={{ textAlign: "right", padding: "10px 20px", fontSize: "10px", fontWeight: 600, color: "#8A9BAB", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono, monospace)" }}>
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      style={{ textAlign: "center", padding: "40px 20px", color: "#8A9BAB", fontSize: "12px", fontFamily: "var(--font-mono, monospace)" }}
                    >
                      No events recorded
                    </td>
                  </tr>
                ) : (
                  displayLogs.map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: "12px", color: "#8A9BAB" }}>{label}</span>
      <span
        style={{
          fontSize: "12px",
          color: "#5A7080",
          fontFamily: mono ? "var(--font-mono, monospace)" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ConfigToggle({
  icon,
  label,
  description,
  checked,
  onChange,
  saving,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  saving: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        borderBottom: "1px solid #DDE3EA",
      }}
      className="last:border-0"
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <div
          style={{
            marginTop: "1px",
            width: "28px",
            height: "28px",
            borderRadius: "6px",
            background: "#FFFFFF",
            border: "1px solid #DDE3EA",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#5A7080",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <p style={{ fontSize: "13px", fontWeight: 500, color: "#0E1C29", marginBottom: "2px" }}>
            {label}
          </p>
          <p style={{ fontSize: "11px", color: "#8A9BAB" }}>{description}</p>
        </div>
      </div>
      <div style={{ flexShrink: 0, marginLeft: "12px" }}>
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#0E1C29" }} />
        ) : (
          <Switch checked={checked} onCheckedChange={onChange} />
        )}
      </div>
    </div>
  );
}

function LogRow({ log }: { log: AuditLogEntry }) {
  const resultConfig: Record<
    AuditLogEntry["result"],
    { icon: React.ReactNode; label: string; color: string }
  > = {
    success: {
      icon: <CheckCircle2 style={{ width: "13px", height: "13px" }} />,
      label: "Success",
      color: "#00875A",
    },
    executed: {
      icon: <PlayCircle style={{ width: "13px", height: "13px" }} />,
      label: "Executed",
      color: "#0E1C29",
    },
    failed: {
      icon: <XCircle style={{ width: "13px", height: "13px" }} />,
      label: "Failed",
      color: "#FF3355",
    },
    pending: {
      icon: <Clock style={{ width: "13px", height: "13px" }} />,
      label: "Pending",
      color: "#FFA800",
    },
  };

  const rc = resultConfig[log.result];

  return (
    <tr
      style={{ borderBottom: "1px solid #DDE3EA" }}
    >
      <td
        style={{
          padding: "10px 20px",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "12px",
          color: "#8A9BAB",
          whiteSpace: "nowrap",
        }}
      >
        {formatTimeOnly(log.timestamp)}
      </td>
      <td style={{ padding: "10px 20px", fontSize: "13px", color: "#0E1C29" }}>
        {log.event}
      </td>
      <td style={{ padding: "10px 20px", textAlign: "right" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "12px",
            fontWeight: 500,
            color: rc.color,
          }}
        >
          {rc.icon}
          {rc.label}
        </span>
      </td>
    </tr>
  );
}

function snakeCase(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toLowerCase();
}
