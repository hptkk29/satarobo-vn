import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  KIEU_GIAM,
  LOAI_GIAM,
  MA_LOAI_GIAM,
  docLoaiGiam,
  TRAN_KHOAN_GIAM_MOI_DONG,
  discountFromPercent,
  dongThieuGiaiTrinh,
  giaiTrinhGopChoDon,
  TRAN_PHAN_TRAM_MAC_DINH,
  gopGiamGia,
  khoanVuotTran,
  loiVuotTran,
  loiThieuGiaiTrinh,
  tienDon,
  tienDong,
} from "./giam-gia-dong";

/**
 * Trần % dùng cho các ca KHÔNG đo trần.
 *
 * 100 = "không có trần", cố ý: những ca dưới đây đo phép CỘNG DỒN và phép KẸP theo tạm
 * tính dòng, hai luật độc lập với trần chính sách. Nhét trần 50 vào chúng là trộn hai
 * thứ, và khi trần đổi thì một loạt ca đỏ mà không ca nào chỉ ra luật nào vỡ.
 * Trần THẬT (50, tham số vận hành) có bộ ca riêng ở [GGD-26..29].
 */
const KHONG_TRAN = 100;

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
    const t = tienDong({ unitPrice: 2_400_000, quantity: 1 }, KHONG_TRAN);
    expect(t).toMatchObject({ tamTinh: 2_400_000, giam: 0, thanhTien: 2_400_000, phanTram: null });
    expect(t.khoan).toEqual([]);
  });

  it("[GGD-02] giảm theo SỐ TIỀN — tạm tính nhân theo số lượng", () => {
    const t = tienDong({
      unitPrice: 1_000_000,
      quantity: 3,
      giam: [{ ...TIEN, giaTri: 200_000 }],
    }, KHONG_TRAN);
    expect(t.tamTinh).toBe(3_000_000);
    expect(t.giam).toBe(200_000);
    expect(t.thanhTien).toBe(2_800_000);
  });

  it("[GGD-03] % tính trên tạm tính CỦA CHÍNH DÒNG, không phải của cả đơn", () => {
    // Con số này là lý do đợt sáng nay tồn tại: 10% của dòng 10.560.000đ là 1.056.000đ,
    // còn 10% của cả đơn (12.960.000đ) là 1.296.000đ. Lệch 240.000đ, và không có gì
    // trên màn hình nói ra là đã lấy nhầm mẫu số.
    const t = tienDong({ unitPrice: 10_560_000, quantity: 1, giam: [{ ...PCT, giaTri: 10 }] }, KHONG_TRAN);
    expect(t.giam).toBe(1_056_000);
    expect(t.thanhTien).toBe(9_504_000);
    expect(t.phanTram).toBe(10);
  });

  it("[GGD-04] một khoản giảm lố bị kẹp ở tạm tính của dòng — không có dòng âm", () => {
    const t = tienDong({ unitPrice: 1_000_000, quantity: 1, giam: [{ ...TIEN, giaTri: 9_999_999 }] }, KHONG_TRAN);
    expect(t.giam).toBe(1_000_000);
    expect(t.thanhTien).toBe(0);
    // `giaTri` giữ Ý ĐỊNH, `giam` giữ SỐ THẬT — mất một trong hai là mất dấu việc đã cắt.
    expect(t.khoan[0]).toMatchObject({ giaTri: 9_999_999, giam: 1_000_000 });
  });

  it("[GGD-05] % ngoài [0,100] bị kẹp", () => {
    expect(tienDong({ unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 150 }] }, KHONG_TRAN).giam).toBe(1_000_000);
    expect(tienDong({ unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: -5 }] }, KHONG_TRAN).giam).toBe(0);
  });

  it("[GGD-06] discountFromPercent giữ nguyên hành vi sau khi dời khỏi discount.ts", () => {
    expect(discountFromPercent(1_000_000, 10)).toBe(100_000);
    expect(discountFromPercent(3_333_333, 15)).toBe(500_000);
    expect(discountFromPercent(1_000_000, 150)).toBe(1_000_000);
  });
});

