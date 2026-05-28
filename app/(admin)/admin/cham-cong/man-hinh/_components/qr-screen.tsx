"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export function QrScreen({ centerId, centerName }: { centerId: string; centerName: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/cham-cong/qr-token?centerId=${encodeURIComponent(centerId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Không tải được mã");
      const data = (await res.json()) as { qrDataUrl: string; expiresAt: number };
      setQr(data.qrDataUrl);
      setExpiresAt(data.expiresAt);
      setError(null);
    } catch {
      setError("Lỗi tải mã QR — kiểm tra kết nối");
    }
  }, [centerId]);

  useEffect(() => {
    void fetchToken();
    const refresh = setInterval(fetchToken, 25_000);
    return () => clearInterval(refresh);
  }, [fetchToken]);

  // Countdown + tự refresh khi hết hạn.
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const rem = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemaining(rem);
      if (rem <= 0) void fetchToken();
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [expiresAt, fetchToken]);

  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-2xl bg-white p-10 text-center shadow-sm">
      <div>
        <h2 className="text-2xl font-bold text-neutral-900">Chấm công Sata Robo</h2>
        <p className="mt-1 text-neutral-500">{centerName}</p>
      </div>

      <div className="flex h-[360px] w-[360px] items-center justify-center rounded-xl border border-neutral-200">
        {error ? (
          <p className="px-6 text-sm text-rose-600">{error}</p>
        ) : qr ? (
          <img src={qr} alt="QR chấm công" className="h-[340px] w-[340px]" />
        ) : (
          <Loader2 className="h-10 w-10 animate-spin text-neutral-300" />
        )}
      </div>

      <div>
        <p className="text-lg font-semibold text-orange-600">
          Quét mã bằng điện thoại để chấm công
        </p>
        <p className="mt-1 text-sm text-neutral-400">
          Mã tự làm mới sau {remaining}s · cần bật định vị (GPS)
        </p>
      </div>
    </div>
  );
}
