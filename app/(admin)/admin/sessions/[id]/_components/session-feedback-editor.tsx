"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { saveSessionFeedback } from "../_actions";
import { SessionEvalFill } from "@/app/(admin)/admin/evaluations/_components/session-eval-fill";

type StudentRow = {
  studentId: string;
  name: string;
  present: boolean;
  comment: string;
  rating: number | null;
};

export function SessionFeedbackEditor({
  sessionId,
  students,
  canEdit,
}: {
  sessionId: string;
  students: StudentRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<StudentRow[]>(students);

  function update(id: string, patch: Partial<StudentRow>) {
    setRows((cur) => cur.map((r) => (r.studentId === id ? { ...r, ...patch } : r)));
  }

  function save() {
    startTransition(async () => {
      const res = await saveSessionFeedback({
        sessionId,
        items: rows.map((r) => ({
          studentId: r.studentId,
          comment: r.comment,
          rating: r.rating,
        })),
      });
      if (res.ok) {
        toast.success("Đã lưu nhận xét từng học sinh");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (students.length === 0) {
    return <p className="text-sm text-gray-400">Lớp chưa có học sinh đăng ký.</p>;
  }

  return (
    <div className="space-y-4">
      {/* FL4 — phiếu đánh giá buổi học (SESSION_EVAL) động theo từng HS là UI CHÍNH. */}
      <SessionEvalFill
        sessionId={sessionId}
        students={rows.map((r) => ({ studentId: r.studentId, name: r.name, present: r.present }))}
        canEdit={canEdit}
      />

      {/* Đường cũ comment+rating (StudentSessionFeedback) — GIỮ song song (2-phase),
          thu gọn dưới mục phụ; portal /portal/nhan-xet vẫn đọc đường cũ này. */}
      <details className="rounded-lg border border-gray-200 bg-gray-50/60">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-500">
          Nhận xét nhanh (cũ) — nhận xét + chấm sao từng học sinh
        </summary>
        <div className="space-y-3 px-3 pb-3">
          <ul className="divide-y divide-gray-100">
            {rows.map((r) => (
              <li key={r.studentId} className="py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="font-medium text-gray-900">{r.name}</span>
                  {!r.present && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                      Vắng
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <textarea
                    value={r.comment}
                    onChange={(e) => update(r.studentId, { comment: e.target.value })}
                    disabled={!canEdit || pending}
                    rows={2}
                    placeholder="Nhận xét cho học sinh này trong buổi…"
                    className="flex-1 resize-y rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#7C3AED] focus:outline-none disabled:bg-gray-50"
                  />
                  <select
                    value={r.rating ?? ""}
                    onChange={(e) =>
                      update(r.studentId, { rating: e.target.value ? Number(e.target.value) : null })
                    }
                    disabled={!canEdit || pending}
                    className="h-9 rounded-lg border border-gray-300 px-2 text-sm focus:border-[#7C3AED] focus:outline-none disabled:bg-gray-50"
                    aria-label={`Điểm ${r.name}`}
                  >
                    <option value="">— sao —</option>
                    {[5, 4, 3, 2, 1].map((s) => (
                      <option key={s} value={s}>{s} ★</option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
          {canEdit && (
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {pending ? "Đang lưu…" : "Lưu nhận xét nhanh"}
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
