// #09 gate — đối chiếu TĨNH matrix v1 ↔ seed RoleDef v2.
//
// Trả lời câu hỏi mà shadow-compare phải chờ traffic mới trả lời được:
// "flip RBAC_V2_ENABLED thì ai MẤT quyền gì?". Mọi action có ở v1 mà thiếu ở v2
// = một người thật mất một chức năng thật ngay khi đổi env.
//
// Test này KHÔNG ép parity tuyệt đối. Nó ép: mọi mất mát phải NẰM TRONG danh sách
// đã được người quyết định ký — hoặc là thu hẹp có chủ đích (INTENTIONAL), hoặc là
// nợ kỹ thuật đã biết đang chờ vá (KNOWN_GAPS). Thêm action vào v1 mà quên v2 → đỏ.
import { describe, it, expect } from "vitest";
import { PERMISSIONS, ALL_ACTIONS } from "@/lib/auth/permissions";
import { ROLE_SEED } from "../../prisma/seed-roles";

/** Ánh xạ legacy Role → RoleDef code, khớp LEGACY_TO_ROLEDEF của patch-rbac-staff.ts. */
const LEGACY_TO_V2: Record<string, string> = {
  CENTER_MANAGER: "CENTER_MANAGER",
  SALES_CSM: "CENTER_SALES_CSM",
  TEACHER: "TEACHER",
  ACCOUNTANT: "HO_ACCOUNTANT",
  MARKETING: "HO_MARKETING",
  HR: "CENTER_HR",
  TRAINING: "TRAINING",
};

/**
 * Thu hẹp CÓ CHỦ ĐÍCH — Kiệt duyệt Phương án A (addendum HR, 06/07/2026):
 * CENTER_HR = 9 action vận hành tại 1 cơ sở, KHÔNG gồm lương / hồ sơ cá nhân /
 * payroll / tạo nhân sự. Xem satarobo_task/12-hr-tts-accounts/plan.md.
 */
const INTENTIONAL: Record<string, string[]> = {
  HR: [
    "employees:create",
    "employees:view-personal",
    "employees:view-salary",
    "payroll:view",
    // TTS Nhân sự không phụ trách nội dung marketing / vinh danh.
    "blog:view",
    "courses:view",
    "honors:create",
    "honors:edit",
    "honors:view",
    "news:view",
  ],
  /** Kiệt duyệt 09/07/2026 — de-xuat-scope-v2-center-manager-teacher.md §3.3. */
  CENTER_MANAGER: [
    // Nội dung đối ngoại → HO_MARKETING
    "blog:create", "blog:edit",
    "news:create", "news:edit", "news:publish", "news:delete",
    "site-content:view", "site-content:edit",
    "honors:create", "honors:edit", "honors:settings",
    "emails:view", "emails:manage",
    // Chương trình & giáo án → TRAINING
    "courses:create", "courses:edit", "course-packages:edit",
    "lesson-change:approve", "trials:config",
    // Tiền & kho tập trung → HO_ACCOUNTANT
    "payments:manage", "orders:manage", "installments:approve",
    "vouchers:manage", "products:manage",
    "inventory:edit", "inventory:audit", "kits:edit",
    // Nhân sự & tuyển dụng → CENTER_HR
    "employees:edit", "jobs:create", "jobs:edit",
    // Cấu hình toàn hệ thống → SUPER_ADMIN
    "holidays:edit",
    // Xoá cứng → SUPER_ADMIN. QL dùng enrollments:cancel (CLAUDE.md).
    "students:delete", "enrollments:delete",
    // ⚠️ CHƯA ĐƯỢC HỎI RÕ (ngoài 6 câu 09/07) — mặc định theo nguyên tắc không
    // hard-delete. Nếu QL cơ sở cần xoá lead, thêm lại 1 dòng vào seed + re-seed.
    "leads:delete",
  ],
  /** Kiệt duyệt 09/07/2026 — §4.4 + câu 5 (giữ satacoin) và câu 6 (bỏ inventory:movement). */
  TEACHER: [
    "completions:manage", // QL cơ sở xác nhận hoàn thành khoá
    "sessions:create", // GV chốt buổi (sessions:edit), không xếp lịch — câu 48
    "inventory:movement", // câu 6: "không"
  ],
};

/**
 * NỢ ĐÃ BIẾT — đã trả hết 09/07/2026 (seed CENTER_MANAGER 6→78, TEACHER 3→32,
 * CENTER_HR +jobs:*). Giữ map rỗng để nếu ai đó cần ghi nợ mới thì có chỗ, nhưng
 * mặc định mọi role phải parity hoặc chỉ mất đúng phần INTENTIONAL.
 *
 * ⚠️ Danh sách này CHỈ ĐƯỢC CO LẠI, không được phình ra.
 */
const KNOWN_GAPS: Record<string, number> = {};

const v2ByCode = new Map(ROLE_SEED.map((r) => [r.code, new Set(r.perms.map((p) => p.action))]));
const v1Actions = (role: string) => ALL_ACTIONS.filter((a) => PERMISSIONS[a].includes(role as never));

function lostOnFlip(legacy: string): string[] {
  const v2 = v2ByCode.get(LEGACY_TO_V2[legacy]!);
  if (!v2) throw new Error(`Thiếu RoleDef ${LEGACY_TO_V2[legacy]} trong seed`);
  return v1Actions(legacy)
    .filter((a) => !v2.has(a))
    .sort();
}

describe("#09 parity v1↔v2 — không ai được mất quyền ngoài dự kiến khi flip", () => {
  it.each(Object.keys(LEGACY_TO_V2))("%s: mất mát nằm trong INTENTIONAL/KNOWN_GAPS", (legacy) => {
    const lost = lostOnFlip(legacy);
    const intentional = new Set(INTENTIONAL[legacy] ?? []);
    const ngoaiDuKien = lost.filter((a) => !intentional.has(a));

    const gapCount = KNOWN_GAPS[legacy];
    if (gapCount === undefined) {
      // Role đã đạt parity (hoặc chỉ thu hẹp có chủ đích) → không được mất thêm gì.
      expect(ngoaiDuKien).toEqual([]);
    } else {
      // Role còn nợ: số action mất KHÔNG được tăng. Vá seed thì hạ con số trong KNOWN_GAPS.
      expect(ngoaiDuKien.length).toBeLessThanOrEqual(gapCount);
    }
  });

  it("RoleDef trong ánh xạ đều tồn tại trong seed", () => {
    for (const code of Object.values(LEGACY_TO_V2)) expect(v2ByCode.has(code)).toBe(true);
  });

  it("SALES_CSM / ACCOUNTANT / MARKETING / TRAINING đã parity (5 role Kiệt duyệt)", () => {
    for (const legacy of ["SALES_CSM", "ACCOUNTANT", "MARKETING", "TRAINING"]) {
      expect({ legacy, lost: lostOnFlip(legacy) }).toEqual({ legacy, lost: [] });
    }
  });
});
