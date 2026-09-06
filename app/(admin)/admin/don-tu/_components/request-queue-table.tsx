"use client";

// app/(admin)/admin/don-tu/_components/request-queue-table.tsx — hàng chờ duyệt dạng BẢNG.
//
// Vì sao file này tồn tại: bản cũ xếp 200 thẻ dọc, mỗi thẻ 8 dòng chữ nhỏ — không so được đơn nào
// gấp hơn đơn nào. Bảng cho phép liếc một cột (Áp dụng / Tuổi đơn) là thấy thứ tự việc; chi tiết
// đầy đủ và nút quyết định dời sang Sheet bên phải.
//
// Điều dễ vỡ:
//  · Mọi ô đã được ĐỊNH DẠNG SẴN Ở SERVER (chuỗi ngày, giờ VN). Component này không nhận `Date`
//    và không tự format — format ở client là lệch múi giờ (Vercel chạy UTC).
//  · Bảng phải bọc `<PhanTrangBang cuonNgang>` với ĐÚNG MỘT `<tbody>`; tách thân làm hai là mất
//    phân trang IM LẶNG (fail-safe của PhanTrangBang không kêu).
//  · Cả dòng bấm được, nhưng vẫn phải có `<button>` thật ở cột cuối — dòng `<tr onClick>` không
//    dùng được bằng bàn phím.
//  · Dòng 44px = `cn(adminTr, "h-11")` + `py-0` trên từng `<td>`, giống hàng chờ ở `/cham-cong`.
//    Để `adminTd` nguyên (py-3.5) là dòng ~48px, và hai hàng chờ cạnh nhau trong cùng ModuleNav
//    lại có mật độ khác nhau.
//  · Ô chữ dài cắt bằng `<span className="block max-w-[…] truncate">` BÊN TRONG `<td>`, không đắp
//    `max-w` thẳng lên `<td>`: bảng này là `table-layout: auto` ⇒ trình duyệt bỏ qua `max-width`
//    trên ô bảng, mà `adminTd` đã có `whitespace-nowrap` nên ô không cắt, nó nở ra kéo cả cột.
//  · Trạng thái RỖNG thuộc về page (`don-tu/page.tsx` dựng `<EmptyState>` khi `rows.length === 0`),
//    nên ở đây không có nhánh rỗng — một dòng `<td colSpan>` trần vừa không nói vì sao rỗng vừa
//    không cho đường đi tiếp.
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { adminTd, adminTh, adminTr } from "@/components/admin/ui/table";
import { PILL } from "@/components/admin/cham-cong/classes";
import { cn } from "@/lib/utils";
import type { WorkRequestStatusV } from "@/lib/work-request";
import { RequestSheet } from "./request-sheet";

/** Một dòng đơn — TOÀN chuỗi đã format, để component chạy được ở client mà không đụng múi giờ. */
export type QueueRow = {
  id: string;
  status: WorkRequestStatusV;
  statusLabel: string;
  kindLabel: string;
  requesterName: string;
  centerCode: string;
  centerLabel: string;
  /** "09/09" hoặc "09/09 → 12/09". */
  applyLabel: string;
  /** Ngày đầy đủ cho `title` (bảng chỉ đủ chỗ cho dd/MM). */
  applyTitle: string;
  timeLabel: string | null;
  dueLabel: string | null;
  dueTone: "danger" | "warning" | "muted";
  effectText: string;
  effectMuted: boolean;
  effectCode: string | null;
  effectHint: string | null;
  ageLabel: string;
  stale: boolean;
  submittedLate: boolean;
  applyError: string | null;
  applied: boolean;
  /** "Nguyễn A ngày 09/09" — câu xác nhận trước khi duyệt. */
  subject: string;
  reason: string;
  detail: string | null;
  className: string | null;
  requestedLabel: string | null;
  newShiftCode: string | null;
  leaveName: string | null;
  targetName: string | null;
  targetShiftCode: string | null;
  reviewedByName: string | null;
  reviewedAtLabel: string | null;
  reviewNote: string | null;
  createdAtLabel: string;
};

