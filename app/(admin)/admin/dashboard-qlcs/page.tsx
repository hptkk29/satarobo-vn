import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkAnyPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { resolveActor } from "@/lib/auth/actor";
import { resolveScopeFilters } from "@/lib/reports/filters";
import type { ScopeFilterSearchParams } from "@/lib/reports/scope-filters";
import {
  QLCS_TABS,
  buildQlcsTabHref,
  resolveQlcsTab,
  type QlcsFilterQuery,
} from "@/lib/dashboard/qlcs-tabs";
import { ScopeFilterBar, scopeSummaryText } from "@/components/admin/scope-filter-bar";
import { TabTaiChinh } from "./_tabs/tai-chinh";
import { TabKinhDoanh } from "./_tabs/kinh-doanh";
import { TabChiPhiMarketing } from "./_tabs/chi-phi-marketing";
import { TabTuongTacKh } from "./_tabs/tuong-tac-kh";

export const metadata = { title: "Dashboard QLCS | Admin" };
export const dynamic = "force-dynamic";

const BASE_PATH = "/dashboard-qlcs";

type PageProps = {
  searchParams: Promise<ScopeFilterSearchParams & { tab?: string | string[] }>;
};

/**
 * A-02-UI — khung dashboard QLCS: MỘT thanh lọc phạm vi dùng chung + 4 tab.
 *
 * ┌─ Vì sao là `/dashboard-qlcs` chứ không phải `/dashboard` ─────────────────────────┐
 * │ PRD §6.2 đề xuất đặt 4 tab vào `app/(admin)/admin/dashboard/`. Đo lại trang đó:   │
 * │ nó là màn TIẾP ĐẤT chung sau đăng nhập, gộp panel của cả 9 vai (Giáo viên, Kế     │
 * │ toán, Nhân sự, Marketing, Tư vấn…) và là đích của `login-redirect`. Thay nó bằng  │
 * │ 4 tab QLCS là làm trắng màn đầu tiên của mọi vai không phải QLCS. ⇒ segment RIÊNG │
 * │ (đã khai trong `ADMIN_ROUTE_SEGMENTS`, có test), trang cũ để nguyên.              │
 * └──────────────────────────────────────────────────────────────────────────────────┘
 *
 * Bốn tab đọc CÙNG `searchParams` và CÙNG `resolveScopeFilters()` — không tab nào được
 * tự giải bộ lọc lần hai (AC A-02-3). Đổi tab = đổi mỗi `?tab=`, mọi tham số lọc khác
 * được `buildQlcsTabHref` chép nguyên sang, ở dạng ĐÃ chuẩn hoá (ngày tương lai đã kẹp,
 * cơ sở ngoài phạm vi đã loại) nên URL luôn khớp thứ đang hiển thị.
 */
export default async function DashboardQlcsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkAnyPermission(PAGE_GATES["/dashboard-qlcs"]))) {
    redirect("/dashboard?error=unauthorized");
  }

  const actor = await resolveActor(session.user.id);
  const sp = await searchParams;
  // Bộ lọc dùng chung A-02: cơ sở (giao visibleCenterIds × cơ sở chọn trong URL — cơ sở
  // ngoài phạm vi bị loại IM LẶNG) + khoảng ngày giờ VN + cờ tách theo cơ sở.
  const fc = await resolveScopeFilters(actor, sp);
  const tab = resolveQlcsTab(sp.tab);

  const query: QlcsFilterQuery = {
    centerIds: fc.filters.centerIds,
    isAllCenters: fc.filters.isAllCenters,
    dateFrom: fc.dateFromStr,
    dateTo: fc.dateToStr,
    split: fc.filters.groupByCenter,
  };

  // Không có cơ sở nào trong tầm nhìn ⇒ mọi tab đều rỗng. Nói thẳng nguyên nhân (chưa
  // được gán cơ sở) thay vì để người dùng nhìn 4 tab trống và tưởng hệ thống hỏng.
  const khongCoCoSo = fc.visibleCenters.length === 0;

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard quản lý cơ sở</h1>
        <p className="text-sm text-muted-foreground">
          Bốn tab dùng chung một bộ lọc — đổi tab không mất phạm vi đang xem.
        </p>
      </div>

      <ScopeFilterBar
        basePath={BASE_PATH}
        tab={tab}
        visibleCenters={fc.visibleCenters}
        filters={fc.filters}
        dateFromStr={fc.dateFromStr}
        dateToStr={fc.dateToStr}
        canSplit={fc.canSplit}
        droppedCenterCount={fc.droppedCenterCount}
      />

      {khongCoCoSo ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Tài khoản của bạn chưa được gán cơ sở nào đang hoạt động, nên chưa có phạm vi
          để tổng hợp. Liên hệ quản trị viên để được gán cơ sở.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Đang xem: {scopeSummaryText(fc.filters, fc.visibleCenters, fc.dateFromStr, fc.dateToStr)}
        </p>
      )}

      {/* Thanh tab — dùng <Link> chứ không phải state phía client: tab nằm trong URL nên
          bấm F5 / gửi đường dẫn cho người khác vẫn ra đúng màn đang xem. */}
      <nav aria-label="Tab dashboard" className="flex flex-wrap gap-1 border-b border-border">
        {QLCS_TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Link
              key={t.id}
              href={buildQlcsTabHref(BASE_PATH, query, t.id)}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "-mb-px border-b-2 border-primary px-3 py-2 text-sm font-semibold text-foreground"
                  : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {tab === "tai-chinh" ? (
        <TabTaiChinh
          actor={actor}
          filters={fc.filters}
          visibleCenters={fc.visibleCenters}
        />
      ) : null}
      {tab === "kinh-doanh" ? <TabKinhDoanh /> : null}
      {tab === "chi-phi-marketing" ? <TabChiPhiMarketing /> : null}
      {tab === "tuong-tac-kh" ? <TabTuongTacKh /> : null}
    </div>
  );
}
