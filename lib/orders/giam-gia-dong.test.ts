import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  KIEU_GIAM,
  TRAN_KHOAN_GIAM_MOI_DONG,
  discountFromPercent,
  dongThieuGiaiTrinh,
  giaiTrinhGopChoDon,
  gopGiamGia,
  loiThieuGiaiTrinh,
  tienDon,
  tienDong,
} from "./giam-gia-dong";

const TIEN = { kieu: KIEU_GIAM.SO_TIEN } as const;
const PCT = { kieu: KIEU_GIAM.PHAN_TRAM } as const;

/**
 * GIẢM GIÁ THEO TỪNG DÒNG, NHIỀU KHOẢN MỖI DÒNG (15/09/2026).
 *
 * Đây là phép trừ mà CẢ HAI VẾ đều do client khai (`unitPrice` và các khoản giảm), nên
 * mọi ca dưới đây canh cùng một thứ: server phải tự tính ra con số, và con số đó phải
 * giống hệt con số form vẽ lên màn hình.
 */
describe("[GGD] tiền của một dòng", () => {
  it("[GGD-01] không khai khoản nào ⇒ thành tiền = tạm tính", () => {
    const t = tienDong({ unitPrice: 2_400_000, quantity: 1 });
    expect(t).toMatchObject({ tamTinh: 2_400_000, giam: 0, thanhTien: 2_400_000, phanTram: null });
    expect(t.khoan).toEqual([]);
  });

  it("[GGD-02] giảm theo SỐ TIỀN — tạm tính nhân theo số lượng", () => {
    const t = tienDong({
      unitPrice: 1_000_000,
      quantity: 3,
      giam: [{ ...TIEN, giaTri: 200_000 }],
    });
    expect(t.tamTinh).toBe(3_000_000);
    expect(t.giam).toBe(200_000);
    expect(t.thanhTien).toBe(2_800_000);
  });

  it("[GGD-03] % tính trên tạm tính CỦA CHÍNH DÒNG, không phải của cả đơn", () => {
    // Con số này là lý do đợt sáng nay tồn tại: 10% của dòng 10.560.000đ là 1.056.000đ,
    // còn 10% của cả đơn (12.960.000đ) là 1.296.000đ. Lệch 240.000đ, và không có gì
    // trên màn hình nói ra là đã lấy nhầm mẫu số.
    const t = tienDong({ unitPrice: 10_560_000, quantity: 1, giam: [{ ...PCT, giaTri: 10 }] });
    expect(t.giam).toBe(1_056_000);
    expect(t.thanhTien).toBe(9_504_000);
    expect(t.phanTram).toBe(10);
  });

  it("[GGD-04] một khoản giảm lố bị kẹp ở tạm tính của dòng — không có dòng âm", () => {
    const t = tienDong({ unitPrice: 1_000_000, quantity: 1, giam: [{ ...TIEN, giaTri: 9_999_999 }] });
    expect(t.giam).toBe(1_000_000);
    expect(t.thanhTien).toBe(0);
    // `giaTri` giữ Ý ĐỊNH, `giam` giữ SỐ THẬT — mất một trong hai là mất dấu việc đã cắt.
    expect(t.khoan[0]).toMatchObject({ giaTri: 9_999_999, giam: 1_000_000 });
  });

  it("[GGD-05] % ngoài [0,100] bị kẹp", () => {
    expect(tienDong({ unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 150 }] }).giam).toBe(1_000_000);
    expect(tienDong({ unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: -5 }] }).giam).toBe(0);
  });

  it("[GGD-06] discountFromPercent giữ nguyên hành vi sau khi dời khỏi discount.ts", () => {
    expect(discountFromPercent(1_000_000, 10)).toBe(100_000);
    expect(discountFromPercent(3_333_333, 15)).toBe(500_000);
    expect(discountFromPercent(1_000_000, 150)).toBe(1_000_000);
  });
});

