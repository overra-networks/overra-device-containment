import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { AdminUserDetail } from "@/components/admin/user-detail";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      role: true,
      walletAddress: true,
      createdAt: true,
      devices: {
        select: {
          id: true,
          name: true,
          status: true,
          lastHeartbeat: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) notFound();

  return (
    <AdminUserDetail
      user={{
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        role: user.role,
        walletAddress: user.walletAddress,
        createdAt: user.createdAt.toISOString(),
        devices: user.devices.map((d) => ({
          id: d.id,
          name: d.name,
          status: d.status,
          lastHeartbeat: d.lastHeartbeat
            ? d.lastHeartbeat.toISOString()
            : null,
        })),
      }}
    />
  );
}
