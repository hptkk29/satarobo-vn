"use client";

// components/cham-cong/checkin-client.tsx — nút Check-in/Check-out sau khi quét QR (L4: vé 120s).
// DÙNG CHUNG cho admin và site GV. shadcn/Tailwind thuần.
import { useEffect, useState, useTransition } from "react";
import { LogIn, LogOut, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { recordCheckin } from "@/lib/attendance/checkin-action";

export function CheckinClient({ ticketId, nonce, expiresAt, locationName, geofenceEnabled }: { ticketId: string; nonce: string; expiresAt: string; locationName: string; geofenceEnabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ label: string; warning?: string } | null>(null);
  const [left, setLeft] = useState(() => Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  function getPosition(): Promise<GeolocationPosition | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition((pos) => resolve(pos), () => resolve(null), { enableHighAccuracy: true, timeout: 8000 });
    });
  }

  function submit(type: "CHECK_IN" | "CHECK_OUT") {
    startTransition(async () => {
      const pos = await getPosition();
      const res = await recordCheckin({
        ticketId,
        nonce,
        type,
        latitude: pos?.coords.latitude ?? null,
        longitude: pos?.coords.longitude ?? null,
        accuracyMeters: pos?.coords.accuracy ?? null,
      });
      if (res.ok) {
        const label = type === "CHECK_IN" ? "Check-in" : "Check-out";
        setDone({ label, warning: res.warning });
        if (res.warning) toast.warning(res.warning);
        else toast.success(`${label} thành công lúc ${new Date().toLocaleTimeString("vi-VN")}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-state-success-soft text-state-success-ink">✓</div>
        <p className="text-lg font-bold text-foreground">{done.label} thành công</p>
        <p className="mt-1 text-sm text-muted-foreground">{new Date().toLocaleString("vi-VN")} · {locationName}</p>
        {done.warning && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{done.warning}</p>}
      </div>
    );
  }

  const expired = left <= 0;
  return (
    <div className="rounded-2xl bg-card p-6 text-center shadow-sm">
      <p className="mb-1 text-sm font-medium text-foreground">{locationName}</p>
      <p className="mb-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4" /> {geofenceEnabled ? "Cần bật định vị (GPS) — ngoài vùng vẫn ghi, Quản lý sẽ rà" : "Bật định vị nếu được hỏi"}
      </p>
      <p className={`mb-5 text-xs ${expired ? "text-destructive" : "text-muted-foreground"}`}>
        {expired ? "Vé đã hết hạn — quét lại mã QR trên màn hình." : `Vé còn ${left}s · mỗi lượt quét dùng một lần.`}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => submit("CHECK_IN")} disabled={pending || expired} className="flex flex-col items-center gap-2 rounded-xl bg-state-success-ink py-6 font-semibold text-white hover:bg-state-success-ink-hover disabled:opacity-60">
          {pending ? <Loader2 className="h-6 w-6 animate-spin" /> : <LogIn className="h-6 w-6" />}
          Check-in
        </button>
        <button type="button" onClick={() => submit("CHECK_OUT")} disabled={pending || expired} className="flex flex-col items-center gap-2 rounded-xl bg-primary py-6 font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
          {pending ? <Loader2 className="h-6 w-6 animate-spin" /> : <LogOut className="h-6 w-6" />}
          Check-out
        </button>
      </div>
    </div>
  );
}