describe("[GGD] NHIỀU khoản trên một dòng", () => {
  it("[GGD-07] các khoản CỘNG DỒN, không lũy tiến — CHỐT 15/09/2026", () => {
    // Ca phân biệt hai luật: cộng dồn = 30%, lũy tiến = 1 − 0,9×0,8 = 28%.
    //
    // CHỐT của chủ dự án, nguyên văn: "nếu cả 2 dòng đều giảm % thì = TỔNG % 2 dòng".
    // Ca này KHÔNG phải để bảo vệ một suy luận của người viết mã — nó ghim một quyết
    // định nghiệp vụ đã ký. Ai đổi `gopGiamGia` sang lũy tiến sẽ làm ca này đỏ, và đó
    // là mục đích: buộc họ đọc chú thích ở hàm đó trước khi đổi tiền.
    //
    // Chủ dự án nói thêm ca này là ca BIÊN ("sẽ không có trường hợp đó xảy ra đâu" —
    // thực tế là một khoản theo tiền + một khoản theo %). Vẫn ghim, vì một ca biên
    // không được khai sẽ tự chọn hành vi vào ngày nó xảy ra.
    const t = tienDong({
      unitPrice: 1_000_000,
      quantity: 1,
      giam: [{ ...PCT, giaTri: 10 }, { ...PCT, giaTri: 20 }],
    }, KHONG_TRAN);
    expect(t.giam).toBe(300_000); // KHÔNG phải 280.000
    expect(t.thanhTien).toBe(700_000);
    // Và phát biểu ĐÚNG NHƯ chủ dự án nói ra: tỉ lệ giảm thực tế = TỔNG hai con % đã gõ.
    expect((t.giam / t.tamTinh) * 100).toBe(10 + 20);
  });

  it("[GGD-07b] hai khoản % cộng lại VƯỢT 100% ⇒ kẹp ở 100% của dòng, không âm", () => {
    // Biên của luật cộng dồn. 60% + 60% = 120% là con số không tồn tại trong thực tế
    // (chủ dự án: ca hai khoản cùng kiểu % vốn đã là ca biên), nhưng luật cộng dồn TỰ
    // SINH ra khả năng đó, nên hành vi phải được khai chứ không để nó tự chọn.
    const t = tienDong({
      unitPrice: 1_000_000,
      quantity: 1,
      giam: [{ ...PCT, giaTri: 60 }, { ...PCT, giaTri: 60 }],
    }, KHONG_TRAN);
    // Khoản 1 lấy đủ 60%; khoản 2 muốn 60% nhưng chỉ còn 40% ⇒ nhận 40%.
    expect(t.khoan.map((k) => k.giam)).toEqual([600_000, 400_000]);
    // Vẫn giữ bất biến quan trọng nhất: các khoản cộng lại ĐÚNG bằng tổng đã trừ.
    expect(t.khoan.reduce((a, k) => a + k.giam, 0)).toBe(t.giam);
    expect(t.thanhTien).toBe(0);
    // `giaTri` của khoản 2 vẫn giữ Ý ĐỊNH 60 — dấu vết việc đã bị cắt không được mất.
    expect(t.khoan[1]).toMatchObject({ giaTri: 60, phanTram: 60, giam: 400_000 });
  });

  it("[GGD-08] trộn % và số tiền — mỗi khoản tính trên tạm tính GỐC", () => {
    const t = tienDong({
      unitPrice: 2_400_000,
      quantity: 1,
      giam: [
        { ...PCT, giaTri: 10, lyDo: "anh chị em" },
        { ...TIEN, giaTri: 500_000, lyDo: "đóng sớm" },
      ],
    }, KHONG_TRAN);
    expect(t.khoan.map((k) => k.giam)).toEqual([240_000, 500_000]);
    expect(t.giam).toBe(740_000);
    expect(t.thanhTien).toBe(1_660_000);
  });

  it("[GGD-09] nhiều khoản ⇒ phanTram của DÒNG là null", () => {
    // "Phần trăm của cả dòng" không tồn tại như một con số khi có hai khoản; trả một số
    // gần đúng ở đây là in lên hoá đơn một tỉ lệ không ai tính lại được.
    const t = tienDong({ unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 10 }, { ...TIEN, giaTri: 1 }] }, KHONG_TRAN);
    expect(t.phanTram).toBeNull();
  });

  it("[GGD-10] tổng các khoản vượt tạm tính ⇒ khoản CUỐI bị cắt, tổng vẫn khớp", () => {
    // Kẹp ở TỪNG KHOẢN theo phần còn lại, không kẹp ở tổng: nhờ vậy bảng hiển thị cộng
    // các khoản LUÔN ra đúng tổng. Kẹp ở tổng thì từng dòng in một đằng, tổng một nẻo.
    const t = tienDong({
      unitPrice: 1_000_000,
      quantity: 1,
      giam: [{ ...TIEN, giaTri: 800_000 }, { ...TIEN, giaTri: 500_000 }],
    }, KHONG_TRAN);
    expect(t.khoan.map((k) => k.giam)).toEqual([800_000, 200_000]);
    expect(t.khoan.reduce((s, k) => s + k.giam, 0)).toBe(t.giam);
    expect(t.giam).toBe(1_000_000);
    expect(t.thanhTien).toBe(0);
  });

  it("[GGD-11] khoản giaTri = 0 bị bỏ qua, không đẻ ra dòng rỗng", () => {
    const t = tienDong({ unitPrice: 1_000_000, quantity: 1, giam: [{ ...TIEN, giaTri: 0 }, { ...TIEN, giaTri: 100 }] }, KHONG_TRAN);
    expect(t.khoan).toHaveLength(1);
  });

  it("[GGD-12] gopGiamGia giữ ĐÚNG thứ tự người bán gõ", () => {
    const ra = gopGiamGia(1_000_000, [
      { ...TIEN, giaTri: 100_000, lyDo: "a" },
      { ...PCT, giaTri: 5, lyDo: "b" },
    ], KHONG_TRAN);
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
    const t = tienDon(HAI_CON, { tranPhanTram: KHONG_TRAN });
    expect(t.tamTinh).toBe(12_960_000);
    expect(t.tongGiam).toBe(1_740_000);
    expect(t.tongDon).toBe(11_220_000);
  });

  it("[GGD-15] một dòng giảm lố KHÔNG được dòng khác gánh hộ", () => {
    const t = tienDon([
      { unitPrice: 1_000_000, quantity: 1, giam: [{ ...TIEN, giaTri: 3_000_000 }] },
      { unitPrice: 2_000_000, quantity: 1, giam: [] },
    ], { tranPhanTram: KHONG_TRAN });
    expect(t.dong[0]!.thanhTien).toBe(0);
    expect(t.tongGiam).toBe(1_000_000);
    expect(t.tongDon).toBe(2_000_000);
  });

  it("[GGD-16] phí vận chuyển cộng SAU khi trừ giảm", () => {
    expect(
      tienDon([{ unitPrice: 1_000_000, quantity: 1, giam: [{ ...TIEN, giaTri: 200_000 }] }], { phiVanChuyen: 50_000, tranPhanTram: KHONG_TRAN }).tongDon,
    ).toBe(850_000);
  });

  it("[GGD-17] tổng đơn không bao giờ âm dù mọi dòng giảm hết", () => {
    const t = tienDon([
      { unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 100 }] },
      { unitPrice: 2_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 100 }] },
    ], { tranPhanTram: KHONG_TRAN });
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
    ], KHONG_TRAN);
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
    ], KHONG_TRAN);
    expect(thieu).toEqual([]);
  });

  it("[GGD-20] giaiTrinhGopChoDon ghép kèm số thứ tự dòng, bỏ khoản không trừ được", () => {
    const t = tienDon([
      { unitPrice: 1_000_000, quantity: 1, giam: [{ ...TIEN, giaTri: 100_000, lyDo: "a" }] },
      { unitPrice: 2_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 5, lyDo: "b" }, { ...TIEN, giaTri: 1, lyDo: "c" }] },
    ], { tranPhanTram: KHONG_TRAN });
    expect(giaiTrinhGopChoDon(t.dong)).toBe("Dòng 1: a · Dòng 2: b · Dòng 2: c");
    expect(giaiTrinhGopChoDon(tienDon([{ unitPrice: 1_000, quantity: 1 }], { tranPhanTram: KHONG_TRAN }).dong)).toBeNull();
  });
});

