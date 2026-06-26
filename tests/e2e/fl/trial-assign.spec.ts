/**
 * FL2-04 — Tab Học thử: picker "ghép vào lớp" chỉ liệt kê lớp TRẢI NGHIỆM
 * (TrialClassV2 OPEN cùng cơ sở) + gán HS trực tiếp → TrialEnrollment.
 * AC theo BA #07 US-LEAD-4 (QĐ-T3).
 *
 * ⚠️ SPEC PHÁC (không nằm trong CI run mặc định của lane). Assert runnable cho helper
 * lọc cơ sở thuần; luồng UI gán trực tiếp để fixme khi dựng fixture.
 */
import { test, expect } from "@playwright/test";
import { filterOpenTrialClasses } from "../../../lib/trials/assign";

const CS1 = "cs1";
const CS2 = "cs2";
const CLASSES = [
  { id: "tc-a", centerId: CS1 },
  { id: "tc-b", centerId: CS1 },
  { id: "tc-c", centerId: CS2 },
];

test.describe("[FL2-04] Xếp lớp trải nghiệm tại tab Học thử", () => {
  // AC1 + AC3 — picker chỉ lớp trải nghiệm CÙNG cơ sở của buổi/lead.
  test("[FL2-04-T1] chỉ giữ lớp cùng cơ sở", async () => {
    const r = filterOpenTrialClasses(CLASSES, CS1);
    expect(r.map((c) => c.id)).toEqual(["tc-a", "tc-b"]);
  });

  test("[FL2-04-T2] cơ sở khác → không lọt lớp ngoài cơ sở", async () => {
    const r = filterOpenTrialClasses(CLASSES, CS2);
    expect(r.map((c) => c.id)).toEqual(["tc-c"]);
  });

  // Cơ sở không xác định → KHÔNG gợi ý lớp nào (tránh xếp nhầm cơ sở).
  test("[FL2-04-T3] effectiveCenterId null → rỗng", async () => {
    expect(filterOpenTrialClasses(CLASSES, null)).toEqual([]);
  });

  // AC2 — gán HS/con trực tiếp ở tab Học thử → tạo TrialEnrollment (không cần mở lead).
  test.fixme("[FL2-04-T4] UI tab Học thử: chọn con + lớp trải nghiệm → enroll", async () => {
    // TODO(fixture): seed lead@cs1 có LeadChild + TrialClass V1 + TrialClassV2 OPEN@cs1.
    // Mở /admin/trials → card → "Xếp vào lớp trải nghiệm" → chọn lớp → "Xếp vào lớp"
    // → assert toast thành công + TrialEnrollment ACTIVE tồn tại; KHÔNG ghi TrialClass.classId.
  });

  // AC1 — picker KHÔNG hiện lớp CHÍNH THỨC (Class) nữa.
  test.fixme("[FL2-04-T5] picker không liệt kê Class chính thức", async () => {
    // TODO(fixture): card không còn field 'Ghép vào lớp (tùy chọn)' đổ từ Class.
  });
});
