"use client";

import { useState, useTransition } from "react";
import { LogIn, LogOut, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { recordCheckin } from "../../actions";

export function CheckinClient({
  centerId,
  token,
}: {
  centerId: string;
  token: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(null);

  function getPosition(): Promise<GeolocationPosition | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }

  function submit(type: "CHECK_IN" | "CHECK_OUT") {
    startTransition(async () => {
      const pos = await getPosition();
      const res = await recordCheckin({
        centerId,
        token,
        type,
        latitude: pos?.coords.latitude ?? null,
        longitude: pos?.coords.longitude ?? null,
      });
      if (res.ok) {
        const label = type === "CHECK_IN" ? "Check-in" : "Check-out";
        setDone(label);
        toast.success(`${label} thành công lúc ${new Date().toLocaleTimeString("vi-VN")}`);
      } else {
        toast.error(res.error ?? "Chấm công thất bại");
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-state-success-soft text-state-success-ink">
          ✓
        </div>
        <p className="text-lg font-bold text-foreground">{done} thành công</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date().toLocaleString("vi-VN")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card p-6 text-center shadow-sm">
      <p className="mb-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4" /> Cần bật định vị (GPS) khi chấm công
      </p>
      <p className="mb-5 text-xs text-muted-foreground">
        Quét lại mã trên màn hình nếu báo hết hạn.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => submit("CHECK_IN")}
          disabled={pending}
          className="flex flex-col items-center gap-2 rounded-xl bg-state-success-ink py-6 font-semibold text-white hover:bg-state-success-ink-hover disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-6 w-6 animate-spin" /> : <LogIn className="h-6 w-6" />}
          Check-in
        </button>
        <button
          type="button"
          onClick={() => submit("CHECK_OUT")}
          disabled={pending}
          className="flex flex-col items-center gap-2 rounded-xl bg-primary py-6 font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-6 w-6 animate-spin" /> : <LogOut className="h-6 w-6" />}
          Check-out
        </button>
      </div>
    </div>
  );
}
