import { describe, it, expect, afterEach } from "vitest";
import { isAuthPhoneProvisioningEnabled } from "./flags";

// AUTH-SĐT P5 — cờ ngắt đường TỰ ĐỘNG cấp tài khoản phụ huynh theo SĐT.
// Doc phase đã từng ghi cờ `AUTH_PHONE_PROVISIONING` ở hàng "Feature flag" và ở
// mục Rollback của P5 trong khi **không có dòng code nào đọc nó** — đường lùi chỉ
// tồn tại trên giấy. Bộ test này khoá đúng ngữ nghĩa để không tái diễn.

const KEY = "AUTH_PHONE_PROVISIONING";

afterEach(() => {
  delete process.env[KEY];
});

describe("isAuthPhoneProvisioningEnabled", () => {
  it("mặc định BẬT khi không khai env — merge P5 không đổi hành vi", () => {
    delete process.env[KEY];
    expect(isAuthPhoneProvisioningEnabled()).toBe(true);
  });

  it('CHỈ đúng chuỗi "false" mới ngắt', () => {
    process.env[KEY] = "false";
    expect(isAuthPhoneProvisioningEnabled()).toBe(false);
  });

  it("bật với các giá trị khẳng định thông thường", () => {
    for (const v of ["true", "1", "yes", "on"]) {
      process.env[KEY] = v;
      expect(isAuthPhoneProvisioningEnabled(), `giá trị ${v}`).toBe(true);
    }
  });

  it('KHÔNG ngắt vì "False"/"FALSE"/" false " — tránh tưởng đã tắt mà thật ra vẫn chạy', () => {
    // Nhất quán với các cờ khác trong lib/flags.ts (so khớp đúng-bằng, không
    // normalize). Ghi thành test để người kéo cờ lúc sự cố biết phải gõ chính xác:
    // gõ hoa một chữ là đường tự động VẪN chạy mà không báo gì.
    for (const v of ["False", "FALSE", " false "]) {
      process.env[KEY] = v;
      expect(isAuthPhoneProvisioningEnabled(), `giá trị ${JSON.stringify(v)}`).toBe(true);
    }
  });
});
