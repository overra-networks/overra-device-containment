"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  plan: string;
  role: string;
  createdAt: string;
  deviceCount: number;
}

interface Props {
  users: AdminUserRow[];
  total: number;
  currentPage: number;
  pageSize: number;
  search: string;
}

const cell: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "13px",
  color: "#0E1C29",
  borderBottom: "1px solid #EEF1F4",
  textAlign: "left",
};

export function AdminUsersTable({
  users,
  total,
  currentPage,
  pageSize,
  search,
}: Props) {
  const router = useRouter();
  const [term, setTerm] = useState(search);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = term.trim();
    router.push(`/admin/users${q ? `?search=${encodeURIComponent(q)}` : ""}`);
  }

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #DDE3EA",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <form
        onSubmit={submitSearch}
        style={{ padding: "12px", borderBottom: "1px solid #DDE3EA" }}
      >
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search email or name…"
          style={{
            width: "280px",
            maxWidth: "100%",
            padding: "8px 10px",
            fontSize: "13px",
            border: "1px solid #DDE3EA",
            borderRadius: "6px",
            outline: "none",
          }}
        />
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#F7F9FB" }}>
            {["Email", "Name", "Plan", "Role", "Devices", "Created", ""].map(
              (h) => (
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
              )
            )}
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <tr>
              <td
                colSpan={7}
                style={{ ...cell, textAlign: "center", color: "#5A7080" }}
              >
                No users found.
              </td>
            </tr>
          )}
          {users.map((u) => (
            <tr key={u.id}>
              <td style={cell}>{u.email}</td>
              <td style={cell}>{u.name}</td>
              <td style={cell}>{u.plan}</td>
              <td style={cell}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    color: u.role === "admin" ? "#B3122E" : "#5A7080",
                    background:
                      u.role === "admin" ? "#FFF0F2" : "rgba(90,112,128,0.1)",
                  }}
                >
                  {u.role}
                </span>
              </td>
              <td style={cell}>{u.deviceCount}</td>
              <td style={cell}>
                {new Date(u.createdAt).toLocaleDateString()}
              </td>
              <td style={cell}>
                <Link
                  href={`/admin/users/${u.id}`}
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
          alignItems: "center",
          padding: "12px",
          borderTop: "1px solid #DDE3EA",
          fontSize: "12px",
          color: "#5A7080",
        }}
      >
        <span>
          {total} user{total === 1 ? "" : "s"} · page {currentPage}/
          {totalPages}
        </span>
        <span style={{ display: "flex", gap: "8px" }}>
          {currentPage > 1 && (
            <Link
              href={`/admin/users?page=${currentPage - 1}${
                search ? `&search=${encodeURIComponent(search)}` : ""
              }`}
              style={{ color: "#0E1C29", fontWeight: 600 }}
            >
              ← Prev
            </Link>
          )}
          {currentPage < totalPages && (
            <Link
              href={`/admin/users?page=${currentPage + 1}${
                search ? `&search=${encodeURIComponent(search)}` : ""
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
