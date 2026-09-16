"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { xuLyThongDiep } from "../_lib/thong-diep";

/**
 * S1 — khung nhúng giao diện ZaloCRM + cầu `postMessage` chat → lead.
 *
 * `nguonGoc` truyền BẰNG PROP TỪ SERVER (tiền lệ: `_spike/omicall/page.tsx` đọc env ở
 * server rồi truyền xuống). Không đọc `process.env` ở đây: biến này không có tiền tố
 * `NEXT_PUBLIC_` nên ở client nó là `undefined` — và `undefined` so với `event.origin`
 * sẽ không khớp, tức cầu chết câm mà không có lỗi nào hiện ra.
 *
 * TOÀN BỘ phần quyết định "tin này có đáng tin không" nằm ở hàm THUẦN `xuLyThongDiep`
 * (`../_lib/thong-diep.ts`), có test riêng. Component này cố ý chỉ còn phần không test
 * được bằng object giả: gắn/gỡ trình nghe và điều hướng.
 *
 * ⚠️ Ở GĐ0 khung sẽ TRẮNG vì fork chưa nới `frame-ancestors` (việc F3, repo khác). Đó là
 * kết quả đúng — đừng "sửa" bằng cách bỏ iframe hay tắt CSP của Sata.
 */
export function ZaloCrmFrame({
  src,
  nguonGoc,
  tenCoSo,
}: {
  /** Địa chỉ nhúng đã kèm vé SSO trong `#fragment`. */
  src: string;
  /** Origin DUY NHẤT được tin khi nhận `postMessage` (đã chuẩn hoá ở server). */
  nguonGoc: string;
  tenCoSo: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function nghe(event: MessageEvent) {
      const kq = xuLyThongDiep(event, nguonGoc);
      if (!kq) return; // sai origin / tin lạ / thiếu trường — im lặng bỏ qua
      router.push(kq.duongDan);
    }
    window.addEventListener("message", nghe);
    return () => window.removeEventListener("message", nghe);
  }, [nguonGoc, router]);

  return (
    <iframe
      // Khoá lại theo `src`: đổi tab cơ sở là vé SSO khác ⇒ phải dựng khung mới, không
      // để React tái dùng khung cũ đang giữ phiên của cơ sở trước.
      key={src}
      src={src}
      title={tenCoSo ? `Zalo CRM — ${tenCoSo}` : "Zalo CRM"}
      // `h-…` ở khối cha + `min-h-0 flex-1` ở đây: iframe TỰ cuộn bên trong. Để trang
      // cuộn thì ô soạn tin của ZaloCRM trôi khỏi tầm mắt — đúng lỗi kinh điển của màn
      // chat nhét trong layout admin mà commit 9baeef95 sinh ra để sửa.
      className="min-h-0 w-full flex-1 rounded-xl border border-border bg-background"
      // `Permissions-Policy` của Sata (next.config.ts) đang TẮT camera/mic cho cả iframe
      // con. Chỉ xin `clipboard-write` — Sale copy nội dung tin. Nếu GĐ3 cần gửi tin
      // thoại thì phải sửa CẢ header đó, không chỉ thuộc tính này.
      allow="clipboard-write"
    />
  );
}
