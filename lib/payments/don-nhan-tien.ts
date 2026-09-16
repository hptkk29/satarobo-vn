// lib/payments/don-nhan-tien.ts — ĐƠN NÀY CÓ NHẬN TIỀN TỰ ĐỘNG ĐƯỢC KHÔNG. Thuần.
//
// ─────────────────────────────────────────────────────────────────────────────
// PHIÊN A (16/09/2026) — tách ra khỏi `payos-ingest.ts` vì một lý do đo được.
//
// Luật này trước đây sống ở BA chỗ với BA hình dạng khác nhau: nhánh (d) của
// `resolvePaymentTargetDetailed` có nó (dưới dạng `status: { notIn: [...] }` trong `where`),
// còn nhánh (a) `matchKey` và nhánh (b) `QrSession` thì KHÔNG có gì cả. Hệ quả: một đơn đã HUỶ
// vẫn hút được tiền — phụ huynh còn giữ ảnh QR cũ, quét lại, và `matchKey` bền theo đời phiếu
// nên nó khớp ngay.
//
// ⚠️ Và lý do tách thành HÀM THUẦN chứ không để nguyên biểu thức tại chỗ: một cổng viết inline
// chỉ kiểm được bằng cách soi văn bản mã, mà soi văn bản thì ĐẾM được số lần xuất hiện chứ
// KHÔNG kiểm được phép nối. Đo thật: đổi một dấu `&&` thành `||` trong biểu thức cũ — cổng mở
// toang, và lưới ghim mã nguồn vẫn XANH vì mọi chuỗi nó tìm đều còn nguyên. Hàm thuần thì test
// được hành vi, và một `||` nhầm chỗ sẽ đỏ ngay.

/** Trạng thái đơn KHÔNG bao giờ là đích rót tiền tự động. */
export const TRANG_THAI_DON_KHONG_NHAN_TIEN = ["DRAFT", "CANCELLED", "REFUNDED"] as const;

/**
 * Đơn này có được nhận tiền tự động không.
 *
 * Ba vế, và phải là VÀ cả ba:
 *   · đơn chưa xoá mềm;
 *   · đơn không ở DRAFT/CANCELLED/REFUNDED;
 *   · phiếu thu chưa VOID (huỷ đợt xong mà QR cũ vẫn khớp là rót vào chỗ đã bỏ).
 *
 * `DRAFT` nằm trong danh sách có chủ ý: đó là đơn sale ĐANG SOẠN DỞ (vẫn kịp có phiếu thu
 * PENDING). Rót tiền vào đó là chốt giùm một đơn chưa ai duyệt, trong khi đơn thật của khách
 * vẫn nợ.
 */
export function donNhanTienTuDong(input: {
  trangThaiDon: string;
  donDaXoa: boolean;
  trangThaiPhieu: string;
}): boolean {
  if (input.donDaXoa) return false;
  if ((TRANG_THAI_DON_KHONG_NHAN_TIEN as readonly string[]).includes(input.trangThaiDon)) {
    return false;
  }
  return input.trangThaiPhieu !== "VOID";
}

/**
 * Bản nhận thẳng PHIẾU (có thể `null`) — dành cho nhánh QrSession.
 *
 * ⚠️ Tồn tại vì một lý do đo được, không phải vì tiện. Bản đầu của nhánh đó viết:
 *
 *     const qrConHieuLuc = phieuCuaQr != null && donNhanTienTuDong({ … });
 *
 * Đổi một dấu `&&` thành `||` là cổng mở toang — và **lưới ghim mã nguồn vẫn XANH**, vì mọi
 * chuỗi nó tìm (`donNhanTienTuDong(`, `TRANG_THAI_DON_KHONG_NHAN_TIEN`) đều còn nguyên. Soi văn
 * bản ĐẾM được số lần xuất hiện nhưng KHÔNG kiểm được phép nối. Đã cấy và thấy nó lọt.
 *
 * Cách sửa không phải viết lưới tinh vi hơn, mà là **bỏ phép nối đi**: hàm này nuốt luôn vế
 * `null`, nên nhánh gọi chỉ còn đúng một lời gọi và không còn boolean nào để lật.
 */
export function qrConRotDuocTien(
  phieu: { status: string; order: { status: string; deletedAt: Date | null } } | null | undefined,
): boolean {
  if (phieu == null) return false;
  return donNhanTienTuDong({
    trangThaiDon: phieu.order.status,
    donDaXoa: phieu.order.deletedAt != null,
    trangThaiPhieu: phieu.status,
  });
}