const STATUS_CLS: Record<WorkRequestStatusV, string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink",
  APPROVED: "bg-state-success-soft text-state-success-ink",
  REJECTED: "bg-state-danger-soft text-state-danger-ink",
};

const DUE_CLS = {
  danger: "text-state-danger-ink font-semibold",
  warning: "text-state-warning-ink font-semibold",
  muted: "text-muted-foreground",
} as const;

export function RequestQueueTable({
  rows,
  initialId,
}: {
  rows: QueueRow[];
  /** `?id=` — thông báo/liên kết ngoài mở thẳng một đơn. */
  initialId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(
    initialId && rows.some((r) => r.id === initialId) ? initialId : null,
  );
  const selected = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <PhanTrangBang cuonNgang tenDonVi="đơn" khoaGhiNho="don-tu">
          <table className="w-full min-w-[1000px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th scope="col" className={adminTh}>Người nộp</th>
                <th scope="col" className={adminTh}>Loại</th>
                <th scope="col" className={adminTh}>Áp dụng</th>
                <th scope="col" className={adminTh}>Thay đổi</th>
                <th scope="col" className={adminTh}>Cơ sở</th>
                <th scope="col" className={adminTh}>Tuổi đơn</th>
                <th scope="col" className={adminTh}>Trạng thái</th>
                <th scope="col" className={adminTh}>
                  <span className="sr-only">Mở chi tiết đơn</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpenId(r.id)}
                  className={cn(adminTr, "h-11 cursor-pointer", openId === r.id && "bg-muted/50")}
                >
                  <td className={cn(adminTd, "py-0 font-medium")} title={r.requesterName}>
                    <span className="block max-w-[12rem] truncate">{r.requesterName}</span>
                  </td>
                  <td className={cn(adminTd, "py-0")}>
                    {r.kindLabel}
                    {r.submittedLate && (
                      <span className={cn(PILL, "ml-2 bg-state-warning-soft text-state-warning-ink")}>
                        Nộp muộn
                      </span>
                    )}
                  </td>
                  <td className={cn(adminTd, "py-0")} title={r.applyTitle}>
                    <span className="tabular-nums">{r.applyLabel}</span>
                    {r.timeLabel && (
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.timeLabel}</span>
                    )}
                    {r.dueLabel && (
                      <span className={cn("ml-1.5 text-xs", DUE_CLS[r.dueTone])}>· {r.dueLabel}</span>
                    )}
                  </td>
                  <td
                    className={cn(adminTd, "py-0", r.effectMuted && "text-muted-foreground")}
                    title={r.effectText}
                  >
                    <span className="block max-w-[18rem] truncate">{r.effectText}</span>
                  </td>
                  <td className={cn(adminTd, "py-0 text-muted-foreground")} title={r.centerLabel}>
                    {r.centerCode}
                  </td>
                  <td
                    className={cn(
                      adminTd,
                      "py-0 tabular-nums",
                      r.stale && "font-semibold text-state-danger-ink",
                    )}
                  >
                    {r.ageLabel}
                  </td>
                  <td className={cn(adminTd, "py-0")}>
                    <span className={cn(PILL, STATUS_CLS[r.status])}>{r.statusLabel}</span>
                    {r.applyError && (
                      <span className={cn(PILL, "ml-1.5 bg-state-danger-soft text-state-danger-ink")}>
                        Áp thất bại
                      </span>
                    )}
                  </td>
                  <td className={cn(adminTd, "w-10 py-0 text-right")}>
                    <button
                      type="button"
                      onClick={() => setOpenId(r.id)}
                      aria-label={`Mở đơn ${r.kindLabel} của ${r.requesterName}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ChevronRight aria-hidden className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PhanTrangBang>
      </div>

      <RequestSheet row={selected} onClose={() => setOpenId(null)} />
    </>
  );
}
