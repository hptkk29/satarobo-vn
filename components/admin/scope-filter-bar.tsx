"use client";

// A-02 — bộ lọc phạm vi dùng chung cho 4 tab dashboard (Tài chính · Kinh doanh ·
// Chi phí Marketing · Tương tác KH).
//
// ĐẶT CẠNH `report-filter-bar.tsx`, KHÔNG thay nó: 8 trang /bao-cao/* vẫn dùng bản cũ
// (đơn trị `?center=<id>`), đụng vào là vỡ 11 chỗ đọc + đường GHI mục tiêu doanh thu
// (PRD A §6.2 ràng buộc 6).
//
// ── Phân vai với server ────────────────────────────────────────────────────────
// `resolveScopeFilters()` (`lib/reports/filters.ts`) là NGUỒN SỰ THẬT DUY NHẤT của
// việc giải bộ lọc: nó lọc id ngoài tầm nhìn (L-A2), điền mặc định 01-tháng-này →
// hôm nay theo GIỜ VN, và tính `canSelectAll`/`canSplit`. Bar này chỉ NHẬN kết quả đã
// giải rồi vẽ form — cố ý KHÔNG tự parse `searchParams`, vì hai bộ parse lệch nhau là
// dạng hỏng câm (bar hiện một khoảng ngày, số liệu bên dưới chạy khoảng khác).
//
// ── Vì sao là client component (rule #1 "server-first" cho phép khi cần state) ──
// Quy ước URL đã chốt (A-02-5) là MỘT tham số `?center=` mang danh sách id ngăn bởi
// dấu phẩy. Checkbox native trong form GET chỉ phát được `center=a&center=b` (khoá
// lặp), không phát được chuỗi ghép phẩy — nên lựa chọn giữ ở state rồi đẩy vào một
// input hidden duy nhất. (Resolver vẫn đọc được cả hai dạng.)
//
// ⚠️ Repo KHÔNG có `components/ui/popover.tsx` lẫn `components/ui/checkbox.tsx`
// (đã kiểm 25/08 — xem báo cáo A-02 UI). Dropdown-checkbox ở đây dựng bằng
// `DropdownMenu` + `DropdownMenuCheckboxItem` sẵn có (Base UI Menu = popover có sẵn),
// đúng ràng buộc "không thêm thư viện" và "không dùng <select multiple> native".

