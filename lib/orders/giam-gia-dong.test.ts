import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  KIEU_GIAM,
  discountFromPercent,
  dongThieuGiaiTrinh,
  tienDon,
  tienDong,
} from "./giam-gia-dong";

/**
 * GIẢM GIÁ THEO TỪNG DÒNG (15/09/2026).
 *
 * Đây là phép trừ mà CẢ HAI VẾ đều do client khai (`unitPrice` và phần giảm), nên mọi
 * ca dưới đây đang canh cùng một thứ: server phải tự tính ra con số, và con số đó phải
 * giống hệt con số form vẽ lên màn hình.
 */
describe("[GGD] tiền của một dòng", () => {
  it("[GGD-01] không khai giảm ⇒ thành tiền = tạm tính", () => {
    expect(tienDong({ unitPrice: 2_400_000, quantity: 1 })).toEqual({
      tamTinh: 2_400_000,
      giam: 0,
      thanhTien: 2_400_000,
      phanTram: null,
    });
  });

  it("[GGD-02] giảm theo SỐ TIỀN — tạm tính nhân theo số lượng", () => {
    const t = tienDong({
      unitPrice: 1_000_000,
      quantity: 3,
      giam: { kieu: KIEU_GIAM.SO_TIEN, giaTri: 200_000 },
    });
    expect(t).toEqual({ tamTinh: 3_000_000, giam: 200_000, thanhTien: 2_800_000, phanTram: null });
  });

  it("[GGD-03] giảm theo % tính trên tạm tính CỦA CHÍNH DÒNG, không phải của cả đơn", () => {
    // Con số này là toàn bộ lý do đợt sửa tồn tại: 10% của dòng 10.560.000đ là
    // 1.056.000đ, còn 10% của cả đơn (12.960.000đ) là 1.296.000đ. Lệch 240.000đ, và
    // không có gì trên màn hình nói ra là đã lấy nhầm mẫu số.
    const t = tienDong({
      unitPrice: 10_560_000,
      quantity: 1,
      giam: { kieu: KIEU_GIAM.PHAN_TRAM, giaTri: 10 },
    });
    expect(t.giam).toBe(1_056_000);
    expect(t.thanhTien).toBe(9_504_000);
    expect(t.phanTram).toBe(10);
  });

  it("[GGD-04] giảm KHÔNG vượt tạm tính của dòng — không có dòng âm", () => {
    const t = tienDong({
      unitPrice: 1_000_000,
      quantity: 1,
      giam: { kieu: KIEU_GIAM.SO_TIEN, giaTri: 9_999_999 },
    });
    expect(t.giam).toBe(1_000_000);
    expect(t.thanhTien).toBe(0);
  });

  it("[GGD-05] % ngoài [0,100] bị kẹp", () => {
    expect(tienDong({ unitPrice: 1_000_000, quantity: 1, giam: { kieu: KIEU_GIAM.PHAN_TRAM, giaTri: 150 } }).giam).toBe(1_000_000);
    expect(tienDong({ unitPrice: 1_000_000, quantity: 1, giam: { kieu: KIEU_GIAM.PHAN_TRAM, giaTri: -5 } }).giam).toBe(0);
  });

  it("[GGD-06] discountFromPercent giữ nguyên hành vi sau khi dời khỏi discount.ts", () => {
    // Cùng bộ số với `lib/orders/discount.test.ts` — dời tệp không được đổi phép tính.
    expect(discountFromPercent(1_000_000, 10)).toBe(100_000);
    expect(discountFromPercent(3_333_333, 15)).toBe(500_000);
    expect(discountFromPercent(1_000_000, 150)).toBe(1_000_000);
  });
});

describe("[GGD] tiền của cả đơn", () => {
  // Đơn thật đang nghiệm thu: hai con, hai khoá.
  const HAI_CON = [
    { unitPrice: 2_400_000, quantity: 1, giam: null },
    { unitPrice: 10_560_000, quantity: 1, giam: { kieu: KIEU_GIAM.PHAN_TRAM, giaTri: 10 } },
  ];

  it("[GGD-07] tổng giảm = Σ giảm từng dòng, KHÔNG phải % trên tổng đơn", () => {
    const t = tienDon(HAI_CON);
    expect(t.tamTinh).toBe(12_960_000);
    expect(t.tongGiam).toBe(1_056_000); // 10% CỦA DÒNG 2, không phải 1.296.000đ
    expect(t.tongDon).toBe(11_904_000);
  });

  it("[GGD-08] một dòng giảm lố KHÔNG được dòng khác gánh hộ", () => {
    // Nếu kẹp ở TỔNG thay vì ở từng dòng, đơn dưới đây vẫn ra 400.000đ trông hợp lệ,
    // trong khi dòng 1 đang mang giá ÂM. Kẹp phải nằm ở mức dòng.
    const t = tienDon([
      { unitPrice: 1_000_000, quantity: 1, giam: { kieu: KIEU_GIAM.SO_TIEN, giaTri: 3_000_000 } },
      { unitPrice: 2_000_000, quantity: 1, giam: null },
    ]);
    expect(t.dong[0]!.thanhTien).toBe(0);
    expect(t.tongGiam).toBe(1_000_000);
    expect(t.tongDon).toBe(2_000_000);
  });

  it("[GGD-09] phí vận chuyển cộng SAU khi trừ giảm", () => {
    expect(tienDon([{ unitPrice: 1_000_000, quantity: 1, giam: { kieu: KIEU_GIAM.SO_TIEN, giaTri: 200_000 } }], 50_000).tongDon).toBe(850_000);
  });

  it("[GGD-10] tổng đơn không bao giờ âm dù mọi dòng giảm hết", () => {
    const t = tienDon([
      { unitPrice: 1_000_000, quantity: 1, giam: { kieu: KIEU_GIAM.PHAN_TRAM, giaTri: 100 } },
      { unitPrice: 2_000_000, quantity: 1, giam: { kieu: KIEU_GIAM.PHAN_TRAM, giaTri: 100 } },
    ]);
    expect(t.tongDon).toBe(0);
  });
});

