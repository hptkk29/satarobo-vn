// R2-06 — computeDebt + paidOf (THUẦN). Pure.
// R7-04 — computeEnrollmentDebt + overdueBucket + reminder-day decision (THUẦN).
// HT (27/08/2026) — computeEnrollmentDebt nay đi qua ĐÚNG công thức thực thu
// (`lib/finance/thuc-thu.ts`) thay vì tự cộng `Σ amount` của mảng truyền vào.
import { describe, it, expect } from "vitest";
import {
  computeDebt,
  paidOf,
  computeEnrollmentDebt,
  TRANG_THAI_ROI_LOP,
  overdueBucket,
  effectiveReminderDays,
  isReminderDue,
} from "@/lib/finance/debt";
import type { ThucThuButToan } from "@/lib/finance/thuc-thu";

/** Dựng 1 bút toán Payment phẳng cho test. */
function bt(
  id: string,
  amount: number,
  accountantStatus: string,
  adjustmentOfId: string | null = null,
): ThucThuButToan {
  return { id, amount, accountantStatus, adjustmentOfId };
}

describe("[R2-06] debt calc (C6.1)", () => {
  it("công nợ = total - paid (không âm)", () => {
    expect(computeDebt(5_000_000, 2_000_000)).toBe(3_000_000);
    expect(computeDebt(5_000_000, 5_000_000)).toBe(0);
    expect(computeDebt(5_000_000, 6_000_000)).toBe(0); // không âm
  });
  it("paidOf theo status", () => {
    expect(paidOf({ status: "CONFIRMED", totalAmount: 100 })).toBe(100);
    expect(paidOf({ status: "COMPLETED", totalAmount: 100 })).toBe(100);
    expect(paidOf({ status: "PENDING_PAYMENT", totalAmount: 100 })).toBe(0);
  });
});

describe("[R7-04] computeEnrollmentDebt (AC6)", () => {
  it("finalPrice - Σ đã xác nhận", () => {
    expect(computeEnrollmentDebt(9_000_000, [bt("p1", 5_000_000, "CONFIRMED")], "STUDYING")).toBe(
      4_000_000,
    );
    expect(
      computeEnrollmentDebt(
        9_000_000,
        [bt("p1", 5_000_000, "CONFIRMED"), bt("p2", 4_000_000, "CONFIRMED")],
        "STUDYING",
      ),
    ).toBe(0);
  });
  it("đóng thừa → ÂM (trả raw, không clamp)", () => {
    expect(computeEnrollmentDebt(9_000_000, [bt("p1", 10_000_000, "CONFIRMED")], "STUDYING")).toBe(
      -1_000_000,
    );
  });
  it("finalPrice null → 0; không có khoản → finalPrice", () => {
    expect(computeEnrollmentDebt(null, [bt("p1", 1_000, "CONFIRMED")], "STUDYING")).toBe(-1_000);
    expect(computeEnrollmentDebt(9_000_000, [], "STUDYING")).toBe(9_000_000);
  });
  it("khoản PENDING/REJECTED không giảm công nợ", () => {
    expect(
      computeEnrollmentDebt(
        9_000_000,
        [bt("p1", 5_000_000, "PENDING"), bt("p2", 1_000_000, "REJECTED")],
        "STUDYING",
      ),
    ).toBe(9_000_000);
  });
});

describe("[HT-10] computeEnrollmentDebt — hoàn tiền & điều chỉnh (vá 27/08/2026)", () => {
  it("ghi danh CÒN HỌC + hoàn một phần → công nợ tăng lại đúng phần đã trả cho PH", () => {
    // Khoản đã trả lại thì học viên còn học vẫn phải đóng — công nợ phải quay lên.
    const rows = [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -2_000_000, "REFUNDED", "p1")];
    expect(computeEnrollmentDebt(9_000_000, rows, "STUDYING")).toBe(6_000_000);
  });

  it("bản ĐIỀU CHỈNH thay bản gốc — không cộng đôi, không giữ số cũ", () => {
    const rows = [bt("p1", 5_000_000, "CONFIRMED"), bt("a1", 3_000_000, "ADJUSTED", "p1")];
    expect(computeEnrollmentDebt(9_000_000, rows, "STUDYING")).toBe(6_000_000); // 9tr − 3tr
  });

  it("điều chỉnh rồi hoàn nốt trên bản điều chỉnh", () => {
    const rows = [
      bt("p1", 5_000_000, "CONFIRMED"),
      bt("a1", 3_000_000, "ADJUSTED", "p1"),
      bt("r1", -1_000_000, "REFUNDED", "a1"),
    ];
    expect(computeEnrollmentDebt(9_000_000, rows, "STUDYING")).toBe(7_000_000); // 9tr − 2tr
  });
});

