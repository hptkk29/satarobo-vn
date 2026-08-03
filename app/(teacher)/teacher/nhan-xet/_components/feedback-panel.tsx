// app/(teacher)/teacher/nhan-xet/_components/feedback-panel.tsx — #06 (L6).
//
// Visual PORT từ mock satarobo-ui-giaovien (evaluation-form + class-hub tab Nhận xét)
// rút về đúng data contract thật: StudentSessionFeedback = comment + rating 1-5/HV.
// Mỗi HV 1 khối: avatar initials + tên + 5 nút sao (bấm lại sao đang chọn = bỏ chấm)
// + textarea nhận xét. Nút "Lưu tất cả" gọi saveSessionFeedback (TÁI DÙNG action
// admin, self-gated canManageSessionRecord) 1 LẦN — FIX #1: CHỈ gửi dòng THỰC SỰ ĐỔI
// (so với dữ liệu đã lưu), không còn gửi cả lớp kèm dòng trống làm server đụng vào
// phiếu rubric chưa ai chạm. Dòng bị XOÁ comment gửi comment rỗng = server gỡ nhận
// xét nhanh (phiếu rubric mở rộng được server GIỮ nguyên phần rubric). Action tự lo
// notify PH (event comment.added + email khi comment đổi) — client không thêm gì.
//
// ⚠️ Câu 46: rows CHỈ chứa tên HV — không SĐT/email/tên PH.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Star, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "../../_components/ui/empty-state";
import { saveSessionFeedback } from "@/app/(admin)/admin/sessions/[id]/_actions";

// Avatar initials — copy helper từ lop/_components/attendance-panel (2 chữ cái cuối tên).
const initials = (name: string) =>
  name
    .split(" ")
    .slice(-2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

const STARS = [1, 2, 3, 4, 5] as const;
const MAX_COMMENT = 3000; // khớp feedbackSchema của action (comment ≤ 3000)

export type FeedbackPanelRow = {
  studentId: string;
  studentName: string;
  existingComment: string;
  existingRating: number | null;
};

export function FeedbackPanel({
  sessionId,
  rows,
  editable,
}: {
  sessionId: string;
  rows: FeedbackPanelRow[];
  editable: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, { comment: string; rating: number | null }>>(
    () =>
      Object.fromEntries(
        rows.map((r) => [r.studentId, { comment: r.existingComment, rating: r.existingRating }]),
      ),
  );
  const [pending, startTransition] = useTransition();

  function setComment(studentId: string, comment: string) {
    setState((s) => ({ ...s, [studentId]: { ...s[studentId], comment } }));
  }
  function setRating(studentId: string, rating: number) {
    // Bấm lại đúng sao đang chọn = bỏ chấm (rating về null).
    setState((s) => ({
      ...s,
      [studentId]: { ...s[studentId], rating: s[studentId]?.rating === rating ? null : rating },
    }));
  }

  function saveAll() {
    // FIX #1 (client) — CHỈ gửi dòng dirty (comment/sao đổi so với đã lưu). Dòng không
    // chạm KHÔNG gửi → server không nhầm phiếu rubric-only (comment rỗng) thành lệnh xoá.
    const items = rows
      .filter((r) => {
        const cur = state[r.studentId] ?? { comment: r.existingComment, rating: r.existingRating };
        return (
          cur.comment.trim() !== r.existingComment.trim() ||
          (cur.rating ?? null) !== (r.existingRating ?? null)
        );
      })
      .map((r) => ({
        studentId: r.studentId,
        comment: state[r.studentId]?.comment ?? "",
        rating: state[r.studentId]?.rating ?? null,
      }));
    if (items.length === 0) {
      toast("Không có thay đổi để lưu");
      return;
    }
    startTransition(async () => {
      const res = await saveSessionFeedback({ sessionId, items });
      if (res.ok) {
        toast.success(`Đã lưu nhận xét ${items.length} học viên`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (rows.length === 0) {
    return <EmptyState icon={Users} title="Không có học viên đi học để nhận xét." />;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const cur = state[r.studentId] ?? { comment: "", rating: null };
        return (
          <div key={r.studentId} className="t-card p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
                  {initials(r.studentName)}
                </span>
                <p className="truncate text-sm font-semibold text-foreground">{r.studentName}</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {STARS.map((star) => {
                  const active = cur.rating != null && star <= cur.rating;
                  return (
                    <button
                      key={star}
                      type="button"
                      disabled={!editable || pending}
                      onClick={() => setRating(r.studentId, star)}
                      aria-pressed={cur.rating === star}
                      aria-label={`${star} sao — ${r.studentName}`}
                      className="rounded p-1 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Star
                        aria-hidden
                        className={cn(
                          "h-5 w-5",
                          active ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
            <Textarea
              value={cur.comment}
              maxLength={MAX_COMMENT}
              rows={2}
              disabled={!editable || pending}
              onChange={(e) => setComment(r.studentId, e.target.value)}
              placeholder="Nhận xét buổi học của học viên…"
              aria-label={`Nhận xét — ${r.studentName}`}
              className="mt-3 resize-y"
            />
          </div>
        );
      })}

      {editable && (
        <div className="flex flex-col items-end gap-1.5">
          <Button onClick={saveAll} disabled={pending}>
            <Save className="mr-1.5 h-4 w-4" />
            {pending ? "Đang lưu…" : "Lưu tất cả"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Xoá nội dung ô nhận xét rồi lưu = gỡ nhận xét nhanh của học viên đó (sao chỉ được
            lưu kèm nhận xét; phiếu rubric đã chấm ở hub lớp vẫn được giữ nguyên).
          </p>
        </div>
      )}
    </div>
  );
}
