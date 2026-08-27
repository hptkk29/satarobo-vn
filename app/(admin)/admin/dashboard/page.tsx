import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import {
  ACTIVE_ROLE_COOKIE,
  activeRoleOptions,
  resolveActiveRoleFrom,
} from "@/lib/auth/active-role";
import { roleCodeLabel } from "@/lib/labels";
import { redirect } from "next/navigation";
import { getEffectiveRoles, hasRole, hasAnyRole } from "@/lib/auth/permissions";
import { resolveActor } from "@/lib/auth/actor";
import { isRbacV2Enabled } from "@/lib/flags";
import { ManagerDashboard } from "./_components/manager-dashboard";
import { TeacherDashboard } from "./_components/teacher-dashboard";
import { SalesDashboard } from "./_components/sales-dashboard";
import { AccountantDashboard } from "./_components/accountant-dashboard";
import { MarketingDashboard, HrDashboard } from "./_components/marketing-hr-dashboards";
import { PendingTasksSection } from "./_components/pending-tasks-section";
import { BangDieuKhienQlcs } from "../dashboard-qlcs/_components/bang-dieu-khien-qlcs";
import type { ScopeFilterSearchParams } from "@/lib/reports/scope-filters";

// Đợt 3B/3C — Dashboard GỘP (union): hiển thị panel của TẤT CẢ vai trò user giữ.
// Thứ tự: Quản lý → Giáo viên → Tư vấn → Kế toán → Marketing → Nhân sự.
/** #13 — vai trò (enum v1) → panel dashboard tương ứng. TRAINING dùng panel quản lý. */
// Nhận CẢ mã legacy (cờ OFF) lẫn RoleDef code (cờ ON) — hai bộ chỉ trùng nhau 5/9,
// xem lib/auth/active-role.ts. Mã lạ → undefined → hiện mọi panel (hành vi mặc định).
const PANEL_KEY_BY_ROLE: Record<string, string> = {
  SUPER_ADMIN: "manager",
  CENTER_MANAGER: "manager",
  TRAINING: "manager",
  TEACHER: "teacher",
  ASSISTANT_TEACHER: "teacher",
  SALES_CSM: "sales",
  CENTER_SALES_CSM: "sales",
  HO_SALE: "sales",
  CENTER_CLASS_MANAGER: "manager",
  ACCOUNTANT: "acc",
  HO_ACCOUNTANT: "acc",
  CENTER_ACCOUNTANT: "acc",
  MARKETING: "mkt",
  HO_MARKETING: "mkt",
  HR: "hr",
  HO_HR: "hr",
  CENTER_HR: "hr",
};