describe("[GGD] NHIỀU khoản trên một dòng", () => {
  it("[GGD-07] các khoản CỘNG DỒN, không lũy tiến", () => {
    // Ca phân biệt hai luật: cộng dồn = 30%, lũy tiến = 1 − 0,9×0,8 = 28%.
    // Chọn cộng dồn vì đó là cách phụ huynh tự nhẩm; một con số khách không nhẩm được
    // là một cuộc gọi thắc mắc.
    const t = tienDong({
      unitPrice: 1_000_000,
      quantity: 1,
      giam: [{ ...PCT, giaTri: 10 }, { ...PCT, giaTri: 20 }],
    });
    expect(t.giam).toBe(300_000); // KHÔNG phải 280.000
    expect(t.thanhTien).toBe(700_000);
  });

  it("[GGD-08] trộn % và số tiền — mỗi khoản tính trên tạm tính GỐC", () => {
    const t = tienDong({
      unitPrice: 2_400_000,
      quantity: 1,
      giam: [
        { ...PCT, giaTri: 10, lyDo: "anh chị em" },
        { ...TIEN, giaTri: 500_000, lyDo: "đóng sớm" },
      ],
    });
    expect(t.khoan.map((k) => k.giam)).toEqual([240_000, 500_000]);
    expect(t.giam).toBe(740_000);
    expect(t.thanhTien).toBe(1_660_000);
  });

  it("[GGD-09] nhiều khoản ⇒ phanTram của DÒNG là null", () => {
    // "Phần trăm của cả dòng" không tồn tại như một con số khi có hai khoản; trả một số
    // gần đúng ở đây là in lên hoá đơn một tỉ lệ không ai tính lại được.
    const t = tienDong({ unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 10 }, { ...TIEN, giaTri: 1 }] });
    expect(t.phanTram).toBeNull();
  });

  it("[GGD-10] tổng các khoản vượt tạm tính ⇒ khoản CUỐI bị cắt, tổng vẫn khớp", () => {
    // Kẹp ở TỪNG KHOẢN theo phần còn lại, không kẹp ở tổng: nhờ vậy bảng hiển thị cộng
    // các khoản LUÔN ra đúng tổng. Kẹp ở tổng thì từng dòng in một đằng, tổng một nẻo.
    const t = tienDong({
      unitPrice: 1_000_000,
      quantity: 1,
      giam: [{ ...TIEN, giaTri: 800_000 }, { ...TIEN, giaTri: 500_000 }],
    });
    expect(t.khoan.map((k) => k.giam)).toEqual([800_000, 200_000]);
    expect(t.khoan.reduce((s, k) => s + k.giam, 0)).toBe(t.giam);
    expect(t.giam).toBe(1_000_000);
    expect(t.thanhTien).toBe(0);
  });

  it("[GGD-11] khoản giaTri = 0 bị bỏ qua, không đẻ ra dòng rỗng", () => {
    const t = tienDong({ unitPrice: 1_000_000, quantity: 1, giam: [{ ...TIEN, giaTri: 0 }, { ...TIEN, giaTri: 100 }] });
    expect(t.khoan).toHaveLength(1);
  });

  it("[GGD-12] gopGiamGia giữ ĐÚNG thứ tự người bán gõ", () => {
    const ra = gopGiamGia(1_000_000, [
      { ...TIEN, giaTri: 100_000, lyDo: "a" },
      { ...PCT, giaTri: 5, lyDo: "b" },
    ]);
    expect(ra.map((k) => k.lyDo)).toEqual(["a", "b"]);
  });

  it("[GGD-13] trần khoản/dòng là một con số DÙNG CHUNG, không gõ tay ở mỗi nơi", () => {
    expect(TRAN_KHOAN_GIAM_MOI_DONG).toBeGreaterThan(1);
    const validator = readFileSync(resolve(process.cwd(), "lib/validators/order.ts"), "utf8");
    expect(validator).toMatch(/TRAN_KHOAN_GIAM_MOI_DONG/);
  });
});

describe("[GGD] tiền của cả đơn", () => {
  const HAI_CON = [
    { unitPrice: 2_400_000, quantity: 1, giam: [{ ...PCT, giaTri: 10 }] },
    { unitPrice: 10_560_000, quantity: 1, giam: [{ ...TIEN, giaTri: 1_500_000 }] },
  ];

  it("[GGD-14] tổng giảm = Σ các khoản của mọi dòng", () => {
    const t = tienDon(HAI_CON);
    expect(t.tamTinh).toBe(12_960_000);
    expect(t.tongGiam).toBe(1_740_000);
    expect(t.tongDon).toBe(11_220_000);
  });

  it("[GGD-15] một dòng giảm lố KHÔNG được dòng khác gánh hộ", () => {
    const t = tienDon([
      { unitPrice: 1_000_000, quantity: 1, giam: [{ ...TIEN, giaTri: 3_000_000 }] },
      { unitPrice: 2_000_000, quantity: 1, giam: [] },
    ]);
    expect(t.dong[0]!.thanhTien).toBe(0);
    expect(t.tongGiam).toBe(1_000_000);
    expect(t.tongDon).toBe(2_000_000);
  });

  it("[GGD-16] phí vận chuyển cộng SAU khi trừ giảm", () => {
    expect(
      tienDon([{ unitPrice: 1_000_000, quantity: 1, giam: [{ ...TIEN, giaTri: 200_000 }] }], 50_000).tongDon,
    ).toBe(850_000);
  });

  it("[GGD-17] tổng đơn không bao giờ âm dù mọi dòng giảm hết", () => {
    const t = tienDon([
      { unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 100 }] },
      { unitPrice: 2_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 100 }] },
    ]);
    expect(t.tongDon).toBe(0);
  });
});

