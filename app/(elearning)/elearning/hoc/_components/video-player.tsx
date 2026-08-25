"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * EL-11 — TRÌNH PHÁT VIDEO BÀI HỌC.
 *
 * Tiêu thụ hợp đồng nhịp xem của EL-12a. Client chỉ ĐO và BÁO; mọi quyết định
 * "đã xem tới đâu" nằm ở server, và mọi con số gửi lên đều bị kẹp lại ở đó.
 *
 * ⚠️ Bốn cơ chế trong trình phát này là RÀO MỀM, không phải cổng:
 *  · khoá nút tốc độ · chặn tua · ẩn nút tải · chặn menu chuột phải
 * Tất cả đều sửa được từ bảng điều khiển trình duyệt. Chúng có mặt để người dùng
 * bình thường không vô tình làm sai, còn cổng thật nằm ở server. Đừng bao giờ
 * gỡ một kiểm tra ở server vì "trình phát đã chặn rồi".
 *
 * ⚠️ Hình mờ ĐỘNG (di chuyển theo chu kỳ) chứ không cố định một góc: hình mờ đứng
 * yên bị cắt khỏi khung hình trong vài giây, còn hình mờ chạy khắp khung thì cắt
 * xong mất luôn nội dung. Nó không chặn được việc quay màn hình — mục đích là làm
 * bản quay LỘ DANH TÍNH người quay.
 */

const NHIP_MS = 15_000;
const API = "/api/elearning/video-heartbeat";
/** Chu kỳ đổi vị trí hình mờ. */
const MO_MS = 7_000;

type ThachThuc = { loai: string; id: string; cauHoi: string; hanGiay: number };

type Phan = {
  ok: boolean;
  data?: {
    coveredSec: number;
    coveragePercent: number;
    status: string;
    thachThuc?: ThachThuc;
  };
  error?: { code: string; message: string };
};

