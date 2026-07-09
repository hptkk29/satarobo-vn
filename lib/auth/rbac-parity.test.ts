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
};

/**
 * NỢ ĐÃ BIẾT — seed v2 của 2 role này còn là stub (plan #01 chỉ liệt kê 5 role Kiệt
 * duyệt; CENTER_MANAGER và TEACHER không nằm trong đó). Flip #09 khi danh sách này
 * chưa rỗng ⇒ QL cơ sở và giáo viên mất hàng loạt chức năng.
 *
 * ⚠️ Danh sách này CHỈ ĐƯỢC CO LẠI. Vá `prisma/seed-roles.ts` → xoá dòng tương ứng.
 */
const KNOWN_GAPS: Record<string, number> = {
  CENTER_MANAGER: 105,
  TEACHER: 32,
  // TTS Nhân sự LÀ người đăng tin tuyển dụng (user chốt 09/07) ⇒ jobs:* không phải
  // thu hẹp có chủ đích, mà là seed thiếu. Vá cùng đợt CENTER_MANAGER/TEACHER.
  HR: 4, // jobs:create, jobs:delete, jobs:edit, jobs:view
};

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
