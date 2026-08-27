import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isAuthPhoneProvisioningEnabled,
  isPaymentLedgerV2Enabled,
  isSaleSiteEnabled,
} from "./flags";

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

// ─────────────────────────────────────────────────────────────────────────────
// S-7 (26/08/2026) — cờ site Sale phải CÓ MẶT trong `.env.example`.
//
// `.env.example` là thứ duy nhất người dựng môi trường mới đọc. Cờ không có ở đó
// thì nó vô hình: không ai biết `sale.satarobo.vn` có công tắc, và cách duy nhất
// phát hiện là đọc `lib/flags.ts`. Đúng cái đầu file `.env.example` cảnh báo —
// "THIẾU FEATURE FLAG = tính năng tự tắt trên bản deploy dù localhost vẫn thấy".
// ─────────────────────────────────────────────────────────────────────────────
const SALE_KEY = "SALE_SITE_ENABLED";
const ENV_EXAMPLE = readFileSync(join(process.cwd(), ".env.example"), "utf8");

describe("isSaleSiteEnabled", () => {
  afterEach(() => {
    delete process.env[SALE_KEY];
  });

  it("`.env.example` có khai cờ — người dựng môi trường mới nhìn thấy nó", () => {
    expect(
      new RegExp(`^${SALE_KEY}=`, "m").test(ENV_EXAMPLE),
      "thiếu dòng SALE_SITE_ENABLED trong .env.example",
    ).toBe(true);
  });

  it("mặc định TẮT khi không khai env — site Sale không tự mở", () => {
    delete process.env[SALE_KEY];
    expect(isSaleSiteEnabled()).toBe(false);
  });

  it('CHỈ đúng chuỗi "true" mới bật — gõ gần đúng là VẪN TẮT', () => {
    process.env[SALE_KEY] = "true";
    expect(isSaleSiteEnabled()).toBe(true);
    for (const v of ["TRUE", "True", "1", "yes", "on", " true ", "", "false"]) {
      process.env[SALE_KEY] = v;
      expect(isSaleSiteEnabled(), `giá trị ${JSON.stringify(v)}`).toBe(false);
    }
  });
});