describe("[GGD] giải trình theo TỪNG KHOẢN", () => {
  it("[GGD-18] khoản có giảm mà thiếu giải trình ⇒ chỉ ra đúng dòng nào, khoản thứ mấy", () => {
    const thieu = dongThieuGiaiTrinh([
      { unitPrice: 1_000_000, quantity: 1, giam: [] },
      {
        unitPrice: 2_000_000,
        quantity: 1,
        giam: [
          { ...TIEN, giaTri: 100_000, lyDo: "em ruột" },
          { ...TIEN, giaTri: 100_000, lyDo: "  " },
        ],
      },
    ]);
    expect(thieu).toEqual([{ dong: 2, khoan: 2 }]);
    expect(loiThieuGiaiTrinh(thieu)).toContain("dòng 2 (khoản 2)");
  });

  it("[GGD-19] khoản bị cắt còn 0 thì KHÔNG đòi giải trình", () => {
    // Nó không trừ đồng nào, nên bắt giải trình là bắt người bán viết lý do cho một
    // khoản không tồn tại.
    const thieu = dongThieuGiaiTrinh([
      {
        unitPrice: 1_000_000,
        quantity: 1,
        giam: [
          { ...TIEN, giaTri: 1_000_000, lyDo: "học bổng toàn phần" },
          { ...TIEN, giaTri: 500_000 },
        ],
      },
    ]);
    expect(thieu).toEqual([]);
  });

  it("[GGD-20] giaiTrinhGopChoDon ghép kèm số thứ tự dòng, bỏ khoản không trừ được", () => {
    const t = tienDon([
      { unitPrice: 1_000_000, quantity: 1, giam: [{ ...TIEN, giaTri: 100_000, lyDo: "a" }] },
      { unitPrice: 2_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 5, lyDo: "b" }, { ...TIEN, giaTri: 1, lyDo: "c" }] },
    ]);
    expect(giaiTrinhGopChoDon(t.dong)).toBe("Dòng 1: a · Dòng 2: b · Dòng 2: c");
    expect(giaiTrinhGopChoDon(tienDon([{ unitPrice: 1_000, quantity: 1 }]).dong)).toBeNull();
  });
});

/**
 * LƯỚI GHIM MÃ NGUỒN — không ai được tự tính lại phép trừ này.
 *
 * Mọi ca ở trên vẫn XANH nếu action bỏ quên `tienDon(...)` và quay lại tin số client
 * gửi: hàm thuần vẫn đúng, chỉ lời gọi biến mất. Đó đúng là lớp bug mẫu này sinh ra để
 * chặn (CLAUDE.md — LƯỚI GHIM MÃ NGUỒN). Đã cấy lại để thấy ĐỎ — xem commit message.
 */
describe("[GGD] lưới ghim: tiền của đơn phải do server tính lại", () => {
  const action = readFileSync(
    resolve(process.cwd(), "app/(admin)/admin/orders/_actions.ts"),
    "utf8",
  );
  const validator = readFileSync(resolve(process.cwd(), "lib/validators/order.ts"), "utf8");
  const form = readFileSync(
    resolve(process.cwd(), "app/(admin)/admin/orders/_components/order-create-form.tsx"),
    "utf8",
  );

  it("[GGD-21] action ghi discountAmount bằng TỔNG tính được, không phải số client gửi", () => {
    expect(action).toMatch(/discountAmount: tien\.tongGiam,/);
    expect(action).not.toMatch(/discountAmount: data\.discountAmount,/);
  });

  it("[GGD-22] subtotal + totalAmount cùng đến từ MỘT lời gọi tienDon", () => {
    const goi = action.match(/const tien = tienDon\(khaiDong, data\.shippingFee\);/g) ?? [];
    expect(goi.length).toBe(1);
    expect(action).toMatch(/const subtotal = tien\.tamTinh;/);
    expect(action).toMatch(/const totalAmount = tien\.tongDon;/);
  });

  it("[GGD-23] các khoản ghi vào DB là khoản SERVER tính, không phải payload client", () => {
    // `it.discounts` là Ý ĐỊNH; `tien.dong[i].khoan` là kết quả đã kẹp. Ghi nhầm vế là
    // lưu một con số chưa từng được trừ vào đâu.
    expect(action).toMatch(/discounts:\s*\n?\s*tien\.dong\[i\]!\.khoan\.length > 0/);
    expect(action).not.toMatch(/discounts: it\.discounts/);
  });

  it("[GGD-24] cách khai CŨ bị từ chối cho ra tiếng, không bị bỏ qua im lặng", () => {
    // Bỏ hẳn khoá khỏi schema thì Zod lặng lẽ vứt nó đi và đơn tạo ra với giá NGUYÊN —
    // mất tiền mà không lỗi nào báo. Phải là một refine TỪ CHỐI.
    expect(validator).toMatch(/Giảm giá nay khai thành DANH SÁCH ở items\[\]\.discounts/);
    // Và giảm giá CẤP ĐƠN vẫn bị từ chối như chốt sáng nay.
    expect(validator).toMatch(/Giảm giá nay khai theo TỪNG DÒNG, không khai ở cấp đơn/);
  });

  it("[GGD-25] form và server dùng CHUNG một hàm tính, không mỗi bên một bản", () => {
    for (const nguon of [action, form]) {
      expect(nguon).toMatch(/from "@\/lib\/orders\/giam-gia-dong"/);
    }
    expect(form).toMatch(/tienDon\(/);
    // Form KHÔNG còn state giảm giá cấp đơn (chốt sáng nay).
    expect(form).not.toMatch(/const \[discountAmount, setDiscountAmount\]/);
  });
});
