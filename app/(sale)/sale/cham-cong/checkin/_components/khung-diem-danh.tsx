"use client";

/**
 * Site Sale — hai nút "Check-in / Check-out" của màn điểm danh vào ca.
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/cham-cong/checkin/_components/checkin-client.tsx` ──
 * Tách bản riêng theo chốt 04/09/2026 (site Sale không dùng chung component với
 * khu quản trị). Bản admin GIỮ NGUYÊN, không sửa.
 *
 * 🔴 ĐƯỜNG GHI KHÔNG ĐƯỢC TÁCH. Server Action vẫn là `recordCheckin` của khu
 *    quản trị. Chỉ phần VẼ tách ra. Viết một đường ghi thứ hai cho cùng một việc
 *    là dựng thêm một chỗ để quên kiểm mã QR / geofence / `unique(userId, type,
 *    qrToken)` — ba thứ giữ cho một người không quét hộ người khác.
 *
 * GIỮ NGUYÊN 100% NỘI DUNG: hai nút đúng nhãn, hai câu nhắc ("Cần bật định vị
 * (GPS) khi chấm công" · "Quét lại mã trên màn hình nếu báo hết hạn."), cùng cách
 * lấy toạ độ (`enableHighAccuracy`, hết giờ 8 giây, từ chối định vị thì gửi
 * `null` để máy chủ quyết), cùng màn báo thành công kèm mốc thời gian.
 *
 * ── ĐỔI CÁCH BÀY: MÀU HAI NÚT ───────────────────────────────────────────────
 * Bản admin tô Check-in bằng `bg-state-success-ink` (xanh) và Check-out bằng
 * `bg-primary`. Xanh ở đó không nói trạng thái nào cả — nó chỉ là "nút bên
 * trái", tức màu ngữ nghĩa bị mượn làm màu trang trí, đúng thứ `DESIGN.md §1` và
 * `lib/sale/ky-luat-mau.test.ts` cấm. Ở đây cả hai đều mang tông thương hiệu,
 * phân cấp bằng ĐỘ ĐẬM (nền đặc / viền) chứ không bằng màu ngữ nghĩa. Xanh chỉ
 * còn xuất hiện ở màn báo THÀNH CÔNG — chỗ nó thật sự có nghĩa.
 *
 * ⚠️ KHÔNG gọi `router.refresh()` ở đây, và đó là chủ đích chứ không phải bỏ
 *    sót. Trang này không vẽ dữ liệu máy chủ nào cả (chỉ hai cái nút), nên không
 *    có gì để nạp lại; `recordCheckin` có `revalidatePath("/cham-cong")` là để
 *    làm mới BẢNG CÔNG ở màn khác. Sau khi quét, thành phần chuyển sang màn báo
 *    thành công tại chỗ — gọi refresh chỉ tổ nhấp nháy.
 */
import { useState, useTransition } from "react";
import { Loader2, LogIn, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";
import { recordCheckin } from "@/app/(admin)/admin/cham-cong/actions";

const NUT_CHUNG =
  "flex flex-col items-center justify-center gap-2 rounded-xl py-6 text-sm font-semibold " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[color:var(--primary)]/40 disabled:opacity-60";

export function KhungDiemDanh({ maCoSo, token }: { maCoSo: string; token: string }) {
  const [dangChay, batDau] = useTransition();
  const [xong, setXong] = useState<string | null>(null);

  function layViTri(): Promise<GeolocationPosition | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }

  function gui(loai: "CHECK_IN" | "CHECK_OUT") {
    batDau(async () => {
      const vt = await layViTri();
      const kq = await recordCheckin({
        centerId: maCoSo,
        token,
        type: loai,
        latitude: vt?.coords.latitude ?? null,
        longitude: vt?.coords.longitude ?? null,
      });
      if (kq.ok) {
        const nhan = loai === "CHECK_IN" ? "Check-in" : "Check-out";
        setXong(nhan);
        toast.success(`${nhan} thành công lúc ${new Date().toLocaleTimeString("vi-VN")}`);
      } else {
        toast.error(kq.error ?? "Chấm công thất bại");
      }
    });
  }

  if (xong) {
    return (
      <div className="px-5 py-10 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-[color:var(--state-success-soft)] text-xl font-bold text-[color:var(--state-success)]">
          ✓
        </div>
        <p className="text-base font-semibold text-foreground">{xong} thành công</p>
        <p className="mt-1 text-sm text-muted-foreground">{new Date().toLocaleString("vi-VN")}</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-6 text-center">
      <p className="mb-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <MapPin aria-hidden="true" className="size-4" /> Cần bật định vị (GPS) khi chấm công
      </p>
      <p className="mb-5 text-xs text-muted-foreground">
        Quét lại mã trên màn hình nếu báo hết hạn.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => gui("CHECK_IN")}
          disabled={dangChay}
          className={`${NUT_CHUNG} bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:bg-[color:var(--primary-dark)]`}
        >
          {dangChay ? (
            <Loader2 aria-hidden="true" className="size-6 animate-spin" />
          ) : (
            <LogIn aria-hidden="true" className="size-6" />
          )}
          Check-in
        </button>
        <button
          type="button"
          onClick={() => gui("CHECK_OUT")}
          disabled={dangChay}
          className={`${NUT_CHUNG} border border-[color:var(--primary)] bg-card text-[color:var(--primary-ink)] hover:bg-[color:var(--primary-soft)]`}
        >
          {dangChay ? (
            <Loader2 aria-hidden="true" className="size-6 animate-spin" />
          ) : (
            <LogOut aria-hidden="true" className="size-6" />
          )}
          Check-out
        </button>
      </div>
    </div>
  );
}
