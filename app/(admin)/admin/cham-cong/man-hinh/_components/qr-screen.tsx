"use client";

// qr-screen.tsx — nguồn dữ liệu QR của màn quầy (dùng chung cho cả hai chế độ) + thẻ xem trước
// ở chế độ điều khiển. Chế độ trình chiếu nằm ở `kiosk-stage.tsx` và cũng đọc `useKioskQr`.
//
// ĐIỀU DỄ VỠ: bản cũ để MỘT lần poll rớt mạng là xoá luôn ảnh QR đang hiện và in chữ đỏ — trong
// khi mã vừa lấy còn dùng được tới ~3 phút (máy chủ nhận cửa sổ hiện tại + 2 cửa sổ trước). Ở
// quầy, "không có QR" nghĩa là cả ca không ai chấm công được. Nên ở đây: giữ ảnh cuối cùng KÈM
// hạn dùng của nó; lỗi mà mã còn hạn ⇒ chỉ treo dải cảnh báo; hết hạn mới chịu báo lỗi.
//
// KHÔNG import `lib/cham-cong/kiosk-token.ts` (file đó dùng `node:crypto`, không chạy ở trình
// duyệt) và KHÔNG sửa `/api/admin/cham-cong/qr-token` — số cửa sổ khai lại bên dưới.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QrCode, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { vnParts } from "@/lib/time/vn";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, NoPermission } from "@/components/admin/ui/states";
import { BTN_OUTLINE, BTN_PRIMARY } from "@/components/admin/cham-cong/classes";

/** Máy chủ nhận cửa sổ hiện tại + 2 cửa sổ trước ⇒ một mã sống trọn 3 cửa sổ. */
export const KIOSK_VALID_WINDOWS = 3;
/** Phải < 60s (một cửa sổ) để màn hình không bao giờ treo mã đã hết hạn. */
const POLL_MS = 30_000;
const DEFAULT_WINDOW_SECONDS = 60;

const QR_ENDPOINT = "/api/admin/cham-cong/qr-token";

export type KioskFailKind = "AUTH" | "FORBIDDEN" | "NO_LOCATION" | "SERVER" | "NETWORK";

export type KioskSnapshot = {
  qrDataUrl: string;
  locationName: string;
  geofenceEnabled: boolean;
  windowSeconds: number;
  fetchedAt: number;
  /** Thời điểm mã hết hiệu lực với máy chủ (cuối cửa sổ thứ 3 tính từ lúc phát). */
  validUntil: number;
};

export type KioskFail = { kind: KioskFailKind; message: string; at: number };

export type KioskQr = {
  /** `loading` chưa có gì · `live` mã tươi · `stale` poll lỗi nhưng mã còn hạn · `error` hết cách. */
  status: "loading" | "live" | "stale" | "error";
  snap: KioskSnapshot | null;
  fail: KioskFail | null;
  /** Đồng hồ (ms). 0 = chưa mount — cố ý, để render máy chủ và trình duyệt không lệch nhau. */
  nowMs: number;
  /** Còn bao nhiêu giây nữa máy chủ đổi mã (bám mốc cửa sổ, không phải nhịp poll). */
  secondsToNewCode: number;
  retry: () => void;
};

type QrTokenResponse = {
  qrDataUrl?: string;
  windowSeconds?: number;
  workLocation?: { name?: string; geofenceEnabled?: boolean } | null;
};

function kindOf(status: number): KioskFailKind {
  if (status === 401) return "AUTH";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NO_LOCATION";
  if (status >= 500) return "SERVER";
  return "NETWORK";
}

function messageOf(kind: KioskFailKind, serverText?: string): string {
  switch (kind) {
    case "AUTH":
      return "Phiên đăng nhập trên TV đã hết — đăng nhập lại để mã tiếp tục đổi.";
    case "FORBIDDEN":
      return "Tài khoản đang đăng nhập trên TV không còn quyền xem màn hình QR của cơ sở này.";
    case "NO_LOCATION":
      return serverText ?? "Cơ sở này chưa có điểm chấm công nên chưa dựng được mã QR.";
    case "SERVER":
      return "Máy chủ chưa cấu hình khoá ký mã (hoặc đang lỗi) — báo bộ phận kỹ thuật.";
    default:
      return "Mất kết nối tới máy chủ.";
  }
}

/** Cuối cửa sổ thứ `KIOSK_VALID_WINDOWS` tính từ cửa sổ phát mã — KHÔNG phải "lúc lấy + 180s",
 *  vì mã được phát giữa chừng một cửa sổ thì nó chết sớm hơn đúng phần đã trôi qua. */
function windowEnd(fetchedAt: number, windowSeconds: number): number {
  const w = Math.floor(fetchedAt / 1000 / windowSeconds);
  return (w + KIOSK_VALID_WINDOWS) * windowSeconds * 1000;
}

