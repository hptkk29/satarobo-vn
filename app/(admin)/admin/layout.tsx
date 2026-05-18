import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";
import { Toaster } from "@/components/ui/sonner";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Phase 5.3.0 — Real-time invalidation: check user vẫn active + tokenVersion
  // match. Nếu admin disable user / soft-delete / bump tokenVersion → logout
  // ngay request kế tiếp. 1 DB query / request /admin/* acceptable cho admin
  // panel (~10 users).
  const dbUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, tokenVersion: true, deletedAt: true },
  });

  if (
    !dbUser ||
    !dbUser.isActive ||
    dbUser.deletedAt ||
    dbUser.tokenVersion !== session.user.tokenVersion
  ) {
    redirect("/login?reason=session-invalidated");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:shrink-0">
        <Sidebar />
      </div>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar userName={session.user.name} userRole={session.user.role} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}
