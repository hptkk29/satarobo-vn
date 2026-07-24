// Cross-center bám CHỨC NĂNG, không bám con người (Doc 15 §2).
//
// `getModelVisibleCenterIds(model, actor)` gom union `centerScope` của các permission
// khớp prefix action của model. Nhờ đó một người kiêm nhiều role ở nhiều cấp thấy
// đúng phần dữ liệu của từng chức năng, thay vì "có 1 role HO ⇒ thấy tất".
//
// Ca thật (24/07/2026): Phan Thành Toại = TRAINING @ HO + CENTER_MANAGER @ CS1 + TEACHER @ CS1.
// Yêu cầu (user chốt 24/07): Đào tạo KHOÁ CHẶT — Toại thấy HỌC VIÊN/LỚP/BUỔI/GHI DANH/ĐIỂM DANH
// CHỈ CS1 (như một QL cơ sở). CHỈ HỌC BẠ (ReportCard) cross-center để DUYỆT học bạ CS2.
// LEAD/DOANH THU/NHÂN SỰ CS2 vẫn không thấy.
import { describe, it, expect } from "vitest";
import { SCOPED_MODELS, getModelPrefixes, getModelVisibleCenterIds } from "@/lib/db-scope";
import type { Actor, PermEntry } from "@/lib/auth/actor";

const CS1 = "center-cs1";
const CS2 = "center-cs2";

const perm = (action: string, centerScope: "ALL" | string[]): PermEntry => ({
  action,
  scopeType: "GLOBAL",
  orgUnitId: centerScope === "ALL" ? "org-ho" : "org-cs1",
  roleCode: centerScope === "ALL" ? "TRAINING" : "CENTER_MANAGER",
  centerScope,
});

/** Toại: TRAINING @ HO (đào tạo toàn hệ thống) + CENTER_MANAGER @ CS1. */
const toai: Actor = {
  userId: "u-toai",
  isSuperAdmin: false,
  isHoLevel: true, // có role tại HO ⇒ cờ blanket bật — test này chứng minh nó KHÔNG còn quyết định tất
  orgRoles: [
    { orgUnitId: "org-ho", roleCode: "TRAINING" },
    { orgUnitId: "org-cs1", roleCode: "CENTER_MANAGER" },
  ],
  permissions: [
    // TRAINING @ HO — 24/07 khoá chặt: chỉ DUYỆT học bạ cross-center (report-cards:review).
    // KHÔNG còn students/classes:view-all, KHÔNG report-cards:manage.
    perm("report-cards:review", "ALL"),
    // CENTER_MANAGER @ CS1 — vận hành cơ sở, chỉ CS1 (gồm cả xem HV/lớp/ghi danh).
    perm("students:view-all", [CS1]),
    perm("classes:view-all", [CS1]),
    perm("leads:view-all", [CS1]),
    perm("leads:edit", [CS1]),
    perm("payments:record", [CS1]),
    perm("orders:view", [CS1]),
    perm("employees:view-all", [CS1]),
    perm("enrollments:view-all", [CS1]),
  ],
  visibleCenterIds: [CS1, CS2], // blanket (HO) — KHÔNG được dùng cho model đã map prefix
  visibleOrgUnitIds: ["org-ho", "org-cs1"],
  grantsAllow: new Set<string>(),
  assignedClassIds: new Set<string>(),
};

describe("scopedDb — cross-center theo chức năng (ca Toại — 24/07 khoá chặt Đào tạo)", () => {
  it("CHỈ THẤY học viên + lớp + buổi học CS1 (Đào tạo hết view-all; chỉ còn CM@CS1)", () => {
    expect(getModelVisibleCenterIds("Student", toai)).toEqual([CS1]);
    expect(getModelVisibleCenterIds("Class", toai)).toEqual([CS1]);
    expect(getModelVisibleCenterIds("ClassSession", toai)).toEqual([CS1]);
  });

  it("CHỈ THẤY ghi danh CS1 — /ghi danh khoá theo enrollments: (tách report-cards: 24/07)", () => {
    expect(getModelVisibleCenterIds("Enrollment", toai)).toEqual([CS1]);
  });

  it("VẪN duyệt được HỌC BẠ cả 2 cơ sở — ReportCard giữ report-cards: (report-cards:review GLOBAL)", () => {
    expect(getModelVisibleCenterIds("ReportCard", toai)).toBe("ALL");
  });

  it("CHỈ THẤY điểm danh CS1 (bám classes: — Toại chỉ CS1)", () => {
    expect(getModelVisibleCenterIds("Attendance", toai)).toEqual([CS1]);
  });

  it("KHÔNG thấy lead cơ sở khác (leads:* chỉ gắn CS1)", () => {
    expect(getModelVisibleCenterIds("Lead", toai)).toEqual([CS1]);
    expect(getModelVisibleCenterIds("MessengerConversation", toai)).toEqual([CS1]);
    // Lịch sử học thử của lead = dữ liệu lead, KHÔNG phải đào tạo.
    expect(getModelVisibleCenterIds("LeadTrialHistory", toai)).toEqual([CS1]);
  });

  it("KHÔNG thấy doanh thu / đơn hàng cơ sở khác", () => {
    expect(getModelVisibleCenterIds("Payment", toai)).toEqual([CS1]);
    expect(getModelVisibleCenterIds("Order", toai)).toEqual([CS1]);
  });

  it("KHÔNG thấy nhân sự cơ sở khác", () => {
    expect(getModelVisibleCenterIds("Employee", toai)).toEqual([CS1]);
  });
});

describe("scopedDb — mọi SCOPED_MODEL phải có prefix (nếu không sẽ rơi về blanket isHoLevel)", () => {
  it("không model nào thiếu map", () => {
    // #04 flip Attendance sang SCOPED nhưng quên map → bất kỳ ai có 1 role HO đều thấy
    // điểm danh toàn hệ thống bất kể chức năng. Test này chặn lặp lại.
    const thieu = [...SCOPED_MODELS].filter((m) => getModelPrefixes(m).length === 0);
    expect(thieu).toEqual([]);
  });
});
