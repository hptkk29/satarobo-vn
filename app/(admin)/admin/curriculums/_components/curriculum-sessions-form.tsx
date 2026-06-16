"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import {
  applyResizeCurriculum,
  previewResizeCurriculum,
} from "../_actions";

type Plan = {
  current: number;
  target: number;
  mode: "noop" | "increase" | "decrease";
  toCreateCount: number;
  toArchive: {
    id: string;
    order: number;
    title: string;
    examCount: number;
    assignmentCount: number;
    documentCount: number;
    hasLinks: boolean;
    isInUse: boolean;
  }[];
  blocked: { order: number }[];
  needsConfirm: boolean;
};

export function CurriculumSessionsForm({
  curriculumId,
  currentCount,
  expectedVersions,
}: {
  curriculumId: string;
  currentCount: number;
  // map lessonId → version (buổi đang hoạt động) cho optimistic-lock khi giảm.
  expectedVersions: Record<string, number>;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<number>(currentCount);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function done(msg: string) {
    setNotice(msg);
    setPlan(null);
    router.refresh();
  }

  function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (target < 1) {
      setError("Số buổi phải ≥ 1");
      return;
    }
    startTransition(async () => {
      const res = await previewResizeCurriculum(curriculumId, target);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const p = res.data as Plan;
      if (p.mode === "noop") {
        setNotice("Số buổi không đổi.");
        return;
      }
      if (p.mode === "increase") {
        // Tăng → áp dụng ngay, không cần confirm.
        const apply = await applyResizeCurriculum({ curriculumId, targetN: target });
        if (!apply.ok) {
          setError(apply.error);
          return;
        }
        done(`Đã thêm ${apply.data?.created ?? 0} buổi mới.`);
        return;
      }
      // decrease → mở modal xác nhận
      setPlan(p);
    });
  }

  function confirmDecrease() {
    setError(null);
    startTransition(async () => {
      const apply = await applyResizeCurriculum({
        curriculumId,
        targetN: target,
        confirm: true,
        expectedVersions,
      });
      if (!apply.ok) {
        setError(apply.error);
        return;
      }
      done(`Đã lưu trữ ${apply.data?.archived ?? 0} buổi.`);
    });
  }

  const hasBlocked = (plan?.blocked.length ?? 0) > 0;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700">
        Số buổi
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Nhập tổng số buổi. Tăng → thêm buổi mới ở cuối (giữ nguyên buổi cũ); giảm →
        lưu trữ buổi cuối (có cảnh báo nếu gắn bài tập/đề thi/tài liệu, không xóa).
      </p>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <form onSubmit={handlePreview} className="mt-3 flex items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-600">
            Tổng số buổi (hiện tại: {currentCount})
          </span>
          <input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={pending}
            className="w-32 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Đang xử lý..." : "Áp dụng"}
        </button>
      </form>

      {plan && plan.mode === "decrease" && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8"
          onClick={() => !pending && setPlan(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => !pending && setPlan(null)}
              aria-label="Đóng"
              className="absolute right-3 top-3 rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Xác nhận giảm còn {plan.target} buổi
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              {plan.toArchive.length} buổi sẽ được <strong>lưu trữ</strong> (đọc-only,
              không xóa — có thể khôi phục sau):
            </p>

            <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
              {plan.toArchive.map((l) => (
                <li
                  key={l.id}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-neutral-800">
                    Bài {l.order}: {l.title}
                  </span>
                  {l.isInUse && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                      Đang sử dụng — không thể loại
                    </span>
                  )}
                  {l.hasLinks && (
                    <span className="ml-2 text-xs text-amber-700">
                      ⚠ {l.examCount} đề thi · {l.assignmentCount} bài tập ·{" "}
                      {l.documentCount} tài liệu (giữ nguyên link)
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {hasBlocked && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Có buổi đang được sử dụng (IN_USE). Hãy đổi trạng thái khỏi “Đang sử
                dụng” trước khi loại.
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPlan(null)}
                disabled={pending}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={confirmDecrease}
                disabled={pending || hasBlocked}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Đang lưu..." : "Xác nhận lưu trữ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