/** "14:03" theo đồng hồ VN — không phụ thuộc timezone của máy đang mở TV. */
export function vnHhMm(ms: number): string {
  const p = vnParts(new Date(ms));
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function useKioskQr(centerId: string): KioskQr {
  const [snap, setSnap] = useState<KioskSnapshot | null>(null);
  const [fail, setFail] = useState<KioskFail | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${QR_ENDPOINT}?centerId=${encodeURIComponent(centerId)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const kind = kindOf(res.status);
        setFail({ kind, message: messageOf(kind, body?.error), at: Date.now() });
        return;
      }
      const data = (await res.json()) as QrTokenResponse;
      if (!data.qrDataUrl) {
        setFail({ kind: "SERVER", message: messageOf("SERVER"), at: Date.now() });
        return;
      }
      const fetchedAt = Date.now();
      const windowSeconds =
        data.windowSeconds && data.windowSeconds > 0 ? data.windowSeconds : DEFAULT_WINDOW_SECONDS;
      setSnap({
        qrDataUrl: data.qrDataUrl,
        locationName: data.workLocation?.name ?? "",
        geofenceEnabled: data.workLocation?.geofenceEnabled ?? false,
        windowSeconds,
        fetchedAt,
        validUntil: windowEnd(fetchedAt, windowSeconds),
      });
      setFail(null);
    } catch {
      setFail({ kind: "NETWORK", message: messageOf("NETWORK"), at: Date.now() });
    }
  }, [centerId]);

  // Đồng hồ 1 giây: vừa để in giờ trên TV, vừa để đếm ngược mã và để hạn dùng tự hết.
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Poll giữ chạy KỂ CẢ khi đang lỗi — đó chính là đường tự hồi phục sau khi mạng về.
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const windowSeconds = snap?.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const expired = !snap || (nowMs > 0 && nowMs >= snap.validUntil);

  let status: KioskQr["status"];
  if (nowMs === 0 || (!snap && !fail)) status = "loading";
  else if (snap && !expired) status = fail ? "stale" : "live";
  else status = "error";

  return {
    status,
    snap,
    fail,
    nowMs,
    secondsToNewCode: nowMs === 0 ? windowSeconds : windowSeconds - (Math.floor(nowMs / 1000) % windowSeconds),
    retry: () => void load(),
  };
}

/** Dải "mã còn dùng được tới …" — chỉ hiện khi poll đang hỏng mà mã cũ chưa hết hạn. */
export function StaleBanner({
  fail,
  validUntil,
  className,
}: {
  fail: KioskFail;
  validUntil: number;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg bg-state-warning-soft px-3 py-2 text-center font-medium text-state-warning-ink",
        className,
      )}
    >
      <WifiOff aria-hidden className="h-4 w-4 shrink-0" />
      Mất kết nối {vnHhMm(fail.at)} — mã còn dùng được tới {vnHhMm(validUntil)}
    </p>
  );
}

export function loginHrefFor(centerId: string): string {
  return `/login?callbackUrl=${encodeURIComponent(`/cham-cong/man-hinh?centerId=${centerId}`)}`;
}

export type KioskFailProps = {
  centerId: string;
  centerLabel: string;
  /** Ai cấp được `hr_attendance:view` — page truyền xuống, client không đọc bảng quyền. */
  askWho: string;
  /** Có `hr_attendance:config` tại cơ sở này thì mới mời người ta đi tạo điểm chấm. */
  canConfig: boolean;
};

/** Màn lỗi/rỗng dùng chung hai chế độ; chế độ trình chiếu bọc thêm lớp phóng chữ. */
export function KioskFailView({
  fail,
  onRetry,
  centerId,
  centerLabel,
  askWho,
  canConfig,
}: KioskFailProps & { fail: KioskFail | null; onRetry: () => void }) {
  const kind = fail?.kind ?? "NETWORK";
  const message = fail?.message ?? messageOf("NETWORK");

  if (kind === "FORBIDDEN") {
    return <NoPermission permission="hr_attendance:view" what="màn hình QR" askWho={askWho} />;
  }

  if (kind === "NO_LOCATION") {
    return (
      <EmptyState
        title={`${centerLabel} chưa có điểm chấm công`}
        description={
          canConfig
            ? "Mã QR dựng từ điểm chấm công của cơ sở. Tạo điểm rồi quay lại màn này."
            : "Mã QR dựng từ điểm chấm công của cơ sở. Báo Quản lý cơ sở tạo điểm giúp."
        }
        action={
          canConfig ? (
            <Link href="/cham-cong/diem-cham" className={BTN_PRIMARY}>
              Tạo điểm chấm công
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <ErrorState
      title={kind === "AUTH" ? "Phiên trên TV đã hết" : "Chưa lấy được mã QR"}
      description={message}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={onRetry} className={BTN_PRIMARY}>
            Thử lại
          </button>
          {kind === "AUTH" && (
            <Link href={loginHrefFor(centerId)} className={BTN_OUTLINE}>
              Đăng nhập lại
            </Link>
          )}
        </div>
      }
    />
  );
}

/**
 * Thẻ xem trước ở chế độ điều khiển — QR 240px, đủ để người ngồi bàn kiểm mã đang chạy.
 * Bản to cho TV nằm ở `kiosk-stage.tsx`.
 */
export function QrScreen(props: KioskFailProps) {
  const { centerId } = props;
  const qr = useKioskQr(centerId);

  if (qr.status === "error") {
    return <KioskFailView {...props} fail={qr.fail} onRetry={qr.retry} />;
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-5">
      {qr.status === "loading" || !qr.snap ? (
        <Skeleton aria-busy aria-label="Đang tải mã QR…" className="aspect-square w-60 rounded-xl" />
      ) : (
        // `<img>` thuần, KHÔNG `next/image`: nguồn là data URL đổi mỗi phút — tối ưu ảnh vô nghĩa.
        <img
          src={qr.snap.qrDataUrl}
          alt="Mã QR chấm công"
          className="aspect-square w-60 rounded-xl border border-border bg-card p-2"
        />
      )}

      {qr.status === "stale" && qr.fail && qr.snap ? (
        <StaleBanner fail={qr.fail} validUntil={qr.snap.validUntil} className="w-full text-xs" />
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <QrCode aria-hidden className="h-3.5 w-3.5" />
          Mã mới sau <span className="tabular-nums font-semibold text-foreground">{qr.secondsToNewCode}s</span>
        </p>
      )}
    </div>
  );
}
