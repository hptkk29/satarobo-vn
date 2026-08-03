import { describe, it, expect, afterEach } from "vitest";
import { isAuthPhoneProvisioningEnabled, isPaymentLedgerV2Enabled } from "./flags";

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

// 03/08 — cờ cutover sổ thu mới. Ngữ nghĩa NGƯỢC với cờ trên: mặc định TẮT, chỉ
// đúng chuỗi "true" mới bật. Khoá lại để không ai vô tình lật sổ tiền bằng một
// giá trị env "gần đúng" (TRUE/1/yes) rồi tưởng là chưa bật.
const LEDGER_KEY = "PAYMENT_LEDGER_V2";

describe("isPaymentLedgerV2Enabled", () => {
  afterEach(() => {
    delete process.env[LEDGER_KEY];
  });

  it("mặc định TẮT khi không khai env — sổ mới chạy song song, chưa cutover", () => {
    delete process.env[LEDGER_KEY];
    expect(isPaymentLedgerV2Enabled()).toBe(false);
  });

  it('CHỈ đúng chuỗi "true" mới bật', () => {
    process.env[LEDGER_KEY] = "true";
    expect(isPaymentLedgerV2Enabled()).toBe(true);
  });

  it('KHÔNG bật với "TRUE"/"True"/"1"/"yes"/" true " — cutover tiền phải gõ chính xác', () => {
    for (const v of ["TRUE", "True", "1", "yes", "on", " true "]) {
      process.env[LEDGER_KEY] = v;
      expect(isPaymentLedgerV2Enabled(), `giá trị ${JSON.stringify(v)}`).toBe(false);
    }
  });

  it('chuỗi rỗng / "false" → TẮT', () => {
    for (const v of ["", "false"]) {
      process.env[LEDGER_KEY] = v;
      expect(isPaymentLedgerV2Enabled(), `giá trị ${JSON.stringify(v)}`).toBe(false);
    }
  });
});
