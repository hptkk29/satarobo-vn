"use client";

// Hai nút Check in / Check out cho ngày ĐI CÔNG TÁC (phần A, 15/09/2026).
//
// `'use client'` vì cần đúng một thứ trình duyệt mới có: `navigator.geolocation`. Mọi quyết
// định (hôm nay có phải ngày công tác không, đã bấm gì chưa) do RSC tính và truyền xuống.
//
// ⚠️ TOẠ ĐỘ XIN TẠI ĐÚNG LÚC BẤM, không sớm hơn. Không `watchPosition`, không xin quyền lúc
// mở trang: chốt của chủ dự án — "Toạ độ là DỮ LIỆU VỊ TRÍ CÁ NHÂN: chỉ ghi tại đúng thời
// điểm bấm, KHÔNG theo dõi nền."
//
// ⚠️ KHÔNG CHẶN khi không lấy được vị trí. "Người ở chỗ sóng kém mà không chấm được là hỏng
// đúng mục đích." Lấy được thì gửi kèm; không thì gửi null và server gắn cờ `THIEU_GPS`.
import { useState, useTransition } from "react";
import { LogIn, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";
import { chamCongTac } from "@/lib/cham-cong/cong-tac-action";

/** Chờ toạ độ tối đa 8 giây rồi đi tiếp KHÔNG có toạ độ — không để người dùng đứng chờ mãi. */
const HAN_CHO_VI_TRI_MS = 8_000;

type ViTri = { latitude: number; longitude: number; accuracyMeters: number | null };

function xinViTri(): Promise<ViTri | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let xong = false;
    const tra = (v: ViTri | null) => {
      if (xong) return;
      xong = true;
      resolve(v);
    };
    // Hẹn giờ RIÊNG chứ không chỉ dựa `timeout` của API: trên vài trình duyệt, người dùng
    // bỏ lửng hộp thoại quyền thì callback KHÔNG BAO GIỜ chạy — không có hẹn giờ này thì nút
    // quay mãi và người ta tưởng hệ thống treo.
    const h = setTimeout(() => tra(null), HAN_CHO_VI_TRI_MS);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(h);
        tra({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracyMeters: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        });
      },
      () => {
        clearTimeout(h);
        tra(null);
      },
      { enableHighAccuracy: true, timeout: HAN_CHO_VI_TRI_MS, maximumAge: 0 },
    );
  });
}

export function NutCongTac({
  daVao,
  daRa,
}: {
  /** Giờ VN đã check in hôm nay ("08:02"), null = chưa. Do RSC tính. */
  daVao: string | null;
  daRa: string | null;
}) {
  const [dangChay, batDau] = useTransition();
  const [chieu, setChieu] = useState<"CHECK_IN" | "CHECK_OUT" | null>(null);

  const bam = (type: "CHECK_IN" | "CHECK_OUT") => {
    setChieu(type);
    batDau(async () => {
      const v = await xinViTri();
      const r = await chamCongTac({
        type,
        latitude: v?.latitude ?? null,
        longitude: v?.longitude ?? null,
        accuracyMeters: v?.accuracyMeters ?? null,
      });
      setChieu(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const nhan = type === "CHECK_IN" ? "Đã Check in" : "Đã Check out";
      // Nói rõ CÓ hay KHÔNG có vị trí — người bấm phải biết cái gì vừa được lưu về mình.
      toast.success(v ? `${nhan}, có kèm vị trí.` : `${nhan} — KHÔNG lấy được vị trí, vẫn ghi nhận.`);
      if (r.warning) toast.warning(r.warning);
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => bam("CHECK_IN")}
          disabled={dangChay}
          // ≥44px vùng chạm — giáo viên bấm trên điện thoại, tay thường đang bận.
          className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          <LogIn className="h-5 w-5" aria-hidden />
          {dangChay && chieu === "CHECK_IN" ? "Đang ghi…" : "Check in"}
        </button>
        <button
          type="button"
          onClick={() => bam("CHECK_OUT")}
          disabled={dangChay}
          className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-base font-semibold text-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
        >
          <LogOut className="h-5 w-5" aria-hidden />
          {dangChay && chieu === "CHECK_OUT" ? "Đang ghi…" : "Check out"}
        </button>
      </div>

      {/* Trạng thái hôm nay — nói THẲNG đã bấm gì, đừng để người ta bấm lại vì không chắc. */}
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Check in hôm nay</dt>
          <dd className="font-semibold text-foreground tabular-nums">{daVao ?? "chưa bấm"}</dd>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Check out hôm nay</dt>
          <dd className="font-semibold text-foreground tabular-nums">{daRa ?? "chưa bấm"}</dd>
        </div>
      </dl>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Mỗi lần bấm, hệ thống lưu vị trí <strong>tại đúng thời điểm đó</strong> để Quản lý đối
          chiếu — không theo dõi ngoài lúc bấm. Không lấy được vị trí thì <strong>vẫn ghi nhận</strong>.
        </span>
      </p>
    </div>
  );
}
