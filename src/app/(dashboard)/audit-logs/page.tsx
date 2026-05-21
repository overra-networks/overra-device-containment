import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";

interface LogWithDevice {
  id: string;
  timestamp: Date;
  event: string;
  result: string;
  signature: string | null;
  device: { id: string; name: string; hostname: string } | null;
}

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

type FilterType = "all" | "authorization" | "state_change" | "verification_failure" | "system_error";

const FILTER_KEYWORDS: Record<FilterType, string[]> = {
  all: [],
  authorization: ["signature", "authorization", "wallet", "auth"],
  state_change: ["containment", "activated", "released", "state"],
  verification_failure: ["failed", "invalid", "nonce", "expired"],
  system_error: ["error", "system initialization"],
};

interface Props {
  searchParams: Promise<{ filter?: string; page?: string; q?: string }>;
}

export default async function AuditLogsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { filter = "all", page = "1", q = "" } = await searchParams;
  const currentPage = Math.max(1, parseInt(page, 10));
  const currentFilter = (filter as FilterType) in FILTER_KEYWORDS ? (filter as FilterType) : "all";

  // Fetch all logs for this user across all devices
  const allLogs = (await prisma.auditLog.findMany({
    where: { userId: session.user.id },
    orderBy: { timestamp: "desc" },
    include: { device: { select: { id: true, name: true, hostname: true } } },
  })) as LogWithDevice[];

  // Count per category for tab badges
  const counts = Object.fromEntries(
    Object.entries(FILTER_KEYWORDS).map(([key, keywords]) => {
      if (key === "all") return [key, allLogs.length];
      const count = allLogs.filter((log) =>
        keywords.some((kw) => log.event.toLowerCase().includes(kw))
      ).length;
      return [key, count];
    })
  ) as Record<FilterType, number>;

  // Apply filter and search
  let filtered = allLogs;
  if (currentFilter !== "all") {
    const kws = FILTER_KEYWORDS[currentFilter];
    filtered = filtered.filter((log) =>
      kws.some((kw) => log.event.toLowerCase().includes(kw))
    );
  }
  if (q) {
    const lq = q.toLowerCase();
    filtered = filtered.filter(
      (log) =>
        log.event.toLowerCase().includes(lq) ||
        log.device?.name?.toLowerCase().includes(lq) ||
        log.result.toLowerCase().includes(lq)
    );
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageLogs = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const RESULT_COLORS: Record<string, string> = {
    success: "#00875A",
    executed: "#0E1C29",
    failed: "#FF3355",
    pending: "#FFA800",
  };

  const tabs: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "authorization", label: "Authorization" },
    { key: "state_change", label: "State Change" },
    { key: "verification_failure", label: "Verification Failure" },
    { key: "system_error", label: "System Error" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <PageHeader title="Audit Logs" />

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #DDE3EA",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        {/* Filter tabs + search */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid #DDE3EA",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {tabs.map(({ key, label }) => {
              const active = currentFilter === key;
              const count = counts[key];
              return (
                <a
                  key={key}
                  href={`/audit-logs?filter=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "5px 10px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                    textDecoration: "none",
                    color: active ? "#0E1C29" : "#5A7080",
                    background: active ? "rgba(14,28,41,0.09)" : "transparent",
                    border: active ? "1px solid rgba(14,28,41,0.2)" : "1px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                  {count > 0 && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "16px",
                        height: "16px",
                        padding: "0 4px",
                        borderRadius: "8px",
                        background: active ? "rgba(14,28,41,0.2)" : "#FFFFFF",
                        color: active ? "#0E1C29" : "#8A9BAB",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      {count}
                    </span>
                  )}
                </a>
              );
            })}
          </div>

          {/* Search */}
          <form method="get" action="/audit-logs" style={{ display: "flex", alignItems: "center" }}>
            <input type="hidden" name="filter" value={currentFilter} />
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
                  width: "140px",
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
              {["Timestamp", "Event", "Result", "Device", "Hash"].map((h) => (
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
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageLogs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "40px 20px", textAlign: "center", fontSize: "12px", color: "#8A9BAB" }}>
                  No audit logs found
                </td>
              </tr>
            ) : (
              pageLogs.map((log) => {
                const color = RESULT_COLORS[log.result] ?? "#5A7080";
                const hash = log.signature
                  ? log.signature.slice(0, 6) + "..." + log.signature.slice(-4)
                  : log.id.slice(0, 4) + "..." + log.id.slice(-4);
                return (
                  <tr key={log.id} style={{ borderBottom: "1px solid #DDE3EA" }}>
                    <td style={{ padding: "10px 20px", fontSize: "12px", color: "#5A7080", fontFamily: "var(--font-mono, monospace)", whiteSpace: "nowrap" }}>
                      {new Date(log.timestamp).toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={{ padding: "10px 20px", fontSize: "13px", color: "#0E1C29" }}>{log.event}</td>
                    <td style={{ padding: "10px 20px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color }}>{log.result.charAt(0).toUpperCase() + log.result.slice(1)}</span>
                    </td>
                    <td style={{ padding: "10px 20px", fontSize: "12px", color: "#5A7080", fontFamily: "var(--font-mono, monospace)" }}>
                      {log.device?.name ?? "—"}
                    </td>
                    <td style={{ padding: "10px 20px", fontSize: "11px", color: "#8A9BAB", fontFamily: "var(--font-mono, monospace)" }}>
                      {hash}
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
              <a
                href={`/audit-logs?filter=${currentFilter}&page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                style={paginationBtnStyle}
              >
                Previous
              </a>
            )}
            {currentPage < totalPages && (
              <a
                href={`/audit-logs?filter=${currentFilter}&page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                style={paginationBtnStyle}
              >
                Next
              </a>
            )}
          </div>
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
  transition: "all 0.15s",
};
