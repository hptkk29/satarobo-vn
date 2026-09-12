import { withCron } from "@/lib/cron/handler";
import { doiSoatZalocrm } from "@/lib/integrations/zalocrm/doi-soat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GĐ3 (tích hợp ZaloCRM) — LƯỚI AN TOÀN cho đường webhook, chạy 5 phút một lần.
//
// Vì sao có: hàng đợi của fork thử lại 1s / 30s / 5 phút rồi BỎ CUỘC. Sata nằm ngoài
// tầm ~5 phút rưỡi đó — một lượt triển khai lâu, một sự cố Vercel kéo dài — là tin rơi
// vĩnh viễn và rơi IM LẶNG: khách đã nhắn, hộp thư trống, đồng hồ chăm sóc của phiếu
// vẫn chạy như chưa ai nhắn. Bộ này quét lại 30 phút gần nhất và nạp bù.
//
// Nạp bù đi qua ĐÚNG đường của webhook (`dichPayloadZalocrm` + `napSuKienZalocrm`),
// không có đường ghi thứ hai — xem chú thích đầu `lib/integrations/zalocrm/doi-soat.ts`.
// Chống trùng có sẵn: `channelMessageId` là UNIQUE, nên chạy lại bao nhiêu lượt cũng
// ra cùng một trạng thái.
//
// KHÔNG tốn gì khi chưa tới GĐ3: cơ sở nào chưa khai khoá API thì bỏ qua lặng lẽ,
// không gọi mạng, không ghi nhật ký.
//
// withCron = verifyCronAuth (CRON_SECRET, sai/thiếu → 401 trước mọi việc) + try/catch
// JSON có cấu trúc (API-18).
//
// Kill switch: xoá entry cron trong vercel.json — webhook vẫn chạy, chỉ mất lưới bù.
export const GET = withCron("zalocrm-doi-soat", async () => {
  const data = await doiSoatZalocrm();
  return { ok: true, data };
});
