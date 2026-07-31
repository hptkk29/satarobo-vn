import { describe, expect, it } from "vitest";
import { loginSchema } from "./auth";
import { userCreateSchema } from "./user";

const PW = "Test@12345";

describe("[AUTH-SDT-P3-C1] loginSchema — identifier nhận cả SĐT lẫn email", () => {
  it("email hợp lệ → pass, giữ NGUYÊN hoa/thường (không đổi ngữ nghĩa so khớp)", () => {
    const r = loginSchema.safeParse({ identifier: "Phuc@SataRobo.vn", password: PW });
    expect(r.success).toBe(true);
    expect(r.success && r.data.identifier).toBe("Phuc@SataRobo.vn");
  });

  it("SĐT mọi cách gõ (0905… / 84905… / +84 có chấm cách) → pass", () => {
    for (const v of ["0905123456", "84905123456", "+84 905 123 456", "0905.123.456"]) {
      expect(loginSchema.safeParse({ identifier: v, password: PW }).success).toBe(true);
    }
  });

  it("không phải email cũng không phải SĐT di động VN → fail", () => {
    // "02363123456" là số bàn — canonicalPhone trả null (chỉ nhận di động).
    for (const v of ["abc", "02363123456", "123", "phuc@", ""]) {
      expect(loginSchema.safeParse({ identifier: v, password: PW }).success).toBe(false);
    }
  });

  it("password vẫn tối thiểu 8 ký tự", () => {
    expect(loginSchema.safeParse({ identifier: "0905123456", password: "ngắn" }).success).toBe(
      false,
    );
  });
});

describe("[AUTH-SDT-P3-C2] QĐ-C — tạo tài khoản NHÂN SỰ vẫn BẮT BUỘC email", () => {
  // Khoá ở tầng validator (DB đã nới email nullable cho phụ huynh P5): nếu test
  // này đỏ nghĩa là ai đó vừa nới email ở nhánh staff → sẽ vỡ ở user.upsert sau.
  it("thiếu email → fail", () => {
    const r = userCreateSchema.safeParse({
      name: "NV Test",
      role: "HR",
      roles: ["HR"],
      password: PW,
    });
    expect(r.success).toBe(false);
  });
});
