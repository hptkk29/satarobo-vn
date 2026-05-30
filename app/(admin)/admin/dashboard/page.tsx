import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEffectiveRoles, hasRole, hasAnyRole } from "@/lib/auth/permissions";
import { ManagerDashboard } from "./_components/manager-dashboard";
import { TeacherDashboard } from "./_components/teacher-dashboard";
import { SalesDashboard } from "./_components/sales-dashboard";
import { AccountantDashboard } from "./_components/accountant-dashboard";
import { MarketingDashboard, HrDashboard } from "./_components/marketing-hr-dashboards";
import { PendingTasksSection } from "./_components/pending-tasks-section";

// Đợt 3B/3C — Dashboard GỘP (union): hiển thị panel của TẤT CẢ vai trò user giữ.
// Thứ tự: Quản lý → Giáo viên → Tư vấn → Kế toán → Marketing → Nhân sự.
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id;
  const name = session.user.name ?? "";
  const roles = getEffectiveRoles(session.user);

  // Manager panel cho SUPER_ADMIN/CENTER_MANAGER. Center-scope: chỉ CM (không
  // kèm SUPER_ADMIN) bị giới hạn cơ sở; SUPER_ADMIN xem tất cả.
  const isManager = hasAnyRole(session.user, ["SUPER_ADMIN", "CENTER_MANAGER"]);
  const centerScope =
    hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")
      ? session.user.centerId
      : null;

  const panels: { key: string; label: string; node: React.ReactNode }[] = [];
  if (isManager) {
    panels.push({
      key: "manager",
      label: "Quản lý & Tổng quan",
      node: <ManagerDashboard userId={userId} name={name} centerScope={centerScope} embedded />,
    });
  }
  if (hasRole(session.user, "TEACHER")) {
    panels.push({ key: "teacher", label: "Giáo viên", node: <TeacherDashboard userId={userId} name={name} embedded /> });
  }
  if (hasRole(session.user, "SALES_CSM")) {
    panels.push({ key: "sales", label: "Tư vấn / Sale", node: <SalesDashboard userId={userId} name={name} embedded /> });
  }
  if (hasRole(session.user, "ACCOUNTANT")) {
    panels.push({ key: "acc", label: "Kế toán", node: <AccountantDashboard name={name} embedded /> });
  }
  if (hasRole(session.user, "MARKETING")) {
    panels.push({ key: "mkt", label: "Marketing", node: <MarketingDashboard name={name} embedded /> });
  }
  if (hasRole(session.user, "HR")) {
    panels.push({ key: "hr", label: "Nhân sự", node: <HrDashboard name={name} embedded /> });
  }
  // Phòng vệ: không khớp vai trò nào (vd dữ liệu lạ) → tổng quan quản lý.
  if (panels.length === 0) {
    panels.push({
      key: "manager",
      label: "Tổng quan",
      node: <ManagerDashboard userId={userId} name={name} centerScope={centerScope} embedded />,
    });
  }

  const multi = panels.length > 1;
  const lastName = name.split(" ").slice(-1)[0] || "bạn";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Xin chào, {lastName} 👋</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {multi
            ? `Bạn đang giữ ${roles.length} vai trò — dashboard gộp đầy đủ công việc của bạn.`
            : new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Module nhắc việc — khu "Cần xử lý" gom mọi nguồn theo quyền + cơ sở. */}
      <PendingTasksSection user={session.user} />

      {panels.map((p) => (
        <section key={p.key} className="space-y-4">
          {multi && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#7C3AED] px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                {p.label}
              </span>
              <span className="h-px flex-1 bg-neutral-200" />
            </div>
          )}
          {p.node}
        </section>
      ))}
    </div>
  );
}
