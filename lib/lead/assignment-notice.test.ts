// @vitest-environment node
/**
 * Câu chữ báo cho người bấm sau một lượt đổi chủ lead. Test viết TRƯỚC phần hiện thực
 * (luật cứng Nền Hệ thống #5).
 *
 * VÌ SAO CÓ FILE NÀY: `applyLeadReassignment` khai rõ ở khối `enrollmentsUnassigned`
 * ("KHÔNG được im lặng: người vận hành cần biết còn bao nhiêu ghi danh phải gán tay lại"),
 * nhưng ba đường bấm-tay — chuyển lead, gán tay, auto-chia — đều trả `{ ok: true }` trần
 * và toast chỉ nói "Đã chuyển lead". Ghi danh đổi/giữ sale phụ trách là thứ quyết định ai
 * còn nhắn riêng được với phụ huynh; giấu con số đó là để người vận hành không có cách
 * nào biết mình vừa phải vào màn học viên của lớp gán lại.
 *
 * Hàm THUẦN (không import gì) để cả 3 component client dùng chung một câu chữ — ba bản
 * chép tay là ba câu lệch nhau sau vài tháng.
 */
import { describe, expect, it } from "vitest";
import { enrollmentNotice } from "./assignment-notice";

describe("enrollmentNotice", () => {
  it("không đụng ghi danh nào ⇒ null (đường thường, không thêm chữ vào toast)", () => {
    expect(enrollmentNotice({})).toBeNull();
    expect(
      enrollmentNotice({ enrollmentsMoved: 0, enrollmentsUnassigned: 0, enrollmentsKept: 0 }),
    ).toBeNull();
  });

  it("có ghi danh đổi người phụ trách ⇒ nói ra (kênh riêng Sale↔PH đi theo cột này)", () => {
    expect(enrollmentNotice({ enrollmentsMoved: 2 })).toBe(
      "2 ghi danh đã đổi sang sale mới.",
    );
  });

  it("ghi danh bị GỠ ⇒ nói rõ phải gán tay lại", () => {
    expect(enrollmentNotice({ enrollmentsUnassigned: 1 })).toBe(
      "1 ghi danh khác cơ sở đã bị gỡ sale phụ trách — cần gán lại ở màn học viên của lớp.",
    );
  });

  it("ghi danh Ở LẠI với sale cũ ⇒ nói rõ vì sao lead và ghi danh khác người", () => {
    expect(enrollmentNotice({ enrollmentsKept: 3 })).toBe(
      "3 ghi danh khác cơ sở vẫn do sale cũ phụ trách.",
    );
  });

  it("nhiều nhánh cùng lúc ⇒ nối lại, giữ thứ tự đổi → gỡ → giữ", () => {
    expect(
      enrollmentNotice({
        enrollmentsMoved: 1,
        enrollmentsUnassigned: 2,
        enrollmentsKept: 3,
      }),
    ).toBe(
      "1 ghi danh đã đổi sang sale mới. " +
        "2 ghi danh khác cơ sở đã bị gỡ sale phụ trách — cần gán lại ở màn học viên của lớp. " +
        "3 ghi danh khác cơ sở vẫn do sale cũ phụ trách.",
    );
  });

  it("số âm / không phải số ⇒ bỏ qua, không đẻ câu chữ vô nghĩa", () => {
    expect(enrollmentNotice({ enrollmentsMoved: -1 })).toBeNull();
    expect(enrollmentNotice({ enrollmentsKept: undefined })).toBeNull();
  });
});
