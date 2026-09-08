import { describe, expect, it } from "vitest";

import { chiaLoThem, conTrongKhoi } from "./khung-ca";

const MO = { effectiveTo: null };
const DONG = { effectiveTo: new Date(Date.UTC(2026, 8, 8)) };

describe("conTrongKhoi", () => {
  it("chỉ dòng còn mở mới tính là đang trong khối", () => {
    expect(conTrongKhoi(MO)).toBe(true);
    expect(conTrongKhoi(DONG)).toBe(false);
  });
});

describe("chiaLoThem — thêm hàng loạt phải idempotent", () => {
  it("người ĐANG trong khối ⇒ bỏ qua, không lỗi, không nhân đôi", () => {
    const kq = chiaLoThem(["a"], [{ userId: "a", ...MO }]);
    expect(kq).toEqual({ themMoi: [], hoiSinh: [], boQua: ["a"] });
  });

  // ⚠️ CA QUAN TRỌNG NHẤT. Gộp "từng ở" vào "đã có" là sinh bug: khoá duy nhất
  // `(userId, centerId, weekday, effectiveFrom)` KHÔNG đổi khi gỡ mềm, nên người này
  // phải được MỞ LẠI cụm cũ, không phải bỏ qua (họ đâu còn trong khối) và cũng không
  // phải tạo mới (sẽ đâm khoá).
  it("người TỪNG ở rồi bị gỡ ⇒ HỒI SINH, không phải bỏ qua và không phải tạo mới", () => {
    const kq = chiaLoThem(["a"], [{ userId: "a", ...DONG }]);
    expect(kq).toEqual({ themMoi: [], hoiSinh: ["a"], boQua: [] });
  });

  it("người CHƯA từng có ⇒ tạo mới", () => {
    expect(chiaLoThem(["z"], [])).toEqual({
      themMoi: ["z"],
      hoiSinh: [],
      boQua: [],
    });
  });

  it("chọn TRÙNG trong cùng một lượt cũng không đẻ hai dòng", () => {
    expect(chiaLoThem(["z", "z", "z"], []).themMoi).toEqual(["z"]);
  });

  // Cụm có thể lẫn: ai đó xoá tay ô Thứ Ba rồi gỡ, hoặc gỡ xong sửa lại một ô. Khi đó
  // người ấy VẪN đang trong khối — hàng của họ vẫn hiện trên màn — nên phải bỏ qua.
  it("cụm LẪN dòng mở và dòng đóng ⇒ vẫn tính là ĐANG trong khối", () => {
    const kq = chiaLoThem(
      ["a"],
      [
        { userId: "a", ...DONG },
        { userId: "a", ...MO },
      ],
    );
    expect(kq.boQua).toEqual(["a"]);
    expect(kq.hoiSinh).toEqual([]);
  });

  it("một lượt trộn cả ba nhóm — mỗi người rơi đúng một nhóm", () => {
    const kq = chiaLoThem(
      ["dang", "dago", "moi"],
      [
        { userId: "dang", ...MO },
        { userId: "dago", ...DONG },
        { userId: "khongchon", ...MO },
      ],
    );
    expect(kq).toEqual({
      themMoi: ["moi"],
      hoiSinh: ["dago"],
      boQua: ["dang"],
    });
    // Anti-vacuity: người không được chọn KHÔNG được lọt vào nhóm nào.
    const tatCa = [...kq.themMoi, ...kq.hoiSinh, ...kq.boQua];
    expect(tatCa).not.toContain("khongchon");
    expect(tatCa).toHaveLength(3);
  });

  it("danh sách rỗng ⇒ ba nhóm rỗng, không ném", () => {
    expect(chiaLoThem([], [{ userId: "a", ...MO }])).toEqual({
      themMoi: [],
      hoiSinh: [],
      boQua: [],
    });
  });
});
