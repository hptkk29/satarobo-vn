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
    // Chỉnh chương trình học (curriculum + khóa học + gói combo) = CHỈ Đào tạo + SUPER_ADMIN (24/07).
    expect(can("TRAINING", "courses:create")).toBe(true);
    expect(can("TRAINING", "courses:edit")).toBe(true);
    expect(can("TRAINING", "courses:delete")).toBe(true);
    expect(can("TRAINING", "curriculum:edit")).toBe(true);
    expect(can("TRAINING", "course-packages:edit")).toBe(true);
    expect(can("TRAINING", "teaching-materials:view-own-class")).toBe(true);
  });

  it("TRAINING KHOÁ CHẶT 24/07: chỉ curriculum+LMS+duyệt học bạ — KHÔNG xem HV/lớp toàn hệ thống, KHÔNG tài chính/HR/lead", () => {
    // Bỏ 24/07 — Đào tạo hết thấy học viên/lớp cả 2 cơ sở (Toại về đúng CS1).
    expect(can("TRAINING", "students:view-all")).toBe(false);
    expect(can("TRAINING", "classes:view-all")).toBe(false);
    // Bỏ 24/07 — báo cáo đào tạo / đánh giá GV / cấu hình học thử / sửa học bạ.
    expect(can("TRAINING", "reports:training")).toBe(false);
    expect(can("TRAINING", "evaluations:manage")).toBe(false);
    expect(can("TRAINING", "trials:config")).toBe(false);
    expect(can("TRAINING", "report-cards:manage")).toBe(false);
    // GIỮ — duyệt học bạ + chìa khoá LMS (training:manage gác SCORM/curriculum-edit).
    expect(can("TRAINING", "report-cards:review")).toBe(true);
    expect(can("TRAINING", "training:manage")).toBe(true);
    // không tài chính / HR / lead
    expect(can("TRAINING", "payments:manage")).toBe(false);
    expect(can("TRAINING", "payroll:view")).toBe(false);
    expect(can("TRAINING", "employees:create")).toBe(false);
    expect(can("TRAINING", "leads:view-all")).toBe(false);
    expect(can("TRAINING", "students:edit")).toBe(false);
  });

  it("18/08 — Đào tạo ĐỌC được nhận xét buổi học, nhưng KHÔNG vì thế mà mở lại module Lớp/Buổi", () => {
    // Ngoại lệ hẹp của đợt khoá 24/07: chủ dự án yêu cầu "admin hoặc đào tạo xem
    // được hết đánh giá, nhận xét các buổi học trong lớp, của từng học viên".
    expect(can("TRAINING", "session-feedback:view-all")).toBe(true);
    // Ranh giới: nếu ai đó "tiện tay" cấp sessions:view/classes:* cho Đào tạo thì
    // test này đỏ — quyền đọc nhận xét KHÔNG được biến thành quyền quản buổi/lớp.
    expect(can("TRAINING", "sessions:view")).toBe(false);
    expect(can("TRAINING", "sessions:edit")).toBe(false);
    expect(can("TRAINING", "attendance:view")).toBe(false);
    expect(can("TRAINING", "classes:edit")).toBe(false);
  });
});

