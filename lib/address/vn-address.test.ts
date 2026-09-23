/**
 * G-01 — ô địa chỉ hành chính của lead. Ba hàm thuần, không đụng dữ liệu.
 *
 * Vì sao phải có test riêng cho mấy dòng map tưởng-như-hiển-nhiên: ô địa chỉ lưu
 * TÊN (chuỗi), còn picker chạy bằng MÃ. Mọi lần mở lại phiếu là một lần dịch
 * tên → mã. Dịch trượt thì `<Combobox>` không khớp option nào, tụt về rỗng, và
 * lần bấm Lưu kế tiếp XOÁ TRẮNG địa chỉ đúng — hỏng câm, không lỗi, không nhật
 * ký. Đây đúng là lỗi đã xảy ra ở ô "Cơ sở quan tâm" (V-4 · G-01b, vá 25/08).
 */
import { describe, it, expect } from "vitest";
import {
  toAddressOptions,
  toNameOptions,
  provinceIdByName,
  formatVnAddress,
} from "./vn-address";

const TINH = [
  { id: "01", name: "Hà Nội" },
  { id: "48", name: "Đà Nẵng" },
  { id: "79", name: "Hồ Chí Minh" },
];

describe("[G-01] toAddressOptions", () => {
  it("đổi danh mục tỉnh/phường sang option của Combobox (value = mã, label = tên)", () => {
    expect(toAddressOptions(TINH)).toEqual([
      { value: "01", label: "Hà Nội" },
      { value: "48", label: "Đà Nẵng" },
      { value: "79", label: "Hồ Chí Minh" },
    ]);
  });

  it("danh sách rỗng → mảng rỗng, không ném lỗi", () => {
    expect(toAddressOptions([])).toEqual([]);
  });
});

describe("[G-01] toNameOptions — ô phường/xã lưu TÊN, không lưu mã", () => {
  const PHUONG = [
    { id: "48001001", name: "Phường Hải Châu" },
    { id: "48001002", name: "Phường Thanh Khê" },
  ];

  it("value CHÍNH LÀ tên → thứ Combobox trả về ghi thẳng xuống `Lead.ward` được", () => {
    // Nếu value là mã, cột `ward` (vốn để chứa TÊN) sẽ nhận "48001001". Không lỗi,
    // không cảnh báo — chỉ là mọi báo cáo theo địa bàn in ra một dãy số.
    expect(toNameOptions(PHUONG)).toEqual([
      { value: "Phường Hải Châu", label: "Phường Hải Châu" },
      { value: "Phường Thanh Khê", label: "Phường Thanh Khê" },
    ]);
  });

  it("KHÁC toAddressOptions — hai hàm không thay nhau được", () => {
    expect(toAddressOptions(PHUONG)[0]?.value).toBe("48001001");
    expect(toNameOptions(PHUONG)[0]?.value).toBe("Phường Hải Châu");
  });
});

describe("[G-01] provinceIdByName — mở lại phiếu phải chọn đúng tỉnh cũ", () => {
  it("tên khớp y hệt → trả mã", () => {
    expect(provinceIdByName(TINH, "Đà Nẵng")).toBe("48");
  });

  it("thừa khoảng trắng hai đầu → vẫn khớp (người nhập/nhập Excel hay dính)", () => {
    expect(provinceIdByName(TINH, "  Đà Nẵng ")).toBe("48");
  });

  it("mất dấu / khác hoa-thường → vẫn khớp, KHÔNG bỏ trắng phiếu cũ", () => {
    // Dữ liệu cũ bóc từ `Lead.note` (nợ N-1) và dữ liệu nhập Excel rất hay mất
    // dấu. Trả null ở đây nghĩa là mở phiếu ra thấy ô tỉnh trống, rồi bấm Lưu
    // là mất luôn địa chỉ thật.
    expect(provinceIdByName(TINH, "da nang")).toBe("48");
    expect(provinceIdByName(TINH, "HO CHI MINH")).toBe("79");
  });

  it("tên lạ / null / rỗng → null (không đoán bừa một tỉnh gần đúng)", () => {
    expect(provinceIdByName(TINH, "Xứ Wales")).toBeNull();
    expect(provinceIdByName(TINH, null)).toBeNull();
    expect(provinceIdByName(TINH, "")).toBeNull();
    expect(provinceIdByName(TINH, "   ")).toBeNull();
  });
});

describe("[G-01] formatVnAddress — dòng địa chỉ ở trang chi tiết", () => {
  it("đủ ba mẩu → ghép theo thứ tự hẹp → rộng", () => {
    expect(
      formatVnAddress({ addressLine: "12 Lê Lợi", ward: "Phường Hải Châu", city: "Đà Nẵng" }),
    ).toBe("12 Lê Lợi, Phường Hải Châu, Đà Nẵng");
  });

  it("thiếu mẩu giữa → không đẻ dấu phẩy mồ côi", () => {
    expect(formatVnAddress({ addressLine: "12 Lê Lợi", ward: null, city: "Đà Nẵng" })).toBe(
      "12 Lê Lợi, Đà Nẵng",
    );
  });

  it("chỉ có tỉnh → vẫn hiện được (lead mới thu về thường chỉ có chừng đó)", () => {
    expect(formatVnAddress({ addressLine: null, ward: null, city: "Đà Nẵng" })).toBe("Đà Nẵng");
  });

  it("trống hết (kể cả chuỗi rỗng/khoảng trắng) → null để trang chi tiết ẩn hẳn ô", () => {
    expect(formatVnAddress({ addressLine: null, ward: null, city: null })).toBeNull();
    expect(formatVnAddress({ addressLine: "", ward: "  ", city: "" })).toBeNull();
  });
});