describe("[HT-11] computeEnrollmentDebt — ghi danh ĐÃ RỜI LỚP không đẻ nợ ma", () => {
  // ⚠️ Đây là tác dụng phụ đắt nhất của việc chuyển sang thực thu ròng, và nó KHÔNG
  // hiển nhiên: `getDebtRows` lọc `deletedAt: null` nhưng KHÔNG lọc status
  // (`lib/students/remove-from-classes.ts` ghi rõ điều đó), nên ghi danh của học viên
  // nghỉ học vẫn nằm trong bảng công nợ. Trước khi vá, em nghỉ-học-hoàn-đủ có công nợ 0
  // (vì bút toán âm bị bỏ qua). Nếu lấy thẳng thực thu ròng, em đó bỗng "nợ" nguyên học
  // phí và bị hệ thống đi đòi — đổi một lỗi im lặng thành một lỗi ồn ào hơn.
  it("WITHDREW + hoàn toàn bộ → công nợ GIỮ NGUYÊN như trước khi vá", () => {
    const rows = [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -5_000_000, "REFUNDED", "p1")];
    expect(computeEnrollmentDebt(9_000_000, rows, "WITHDREW")).toBe(4_000_000);
  });

  it("TRANSFERRED / CANCELLED cùng luật", () => {
    const rows = [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -5_000_000, "REFUNDED", "p1")];
    expect(computeEnrollmentDebt(9_000_000, rows, "TRANSFERRED")).toBe(4_000_000);
    expect(computeEnrollmentDebt(9_000_000, rows, "CANCELLED")).toBe(4_000_000);
  });

  it("đã rời lớp nhưng CHƯA đóng đồng nào → vẫn còn nợ (không được xoá khoản phải thu)", () => {
    expect(computeEnrollmentDebt(9_000_000, [], "WITHDREW")).toBe(9_000_000);
  });

  it("đã rời lớp, KHÔNG hoàn → công nợ y hệt ghi danh còn học", () => {
    const rows = [bt("p1", 5_000_000, "CONFIRMED")];
    expect(computeEnrollmentDebt(9_000_000, rows, "WITHDREW")).toBe(
      computeEnrollmentDebt(9_000_000, rows, "STUDYING"),
    );
  });

  it("đã rời lớp + có điều chỉnh giảm → bản điều chỉnh VẪN thay bản gốc", () => {
    // Miễn trừ chỉ áp cho bút toán HOÀN, không phải cho điều chỉnh.
    const rows = [bt("p1", 5_000_000, "CONFIRMED"), bt("a1", 3_000_000, "ADJUSTED", "p1")];
    expect(computeEnrollmentDebt(9_000_000, rows, "WITHDREW")).toBe(6_000_000);
  });

  it("COMPLETED KHÔNG nằm trong nhóm rời lớp — học xong thì học phí vẫn phải đủ", () => {
    expect([...TRANG_THAI_ROI_LOP].sort()).toEqual(["CANCELLED", "TRANSFERRED", "WITHDREW"]);
    const rows = [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -2_000_000, "REFUNDED", "p1")];
    expect(computeEnrollmentDebt(9_000_000, rows, "COMPLETED")).toBe(6_000_000);
  });

  it("status null (dữ liệu cũ) → xử như còn học, fail-closed về phía CÒN NỢ", () => {
    const rows = [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -2_000_000, "REFUNDED", "p1")];
    expect(computeEnrollmentDebt(9_000_000, rows, null)).toBe(6_000_000);
  });
});

describe("[R7-04] overdueBucket (công nợ đa chiều)", () => {
  const due = new Date("2026-06-15T00:00:00Z");
  const at = (d: string) => new Date(d + "T00:00:00Z");
  it("chưa tới hạn / null → none", () => {
    expect(overdueBucket(due, at("2026-06-15"))).toBe("none"); // đúng hạn (0 ngày)
    expect(overdueBucket(due, at("2026-06-10"))).toBe("none"); // trước hạn
    expect(overdueBucket(null, at("2026-06-30"))).toBe("none");
  });
  it("biên 1-7 / 8-30 / >30", () => {
    expect(overdueBucket(due, at("2026-06-16"))).toBe("1-7"); // +1
    expect(overdueBucket(due, at("2026-06-22"))).toBe("1-7"); // +7
    expect(overdueBucket(due, at("2026-06-23"))).toBe("8-30"); // +8
    expect(overdueBucket(due, at("2026-07-15"))).toBe("8-30"); // +30
    expect(overdueBucket(due, at("2026-07-16"))).toBe(">30"); // +31
  });
});

describe("[R7-04] reminder-day decision (AC4 / C4,C5)", () => {
  const due = new Date("2026-06-15T00:00:00Z");
  const at = (d: string) => new Date(d + "T00:00:00Z");

  it("effectiveReminderDays: override → fallback default 14", () => {
    expect(effectiveReminderDays(7, 14)).toBe(7);
    expect(effectiveReminderDays(null, 14)).toBe(14);
    expect(effectiveReminderDays(0, 14)).toBe(0); // 0 hợp lệ — nhắc đúng ngày hạn
  });

  it("X=7: D-8 chưa nhắc, từ D-7 trở đi đã đến hạn", () => {
    expect(isReminderDue(due, 7, at("2026-06-07"))).toBe(false); // D-8
    expect(isReminderDue(due, 7, at("2026-06-08"))).toBe(true); // D-7
    expect(isReminderDue(due, 7, at("2026-06-09"))).toBe(true); // D-6 (anti-spam ở tầng lastReminderAt)
  });

  it("reminderDays null → dùng default 14: nhắc từ D-14", () => {
    const days = effectiveReminderDays(null, 14);
    expect(isReminderDue(due, days, at("2026-05-31"))).toBe(false); // D-15
    expect(isReminderDue(due, days, at("2026-06-01"))).toBe(true); // D-14
  });

  it("ngày nhắc ≤ hôm nay (X lớn hơn khoảng cách) → nhắc ngay (C5)", () => {
    // dueDate +3 ngày, X=14 → remindFrom đã ở quá khứ → nhắc ngay.
    const dueSoon = at("2026-06-18");
    expect(isReminderDue(dueSoon, 14, at("2026-06-15"))).toBe(true);
  });
});
