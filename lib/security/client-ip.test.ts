// lib/security/client-ip.test.ts — KHOÁ CHẶN TẦN SUẤT phải KHÔNG giả được. THUẦN.
//
// Hai câu chủ dự án đặt ra (21/09/2026), mỗi câu một cụm ca:
//   1. header client gửi được có lọt vào khoá rate limit không;
//   2. `LOGIN_RATELIMIT_DISABLED` có bị chốt cứng trên production không.
import { describe, expect, it } from "vitest";
import {
  HEADER_IP_E2E,
  duocTatChanTanSuatDangNhap,
  ipChoRateLimit,
  laProductionThat,
} from "./client-ip";

/** `Headers` thật để ca test đi đúng đường mã sản xuất đi (tên header không phân biệt hoa/thường). */
const h = (o: Record<string, string>) => new Headers(o);

const PROD = { VERCEL_ENV: "production" };
const TEST_ENV = { VERCEL_ENV: "test" };
const CI_ENV = { NODE_ENV: "production", CI: "true" };

describe("[CIP] chọn IP làm khoá chặn tần suất", () => {
  it("[CIP-01] header của NỀN TẢNG thắng mọi thứ client gửi", () => {
    // Vercel gỡ `x-vercel-*` đến từ ngoài, nên đây là thứ duy nhất client không chạm được.
    const ip = ipChoRateLimit(
      h({
        "x-vercel-forwarded-for": "203.0.113.9",
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "5.6.7.8",
      }),
      PROD,
    );
    expect(ip).toBe("203.0.113.9");
  });

  it("[CIP-02] KHÔNG có header nền tảng ⇒ lấy phần tử CUỐI của x-forwarded-for", () => {
    // Quy ước XFF: mỗi proxy NỐI THÊM vào cuối. Phần tử cuối là do proxy gần nhất (tin
    // được) viết; phần tử đầu là do client viết.
    expect(ipChoRateLimit(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }), PROD)).toBe(
      "203.0.113.9",
    );
    // Nền tảng GHI ĐÈ (chuỗi chỉ còn IP thật) ⇒ vẫn đúng. Bản vá không cần biết Vercel
    // ghi đè hay nối thêm — đó là lý do nó chọn phần tử cuối.
    expect(ipChoRateLimit(h({ "x-forwarded-for": "203.0.113.9" }), PROD)).toBe("203.0.113.9");
  });

  it("[CIP-03] KẺ TẤN CÔNG đổi X-Forwarded-For mỗi request ⇒ khoá KHÔNG đổi", () => {
    // ⚠️ Đây là ca của cả bản vá. Bản cũ lấy `split(",")[0]` nên mỗi request một khoá khác
    // nhau ⇒ trần 10 lượt/phút KHÔNG BAO GIỜ chạm tới ⇒ cổng IP vô dụng.
    const khoa = new Set<string>();
    for (let i = 1; i <= 20; i += 1) {
      khoa.add(
        ipChoRateLimit(h({ "x-forwarded-for": `10.0.0.${i}, 203.0.113.9` }), PROD),
      );
    }
    expect(khoa.size, "20 IP giả mà vẫn phải ra ĐÚNG MỘT khoá").toBe(1);
    expect([...khoa][0]).toBe("203.0.113.9");
  });

  it("[CIP-04] `x-real-ip` chỉ tới lượt khi không còn gì khác", () => {
    expect(ipChoRateLimit(h({ "x-real-ip": "203.0.113.9" }), PROD)).toBe("203.0.113.9");
    // Không header nào ⇒ một khoá chung. KHÔNG fail-closed về hằng số cho mọi ca: cả công
    // ty dùng chung trần 10 lượt/phút là tự khoá cửa chính mình lúc 8 giờ sáng.
    expect(ipChoRateLimit(h({}), PROD)).toBe("unknown");
    expect(ipChoRateLimit(undefined, PROD)).toBe("unknown");
  });
});

describe("[CIP] cửa test chỉ tồn tại NGOÀI production", () => {
  it("[CIP-05] trên PRODUCTION, `x-e2e-client-ip` bị BỎ QUA", () => {
    const ip = ipChoRateLimit(
      h({ [HEADER_IP_E2E]: "10.90.1.1", "x-forwarded-for": "203.0.113.9" }),
      PROD,
    );
    expect(ip, "cửa test không được mở trên prod").toBe("203.0.113.9");
  });

  it("[CIP-06] ngoài production, `x-e2e-client-ip` có tác dụng", () => {
    for (const env of [TEST_ENV, CI_ENV, {}]) {
      expect(
        ipChoRateLimit(h({ [HEADER_IP_E2E]: "10.90.1.1", "x-forwarded-for": "203.0.113.9" }), env),
      ).toBe("10.90.1.1");
    }
  });

  it("[CIP-07] header NỀN TẢNG vẫn thắng cửa test, kể cả ngoài production", () => {
    // Thứ tự này có chủ đích: nơi nào có `x-vercel-forwarded-for` thì đó là môi trường
    // Vercel thật (preview/test), và IP thật vẫn là câu trả lời đúng hơn.
    expect(
      ipChoRateLimit(
        h({ "x-vercel-forwarded-for": "203.0.113.9", [HEADER_IP_E2E]: "10.90.1.1" }),
        TEST_ENV,
      ),
    ).toBe("203.0.113.9");
  });
});

