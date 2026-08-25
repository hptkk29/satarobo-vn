import { cookies } from "next/headers";
import Link from "next/link";
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
import {
  resolveScopeFilters,
  type ScopeFilterSearchParams,
} from "@/lib/reports/filters";
import { ScopeFilterBar } from "@/components/admin/scope-filter-bar";
import { TabTaiChinh } from "./_tabs/tai-chinh";
import { TabKinhDoanh } from "./_tabs/kinh-doanh";
import { TabChiPhiMarketing } from "./_tabs/chi-phi-marketing";
import { TabTuongTacKh } from "./_tabs/tuong-tac-kh";

const DASHBOARD_PATH = "/admin/dashboard";

/** A-02 — 4 tab dùng CHUNG một bộ lọc phạm vi (A-02-3). Thứ tự = thứ tự hiển thị. */
const SCOPE_TABS = [
  { key: "tai-chinh", label: "Tài chính" },
  { key: "kinh-doanh", label: "Kinh doanh" },
  { key: "chi-phi-marketing", label: "Chi phí Marketing" },
  { key: "tuong-tac-kh", label: "Tương tác KH" },
] as const;

type ScopeTabKey = (typeof SCOPE_TABS)[number]["key"];

/** Bộ lọc phạm vi (A-02) + tab đang mở. `tab` KHÔNG thuộc bộ lọc nên resolver không biết nó. */
type DashboardSearchParams = ScopeFilterSearchParams & { tab?: string | string[] };

/**
 * Link chuyển tab GIỮ NGUYÊN mọi tham số lọc đang có (A-02-3: đổi tab không mất bộ lọc).
 * Cố ý copy nguyên `searchParams` thay vì liệt kê tên khoá — thêm trường lọc mới ở
 * `scope-filter-bar.tsx` là link tab tự mang theo, không phải sửa hai chỗ.
 */
function scopeTabHref(sp: DashboardSearchParams, tab: ScopeTabKey): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === "tab" || value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) qs.append(key, v);
    else qs.set(key, value);
  }
  qs.set("tab", tab);
  return `${DASHBOARD_PATH}?${qs.toString()}`;
}

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
  searchParams: Promise<DashboardSearchParams>;
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

  const panels: { key: string; label: string; node: React.ReactNode }[] = [];
  if (isManager) {
    panels.push({
      key: "manager",
      label: "Quản lý & Tổng quan",
      node: <ManagerDashboard userId={userId} name={name} actor={actor} embedded />,
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

  // ── A-02: bộ lọc phạm vi + khung 4 tab ────────────────────────────────────────
  // THUẦN BỔ SUNG. Các panel ở trên KHÔNG đọc bộ lọc này (chúng nhận `actor`/`userId`
  // và tự scope như cũ) — nên bộ lọc được đặt BÊN TRONG khu 4 tab, không đặt đầu trang,
  // để người dùng không tưởng nó lọc cả dashboard.
  // KHÔNG thêm cổng quyền cấp trang ở đây: key `dashboard:view` (chốt kỹ thuật 24/08)
  // CHƯA seed trên prod — gác bây giờ là khoá cửa mọi người.
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const activeTab: ScopeTabKey = SCOPE_TABS.find((t) => t.key === rawTab)?.key ?? SCOPE_TABS[0].key;

  // Một resolver DUY NHẤT cho cả 4 tab (A-02-3). Nó lo: lọc id ngoài tầm nhìn (L-A2),
  // mặc định 01-tháng-này → hôm nay theo GIỜ VN, `canSelectAll`, và chặn `split` khi
  // chỉ có 1 cơ sở (L-A12). KHÔNG tự đọc `sp.center` ở đây — hai bộ parse lệch nhau là
  // hỏng câm. `actor` đã resolve ở trên, dùng lại chứ không gọi lần hai.
  const scope = await resolveScopeFilters(actor, sp);
  // `key` = bộ lọc ĐANG ÁP DỤNG: điều hướng xong thì bar remount và nhận lựa chọn mới,
  // khỏi cần useEffect đồng bộ state ngược từ props.
  const scopeBarKey = `${scope.selection.join(",")}|${scope.dateFromStr}|${scope.dateToStr}|${scope.filters.groupByCenter}`;

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

      {/* A-02 — khung 4 tab + bộ lọc phạm vi dùng chung. Đặt CUỐI trang: các khối phía
          trên đang phục vụ người dùng thật, không bị đẩy chỗ. */}
      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Báo cáo theo phạm vi</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bộ lọc dưới đây chỉ áp dụng cho 4 tab trong khung này — các khối phía trên giữ nguyên
            phạm vi mặc định của bạn.
          </p>
        </div>

        <ScopeFilterBar
          key={scopeBarKey}
          basePath={DASHBOARD_PATH}
          centers={scope.visibleCenters}
          selection={scope.selection}
          canSelectAll={scope.canSelectAll}
          isGlobalAllowed={scope.isGlobalAllowed}
          groupByCenter={scope.filters.groupByCenter}
          dateFrom={scope.dateFromStr}
          dateTo={scope.dateToStr}
          activeTab={activeTab}
        />

        <nav aria-label="Tab báo cáo" className="-mb-px flex flex-wrap gap-1 border-b border-border">
          {SCOPE_TABS.map((t) => {
            const current = t.key === activeTab;
            return (
              <Link
                key={t.key}
                href={scopeTabHref(sp, t.key)}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "border-b-2 border-primary px-3 py-2 text-sm font-semibold text-foreground"
                    : "border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {activeTab === "tai-chinh" && <TabTaiChinh filters={scope.filters} />}
        {activeTab === "kinh-doanh" && <TabKinhDoanh filters={scope.filters} />}
        {activeTab === "chi-phi-marketing" && <TabChiPhiMarketing filters={scope.filters} />}
        {activeTab === "tuong-tac-kh" && <TabTuongTacKh filters={scope.filters} />}
      </section>
    </div>
  );
}
