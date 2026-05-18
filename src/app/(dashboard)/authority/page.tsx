import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { AuthorityView } from "@/components/device/authority-view";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ device?: string }>;
}

export default async function AuthorityPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { device: deviceId } = await searchParams;

  let device = null;
  if (deviceId) {
    device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        auditLogs: { orderBy: { timestamp: "desc" }, take: 20 },
      },
    });
    if (!device || device.userId !== session.user.id) notFound();
  } else {
    const first = await prisma.device.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        auditLogs: { orderBy: { timestamp: "desc" }, take: 20 },
      },
    });
    device = first;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <PageHeader title="Authority" />
      {!device ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 20px",
            textAlign: "center",
            border: "1px dashed #DDE3EA",
            borderRadius: "12px",
          }}
        >
          <p style={{ fontSize: "14px", fontWeight: 500, color: "#0E1C29", marginBottom: "6px" }}>
            No device selected
          </p>
          <p style={{ fontSize: "13px", color: "#5A7080" }}>
            Go to <Link href="/devices" style={{ color: "#0E1C29", textDecoration: "none" }}>Devices</Link> and select an endpoint.
          </p>
        </div>
      ) : (
        <AuthorityView device={device as any} logs={device.auditLogs as any} userWalletAddress={(session.user as any).walletAddress ?? null} />
      )}
    </div>
  );
}
