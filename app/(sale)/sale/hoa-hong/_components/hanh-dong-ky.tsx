"use client";

/**
 * Site Sale — bốn hành động trên một dòng kỳ hoa hồng.
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/crm/commission/_components/statement-actions.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Ba việc GHI vẫn gọi ĐÚNG Server Action của khu quản
 *    trị — `chotKyHoaHongAction`, `approveStatementAction`, `reopenStatementAction`
 *    — nơi có cổng `commission_periods:manage`, và `reopenStatement` ở tầng lib
 *    còn một cổng nữa (chỉ SUPER_ADMIN mới mở lại được kỳ ĐÃ DUYỆT). Nhân bản
 *    LOGIC là cách chắc chắn nhất để hai khu có hai luật chốt kỳ khác nhau; nhân
 *    bản CÁI NÚT thì tệ nhất chỉ là hai cái nút trông khác nhau.
 *
 * GIỮ NGUYÊN 100%: bốn nhãn ("Export Excel", "Tính lại", "Duyệt", "Mở lại"), ba
 * câu lý do gửi kèm ("Chốt lại kỳ … qua UI", "Duyệt qua UI", "Mở lại qua UI"), ba
 * câu toast, và cách rẽ nhánh theo `status !== "APPROVED"`.
 *
 * ⚠️ `canChotKy` chỉ để KHÔNG VẼ nút bấm không được. Đây là client, mọi thứ ở đây
 *    là trang trí — cổng thật nằm trong ba Server Action.
 *
 * ── HAI ĐIỂM VỀ ĐƯỜNG DẪN ──────────────────────────────────────────────────
 * `/api/admin/crm/commission-export` giữ NGUYÊN và **chạy được trên host Sale**:
 * `isInfraPath()` cho mọi `/api/*` đi thẳng, không qua nhánh viết lại của host
 * Sale (`lib/auth/route-policy.ts`). Đây là ngoại lệ có thật, không phải may mắn
 * — đã kiểm, chứ không suy đoán.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  approveStatementAction,
  chotKyHoaHongAction,
  reopenStatementAction,
} from "@/app/(admin)/admin/crm/commission/actions";

const LOP_NUT = cn(
  "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium",
  "transition-colors disabled:opacity-50",
  "focus-visible:outline-none focus-visible:ring-2",
);
const LOP_NUT_VIEN = cn(
  LOP_NUT,
  "border-border bg-card text-foreground hover:bg-[color:var(--surface-chim)]",
  "focus-visible:ring-[color:var(--primary)]/30",
);
const LOP_NUT_CHINH = cn(
  LOP_NUT,
  "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
  "hover:bg-[color:var(--primary-dark)] focus-visible:ring-[color:var(--primary)]/40",
);

export function HanhDongKy({
  ky,
  trangThai,
  canChotKy,
}: {
  ky: string;
  trangThai: string;
  canChotKy: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function chay(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(ok);
        // `revalidatePath("/admin/crm/commission")` của action trỏ đường KHU QUẢN
        // TRỊ, không phủ `/sale/hoa-hong` → phải tự làm mới. Bản admin cũng gọi
        // `router.refresh()` vì cùng lý do ngược lại (nó ở đúng đường đó nhưng
        // vẫn muốn cập nhật ngay).
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  return (
    <span className="inline-flex justify-end gap-2">
      <a
        href={`/api/admin/crm/commission-export?period=${ky}`}
        className={LOP_NUT_VIEN}
      >
        Export Excel
      </a>

      {!canChotKy ? null : trangThai !== "APPROVED" ? (
        <>
          {/* Tính lại kỳ chưa duyệt từ sổ tiền — ghi đè cả kỳ nên bấm nhiều lần vô hại. */}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              chay(() => chotKyHoaHongAction(ky, `Chốt lại kỳ ${ky} qua UI`), "Đã tính lại kỳ")
            }
            className={LOP_NUT_VIEN}
          >
            Tính lại
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => chay(() => approveStatementAction(ky, "Duyệt qua UI"), "Đã duyệt")}
            className={LOP_NUT_CHINH}
          >
            Duyệt
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => chay(() => reopenStatementAction(ky, "Mở lại qua UI"), "Đã mở lại")}
          className={LOP_NUT_VIEN}
        >
          Mở lại
        </button>
      )}
    </span>
  );
}
