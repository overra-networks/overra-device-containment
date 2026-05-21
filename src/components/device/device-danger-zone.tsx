"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  deviceId: string;
  deviceHostname: string;
}

const card: React.CSSProperties = {
  background: "#FFF7F8",
  border: "1px solid #FFC2CC",
  borderRadius: "8px",
  padding: "20px",
  marginTop: "20px",
};

const fieldStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: "13px",
  border: "1px solid #DDE3EA",
  borderRadius: "6px",
  outline: "none",
  minWidth: "180px",
};

export function DeviceDangerZone({ deviceId, deviceHostname }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Delete failed");
      router.push("/devices");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <h2
        style={{
          fontSize: "14px",
          fontWeight: 700,
          color: "#B3122E",
          marginBottom: "8px",
        }}
      >
        Danger zone
      </h2>
      <p
        style={{
          fontSize: "12px",
          color: "#5A7080",
          marginBottom: "12px",
        }}
      >
        Removing this device disables its agent and hides it from your
        account. The audit history is preserved.
      </p>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 600,
            borderRadius: "6px",
            border: "1px solid #FF3355",
            background: "transparent",
            color: "#B3122E",
            cursor: "pointer",
          }}
        >
          Delete device…
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "#5A7080" }}>
            Type the hostname <strong>{deviceHostname}</strong> to confirm:
          </span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              style={fieldStyle}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={deviceHostname}
            />
            <button
              onClick={doDelete}
              disabled={confirm !== deviceHostname || busy}
              style={{
                padding: "9px 18px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "none",
                cursor:
                  confirm !== deviceHostname || busy
                    ? "not-allowed"
                    : "pointer",
                background:
                  confirm !== deviceHostname || busy ? "#C4CDD7" : "#FF3355",
                color: "#FFFFFF",
              }}
            >
              {busy ? "Deleting…" : "Delete device"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setError(null);
              }}
              style={{
                padding: "9px 18px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "1px solid #DDE3EA",
                background: "transparent",
                color: "#5A7080",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <span style={{ fontSize: "12px", color: "#B3122E" }}>{error}</span>
          )}
        </div>
      )}
    </div>
  );
}
