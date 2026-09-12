// lib/payments/dung-sai-lam-tron.test.ts — TEST ĐỎ ghim 3 lỗi ĐO ĐƯỢC 13/09/2026.
//
// Ba lỗi dưới đây KHÔNG nằm trong danh sách R-01/R-02/R-04/R-13 của kế hoạch PHA 1.
// Chúng lộ ra khi phản biện đối kháng các thiết kế vá, và cả ba đều nặng hơn — một
// cái đang làm MẤT TIỀN THẬT trên đường đang chạy.
//
// ⚠️ MỌI TEST Ở ĐÂY DÙNG `it.fails` CÓ CHỦ ĐÍCH — chúng mô tả hành vi ĐÚNG mà mã
// nguồn hôm nay KHÔNG có. `it.fails` xanh khi thân test NÉM, nên:
//   · hôm nay: xanh (bug còn đó) ⇒ CI không đỏ, không chặn merge của người khác
//   · sau khi vá: test này ĐỎ ⇒ người vá BUỘC phải đổi `it.fails` thành `it`
// Đó là cái chốt: bug được ghim thành mã, và không ai vá xong mà quên gỡ ghim.
// Repo đã dùng cơ chế này (`pnpm test:unit` báo "11 expected fail").
//
// THUẦN — không DB. Toàn bộ chỉ gọi `deriveStatus`, là hàm quyết định trạng thái
// phiếu thu, và so chuỗi marker.

import { describe, it, expect } from "vitest";
import { deriveStatus } from "./allocation";

// ═══════════════════════════════════════════════════════════════════════════
// LỖI 1 — DUNG SAI LÀM TRÒN BỊ ĐÁNH MẤT KHI TÍNH LẠI ⇒ PAID tụt về PARTIAL
//
// Hai đường tính trạng thái phiếu truyền `waived` KHÁC NHAU cho cùng một phiếu:
//   · lib/payments/payos-ingest.ts:968-973 — cộng `_sum.roundingWaived` rồi truyền
//     vào `deriveStatus` ⇒ phiếu được tha đủ thành PAID.
//   · lib/payments/payment-request.ts:404 — `deriveStatus(r.amountDue, allocated, 0, ...)`
//     truyền THẲNG SỐ 0, và `allocatedByRequest` (:69-73) chỉ `_sum: { amount: true }`,
//     KHÔNG cộng `roundingWaived` ⇒ cùng phiếu đó bị tính lại thành PARTIAL.
//
// `recomputeRequestStatuses` tự khai ở `payment-request.ts:386,390` là "NƠI DUY NHẤT
// đặt PENDING/PARTIAL/PAID", và nó chạy ngay trong `materializeInstallmentRequests`
// (`:296`) — tức đúng cú bấm "Lưu kế hoạch" / "Duyệt kế hoạch" kế tiếp.
//
// ⚠️ Chú thích ở `payos-ingest.ts:947-952` nói việc lưu `roundingWaived` là để TRÁNH
// đúng chuyện này. Mã nguồn cho thấy nó VẪN CÒN. Luật A1: mã nguồn thắng chú thích.
// ═══════════════════════════════════════════════════════════════════════════

