// lib/finance/cau-dao-hoan-tien.ts — CẦU DAO TÍNH NĂNG cho "Tạo yêu cầu hoàn tiền".
//
// ⚠️⚠️ FILE NÀY LÀ TẠM. PHẢI XOÁ HẲN — cả file, cả chỗ gọi — KHI ĐỦ 4 ĐIỀU KIỆN DƯỚI. ⚠️⚠️
//
// Dựng theo đúng khuôn `cau-dao-dieu-chinh.ts` (Bước 1c, đã gỡ ở `bb0ea47d`).
//
// ─────────────────────────────────────────────────────────────────────────────
// Đây KHÔNG phải RBAC
//
// Quyền hoàn tiền là chuyện khác và vẫn giữ nguyên. Cầu dao này nằm CHỒNG LÊN nó, vì
// ma trận quyền KHÔNG khoá được SUPER_ADMIN: `can()` v2 trả `true` vô điều kiện cho
// SUPER_ADMIN trước khi tra bảng, và repo có bất biến bắt mọi action phải cấp cho
// SUPER_ADMIN ở v1 để hai bản không lệch. Quyền lo "ai được phép"; cầu dao lo "tính
// năng này đang tắt". Hai câu hỏi khác nhau.
//
// ─────────────────────────────────────────────────────────────────────────────
// Vì sao tắt (08/09/2026)
//
// `createRefundRequest` snapshot `sessionsLearned` bằng
// `classSession.count({ status: "COMPLETED" })`, rồi:
//
//     proposedAmount = max(0, paidConfirmed − sessionsLearned × unitPrice)
//
// Trên prod, `status` KHÔNG phản ánh thực tế đã dạy: đo 07/09/2026 được
// **2 buổi COMPLETED / 287 SCHEDULED** trong 4 tháng, trong đó **209 buổi đã qua ngày**
// mà chưa ai chốt. Với một lớp đã dạy gần hết khoá, `sessionsLearned` vẫn đọc ra 0 ⇒
// hệ thống đề xuất hoàn **100% học phí**.
//
// Hai bản vá ngày 07–08/09 (`4df347b4` cổng so ngày · `a94e5aa7` giao tập studentId)
// làm buổi MỚI đóng được, nhưng **không hồi tố**: 209 buổi cũ vẫn SCHEDULED, nên mẫu số
// của mọi lớp đang chạy vẫn thiếu.
//
// ⚠️ LUẬT ĐỌC SỐ (docs/luat-doc-so-va-ket-luan.md §Luật 1): `RefundRequest` đo được
// **0 dòng trên prod**, nhưng ĐƯỜNG GHI CÒN SỐNG (2 caller: gỡ học viên khỏi lớp, huỷ
// lớp) ⇒ đây là **BOM HẸN GIỜ**, không phải "chưa cần lo". Nó nổ ở lần đầu tiên có
// người gỡ một học viên ra khỏi lớp, chứ không âm ỉ sẵn.
//
// ─────────────────────────────────────────────────────────────────────────────
// ĐIỀU KIỆN GỠ — xoá file này khi VÀ CHỈ KHI đủ cả bốn:
//   1. `ClassSession.status` phản ánh đúng thực tế: đo trên prod, số buổi ĐÃ QUA NGÀY
//      mà chưa COMPLETED (không tính buổi huỷ / lớp không có GV chính) ≈ 0.
//      Đo bằng `scripts/do-backlog-buoi-chua-chot.ts`.
//   2. `createRefundRequest` TỪ CHỐI đề xuất khi lớp có buổi đã qua ngày mà
//      `sessionsLearned = 0` — ném lỗi rõ ràng, KHÔNG lặng lẽ đề xuất 100%.
//   3. Có test cho ca "lớp đã dạy nhiều buổi nhưng `status` chưa đóng" ⇒ không sinh
//      đề xuất hoàn toàn phần.
//   4. Backlog 209 buổi đã xử xong (đóng đúng nhóm thoả cổng, hoặc chốt là không đóng).
// Gỡ xong nhớ chạy lại `scripts/do-backlog-buoi-chua-chot.ts` để chốt số.
// ─────────────────────────────────────────────────────────────────────────────
import "server-only";

import { writeAudit } from "@/lib/audit/audit-log";

/**
 * `true` = tính năng Tạo yêu cầu hoàn tiền ĐANG TẮT cho MỌI người, kể cả SUPER_ADMIN.
 *
 * Hằng, không đọc env: đây là cầu dao có chủ đích trong một khoảng thời gian đã biết,
 * không phải một nút gạt vận hành. Bật lại bằng cách XOÁ nó, không phải đổi thành `false`.
 */
export const REFUND_REQUEST_DISABLED = true;

/** Câu nói thật với người dùng: tạm khoá để sửa, KHÔNG phải "bạn không có quyền". */
export const REFUND_REQUEST_DISABLED_MESSAGE =
  "Chức năng đề xuất hoàn tiền đang tạm khoá để sửa lỗi số buổi đã học (hệ thống đang " +
  "đếm thiếu buổi đã dạy nên đề xuất hoàn quá nhiều). Việc gỡ học viên khỏi lớp vẫn " +
  "thực hiện được bình thường; phần tiền xin xử lý tay và báo kỹ thuật.";

/**
 * Ghi lại MỖI LẦN có người chạm phải cầu dao — ai, lúc nào, ghi danh nào.
 *
 * Đây là tín hiệu NGHIỆP VỤ, không phải log kỹ thuật: `RefundRequest` đang 0 dòng, nên
 * lần chạm đầu tiên chính là câu trả lời cho "có ai thực sự cần hoàn tiền không". Ghi
 * hai nơi vì hai người đọc khác nhau — `AuditLog` để tra trong ứng dụng, `console.warn`
 * để thấy trong `vercel logs`.
 *
 * KHÔNG ném lỗi ra ngoài: cầu dao đã chặn rồi, log hỏng không được biến thành lỗi 500 —
 * và đường gọi nằm TRONG transaction gỡ học viên, ném ở đây là cuộn ngược cả việc gỡ.
 */
export async function ghiNhanChamCauDaoHoanTien(params: {
  actorId: string | null;
  actorName: string;
  enrollmentId: string;
  trigger: string;
}): Promise<void> {
  const { actorId, actorName, enrollmentId, trigger } = params;
  console.warn(
    `[cau-dao] Tạo yêu cầu hoàn tiền bị chặn — actor=${actorId ?? "?"} (${actorName}) enrollment=${enrollmentId} trigger=${trigger}`,
  );
  try {
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "finance",
      entityType: "RefundRequest",
      entityId: enrollmentId,
      action: "REFUND_REQUEST_BLOCKED",
      newValues: { lyDo: "REFUND_REQUEST_DISABLED", trigger },
      reason:
        "Cầu dao tính năng: tạo yêu cầu hoàn tiền đang tắt vì sessionsLearned đọc theo " +
        "ClassSession.status, mà status đang thiếu 209 buổi đã dạy",
    });
  } catch (err) {
    console.error("[cau-dao] không ghi được AuditLog:", err);
  }
}
