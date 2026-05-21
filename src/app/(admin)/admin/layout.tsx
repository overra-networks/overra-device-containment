import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { AdminNav } from "@/components/admin/admin-nav";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { MobileNavToggle } from "@/components/layout/mobile-nav-toggle";

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
    <SidebarProvider>
      <div className="app-shell">
        <AdminNav />
        <main className="app-main">
          <div
            style={{
              background: "#FFF0F2",
              borderBottom: "1px solid #FFC2CC",
              color: "#B3122E",
              fontSize: "12px",
              fontWeight: 600,
              padding: "8px 16px",
              letterSpacing: "0.02em",
            }}
          >
            ADMIN MODE — actions here affect all users and are audited.
          </div>
          <div className="app-main-inner">
            <MobileNavToggle />
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
