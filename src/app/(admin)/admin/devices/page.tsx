import prisma from "@/lib/prisma";
import { AdminDevicesTable } from "@/components/admin/devices-table";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ page?: string; status?: string }>;
}

const PAGE_SIZE = 25;

export default async function AdminDevicesPage({ searchParams }: Props) {
  const { page = "1", status } = await searchParams;
  const currentPage = Math.max(1, parseInt(page, 10));
  const where = {
    deletedAt: null,
    ...(status ? { status: status as never } : {}),
  };

  const [devices, total] = await Promise.all([
    prisma.device.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        hostname: true,
        status: true,
        lastHeartbeat: true,
        user: { select: { id: true, email: true, walletAddress: true } },
      },
    }),
    prisma.device.count({ where }),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0E1C29" }}>
        Devices
      </h1>
      <AdminDevicesTable
        devices={devices.map((d) => ({
          id: d.id,
          name: d.name,
          hostname: d.hostname,
          status: d.status,
          lastHeartbeat: d.lastHeartbeat
            ? d.lastHeartbeat.toISOString()
            : null,
          ownerLabel: d.user.email ?? d.user.walletAddress ?? d.user.id,
          ownerId: d.user.id,
        }))}
        total={total}
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
        status={status ?? ""}
      />
    </div>
  );
}
