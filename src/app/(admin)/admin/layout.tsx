import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { AdminNav } from "@/components/admin/admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  // DB-authoritative role check — same rationale as requireAdmin: never
  // trust a stale JWT for privilege. This closes the stale-admin window
  // for the UI shell too (a layout can hit the DB; edge middleware can't).
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (dbUser?.role !== "admin") {
    redirect("/overview");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F5F5F5" }}>
      <AdminNav />
      <main style={{ flex: 1, minWidth: 0, marginLeft: "220px" }}>
        <div
          style={{
            background: "#FFF0F2",
            borderBottom: "1px solid #FFC2CC",
            color: "#B3122E",
            fontSize: "12px",
            fontWeight: 600,
            padding: "8px 32px",
            letterSpacing: "0.02em",
          }}
        >
          ADMIN MODE — actions here affect all users and are audited.
        </div>
        <div
          style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px" }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
