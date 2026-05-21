"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Config {
  disableNetwork: boolean;
  revokeSessions: boolean;
  freezeExtensions: boolean;
  lockScreen: boolean;
}
interface Device {
  id: string;
  name: string;
  status: string;
  ownerEmail: string;
  walletAuthority: string | null;
  config: Config;
}

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #DDE3EA",
  borderRadius: "8px",
  padding: "20px",
};

export function AdminDeviceControl({ device }: { device: Device }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [cfg, setCfg] = useState<Config>(device.config);

  const walletGated = !!device.walletAuthority;
  const contained = device.status === "contained";

  async function call(path: string, method: string, body?: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `${method} failed`);
      setMsg("Done.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {walletGated && (
        <div
          style={{
            ...card,
            borderColor: "#FFD8A8",
            background: "#FFF8EF",
            color: "#8A5A00",
            fontSize: "13px",
          }}
        >
          This device requires a wallet-authority signature owned by{" "}
          <strong>{device.ownerEmail}</strong>. Admin cannot produce that
          signature, so containment enter/release is unavailable here by
          design. Containment config can still be edited.
        </div>
      )}

      <div style={card}>
        <h2
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "#0E1C29",
            marginBottom: "4px",
          }}
        >
          Containment —{" "}
          <span style={{ color: contained ? "#B3122E" : "#5A7080" }}>
            {device.status}
          </span>
        </h2>
        <p
          style={{
            fontSize: "12px",
            color: "#5A7080",
            marginBottom: "14px",
          }}
        >
          Acting on a device owned by {device.ownerEmail}. This is logged to
          the admin audit trail.
        </p>

        {!contained ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "#5A7080" }}>
              Type <strong>CONTAIN</strong> to lock down this user&apos;s
              machine:
            </span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="CONTAIN"
                disabled={walletGated}
                style={{
                  padding: "8px 10px",
                  fontSize: "13px",
                  border: "1px solid #DDE3EA",
                  borderRadius: "6px",
                  outline: "none",
                }}
              />
              <button
                disabled={busy || walletGated || confirm !== "CONTAIN"}
                onClick={() =>
                  call(
                    `/api/admin/devices/${device.id}/containment/enter`,
                    "POST",
                    {}
                  )
                }
                style={{
                  padding: "9px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "none",
                  cursor:
                    busy || walletGated || confirm !== "CONTAIN"
                      ? "not-allowed"
                      : "pointer",
                  background:
                    busy || walletGated || confirm !== "CONTAIN"
                      ? "#C4CDD7"
                      : "#FF3355",
                  color: "#FFFFFF",
                }}
              >
                {busy ? "Working…" : "Enter containment"}
              </button>
            </div>
          </div>
        ) : (
          <button
            disabled={busy || walletGated}
            onClick={() =>
              call(
                `/api/admin/devices/${device.id}/containment/release`,
                "POST",
                {}
              )
            }
            style={{
              padding: "9px 18px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "6px",
              border: "1px solid #0E1C29",
              background: "transparent",
              color: "#0E1C29",
              cursor: busy || walletGated ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Working…" : "Release containment"}
          </button>
        )}
        {msg && (
          <p style={{ fontSize: "12px", color: "#5A7080", marginTop: "10px" }}>
            {msg}
          </p>
        )}
      </div>

      <div style={card}>
        <h2
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "#0E1C29",
            marginBottom: "12px",
          }}
        >
          Containment config
        </h2>
        {(
          [
            ["disableNetwork", "Disable network"],
            ["revokeSessions", "Revoke sessions"],
            ["freezeExtensions", "Freeze extensions"],
            ["lockScreen", "Lock screen"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "#0E1C29",
              padding: "6px 0",
            }}
          >
            <input
              type="checkbox"
              checked={cfg[key]}
              onChange={(e) =>
                setCfg({ ...cfg, [key]: e.target.checked })
              }
            />
            {label}
          </label>
        ))}
        <button
          disabled={busy}
          onClick={() =>
            call(
              `/api/admin/devices/${device.id}/containment/config`,
              "PUT",
              {
                disable_network: cfg.disableNetwork,
                revoke_sessions: cfg.revokeSessions,
                freeze_extensions: cfg.freezeExtensions,
                lock_screen: cfg.lockScreen,
              }
            )
          }
          style={{
            marginTop: "12px",
            padding: "9px 18px",
            fontSize: "13px",
            fontWeight: 600,
            borderRadius: "6px",
            border: "none",
            cursor: busy ? "not-allowed" : "pointer",
            background: busy ? "#C4CDD7" : "#0E1C29",
            color: "#FFFFFF",
          }}
        >
          {busy ? "Saving…" : "Save config"}
        </button>
      </div>
    </div>
  );
}
