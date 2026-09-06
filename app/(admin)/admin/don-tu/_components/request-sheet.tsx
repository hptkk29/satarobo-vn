"use client";

// app/(admin)/admin/don-tu/_components/request-sheet.tsx — chi tiết MỘT đơn + chỗ quyết định.
//
// Vì sao file này tồn tại: bảng chỉ đủ chỗ cho thứ dùng để SO SÁNH các đơn với nhau. Thứ dùng để
// QUYẾT ĐỊNH một đơn (lý do người ta viết, giờ đề nghị, lỗi áp lần trước, ai đã duyệt) thì cần cả
// một khối văn bản — nên nó nằm ở đây, mở ra bên phải mà không rời khỏi hàng chờ.
//
// Điều dễ vỡ: cụm nút duyệt/từ chối chỉ hiện với đơn PENDING. Đơn đã xử lý mở ra vẫn phải đọc được
// (đó là sổ tra cứu), nhưng không có đường bấm — server cũng chặn, đây chỉ là lớp thứ hai.
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EFFECT_CLS, PILL } from "@/components/admin/cham-cong/classes";
import { cn } from "@/lib/utils";
import type { WorkRequestStatusV } from "@/lib/work-request";
import type { QueueRow } from "./types";
import { WorkRequestReview } from "./work-request-review";

const STATUS_CLS: Record<WorkRequestStatusV, string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink",
  APPROVED: "bg-state-success-soft text-state-success-ink",
  REJECTED: "bg-state-danger-soft text-state-danger-ink",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </>
  );
}

export function RequestSheet({ row, onClose }: { row: QueueRow | null; onClose: () => void }) {
  return (
    <Sheet
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="overflow-y-auto sm:max-w-xl">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{row.kindLabel}</SheetTitle>
              <SheetDescription>
                {row.requesterName} · {row.centerLabel}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(PILL, STATUS_CLS[row.status])}>{row.statusLabel}</span>
                {row.submittedLate && (
                  <span className={cn(PILL, "bg-state-warning-soft text-state-warning-ink")}>Nộp muộn</span>
                )}
                {row.applied && (
                  <span className={cn(PILL, "bg-state-success-soft text-state-success-ink")}>
                    Đã áp lên lịch
                  </span>
                )}
              </div>

              <dl className="grid grid-cols-[8rem_1fr] items-baseline gap-x-3 gap-y-2">
                <Row label="Áp dụng">
                  <span className="tabular-nums">{row.applyTitle}</span>
                  {row.dueLabel && <span className="ml-2 text-muted-foreground">· {row.dueLabel}</span>}
                </Row>
                {row.timeLabel && (
                  <Row label="Khung giờ">
                    <span className="font-mono">{row.timeLabel}</span>
                  </Row>
                )}
                {row.requestedLabel && (
                  <Row label="Giờ đề nghị">
                    <span className="font-mono">{row.requestedLabel}</span>
                  </Row>
                )}
                <Row label="Thay đổi">
                  <span className={EFFECT_CLS[row.effectTone]}>{row.effectText}</span>
                </Row>
                {row.className && <Row label="Lớp">{row.className}</Row>}
                {row.newShiftCode && (
                  <Row label="Ca mới">
                    <span className="font-mono font-semibold">{row.newShiftCode}</span>
                  </Row>
                )}
                {row.leaveName && <Row label="Loại nghỉ">{row.leaveName}</Row>}
                {row.targetName && (
                  <Row label="Người thay">
                    {row.targetName}
                    {row.targetShiftCode && (
                      <span className="ml-1.5 font-mono text-muted-foreground">
                        (ca {row.targetShiftCode})
                      </span>
                    )}
                  </Row>
                )}
                <Row label="Gửi lúc">
                  <span className="tabular-nums">{row.createdAtLabel}</span>
                  <span className="ml-2 text-muted-foreground">· chờ {row.ageLabel}</span>
                </Row>
              </dl>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Lý do người nộp viết
                </p>
                <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm text-foreground">
                  {row.reason}
                </p>
                {row.detail && <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>}
              </div>

              {row.status === "PENDING" && row.applyError && (
                <p className="rounded-lg bg-state-danger-soft p-3 text-sm text-state-danger-ink">
                  Lần duyệt trước không áp được: {row.applyError}
                </p>
              )}

              {row.status !== "PENDING" && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Đã xử lý
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {row.reviewedByName ?? "—"}
                    {row.reviewedAtLabel && (
                      <span className="ml-2 text-muted-foreground tabular-nums">{row.reviewedAtLabel}</span>
                    )}
                  </p>
                  {row.reviewNote && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{row.reviewNote}</p>
                  )}
                </div>
              )}

              {row.status === "PENDING" && (
                <WorkRequestReview
                  requestId={row.id}
                  effectHint={row.effectHint}
                  effectCode={row.effectCode}
                  effectBlocked={row.effectBlocked}
                  subject={row.subject}
                  onDone={onClose}
                />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