/**
 * LƯỚI GHIM MÃ NGUỒN — không ai được tự tính lại phép trừ này.
 *
 * Mọi ca ở trên vẫn XANH nếu action bỏ quên `tienDon(...)` và quay lại tin số client
 * gửi: hàm thuần vẫn đúng, chỉ lời gọi biến mất. Đó đúng là lớp bug mẫu này sinh ra để
 * chặn (CLAUDE.md — LƯỚI GHIM MÃ NGUỒN). Đã cấy lại để thấy ĐỎ — xem commit message.
 */

/**
 * TRẦN % CỦA MỘT KHOẢN — chốt của chủ dự án 15/09/2026:
 * *"quy định lại mức giảm % tối đa là 50% và phần này cũng nên set ở trong cấu hình
 * vận hành luôn."*
 *
 * Hai nửa của chốt, cả hai đều phải đo được:
 *   (a) con số 50 là MẶC ĐỊNH, không phải hằng cố định trong mã;
 *   (b) nguồn sự thật là tham số vận hành `orders.maxDiscountPercent`, nên mọi hàm tính
 *       phải NHẬN trần từ ngoài — không tự tra, không tự đoán.
 */
describe("[GGD] trần % của một khoản", () => {
  it("[GGD-26] mặc định là 50, và nó nằm trong registry cấu hình vận hành", () => {
    expect(TRAN_PHAN_TRAM_MAC_DINH).toBe(50);
    // Nửa (b) của chốt: phải có KEY trong registry, không chỉ có hằng trong mã. Thiếu
    // key thì người vận hành không sửa được, và cả đợt này chỉ là đổi một con số cứng.
    const registry = readFileSync(resolve(process.cwd(), "lib/settings/registry.ts"), "utf8");
    expect(registry).toMatch(/"orders\.maxDiscountPercent"/);
    expect(registry).toMatch(/default: 50,/);
    // Và phải có NHÃN vận hành, kẻo key tồn tại mà màn cấu hình không bày ra
    // (`page.tsx` dựng danh sách từ bảng nhãn, không từ SETTING_KEYS).
    const nhan = readFileSync(resolve(process.cwd(), "lib/settings/nhan-van-hanh.ts"), "utf8");
    expect(nhan).toMatch(/"orders\.maxDiscountPercent"/);
  });

  it("[GGD-27] gõ % vượt trần ⇒ KẸP xuống trần, và ĐÁNH DẤU vuotTran", () => {
    const t = tienDong(
      { unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 80 }] },
      50,
    );
    // Kẹp: không đường nào tính ra số vượt chính sách…
    expect(t.giam).toBe(500_000);
    // …nhưng `giaTri` giữ Ý ĐỊNH 80 và cờ nói rõ đã vượt. Kẹp im lặng là người bán hứa
    // khách 80% rồi hệ thống trừ 50%, và sai lệch đó chỉ lộ lúc phụ huynh đọc hoá đơn.
    expect(t.khoan[0]).toMatchObject({ giaTri: 80, phanTram: 50, vuotTran: true });
  });

  it("[GGD-28] khoanVuotTran chỉ đúng dòng nào khoản nào, và câu lỗi mang con số trần", () => {
    const dong = [
      { unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 50, lyDo: "vừa đủ trần" }] },
      {
        unitPrice: 2_000_000,
        quantity: 1,
        giam: [
          { ...TIEN, giaTri: 100_000, lyDo: "tiền thì không bị trần %" },
          { ...PCT, giaTri: 51, lyDo: "hơn trần 1%" },
        ],
      },
    ];
    const vuot = khoanVuotTran(dong, 50);
    expect(vuot).toEqual([{ dong: 2, khoan: 2 }]);
    // Câu lỗi phải mang CON SỐ TRẦN: người bán cần biết trần là bao nhiêu để sửa, và
    // con số đó do người vận hành đặt nên không hard-code được vào chuỗi.
    expect(loiVuotTran(vuot, 50)).toContain("50%");
    expect(loiVuotTran(vuot, 50)).toContain("dòng 2 (khoản 2)");
  });

  it("[GGD-29] trần đến TỪ NGOÀI: đổi trần là đổi kết quả, không phải sửa mã", () => {
    // Đây là nửa (b) của chốt, đo bằng hành vi: cùng một đầu vào, hai trần khác nhau
    // ⇒ hai số tiền khác nhau. Nếu hàm tự tra hằng trong mã thì ca này bất khả.
    const dong = { unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 70 }] };
    expect(tienDong(dong, 50).giam).toBe(500_000);
    expect(tienDong(dong, 80).giam).toBe(700_000);
    expect(tienDong(dong, 70).khoan[0]!.vuotTran).toBe(false);
  });

  it("[GGD-30] trần RÁC rơi về mặc định, không thành \"không có trần\"", () => {
    // `getSetting` có zod nên giá trị rác khó lọt, nhưng hàm thuần này cũng được gọi từ
    // client và từ test. Một trần 0/âm/NaN phải fail-CLOSED về 50, không được hoá thành
    // 'bỏ trần' — hướng sai đó cho bớt tới 100% mà không cổng nào thấy.
    for (const rac of [0, -5, Number.NaN, 999]) {
      const t = tienDong(
        { unitPrice: 1_000_000, quantity: 1, giam: [{ ...PCT, giaTri: 100 }] },
        rac as number,
      );
      expect(t.giam).toBe(500_000);
    }
  });
});
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
    // ⚠️ Chuỗi ghim ĐÃ ĐỔI 15/09/2026 khi trần % dời vào cấu hình vận hành: đối số thứ
    // hai từ `data.shippingFee` thành object `{ phiVanChuyen, tranPhanTram }`. Lưới đã
    // ĐỎ đúng lúc đó (`expected +0 to be 1`) — ghi lại để người sau biết nó CÓ cắn,
    // không phải một chuỗi được chép lại cho khớp.
    const goi =
      action.match(
        /const tien = tienDon\(khaiDong, \{ phiVanChuyen: data\.shippingFee, tranPhanTram \}\);/g,
      ) ?? [];
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

  it("[GGD-31] action ĐỌC trần từ cấu hình vận hành, không dùng hằng trong mã", () => {
    // Bẫy mà CLAUDE.md đã ghi cho `crm.commissionMaxTotalRate`: người vận hành nới trần
    // ở màn cấu hình mà đường ghi vẫn chặn theo số cũ — không lỗi nào báo.
    expect(action).toMatch(/getSetting\("orders\.maxDiscountPercent"\)/);
    expect(action).toMatch(/khoanVuotTran\(khaiDong, tranPhanTram\)/);
    // Và KHÔNG được nhập hằng mặc định vào đường ghi — nhập là mời người sau dùng nó.
    expect(action).not.toMatch(/TRAN_PHAN_TRAM_MAC_DINH/);
  });

  it("[GGD-32] trần truyền từ RSC xuống form, form KHÔNG tự đoán", () => {
    const page = readFileSync(
      resolve(process.cwd(), "app/(admin)/admin/orders/new/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/getSetting\("orders\.maxDiscountPercent"\)/);
    expect(page).toMatch(/tranPhanTram=\{tranPhanTram\}/);
    // Form nhận qua prop; một hằng cứng ở client là con số thứ hai sống song song.
    expect(form).not.toMatch(/TRAN_PHAN_TRAM_MAC_DINH/);
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

describe("[GGD] PHIÊN E — NHÃN loại ưu đãi: chở qua, KHÔNG đụng tiền", () => {
  // Chủ dự án chốt 21/09/2026: thêm loại có cấu trúc, **chỉ để đánh dấu**. Cụm ca này có
  // đúng một việc: chứng minh cái nhãn không bao giờ chạm vào phép tính.
  const action = readFileSync(
    resolve(process.cwd(), "app/(admin)/admin/orders/_actions.ts"),
    "utf8",
  );

  it("[GGD-30] `gopGiamGia` chở `loai` sang y nguyên", () => {
    const ra = gopGiamGia(
      10_000_000,
      [
        { kieu: KIEU_GIAM.PHAN_TRAM, giaTri: 15, lyDo: "con thứ hai", loai: LOAI_GIAM.ANH_EM },
        { kieu: KIEU_GIAM.SO_TIEN, giaTri: 500_000, lyDo: "đóng sớm" },
      ],
      50,
    );
    expect(ra.map((k) => k.loai)).toEqual([LOAI_GIAM.ANH_EM, null]);
  });

  it("[GGD-31] ĐỔI NHÃN KHÔNG ĐỔI MỘT ĐỒNG NÀO", () => {
    // Đây là ca đắt giá nhất của cụm: chạy CÙNG một phép tính với mọi nhãn có thể, và
    // đòi kết quả tiền GIỐNG HỆT. Ngày nào có người nhét `if (loai === "ANH_EM")` vào
    // đường tính tiền, ca này đỏ ngay — mà đó đúng là thứ chủ dự án cấm.
    const khai = (loai: (typeof MA_LOAI_GIAM)[number] | null) => [
      { kieu: KIEU_GIAM.PHAN_TRAM, giaTri: 15, lyDo: "x", loai },
      { kieu: KIEU_GIAM.SO_TIEN, giaTri: 500_000, lyDo: "y", loai },
    ];
    const tien = (r: ReturnType<typeof gopGiamGia>) =>
      r.map((k) => ({ giam: k.giam, phanTram: k.phanTram, vuotTran: k.vuotTran }));

    const moc = tien(gopGiamGia(10_000_000, khai(null), 50));
    for (const loai of MA_LOAI_GIAM) {
      expect(tien(gopGiamGia(10_000_000, khai(loai), 50)), `nhãn ${loai} làm đổi tiền`).toEqual(
        moc,
      );
    }
  });

  it("[GGD-32] mã LẠ bị ép về null ở cửa ghi — `docLoaiGiam` gác", () => {
    expect(docLoaiGiam("ANH_EM")).toBe(LOAI_GIAM.ANH_EM);
    for (const rac of ["anh_em", "ANH EM", "", 1, null, undefined, {}, []]) {
      expect(docLoaiGiam(rac), `phải từ chối: ${JSON.stringify(rac)}`).toBeNull();
    }
  });

  it("[GGD-33] action ĐI QUA `docLoaiGiam`, không chép thẳng giá trị client", () => {
    // ⚠️ Lưới VĂN BẢN (luật 11) — neo chuỗi hẹp nhất và đếm số lần khớp. Nếu ai đó viết
    // `loai: k.loai` thì một mã rác từ client đi thẳng vào `discounts` JSON, và mọi đường
    // đọc sau này phải tự phòng thủ.
    expect((action.match(/loai: docLoaiGiam\(k\.loai\),/g) ?? []).length).toBe(1);
    expect(action).not.toMatch(/\bloai: k\.loai,/);
  });

  it("[GGD-34] danh sách mã của validator lấy từ `MA_LOAI_GIAM`, không gõ lại", () => {
    // Gõ lại là hai danh sách sẵn sàng lệch, và cái lệch sẽ im lặng: form cho chọn một mã
    // mà zod từ chối, người bán chỉ thấy "dữ liệu không hợp lệ" không rõ ở đâu.
    const validator = readFileSync(resolve(process.cwd(), "lib/validators/order.ts"), "utf8");
    expect(validator).toMatch(/loai: z\.enum\(MA_LOAI_GIAM as unknown as \[string, \.\.\.string\[\]\]\)/);
    for (const ma of MA_LOAI_GIAM) {
      expect(validator, `validator không được gõ lại mã "${ma}"`).not.toMatch(
        new RegExp(`"${ma}"`),
      );
    }
  });
});
