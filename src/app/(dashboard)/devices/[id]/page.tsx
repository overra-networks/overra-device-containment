import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DeviceDetailView } from "@/components/device/device-detail-view";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function DevicePage({ params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;

  const device = await prisma.device.findUnique({
    where: { id },
    include: {
      containmentConfig: true,
      auditLogs: {
        orderBy: { timestamp: "desc" },
        take: 100,
      },
    },
  });

  if (!device || device.userId !== session.user.id) {
    notFound();
  }

  return <DeviceDetailView device={device as any} logs={device.auditLogs as any} />;
}