export default async function DashboardPage({
  searchParams,
}: {
  // 27/08 — khối QLCS mount ngay tại đây nên trang phải chuyển tiếp bộ lọc phạm vi
  // (cơ sở / khoảng ngày) của nó. Vai khác không gửi tham số nào thì object rỗng.
  searchParams: Promise<ScopeFilterSearchParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id;
  const name = session.user.name ?? "";
  const roles = getEffectiveRoles(session.user);

  // FL0 — cách ly cơ sở cho dashboard: actor để scopedDb() lọc theo tầm nhìn cơ sở.
  // Trước đây các panel KPI đọc `db` trần → leak số liệu mọi cơ sở (BA #07 mục 3.B).
  const actor = await resolveActor(userId);

  // Manager panel cho SUPER_ADMIN/CENTER_MANAGER. Việc tồn đọng theo cơ sở đã
  // gom ở khu "Cần xử lý" (center-scoped); panel quản lý là KPI/biểu đồ tổng quan.
  const isManager = hasAnyRole(session.user, ["SUPER_ADMIN", "CENTER_MANAGER"]);

  const sp = await searchParams;

  const panels: { key: string; label: string; node: React.ReactNode }[] = [];
  if (isManager) {
    // 27/08/2026 — chủ dự án chốt: Quản lý cơ sở + Quản trị hệ thống đăng nhập là thấy
    // THẲNG bốn khối của dashboard QLCS, không phân tab, không phải đi tìm màn thứ hai.
    // Mục menu "Dashboard QLCS" đã gỡ; route /dashboard-qlcs giữ lại cho đường dẫn cũ.
    //
    // ⚠️ KHỐI NÀY THAY panel "Quản lý & Tổng quan" cũ (`ManagerDashboard`), không xếp
    // thêm bên cạnh: hai khối cùng trả lời "cơ sở đang chạy thế nào" mà số lại lấy theo
    // hai đường khác nhau (panel cũ tính theo actor, khối QLCS tính theo bộ lọc phạm vi)
    // ⇒ để cạnh nhau là hai con số lệch nhau trên cùng một màn, không ai biết tin cái nào.
    // `ManagerDashboard` vẫn còn nguyên và vẫn là panel dự phòng ở nhánh "không khớp vai".
    panels.push({
      key: "manager",
      label: "Quản lý cơ sở",
      node: <BangDieuKhienQlcs userId={userId} searchParams={sp} basePath="/dashboard" />,
    });
  }
  if (hasRole(session.user, "TEACHER")) {
    panels.push({ key: "teacher", label: "Giáo viên", node: <TeacherDashboard userId={userId} name={name} embedded /> });
  }
  if (hasRole(session.user, "SALES_CSM")) {
    panels.push({ key: "sales", label: "Tư vấn / Sale", node: <SalesDashboard userId={userId} name={name} embedded /> });
  }
  if (hasRole(session.user, "ACCOUNTANT")) {
    panels.push({ key: "acc", label: "Kế toán", node: <AccountantDashboard name={name} actor={actor} embedded /> });
  }
  if (hasRole(session.user, "MARKETING")) {
    panels.push({ key: "mkt", label: "Marketing", node: <MarketingDashboard name={name} actor={actor} embedded /> });
  }
  if (hasRole(session.user, "HR")) {
    panels.push({ key: "hr", label: "Nhân sự", node: <HrDashboard name={name} actor={actor} embedded /> });
  }
  // Phòng vệ: không khớp vai trò nào (vd dữ liệu lạ) → tổng quan quản lý.
  if (panels.length === 0) {
    panels.push({
      key: "manager",
      label: "Tổng quan",
      node: <ManagerDashboard userId={userId} name={name} actor={actor} embedded />,
    });
  }

  // #13 (câu 11) — đang chọn 1 vai → chỉ hiện panel của vai đó. Quyền KHÔNG đổi
  // (xem lib/auth/active-role.ts); đây thuần là lọc hiển thị.
  const jar = await cookies();
  // Cùng nguồn xác thực vai với layout — nếu không, cờ ON sẽ khiến sidebar lọc theo vai
  // còn dashboard thì không (cookie mang RoleDef code, resolveActiveRole cũ chỉ biết legacy).
  const activeRole = resolveActiveRoleFrom(
    activeRoleOptions(session.user, actor, isRbacV2Enabled()),
    jar.get(ACTIVE_ROLE_COOKIE)?.value,
  );
  const activeKey = activeRole ? PANEL_KEY_BY_ROLE[activeRole] : undefined;
  const visiblePanels = activeKey ? panels.filter((p) => p.key === activeKey) : panels;

  const multi = visiblePanels.length > 1;
  const lastName = name.split(" ").slice(-1)[0] || "bạn";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {lastName} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeRole
            ? `Đang xem theo vai trò: ${roleCodeLabel(activeRole)} — đổi ở góc trên bên phải. Quyền của bạn không thay đổi.`
            : multi
              ? `Bạn đang giữ ${roles.length} vai trò — dashboard gộp đầy đủ công việc của bạn.`
              : new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Module nhắc việc — khu "Cần xử lý" gom mọi nguồn theo quyền + cơ sở. */}
      <PendingTasksSection user={session.user} />

      {visiblePanels.map((p) => (
        <section key={p.key} className="space-y-4">
          {multi && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                {p.label}
              </span>
              <span className="h-px flex-1 bg-muted" />
            </div>
          )}
          {p.node}
        </section>
      ))}
    </div>
  );
}
