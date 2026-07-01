"use client";

// components/admin/slide-stage.tsx — khung trình chiếu DÙNG CHUNG cho giáo án PDF & SCORM.
//   • Thanh tiêu đề (luôn hiện kể cả full màn hình): tên + toolbar + nút full + nhãn loại.
//   • Khung đen chứa nội dung (iframe SCORM hoặc canvas PDF) truyền qua children.
//   • Watermark {mã NV · tên · giờ} di chuyển + tự khôi phục khi bị sửa (truy vết người lộ).
//   • Blur overlay CHỈ khi RỜI THẬT (đổi tab / thu nhỏ / chuyển ứng dụng) — KHÔNG ẩn khi
//     bấm nút/next hay click vào nội dung (focus vào iframe) hay lúc bật/tắt full màn hình.
//   Lưu ý: KHÔNG thể chặn chụp màn hình OS (PrintScreen / Win+Shift+S) từ web — watermark
//   là biện pháp răn đe chính.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

function hhmmss(d: Date): string {
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function SlideStage({
  title,
  kindLabel,
  name,
  employeeCode,
  statusLabel,
  lastAccessedLabel,
  toolbar,
  children,
}: {
  title: string;
  /** Nhãn loại hiển thị góc phải: "SCORM" | "PDF". */
  kindLabel: string;
  name: string;
  employeeCode: string;
  statusLabel?: string;
  lastAccessedLabel?: string;
  /** Điều khiển riêng theo loại (vd PDF: ‹ 3/12 ›). */
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const [blurred, setBlurred] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clock, setClock] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const label = `${employeeCode}${employeeCode ? " · " : ""}${name}`.trim();
  const watermark = `${label}${label ? " · " : ""}${clock}`;

  // Blur overlay khi RỜI THẬT khỏi cửa sổ học (đổi tab/thu nhỏ/sang app khác). Bỏ qua:
  //  - focus chuyển VÀO iframe (click nội dung SCORM) → activeElement là IFRAME.
  //  - thời điểm bật/tắt full màn hình (focus chuyển tạm) → guard 700ms.
  useEffect(() => {
    let fsGuardUntil = 0;
    const onVisibility = () => setBlurred(document.hidden);
    const onWinBlur = () => {
      if (Date.now() < fsGuardUntil) return;
      if (document.activeElement?.tagName === "IFRAME") return;
      setBlurred(true);
    };
    const onWinFocus = () => setBlurred(false);
    const onFsChange = () => {
      fsGuardUntil = Date.now() + 700;
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    try {
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("blur", onWinBlur);
      window.addEventListener("focus", onWinFocus);
      document.addEventListener("fullscreenchange", onFsChange);
    } catch {
      /* fail-open */
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onWinBlur);
      window.removeEventListener("focus", onWinFocus);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, []);

  // Đồng hồ watermark — cập nhật mỗi giây (dấu thời gian để truy vết ai chụp/lộ).
  // Re-render mỗi giây cũng giúp React dựng lại lớp watermark nếu bị can thiệp.
  useEffect(() => {
    const upd = () => setClock(hhmmss(new Date()));
    upd();
    const t = window.setInterval(upd, 1000);
    return () => window.clearInterval(t);
  }, []);

  // Deterrent (best-effort, KHÔNG tuyệt đối): chặn chuột phải + Ctrl/Cmd+P/S + cố vô hiệu
  // PrintScreen (ghi đè clipboard + blur). Win+Shift+S do OS bắt → web KHÔNG chặn được.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        try {
          void navigator.clipboard?.writeText("");
        } catch {
          /* clipboard API có thể bị chặn — bỏ qua */
        }
        setBlurred(true);
        window.setTimeout(() => setBlurred(false), 800);
        return;
      }
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === "p" || k === "s")) {
        e.preventDefault();
      }
    };
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  function toggleFullscreen() {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen();
    } catch {
      /* fail-open */
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex flex-col gap-2",
        isFullscreen ? "h-screen w-screen bg-black p-2" : "h-[calc(100vh-2rem)] p-2",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <h1
          className={cn(
            "truncate text-sm font-medium",
            isFullscreen ? "text-white/90" : "text-foreground",
          )}
        >
          {title}
        </h1>
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 text-xs",
            isFullscreen ? "text-white/70" : "text-muted-foreground",
          )}
        >
          {statusLabel ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
              Giảng: {statusLabel}
              {lastAccessedLabel ? ` · ${lastAccessedLabel}` : ""}
            </span>
          ) : null}
          {toolbar}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5",
              isFullscreen
                ? "border-white/30 text-white/80 hover:bg-white/10"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <span>{kindLabel}</span>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-md border border-border bg-black">
        {children}

        {/* Watermark LẶP KÍN slide (chéo) — chống xoá bằng Photoshop sau khi chụp:
            phủ {mã NV · tên · giờ} khắp nội dung; gỡ hết các lớp đè lên slide = phá luôn
            nội dung. KHÔNG bắt sự kiện. (Web không thể chặn chụp màn hình OS — đây là
            biện pháp truy vết/răn đe chính.) */}
        <div className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden">
          <div className="absolute inset-[-20%] flex flex-wrap content-center justify-center gap-x-28 gap-y-28 rotate-[-30deg]">
            {Array.from({ length: 18 }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className="whitespace-nowrap text-3xl font-semibold text-neutral-500"
                style={{ opacity: 0.1 }}
              >
                {watermark}
              </span>
            ))}
          </div>
        </div>

        {/* Blur overlay khi rời cửa sổ học thật sự */}
        {blurred ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-xl">
            <p className="px-4 text-center text-sm text-muted-foreground">
              Nội dung tạm ẩn khi rời khỏi cửa sổ học. Quay lại để tiếp tục.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
