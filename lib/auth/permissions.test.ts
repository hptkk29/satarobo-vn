// FL W0-PERM — ma trận quyền tĩnh permissions.ts (pure, không DB).
// Phủ: TRAINING (Đào tạo) quản lý LMS; TEACHER/CENTER_MANAGER mất quyền sửa LMS
// nhưng giữ quyền xem + chấm; ACCOUNTANT mất students:edit (QĐ-T4).
import { describe, it, expect } from "vitest";
import { can, PERMISSIONS, ALL_ACTIONS } from "@/lib/auth/permissions";

describe("permissions matrix — FL W0 TRAINING role", () => {
  it("TRAINING biên soạn nội dung LMS", () => {
    expect(can("TRAINING", "curriculum:create")).toBe(true);
    expect(can("TRAINING", "curriculum:edit")).toBe(true);
    expect(can("TRAINING", "curriculum:delete")).toBe(true);
    expect(can("TRAINING", "curriculum:view")).toBe(true);
    expect(can("TRAINING", "training:manage")).toBe(true);
    expect(can("TRAINING", "questions:author")).toBe(true);
    expect(can("TRAINING", "questions:edit")).toBe(true);
    expect(can("TRAINING", "questions:delete")).toBe(true);
    expect(can("TRAINING", "assignments:create")).toBe(true);
    expect(can("TRAINING", "assignments:edit")).toBe(true);
    expect(can("TRAINING", "assignments:delete")).toBe(true);
    expect(can("TRAINING", "assignments:grade")).toBe(true);
    expect(can("TRAINING", "documents:upload")).toBe(true);
    expect(can("TRAINING", "documents:delete")).toBe(true);
    expect(can("TRAINING", "exams:create")).toBe(true);
    expect(can("TRAINING", "exams:edit")).toBe(true);
    expect(can("TRAINING", "exams:delete")).toBe(true);
    expect(can("TRAINING", "exams:grade")).toBe(true);
    expect(can("TRAINING", "course-packages:edit")).toBe(true);
    expect(can("TRAINING", "courses:create")).toBe(true);
    expect(can("TRAINING", "courses:edit")).toBe(true);
    expect(can("TRAINING", "courses:delete")).toBe(true);
    expect(can("TRAINING", "evaluations:manage")).toBe(true);
    expect(can("TRAINING", "teaching-materials:view-own-class")).toBe(true);
  });

  it("TRAINING có quyền xem cơ bản để vào admin nhưng KHÔNG có quyền tài chính/HR/lead", () => {
    expect(can("TRAINING", "students:view-all")).toBe(true);
    expect(can("TRAINING", "classes:view-all")).toBe(true);
    // không tài chính / HR / lead
    expect(can("TRAINING", "payments:manage")).toBe(false);
    expect(can("TRAINING", "payroll:view")).toBe(false);
    expect(can("TRAINING", "employees:create")).toBe(false);
    expect(can("TRAINING", "leads:view-all")).toBe(false);
    expect(can("TRAINING", "students:edit")).toBe(false);
  });
});

describe("permissions matrix — TEACHER mất quyền sửa LMS, giữ xem + chấm", () => {
  it("TEACHER KHÔNG còn quyền biên soạn LMS", () => {
    expect(can("TEACHER", "curriculum:create")).toBe(false);
    expect(can("TEACHER", "curriculum:edit")).toBe(false);
    expect(can("TEACHER", "curriculum:delete")).toBe(false);
    expect(can("TEACHER", "questions:author")).toBe(false);
    expect(can("TEACHER", "questions:edit")).toBe(false);
    expect(can("TEACHER", "questions:delete")).toBe(false);
    expect(can("TEACHER", "assignments:create")).toBe(false);
    expect(can("TEACHER", "assignments:edit")).toBe(false);
    expect(can("TEACHER", "assignments:delete")).toBe(false);
    expect(can("TEACHER", "documents:upload")).toBe(false);
    expect(can("TEACHER", "documents:delete")).toBe(false);
    expect(can("TEACHER", "exams:create")).toBe(false);
    expect(can("TEACHER", "exams:edit")).toBe(false);
    expect(can("TEACHER", "exams:delete")).toBe(false);
    expect(can("TEACHER", "training:manage")).toBe(false);
  });

  it("TEACHER GIỮ quyền xem LMS + chấm bài/đề + tài liệu lớp mình", () => {
    expect(can("TEACHER", "curriculum:view")).toBe(true);
    expect(can("TEACHER", "questions:view")).toBe(true);
    expect(can("TEACHER", "assignments:view")).toBe(true);
    expect(can("TEACHER", "assignments:grade")).toBe(true);
    expect(can("TEACHER", "documents:view")).toBe(true);
    expect(can("TEACHER", "exams:view")).toBe(true);
    expect(can("TEACHER", "exams:grade")).toBe(true);
    expect(can("TEACHER", "teaching-materials:view-own-class")).toBe(true);
    // quyền lớp ngoài LMS giữ nguyên
    expect(can("TEACHER", "attendance:mark")).toBe(true);
    expect(can("TEACHER", "report-cards:manage")).toBe(true);
  });
});

