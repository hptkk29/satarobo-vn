/**
 * Ca [DC-*] — ô địa chỉ 2 cấp của hồ sơ học viên GIỮ tên đang lưu khi nó không có trong
 * danh mục [25/09/2026].
 *
 * Vì sao: form mới gửi `city`/`ward` qua ô ẩn, và `docFormHocVien` coi "có mặt mà rỗng" là
 * XOÁ. Học viên cũ mang chữ gõ tay ("TP Đà Nẵng", phường đã sáp nhập…) — nếu picker chỉ
 * nhận option trong danh mục thì ô hiện trống và lượt "Lưu thay đổi" kế tiếp xoá thật địa
 * chỉ, dù người dùng chẳng chạm vào ô đó.
 */
import { describe, expect, it } from "vitest";
import {
  TIEN_TO_TINH_CU,
  laTinhCu,
  luaChonPhuong,
  luaChonTinh,
  tenTinhTuGiaTri,
} from "./dia-chi";

const TINH = [
  { value: "48", label: "Thành phố Đà Nẵng" },
  { value: "01", label: "Thành phố Hà Nội" },
];

describe("luaChonTinh — tỉnh đang lưu", () => {
  it("[DC-01] tên khớp y hệt ⇒ chọn đúng mã, KHÔNG thêm option tạm", () => {
    const r = luaChonTinh(TINH, "Thành phố Đà Nẵng");
    expect(r.chon).toBe("48");
    expect(r.options).toEqual(TINH);
  });

  it("[DC-02] tên khớp khi bỏ dấu ⇒ vẫn chọn đúng mã (không đẻ option trùng)", () => {
    const r = luaChonTinh(TINH, "thanh pho da nang");
    expect(r.chon).toBe("48");
    expect(r.options).toHaveLength(TINH.length);
  });

  it("[DC-03] tên KHÔNG có trong danh mục ⇒ option tạm đứng đầu, được chọn, và lưu ra ĐÚNG chuỗi cũ", () => {
    const r = luaChonTinh(TINH, "TP Đà Nẵng");
    expect(r.options).toHaveLength(TINH.length + 1);
    expect(r.chon).not.toBeNull();
    expect(laTinhCu(r.chon)).toBe(true);
    expect(r.options[0].value).toBe(r.chon);
    // Thứ đi xuống DB khi người dùng không chạm vào ô: chuỗi cũ nguyên vẹn.
    expect(tenTinhTuGiaTri(r.options, r.chon)).toBe("TP Đà Nẵng");
    // Đối chứng dương: chọn tỉnh thật thì lưu TÊN tỉnh thật, không lẫn tiền tố.
    expect(tenTinhTuGiaTri(r.options, "01")).toBe("Thành phố Hà Nội");
    expect(tenTinhTuGiaTri(r.options, "01").startsWith(TIEN_TO_TINH_CU)).toBe(false);
  });

  it("[DC-04] trống ⇒ không chọn gì, không thêm option", () => {
    for (const v of [null, undefined, "", "   "]) {
      const r = luaChonTinh(TINH, v);
      expect(r.chon).toBeNull();
      expect(r.options).toEqual(TINH);
    }
    expect(tenTinhTuGiaTri(TINH, null)).toBe("");
  });
});

describe("luaChonPhuong — phường đang lưu", () => {
  const PHUONG = [
    { value: "Phường Hải Châu", label: "Phường Hải Châu" },
    { value: "Phường Thanh Khê", label: "Phường Thanh Khê" },
  ];

  it("[DC-05] phường ngoài danh mục ⇒ option tạm mang ĐÚNG tên đó; trong danh mục / trống ⇒ không thêm", () => {
    const tam = luaChonPhuong(PHUONG, "Phường Phước Ninh");
    expect(tam).toHaveLength(PHUONG.length + 1);
    expect(tam[0].value).toBe("Phường Phước Ninh");

    // Chưa nạp được danh mục (tỉnh cũ không khớp) mà hồ sơ có phường ⇒ vẫn giữ.
    expect(luaChonPhuong([], "Phường Phước Ninh").map((o) => o.value)).toEqual([
      "Phường Phước Ninh",
    ]);

    expect(luaChonPhuong(PHUONG, "Phường Hải Châu")).toEqual(PHUONG);
    expect(luaChonPhuong(PHUONG, "")).toEqual(PHUONG);
    expect(luaChonPhuong(PHUONG, null)).toEqual(PHUONG);
  });
});
