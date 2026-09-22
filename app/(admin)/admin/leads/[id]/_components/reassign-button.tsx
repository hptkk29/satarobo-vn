"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { chiaLaiLeadAction } from "../../actions";

export function ReassignButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          // 03/09 — đổi sang `chiaLaiLeadAction`. Nút cũ gọi `autoAssignNewLeadAction`,
          // vốn dành cho lead MỚI và cố ý bỏ qua lead đã có chủ; nó trả `ok: true`
          // kèm `skipped` nên nút báo thành công trong khi lead không đổi tay.
          const res = await chiaLaiLeadAction(leadId);
          if (res.ok) {
            toast.success("Đã chia lại lead theo cấu hình cơ sở");
            router.refresh();
          } else {
            toast.error(res.error ?? "Lỗi chia lead");
          }
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
    >
      <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
      Chia lại lead
    </button>
  );
}