describe("permissions matrix — CENTER_MANAGER chỉ XEM LMS", () => {
  it("CENTER_MANAGER mất quyền sửa LMS", () => {
    expect(can("CENTER_MANAGER", "curriculum:create")).toBe(false);
    expect(can("CENTER_MANAGER", "curriculum:edit")).toBe(false);
    expect(can("CENTER_MANAGER", "curriculum:delete")).toBe(false);
    expect(can("CENTER_MANAGER", "questions:author")).toBe(false);
    expect(can("CENTER_MANAGER", "questions:edit")).toBe(false);
    expect(can("CENTER_MANAGER", "questions:delete")).toBe(false);
    expect(can("CENTER_MANAGER", "assignments:create")).toBe(false);
    expect(can("CENTER_MANAGER", "assignments:edit")).toBe(false);
    expect(can("CENTER_MANAGER", "assignments:delete")).toBe(false);
    expect(can("CENTER_MANAGER", "documents:upload")).toBe(false);
    expect(can("CENTER_MANAGER", "documents:delete")).toBe(false);
    expect(can("CENTER_MANAGER", "exams:create")).toBe(false);
    expect(can("CENTER_MANAGER", "exams:edit")).toBe(false);
    expect(can("CENTER_MANAGER", "exams:delete")).toBe(false);
    expect(can("CENTER_MANAGER", "training:manage")).toBe(false);
  });

  it("CENTER_MANAGER GIỮ mọi *:view LMS + quyền ngoài LMS", () => {
    expect(can("CENTER_MANAGER", "curriculum:view")).toBe(true);
    expect(can("CENTER_MANAGER", "questions:view")).toBe(true);
    expect(can("CENTER_MANAGER", "assignments:view")).toBe(true);
    expect(can("CENTER_MANAGER", "documents:view")).toBe(true);
    expect(can("CENTER_MANAGER", "exams:view")).toBe(true);
    expect(can("CENTER_MANAGER", "courses:view")).toBe(true);
    expect(can("CENTER_MANAGER", "course-packages:view")).toBe(true);
    expect(can("CENTER_MANAGER", "teaching-materials:view-own-class")).toBe(true);
    // chấm + grade vẫn giữ
    expect(can("CENTER_MANAGER", "assignments:grade")).toBe(true);
    expect(can("CENTER_MANAGER", "exams:grade")).toBe(true);
    // quyền ngoài LMS giữ nguyên
    expect(can("CENTER_MANAGER", "classes:create")).toBe(true);
    expect(can("CENTER_MANAGER", "payments:manage")).toBe(true);
    expect(can("CENTER_MANAGER", "courses:create")).toBe(true);
  });
});

describe("permissions matrix — ACCOUNTANT (QĐ-T4)", () => {
  it("ACCOUNTANT KHÔNG sửa hồ sơ học viên", () => {
    expect(can("ACCOUNTANT", "students:edit")).toBe(false);
    // giữ các quyền tài chính
    expect(can("ACCOUNTANT", "payments:confirm")).toBe(true);
    expect(can("ACCOUNTANT", "students:view-all")).toBe(true);
  });

  it("students:edit vẫn giữ cho các role quản lý/bán hàng", () => {
    expect(can("SUPER_ADMIN", "students:edit")).toBe(true);
    expect(can("CENTER_MANAGER", "students:edit")).toBe(true);
    expect(can("SALES_CSM", "students:edit")).toBe(true);
  });
});

