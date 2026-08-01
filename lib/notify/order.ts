import "server-only";
import { sendZaloNotification } from "@/lib/zalo/service";

// =============================================================================
// AUTH-SĐT P5 — thông báo đơn hàng cho khách KHÔNG có email.
//
// Trước P5 `customerEmail` là bắt buộc nên `sendEmailForTrigger` luôn có người
// nhận. Nay email tuỳ chọn, mà hàm đó gặp email rỗng thì trả
// `{skipped:"no_recipient_email"}` — tức khách chỉ có SĐT sẽ **không nhận được
// gì và không ai biết**. Đường này bịt đúng khoảng đó.
//
// CỐ Ý chỉ chạy khi KHÔNG có email: khách có email vẫn nhận đúng bản email dựng
// từ `EmailTemplate` (nội dung phong phú hơn, admin sửa được ở /email-templates).
// Gửi cả hai là gửi trùng.
//
// ⚠️ TÊN THAM SỐ LÀ HỢP ĐỒNG VỚI MẪU ĐÃ DUYỆT — bài học PR #77 (mẫu Xác thực bắt
// buộc tên `otp`, gửi `code` thì Zalo trả -1122). Mẫu học phí đã duyệt là
// `616258`; PHẢI đối chiếu tên tham số thật của mẫu đó trước khi đặt env
// `ZALO_ZNS_TEMPLATE_PAYMENT`. Chưa đặt env → `sendZaloNotification` tự SKIPPED,
// không lỗi, không tốn tin.
// =============================================================================

const ZNS_TEMPLATE_PAYMENT = process.env.ZALO_ZNS_TEMPLATE_PAYMENT || null;

export type OrderZnsInput = {
  customerPhone: string | null;
  customerEmail: string | null;
  customerName: string | null;
  orderCode: string;
  amount: number;
};

/**
 * Gửi ZNS xác nhận đơn/biên nhận khi khách KHÔNG có email. Best-effort: nuốt lỗi,
 * không chặn luồng tiền (giống mọi đường thông báo khác).
 */
export async function notifyOrderByZnsIfNoEmail(input: OrderZnsInput): Promise<void> {
  if (input.customerEmail?.trim()) return; // đã có email → email lo, không gửi trùng
  const phone = input.customerPhone?.trim();
  if (!phone) return;

  await sendZaloNotification({
    toPhone: phone,
    templateKey: ZNS_TEMPLATE_PAYMENT,
    params: {
      name: input.customerName ?? "Quý phụ huynh",
      order: input.orderCode,
      amount: input.amount.toLocaleString("vi-VN"),
    },
    fallbackEmail: null, // không có email — đó chính là lý do vào hàm này
  }).catch(() => {});
}
