"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle2, SearchX, X } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  getMakeupSuggestions,
  scheduleMakeupAction,
  completeMakeupAction,
  cancelMakeupAction,
} from "../_actions";
import { formatDateVN } from "@/lib/format/date";

export interface MakeupItem {
  id: string;
  studentName: string;
  className: string;
  missedDate: string | null;
  missedLesson: string | null;
  status: string;
  makeupDate: string | null;
}

type Sugg = {
  sessionId: string;
  className: string;
  date: string;
  lessonOrder: number | null;
  lessonTitle: string | null;
  // R7-08 — ưu tiên cơ sở nhà + còn chỗ.
  isHomeCenter?: boolean;
  capacityLeft?: number;
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink",
  SCHEDULED: "bg-state-info-soft text-state-info-ink",
  COMPLETED: "bg-state-success-soft text-state-success-ink",
  CANCELLED: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ xếp bù",
  SCHEDULED: "Đã xếp bù",
  COMPLETED: "Đã bù xong",
  CANCELLED: "Đã huỷ",
};

export function MakeupRow({ item }: { item: MakeupItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [suggs, setSuggs] = useState<Sugg[] | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  function loadSuggestions() {
    startTransition(async () => {
      const res = await getMakeupSuggestions(item.id);
      // QA 20/07 — kết quả rỗng hiển thị INLINE (khối bên dưới), không chỉ toast:
      // người dùng từng tưởng nút hỏng vì "bấm không thấy gì".
      setSuggs(res);
    });
  }

  function schedule(sessionId: string) {
    startTransition(async () => {
      const res = await scheduleMakeupAction(item.id, sessionId);
      if (res.ok) {
        toast.success("Đã xếp buổi bù");
        // T4.1 — buổi đích đang trùng phòng/GV với lớp khác → báo để theo dõi.
        if (res.warning) toast.warning(res.warning);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }
  function complete() {
    startTransition(async () => {
      const res = await completeMakeupAction(item.id);
      if (res.ok) { toast.success("Đã hoàn tất bù — số buổi cập nhật"); router.refresh(); }
      else toast.error(res.error ?? "Lỗi");
    });
  }
  // QA 20/07 — Huỷ là hành động phá huỷ (mất yêu cầu bù, không có undo) → bắt buộc
  // xác nhận qua dialog thay vì huỷ ngay 1 click.
  function cancel() {
    startTransition(async () => {
      const res = await cancelMakeupAction(item.id);
      if (!res.ok) {
        toast.error(res.error ?? "Không huỷ được yêu cầu bù");
        setConfirmCancel(false);
        return;
      }
      toast.success("Đã huỷ nhu cầu bù");
      setConfirmCancel(false);
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold text-foreground">{item.studentName}</span>
          <span className="ml-2 text-sm text-muted-foreground">{item.className}</span>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[item.status]}`}>
          {STATUS_LABEL[item.status] ?? item.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Buổi lỡ: {item.missedDate ? formatDateVN(item.missedDate) : "—"}
        {item.missedLesson ? ` · ${item.missedLesson}` : ""}
        {item.makeupDate && ` → bù: ${formatDateVN(item.makeupDate)}`}
      </p>

      {(item.status === "PENDING" || item.status === "SCHEDULED") && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.status === "PENDING" && (
            <button type="button" onClick={loadSuggestions} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">
              <CalendarPlus className="h-4 w-4" /> Gợi ý buổi bù
            </button>
          )}
          {item.status === "SCHEDULED" && (
            <button type="button" onClick={complete} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-state-success-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-state-success-ink-hover disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" /> Đánh dấu đã bù
            </button>
          )}
          <button type="button" onClick={() => setConfirmCancel(true)} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-state-danger-soft px-3 py-1.5 text-sm font-semibold text-state-danger-ink hover:bg-state-danger-soft disabled:opacity-50">
            <X className="h-4 w-4" /> Huỷ
          </button>
          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            pending={pending}
            title={`Huỷ yêu cầu học bù của ${item.studentName}?`}
            description={
              <>
                Yêu cầu bù cho buổi lỡ
                {item.missedDate ? ` ngày ${formatDateVN(item.missedDate)}` : ""} (lớp{" "}
                <strong>{item.className}</strong>) sẽ bị huỷ. Không có danh sách đã huỷ
                và không hoàn tác được — nếu cần bù lại phải tạo yêu cầu mới từ điểm danh.
              </>
            }
            confirmLabel="Huỷ yêu cầu bù"
            onConfirm={cancel}
          />
        </div>
      )}

      {/* QA 20/07 — trạng thái rỗng inline khi bấm "Gợi ý buổi bù" không có kết quả. */}
      {suggs && suggs.length === 0 && item.status === "PENDING" && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-state-warning-soft bg-state-warning-soft p-2.5 text-sm text-state-warning-ink">
          <SearchX className="h-4 w-4 shrink-0" />
          Chưa tìm được buổi bù phù hợp (cần cùng khoá/bài học, chưa vượt tiến độ, còn
          chỗ). Thử lại sau khi có lịch buổi mới.
        </div>
      )}

      {suggs && suggs.length > 0 && item.status === "PENDING" && (
        <div className="mt-2 space-y-1 rounded-lg border border-border bg-muted p-2">
          {suggs.map((s) => (
            <button key={s.sessionId} type="button" onClick={() => schedule(s.sessionId)} disabled={pending}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-card">
              <span className="flex items-center gap-1.5">
                {s.className}{s.lessonTitle ? ` · Bài ${s.lessonOrder}: ${s.lessonTitle}` : ""}
                {s.isHomeCenter === false && (
                  <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    Cơ sở khác
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDateVN(s.date)}
                {typeof s.capacityLeft === "number" ? ` · còn ${s.capacityLeft} chỗ` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