describe("[GGD] giải trình theo dòng", () => {
  it("[GGD-11] dòng có giảm mà thiếu giải trình ⇒ trả về chỉ số của nó", () => {
    expect(
      dongThieuGiaiTrinh([
        { unitPrice: 1_000_000, quantity: 1, giam: null },
        { unitPrice: 2_000_000, quantity: 1, giam: { kieu: KIEU_GIAM.SO_TIEN, giaTri: 100_000 }, lyDo: "  " },
        { unitPrice: 3_000_000, quantity: 1, giam: { kieu: KIEU_GIAM.SO_TIEN, giaTri: 100_000 }, lyDo: "em ruột" },
      ]),
    ).toEqual([1]);
  });

  it("[GGD-12] dòng KHÔNG giảm thì không đòi giải trình", () => {
    expect(dongThieuGiaiTrinh([{ unitPrice: 1_000_000, quantity: 1, giam: null }])).toEqual([]);
  });
});

/**
 * LƯỚI GHIM MÃ NGUỒN — không ai được tự tính lại phép trừ này.
 *
 * Mọi ca ở trên vẫn XANH nếu action bỏ quên `tienDon(...)` và quay lại tin
 * `data.discountAmount` client gửi: hàm thuần vẫn đúng, chỉ lời gọi biến mất. Đó đúng là
 * lớp bug mẫu này sinh ra để chặn (CLAUDE.md — LƯỚI GHIM MÃ NGUỒN).
 *
 * Đã cấy lại để thấy ĐỎ — xem commit message.
 */
describe("[GGD] lưới ghim: tiền của đơn phải do server tính lại", () => {
  const action = readFileSync(
    resolve(process.cwd(), "app/(admin)/admin/orders/_actions.ts"),
    "utf8",
  );
  const validator = readFileSync(
    resolve(process.cwd(), "lib/validators/order.ts"),
    "utf8",
  );
  const form = readFileSync(
    resolve(process.cwd(), "app/(admin)/admin/orders/_components/order-create-form.tsx"),
    "utf8",
  );

  it("[GGD-13] action ghi discountAmount bằng TỔNG tính được, không phải số client gửi", () => {
    expect(action).toMatch(/discountAmount: tien\.tongGiam,/);
    expect(action).not.toMatch(/discountAmount: data\.discountAmount,/);
  });

  it("[GGD-14] subtotal + totalAmount cùng đến từ MỘT lời gọi tienDon", () => {
    const goi = action.match(/const tien = tienDon\(khaiDong, data\.shippingFee\);/g) ?? [];
    expect(goi.length).toBe(1);
    expect(action).toMatch(/const subtotal = tien\.tamTinh;/);
    expect(action).toMatch(/const totalAmount = tien\.tongDon;/);
    // Phép cộng tay cũ phải biến mất — nó là đường vòng qua chính hàm vừa dựng.
    expect(action).not.toMatch(/const totalAmount = subtotal - data\.discountAmount/);
  });

  it("[GGD-15] giảm giá CẤP ĐƠN bị từ chối cho ra tiếng, không bị bỏ qua im lặng", () => {
    // Bỏ hẳn khoá khỏi schema thì Zod lặng lẽ vứt nó đi và đơn tạo ra với giá NGUYÊN —
    // mất tiền mà không lỗi nào báo. Phải là một refine TỪ CHỐI.
    expect(validator).toMatch(/Giảm giá nay khai theo TỪNG DÒNG, không khai ở cấp đơn/);
  });

  it("[GGD-16] form KHÔNG còn ô giảm giá cấp đơn", () => {
    // `discountMode`/`setDiscountAmount` là state của khối "Định giá" cũ.
    expect(form).not.toMatch(/const \[discountMode, setDiscountMode\]/);
    expect(form).not.toMatch(/const \[discountAmount, setDiscountAmount\]/);
  });

  it("[GGD-17] form và server dùng CHUNG một hàm tính, không mỗi bên một bản", () => {
    for (const nguon of [action, form]) {
      expect(nguon).toMatch(/from "@\/lib\/orders\/giam-gia-dong"/);
    }
    expect(form).toMatch(/tienDon\(/);
  });
});
