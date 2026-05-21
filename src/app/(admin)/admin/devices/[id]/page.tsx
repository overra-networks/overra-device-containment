import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { AdminDeviceControl } from "@/components/admin/device-control";
import { AdminDeviceDangerZone } from "@/components/admin/admin-device-danger-zone";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminDeviceDetailPage({ params }: Props) {
  const { id } = await params;

  const device = await prisma.device.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      hostname: true,
      os: true,
      status: true,
      lastHeartbeat: true,
      walletAuthority: true,
      containmentConfig: {
        select: {
          disableNetwork: true,
          revokeSessions: true,
          freezeExtensions: true,
          lockScreen: true,
        },
      },
      user: { select: { id: true, email: true } },
    },
  });

  if (!device) notFound();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <Link
          href="/admin/devices"
          style={{ fontSize: "12px", color: "#5A7080", fontWeight: 600 }}
        >
          ← Devices
        </Link>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "#0E1C29",
            marginTop: "8px",
          }}
        >
          {device.name}
        </h1>
        <p style={{ fontSize: "12px", color: "#5A7080" }}>
          {device.hostname} · {device.os} · owner{" "}
          <Link
            href={`/admin/users/${device.user.id}`}
            style={{ color: "#5A7080", fontWeight: 600 }}
          >
            {device.user.email}
          </Link>
          {device.walletAuthority
            ? " · wallet-authority required"
            : ""}
        </p>
      </div>

      <AdminDeviceControl
        device={{
          id: device.id,
          name: device.name,
          status: device.status,
          ownerEmail: device.user.email,
          walletAuthority: device.walletAuthority,
          config: device.containmentConfig ?? {
            disableNetwork: true,
            revokeSessions: true,
            freezeExtensions: true,
            lockScreen: true,
          },
        }}
      />

      <AdminDeviceDangerZone
        deviceId={device.id}
        deviceHostname={device.hostname}
        ownerEmail={device.user.email}
      />
    </div>
  );
}
