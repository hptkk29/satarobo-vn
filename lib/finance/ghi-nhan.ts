// lib/finance/ghi-nhan.ts — TRỤC B: "hệ thống đã GHI NHẬN bao nhiêu tiền cho đơn này".
//
// ─────────────────────────────────────────────────────────────────────────────
// Hai trục, hai câu hỏi. KHÔNG gộp.
//
//   Trục A — `lib/finance/debt.ts` — "kế toán đã XÁC NHẬN bao nhiêu"
//     lọc `accountantStatus = CONFIRMED` · khoá theo **ghi danh**
//     dùng ở: công nợ · cổng phụ huynh · học phí · báo cáo doanh thu
//
//   Trục B — file này — "hệ thống đã GHI NHẬN bao nhiêu"
//     lọc `saleStatus = RECORDED` · khoá theo **đơn hàng**
//     dùng ở: số tiền in trên mã QR · đối khớp webhook SePay · tin ZNS học phí ·
//             cổng cho phép chốt lead thành ghi danh
//
// CHÊNH LỆCH giữa hai số là thông tin, không phải lỗi: nó chính là "tiền đã về nhưng kế
// toán chưa đối soát". Gộp hai hàm là xoá mất tín hiệu phát hiện webhook hỏng — đó là lý
// do chủ dự án chốt giữ hai đường riêng.
//
// ⚠️ KHOÁ CỦA TRỤC B LÀ ĐƠN HÀNG, KHÔNG PHẢI GHI DANH. `payos-ingest.ts` (tiền về qua
// cổng thanh toán) KHÔNG BAO GIỜ set `enrollmentId`; ép khoá `enrollmentId` ở đây là nuốt
// mất chính những khoản đó. Trục A ngược lại luôn có `enrollmentId` vì `confirmPayment`
// từ chối xác nhận khoản chưa gắn ghi danh.
//
// ─────────────────────────────────────────────────────────────────────────────
// Bút toán ĐIỀU CHỈNH ở trục B
//
// Dòng ADJUSTMENT kế thừa `saleStatus` của phiếu gốc, nên nó ĐƯỢC CỘNG ở đây — và như
// vậy là đúng: `amount` của nó là DELTA. Phiếu 4tr điều chỉnh còn 3tr ⇒ 4tr + (−1tr) = 3tr,
// đúng số tiền thực nhận.
//
// (Trước 07/09/2026 thì sai: dòng điều chỉnh mang SỐ TUYỆT ĐỐI mà vẫn kế thừa
// `saleStatus`, nên trục B cộng cả 4tr lẫn 3tr = 7tr — nhân đôi tiền ngay tại chỗ quyết
// định số in trên mã QR và chỗ đối khớp tiền về.)
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@/lib/db";

/**
 * Điều kiện `where` cho MỌI truy vấn cộng tiền đã ghi nhận.
 *
 * ⚠️ KHÔNG đụng `accountantStatus`: khoản chờ kế toán vẫn là tiền đã về. Đó chính là
 * điểm khác biệt với trục A, đừng "sửa cho giống".
 */
export const KHOAN_DA_GHI_NHAN = {
  saleStatus: "RECORDED",
  deletedAt: null,
} as const;

/** Σ tiền đã ghi nhận của MỘT đơn hàng. */
export async function sumRecorded(orderId: string): Promise<number> {
  const r = await db.payment.aggregate({
    where: { orderId, ...KHOAN_DA_GHI_NHAN },
    _sum: { amount: true },
  });
  return r._sum.amount ?? 0;
}
