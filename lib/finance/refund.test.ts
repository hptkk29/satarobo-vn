// W3-1 / LMS-9 — computeRefund (THUẦN). Pure: Σ confirmed − buổi đã học × đơn giá, clamp ≥0.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";
import { computeRefund } from "@/lib/finance/refund";

describe("[W3-1] computeRefund", () => {
  it("đơn giá = round(finalPrice / sessionsTotal)", () => {
    expect(
      computeRefund({
        paidConfirmed: 0,
        finalPrice: 9_000_000,
        sessionsTotal: 24,
        sessionsLearned: 0,
      }).unitPrice,
    ).toBe(375_000);
    // làm tròn
    expect(
      computeRefund({
        paidConfirmed: 0,
        finalPrice: 1_000_000,
        sessionsTotal: 3,
        sessionsLearned: 0,
      }).unitPrice,
    ).toBe(333_333);
  });

  it("chưa học buổi nào → hoàn ≈ đã đóng", () => {
    const r = computeRefund({
      paidConfirmed: 9_000_000,
      finalPrice: 9_000_000,
      sessionsTotal: 24,
      sessionsLearned: 0,
    });
    expect(r.proposedAmount).toBe(9_000_000);
  });

  it("học giữa khoá → hoàn = đã đóng − buổi học × đơn giá", () => {
    // 9tr / 24 buổi = 375k. Đã đóng 9tr, học 8 buổi → 9tr − 8×375k = 6tr.
    const r = computeRefund({
      paidConfirmed: 9_000_000,
      finalPrice: 9_000_000,
      sessionsTotal: 24,
      sessionsLearned: 8,
    });
    expect(r.unitPrice).toBe(375_000);
    expect(r.proposedAmount).toBe(6_000_000);
  });

  it("học hết → hoàn 0", () => {
    const r = computeRefund({
      paidConfirmed: 9_000_000,
      finalPrice: 9_000_000,
      sessionsTotal: 24,
      sessionsLearned: 24,
    });
    expect(r.proposedAmount).toBe(0);
  });

  it("clamp ≥ 0 (học quá số buổi / đóng thiếu)", () => {
    const r = computeRefund({
      paidConfirmed: 1_000_000,
      finalPrice: 9_000_000,
      sessionsTotal: 24,
      sessionsLearned: 24,
    });
    expect(r.proposedAmount).toBe(0);
  });

  it("sessionsTotal = 0 → đơn giá 0, hoàn = đã đóng", () => {
    const r = computeRefund({
      paidConfirmed: 2_000_000,
      finalPrice: 9_000_000,
      sessionsTotal: 0,
      sessionsLearned: 0,
    });
    expect(r.unitPrice).toBe(0);
    expect(r.proposedAmount).toBe(2_000_000);
  });
});

// ── Cầu dao tính năng (08/09/2026) ────────────────────────────────────────────
//
// `RefundRequest` = 0 dòng trên prod, NHƯNG đường ghi còn sống (2 caller: gỡ học viên
// khỏi lớp, huỷ lớp) ⇒ bom hẹn giờ theo docs/luat-doc-so-va-ket-luan.md §Luật 1.
//
// Test này khoá HAI thứ: cầu dao đang bật, và nó chặn ở CỬA DUY NHẤT chứ không phải
// rải ở từng caller.
const doc = (f: string) => readFileSync(join(__dirname, f), "utf8");

describe("cầu dao hoàn tiền", () => {
  it("cầu dao ĐANG BẬT — xoá hằng này là mở lại đường ghi", async () => {
    const { REFUND_REQUEST_DISABLED } = await import("./cau-dao-hoan-tien");
    expect(REFUND_REQUEST_DISABLED).toBe(true);
  });

  it("chặn ở createRefundRequest — cửa DUY NHẤT, không rải ở từng caller", async () => {
    const src = doc("refund.ts");
    expect(src).toContain("REFUND_REQUEST_DISABLED");
    // Cầu dao phải đứng TRƯỚC truy vấn đầu tiên: nó trả lời được mà không cần đọc gì,
    // và đặt sau là "chặn nhưng vẫn đi hỏi DB".
    expect(src.indexOf("if (REFUND_REQUEST_DISABLED)")).toBeLessThan(
      src.indexOf("enrollment.findFirst"),
    );
  });

  it("trả null chứ KHÔNG ném — hàm chạy trong transaction gỡ học viên", async () => {
    // Ném ở đây là cuộn ngược cả việc gỡ: "không đề xuất được tiền" biến thành "không
    // gỡ được học viên". Khoá lại bằng chữ, vì hành vi này là quyết định chứ không phải
    // tiện tay.
    const src = doc("refund.ts");
    const than = src.slice(
      src.indexOf("if (REFUND_REQUEST_DISABLED)"),
      src.indexOf("const client: DbClient"),
    );
    expect(than).toContain("return null");
    expect(than).not.toContain("throw");
  });

  it("mỗi lần chạm cầu dao đều để lại dấu (AuditLog + console)", async () => {
    const src = doc("cau-dao-hoan-tien.ts");
    expect(src).toContain("REFUND_REQUEST_BLOCKED");
    expect(src).toContain("writeAudit");
    // Ghi log hỏng KHÔNG được làm hỏng lượt gỡ học viên.
    expect(src).toContain("catch");
  });

  it("file cầu dao ghi ĐỦ 4 điều kiện gỡ", async () => {
    // Cầu dao không có điều kiện gỡ là cầu dao ở lại vĩnh viễn.
    const src = doc("cau-dao-hoan-tien.ts");
    expect(src).toContain("ĐIỀU KIỆN GỠ");
    for (const n of ["1.", "2.", "3.", "4."])
      expect(src).toContain(`//   ${n}`);
  });
});

// Vì sao phải chặn — giữ con số biết nói ngay cạnh cầu dao.
describe("computeRefund — lý do dựng cầu dao", () => {
  it("sessionsLearned = 0 vì status chưa đóng ⇒ đề xuất hoàn TOÀN BỘ học phí", () => {
    // Lớp 20 buổi, đã dạy gần hết, phụ huynh đóng đủ 10.000.000.
    // Prod 07/09: 2 COMPLETED / 287 SCHEDULED ⇒ sessionsLearned đọc ra 0.
    const { proposedAmount } = computeRefund({
      paidConfirmed: 10_000_000,
      finalPrice: 10_000_000,
      sessionsTotal: 20,
      sessionsLearned: 0,
    });
    expect(proposedAmount).toBe(10_000_000); // 100% — đây chính là quả bom
  });

  it("cùng lớp đó, nếu status đúng (đã dạy 18/20) thì chỉ hoàn 1.000.000", () => {
    const { proposedAmount } = computeRefund({
      paidConfirmed: 10_000_000,
      finalPrice: 10_000_000,
      sessionsTotal: 20,
      sessionsLearned: 18,
    });
    expect(proposedAmount).toBe(1_000_000);
  });
});