export function VideoPlayer(props: {
  enrollmentId: string;
  lessonId: string;
  /** Khoá tệp trên R2 — đường phát dựng từ đây, không nhận URL sẵn. */
  videoKey: string;
  captionKey?: string | null;
  /** Vé phát đã ký ở server. Hết hạn thì tải lại trang. */
  ve: string;
  /** Nhãn hình mờ — họ tên + email người đang xem. */
  nhanMo: string;
  durationSec: number;
  coveredSecBanDau: number;
  maxPositionSecBanDau: number;
  chanTua: boolean;
  tocDoToiDa: number;
}) {
  const vidRef = useRef<HTMLVideoElement>(null);
  const seq = useRef(0);
  /** Mốc đã xem tới, dùng cho rào chặn tua ở client. */
  const bienDaXem = useRef(props.maxPositionSecBanDau);
  /** Điểm bắt đầu khoảng đang xem của nhịp hiện tại. */
  const batDau = useRef(props.maxPositionSecBanDau);
  const dangGui = useRef(false);

  const [phu, setPhu] = useState(props.coveredSecBanDau);
  const [thachThuc, setThachThuc] = useState<ThachThuc | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [moGoc, setMoGoc] = useState(0);

  const src = `/api/elearning/media/${props.videoKey}?ve=${encodeURIComponent(props.ve)}`;

  // ── Gửi nhịp ──────────────────────────────────────────────────────────────
  const guiNhip = useCallback(
    async (traLoi?: string) => {
      const v = vidRef.current;
      if (!v) return;
      // Chặn chồng nhịp: mạng chậm làm nhịp sau chồng lên nhịp trước, và cả hai
      // mang cùng `seq` ⇒ server bỏ một cái, đo hụt.
      if (dangGui.current) return;

      const den = v.currentTime;
      const tu = Math.min(batDau.current, den);
      if (den - tu < 1 && !traLoi) return;

      dangGui.current = true;
      seq.current += 1;
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ve: props.ve,
            enrollmentId: props.enrollmentId,
            lessonId: props.lessonId,
            tuSec: tu,
            denSec: den,
            seq: seq.current,
            tocDo: v.playbackRate,
            tabHien: document.visibilityState === "visible",
            viTriSec: den,
            ...(traLoi ? { traLoiThachThuc: traLoi } : {}),
          }),
        });
        const json = (await res.json()) as Phan;

        if (!res.ok || !json.ok) {
          const ma = json.error?.code ?? "LOI";
          // 409 = xử xong rồi xem tiếp được; 403 = dừng hẳn. Phân biệt được là nhờ
          // hợp đồng khai TƯỜNG MINH từng mã một.
          if (res.status === 409) {
            v.pause();
            setLoi(json.error?.message ?? "Tạm dừng ghi nhận");
            if (ma === "SEEK_BLOCKED") {
              // Kéo con trỏ về mốc đã xem — không thì người học ngồi ở chỗ mà mọi
              // nhịp tiếp theo đều bị từ chối, và họ không hiểu vì sao.
              v.currentTime = bienDaXem.current;
              batDau.current = bienDaXem.current;
            }
          } else {
            v.pause();
            setLoi(json.error?.message ?? "Không ghi nhận được tiến độ");
          }
          return;
        }

        setLoi(null);
        if (json.data) {
          setPhu(json.data.coveredSec);
          bienDaXem.current = Math.max(bienDaXem.current, den);
          batDau.current = den;
          if (json.data.thachThuc) {
            setThachThuc(json.data.thachThuc);
            v.pause();
          }
        }
      } catch {
        // Mất mạng: KHÔNG báo lỗi, KHÔNG dừng phát. Nhịp sau sẽ mang cả khoảng
        // chưa gửi được, vì `batDau` chỉ nhích lên khi server đã nhận.
      } finally {
        dangGui.current = false;
      }
    },
    [props.ve, props.enrollmentId, props.lessonId],
  );

  // ── Đồng hồ nhịp ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const v = vidRef.current;
      if (!v || v.paused || v.ended) return;
      // Kiểm TRONG callback mỗi tick, không chỉ bật/tắt theo `visibilitychange`:
      // có trình duyệt vẫn chạy interval ở tab nền, và có ca chuyển tab không bắn
      // sự kiện đúng lúc.
      if (document.visibilityState !== "visible") return;
      void guiNhip();
    }, NHIP_MS);
    return () => clearInterval(t);
  }, [guiNhip]);

  // ── Rời tab thì DỪNG PHÁT ─────────────────────────────────────────────────
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "visible") return;
      vidRef.current?.pause();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  // ── Nhịp cuối lúc rời trang ───────────────────────────────────────────────
  useEffect(() => {
    const onLeave = () => {
      const v = vidRef.current;
      if (!v) return;
      const den = v.currentTime;
      const tu = Math.min(batDau.current, den);
      if (den - tu < 1) return;
      seq.current += 1;
      // `sendBeacon` là cách DUY NHẤT gửi được lúc unload — trình duyệt huỷ mọi
      // `fetch` đang bay. Không có nó thì khoảng xem cuối cùng của mỗi phiên
      // luôn mất, và với người xem một mạch rồi đóng tab thì mất gần hết.
      navigator.sendBeacon(
        API,
        new Blob(
          [
            JSON.stringify({
              ve: props.ve,
              enrollmentId: props.enrollmentId,
              lessonId: props.lessonId,
              tuSec: tu,
              denSec: den,
              seq: seq.current,
              tocDo: v.playbackRate,
              tabHien: false,
              viTriSec: den,
            }),
          ],
          { type: "application/json" },
        ),
      );
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, [props.ve, props.enrollmentId, props.lessonId]);

  // ── Hình mờ động ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setMoGoc((g) => (g + 1) % 4), MO_MS);
    return () => clearInterval(t);
  }, []);

  // ── Rào chặn tua ở client ─────────────────────────────────────────────────
  const onSeeking = () => {
    const v = vidRef.current;
    if (!v || !props.chanTua) return;
    if (v.currentTime > bienDaXem.current + 2) {
      // Kéo về ngay — server vẫn là chỗ phán, nhưng để người học tua thoải mái rồi
      // mới báo lỗi là cho họ xem một đoạn sẽ không được tính.
      v.currentTime = bienDaXem.current;
      setLoi("Khoá này không cho tua tới phần chưa xem");
      return;
    }
    batDau.current = v.currentTime;
  };

  const onRateChange = () => {
    const v = vidRef.current;
    if (!v) return;
    if (v.playbackRate > props.tocDoToiDa) v.playbackRate = props.tocDoToiDa;
  };

  const traLoi = async () => {
    if (!thachThuc) return;
    const id = thachThuc.id;
    setThachThuc(null);
    await guiNhip(id);
    void vidRef.current?.play();
  };

  const pct = props.durationSec > 0 ? Math.round((phu / props.durationSec) * 100) : 0;
  const viTriMo = [
    "top-4 left-4",
    "top-4 right-4",
    "bottom-16 right-4",
    "bottom-16 left-4",
  ][moGoc];

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={vidRef}
          src={src}
          controls
          playsInline
          preload="metadata"
          // Ẩn nút tải và chặn hình-trong-hình: cả hai đều là đường mang tệp ra
          // ngoài khung có hình mờ.
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onSeeking={onSeeking}
          onRateChange={onRateChange}
          onPause={() => void guiNhip()}
          onEnded={() => void guiNhip()}
          className="aspect-video w-full"
        >
          {props.captionKey ? (
            <track
              kind="captions"
              srcLang="vi"
              label="Tiếng Việt"
              default
              src={`/api/elearning/media/${props.captionKey}?ve=${encodeURIComponent(props.ve)}`}
            />
          ) : null}
        </video>

        {/* Hình mờ nằm NGOÀI thẻ video và `pointer-events-none` — trong thẻ thì
            trình duyệt không vẽ, còn bắt chuột thì nó chặn mất nút điều khiển. */}
        <div
          className={`pointer-events-none absolute ${viTriMo} select-none rounded bg-black/30 px-2 py-1 text-[11px] text-white/70 transition-all duration-1000`}
        >
          {props.nhanMo}
        </div>

        {thachThuc ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
            <div className="max-w-sm rounded-lg bg-background p-5 text-center">
              <p className="text-sm font-medium">{thachThuc.cauHoi}</p>
              <button
                type="button"
                onClick={() => void traLoi()}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Tôi vẫn đang xem
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Đã xem {Math.round(phu / 60)} / {Math.round(props.durationSec / 60)} phút ·{" "}
          {pct}%
        </span>
        {pct >= 95 ? (
          <span className="font-medium text-green-600">Đã hoàn thành</span>
        ) : null}
      </div>

      {loi ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{loi}</p>
      ) : null}
    </div>
  );
}
