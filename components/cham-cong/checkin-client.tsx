"use client";

// components/cham-cong/checkin-client.tsx — hai nút Check-in / Check-out sau khi quét QR (vé 120s).
// DÙNG CHUNG cho site admin (`/cham-cong/checkin`) và site giáo viên (`/teacher/cham-cong/checkin`).
//
// Vì sao màn này khắt khe hơn màn admin thường: người dùng đang ĐỨNG Ở QUẦY, cầm điện thoại, vé chỉ
// sống 120 giây. Nút phải đủ to để bấm bằng ngón cái (h-14 = 56px, cả bề ngang màn 375px), đồng hồ
// vé phải đọc được từ xa, và mọi trạng thái "không bấm được" phải nói RÕ vì sao ngay tại chỗ.
//
// DỄ VỠ:
// 1. Thư mục `components/cham-cong/**` site GV mount ⇒ KHÔNG import `components/admin/**`, CHỈ token
//    `:root` (`.teacher-root` không có `--primary-soft`, `--primary-ink` ở `:root` là màu cam).
// 2. Vé dùng MỘT LẦN: bấm xong không quay lại được màn có nút — nên sau khi ghi phải nói giờ đã ghi
//    và chỉ đường đi tiếp, đừng để người ta bấm lại rồi nhận lỗi "vé đã dùng".
// 3. GPS KHÔNG chặn: không có định vị vẫn ghi được, chỉ gắn cờ để Quản lý rà. Đừng thêm nhánh chặn.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Loader2, LogIn, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { recordCheckin } from "@/lib/attendance/checkin-action";
import { ShiftCodeChip, type ShiftSource } from "@/components/cham-cong/ui/shift-code-chip";
import { PILL } from "@/components/cham-cong/ui/flag-chip";

/** Dải "Hôm nay" — dữ liệu PHẲNG do RSC đọc sẵn (giờ đã format theo +07 ở server). */
export type CheckinToday = {
  shiftCode: string | null;
  shiftName: string | null;
  shiftSource: ShiftSource | null;
  /** "07:45–11:30 · 14:00–17:45" hoặc "" khi mã ca không có khung giờ. */
  timeLabel: string;
  placeLabel: string | null;
  /** Đã có bản ghi công ngày hôm nay chưa (engine tính sau mỗi lượt quét vài phút). */
  hasRecord: boolean;
  /** "7h29" hoặc null. */
  workedLabel: string | null;
  units: number | null;
};

const BTN_BASE =
  "flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-bold shadow-sm transition-colors disabled:pointer-events-none disabled:opacity-60";

/** Lời đọc cho trình đọc màn hình — đổi theo NGƯỠNG, không phải mỗi giây (đọc 120 lần là tra tấn). */
function spokenTicket(left: number): string {
  if (left <= 0) return "Vé đã hết hạn, quét lại mã QR trên màn hình quầy.";
  if (left <= 10) return "Vé còn dưới 10 giây.";
  if (left <= 30) return "Vé còn dưới 30 giây.";
  return "Vé còn hiệu lực.";
}

