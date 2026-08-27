// app/(admin)/admin/lop-trial/_components/booking-filter-chips.tsx — GĐ2.
//
// SERVER Component (không "use client"): chỉ render <Link>, không state/effect/handler.

import type { JSX } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
// ⚠️ Bẫy tên: enum Prisma `TrialClassStatus` (nguồn của 2 hằng dưới đây) thực chất
// là trạng thái LỊCH HẸN học thử 1-1 (SCHEDULED…REJECTED), KHÔNG phải trạng thái
// lớp trải nghiệm V2 (OPEN/RUNNING/COMPLETED/CANCELLED). Hai miền giá trị rời nhau.
import { TRIAL_STATUS_LABEL, ALL_TRIAL_STATUSES } from "@/lib/trials/status";

const CHIP_BASE = "rounded-full px-3 py-1.5 text-sm transition-colors";

function chipClass(active: boolean): string {
  return cn(
    CHIP_BASE,
    active
      ? "bg-primary text-white"
      : "bg-muted text-muted-foreground hover:bg-muted/70",
  );
}

/**
 * Dựng href cho một chip.
 *
 * ⚠️ Luôn mang theo `q`: chip là <Link> nên URL mới THAY hẳn URL cũ, không
 * merge. Quên `q` là mỗi lần bấm lọc lại xoá trắng ô tìm của người dùng.
 */
function buildHref(status: string | undefined, q: string | undefined): string {
  const sp = new URLSearchParams();
  if (status) sp.set("status", status);
  if (q) sp.set("q", q);
  const qs = sp.toString();
  return qs ? `/lop-trial/lich-hen?${qs}` : "/lop-trial/lich-hen";
}

/**
 * Danh sách chip cho bảng lịch hẹn học thử.
 *
 * Chip "Đang xử lý" cố ý KHÔNG có tham số `status`: bộ lọc mặc định ở
 * `_lib/queries.ts` không chỉ ẩn trạng thái buổi hẹn mà còn loại cả lead đã rời
 * phễu — hai tầng lọc khác nhau, không tái hiện được bằng một `?status=...` nào.
 * Vì thế mới có dòng chú thích bên dưới dãy chip: người dùng màn cũ thấy bảng
 * hụt lead và tưởng mất dữ liệu.
 */
export function BookingFilterChips({
  current,
  q,
}: {
  current?: string;
  q?: string;
}): JSX.Element {
  // Chuỗi rỗng và undefined đều là "chưa lọc" — searchParams trả "" khi URL có `?status=`.
  const active = current || "";

  return (
    <div className="space-y-2">
      <nav
        aria-label="Lọc lịch hẹn theo trạng thái"
        className="flex flex-wrap items-center gap-2"
      >
        <Link
          href={buildHref(undefined, q)}
          aria-current={active === "" ? "page" : undefined}
          className={chipClass(active === "")}
        >
          Đang xử lý
        </Link>
        <Link
          href={buildHref("all", q)}
          aria-current={active === "all" ? "page" : undefined}
          className={chipClass(active === "all")}
        >
          Tất cả
        </Link>
        {ALL_TRIAL_STATUSES.map((status) => (
          <Link
            key={status}
            href={buildHref(status, q)}
            aria-current={active === status ? "page" : undefined}
            className={chipClass(active === status)}
          >
            {TRIAL_STATUS_LABEL[status]}
          </Link>
        ))}
      </nav>

      <p className="text-xs text-muted-foreground">
        Đang xử lý: ẩn buổi đã chốt/từ chối và ẩn lead đã rời phễu (đã ghi danh,
        đã mất, đã đăng ký, trùng lặp).
      </p>
    </div>
  );
}
