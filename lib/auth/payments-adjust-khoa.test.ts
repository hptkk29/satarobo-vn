// Bước 1 — chốt chặn: nút "Điều chỉnh khoản thu" phải ĐANG KHOÁ.
//
// ─────────────────────────────────────────────────────────────────────────────
// Vì sao (07/09/2026)
//
// `adjustPayment` hiện ghi SỐ TUYỆT ĐỐI vào một dòng Payment mới mang
// `accountantStatus = ADJUSTED` (lib/finance/payment.ts:612). Hậu quả hai chiều:
//   · trục kế toán lọc `accountantStatus = CONFIRMED` ⇒ KHÔNG thấy dòng điều chỉnh,
//     số kế toán vừa sửa không bao giờ tới phụ huynh;
//   · trục ghi nhận lọc `saleStatus = RECORDED` (mã QR · webhook SePay · tin ZNS ·
//     cổng chốt lead) ⇒ cộng CẢ dòng gốc LẪN dòng điều chỉnh, tức NHÂN ĐÔI tiền.
//
// Đo 07/09: 0 bút toán ADJUSTED ở cả ba môi trường (local · dev/test · prod). Lỗi đang
// TIỀM ẨN và sẽ nổ ngay lần đầu có người bấm nút — nên khoá trước, viết lại sau.
//
// Bộ này canh cái khoá. Khi Bước 6 xanh và quyết định mở lại, ca dưới sẽ ĐỎ — đó là
// lời nhắc phải sửa cả kỳ vọng ở đây, không phải sửa lén một chỗ.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";

import type { Role } from "@prisma/client";

import { ALL_ACTIONS, PERMISSIONS, can } from "@/lib/auth/permissions";

const MOI_VAI: Role[] = [
  "SUPER_ADMIN",
  "CENTER_MANAGER",
  "HR",
  "SALES_CSM",
  "TEACHER",
  "TRAINING",
  "MARKETING",
  "ACCOUNTANT",
  "PARENT",
];

describe("payments:adjust — khoá tạm", () => {
  it("là một action có thật (không phải chuỗi gõ nhầm ở call-site)", () => {
    // Gõ sai key thì `can()` trả false và cổng nhìn như đang chạy — xanh giả.
    expect(ALL_ACTIONS).toContain("payments:adjust");
  });

  it("KHÔNG cấp cho vai nghiệp vụ nào — kể cả ACCOUNTANT", () => {
    expect(PERMISSIONS["payments:adjust"]).toEqual(["SUPER_ADMIN"]);
    for (const vai of MOI_VAI.filter((v) => v !== "SUPER_ADMIN")) {
      expect(can(vai, "payments:adjust"), `${vai} không được có quyền này`).toBe(false);
    }
  });

  it("SUPER_ADMIN vẫn qua — CỐ Ý, do bất biến của repo", () => {
    // `permissions.test.ts` bắt mọi action phải cấp cho SUPER_ADMIN để v1 khớp bypass
    // v2, nếu không mỗi lượt admin chạm call-site sẽ đẻ một dòng RbacShadowDiff. Ca này
    // ghi lại rằng khoá hiện tại CÓ lỗ đó, để không ai tưởng là đã kín.
    expect(can("SUPER_ADMIN", "payments:adjust")).toBe(true);
  });

  it("khoá này KHÔNG đụng tới payments:confirm — kế toán vẫn xác nhận được", () => {
    // Khoá điều chỉnh mà khoá luôn xác nhận là chặn đứng cả luồng thu tiền.
    expect(can("ACCOUNTANT", "payments:confirm")).toBe(true);
    expect(can("ACCOUNTANT", "payments:record")).toBe(true);
  });

  it("dạng user-object cũng bị chặn (đường `can()` Path 2)", () => {
    expect(
      can({ role: "ACCOUNTANT", roles: ["ACCOUNTANT"] }, "payments:adjust"),
    ).toBe(false);
    // Đa vai: kế toán kiêm quản lý cơ sở vẫn không mở được.
    expect(
      can({ role: "ACCOUNTANT", roles: ["ACCOUNTANT", "CENTER_MANAGER"] }, "payments:adjust"),
    ).toBe(false);
  });
});
