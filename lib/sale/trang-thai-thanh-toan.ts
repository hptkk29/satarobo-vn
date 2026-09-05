/**
 * Site Sale — nhãn + thang màu ngữ nghĩa cho màn "Thanh toán".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA TỆP NÀO, VÀ VÌ SAO ───────────────────────────────────
 * Bản gốc: năm hằng nằm THẲNG trong
 * `app/(admin)/admin/payments/_components/payments-client.tsx` —
 * `SALE_LABEL`, `SALE_BADGE`, `ACC_LABEL`, `ACC_BADGE`, `METHOD_OPTIONS`.
 *
 * Đã soi trước khi chép, không chép cho tiện:
 *   · `lib/pdf/receipt.tsx` và `lib/portal/billing.ts` mỗi nơi có một bảng tên
 *     phương thức RIÊNG, và **không bảng nào trùng danh sách 5 mã** mà ô "Phương
 *     thức *" của màn này cho chọn (CASH · BANK_TRANSFER · VNPAY · TINGEE · COD).
 *     Gọi lại một trong hai là đổi NỘI DUNG ô chọn — đúng thứ đợt tách này không
 *     được phép làm.
 *   · Không có `lib/payments/*` nào giữ nhãn trạng thái Sale/Kế toán.
 * ⇒ buộc phải CHÉP. Đây là **nợ trôi lệch có ghi sổ**: đổi nhãn hoặc thêm mã
 *   phương thức ở bản admin thì phải sửa cả tệp này. Chủ dự án chốt 04/09/2026
 *   tách bản riêng và đã được nêu rủi ro này.
 *
 * ── CHỮ giữ nguyên 100%, MÀU thì đi qua thang ngữ nghĩa ─────────────────────
 * Nhãn chép NGUYÊN VĂN — người dùng hai khu phải gọi cùng một thứ bằng cùng một
 * tên. Màu thì `<StatusPill tone>` thay cho chuỗi class gõ tay.
 *
 * ⚠️ MỘT CHỖ CỐ Ý ĐỔI NGHĨA — `REFUNDED` và `ADJUSTED`. Bản admin cho cả hai tone
 *    thương hiệu (`bg-primary-soft text-primary`). Hệ thiết kế Sale CẤM: tím ở đây
 *    là màu của NÚT và MỤC ĐANG ĐỨNG, gán thêm nghĩa "một trạng thái kế toán nào
 *    đó" là hỏng cả hai nghĩa (tiền lệ `trang-thai-dang-ky.ts`, TRANSFERRED
 *    brand→muted). Hai trạng thái này về `muted` — vẫn CÙNG MỘT MÀU với nhau y
 *    như bản admin, nên không mất khả năng phân biệt nào so với hôm nay: chữ mới
 *    là thứ phân biệt chúng, ở cả hai khu.
 *
 * ⚠️ KHÔNG có phép tính tiền nào trong tệp này. Đây thuần nhãn + màu.
 *
 * Hàm THUẦN: không DB, không env, không `Date`.
 */
import type { PillTone } from "@/components/admin/ui/status-pill";

// ─── Trạng thái phía NGƯỜI THU (Payment.saleStatus) ─────────────────────────
// Cột `saleStatus` là `String` trần trong schema, không phải enum Prisma ⇒ bảng
// tra là `Record<string, …>` với đường lùi "in thẳng giá trị thô", ĐÚNG như bản
// admin (`SALE_LABEL[p.saleStatus] ?? p.saleStatus`). Giá trị lạ hiện ra bằng mã
// gốc còn hơn hiện ra khoảng trắng.
export const NHAN_TRANG_THAI_SALE: Record<string, string> = {
  RECORDED: "Đã ghi nhận",
  COLLECT_CONFIRMED: "Đã xác nhận thu",
};

const TONE_TRANG_THAI_SALE: Record<string, PillTone> = {
  RECORDED: "muted",
  COLLECT_CONFIRMED: "info",
};

export function nhanTrangThaiSale(ma: string): string {
  return NHAN_TRANG_THAI_SALE[ma] ?? ma;
}
export function toneTrangThaiSale(ma: string): PillTone {
  return TONE_TRANG_THAI_SALE[ma] ?? "muted";
}

// ─── Trạng thái phía KẾ TOÁN (Payment.accountantStatus) ─────────────────────
export const NHAN_TRANG_THAI_KE_TOAN: Record<string, string> = {
  PENDING: "Chờ kế toán",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Từ chối",
  REFUNDED: "Đã hoàn",
  ADJUSTED: "Điều chỉnh",
};

const TONE_TRANG_THAI_KE_TOAN: Record<string, PillTone> = {
  PENDING: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
  REFUNDED: "muted",
  ADJUSTED: "muted",
};

export function nhanTrangThaiKeToan(ma: string): string {
  return NHAN_TRANG_THAI_KE_TOAN[ma] ?? ma;
}
export function toneTrangThaiKeToan(ma: string): PillTone {
  return TONE_TRANG_THAI_KE_TOAN[ma] ?? "muted";
}

// ─── Phương thức thu ────────────────────────────────────────────────────────
/** Mục của ô "Phương thức *" — ĐÚNG thứ tự và ĐÚNG câu chữ của bản admin. */
export const MUC_PHUONG_THUC: ReadonlyArray<{ value: string; label: string }> = [
  { value: "CASH", label: "Tiền mặt" },
  { value: "BANK_TRANSFER", label: "Chuyển khoản" },
  { value: "VNPAY", label: "VNPAY" },
  { value: "TINGEE", label: "Tingee" },
  { value: "COD", label: "COD" },
];

const NHAN_PHUONG_THUC: Record<string, string> = Object.fromEntries(
  MUC_PHUONG_THUC.map((m) => [m.value, m.label]),
);

/** Dữ liệu cũ có thể mang mã ngoài 5 mục trên → in thẳng mã, như bản admin. */
export function nhanPhuongThuc(ma: string): string {
  return NHAN_PHUONG_THUC[ma] ?? ma;
}