describe("permissions matrix — đọc nhận xét buổi học (session-feedback:view-all)", () => {
  it("QLCS + GV + Admin đọc được; các vai ngoài chuyên môn thì không", () => {
    expect(can("SUPER_ADMIN", "session-feedback:view-all")).toBe(true);
    expect(can("CENTER_MANAGER", "session-feedback:view-all")).toBe(true);
    expect(can("TEACHER", "session-feedback:view-all")).toBe(true);
    // Nội dung nhận xét học viên không phải việc của Sale/Kế toán/HR/Marketing.
    expect(can("SALES_CSM", "session-feedback:view-all")).toBe(false);
    expect(can("ACCOUNTANT", "session-feedback:view-all")).toBe(false);
    expect(can("HR", "session-feedback:view-all")).toBe(false);
    expect(can("MARKETING", "session-feedback:view-all")).toBe(false);
    expect(can("PARENT", "session-feedback:view-all")).toBe(false);
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

  it("CENTER_MANAGER KHÔNG còn quyền LMS (chủ dự án chốt 03/08) nhưng giữ quyền vận hành", () => {
    // ⚠️ ĐẢO chốt 24/07 ("CM giữ mọi *:view LMS"). 03/08 chủ dự án yêu cầu chặn hẳn
    // phần LMS ở vai Quản lý cơ sở — họ vận hành lớp, không soạn/duyệt học liệu.
    expect(can("CENTER_MANAGER", "curriculum:view")).toBe(false);
    expect(can("CENTER_MANAGER", "questions:view")).toBe(false);
    expect(can("CENTER_MANAGER", "assignments:view")).toBe(false);
    expect(can("CENTER_MANAGER", "documents:view")).toBe(false);
    expect(can("CENTER_MANAGER", "exams:view")).toBe(false);
    expect(can("CENTER_MANAGER", "courses:view")).toBe(false);
    // Gói bán = giá, không phải học liệu → GIỮ (luồng tạo đơn cần).
    expect(can("CENTER_MANAGER", "course-packages:view")).toBe(true);
    expect(can("CENTER_MANAGER", "teaching-materials:view-own-class")).toBe(false);
    // Chấm bài vẫn giữ: đó là việc vận hành lớp, không phải soạn học liệu.
    expect(can("CENTER_MANAGER", "assignments:grade")).toBe(true);
    expect(can("CENTER_MANAGER", "exams:grade")).toBe(true);
    // Học bạ phải CÒN — màn đó gác [curriculum:view | students:view-own-class].
    expect(can("CENTER_MANAGER", "students:view-own-class")).toBe(true);
    // Quyền ngoài LMS giữ nguyên.
    expect(can("CENTER_MANAGER", "classes:create")).toBe(true);
    // 03/08 — tiền: chỉ XEM đối soát, không quản lý (Hoàn tiền/Phương thức TT chặn).
    expect(can("CENTER_MANAGER", "payments:view")).toBe(true);
    expect(can("CENTER_MANAGER", "payments:manage")).toBe(false);
    // 03/08 — hồ sơ nhân sự/giáo viên, nhật ký, cấu hình: rút khỏi vai này.
    expect(can("CENTER_MANAGER", "employees:view-all")).toBe(false);
    expect(can("CENTER_MANAGER", "audit-logs:view")).toBe(false);
    expect(can("CENTER_MANAGER", "settings:view")).toBe(false);
    // 03/08 — vẫn bàn giao/chuyển lead, chỉ mất màn CẤU HÌNH chia lead.
    expect(can("CENTER_MANAGER", "leads:assign")).toBe(true);
    expect(can("CENTER_MANAGER", "leads:assign-config")).toBe(false);
    // 24/07 — CM KHÔNG chỉnh chương trình.
    expect(can("CENTER_MANAGER", "courses:create")).toBe(false);
    expect(can("CENTER_MANAGER", "courses:edit")).toBe(false);
    expect(can("CENTER_MANAGER", "course-packages:edit")).toBe(false);
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
    // 24/07 — cấu hình học thử gỡ khỏi Đào tạo (chỉ LMS), giữ ở QL cơ sở.
    expect(can("TRAINING", "trials:config")).toBe(false);
    expect(can("CENTER_MANAGER", "trials:config")).toBe(true);
    // CM vẫn KHÔNG có training:manage (W0 đã gỡ) — chỉ trả lại qua action riêng.
    expect(can("CENTER_MANAGER", "training:manage")).toBe(false);
    // vai khác không có
    expect(can("SALES_CSM", "trials:config")).toBe(false);
    expect(can("TEACHER", "trials:config")).toBe(false);
    expect(can("ACCOUNTANT", "trials:config")).toBe(false);
  });

  it("lesson-change:approve — Super/Training = true; CM/Sale/GV = false", () => {
    expect(can("SUPER_ADMIN", "lesson-change:approve")).toBe(true);
    expect(can("TRAINING", "lesson-change:approve")).toBe(true);
    // 03/08 — duyệt sửa giáo án là việc Đào tạo; CM đã rút khỏi toàn bộ phần LMS.
    expect(can("CENTER_MANAGER", "lesson-change:approve")).toBe(false);
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
    // 03/08 — CM đã rút khỏi phần LMS nên KHÔNG còn courses:view (xem test ở trên).
    expect(can("CENTER_MANAGER", "courses:view")).toBe(false);
    expect(can("HR", "news:view")).toBe(true);
    expect(can("MARKETING", "news:view")).toBe(true);
    expect(can("MARKETING", "courses:view")).toBe(true);
  });
});

describe("permissions matrix — #17 học bạ sau phát hành (câu 55, Toại 06/07)", () => {
  it("TRAINING (Đào tạo) CHỈ duyệt học bạ (report-cards:review) — 24/07 gỡ manage (không sửa/tạo)", () => {
    expect(can("TRAINING", "report-cards:manage")).toBe(false);
    expect(can("TRAINING", "report-cards:review")).toBe(true);
  });

  it("CENTER_MANAGER giữ report-cards:manage + review (QL cơ sở duyệt/phát hành)", () => {
    expect(can("CENTER_MANAGER", "report-cards:manage")).toBe(true);
    expect(can("CENTER_MANAGER", "report-cards:review")).toBe(true);
  });

  it("SUPER_ADMIN có cả hai", () => {
    expect(can("SUPER_ADMIN", "report-cards:manage")).toBe(true);
    expect(can("SUPER_ADMIN", "report-cards:review")).toBe(true);
  });

  it("TEACHER GIỮ report-cards:manage (viết DRAFT) nhưng KHÔNG có review (không sửa sau phát hành)", () => {
    expect(can("TEACHER", "report-cards:manage")).toBe(true);
    expect(can("TEACHER", "report-cards:review")).toBe(false);
  });

  it("vai không liên quan không có report-cards:*", () => {
    expect(can("SALES_CSM", "report-cards:review")).toBe(false);
    expect(can("ACCOUNTANT", "report-cards:manage")).toBe(false);
    expect(can("PARENT", "report-cards:review")).toBe(false);
  });
});

describe("permissions matrix — sanity", () => {
  it("teaching-materials:view-own-class tồn tại trong matrix", () => {
    expect(ALL_ACTIONS).toContain("teaching-materials:view-own-class");
    // 03/08 — CM rút khỏi phần LMS; tài liệu lớp còn Đào tạo + GV.
    expect(PERMISSIONS["teaching-materials:view-own-class"]).toEqual(
      expect.arrayContaining(["SUPER_ADMIN", "TRAINING", "TEACHER"]),
    );
    expect(PERMISSIONS["teaching-materials:view-own-class"]).not.toContain("CENTER_MANAGER");
  });

  it("PARENT không có quyền admin nào", () => {
    expect(can("PARENT", "curriculum:view")).toBe(false);
    expect(can("PARENT", "students:view-all")).toBe(false);
  });
});

// #01 shadow-compare: can() v2 (lib/auth/can.ts) bypass mọi action khi
// `actor.isSuperAdmin`. Nếu matrix v1 thiếu SUPER_ADMIN ở một action nào đó thì
// mỗi lần admin chạm call-site đó là một dòng RbacShadowDiff (v1=false, v2=true)
// → cổng `isSafeToEnableRbacV2` (đếm thô, không whitelist) không bao giờ về 0.
// Trước bản vá 09/07 có 4 action rơi vào bẫy này: leads:view-own,
// students:view-own-class, classes:view-own, enrollments:view-own.
describe("permissions matrix — SUPER_ADMIN phủ toàn bộ action (khớp bypass v2)", () => {
  // US-05 chat (08/08/2026) — ngoại lệ DUY NHẤT, có chủ đích: Admin KHÔNG gửi CHAT
  // (US-15 AC4 — chế độ xem của Admin là chỉ đọc; permissions.md ô "Gửi CHAT/Admin").
  // v2 bypass vẫn true cho SUPER_ADMIN ⇒ chốt chặn thật là participant-check trong
  // action (US-06); v1 deny để pin ý định. Lệch v1/v2 ở đây được CHẤP NHẬN — admin
  // không có UI gửi CHAT nên shadow-compare không phát sinh diff từ traffic thật.
  // ⚠️ Danh sách này KHÔNG được phình ra nếu không có quyết định tương đương US-15 AC4.
  const NGOAI_LE_CHI_DOC = new Set<string>(["chat:send"]);

  it("mọi action trong ALL_ACTIONS đều cấp cho SUPER_ADMIN (trừ ngoại lệ chỉ-đọc)", () => {
    const thieu = ALL_ACTIONS.filter(
      (a) => !NGOAI_LE_CHI_DOC.has(a) && !PERMISSIONS[a].includes("SUPER_ADMIN"),
    );
    expect(thieu).toEqual([]);
  });

  it("can(SUPER_ADMIN, *) = true với mọi action ngoài ngoại lệ", () => {
    for (const a of ALL_ACTIONS) {
      if (NGOAI_LE_CHI_DOC.has(a)) continue;
      expect(can("SUPER_ADMIN", a)).toBe(true);
    }
  });

  it("ngoại lệ đúng là deny ở v1 (không thừa dòng)", () => {
    for (const a of NGOAI_LE_CHI_DOC) {
      expect({ action: a, superAdminV1: can("SUPER_ADMIN", a as (typeof ALL_ACTIONS)[number]) }).toEqual({
        action: a,
        superAdminV1: false,
      });
    }
  });
});
