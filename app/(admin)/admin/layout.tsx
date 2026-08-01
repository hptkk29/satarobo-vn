import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { hasStaffRole } from "@/lib/auth/permissions";
import {
  ACTIVE_ROLE_COOKIE,
  activeRoleOptions,
  menuActorForRole,
  menuUserForRole,
  resolveActiveRoleFrom,
} from "@/lib/auth/active-role";
import { grantedMenuActions } from "@/lib/auth/menu-permissions";
import { isEvalV2Enabled, isRbacV2Enabled, isScormEnabled } from "@/lib/flags";
import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";
import { Toaster } from "@/components/ui/sonner";

// Default title cho MỌI trang admin chưa tự khai metadata (86/199 trang) → không rơi về
// title public "Sata Robo – Trung tâm…". Trang tự khai `title: "X | Admin"` giữ nguyên
// (không set template ở đây để tránh nhân đôi "| Admin").
export const metadata = {
  title: { default: "Quản trị" },
};

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
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const dbUser = await sdb.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, tokenVersion: true, deletedAt: true, mustChangePassword: true },
  });

  if (!dbUser || dbUser.deletedAt) {
    redirect("/dang-xuat?reason=session-invalidated");
  }
  if (!dbUser.isActive) {
    redirect("/dang-xuat?reason=session-disabled");
  }
  if (dbUser.tokenVersion !== session.user.tokenVersion) {
    redirect("/dang-xuat?reason=session-invalidated");
  }
  // BGĐ 31/07 — MK do admin cấp/reset: chặn toàn bộ admin cho tới khi đổi MK.
  // Trang /doi-mat-khau nằm ở app/(auth) (ngoài layout này) → không loop.
  if (dbUser.mustChangePassword) {
    redirect("/doi-mat-khau");
  }

  // #13 (câu 11) — vai trò đang dùng, chỉ lọc MENU. Quyền không đổi: resolveActor vẫn
  // union mọi UserOrgRole. Cookie do client set → resolveActiveRoleFrom kiểm chứng sở hữu.
  // Cờ OFF → chọn theo vai legacy; cờ ON → theo RoleDef code (hai bộ mã chỉ trùng 5/9).
  const flagOn = isRbacV2Enabled();
  const jar = await cookies();
  const roleOptions = activeRoleOptions(session.user, actor, flagOn);
  const activeRole = resolveActiveRoleFrom(roleOptions, jar.get(ACTIVE_ROLE_COOKIE)?.value);
  const menuUser = menuUserForRole(
    { role: session.user.role, roles: session.user.roles, grants: session.user.grants },
    activeRole,
  );

  // Menu hỏi ĐÚNG hàm quyết định mà cổng trang dùng (evaluatePermission + cờ). Trước
  // 10/07 sidebar tự gọi can() v1 ⇒ bật cờ là menu và cổng nói hai câu chuyện khác nhau.
  const granted = grantedMenuActions({
    sessionUser: menuUser,
    actor: menuActorForRole(actor, activeRole),
    flagOn,
  });

  return (
    <div className="admin-scope flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:shrink-0">
        <Sidebar granted={granted} evalV2Enabled={isEvalV2Enabled()} scormEnabled={isScormEnabled()} />
      </div>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          userName={session.user.name}
          userRole={activeRole ?? session.user.role}
          roles={roleOptions}
          activeRole={activeRole}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}
