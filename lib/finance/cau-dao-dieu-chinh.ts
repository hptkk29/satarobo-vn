// lib/finance/cau-dao-dieu-chinh.ts — CẦU DAO TÍNH NĂNG cho "Điều chỉnh khoản thu".
//
// ⚠️⚠️ FILE NÀY LÀ TẠM. PHẢI XOÁ HẲN — cả file, cả chỗ gọi — KHI BƯỚC 6 XANH. ⚠️⚠️
//
// ─────────────────────────────────────────────────────────────────────────────
// Đây KHÔNG phải RBAC
//
// Quyền `payments:adjust` (lib/auth/permissions.ts) là một chuyện khác và vẫn giữ
// nguyên. Cầu dao này nằm CHỒNG LÊN nó, và tồn tại vì một lý do rất cụ thể: ma trận
// quyền KHÔNG khoá được SUPER_ADMIN trên prod. `can()` v2 (lib/auth/can.ts:52) trả
// `true` vô điều kiện cho SUPER_ADMIN trước khi tra bảng, và repo có bất biến bắt mọi
// action phải cấp cho SUPER_ADMIN ở v1 (`permissions.test.ts`) để hai bản không lệch
// nhau — nên không có cách nào khoá kín bằng đường quyền mà không phình danh sách
// ngoại lệ mà chính repo cấm phình.
//
// Vậy nên: quyền lo chuyện "ai được phép", cầu dao lo chuyện "tính năng này đang tắt".
// Hai câu hỏi khác nhau, đừng trộn.
//
// ─────────────────────────────────────────────────────────────────────────────
// Vì sao tắt (07/09/2026)
//
// `adjustPayment` ghi SỐ TUYỆT ĐỐI vào một dòng Payment mới mang
// `accountantStatus = ADJUSTED` (lib/finance/payment.ts:612). Hậu quả hai chiều:
//   · trục kế toán lọc `accountantStatus = CONFIRMED` ⇒ KHÔNG thấy dòng điều chỉnh,
//     số kế toán vừa sửa không bao giờ tới phụ huynh;
//   · trục ghi nhận lọc `saleStatus = RECORDED` (mã QR · webhook SePay · tin ZNS ·
//     cổng chốt lead) ⇒ cộng CẢ dòng gốc LẪN dòng điều chỉnh, tức NHÂN ĐÔI tiền.
//
// Đo 07/09 trên cả ba môi trường — local · dev/test · **prod** (prod: đúng 1 khoản
// CONFIRMED, 3.686.000 đ; 0 ADJUSTED; 0 xoá mềm). Lỗi TIỀM ẨN: nó nổ ở lần đầu tiên
// có người bấm nút, chứ không âm ỉ sẵn.
//
// ─────────────────────────────────────────────────────────────────────────────
// ĐIỀU KIỆN GỠ — xoá file này khi VÀ CHỈ KHI đủ cả bốn:
//   1. `adjustPayment` đã viết lại theo mô hình delta (Bước 3): dòng mới mang
//      `paymentType = ADJUSTMENT`, `amount` = delta (cho phép ÂM), không đụng dòng gốc.
//   2. `accountantStatus` không còn giá trị `ADJUSTED` (Bước 2).
//   3. Phép cộng đi qua predicate dùng chung, ADJUSTMENT luôn được cộng (Bước 4).
//   4. Toàn bộ bộ test Bước 6 xanh — gồm ca chênh lệch hai trục được bảo toàn.
// Gỡ xong nhớ mở lại `payments:adjust` cho vai nghiệp vụ (hiện chỉ SUPER_ADMIN).
// ─────────────────────────────────────────────────────────────────────────────
import "server-only";

import { writeAudit } from "@/lib/audit/audit-log";

/**
 * `true` = tính năng Điều chỉnh khoản thu ĐANG TẮT cho MỌI người, kể cả SUPER_ADMIN.
 *
 * Hằng, không đọc env: đây là cầu dao có chủ đích trong một khoảng thời gian đã biết,
 * không phải một nút gạt vận hành. Bật lại bằng cách XOÁ nó, không phải đổi thành `false`.
 */
export const ADJUST_PAYMENT_DISABLED = true;

/** Câu nói thật với kế toán: tạm khoá để sửa, KHÔNG phải "bạn không có quyền". */
export const ADJUST_PAYMENT_DISABLED_MESSAGE =
  "Chức năng Điều chỉnh đang tạm khoá để sửa lỗi bút toán (số điều chỉnh hiện không " +
  "tới được phụ huynh và bị cộng đôi ở sổ ghi nhận). Cần sửa số thì từ chối khoản này " +
  "rồi ghi nhận lại khoản mới. Báo kỹ thuật nếu bạn đang cần gấp.";

/**
 * Ghi lại MỖI LẦN có người chạm phải cầu dao — ai, lúc nào, khoản nào.
 *
 * Đây là tín hiệu nghiệp vụ, không phải log kỹ thuật: nếu kế toán thật sự đang cần bấm
 * nút này thì phải biết NGAY, chứ không đợi tới lúc mở lại. Ghi hai nơi vì hai người đọc
 * khác nhau — `AuditLog` để tra trong ứng dụng, `console.warn` để thấy trong `vercel logs`.
 *
 * KHÔNG ném lỗi ra ngoài: cầu dao đã chặn rồi, log hỏng không được biến thành lỗi 500.
 */
export async function ghiNhanChamCauDao(params: {
  actorId: string | null;
  actorName: string;
  paymentId: string | null;
}): Promise<void> {
  const { actorId, actorName, paymentId } = params;
  console.warn(
    `[cau-dao] Điều chỉnh khoản thu bị chặn — actor=${actorId ?? "?"} (${actorName}) payment=${paymentId ?? "?"}`,
  );
  try {
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "finance",
      entityType: "Payment",
      // Không có paymentId (input rác / gọi thẳng endpoint) vẫn phải ghi được.
      entityId: paymentId ?? "(không rõ)",
      action: "ADJUST_BLOCKED",
      newValues: { lyDo: "ADJUST_PAYMENT_DISABLED" },
      reason: "Cầu dao tính năng: điều chỉnh khoản thu đang tắt để sửa lỗi bút toán",
    });
  } catch (err) {
    console.error("[cau-dao] không ghi được AuditLog:", err);
  }
}
