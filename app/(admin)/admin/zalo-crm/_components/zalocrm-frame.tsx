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
    // 🔴 BỌC CUỘN NGANG + ÉP BỀ RỘNG TỐI THIỂU (17/09/2026) — đây KHÔNG phải trang trí.
    //
    // Bên trong iframe, `window.innerWidth` là bề rộng của KHUNG, không phải của trình
    // duyệt. Fork lấy đúng số đó để quyết định giao diện:
    //     use-mobile.ts:5,13   const MOBILE_BREAKPOINT = 768;
    //                          isMobile.value = window.innerWidth < MOBILE_BREAKPOINT;
    // Khung admin (sidebar ~256px + padding) làm cửa sổ 1024 chỉ còn ~740px cho iframe
    // ⇒ fork khởi động ở chế độ MOBILE. Và ở chế độ đó:
    //     ChatView.vue:651-653  onMounted(async () => { if (!isMobile.value) {
    //                             await fetchZaloAccounts(); … fetchConversations(); … } })
    // — TOÀN BỘ lượt nạp nằm trong nhánh desktop, `onMounted` chạy MỘT LẦN, và KHÔNG có
    // `watch(isMobile)` nạp bù. Nên khung hẹp lúc mở = không bao giờ nạp danh sách nick;
    // rộng ra sau đó thì giao diện desktop hiện lên với dữ liệu RỖNG ("Phạm vi xem
    // 0 online · 0 offline"). Đo 17/09: `/api/v1/zalo-accounts` được gọi 0/921 lần.
    //
    // `min-w-[900px]` vượt ngưỡng 768 với biên an toàn; `overflow-x-auto` giữ cho phần
    // còn lại của trang admin KHÔNG bị đẩy ngang trên màn hẹp — chỉ ô này cuộn.
    // Gỡ hai lớp này là lỗi quay lại NGAY, và quay lại theo kiểu im lặng.
    <div className="flex min-h-0 flex-1 overflow-x-auto">
    <iframe
      // Khoá lại theo `src`: đổi tab cơ sở là vé SSO khác ⇒ phải dựng khung mới, không
      // để React tái dùng khung cũ đang giữ phiên của cơ sở trước.
      key={src}
      src={src}
      title={tenCoSo ? `Zalo CRM — ${tenCoSo}` : "Zalo CRM"}
      // `h-…` ở khối cha + `min-h-0 flex-1` ở đây: iframe TỰ cuộn bên trong. Để trang
      // cuộn thì ô soạn tin của ZaloCRM trôi khỏi tầm mắt — đúng lỗi kinh điển của màn
      // chat nhét trong layout admin mà commit 9baeef95 sinh ra để sửa.
      className="min-h-0 w-full min-w-[900px] flex-1 rounded-xl border border-border bg-background"
      // `Permissions-Policy` của Sata (next.config.ts) đang TẮT camera/mic cho cả iframe
      // con. Chỉ xin `clipboard-write` — Sale copy nội dung tin. Nếu GĐ3 cần gửi tin
      // thoại thì phải sửa CẢ header đó, không chỉ thuộc tính này.
      allow="clipboard-write"
    />
    </div>
  );
}
