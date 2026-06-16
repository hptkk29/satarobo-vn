"use client";

// components/admin/scorm-player.tsx — R7-12: player SCORM chống quay lén (best-effort).
//   • iframe sandbox trỏ asset resolver (vé trong query) — KHÔNG nút tải.
//   • blur overlay khi rời tab / mất focus / nhấn PrintScreen (giảm chụp màn hình).
//   • watermark canvas {employeeCode · name · HH:mm:ss} đổi vị trí 15-30s +
//     MutationObserver tự khôi phục nếu bị xoá/sửa qua DevTools.
//   • stub window.API / window.API_1484_11 no-op (SCORM không tracking — fail-open).
// Mọi hiệu ứng bảo vệ FAIL-OPEN: lỗi JS không được chặn việc dạy học.
import { useEffect, useRef, useState } from "react";

interface ScormPlayerProps {
  launchTicket: string;
  /** href launch tương đối trong gói (vd "res/index.html"). */
  launchUrl: string;
  packageName: string;
  name: string;
  employeeCode: string;
}

/** Build src iframe: mã hoá từng segment, đính vé vào query. */
function buildAssetSrc(launchUrl: string, ticket: string): string {
  const clean = launchUrl.replace(/\\/g, "/").replace(/^\.?\//, "");
  const encoded = clean
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/api/scorm/asset/${encoded}?t=${encodeURIComponent(ticket)}`;
}

function hhmmss(d: Date): string {
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function ScormPlayer({
  launchTicket,
  launchUrl,
  packageName,
  name,
  employeeCode,
}: ScormPlayerProps) {
  const [blurred, setBlurred] = useState(false);
  const wmRef = useRef<HTMLDivElement | null>(null);
  const src = buildAssetSrc(launchUrl, launchTicket);
  const label = `${employeeCode}${employeeCode ? " · " : ""}${name}`.trim();

  // Stub SCORM API no-op (nội dung tìm window.parent.API/API_1484_11) — không tracking.
  useEffect(() => {
    try {
      const noop = () => "true";
      const empty = () => "";
      const ok = () => "0";
      const api12 = {
        LMSInitialize: noop,
        LMSFinish: noop,
        LMSGetValue: empty,
        LMSSetValue: noop,
        LMSCommit: noop,
        LMSGetLastError: ok,
        LMSGetErrorString: empty,
        LMSGetDiagnostic: empty,
      };
      const api2004 = {
        Initialize: noop,
        Terminate: noop,
        GetValue: empty,
        SetValue: noop,
        Commit: noop,
        GetLastError: ok,
        GetErrorString: empty,
        GetDiagnostic: empty,
      };
      const w = window as unknown as Record<string, unknown>;
      if (!w.API) w.API = api12;
      if (!w.API_1484_11) w.API_1484_11 = api2004;
    } catch {
      /* fail-open */
    }
  }, []);

  // Blur overlay khi rời tab / mất focus / PrintScreen.
  useEffect(() => {
    try {
      const onHidden = () => {
        if (document.hidden) setBlurred(true);
        else setBlurred(false);
      };
      const onBlur = () => setBlurred(true);
      const onFocus = () => setBlurred(false);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "PrintScreen" || e.code === "PrintScreen") {
          setBlurred(true);
          window.setTimeout(() => setBlurred(false), 1500);
        }
      };
      document.addEventListener("visibilitychange", onHidden);
      window.addEventListener("blur", onBlur);
      window.addEventListener("focus", onFocus);
      window.addEventListener("keyup", onKey);
      window.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("visibilitychange", onHidden);
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("keyup", onKey);
        window.removeEventListener("keydown", onKey);
      };
    } catch {
      return; /* fail-open */
    }
  }, []);

  // Watermark: cập nhật đồng hồ mỗi giây, đổi vị trí 15-30s, tự khôi phục khi bị sửa.
  useEffect(() => {
    let clockTimer: number | undefined;
    let moveTimer: number | undefined;
    let observer: MutationObserver | undefined;
    try {
      const render = () => {
        const el = wmRef.current;
        if (!el) return;
        el.textContent = `${label} · ${hhmmss(new Date())}`;
      };
      const reposition = () => {
        const el = wmRef.current;
        if (!el) return;
        el.style.top = `${10 + Math.random() * 70}%`;
        el.style.left = `${5 + Math.random() * 60}%`;
      };
      const restoreStyle = () => {
        const el = wmRef.current;
        if (!el) return;
        // Khôi phục các thuộc tính then chốt nếu bị DevTools chỉnh để ẩn watermark.
        el.style.display = "block";
        el.style.opacity = "0.45";
        el.style.visibility = "visible";
        el.style.pointerEvents = "none";
      };

      render();
      reposition();
      restoreStyle();

      clockTimer = window.setInterval(render, 1000);
      const scheduleMove = () => {
        const next = 15000 + Math.random() * 15000; // 15-30s
        moveTimer = window.setTimeout(() => {
          reposition();
          scheduleMove();
        }, next);
      };
      scheduleMove();

      const el = wmRef.current;
      if (el) {
        observer = new MutationObserver(() => {
          restoreStyle();
          if (!el.textContent) render();
        });
        observer.observe(el, {
          attributes: true,
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    } catch {
      /* fail-open: watermark hỏng không chặn dạy học */
    }
    return () => {
      if (clockTimer) window.clearInterval(clockTimer);
      if (moveTimer) window.clearTimeout(moveTimer);
      if (observer) observer.disconnect();
    };
  }, [label]);

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col gap-3 p-2">
      <div className="flex items-center justify-between px-1">
        <h1 className="truncate text-sm font-medium text-foreground">
          {packageName}
        </h1>
        <span className="text-xs text-muted-foreground">SCORM</span>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-md border border-border bg-black">
        <iframe
          title={packageName}
          src={src}
          className="absolute inset-0 h-full w-full bg-white"
          // KHÔNG allow-downloads → ẩn khả năng tải; allow-scripts/forms cho nội dung chạy.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
        />

        {/* Watermark (overlay, không bắt sự kiện) */}
        <div
          ref={wmRef}
          aria-hidden
          className="pointer-events-none absolute z-10 select-none whitespace-nowrap text-sm font-semibold text-red-600/60 drop-shadow"
          style={{ top: "10%", left: "10%", opacity: 0.45 }}
        />

        {/* Blur overlay khi rời tab / PrintScreen */}
        {blurred ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-xl">
            <p className="px-4 text-center text-sm text-muted-foreground">
              Nội dung tạm ẩn khi rời khỏi cửa sổ học. Quay lại tab để tiếp tục.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
