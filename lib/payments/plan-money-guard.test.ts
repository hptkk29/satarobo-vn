// R-02 — chặn việc lưu kế hoạch đợt LÀM MẤT DẤU tiền khách đã đóng.
//
// Hai đường hại, cùng một hậu quả là ĐÒI KHÁCH TRẢ LẦN HAI:
//  (a) `materializeInstallmentRequests` VOID phiếu "thu toàn đơn" VÔ ĐIỀU KIỆN
//      (`payment-request.ts:289-294`) kể cả khi phiếu đó đã có allocation. `outstandingOf`
//      trả 0 cho phiếu VOID (`allocation.ts:43`) ⇒ tiền rơi khỏi mọi phép tính còn-thiếu,
//      trong khi phiếu đợt 1 mới sinh ở PENDING nên `_qr-core.ts:399-408` in QR đòi lại
//      đúng khoản khách vừa đóng.
//  (b) Đơn có tiền ở Ledger-A NHIỀU HƠN phần kế hoạch nhận là "đợt 1 đã thu". Phần dư đó
//      không được phiếu nào phản ánh ⇒ cũng bị đòi lại. Đây đúng hình dạng đơn prod
//      ORD-260808-000001 (3.686.000đ ở Payment, 0 PaymentAllocation — cờ
//      UNALLOCATED_PAYMENT của shadow-compare, phát ra khi `allocated < recordedPaid`).
//
// ⚠️ CÁI KHÓ CỦA CỔNG NÀY LÀ KHÔNG ĐƯỢC CHẶN LUỒNG BÌNH THƯỜNG. Sale thu tiền mặt rồi
// lưu kế hoạch với đợt 1 = đúng số đã thu là nghiệp vụ HÀNG NGÀY; một cổng gác thô theo
// "đơn có tiền thì chặn" sẽ khoá cứng màn đơn. Mọi ca dưới đây có một cặp: ca PHẢI CHẶN
// và ca PHẢI CHO QUA ngay cạnh nó.

import { describe, it, expect } from "vitest";
import { keHoachLamMatTien } from "./plan-money-guard";

const nen = { fullOrderAllocated: 0, recordedPaid: 0, allocated: 0, dot1Amount: 0 };

describe("[R02-01] phiếu 'thu toàn đơn' ĐÃ CÓ TIỀN thì không được huỷ", () => {
  it("có allocation trên phiếu toàn đơn → CHẶN", () => {
    const r = keHoachLamMatTien({ ...nen, fullOrderAllocated: 3_000_000, recordedPaid: 3_000_000, allocated: 3_000_000, dot1Amount: 3_000_000 });
    expect(r.chan).toBe(true);
    expect(r.soTien).toBe(3_000_000);
  });

  it("phiếu toàn đơn CHƯA có đồng nào → cho qua (đây là ca thường nhất)", () => {
    expect(keHoachLamMatTien({ ...nen, dot1Amount: 3_000_000 }).chan).toBe(false);
  });
});

describe("[R02-02] tiền ở Ledger-A mà kế hoạch không nhận hết → CHẶN", () => {
  it("đơn prod ORD-260808-000001: đã thu 3.686.000, kế hoạch chỉ nhận đợt 1 = 3.000.000", () => {
    // 0 allocation ⇒ cổng đo theo `fullOrderAllocated` KHÔNG bắt được ca này. Đó là lý do
    // phải có vế thứ hai: `allocated < recordedPaid`.
    const r = keHoachLamMatTien({ ...nen, recordedPaid: 3_686_000, allocated: 0, dot1Amount: 3_000_000 });
    expect(r.chan).toBe(true);
    expect(r.soTien).toBe(686_000); // phần sẽ bị đòi lại
  });

  it("LUỒNG BÌNH THƯỜNG — sale thu tiền mặt 3.000.000 rồi lưu kế hoạch đợt 1 = 3.000.000 → CHO QUA", () => {
    // Ca này là nghiệp vụ hàng ngày. Chặn nó là khoá cứng màn đơn.
    expect(keHoachLamMatTien({ ...nen, recordedPaid: 3_000_000, allocated: 0, dot1Amount: 3_000_000 }).chan).toBe(false);
  });

  it("kế hoạch nhận NHIỀU HƠN số đã thu → cho qua (khách hẹn đóng thêm, không mất gì)", () => {
    expect(keHoachLamMatTien({ ...nen, recordedPaid: 2_000_000, allocated: 0, dot1Amount: 3_000_000 }).chan).toBe(false);
  });

  it("tiền đã rót đủ vào sổ mới → cho qua (sổ mới đang giữ dấu, không mất)", () => {
    expect(keHoachLamMatTien({ ...nen, recordedPaid: 3_686_000, allocated: 3_686_000, dot1Amount: 3_000_000 }).chan).toBe(false);
  });
});

describe("[R02-03] câu từ chối phải nói được cho sale làm gì tiếp", () => {
  it("nêu SỐ TIỀN và VIỆC PHẢI LÀM, không phải chỉ 'thao tác thất bại'", () => {
    const r = keHoachLamMatTien({ ...nen, fullOrderAllocated: 3_686_000, recordedPaid: 3_686_000, allocated: 3_686_000, dot1Amount: 3_000_000 });
    expect(r.chan).toBe(true);
    expect(r.lyDo).toMatch(/3\.686\.000/);
    expect(r.lyDo).toMatch(/kế toán/i);
  });
});

describe("[R02-04] đầu vào rác không được mở cổng", () => {
  it("NaN/âm → coi như 0, không ném, không cho qua sai", () => {
    expect(keHoachLamMatTien({ ...nen, fullOrderAllocated: Number.NaN, dot1Amount: 1 }).chan).toBe(false);
    expect(keHoachLamMatTien({ ...nen, recordedPaid: Number.NaN, dot1Amount: 1 }).chan).toBe(false);
    expect(keHoachLamMatTien({ ...nen, fullOrderAllocated: -5, dot1Amount: 1 }).chan).toBe(false);
  });
});