describe("[DS-01] deriveStatus — dung sai làm tròn phải BỀN qua lần tính lại", () => {
  // Khách phải đóng 8.000.000đ, chuyển 7.996.000đ (thiếu 4.000đ, trong dung sai 5.000đ).
  const AMOUNT_DUE = 8_000_000;
  const ALLOCATED = 7_996_000;
  const WAIVED = 4_000;

  it.fails("phiếu PAID nhờ dung sai KHÔNG được tụt về PARTIAL khi tính lại", () => {
    // Đường tiền về (payos-ingest) — có truyền waived:
    const luc_tien_ve = deriveStatus(AMOUNT_DUE, ALLOCATED, WAIVED, "PENDING");
    expect(luc_tien_ve).toBe("PAID");

    // Đường tính lại (recomputeRequestStatuses:404) — truyền 0:
    const luc_tinh_lai = deriveStatus(AMOUNT_DUE, ALLOCATED, 0, "PAID");

    // Cùng một phiếu, cùng một số tiền đã về, mà hai đường ra hai trạng thái khác nhau.
    // Đây là lỗi: trạng thái phiếu phải là HÀM của sổ, không phụ thuộc đường nào gọi.
    expect(luc_tinh_lai).toBe(luc_tien_ve);
  });

  it.fails("phiếu đã tha dư KHÔNG được quay lại đòi tiền sau khi tính lại", () => {
    // Hệ quả tiền: phiếu tụt về PARTIAL ⇒ `outstandingOf` (allocation.ts:43-46) trả
    // lại 4.000đ ⇒ hệ thống đòi tiếp khoản đã tha, và `isOrderSettled`
    // (allocation.ts:113-116) đòi MỌI phiếu phải PAID nên đơn không bao giờ chốt được.
    const sauKhiTinhLai = deriveStatus(AMOUNT_DUE, ALLOCATED, 0, "PAID");
    expect(sauKhiTinhLai).not.toBe("PARTIAL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LỖI 2 — "DUNG SAI LÀM TRÒN" CHO PHÉP TỚI 100.000đ, VÀ PHẦN THA KHÔNG VÀO SỔ TIỀN
//
// `lib/settings/registry.ts:210` — `schema: z.number().int().min(0).max(100_000)`,
// `default: 5_000`, `centerOverridable: true`. Nghĩa là một cơ sở đặt ngưỡng 100.000đ
// là hợp lệ, và khi đó `deriveStatus` coi phiếu ĐÃ ĐÓNG ĐỦ dù khách thiếu 100.000đ.
//
// Phần thiếu được tha KHÔNG BAO GIỜ vào Ledger-A: `payos-ingest.ts:1047` ghi
// `amount: allocated`, không cộng `waived` (tính riêng ở `:1024`, chỉ để ghi
// IntegrationLog ROUNDING_WAIVED). Công nợ HIỂN THỊ đọc `Payment` (lib/finance/debt.ts)
// ⇒ khoản chênh nằm mãi trong công nợ trong khi phiếu đã PAID và cron ngừng đòi.
//
// Đây KHÔNG phải "làm tròn": 100.000đ là tiền thật. Ghim lại để lần vá phải quyết
// nghiệp vụ (hạ trần? ghi phần tha vào sổ? hay cả hai).
// ═══════════════════════════════════════════════════════════════════════════

describe("[DS-02] ngưỡng dung sai — 100.000đ không còn là 'làm tròn'", () => {
  it.fails("thiếu 100.000đ KHÔNG được coi là đã đóng đủ", () => {
    // Ngưỡng tối đa mà registry cho phép cơ sở đặt.
    const TOI_DA_REGISTRY_CHO = 100_000;
    const trangThai = deriveStatus(8_000_000, 7_900_000, TOI_DA_REGISTRY_CHO, "PENDING");
    expect(trangThai).not.toBe("PAID");
  });

  it("dung sai mặc định 5.000đ thì cho qua — đây là hành vi CÓ CHỦ ĐÍCH, không phải bug", () => {
    // Test này là `it` thường và PHẢI xanh: nó ghim phần nghiệp vụ ĐÚNG, để lần vá
    // LỖI 2 không vô tình siết luôn ca hợp lệ (lệch vài nghìn do phí chuyển khoản).
    expect(deriveStatus(8_000_000, 7_996_000, 4_000, "PENDING")).toBe("PAID");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LỖI 3 — LƯU LẠI KẾ HOẠCH ĐỢT XOÁ MỀM TIỀN THẬT TỪ NGÂN HÀNG
//
// ĐÂY LÀ LỖI NẶNG NHẤT ĐO ĐƯỢC TRONG LƯỢT NÀY, và nó KHÔNG có trong danh sách
// R-01/R-02/R-04/R-13.
//
// `lib/orders/installments.ts:102` — `recordInstallmentPlan` xoá mềm khoản cũ bằng:
//     tx.payment.updateMany({ where: { orderId, deletedAt: null,
//                                      note: { contains: "[auto:" } },
//                             data: { deletedAt: now } })
// Ý định (chú thích `:94-101`) là dọn khoản TỰ SINH của chính kế hoạch
// (`[auto:order-confirm]`, `[auto:order-installment:dotN]`) để khỏi cộng đôi.
//
// Nhưng `lib/payments/payos-ingest.ts:1037-1052` ghi TIỀN THẬT TỪ NGÂN HÀNG với
// marker `[auto:<provider>:<txn>]` — tức `[auto:payos:TX123]` / `[auto:sepay:TX123]`.
// Chuỗi đó KHỚP `contains "[auto:"`.
//
// Hệ quả: đơn đã nhận tiền chuyển khoản, rồi ai đó bấm "Lưu kế hoạch" lần nữa
// (sửa số tiền đợt, hoặc lưu lại sau khi QLCS bác) ⇒ dòng `Payment` DUY NHẤT của
// khoản tiền thật đó bị `deletedAt`. Mọi phép đọc tiền đều lọc `deletedAt: null`
// (`lib/finance/debt.ts`, `scripts/shadow-compare-debt.ts:100`) ⇒ tiền rơi khỏi
// công nợ hiển thị. `PaymentAllocation` ở sổ mới vẫn còn ⇒ hai sổ lệch nhau đúng
// bằng số tiền khách đã chuyển.
// ═══════════════════════════════════════════════════════════════════════════

/** Đúng chuỗi mà `installments.ts:102` dùng làm điều kiện xoá mềm. */
const DIEU_KIEN_XOA_MEM = "[auto:";

/** Đúng cách `payos-ingest.ts:1038` dựng marker cho tiền thật từ ngân hàng. */
function markerTienThatTuNganHang(provider: string, providerTxnId: string): string {
  return `[auto:${provider.toLowerCase()}:${providerTxnId}]`;
}

/** Marker của khoản TỰ SINH bởi kế hoạch đợt (`lib/finance/payment.ts:55`). */
function markerKhoanTuSinh(soDot: number | null): string {
  return soDot != null ? `[auto:order-installment:dot${soDot}]` : "[auto:order-confirm]";
}

describe("[DS-03] marker tiền ngân hàng KHÔNG được trúng điều kiện xoá mềm của kế hoạch", () => {
  it("điều kiện xoá mềm PHẢI trúng khoản tự sinh của kế hoạch — đây là việc của nó", () => {
    // `it` thường, phải xanh: ghim phần ĐÚNG để lần vá không vô tình bỏ mất.
    expect(markerKhoanTuSinh(1).includes(DIEU_KIEN_XOA_MEM)).toBe(true);
    expect(markerKhoanTuSinh(2).includes(DIEU_KIEN_XOA_MEM)).toBe(true);
    expect(markerKhoanTuSinh(null).includes(DIEU_KIEN_XOA_MEM)).toBe(true);
  });

  it.fails("tiền thật từ SePay KHÔNG được trúng điều kiện xoá mềm", () => {
    expect(markerTienThatTuNganHang("SEPAY", "TX123").includes(DIEU_KIEN_XOA_MEM)).toBe(false);
  });

  it.fails("tiền thật từ payOS KHÔNG được trúng điều kiện xoá mềm", () => {
    expect(markerTienThatTuNganHang("PAYOS", "TX123").includes(DIEU_KIEN_XOA_MEM)).toBe(false);
  });

  it.fails("phải phân biệt được hai HỌ marker bằng một luật ở MỘT chỗ", () => {
    // Bản vá đúng: gom danh sách marker vào một chỗ (vd lib/finance/payment-markers.ts)
    // và hỏi "khoản này có phải do KẾ HOẠCH ĐỢT tự sinh không", thay vì so chuỗi
    // `[auto:` rải ở 3 nơi độc lập. Hàm dưới đây CHƯA TỒN TẠI — đó là nội dung bản vá.
    const laKhoanCuaKeHoach = (note: string) =>
      note.includes("[auto:order-installment:dot") || note.includes("[auto:order-confirm]");

    expect(laKhoanCuaKeHoach(markerKhoanTuSinh(1))).toBe(true);
    expect(laKhoanCuaKeHoach(markerTienThatTuNganHang("SEPAY", "TX123"))).toBe(false);

    // Vế cuối là vế ĐỎ: chứng minh mã HÔM NAY không dùng luật đó mà dùng `[auto:`.
    // Còn dùng `contains "[auto:"` thì tiền ngân hàng vẫn bị quét.
    expect(DIEU_KIEN_XOA_MEM).toBe("[auto:order-");
  });
});
