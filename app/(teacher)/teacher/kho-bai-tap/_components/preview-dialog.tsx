"use client";

// Xem trước đề như học viên thấy — Dialog CONTROLLED. Trắc nghiệm: tô XANH đáp án
// đúng. Tự luận: hiện đáp án mẫu (nếu có). Chỉ hiển thị, không sửa.
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { KhoTemplate } from "../_types";

export function PreviewDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: KhoTemplate | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{template?.title ?? "Xem trước"}</DialogTitle>
          <DialogDescription>
            {template
              ? `${template.kind === "CLASSWORK" ? "Kiểm tra" : "Bài tập"} · ${template.questionCount} câu · Thang điểm ${template.totalPoints}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {template && template.description && (
            <p className="rounded-lg bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">
              {template.description}
            </p>
          )}

          {template && template.questions.length === 0 && (
            <p className="text-sm text-muted-foreground">Đề này chưa có câu hỏi nào.</p>
          )}

          {template?.questions.map((q, qi) => (
            <div key={q.id} className="rounded-xl border border-border p-4">
              <div className="mb-2 flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                  {qi + 1}
                </span>
                <p className="whitespace-pre-wrap text-sm font-medium text-foreground">
                  {q.text}
                </p>
              </div>

              {q.type === "MULTIPLE_CHOICE" ? (
                <ul className="mt-2 space-y-1.5 pl-8">
                  {q.choices.map((c, ci) => (
                    <li
                      key={c.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
                        c.isCorrect
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-600/40 dark:bg-emerald-600/15 dark:text-emerald-200"
                          : "border-border text-foreground",
                      )}
                    >
                      <span className="text-xs font-semibold text-muted-foreground">
                        {String.fromCharCode(65 + ci)}.
                      </span>
                      <span className="flex-1">{c.text}</span>
                      {c.isCorrect && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3.5 w-3.5" aria-hidden /> Đáp án đúng
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 pl-8">
                  <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                    Tự luận
                  </span>
                  {q.correctAnswer ? (
                    <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800 dark:border-emerald-600/40 dark:bg-emerald-600/15 dark:text-emerald-200">
                      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide">
                        Đáp án mẫu
                      </p>
                      <p className="whitespace-pre-wrap">{q.correctAnswer}</p>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Học viên trả lời tự do (chưa đặt đáp án mẫu).
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
