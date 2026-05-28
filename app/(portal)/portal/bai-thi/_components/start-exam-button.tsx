"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startAttempt } from "../actions";

export function StartExamButton({
  examId,
  resume,
}: {
  examId: string;
  resume: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go() {
    startTransition(async () => {
      const res = await startAttempt(examId);
      if (res.ok) {
        router.push(`/portal/bai-thi/${examId}`);
      } else {
        toast.error(res.error ?? "Không vào được bài thi");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={pending}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${
        resume ? "bg-amber-500 hover:bg-amber-600" : "bg-orange-500 hover:bg-orange-600"
      }`}
    >
      {pending ? "Đang mở…" : resume ? "Tiếp tục làm" : "Vào làm"}
    </button>
  );
}
