// FL2-03 — Validate bàn giao (transfer) lead: chặn chọn cơ sở/sale đích TRÙNG nguồn.
// THUẦN (testable Vitest). Lỗi trả về theo format dự án {code EN, message VI}.
// Quy tắc: bàn giao phải THỰC SỰ đổi tay — đổi sale HOẶC đổi cơ sở. Nếu sale đích =
// sale nguồn → vô nghĩa; nếu cơ sở không đổi mà cũng không đổi sale → không có gì để
// bàn giao.

export type TransferTargetError = { code: string; message: string };

/**
 * @param fromCenterId cơ sở hiện tại của lead (null = chưa rõ)
 * @param fromSaleId   sale đang phụ trách (null = chưa gán)
 * @param toCenterId   cơ sở đích đã chuẩn hoá (rỗng = giữ nguyên)
 * @param toSaleId     sale đích đã chọn (rỗng = chia theo chế độ cơ sở mới)
 */
export function validateTransferTarget(input: {
  fromCenterId: string | null;
  fromSaleId: string | null;
  toCenterId: string | null;
  toSaleId: string | null;
}): { ok: true } | { ok: false; error: TransferTargetError } {
  const toCenter = input.toCenterId || input.fromCenterId || null;
  const centerChanged = !!toCenter && toCenter !== input.fromCenterId;

  // 1) Sale đích trùng sale nguồn → chặn (dù có đổi cơ sở hay không).
  if (input.toSaleId && input.toSaleId === input.fromSaleId) {
    return {
      ok: false,
      error: {
        code: "SAME_SALE",
        message: "Sale nhận phải khác sale đang phụ trách — không thể bàn giao cho chính mình.",
      },
    };
  }

  // 2) Không chỉ định sale mới VÀ không đổi cơ sở → không có gì để bàn giao.
  if (!input.toSaleId && !centerChanged) {
    return {
      ok: false,
      error: {
        code: "NO_CHANGE",
        message: "Cơ sở và sale đích trùng nguồn — chọn cơ sở khác hoặc sale khác để bàn giao.",
      },
    };
  }

  return { ok: true };
}