import * as React from "react";
import Link from "next/link";
import { Building2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

/**
 * Tên tham số URL mà bar này GHI RA. `resolveScopeFilters` đọc `from`/`to` trước, rồi
 * mới tới bí danh `dateFrom`/`dateTo` của 8 trang /bao-cao/*. Đổi ở ĐÂY thì phải đổi
 * cả bên resolver — hai đầu lệch tên = bộ lọc người dùng bấm bị bỏ qua, không báo lỗi.
 */
export const SCOPE_PARAM = {
  center: "center",
  from: "from",
  to: "to",
  split: "split",
  tab: "tab",
} as const;

/** Giá trị `?center=` nghĩa "toàn bộ phạm vi cho phép của actor". */
export const ALL_CENTERS = "ALL";

export type ScopeCenterOption = { id: string; name: string };

/**
 * Giá trị cho input hidden `center` (A-02-5: `ALL` hoặc danh sách ghép phẩy).
 *
 * Chuẩn hoá hai chỗ, vì cả hai đều đổ vào khoá cache ở server (L-A10):
 *  - luôn SẮP XẾP ⇒ cùng một tập tick theo thứ tự khác nhau cho cùng một URL;
 *  - "tick đủ mọi cơ sở" ⇒ `ALL` ⇒ cùng nghĩa thì cùng một khoá, không nhân đôi entry.
 */
export function serializeCenterParam(
  selected: readonly string[] | null,
  allowedIds: readonly string[],
): string {
  if (selected === null) return ALL_CENTERS;
  const allowed = new Set(allowedIds);
  const picked = [...new Set(selected)].filter((id) => allowed.has(id)).sort();
  if (picked.length === 0 || picked.length === allowed.size) return ALL_CENTERS;
  return picked.join(",");
}

/**
 * Bật/tắt một cơ sở trong lựa chọn hiện tại. `null` = "tất cả".
 *
 * Khi đang là `null`, mọi cơ sở hiển thị là đã tick, nên bấm bỏ một cơ sở phải ra
 * "tất cả TRỪ cơ sở đó" — đúng cảm giác checkbox, thay vì nhảy về "chỉ cơ sở đó".
 */
export function toggleCenter(
  selected: readonly string[] | null,
  id: string,
  allowedIds: readonly string[],
): string[] | null {
  const base = selected ?? allowedIds;
  const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
  // Bỏ tick cơ sở cuối cùng → quay về "tất cả", không rơi vào trạng thái chết
  // "không cơ sở nào" (sẽ là màn hình trắng mà người dùng không hiểu vì sao).
  if (next.length === 0 || next.length === allowedIds.length) return null;
  return [...next].sort();
}

export function ScopeFilterBar({
  basePath,
  centers,
  selection,
  canSelectAll,
  isGlobalAllowed,
  groupByCenter,
  dateFrom,
  dateTo,
  activeTab,
}: {
  basePath: string;
  /** `ctx.visibleCenters` — ĐÃ lọc theo tầm nhìn actor ở resolver. */
  centers: ScopeCenterOption[];
  /** `ctx.selection` — mảng rỗng nghĩa "tất cả cơ sở trong phạm vi". */
  selection: string[];
  /** `ctx.canSelectAll` — A-02-1: ≥2 cơ sở trong phạm vi, KHÔNG chỉ HO. */
  canSelectAll: boolean;
  /** `ctx.isGlobalAllowed` — chỉ đổi NHÃN ("Toàn hệ thống"), không đổi quyền. */
  isGlobalAllowed: boolean;
  /** `ctx.filters.groupByCenter` — trạng thái công tắc "Tách theo cơ sở". */
  groupByCenter: boolean;
  /** `ctx.dateFromStr` / `ctx.dateToStr` — đã chuẩn hoá giờ VN, luôn có giá trị. */
  dateFrom: string;
  dateTo: string;
  activeTab: string;
}) {
  const allowedIds = React.useMemo(() => centers.map((c) => c.id), [centers]);
  // Page cha gắn `key` theo bộ lọc ĐANG ÁP DỤNG ⇒ điều hướng xong component remount và
  // đọc lại `selection` mới. Nhờ vậy không cần useEffect đồng bộ ngược từ props.
  const [selected, setSelected] = React.useState<string[] | null>(() =>
    selection.length > 0 ? [...selection].sort() : null,
  );

  const selectedCount = selected === null ? centers.length : selected.length;
  // L-A12: công tắc "Tách theo cơ sở" KHÔNG hiện khi chỉ 1 cơ sở — tách và gộp cho
  // cùng con số. Đếm theo lựa chọn ĐANG bấm (chưa submit) để công tắc xuất hiện/biến
  // mất ngay. Không render ⇒ form GET bỏ luôn `split` ⇒ về mặc định GỘP.
  const showSplit = selectedCount >= 2;

  const allLabel = isGlobalAllowed ? "Toàn hệ thống" : "Tất cả cơ sở của bạn";
  const triggerLabel =
    selected === null
      ? allLabel
      : selected.length === 1
        ? (centers.find((c) => c.id === selected[0])?.name ?? "1 cơ sở")
        : `${selected.length} cơ sở`;

  const isChecked = (id: string) => selected === null || selected.includes(id);

  return (
    <form
      method="GET"
      action={basePath}
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {/* Đổi bộ lọc KHÔNG được nhảy về tab đầu. */}
      {activeTab ? <input type="hidden" name={SCOPE_PARAM.tab} value={activeTab} /> : null}
      {/* Thứ duy nhất gửi lên server cho cơ sở: chuỗi ghép phẩy (A-02-5). */}
      <input
        type="hidden"
        name={SCOPE_PARAM.center}
        value={serializeCenterParam(selected, allowedIds)}
      />

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Cơ sở</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground hover:bg-muted sm:w-56"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{triggerLabel}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto">
            {/* Group BẮT BUỘC quanh DropdownMenuLabel: Menu.GroupLabel của Base UI THROW
                nếu không có Menu.Group bọc ngoài — mở dropdown là crash cả tab (sự cố
                prod 10/07, xem components/admin/role-switcher.tsx). */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Chọn một hoặc nhiều cơ sở
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {canSelectAll ? (
                <DropdownMenuCheckboxItem
                  checked={selected === null}
                  onCheckedChange={() => setSelected(null)}
                >
                  {allLabel}
                </DropdownMenuCheckboxItem>
              ) : null}
              {centers.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={isChecked(c.id)}
                  onCheckedChange={() => setSelected((prev) => toggleCenter(prev, c.id, allowedIds))}
                >
                  {c.name}
                </DropdownMenuCheckboxItem>
              ))}
              {centers.length === 0 ? (
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Bạn chưa được gán cơ sở nào.
                </DropdownMenuLabel>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="scope-from" className="text-xs text-muted-foreground">
            Từ ngày
          </label>
          <input
            id="scope-from"
            type="date"
            name={SCOPE_PARAM.from}
            defaultValue={dateFrom}
            className="rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="scope-to" className="text-xs text-muted-foreground">
            Đến ngày
          </label>
          <input
            id="scope-to"
            type="date"
            name={SCOPE_PARAM.to}
            defaultValue={dateTo}
            className="rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground"
          />
        </div>
      </div>

      {showSplit ? (
        <label className="flex items-center gap-2 text-sm text-foreground sm:pb-1.5">
          <input
            type="checkbox"
            name={SCOPE_PARAM.split}
            value="1"
            defaultChecked={groupByCenter}
            className="h-4 w-4 rounded border-border"
          />
          Tách theo cơ sở
        </label>
      ) : null}

      <div className="flex gap-2 sm:pb-0.5">
        <Button type="submit" size="sm">
          Áp dụng
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link
            href={
              activeTab
                ? `${basePath}?${SCOPE_PARAM.tab}=${encodeURIComponent(activeTab)}`
                : basePath
            }
          >
            Đặt lại
          </Link>
        </Button>
      </div>
    </form>
  );
}