export function CheckinClient({
  ticketId,
  nonce,
  expiresAt,
  locationName,
  geofenceEnabled,
  today,
  afterHref,
  afterLabel,
}: {
  ticketId: string;
  nonce: string;
  expiresAt: string;
  locationName: string;
  geofenceEnabled: boolean;
  today?: CheckinToday | null;
  /** Đường đi tiếp sau khi ghi xong. Không truyền ⇒ không hiện link (site GV có menu riêng). */
  afterHref?: string;
  afterLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ label: string; timeLabel: string; warning?: string } | null>(null);
  const [left, setLeft] = useState(() => Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    const id = setInterval(
      () => setLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))),
      1000,
    );
    return () => clearInterval(id);
  }, [expiresAt]);

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
        ticketId,
        nonce,
        type,
        latitude: pos?.coords.latitude ?? null,
        longitude: pos?.coords.longitude ?? null,
        accuracyMeters: pos?.coords.accuracy ?? null,
      });
      if (res.ok) {
        const label = type === "CHECK_IN" ? "Check-in" : "Check-out";
        setDone({ label, timeLabel: new Date().toLocaleTimeString("vi-VN"), warning: res.warning });
        if (res.warning) toast.warning(res.warning);
        else toast.success(`${label} thành công lúc ${new Date().toLocaleTimeString("vi-VN")}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-state-success-soft text-state-success-ink">
          <CircleCheck className="h-7 w-7" aria-hidden />
        </span>
        <p className="text-lg font-bold text-foreground">{done.label} thành công</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{done.timeLabel}</p>
        <p className="mt-1 text-sm text-muted-foreground">{locationName}</p>
        {done.warning && (
          <p className="mt-3 rounded-lg bg-state-warning-soft p-2.5 text-xs text-state-warning-ink">{done.warning}</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Vé dùng một lần. Muốn ghi lượt tiếp theo thì quét lại mã trên màn hình quầy.
        </p>
        {afterHref && (
          <Link
            href={afterHref}
            className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {afterLabel ?? "Xem tiếp"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
    );
  }

  const expired = left <= 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hôm nay</p>
      <p className="mt-1 text-base font-semibold text-foreground">{locationName}</p>

      {today && (
        <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          {today.shiftCode ? (
            <p className="flex flex-wrap items-center gap-1.5">
              <ShiftCodeChip code={today.shiftCode} source={today.shiftSource ?? undefined} size="sm" />
              <span className="text-foreground">{today.shiftName}</span>
              {today.timeLabel && <span className="font-mono tabular-nums">{today.timeLabel}</span>}
              {today.placeLabel && <span>· {today.placeLabel}</span>}
            </p>
          ) : (
            <p>Hôm nay bạn không có ca nào được xếp — vẫn chấm được, Quản lý sẽ rà cờ &ldquo;ngoài lịch&rdquo;.</p>
          )}
          <p>
            {today.hasRecord ? (
              <>
                Đã ghi hôm nay: <strong className="tabular-nums text-foreground">{today.workedLabel ?? "—"}</strong>
                {today.units != null && <> · {today.units} công</>}
              </>
            ) : (
              "Chưa có lượt nào được ghi hôm nay."
            )}{" "}
            <span className="text-xs">(công ngày cập nhật vài phút sau mỗi lượt quét)</span>
          </p>
        </div>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden />
        <span className={cn(PILL, geofenceEnabled ? "bg-state-info-soft text-state-info-ink" : "bg-muted text-muted-foreground")}>
          {geofenceEnabled ? "Có kiểm định vị" : "Không kiểm định vị"}
        </span>
      </p>

      <p aria-live="polite" aria-atomic className="mt-5 text-3xl font-bold tabular-nums text-foreground">
        <span aria-hidden>{expired ? "Vé đã hết hạn" : `Vé còn ${left} giây`}</span>
        <span className="sr-only">{spokenTicket(left)}</span>
      </p>

      {expired && (
        <p role="alert" className="mt-2 rounded-lg bg-state-danger-soft p-2.5 text-sm text-state-danger-ink">
          Vé hết hạn — quét lại mã trên màn hình quầy.
        </p>
      )}

      <div className="mt-4 grid gap-3">
        <button
          type="button"
          onClick={() => submit("CHECK_IN")}
          disabled={pending || expired}
          className={cn(BTN_BASE, "bg-state-success-ink text-primary-foreground hover:bg-state-success-ink-hover")}
        >
          {pending ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <LogIn className="h-6 w-6" aria-hidden />}
          Check-in
        </button>
        <button
          type="button"
          onClick={() => submit("CHECK_OUT")}
          disabled={pending || expired}
          className={cn(BTN_BASE, "bg-primary text-primary-foreground hover:bg-primary/90")}
        >
          {pending ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <LogOut className="h-6 w-6" aria-hidden />}
          Check-out
        </button>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {geofenceEnabled
          ? "Bật định vị (GPS) khi được hỏi. Ở ngoài vùng vẫn ghi được — hệ thống gắn cờ để Quản lý rà, bạn không bị chặn."
          : "Bật định vị (GPS) nếu được hỏi. Mỗi vé chỉ ghi được một lượt."}
      </p>
    </div>
  );
}
