"use client";

/**
 * Thanh lọc màn "Buổi học" của site Sale — bản đôi của
 * `app/(admin)/admin/sessions/_components/session-filters.tsx` (chốt tách bản 04/09/2026).
 *
 * ── Giữ nguyên 100% ─────────────────────────────────────────────────────────
 * Đúng hai điều khiển, đúng thứ tự, đúng từng chữ: ba nút phạm vi
 * "Sắp tới / Đã diễn ra / Tất cả" · ô chọn "Tất cả lớp" · chữ "Đang lọc…".
 * Cơ chế cũng giữ: ÁP DỤNG TỨC THÌ (P1 #5 — bấm/chọn là điều hướng ngay, không
 * có nút "Lọc"), điều hướng CLIENT trong `useTransition`, và hợp đồng URL y hệt
 * (`scope` bỏ qua khi = "upcoming", `classId` bỏ qua khi rỗng).
 *
 * ── Chỉ CÁCH BÀY đổi ────────────────────────────────────────────────────────
 *   1. Đích điều hướng là `/sale/buoi-hoc`, không phải `/sessions` — bản mount
 *      cũ đẩy người dùng ra khỏi site Sale mỗi lần đổi bộ lọc.
 *   2. `<select>` gốc của trình duyệt → `<Select>` của kho. Bản admin trộn hai
 *      thứ tiếng trên một hàng (nút của kho + select do hệ điều hành vẽ) — cùng
 *      lỗi đã sửa ở màn "Khách của tôi" ngày 28/08.
 *   3. Chữ "Đang lọc…" không còn là một nhãn trôi bên phải rồi biến mất (làm
 *      hàng nhảy ngang); nó thay chữ trong ô chọn khi đang chạy.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MOI_PHAM_VI, NHAN_PHAM_VI, type PhamVi } from "@/lib/sale/du-lieu-buoi-hoc";

/** `<Select>` của kho không nhận giá trị rỗng làm một lựa chọn. */
const MOI_LOP = "__moi_lop__";

export function BoLocBuoiHoc({
  phamVi,
  classId,
  lop,
}: {
  phamVi: PhamVi;
  classId: string;
  lop: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [dang, start] = useTransition();

  function apDung(moi: { phamVi?: PhamVi; classId?: string }) {
    const p = new URLSearchParams();
    const pv = moi.phamVi ?? phamVi;
    const lopId = moi.classId ?? classId;
    if (pv !== "upcoming") p.set("scope", pv);
    if (lopId) p.set("classId", lopId);
    const qs = p.toString();
    start(() => router.push(qs ? `/sale/buoi-hoc?${qs}` : "/sale/buoi-hoc"));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Bộ chuyển phạm vi. `role="group"` chứ không phải tablist: ba nút này đổi
          TRUY VẤN của cùng một bảng, không chuyển giữa ba vùng nội dung. */}
      <div
        role="group"
        aria-label="Phạm vi thời gian"
        className="inline-flex rounded-lg border border-border bg-card p-0.5"
      >
        {MOI_PHAM_VI.map((pv) => {
          const dangChon = phamVi === pv;
          return (
            <button
              key={pv}
              type="button"
              aria-pressed={dangChon}
              disabled={dang}
              onClick={() => apDung({ phamVi: pv })}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-[color:var(--primary)]/40",
                dangChon
                  ? // Tím = "vị trí hiện tại", cùng ngôn ngữ với mục menu đang đứng.
                    // KHÔNG mượn màu ngữ nghĩa nào (xem `trang-thai-dao-tao.ts`).
                    "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                  : "text-muted-foreground hover:bg-[color:var(--surface-chim)] hover:text-foreground",
                "disabled:opacity-60",
              )}
            >
              {NHAN_PHAM_VI[pv]}
            </button>
          );
        })}
      </div>

      <Select
        value={classId || MOI_LOP}
        onValueChange={(v) =>
          apDung({ classId: v === null || v === MOI_LOP ? "" : String(v) })
        }
      >
        <SelectTrigger
          aria-label="Lọc theo lớp"
          disabled={dang}
          className={cn(
            "h-9 w-auto min-w-[12rem] rounded-lg border border-border bg-card text-sm",
            "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
          )}
        >
          <SelectValue>
            {(v: string | null) =>
              dang
                ? "Đang lọc…"
                : ((v && v !== MOI_LOP ? lop.find((l) => l.id === v)?.name : null) ??
                  "Tất cả lớp")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={MOI_LOP}>Tất cả lớp</SelectItem>
          {lop.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
