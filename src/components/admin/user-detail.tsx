"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface DeviceRow {
  id: string;
  name: string;
  status: string;
  lastHeartbeat: string | null;
}
interface AdminUser {
  id: string;
  email: string;
  name: string;
  plan: string;
  role: string;
  lockedAt: string | null;
  walletAddress: string | null;
  createdAt: string;
  devices: DeviceRow[];
}

const PLANS = ["free", "pro", "enterprise"];
const ROLES = ["user", "admin"];

const labelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#5A7080",
  display: "block",
  marginBottom: "4px",
};
const fieldStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: "13px",
  border: "1px solid #DDE3EA",
  borderRadius: "6px",
  outline: "none",
  minWidth: "180px",
};
const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #DDE3EA",
  borderRadius: "8px",
  padding: "20px",
};

export function AdminUserDetail({ user }: { user: AdminUser }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [plan, setPlan] = useState(user.plan);
  const [role, setRole] = useState(user.role);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [showLock, setShowLock] = useState(false);
  const [lockConfirm, setLockConfirm] = useState("");
  const locked = user.lockedAt !== null;

  const dirty =
    name !== user.name || plan !== user.plan || role !== user.role;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, plan, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setMsg("Saved.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Delete failed");
      router.push("/admin/users");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  async function toggleLock(nextLocked: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: nextLocked }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Lock toggle failed");
      setMsg(nextLocked ? "Account locked." : "Account unlocked.");
      setShowLock(false);
      setLockConfirm("");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Lock toggle failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <Link
          href="/admin/users"
          style={{ fontSize: "12px", color: "#5A7080", fontWeight: 600 }}
        >
          ← Users
        </Link>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "#0E1C29",
            marginTop: "8px",
          }}
        >
          {user.email}
        </h1>
        <p style={{ fontSize: "12px", color: "#5A7080" }}>
          Joined {new Date(user.createdAt).toLocaleDateString()} ·{" "}
          {user.walletAddress
            ? `wallet ${user.walletAddress.slice(0, 10)}…`
            : "no wallet"}
        </p>
      </div>

      <div style={card}>
        <div
          style={{
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div>
            <label style={labelStyle}>Name</label>
            <input
              style={fieldStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Plan</label>
            <select
              style={fieldStyle}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select
              style={fieldStyle}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={save}
            disabled={!dirty || busy}
            style={{
              padding: "9px 18px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "6px",
              border: "none",
              cursor: !dirty || busy ? "not-allowed" : "pointer",
              background: !dirty || busy ? "#C4CDD7" : "#0E1C29",
              color: "#FFFFFF",
            }}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
          {msg && (
            <span style={{ fontSize: "12px", color: "#5A7080" }}>{msg}</span>
          )}
        </div>
      </div>

      <div
        style={{
          ...card,
          borderColor: locked ? "#FFC2CC" : "#DDE3EA",
          background: locked ? "#FFF7F8" : "#FFFFFF",
        }}
      >
        <h2
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: locked ? "#B3122E" : "#0E1C29",
            marginBottom: "4px",
          }}
        >
          Account access —{" "}
          <span style={{ color: locked ? "#B3122E" : "#5A7080" }}>
            {locked ? "locked" : "active"}
          </span>
        </h2>
        <p
          style={{
            fontSize: "12px",
            color: "#5A7080",
            marginBottom: "12px",
          }}
        >
          {locked
            ? "User cannot log in to the dashboard. Installed agents keep polling normally."
            : "Locking blocks portal login and invalidates outstanding sessions. Installed agents are unaffected."}
        </p>
        {!locked ? (
          !showLock ? (
            <button
              onClick={() => setShowLock(true)}
              disabled={busy}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "1px solid #FF3355",
                background: "transparent",
                color: "#B3122E",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Lock account…
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#5A7080" }}>
                Type the email <strong>{user.email}</strong> to confirm:
              </span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <input
                  style={fieldStyle}
                  value={lockConfirm}
                  onChange={(e) => setLockConfirm(e.target.value)}
                  placeholder={user.email}
                />
                <button
                  onClick={() => toggleLock(true)}
                  disabled={lockConfirm !== user.email || busy}
                  style={{
                    padding: "9px 18px",
                    fontSize: "13px",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border: "none",
                    cursor:
                      lockConfirm !== user.email || busy
                        ? "not-allowed"
                        : "pointer",
                    background:
                      lockConfirm !== user.email || busy
                        ? "#C4CDD7"
                        : "#FF3355",
                    color: "#FFFFFF",
                  }}
                >
                  {busy ? "Locking…" : "Lock account"}
                </button>
                <button
                  onClick={() => {
                    setShowLock(false);
                    setLockConfirm("");
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
            </div>
          )
        ) : (
          <button
            onClick={() => toggleLock(false)}
            disabled={busy}
            style={{
              padding: "9px 18px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "6px",
              border: "1px solid #0E1C29",
              background: "transparent",
              color: "#0E1C29",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Unlocking…" : "Unlock account"}
          </button>
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
          Devices ({user.devices.length})
        </h2>
        {user.devices.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#5A7080" }}>No devices.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {user.devices.map((d) => (
              <li
                key={d.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid #EEF1F4",
                  fontSize: "13px",
                }}
              >
                <Link
                  href={`/admin/devices/${d.id}`}
                  style={{ color: "#0E1C29", fontWeight: 600 }}
                >
                  {d.name}
                </Link>
                <span style={{ color: "#5A7080" }}>{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ ...card, borderColor: "#FFC2CC", background: "#FFF7F8" }}>
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
          Deleting this user permanently removes their account, devices, and
          audit logs. This cannot be undone.
        </p>
        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
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
            Delete user…
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "#5A7080" }}>
              Type the email <strong>{user.email}</strong> to confirm:
            </span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                style={fieldStyle}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={user.email}
              />
              <button
                onClick={doDelete}
                disabled={confirmText !== user.email || busy}
                style={{
                  padding: "9px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "none",
                  cursor:
                    confirmText !== user.email || busy
                      ? "not-allowed"
                      : "pointer",
                  background:
                    confirmText !== user.email || busy
                      ? "#C4CDD7"
                      : "#FF3355",
                  color: "#FFFFFF",
                }}
              >
                {busy ? "Deleting…" : "Permanently delete"}
              </button>
              <button
                onClick={() => {
                  setShowDelete(false);
                  setConfirmText("");
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
          </div>
        )}
      </div>
    </div>
  );
}
