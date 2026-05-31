"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitSurveyResponse } from "./_actions";

export function SurveyForm({ surveyId, title }: { surveyId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  function submit() {
    if (score == null) {
      toast.error("Vui lòng chọn điểm 0–10");
      return;
    }
    startTransition(async () => {
      const res = await submitSurveyResponse({ surveyId, npsScore: score, comment });
      if (res.ok) { toast.success("Cảm ơn đánh giá của quý phụ huynh!"); router.refresh(); }
      else toast.error(res.error ?? "Lỗi gửi khảo sát");
    });
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="font-semibold text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-600">
        Anh/chị có sẵn sàng giới thiệu Sata Robo cho phụ huynh khác? (0 = không, 10 = rất sẵn sàng)
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }).map((_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(n)}
            className={`h-9 w-9 rounded-lg border text-sm font-bold ${
              score === n
                ? "border-orange-500 bg-orange-500 text-white"
                : "border-neutral-200 text-neutral-600 hover:border-orange-300"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="Góp ý thêm (tuỳ chọn)…"
        className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {pending ? "Đang gửi…" : "Gửi khảo sát"}
      </button>
    </div>
  );
}
