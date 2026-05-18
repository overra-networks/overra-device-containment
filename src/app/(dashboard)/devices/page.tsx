import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { DevicesTable } from "@/components/device/devices-table";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ page?: string; q?: string }>;
}

const PAGE_SIZE = 10;

export default async function DevicesPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { page = "1", q = "" } = await searchParams;
  const currentPage = Math.max(1, parseInt(page, 10));

  const allDevices = await prisma.device.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  let filtered = allDevices;
  if (q) {
    const lq = q.toLowerCase();
    filtered = allDevices.filter(
      (d) =>
        d.name.toLowerCase().includes(lq) ||
        d.hostname.toLowerCase().includes(lq) ||
        d.status.toLowerCase().includes(lq)
    );
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageDevices = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <PageHeader title="Devices" />
      <DevicesTable
        devices={pageDevices as any}
        currentPage={currentPage}
        totalPages={totalPages}
        q={q}
      />
    </div>
  );
}
