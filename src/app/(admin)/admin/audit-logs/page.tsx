import prisma from "@/lib/prisma";
import { AdminAuditTable } from "@/components/admin/admin-audit-table";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ page?: string }>;
}

const PAGE_SIZE = 50;

export default async function AdminAuditLogsPage({ searchParams }: Props) {
  const { page = "1" } = await searchParams;
  const currentPage = Math.max(1, parseInt(page, 10));

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        adminUser: { select: { id: true, email: true } },
      },
    }),
    prisma.adminAuditLog.count(),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0E1C29" }}>
          Admin Audit Trail
        </h1>
        <p style={{ fontSize: "12px", color: "#5A7080", marginTop: "4px" }}>
          Every privileged admin action, in order. This trail is
          append-only.
        </p>
      </div>
      <AdminAuditTable
        logs={logs.map((l) => ({
          id: l.id,
          action: l.action,
          targetType: l.targetType,
          targetId: l.targetId,
          adminEmail: l.adminUser.email,
          ipAddress: l.ipAddress,
          createdAt: l.createdAt.toISOString(),
        }))}
        total={total}
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