describe("[CIP] nhận diện production", () => {
  it("[CIP-08] `VERCEL_ENV` thắng `NODE_ENV`", () => {
    expect(laProductionThat({ VERCEL_ENV: "production" })).toBe(true);
    // Môi trường `test` của Vercel chạy bản build production ⇒ NODE_ENV cũng là
    // "production". Hỏi NODE_ENV ở đây là coi test.satarobo.vn như prod.
    expect(
      laProductionThat({ VERCEL_ENV: "test", NODE_ENV: "production" }),
    ).toBe(false);
    expect(laProductionThat({ VERCEL_ENV: "preview" })).toBe(false);
  });

  it("[CIP-09] CI chạy `next start` (NODE_ENV=production) KHÔNG phải production", () => {
    // ⚠️ Vế `!CI` là thứ giữ cho bản vá bảo mật này khỏi tự làm hỏng bộ E2E: `next start`
    // luôn đặt NODE_ENV=production, kể cả trên runner.
    expect(laProductionThat(CI_ENV)).toBe(false);
    expect(laProductionThat({ NODE_ENV: "production" })).toBe(true);
  });
});

describe("[CIP] chốt cứng cửa tắt chặn tần suất đăng nhập", () => {
  it("[CIP-10] trên PRODUCTION: cờ bị BỎ QUA và có dòng lỗi gọi tên nó", () => {
    const loi: string[] = [];
    const ra = duocTatChanTanSuatDangNhap(
      { ...PROD, LOGIN_RATELIMIT_DISABLED: "1" },
      (s) => loi.push(s),
    );
    expect(ra, "cờ KHÔNG được có tác dụng trên production").toBe(false);
    expect(loi).toHaveLength(1);
    expect(loi[0]).toContain("LOGIN_RATELIMIT_DISABLED");
    expect(loi[0]).toContain("PRODUCTION");
  });

  it("[CIP-11] NODE_ENV=production ngoài CI cũng bị chặn", () => {
    const loi: string[] = [];
    expect(
      duocTatChanTanSuatDangNhap(
        { NODE_ENV: "production", LOGIN_RATELIMIT_DISABLED: "1" },
        (s) => loi.push(s),
      ),
    ).toBe(false);
    expect(loi).toHaveLength(1);
  });

  it("[CIP-12] ngoài production: cờ có tác dụng, KHÔNG kêu", () => {
    for (const env of [CI_ENV, TEST_ENV]) {
      const loi: string[] = [];
      expect(
        duocTatChanTanSuatDangNhap(
          { ...env, LOGIN_RATELIMIT_DISABLED: "1" },
          (s) => loi.push(s),
        ),
      ).toBe(true);
      expect(loi, "môi trường test thì không có gì để cảnh báo").toEqual([]);
    }
  });

  it("[CIP-13] không đặt cờ ⇒ luôn false, và CHỈ giá trị '1' mới tính", () => {
    const loi: string[] = [];
    expect(duocTatChanTanSuatDangNhap(CI_ENV, (s) => loi.push(s))).toBe(false);
    for (const v of ["true", "yes", "0", ""]) {
      expect(
        duocTatChanTanSuatDangNhap(
          { ...CI_ENV, LOGIN_RATELIMIT_DISABLED: v },
          (s) => loi.push(s),
        ),
        `giá trị ${JSON.stringify(v)} không được tính là bật`,
      ).toBe(false);
    }
    expect(loi).toEqual([]);
  });
});

describe("[CIP] lưới ghim: không ai đọc header IP thẳng ở đường đăng nhập", () => {
  it("[CIP-14] `lib/auth.ts` đi qua `ipChoRateLimit`, không tự bóc header", async () => {
    // Lưới VĂN BẢN (luật 11) — neo chuỗi hẹp, đếm số lần khớp, và đã cấy thử.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "lib/auth.ts"), "utf8");

    expect((src.match(/return ipChoRateLimit\(request\?\.headers\);/g) ?? []).length).toBe(1);
    // Bản cũ: `xff.split(",")[0]`. Nếu chuỗi đó quay lại thì lỗ đã mở lại.
    expect(src).not.toMatch(/split\(","\)\[0\]/);
    // Và cửa tắt phải đi qua hàm có chốt cứng, không hỏi env thẳng.
    expect((src.match(/if \(!duocTatChanTanSuatDangNhap\(\)\)/g) ?? []).length).toBe(1);
    expect(src).not.toMatch(/process\.env\.LOGIN_RATELIMIT_DISABLED/);
  });
});
