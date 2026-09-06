"use client";

// components/cham-cong/my-requests.tsx — "ĐƠN CỦA TÔI" của người dùng site admin (tư vấn, giáo vụ,
// kế toán, người Hội sở…). Site GV giữ danh sách riêng (`don-tu-client.tsx`) vì đã có bộ lọc và
// EmptyState theo vỏ site GV; FORM thì dùng chung một bản (`request-form.tsx`).
//
// Vì sao màn này tồn tại: nhân viên cần thấy đơn mình nộp ĐANG Ở ĐÂU — chờ ai duyệt, bị từ chối vì
// lý do gì, hay đã duyệt mà hệ thống KHÔNG áp được (cột "Phản hồi"). Không có nó thì mỗi lần thắc
// mắc là một tin nhắn cho Quản lý.
//
// DỄ VỠ: file nằm trong `components/cham-cong/**` — thư mục dùng chung với site giáo viên ⇒ KHÔNG
// import `components/admin/**` và CHỈ dùng token `:root` (không `primary-soft`/`primary-ink`).
import { useMemo, useState } from "react";
import { Inbox, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  WR_KIND_LABEL,
  WR_STATUS_LABEL,
  type WorkRequestKindV,
  type WorkRequestStatusV,
} from "@/lib/work-request";
import type { RequestFormOptions } from "@/lib/cham-cong/request-form-data";
import { RequestForm } from "./request-form";

export type MyRequestRow = {
  id: string;
  kind: WorkRequestKindV;
  status: WorkRequestStatusV;
  centerLabel: string;
  fromLabel: string | null;
  toLabel: string | null;
  time: string | null;
  detail: string | null;
  reason: string;
  submittedLate: boolean;
  applyError: string | null;
  reviewNote: string | null;
  reviewedByName: string | null;
  createdAtLabel: string;
};

const PILL = "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold";
const TH = "whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const TD = "px-5 py-3.5 text-sm text-foreground";
const TR = "border-b border-border/60 align-top transition-colors last:border-0 hover:bg-muted/50";
const TAB = "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring";

const STATUS_CLS: Record<WorkRequestStatusV, string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink",
  APPROVED: "bg-state-success-soft text-state-success-ink",
  REJECTED: "bg-state-danger-soft text-state-danger-ink",
};

type Filter = "ALL" | WorkRequestStatusV;

export function MyRequests({
  rows,
  options,
  presetKind,
  presetDate,
  presetStatus,
}: {
  rows: MyRequestRow[];
  options: RequestFormOptions;
  presetKind: WorkRequestKindV | null;
  /** `?date=` từ lịch ca — điền sẵn ngày vào form. */
  presetDate?: string | null;
  /** `?status=` — chỉ là trạng thái BAN ĐẦU của bộ lọc; lọc chạy ở client, không tải lại trang. */
  presetStatus?: Filter | null;
}) {
  const [open, setOpen] = useState(Boolean(presetKind));
  const [filter, setFilter] = useState<Filter>(presetStatus ?? "ALL");

  const counts = useMemo(() => {
    const c = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<WorkRequestStatusV, number>;
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const shown = filter === "ALL" ? rows : rows.filter((r) => r.status === filter);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "ALL", label: "Tất cả", count: rows.length },
    { key: "PENDING", label: "Chờ duyệt", count: counts.PENDING },
    { key: "APPROVED", label: "Đã duyệt", count: counts.APPROVED },
    { key: "REJECTED", label: "Từ chối", count: counts.REJECTED },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <nav aria-label="Lọc theo trạng thái đơn" className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const on = filter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(t.key)}
                className={cn(
                  TAB,
                  on
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {t.label} <span className="tabular-nums">{t.count}</span>
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-2 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" aria-hidden /> Tạo đơn
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-12 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="h-5 w-5" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-foreground">
            {rows.length === 0 ? "Bạn chưa nộp đơn nào" : `Không có đơn nào ở mục “${tabs.find((t) => t.key === filter)?.label}”`}
          </p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {rows.length === 0
              ? "Đổi ca, nghỉ phép, chỉnh công (quên quét), tăng ca, đi muộn/về sớm, công tác — đều nộp ở đây."
              : "Chọn “Tất cả” để xem lại toàn bộ đơn bạn đã nộp."}
          </p>
        </div>
      ) : (
        <PhanTrangBang cuonNgang tenDonVi="đơn" khoaGhiNho="cua-toi">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th scope="col" className={TH}>Loại</th>
                <th scope="col" className={TH}>Ngày / giờ</th>
                <th scope="col" className={TH}>Cơ sở nhận</th>
                <th scope="col" className={TH}>Lý do</th>
                <th scope="col" className={TH}>Trạng thái</th>
                <th scope="col" className={TH}>Phản hồi</th>
                <th scope="col" className={TH}>Gửi lúc</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={TR}>
                  <td className={cn(TD, "font-medium")}>
                    {WR_KIND_LABEL[r.kind]}
                    {r.detail && <div className="text-xs font-normal text-muted-foreground">{r.detail}</div>}
                  </td>
                  <td className={cn(TD, "whitespace-nowrap tabular-nums")}>
                    {r.fromLabel ?? "—"}
                    {r.toLabel && r.toLabel !== r.fromLabel ? ` → ${r.toLabel}` : ""}
                    {r.time ? <div className="font-mono text-xs text-muted-foreground">{r.time}</div> : null}
                  </td>
                  <td className={cn(TD, "whitespace-nowrap")}>{r.centerLabel}</td>
                  <td className={cn(TD, "max-w-[20rem] whitespace-pre-wrap")}>{r.reason}</td>
                  <td className={cn(TD, "whitespace-normal")}>
                    <span className={cn(PILL, STATUS_CLS[r.status])}>{WR_STATUS_LABEL[r.status]}</span>
                    {r.submittedLate && <span className={cn(PILL, STATUS_CLS.PENDING, "ml-1")}>Nộp muộn</span>}
                    {r.status === "PENDING" && r.applyError && (
                      <span className={cn(PILL, STATUS_CLS.REJECTED, "ml-1")} title={r.applyError}>
                        không áp được
                      </span>
                    )}
                  </td>
                  <td className={cn(TD, "max-w-[16rem] whitespace-pre-wrap text-muted-foreground")}>
                    {r.reviewNote ? (
                      <>
                        {r.reviewedByName ? <span className="font-medium text-foreground">{r.reviewedByName}: </span> : null}
                        {r.reviewNote}
                      </>
                    ) : (
                      "—"
                    )}
                    {r.status === "PENDING" && r.applyError && (
                      <div className="mt-1 text-xs text-state-danger-ink">
                        Lần duyệt gần nhất không áp được: {r.applyError}
                      </div>
                    )}
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-xs text-muted-foreground")}>{r.createdAtLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PhanTrangBang>
      )}

      {/* Form nằm trong Sheet phải: bảng đơn cũ vẫn đọc được trong lúc điền, và form dài không
          đẩy bảng xuống dưới màn hình. `showCloseButton={false}` vì RequestForm đã có nút Đóng
          riêng — hai chữ X chồng nhau ở một góc là mời bấm nhầm. */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" showCloseButton={false} className="w-full overflow-y-auto sm:max-w-xl">
          <SheetTitle className="sr-only">Tạo đơn mới</SheetTitle>
          <RequestForm
            options={options}
            preset={presetKind}
            presetDate={presetDate}
            onClose={() => setOpen(false)}
            className="rounded-none border-0 shadow-none"
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
