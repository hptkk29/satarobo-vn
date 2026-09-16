// lib/payments/plan-money-guard.ts — R-02: cổng chặn việc lưu kế hoạch đợt LÀM MẤT DẤU
// tiền khách đã đóng.
//
// THUẦN — không DB. Người gọi đo bốn con số rồi hỏi; luật nằm ở một chỗ, test không cần DB.

import { formatVndPlain } from "@/lib/format/money";

export type PlanMoneyState = {
  /** Σ allocation đang nằm trên phiếu "thu toàn đơn" CÒN SỐNG của đơn. */
  fullOrderAllocated: number;
  /** Σ `Payment` còn sống, `saleStatus = RECORDED`, ĐO SAU lượt xoá mềm của chính kế hoạch. */
  recordedPaid: number;
  /** Σ `PaymentAllocation` của đơn (mọi phiếu). */
  allocated: number;
  /** Số tiền đợt 1 mà kế hoạch sắp lưu nhận là "đã thu". */
  dot1Amount: number;
};

export type PlanMoneyVerdict = {
  chan: boolean;
  /** Câu nói cho người bấm nút — phải nêu SỐ TIỀN và VIỆC PHẢI LÀM. */
  lyDo?: string;
  /** Số tiền đang bị đe doạ, để ghi nhật ký và hiện lên màn. */
  soTien?: number;
};

/** Số tiền hợp lệ hay 0 — đầu vào rác KHÔNG được mở cổng, cũng không được ném. */
function tien(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Lưu kế hoạch đợt lúc này có làm mất dấu tiền khách đã đóng không.
 *
 * HAI ĐƯỜNG HẠI, cùng hậu quả là ĐÒI KHÁCH TRẢ LẦN HAI:
 *
 * (a) Phiếu "thu toàn đơn" đã có tiền rót vào.
 *     `materializeInstallmentRequests` VOID nó VÔ ĐIỀU KIỆN (`payment-request.ts:289-294`
 *     — chỉ đọc `allocated` ở `:290` để ghi nhật ký rồi vẫn VOID). `outstandingOf` trả 0
 *     cho phiếu VOID (`allocation.ts:43`) ⇒ tiền rơi khỏi mọi phép tính còn-thiếu, còn
 *     phiếu đợt 1 mới sinh ở PENDING nên `_qr-core.ts:399-408` in QR đòi lại đúng khoản
 *     khách vừa đóng. Nhánh TỪ CHỐI kế hoạch (`revertInstallmentRequests:352-362`) đã gác
 *     đúng bằng `keptWithMoney` — cùng file, cùng luật, chỉ nhánh xuôi bị bỏ sót.
 *
 * (b) Ledger-A có nhiều tiền hơn phần kế hoạch nhận là "đợt 1 đã thu".
 *     Phần dư không được phiếu nào phản ánh ⇒ cũng bị đòi lại. Đây đúng hình dạng đơn
 *     prod `ORD-260808-000001`: 3.686.000đ ở `Payment`, **0** `PaymentAllocation` — nên
 *     cổng chỉ đo theo (a) sẽ để lọt đúng ca thật duy nhất đang có.
 *
 * ⚠️ VÌ SAO ĐIỀU KIỆN (b) PHẢI SO VỚI `dot1Amount`, KHÔNG PHẢI CHỈ `allocated < recordedPaid`:
 * sale thu tiền mặt rồi lưu kế hoạch với đợt 1 = đúng số đã thu là nghiệp vụ HÀNG NGÀY,
 * và ca đó luôn có `allocated(0) < recordedPaid`. Gác thô theo "đơn có tiền thì chặn" là
 * khoá cứng màn đơn. Chỉ phần tiền mà kế hoạch KHÔNG nhận (`recordedPaid − dot1Amount`)
 * mới là phần sắp bị đòi lại. `[R02-02]` khoá cả hai chiều: ca chặn và ca cho qua.
 *
 * KHÔNG tự sửa/di chuyển một đồng nào — chỉ trả lời có chặn hay không. Người gọi `throw`
 * để rollback cả transaction; trả cờ là vô dụng vì cả 3 chỗ gọi đều bỏ giá trị trả về và
 * transaction vẫn commit phần phá hoại.
 */
export function keHoachLamMatTien(state: PlanMoneyState): PlanMoneyVerdict {
  const fullAlloc = tien(state.fullOrderAllocated);
  const daThu = tien(state.recordedPaid);
  const daRot = tien(state.allocated);
  const dot1 = tien(state.dot1Amount);

  if (fullAlloc > 0) {
    return {
      chan: true,
      soTien: fullAlloc,
      lyDo:
        `Phiếu thu toàn đơn đã nhận ${formatVndPlain(fullAlloc, false)}. Chuyển sang thu ` +
        `theo đợt lúc này sẽ huỷ phiếu đang giữ số tiền đó và xuất mã QR đòi khách lần hai. ` +
        `Nhờ kế toán đối soát khoản này trước, rồi lập lại kế hoạch.`,
    };
  }

  // (b) — chỉ phần Ledger-A mà kế hoạch KHÔNG nhận, và chỉ khi sổ mới cũng chưa giữ dấu.
  if (daRot < daThu) {
    const boSot = daThu - Math.max(dot1, daRot);
    if (boSot > 0) {
      return {
        chan: true,
        soTien: boSot,
        lyDo:
          `Đơn đã ghi nhận ${formatVndPlain(daThu, false)} nhưng kế hoạch chỉ nhận ` +
          `${formatVndPlain(dot1, false)} cho đợt 1 — chênh ${formatVndPlain(boSot, false)} ` +
          `sẽ không nằm trong phiếu thu nào và khách bị đòi lại. Sửa số tiền đợt 1 cho khớp, ` +
          `hoặc nhờ kế toán đối soát khoản chênh trước.`,
      };
    }
  }

  return { chan: false };
}
