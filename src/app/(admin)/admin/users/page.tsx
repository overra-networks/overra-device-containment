import prisma from "@/lib/prisma";
import { AdminUsersTable } from "@/components/admin/users-table";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

const PAGE_SIZE = 25;

export default async function AdminUsersPage({ searchParams }: Props) {
  // Authorization is enforced by (admin)/layout.tsx (DB-authoritative)
  // and by every /api/admin/* handler. This page only reads.
  const { page = "1", search = "" } = await searchParams;
  const currentPage = Math.max(1, parseInt(page, 10));
  const term = search.trim();

  const where = term
    ? {
        OR: [
          { email: { contains: term, mode: "insensitive" as const } },
          { walletAddress: { contains: term, mode: "insensitive" as const } },
          { name: { contains: term, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        walletAddress: true,
        name: true,
        plan: true,
        role: true,
        lockedAt: true,
        createdAt: true,
        _count: { select: { devices: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0E1C29" }}>
        Users
      </h1>
      <AdminUsersTable
        users={users.map((u) => ({
          id: u.id,
          identifier: u.email ?? u.walletAddress ?? u.id,
          name: u.name,
          plan: u.plan,
          role: u.role,
          lockedAt: u.lockedAt ? u.lockedAt.toISOString() : null,
          createdAt: u.createdAt.toISOString(),
          deviceCount: u._count.devices,
        }))}
        total={total}
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
        search={term}
      />
    </div>
  );
}
