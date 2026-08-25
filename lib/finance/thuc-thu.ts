// lib/finance/thuc-thu.ts — B-02 · quyết định B3 (24/08/2026).
//
// MỘT công thức "thực thu" cho toàn hệ thống. Trước đây mỗi màn tự cộng một kiểu:
// màn kế toán và ROAS cộng `Order.totalAmount` (giá trị hợp đồng đã chốt — tiền có thể
// chưa về, và hoàn/điều chỉnh không bao giờ đụng tới nó), báo cáo doanh thu cộng
// `Payment` nhưng chỉ lấy CONFIRMED nên bút toán hoàn (âm) rơi ra ngoài. Kết quả: số
// doanh thu PHỒNG, và phồng im lặng.
//
// Luật đúng, bám đúng cách `lib/finance/payment.ts` ghi sổ:
//   • CONFIRMED — kế toán đã xác nhận. Đây là tiền thật.        → cộng
//   • REFUNDED  — refundPayment() ghi bút toán ÂM đối ứng,
//                 KHÔNG xoá bản gốc.                            → cộng (số âm ⇒ trừ ra)
//   • ADJUSTED  — adjustPayment() tạo bản MỚI mang số đúng và
//                 KHÔNG sửa bản gốc ⇒ bản gốc phải bị LOẠI,
//                 nếu không là cộng đôi.                        → cộng, và loại bản gốc
//   • PENDING / REJECTED — chưa/không phải tiền thật.           → bỏ
//
// ⚠️ Số của kế toán và ROAS sẽ TỤT khi bản này lên prod — đó là mức phồng cũ bị gỡ,
// không phải mất doanh thu. Đo trước/sau bằng §B.6.8 trước khi thông báo.
import type { Prisma } from "@prisma/client";

/** Bút toán Payment phẳng — đủ dữ kiện để quyết định nó có được tính hay không. */
export type ThucThuButToan = {
  id: string;
  amount: number;
  /** PaymentAccountantStatus dạng chuỗi (nhận cả string thô từ query select). */
  accountantStatus: string;
  /** Trỏ về bút toán bị điều chỉnh / bị hoàn. */
  adjustmentOfId: string | null;
};

/** Ba trạng thái kế toán tham gia phép tính thực thu. */
export const TRANG_THAI_THUC_THU = ["CONFIRMED", "REFUNDED", "ADJUSTED"] as const;

/**
 * Mảnh `where` chuẩn cho MỌI query thực thu (`aggregate` / `groupBy` / `findMany`).
 * Đây là bản dịch SQL của đúng luật mà `butToanThucThu()` cài đặt:
 *   - `deletedAt: null`   — bỏ bút toán đã xoá mềm;
 *   - `accountantStatus`  — chỉ 3 trạng thái trên;
 *   - `adjustments.none`  — LOẠI bản gốc đã bị một bản ADJUSTED thay thế.
 * Bỏ nhánh `adjustments.none` = bản gốc quay lại phép cộng ⇒ doanh thu phồng lại.
 */
export const WHERE_THUC_THU = {
  deletedAt: null,
  accountantStatus: { in: [...TRANG_THAI_THUC_THU] },
  adjustments: { none: { accountantStatus: "ADJUSTED", deletedAt: null } },
} satisfies Prisma.PaymentWhereInput;

/**
 * THUẦN — lọc ra đúng những bút toán ĐƯỢC TÍNH vào thực thu (giữ nguyên dấu).
 * Dùng cho caller đã có sẵn mảng row (vd. gom theo tháng/ngày). Chạy sau
 * `WHERE_THUC_THU` thì không đổi kết quả — nó là lớp chắn, không phải bước thứ hai.
 */
export function butToanThucThu<T extends ThucThuButToan>(rows: T[]): T[] {
  // Bản gốc bị thay thế = có một bút toán ADJUSTED trỏ về nó. Chuỗi điều chỉnh
  // nhiều lần (A ← B ← C) tự rụng dần: B trỏ về A, C trỏ về B ⇒ chỉ C sống.
  const daBiThayThe = new Set<string>();
  for (const r of rows) {
    if (r.accountantStatus === "ADJUSTED" && r.adjustmentOfId) daBiThayThe.add(r.adjustmentOfId);
  }
  const hopLe: readonly string[] = TRANG_THAI_THUC_THU;
  return rows.filter((r) => hopLe.includes(r.accountantStatus) && !daBiThayThe.has(r.id));
}

/** THUẦN — tổng thực thu của một mảng bút toán. */
export function tinhThucThu(rows: ThucThuButToan[]): number {
  return butToanThucThu(rows).reduce((s, r) => s + r.amount, 0);
}

/** Trường tối thiểu phải `select` khi caller muốn tự gom nhóm rồi lọc lại. */
export const SELECT_THUC_THU = {
  id: true,
  amount: true,
  accountantStatus: true,
  adjustmentOfId: true,
} as const;
