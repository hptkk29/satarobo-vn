"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function QrScreen({ centerId, centerName }: { centerId: string; centerName: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/cham-cong/qr-token?centerId=${encodeURIComponent(centerId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Không tải được mã");
      const data = (await res.json()) as { qrDataUrl: string };
      setQr(data.qrDataUrl);
      setError(null);
    } catch {
      setError("Lỗi tải mã QR — kiểm tra kết nối");
    }
  }, [centerId]);

  // QR CỐ ĐỊNH — tải 1 lần (mã không hết hạn). Có thể in/dán tại quầy.
  useEffect(() => {
    void fetchToken();
  }, [fetchToken]);

  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-2xl bg-card p-10 text-center shadow-sm">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Chấm công Sata Robo</h2>
        <p className="mt-1 text-muted-foreground">{centerName}</p>
      </div>

      {/* `max-w-full` + `aspect-square` thay cho bề cao/rộng cứng: 360px khung + 80px đệm
          `p-10` của thẻ + 48px đệm của trang là 488px, vượt màn 375px ⇒ mở trang này bằng
          điện thoại là cả trang trượt ngang. Ảnh QR vốn vuông nên để bề cao chạy theo bề
          rộng là giữ nguyên hình; trên màn rộng vẫn đúng 360px như cũ. */}
      <div className="flex aspect-square w-[360px] max-w-full items-center justify-center rounded-xl border border-border">
        {error ? (
          <p className="px-6 text-sm text-state-danger-ink">{error}</p>
        ) : qr ? (
          <img src={qr} alt="QR chấm công" className="h-auto w-[340px] max-w-full" />
        ) : (
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        )}
      </div>

      <div>
        <p className="text-lg font-semibold text-primary">
          Quét mã bằng điện thoại để chấm công
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Mã cố định của cơ sở · cần bật định vị (GPS) trong bán kính 100m
        </p>
      </div>
    </div>
  );
}
