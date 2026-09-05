"use client";

/**
 * Site Sale — nút "Hoàn tất" một việc chăm sóc học viên.
 *
 * ── BẢN ĐÔI CỦA `CompleteCareButton` trong
 *    `app/(admin)/admin/canh-bao-rui-ro/_components/alert-actions.tsx` ────────
 * Tách bản riêng theo chốt 04/09/2026. Bản admin GIỮ NGUYÊN, không sửa.
 *
 * 🔴 ĐƯỜNG GHI KHÔNG TÁCH: vẫn gọi đúng Server Action `completeCareTask` của khu
 *    quản trị. Nó làm HAI việc trong một lượt (đóng việc chăm sóc **và** đóng
 *    cảnh báo rủi ro sinh ra nó, nếu còn OPEN) và có `passesScope` chống IDOR
 *    liên cơ sở. Viết lại đường ghi thứ hai là chép cả hai thứ đó — và chép sót
 *    một trong hai thì không có gì báo.
 *
 * ⚠️ `router.refresh()` BẮT BUỘC: action gọi `revalidatePath("/cham-soc-hv")`,
 *    `("/canh-bao-rui-ro")`, `("/dashboard")` — ba đường SẠCH của host quản trị,
 *    không đường nào khớp `/sale/cham-soc-hv`. Thiếu nó thì việc vừa hoàn tất vẫn
 *    nằm nguyên trên bảng và người dùng bấm lại lần nữa.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { completeCareTask } from "@/app/(admin)/admin/canh-bao-rui-ro/_actions";

export function NutHoanTatChamSoc({ id }: { id: string }) {
  const router = useRouter();
  const [dangChay, batDau] = useTransition();
  return (
    <button
      type="button"
      disabled={dangChay}
      onClick={() =>
        batDau(async () => {
          const kq = await completeCareTask(id);
          if (kq.ok) {
            toast.success("Đã hoàn tất chăm sóc");
            router.refresh();
          } else toast.error(kq.error ?? "Lỗi");
        })
      }
      className="rounded-lg bg-state-success-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-state-success-ink-hover disabled:opacity-50"
    >
      Hoàn tất
    </button>
  );
}