describe("permissions matrix — FL W0-NAV-2 QĐ-T3b (CM giữ trial-config + duyệt sửa bài qua action RIÊNG)", () => {
  it("trials:config — Super/Training/CM = true; KHÔNG trả qua training:manage", () => {
    expect(can("SUPER_ADMIN", "trials:config")).toBe(true);
    expect(can("TRAINING", "trials:config")).toBe(true);
    expect(can("CENTER_MANAGER", "trials:config")).toBe(true);
    // CM vẫn KHÔNG có training:manage (W0 đã gỡ) — chỉ trả lại qua action riêng.
    expect(can("CENTER_MANAGER", "training:manage")).toBe(false);
    // vai khác không có
    expect(can("SALES_CSM", "trials:config")).toBe(false);
    expect(can("TEACHER", "trials:config")).toBe(false);
    expect(can("ACCOUNTANT", "trials:config")).toBe(false);
  });

  it("lesson-change:approve — Super/Training/CM = true; Sale/GV = false", () => {
    expect(can("SUPER_ADMIN", "lesson-change:approve")).toBe(true);
    expect(can("TRAINING", "lesson-change:approve")).toBe(true);
    expect(can("CENTER_MANAGER", "lesson-change:approve")).toBe(true);
    expect(can("SALES_CSM", "lesson-change:approve")).toBe(false);
    expect(can("TEACHER", "lesson-change:approve")).toBe(false);
  });
});

describe("permissions matrix — FL W0-NAV-2 role hygiene (BA #07 3.C)", () => {
  it("SALES_CSM bỏ module dư (Buổi học/Điểm danh/Phòng học/Khoá dạy/Tuyển dụng/Tin tức)", () => {
    expect(can("SALES_CSM", "sessions:view")).toBe(false);
    expect(can("SALES_CSM", "attendance:view")).toBe(false);
    expect(can("SALES_CSM", "rooms:view")).toBe(false);
    expect(can("SALES_CSM", "courses:view")).toBe(false);
    expect(can("SALES_CSM", "jobs:view")).toBe(false);
    expect(can("SALES_CSM", "news:view")).toBe(false);
  });

  it("SALES_CSM GIỮ chức năng lõi (lead/tuyển sinh/HV/đăng ký/đơn/trial/gói học)", () => {
    expect(can("SALES_CSM", "leads:view-own")).toBe(true);
    expect(can("SALES_CSM", "students:view-all")).toBe(true);
    expect(can("SALES_CSM", "students:edit")).toBe(true);
    expect(can("SALES_CSM", "enrollments:create")).toBe(true);
    expect(can("SALES_CSM", "orders:view")).toBe(true);
    expect(can("SALES_CSM", "trials:manage")).toBe(true);
    expect(can("SALES_CSM", "course-packages:view")).toBe(true);
    expect(can("SALES_CSM", "parent-requests:manage")).toBe(true);
  });

  it("ACCOUNTANT bỏ Khoá dạy + Tin tức; GIỮ tài chính + kho", () => {
    expect(can("ACCOUNTANT", "courses:view")).toBe(false);
    expect(can("ACCOUNTANT", "news:view")).toBe(false);
    // giữ tài chính + kiểm kê kho
    expect(can("ACCOUNTANT", "payments:confirm")).toBe(true);
    expect(can("ACCOUNTANT", "inventory:view")).toBe(true);
    expect(can("ACCOUNTANT", "inventory:audit")).toBe(true);
    expect(can("ACCOUNTANT", "payroll:view")).toBe(true);
  });

  it("Hygiene KHÔNG ảnh hưởng vai khác (GV/CM giữ sessions/attendance; HR/MKT giữ Tin tức)", () => {
    expect(can("TEACHER", "sessions:view")).toBe(true);
    expect(can("TEACHER", "attendance:view")).toBe(true);
    expect(can("CENTER_MANAGER", "rooms:view")).toBe(true);
    expect(can("CENTER_MANAGER", "courses:view")).toBe(true);
    expect(can("HR", "news:view")).toBe(true);
    expect(can("MARKETING", "news:view")).toBe(true);
    expect(can("MARKETING", "courses:view")).toBe(true);
  });
});

describe("permissions matrix — sanity", () => {
  it("teaching-materials:view-own-class tồn tại trong matrix", () => {
    expect(ALL_ACTIONS).toContain("teaching-materials:view-own-class");
    expect(PERMISSIONS["teaching-materials:view-own-class"]).toEqual(
      expect.arrayContaining(["SUPER_ADMIN", "TRAINING", "CENTER_MANAGER", "TEACHER"]),
    );
  });

  it("PARENT không có quyền admin nào", () => {
    expect(can("PARENT", "curriculum:view")).toBe(false);
    expect(can("PARENT", "students:view-all")).toBe(false);
  });
});
