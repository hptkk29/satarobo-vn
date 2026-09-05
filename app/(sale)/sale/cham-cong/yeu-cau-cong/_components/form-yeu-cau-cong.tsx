"use client";

/**
 * Site Sale — biểu mẫu "Gửi yêu cầu chỉnh công".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/cham-cong/yeu-cau-cong/_components/request-form.tsx` ──
 * Tách bản riêng theo chốt 04/09/2026 (site Sale không dùng chung component với
 * khu quản trị). Bản admin GIỮ NGUYÊN, không sửa.
 *
 * 🔴 ĐƯỜNG GHI KHÔNG ĐƯỢC TÁCH. Server Action vẫn là `createAdjustmentRequest`
 *    của khu quản trị (`chinh-cong/_actions.ts`). Chỉ phần VẼ tách ra. Ở đó có
 *    thứ không được sao chép lần hai: bản ghi tạo ra PHẢI mang `centerId` của
 *    người gửi — `scopedDb` KHÔNG che write, quên là yêu cầu vô hình với chính
 *    quản lý cơ sở lẽ ra phải duyệt nó.
 *
 * ⚠️ `router.refresh()` là BẮT BUỘC, không phải cho chắc. Action gọi
 *    `revalidatePath("/cham-cong/yeu-cau-cong")` + `revalidatePath("/cham-cong/chinh-cong")`
 *    — đường SẠCH của host quản trị, không khớp `/sale/cham-cong/yeu-cau-cong`.
 *    Bỏ nó thì gửi xong danh sách "Yêu cầu đã gửi" vẫn trống, và người dùng gửi
 *    lần thứ hai.
 *
 * GIỮ NGUYÊN 100% NỘI DUNG: đúng ba ô theo thứ tự cũ, đúng từng nhãn ("Ngày công
 * cần chỉnh" · "Đề nghị (vd: giờ vào 07:30, giờ ra 17:30)" · "Lý do / giải
 * trình"), đúng hai chỗ giữ chỗ, đúng hai câu toast và đúng câu chặn "Chọn ngày
 * cần chỉnh".
 *
 * ── VÌ SAO KHÔNG HỎI QUYỀN TRƯỚC KHI VẼ NÚT ────────────────────────────────
 * `createAdjustmentRequest` đòi `hr_attendance:checkin` kèm `centerId` của chính
 * người gửi — CÙNG action mà cổng trang đã hỏi, chỉ khác là cổng hỏi KHÔNG kèm
 * target. Theo `scopeMatches` (`lib/auth/can.ts`) thêm target chỉ có thể biến
 * `false → true`, nên qua được cổng ⇒ action nhận. Hỏi lại ở đây là mã chết.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createAdjustmentRequest } from "@/app/(admin)/admin/cham-cong/chinh-cong/_actions";

const O_NHAP =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[color:var(--primary)]/30";

export function FormYeuCauCong() {
  const router = useRouter();
  const [dangChay, batDau] = useTransition();
  const [ngay, setNgay] = useState("");
  const [deNghi, setDeNghi] = useState("");
  const [lyDo, setLyDo] = useState("");

  function gui() {
    if (!ngay) {
      toast.error("Chọn ngày cần chỉnh");
      return;
    }
    batDau(async () => {
      const kq = await createAdjustmentRequest({ date: ngay, requested: deNghi, reason: lyDo });
      if (kq.ok) {
        toast.success("Đã gửi yêu cầu chỉnh công");
        setNgay("");
        setDeNghi("");
        setLyDo("");
        router.refresh();
      } else toast.error(kq.error ?? "Lỗi gửi yêu cầu");
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        Gửi yêu cầu chỉnh công
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Ngày công cần chỉnh
          </span>
          <input
            type="date"
            value={ngay}
            onChange={(e) => setNgay(e.target.value)}
            className={O_NHAP}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Đề nghị (vd: giờ vào 07:30, giờ ra 17:30)
          </span>
          <input
            type="text"
            value={deNghi}
            onChange={(e) => setDeNghi(e.target.value)}
            placeholder="Giờ vào/ra đúng…"
            className={O_NHAP}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          Lý do / giải trình
        </span>
        <textarea
          value={lyDo}
          onChange={(e) => setLyDo(e.target.value)}
          rows={3}
          placeholder="Vì sao cần chỉnh công ngày này…"
          className={`${O_NHAP} resize-y`}
        />
      </label>

      <button
        type="button"
        onClick={gui}
        disabled={dangChay}
        className="inline-flex h-9 items-center rounded-lg bg-[color:var(--primary)] px-4 text-sm font-semibold text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 disabled:opacity-50"
      >
        {dangChay ? "Đang gửi…" : "Gửi yêu cầu"}
      </button>
    </div>
  );
}
