"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resolveRiskAlert, escalateRiskAlert, completeCareTask } from "../_actions";

export function ResolveButtons({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const r = await resolveRiskAlert(id);
          if (r.ok) { toast.success("Đã đóng cảnh báo"); router.refresh(); } else toast.error(r.error ?? "Lỗi");
        })}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        Đã xử lý
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const r = await escalateRiskAlert(id);
          if (r.ok) { toast.success("Đã chuyển cấp"); router.refresh(); } else toast.error(r.error ?? "Lỗi");
        })}
        className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        Chuyển cấp
      </button>
    </div>
  );
}

export function CompleteCareButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => {
        const r = await completeCareTask(id);
        if (r.ok) { toast.success("Đã hoàn tất chăm sóc"); router.refresh(); } else toast.error(r.error ?? "Lỗi");
      })}
      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
    >
      Hoàn tất
    </button>
  );
}
