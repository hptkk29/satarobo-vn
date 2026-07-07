import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { hasStaffRole } from "@/lib/auth/permissions";
import { isEvalV2Enabled, isScormEnabled } from "@/lib/flags";
import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";
import { Toaster } from "@/components/ui/sonner";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Defense-in-depth (tầng layout): chỉ chặn user KHÔNG có vai trò nhân viên
  // nào (PARENT-only). Đa vai trò (3B): có ≥1 staff role → được vào admin.
  if (!hasStaffRole(session.user)) {
    redirect("/portal");
  }

  // Phase 5.3.0 — Real-time invalidation: check user vẫn active + tokenVersion
  // match. Nếu admin disable user / soft-delete / bump tokenVersion → logout
  // ngay request kế tiếp. 1 DB query / request /admin/* acceptable cho admin
  // panel (~10 users).
  // User là SCOPE_EXEMPT → sdb pass-through, hành vi y nguyên (kể cả deletedAt
  // filter tự đọc field trần bên dưới). resolveActor được React.cache — page con
  // gọi checkPermission dùng chung 1 lần resolve/request.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const dbUser = await sdb.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, tokenVersion: true, deletedAt: true },
  });

  if (!dbUser || dbUser.deletedAt) {
    redirect("/login?reason=session-invalidated");
  }
  if (!dbUser.isActive) {
    redirect("/login?reason=session-disabled");
  }
  if (dbUser.tokenVersion !== session.user.tokenVersion) {
    redirect("/login?reason=session-invalidated");
  }

  return (
    <div className="admin-scope flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:shrink-0">
        <Sidebar user={{ role: session.user.role, roles: session.user.roles, grants: session.user.grants }} evalV2Enabled={isEvalV2Enabled()} scormEnabled={isScormEnabled()} />
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
