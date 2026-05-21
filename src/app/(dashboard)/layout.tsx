import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { MobileNavToggle } from "@/components/layout/mobile-nav-toggle";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  // DB-authoritative — only show the admin entry to genuine admins,
  // never on a stale JWT claim.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const isAdmin = dbUser?.role === "admin";

  return (
    <SidebarProvider>
      <div className="app-shell">
        <Sidebar isAdmin={isAdmin} />
        <main className="app-main">
          <div className="app-main-inner">
            <MobileNavToggle />
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
